const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { validatePassword } = require('../utils/validators');

const router = express.Router();
const SALT_ROUNDS = 12; // Increased from 10 for better security
const JWT_SECRET = process.env.JWT_SECRET || 'your-very-secure-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d'; // Token expiration

// Rate limiting setup (you'll need express-rate-limit)
const rateLimit = require('express-rate-limit');
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per windowMs
  message: 'Too many login attempts, please try again later'
});

// 🔹 Helper Functions
const generateToken = (userId, username) => {
  return jwt.sign(
    { id: userId, username },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
};

// 🔹 Register Route
router.post('/register', async (req, res) => {
  const { username, password } = req.body;

  // Input validation
  if (!username || !password) {
    return res.status(400).json({ 
      error: 'Username and password are required',
      field: !username ? 'username' : 'password'
    });
  }

  if (username.length < 3 || username.length > 30) {
    return res.status(400).json({ 
      error: 'Username must be between 3-30 characters',
      field: 'username'
    });
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    return res.status(400).json({ 
      error: passwordError,
      field: 'password'
    });
  }

  try {
    // Check if username exists (case-insensitive)
    const exists = await pool.query(
      'SELECT * FROM user_accounts WHERE LOWER(username) = LOWER($1)',
      [username]
    );

    if (exists.rows.length > 0) {
      return res.status(409).json({ 
        error: 'Username already taken',
        field: 'username'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    // Create user
    const result = await pool.query(
      `INSERT INTO user_accounts (username, password) 
       VALUES ($1, $2) 
       RETURNING id, username, created_at`,
      [username, hashedPassword]
    );

    const user = result.rows[0];
    
    // Generate JWT token
    const token = generateToken(user.id, user.username);

    // Set secure HTTP-only cookie
    res.cookie('jwt', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    // Return user data (without sensitive info)
    res.status(201).json({
      id: user.id,
      username: user.username,
      createdAt: user.created_at
    });

  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ 
      error: 'Registration failed',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// 🔹 Login Route
router.post('/login', authLimiter, async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ 
      error: 'Username and password are required',
      field: !username ? 'username' : 'password'
    });
  }

  try {
    // Find user (case-insensitive)
    const result = await pool.query(
      'SELECT * FROM user_accounts WHERE LOWER(username) = LOWER($1)',
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ 
        error: 'Invalid credentials',
        field: 'username'
      });
    }

    const user = result.rows[0];
    
    // Verify password
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ 
        error: 'Invalid credentials',
        field: 'password'
      });
    }

    // Generate JWT token
    const token = generateToken(user.id, user.username);

    // Set secure HTTP-only cookie
    res.cookie('jwt', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    // Return user data (without sensitive info)
    res.json({
      id: user.id,
      username: user.username,
      createdAt: user.created_at
    });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ 
      error: 'Login failed',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// 🔹 Logout Route
router.post('/logout', (req, res) => {
  res.clearCookie('jwt', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  });
  res.json({ message: 'Logged out successfully' });
});

// 🔹 Current User Route
router.get('/me', async (req, res) => {
  const token = req.cookies.jwt;

  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    const result = await pool.query(
      'SELECT id, username, created_at FROM user_accounts WHERE id = $1',
      [decoded.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Authentication error:', err);
    res.status(401).json({ error: 'Invalid token' });
  }
});

module.exports = router;
