const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const pool = require('../db');

const router = express.Router();
const SALT_ROUNDS = 10;

// Register
router.post('/register', async (req, res) => {
  const { username, password } = req.body;
  try {
    const exists = await pool.query('SELECT * FROM user_accounts WHERE username = $1', [username]);
    if (exists.rows.length > 0) return res.status(400).json({ error: 'Username taken' });

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const result = await pool.query(
      'INSERT INTO user_accounts (username, password) VALUES ($1, $2) RETURNING id, username',
      [username, hashedPassword]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('❌ Error in /register:', err);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM user_accounts WHERE username = $1', [username]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Incorrect password' });

    res.json({ id: user.id, username: user.username });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Request Password Reset
router.post('/request-password-reset', async (req, res) => {
  const { username } = req.body;
  try {
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 3600000); // 1 hour from now

    const result = await pool.query(
      `UPDATE user_accounts 
       SET reset_token = $1, resetexpires = $2 
       WHERE username = $3 
       RETURNING id, username`,
      [token, expires, username]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const resetLink = `https://yourdomain.com/reset-password?token=${token}`;

    // Configure your email transporter
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      }
    });

    await transporter.sendMail({
      from: `"Your App Name" <${process.env.EMAIL_FROM}>`,
      to: username,
      subject: 'Password Reset Request',
      html: `Click <a href="${resetLink}">here</a> to reset your password. This link expires in 1 hour.`
    });

    res.json({ success: true, message: 'Password reset email sent' });
  } catch (err) {
    console.error('❌ Password reset request error:', err);
    res.status(500).json({ error: 'Failed to process password reset request' });
  }
});

// Reset Password
router.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;
  try {
    // Verify token and check expiration
    const userResult = await pool.query(
      `SELECT id FROM user_accounts 
       WHERE reset_token = $1 AND resetexpires > NOW()`,
      [token]
    );

    if (userResult.rowCount === 0) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);

    await pool.query(
      `UPDATE user_accounts 
       SET password = $1, reset_token = NULL, resetexpires = NULL 
       WHERE reset_token = $2`,
      [hashedPassword, token]
    );

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    console.error('❌ Password reset error:', err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

module.exports = router;
