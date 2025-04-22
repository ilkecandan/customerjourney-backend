// 📄 routes/leads.js

const express = require('express');
const router = express.Router();
const pool = require('../db');

// ✅ Get all leads for a specific user (secure check)
router.get('/:userId', async (req, res) => {
  const requestedUserId = parseInt(req.params.userId);
  const providedUserId = parseInt(req.headers['x-user-id']);

  if (isNaN(requestedUserId) || isNaN(providedUserId)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  if (requestedUserId !== providedUserId) {
    return res.status(403).json({ error: 'Unauthorized access' });
  }

  try {
    const leads = await pool.query('SELECT * FROM leads_clean WHERE user_id = $1', [requestedUserId]);
    res.json(leads.rows);
  } catch (err) {
    console.error('❌ Error fetching leads:', err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Add a new lead for a user (only user_id required)
router.post('/', async (req, res) => {
  const {
    user_id,
    company = '',
    contact = '',
    email = '',
    stage = '',
    notes = ''
  } = req.body;

  if (!user_id) {
    return res.status(400).json({ error: 'Missing user_id' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO leads_clean (user_id, company, contact, email, stage, notes, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
       RETURNING *`,
      [user_id, company, contact, email, stage, notes]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('❌ Error adding lead:', err);
    res.status(500).json({ error: 'Failed to add lead' });
  }
});

module.exports = router;
