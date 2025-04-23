// 📄 routes/leads.js

const express = require('express');
const router = express.Router();
const pool = require('../db');

// ✅ Utility: Group leads by stage
function groupLeadsByStage(leads) {
  const grouped = {
    awareness: [],
    interest: [],
    intent: [],
    evaluation: [],
    purchase: []
  };

  leads.forEach(lead => {
    const stage = lead.stage || 'awareness'; // fallback if stage missing
    if (grouped[stage]) {
      grouped[stage].push(lead);
    }
  });

  return grouped;
}

// ✅ GET /api/leads/:userId → grouped leads for user
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
    const groupedLeads = groupLeadsByStage(result.rows);
    res.json(groupedLeads);
  } catch (err) {
    console.error('❌ Error fetching leads:', err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ POST /api/leads → insert lead and return updated grouped data
router.post('/', async (req, res) => {
  const {
    user_id,
    company = '',
    contact = '',
    email = '',
    stage = 'awareness',
    notes = ''
  } = req.body;

  if (!user_id) {
    return res.status(400).json({ error: 'Missing user_id' });
  }

  // 🛡️ Validation: Reject blank or too-short company name
  if (!company || company.trim().length < 2) {
    return res.status(400).json({ error: 'Company name must be at least 2 characters long.' });
  }

  try {
    await pool.query(
      `INSERT INTO leads_clean (user_id, company, contact, email, stage, notes, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
      [user_id, company.trim(), contact, email, stage, notes]
    );

    // Return updated leads grouped by stage
    const result = await pool.query('SELECT * FROM leads_clean WHERE user_id = $1', [user_id]);
    const groupedLeads = groupLeadsByStage(result.rows);
    res.status(201).json(groupedLeads);

  } catch (err) {
    console.error('❌ Error adding lead:', err);
    res.status(500).json({ error: 'Failed to add lead' });
  }
});

module.exports = router;
