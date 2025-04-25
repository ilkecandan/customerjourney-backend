// 📄 routes/leads.js – Fully Compatible Backend Update
const express = require('express');
const router = express.Router();
const pool = require('../db');
const cors = require('cors');

const allowedOrigins = [
  'https://ilkecandan.github.io',
  'http://localhost:3000'
];

const corsOptionsDelegate = function (req, callback) {
  const origin = req.header('Origin');
  if (allowedOrigins.includes(origin)) {
    callback(null, {
      origin: true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'x-user-id'],
      optionsSuccessStatus: 200
    });
  } else {
    callback(new Error('Not allowed by CORS'), null);
  }
};

router.use(cors(corsOptionsDelegate));
router.options('*', cors(corsOptionsDelegate));

router.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-user-id');
  }
  next();
});

function groupLeadsByStage(leads) {
  const grouped = { awareness: [], interest: [], intent: [], evaluation: [], purchase: [] };
  leads.forEach(lead => {
    const stage = lead.stage || 'awareness';
    grouped[stage].push({ ...lead, currentStage: stage });
  });
  return grouped;
}

// GET leads
router.get('/:userId', async (req, res) => {
  try {
    const requestedUserId = parseInt(req.params.userId);
    const providedUserId = parseInt(req.headers['x-user-id']);

    if (isNaN(requestedUserId) || requestedUserId !== providedUserId) {
      return res.status(403).json({ error: 'Unauthorized access' });
    }

    const result = await pool.query(
      'SELECT * FROM leads_clean WHERE user_id = $1',
      [requestedUserId]
    );

    res.json(groupLeadsByStage(result.rows));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch leads' });
  }
});

// POST new lead
router.post('/', async (req, res) => {
  try {
    const { user_id, company, contact, email, stage = 'awareness', notes = '' } = req.body;

    if (!user_id || !company.trim()) {
      return res.status(400).json({ error: 'User ID and company name are required' });
    }

    await pool.query(
      `INSERT INTO leads_clean (user_id, company, contact, email, stage, notes, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
      [user_id, company, contact || '', email || '', stage, notes || '']
    );

    const result = await pool.query('SELECT * FROM leads_clean WHERE user_id = $1', [user_id]);
    res.status(201).json(groupLeadsByStage(result.rows));
  } catch (err) {
    res.status(500).json({ error: 'Failed to add lead' });
  }
});

// PUT (update) lead
router.put('/:id', async (req, res) => {
  try {
    const leadId = parseInt(req.params.id);
    const providedUserId = parseInt(req.headers['x-user-id']);

    if (isNaN(leadId) || isNaN(providedUserId)) {
      return res.status(400).json({ error: 'Invalid IDs' });
    }

    const { company, contact, email, stage, notes } = req.body;

    await pool.query(
      `UPDATE leads_clean SET
        company = $1,
        contact = $2,
        email = $3,
        stage = $4,
        notes = $5,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $6 AND user_id = $7 RETURNING *`,
      [
        company || '',
        contact || '',
        email || '',
        stage || 'awareness',
        notes || '',
        leadId,
        providedUserId
      ]
    );

    const result = await pool.query('SELECT * FROM leads_clean WHERE user_id = $1', [providedUserId]);
    res.json(groupLeadsByStage(result.rows));

  } catch (err) {
    res.status(500).json({ error: 'Failed to update lead' });
  }
});

// DELETE lead
router.delete('/:id', async (req, res) => {
  try {
    const leadId = parseInt(req.params.id);
    const providedUserId = parseInt(req.headers['x-user-id']);

    if (isNaN(leadId) || isNaN(providedUserId)) {
      return res.status(400).json({ error: 'Invalid lead ID or user ID' });
    }

    await pool.query(
      'DELETE FROM leads_clean WHERE id = $1 AND user_id = $2',
      [leadId, providedUserId]
    );

    const result = await pool.query('SELECT * FROM leads_clean WHERE user_id = $1', [providedUserId]);
    res.json(groupLeadsByStage(result.rows));

  } catch (err) {
    res.status(500).json({ error: 'Failed to delete lead' });
  }
});

module.exports = router;
