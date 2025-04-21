const express = require('express');
const router = express.Router();
const pool = require('../db');

// Get leads by user
router.get('/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const leads = await pool.query('SELECT * FROM leads WHERE user_id = $1', [userId]);
    res.json(leads.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add a lead
router.post('/', async (req, res) => {
  const { user_id, company, contact, email, stage } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO leads (user_id, company, contact, email, stage) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [user_id, company, contact, email, stage]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
