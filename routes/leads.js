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
    const stage = lead.currentstage || lead.stage || 'awareness'; // Support both
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

// ✅ POST /api/leads → insert lead and return that lead
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

  const cleanCompany = company.trim().length >= 2 ? company.trim() : 'Untitled Company';

  try {
    const insertResult = await pool.query(
      `INSERT INTO leads_clean (user_id, company, contact, email, stage, notes, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
       RETURNING *`,
      [user_id, cleanCompany, contact, email, stage, notes]
    );

    const insertedLead = insertResult.rows[0];
    res.status(201).json(insertedLead);

  } catch (err) {
    console.error('❌ Error adding lead:', err);
    res.status(500).json({ error: 'Failed to add lead' });
  }
});

// ✅ PUT /api/leads/:id → update a specific lead
router.put('/:id', async (req, res) => {
  const leadId = parseInt(req.params.id);
  const providedUserId = parseInt(req.headers['x-user-id']);

  if (isNaN(leadId) || isNaN(providedUserId)) {
    return res.status(400).json({ error: 'Invalid lead ID or user ID' });
  }

  const {
    company,
    contact,
    email,
    phone,
    currentStage,
    source,
    industry,
    status,
    notes,
    contentStrategies = [],
    lastContact
  } = req.body;

  try {
    await pool.query(
      `UPDATE leads_clean SET
        company = $1,
        contact = $2,
        email = $3,
        phone = $4,
        stage = $5,
        source = $6,
        industry = $7,
        status = $8,
        notes = $9,
        content_strategies = $10,
        last_contact = $11,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $12 AND user_id = $13`,
      [
        company,
        contact,
        email,
        phone,
        currentStage || 'awareness',
        source,
        industry,
        status,
        notes,
        JSON.stringify(contentStrategies),
        lastContact,
        leadId,
        providedUserId
      ]
    );

    const updated = await pool.query('SELECT * FROM leads_clean WHERE id = $1 AND user_id = $2', [leadId, providedUserId]);

    if (updated.rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found or not owned by user' });
    }

    res.json(updated.rows[0]);
  } catch (err) {
    console.error('❌ Error updating lead:', err);
    res.status(500).json({ error: 'Failed to update lead' });
  }
});

module.exports = router;
