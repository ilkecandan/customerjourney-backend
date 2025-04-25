// 📄 routes/leads.js – Fixed Backend
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

// 🔹 Helper Functions
function groupLeadsByStage(leads) {
  const validStages = ['awareness', 'interest', 'intent', 'evaluation', 'purchase'];
  const grouped = { awareness: [], interest: [], intent: [], evaluation: [], purchase: [] };

  leads.forEach(lead => {
    const stage = validStages.includes(lead.stage) ? lead.stage : 'awareness';
    grouped[stage].push({
      ...lead,
      currentStage: stage,
      company: lead.company || 'Unknown Company',
      contact: lead.contact || '',
      email: lead.email || '',
      notes: lead.notes || ''
    });
  });

  return grouped;
}

function validateLeadData(leadData) {
  const errors = [];
  if (!leadData.company || leadData.company.trim().length < 2) {
    errors.push('Company name must be at least 2 characters');
  }
  if (leadData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(leadData.email)) {
    errors.push('Invalid email format');
  }
  return errors.length > 0 ? errors : null;
}

// 🔹 GET all leads for a user
router.get('/:userId', async (req, res) => {
  try {
    const requestedUserId = parseInt(req.params.userId);
    const providedUserId = parseInt(req.headers['x-user-id']);
    if (isNaN(requestedUserId) || requestedUserId !== providedUserId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const result = await pool.query(
      'SELECT * FROM leads_clean WHERE user_id = $1 ORDER BY created_at DESC',
      [requestedUserId]
    );

    res.json(groupLeadsByStage(result.rows));
  } catch (err) {
    console.error('GET leads error:', err);
    res.status(500).json({ error: 'Failed to fetch leads', details: err.message });
  }
});

// 🔹 POST create new lead
router.post('/', async (req, res) => {
  try {
    const {
      user_id,
      company,
      contact,
      email,
      stage = 'awareness',
      notes = '',
      content = ''
    } = req.body;

    const validationErrors = validateLeadData({ company, email });
    if (validationErrors) {
      return res.status(400).json({ error: 'Validation failed', details: validationErrors });
    }

    const validStages = ['awareness', 'interest', 'intent', 'evaluation', 'purchase'];
    const leadStage = validStages.includes(stage) ? stage : 'awareness';

    const result = await pool.query(
      `INSERT INTO leads_clean (user_id, company, contact, email, stage, notes, content, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP) RETURNING *`,
      [
        user_id,
        company.trim(),
        contact?.trim() || '',
        email?.trim() || '',
        leadStage,
        notes?.trim() || '',
        content
      ]
    );

    const allLeads = await pool.query(
      'SELECT * FROM leads_clean WHERE user_id = $1 ORDER BY created_at DESC',
      [user_id]
    );

    res.status(201).json(groupLeadsByStage(allLeads.rows));
  } catch (err) {
    console.error('POST lead error:', err);
    res.status(500).json({ error: 'Failed to add lead', details: err.message });
  }
});




// 🔹 GET metrics for user
// 🔹 GET metrics for user (refactored with real, calculated advanced analytics)
router.get('/metrics/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const headerUserId = parseInt(req.headers['x-user-id']);

    if (isNaN(userId) || userId !== headerUserId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const result = await pool.query(
      'SELECT id, stage, created_at, notes FROM leads_clean WHERE user_id = $1',
      [userId]
    );

    const leads = result.rows;
    const now = new Date();
    const daysAgo = (date) => (now - new Date(date)) / (1000 * 60 * 60 * 24);

    const stageCounts = {
      awareness: 0,
      interest: 0,
      intent: 0,
      evaluation: 0,
      purchase: 0
    };

    let totalDaysInFunnel = 0;
    let hotLeads = 0;
    let staleLeads = 0;
    let recentLeads = 0;

    leads.forEach(lead => {
      const stage = stageCounts[lead.stage] !== undefined ? lead.stage : 'awareness';
      stageCounts[stage]++;

      const age = daysAgo(lead.created_at);
      totalDaysInFunnel += age;

      if (age <= 7) recentLeads++;

      if (['intent', 'evaluation', 'purchase'].includes(stage) && age <= 7) {
        hotLeads++;
      }

      if (age > 14 && ['awareness', 'interest'].includes(stage)) {
        staleLeads++;
      }
    });

    const totalLeads = leads.length;
    const considerationCount = stageCounts.intent + stageCounts.evaluation;
    const awarenessToInterest = stageCounts.awareness > 0
      ? Math.round((stageCounts.interest / stageCounts.awareness) * 100)
      : 0;
    const interestToConsideration = stageCounts.interest > 0
      ? Math.round((considerationCount / stageCounts.interest) * 100)
      : 0;
    const conversionRate = stageCounts.awareness > 0
      ? Math.round((stageCounts.purchase / stageCounts.awareness) * 100)
      : 0;

    res.json({
      totalLeads,
      awarenessToInterest,
      interestToConsideration,
      conversionRate,
      avgTimeInFunnel: totalLeads > 0 ? +(totalDaysInFunnel / totalLeads).toFixed(1) : null,
      stageDistribution: Object.entries(stageCounts).reduce((acc, [stage, count]) => {
        acc[stage] = totalLeads > 0 ? Math.round((count / totalLeads) * 100) : 0;
        return acc;
      }, {}),
      leadsAddedThisWeek: recentLeads,
      inferredHotLeads: hotLeads,
      engagementRate: totalLeads > 0 ? Math.round((recentLeads / totalLeads) * 100) : 0,
      staleLeads
    });

  } catch (err) {
    console.error('📉 Metrics error:', err);
    res.status(500).json({ error: 'Failed to calculate metrics' });
  }
});


// 🔹 PUT update lead
router.put('/:id', async (req, res) => {
  try {
    const leadId = parseInt(req.params.id);
    const userId = parseInt(req.headers['x-user-id']);
    if (isNaN(leadId) || isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid ID(s)' });
    }

    const { company, contact, email, stage, notes } = req.body;
    const validationErrors = validateLeadData({ company, email });
    if (validationErrors) {
      return res.status(400).json({ error: 'Validation failed', details: validationErrors });
    }

    const validStages = ['awareness', 'interest', 'intent', 'evaluation', 'purchase'];
    const leadStage = validStages.includes(stage) ? stage : null;

    const result = await pool.query(
      `UPDATE leads_clean SET
        company = COALESCE($1, company),
        contact = COALESCE($2, contact),
        email = COALESCE($3, email),
        stage = COALESCE($4, stage),
        notes = COALESCE($5, notes)
       WHERE id = $6 AND user_id = $7
       RETURNING *`,
      [
        company?.trim() || null,
        contact?.trim() || null,
        email?.trim() || null,
        leadStage,
        notes?.trim() || null,
        leadId,
        userId
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const allLeads = await pool.query(
      'SELECT * FROM leads_clean WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );

    res.json(groupLeadsByStage(allLeads.rows));
  } catch (err) {
    console.error('PUT lead error:', err);
    res.status(500).json({ error: 'Failed to update lead', details: err.message });
  }
});

// 🔹 DELETE lead
router.delete('/:id', async (req, res) => {
  try {
    const leadId = parseInt(req.params.id);
    const userId = parseInt(req.headers['x-user-id']);
    if (isNaN(leadId) || isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid ID(s)' });
    }

    const result = await pool.query(
      'DELETE FROM leads_clean WHERE id = $1 AND user_id = $2 RETURNING *',
      [leadId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const allLeads = await pool.query(
      'SELECT * FROM leads_clean WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );

    res.json(groupLeadsByStage(allLeads.rows));
  } catch (err) {
    console.error('DELETE lead error:', err);
    res.status(500).json({ error: 'Failed to delete lead', details: err.message });
  }
});

module.exports = router;
