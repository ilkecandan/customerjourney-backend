// 📄 routes/leads.js

const express = require('express');
const router = express.Router();
const pool = require('../db');

// Utility function to group leads by stage
function groupLeadsByStage(leads) {
  const grouped = {
    awareness: [],
    interest: [],
    intent: [],
    evaluation: [],
    purchase: []
  };

  leads.forEach(lead => {
    const stage = lead.current_stage || lead.stage || 'awareness';
    if (grouped[stage]) {
      grouped[stage].push({
        ...lead,
        currentStage: stage,
        contentStrategies: lead.content_strategies || [],
        movementHistory: lead.movement_history || []
      });
    }
  });

  return grouped;
}

// GET all leads for a user (grouped by stage)
router.get('/:userId', async (req, res) => {
  try {
    const requestedUserId = parseInt(req.params.userId);
    const providedUserId = parseInt(req.headers['x-user-id']);

    if (isNaN(requestedUserId) || isNaN(providedUserId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    if (requestedUserId !== providedUserId) {
      return res.status(403).json({ error: 'Unauthorized access' });
    }

    const result = await pool.query(`
      SELECT *, 
             COALESCE(content_strategies, '[]'::json) as content_strategies,
             COALESCE(movement_history, '[]'::json) as movement_history
      FROM leads 
      WHERE user_id = $1
    `, [requestedUserId]);

    const groupedLeads = groupLeadsByStage(result.rows);
    res.json(groupedLeads);
  } catch (err) {
    console.error('❌ Error fetching leads:', err);
    res.status(500).json({ error: 'Failed to fetch leads' });
  }
});

// POST - Create a new lead
router.post('/', async (req, res) => {
  try {
    const {
      user_id,
      company = '',
      contact = '',
      email = '',
      phone = '',
      stage = 'awareness',
      currentStage = 'awareness',
      source = 'website',
      industry = 'other',
      status = 'new',
      notes = '',
      contentStrategies = [],
      value = 0
    } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: 'Missing user_id' });
    }

    if (!company || !contact || !email) {
      return res.status(400).json({ error: 'Company, contact, and email are required' });
    }

    const result = await pool.query(
      `INSERT INTO leads (
        user_id, 
        company, 
        contact, 
        email, 
        phone, 
        stage, 
        current_stage, 
        source, 
        industry, 
        status, 
        notes, 
        content_strategies,
        value,
        movement_history
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        user_id,
        company.trim(),
        contact.trim(),
        email.trim(),
        phone,
        stage,
        currentStage,
        source,
        industry,
        status,
        notes,
        JSON.stringify(contentStrategies),
        value,
        JSON.stringify([{
          from: null,
          to: currentStage,
          date: new Date().toISOString()
        }])
      ]
    );

    const allLeads = await pool.query('SELECT * FROM leads WHERE user_id = $1', [user_id]);
    const groupedLeads = groupLeadsByStage(allLeads.rows);
    res.status(201).json(groupedLeads);
  } catch (err) {
    console.error('❌ Error adding lead:', err);
    res.status(500).json({ error: 'Failed to add lead' });
  }
});

// PUT - Update a lead
router.put('/:id', async (req, res) => {
  try {
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
      lastContact,
      movementHistory
    } = req.body;

    // First get the current lead to check stage changes
    const currentLead = await pool.query(
      'SELECT current_stage FROM leads WHERE id = $1 AND user_id = $2',
      [leadId, providedUserId]
    );

    if (currentLead.rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found or not owned by user' });
    }

    const oldStage = currentLead.rows[0].current_stage;
    const newStage = currentStage || oldStage;
    const now = new Date().toISOString();

    // Update movement history if stage changed
    let updatedMovementHistory = movementHistory || [];
    if (oldStage !== newStage) {
      updatedMovementHistory.push({
        from: oldStage,
        to: newStage,
        date: now
      });
    }

    await pool.query(
      `UPDATE leads SET
        company = $1,
        contact = $2,
        email = $3,
        phone = $4,
        current_stage = $5,
        source = $6,
        industry = $7,
        status = $8,
        notes = $9,
        content_strategies = $10,
        last_contact = $11,
        movement_history = $12,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $13 AND user_id = $14`,
      [
        company,
        contact,
        email,
        phone,
        newStage,
        source,
        industry,
        status,
        notes,
        JSON.stringify(contentStrategies),
        lastContact || now,
        JSON.stringify(updatedMovementHistory),
        leadId,
        providedUserId
      ]
    );

    const updatedLead = await pool.query(
      'SELECT * FROM leads WHERE id = $1 AND user_id = $2',
      [leadId, providedUserId]
    );

    res.json(updatedLead.rows[0]);
  } catch (err) {
    console.error('❌ Error updating lead:', err);
    res.status(500).json({ error: 'Failed to update lead' });
  }
});

// DELETE - Remove a lead
router.delete('/:id', async (req, res) => {
  try {
    const leadId = parseInt(req.params.id);
    const providedUserId = parseInt(req.headers['x-user-id']);

    if (isNaN(leadId) || isNaN(providedUserId)) {
      return res.status(400).json({ error: 'Invalid lead ID or user ID' });
    }

    const result = await pool.query(
      'DELETE FROM leads WHERE id = $1 AND user_id = $2 RETURNING *',
      [leadId, providedUserId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found or not owned by user' });
    }

    const allLeads = await pool.query('SELECT * FROM leads WHERE user_id = $1', [providedUserId]);
    const groupedLeads = groupLeadsByStage(allLeads.rows);
    res.json(groupedLeads);
  } catch (err) {
    console.error('❌ Error deleting lead:', err);
    res.status(500).json({ error: 'Failed to delete lead' });
  }
});

module.exports = router;
