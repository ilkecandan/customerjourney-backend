const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const pool = require('../db');
require('dotenv').config();

const router = express.Router();
const SALT_ROUNDS = 10;
const JWT_SECRET = process.env.JWT_SECRET || 'secret';

// CORS Middleware with OPTIONS support
router.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'https://funnelflow.live');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204); // Preflight
  }

  next();
});

// Dummy favicon route to avoid browser 404s
router.get('/favicon.ico', (req, res) => res.status(204).end());

// Email transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  }
});

// Register
router.post('/register', async (req, res) => {
  const { email, password } = req.body;
  try {
    const exists = await pool.query('SELECT * FROM "user" WHERE email = $1', [email]);
    if (exists.rows.length > 0) {
      return res.status(400).json({ error: 'Email is already registered.' });
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const result = await pool.query(
      'INSERT INTO "user" (email, password) VALUES ($1, $2) RETURNING id, email',
      [email, hashedPassword]
    );

    const token = jwt.sign({ id: result.rows[0].id, email }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: result.rows[0] });
  } catch (err) {
    console.error('❌ Error in /register:', err);
    res.status(500).json({ error: 'Something went wrong during registration.' });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM "user" WHERE email = $1', [email]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Incorrect password' });

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (err) {
    console.error('❌ Error in /login:', err);
    res.status(500).json({ error: 'Something went wrong during login.' });
  }
});

// Validate Token
router.get('/validate', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Authorization header missing' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const result = await pool.query('SELECT id, email FROM "user" WHERE id = $1', [decoded.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('❌ Token validation failed:', err);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
});

// Request password reset
router.post('/request-reset', async (req, res) => {
  try {
    const { email } = req.body;
    const result = await pool.query('SELECT * FROM "user" WHERE email = $1', [email]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 3600000); // 1 hour

    await pool.query(
      'UPDATE "user" SET reset_token = $1, resetexpires = $2 WHERE email = $3',
      [token, expires, email]
    );

    const resetLink = `https://funnelflow.live/reset-password.html?token=${token}`;

    await transporter.sendMail({
      from: `FunnelFlow <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
      to: result.rows[0].email,
      subject: 'Reset your password',
      html: `<p>Click <a href="${resetLink}">here</a> to reset your password. This link expires in 1 hour.</p>`
    });

    res.json({ message: 'Reset link sent to your email.' });
  } catch (err) {
    console.error('❌ Error in /request-reset:', err);
    res.status(500).json({ error: 'Failed to send reset link.' });
  }
});

// Reset password
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ error: 'Missing token or password' });
    }

    const result = await pool.query(
      'SELECT * FROM "user" WHERE reset_token = $1 AND resetexpires > NOW()',
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    await pool.query(
      'UPDATE "user" SET password = $1, reset_token = NULL, resetexpires = NULL WHERE reset_token = $2',
      [hashedPassword, token]
    );

    res.json({ message: 'Password successfully reset.' });
  } catch (err) {
    console.error('❌ Error in /reset-password:', err);
    res.status(500).json({ error: 'Failed to reset password.' });
  }
});

module.exports = router;
