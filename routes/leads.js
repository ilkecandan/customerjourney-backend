// 📄 routes/leads.js

const express = require('express');
const router = express.Router();
const pool = require('../db');

// ✅ GET all leads for a specific user and return grouped by stage
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
    const result = await pool.query('SELECT * FROM leads_clean WHERE user_id = $1', [requestedUserId]);
    const leads = result.rows;

    const grouped = {
      awareness: [],
      interest: [],
      intent: [],
      evaluation: [],
      purchase: []
    };

    leads.forEach(lead => {
      const stage = lead.stage || 'awareness'; // fallback
      if (grouped[stage]) grouped[stage].push(lead);
    });

    res.json(grouped);
  } catch (err) {
    console.error('❌ Error fetching leads:', err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ POST a new lead — only user_id required, everything else optional
router.post('/', async (req, res) => {
  const {
    user_id,
    company = '',
    contact = '',
    email = '',
    stage = 'awareness', // default to 'awareness'
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
