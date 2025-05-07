// 📄 routes/leads.js – Updated to work with auth system
const express = require('express');
const router = express.Router();
const pool = require('../db');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

const allowedOrigins = [
  'https://funnelflow.live',
  'http://localhost:3000'
];

const corsOptionsDelegate = function (req, callback) {
  const origin = req.header('Origin');
  if (allowedOrigins.includes(origin)) {
    callback(null, {
      origin: true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id'],
      optionsSuccessStatus: 200
    });
  } else {
    callback(new Error('Not allowed by CORS'), null);
  }
};

router.use(cors(corsOptionsDelegate));
router.options('*', cors(corsOptionsDelegate));

// 🔹 Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ error: 'Unauthorized - No token provided' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Forbidden - Invalid token' });
    req.user = user;
    next();
  });
};

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
      notes: lead.notes || '',
      content: lead.content || '',
      contentStrategies: (lead.content || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
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

// Apply authentication middleware to all lead routes
router.use(authenticateToken);

// 🔹 GET all leads for a user
router.get('/:userId', async (req, res) => {
  try {
    const requestedUserId = parseInt(req.params.userId);
    const tokenUserId = req.user.id;

    if (isNaN(requestedUserId) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    if (requestedUserId !== tokenUserId) {
      return res.status(403).json({ error: 'Unauthorized - You can only access your own leads' });
    }

    const result = await pool.query(
      'SELECT * FROM leads_clean WHERE user_id = $1 ORDER BY created_at DESC',
      [requestedUserId]
    );

    if (result.rows.length === 0) {
      return res.status(200).json({
        awareness: [],
        interest: [],
        intent: [],
        evaluation: [],
        purchase: []
      });
    }

    const groupedLeads = groupLeadsByStage(result.rows);
    res.json(groupedLeads);

  } catch (err) {
    console.error('GET leads error:', err);
    res.status(500).json({ 
      error: 'Failed to fetch leads',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// 🔹 POST create new lead
router.post('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      company,
      contact,
      email,
      stage = 'awareness',
      notes = '',
      content = ''
    } = req.body;

    // Validate required fields
    if (!company || !contact || !email) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        details: ['Company, contact, and email are required']
      });
    }

    const normalizedContent = Array.isArray(content)
      ? content.map(c => c.trim()).filter(Boolean).join(',')
      : typeof content === 'string'
        ? content.trim()
        : '';

    const validationErrors = validateLeadData({ company, email });
    if (validationErrors) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: validationErrors 
      });
    }

    const validStages = ['awareness', 'interest', 'intent', 'evaluation', 'purchase'];
    const leadStage = validStages.includes(stage) ? stage : 'awareness';

    const result = await pool.query(
      `INSERT INTO leads_clean 
        (user_id, company, contact, email, stage, notes, content, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
       RETURNING *`,
      [
        userId,
        company.trim(),
        contact.trim(),
        email.trim(),
        leadStage,
        notes.trim(),
        normalizedContent
      ]
    );

    if (result.rows.length === 0) {
      throw new Error('Failed to create lead - no rows returned');
    }

    const allLeads = await pool.query(
      'SELECT * FROM leads_clean WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );

    const groupedLeads = groupLeadsByStage(allLeads.rows);
    res.status(201).json(groupedLeads);

  } catch (err) {
    console.error('POST lead error:', err);
    res.status(500).json({ 
      error: 'Failed to add lead',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// 🔹 GET metrics for user
router.get('/metrics/:userId', async (req, res) => {
  try {
    const requestedUserId = parseInt(req.params.userId);
    const tokenUserId = req.user.id;

    if (isNaN(requestedUserId) || requestedUserId !== tokenUserId) {
      return res.status(403).json({ error: 'Unauthorized access' });
    }

    const result = await pool.query(
      'SELECT id, stage, created_at FROM leads_clean WHERE user_id = $1',
      [requestedUserId]
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
      if (['intent', 'evaluation', 'purchase'].includes(stage) && age <= 7) hotLeads++;
      if (age > 14 && ['awareness', 'interest'].includes(stage)) staleLeads++;
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
    res.status(500).json({ 
      error: 'Failed to calculate metrics',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// 🔹 PUT update lead
router.put('/:id', async (req, res) => {
  try {
    const leadId = parseInt(req.params.id);
    const userId = req.user.id;
    
    if (isNaN(leadId)) {
      return res.status(400).json({ error: 'Invalid lead ID' });
    }

    let { company, contact, email, stage, notes, content } = req.body;

    // Normalize content
    content = Array.isArray(content) ? content.join(',') : content?.trim() || '';

    const validationErrors = validateLeadData({ company, email });
    if (validationErrors) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: validationErrors 
      });
    }

    const validStages = ['awareness', 'interest', 'intent', 'evaluation', 'purchase'];
    const leadStage = validStages.includes(stage) ? stage : null;

    // First verify the lead belongs to the user
    const verifyResult = await pool.query(
      'SELECT id FROM leads_clean WHERE id = $1 AND user_id = $2',
      [leadId, userId]
    );
    
    if (verifyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found or not owned by user' });
    }

    const updateResult = await pool.query(
      `UPDATE leads_clean SET
        company = COALESCE($1, company),
        contact = COALESCE($2, contact),
        email = COALESCE($3, email),
        stage = COALESCE($4, stage),
        notes = COALESCE($5, notes),
        content = COALESCE($6, content)
       WHERE id = $7 AND user_id = $8
       RETURNING *`,
      [
        company?.trim() || null,
        contact?.trim() || null,
        email?.trim() || null,
        leadStage,
        notes?.trim() || null,
        content,
        leadId,
        userId
      ]
    );

    const allLeads = await pool.query(
      'SELECT * FROM leads_clean WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );

    res.json(groupLeadsByStage(allLeads.rows));
  } catch (err) {
    console.error('PUT lead error:', err);
    res.status(500).json({ 
      error: 'Failed to update lead',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// 🔹 DELETE lead
router.delete('/:id', async (req, res) => {
  try {
    const leadId = parseInt(req.params.id);
    const userId = req.user.id;

    if (isNaN(leadId)) {
      return res.status(400).json({ error: 'Invalid lead ID' });
    }

    // First verify the lead belongs to the user
    const verifyResult = await pool.query(
      'SELECT id FROM leads_clean WHERE id = $1 AND user_id = $2',
      [leadId, userId]
    );
    
    if (verifyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found or not owned by user' });
    }

    const deleteResult = await pool.query(
      'DELETE FROM leads_clean WHERE id = $1 AND user_id = $2 RETURNING *',
      [leadId, userId]
    );

    const allLeads = await pool.query(
      'SELECT * FROM leads_clean WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );

    res.json(groupLeadsByStage(allLeads.rows));
  } catch (err) {
    console.error('DELETE lead error:', err);
    res.status(500).json({ 
      error: 'Failed to delete lead',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

module.exports = router;
