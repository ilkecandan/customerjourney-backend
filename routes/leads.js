// 📄 routes/leads.js - Complete CORS-enabled version
const express = require('express');
const router = express.Router();
const pool = require('../db');
const cors = require('cors');

// Configure CORS options
const corsOptions = {
  origin: [
    'https://ilkecandan.github.io',
    'http://localhost:3000' // For local development
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-user-id'],
  credentials: true,
  optionsSuccessStatus: 200 // For legacy browser support
};

// Apply CORS middleware to all routes
router.use(cors(corsOptions));

// Handle preflight requests
router.options('*', cors(corsOptions));

// ✅ Group leads by stage with consistent field names
function groupLeadsByStage(leads) {
  const grouped = {
    awareness: [],
    interest: [],
    intent: [],
    evaluation: [],
    purchase: []
  };

  leads.forEach(lead => {
    const stage = lead.stage || lead.current_stage || 'awareness';
    if (grouped[stage]) {
      grouped[stage].push({
        ...lead,
        currentStage: stage,
        contentStrategies: lead.content_strategies || []
      });
    }
  });

  return grouped;
}

// ✅ Enhanced GET endpoint with CORS headers
router.get('/:userId', async (req, res) => {
  try {
    // Set additional CORS headers
    res.header('Access-Control-Allow-Origin', corsOptions.origin);
    res.header('Access-Control-Allow-Credentials', 'true');

    const requestedUserId = parseInt(req.params.userId);
    const providedUserId = parseInt(req.headers['x-user-id']);

    // Validate IDs
    if (isNaN(requestedUserId)) {
      return res.status(400).json({ 
        error: 'Invalid user ID',
        details: `Received: ${req.params.userId}`
      });
    }

    if (requestedUserId !== providedUserId) {
      return res.status(403).json({ 
        error: 'Unauthorized access',
        details: 'User ID mismatch'
      });
    }

    // Get leads with timeout protection
    const result = await pool.query({
      text: 'SELECT * FROM leads_clean WHERE user_id = $1',
      values: [requestedUserId],
      timeout: 5000
    });

    const groupedLeads = groupLeadsByStage(result.rows);
    
    // Add cache control headers
    res.header('Cache-Control', 'no-store, max-age=0');
    res.json(groupedLeads);
    
  } catch (err) {
    console.error('❌ Database Error:', {
      error: err,
      query: 'GET /api/leads/:userId',
      params: req.params
    });
    
    res.status(500).json({ 
      error: 'Failed to fetch leads',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// ✅ Improved POST endpoint with CORS support
router.post('/', async (req, res) => {
  try {
    // Set CORS headers
    res.header('Access-Control-Allow-Origin', corsOptions.origin);
    res.header('Access-Control-Allow-Credentials', 'true');

    const { user_id, company = '', contact = '', email = '', stage = 'awareness', notes = '' } = req.body;

    // Validate required fields
    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    if (!company.trim()) {
      return res.status(400).json({ error: 'Company name is required' });
    }

    const cleanCompany = company.trim().length >= 2 ? company.trim() : 'Untitled Company';

    // Insert with returning clause
    const insertResult = await pool.query(
      `INSERT INTO leads_clean 
       (user_id, company, contact, email, stage, notes, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
       RETURNING *`,
      [user_id, cleanCompany, contact, email, stage, notes]
    );

    // Get updated list
    const result = await pool.query('SELECT * FROM leads_clean WHERE user_id = $1', [user_id]);
    const groupedLeads = groupLeadsByStage(result.rows);
    
    res.status(201)
      .header('Cache-Control', 'no-store')
      .json(groupedLeads);
    
  } catch (err) {
    console.error('❌ Database Error:', {
      error: err,
      query: 'POST /api/leads',
      body: req.body
    });
    
    res.status(500).json({ 
      error: 'Failed to add lead',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// ✅ Robust PUT endpoint with CORS support
router.put('/:id', async (req, res) => {
  try {
    // Set CORS headers
    res.header('Access-Control-Allow-Origin', corsOptions.origin);
    res.header('Access-Control-Allow-Credentials', 'true');

    const leadId = parseInt(req.params.id);
    const providedUserId = parseInt(req.headers['x-user-id']);

    // Validate IDs
    if (isNaN(leadId) || isNaN(providedUserId)) {
      return res.status(400).json({ 
        error: 'Invalid IDs',
        details: {
          leadId: req.params.id,
          userId: req.headers['x-user-id']
        }
      });
    }

    // Normalize incoming data
    const {
      company = '',
      contact = '',
      email = '',
      phone = '',
      stage = req.body.currentStage || req.body.stage || 'awareness',
      source = '',
      industry = '',
      status = '',
      notes = '',
      contentStrategies = [],
      lastContact = new Date().toISOString()
    } = req.body;

    // Validate required fields
    if (!company.trim() || !contact.trim()) {
      return res.status(400).json({ 
        error: 'Company and contact are required',
        received: { company, contact }
      });
    }

    // Execute update
    const updateResult = await pool.query(
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
       WHERE id = $12 AND user_id = $13
       RETURNING *`,
      [
        company,
        contact,
        email,
        phone,
        stage,
        source,
        industry,
        status,
        notes,
        JSON.stringify(Array.isArray(contentStrategies) ? contentStrategies : []),
        lastContact,
        leadId,
        providedUserId
      ]
    );

    if (updateResult.rowCount === 0) {
      return res.status(404).json({ 
        error: 'Lead not found or not owned by user',
        details: { leadId, userId: providedUserId }
      });
    }

    res.header('Cache-Control', 'no-store')
       .json({
         ...updateResult.rows[0],
         currentStage: updateResult.rows[0].stage,
         contentStrategies: updateResult.rows[0].content_strategies || []
       });
    
  } catch (err) {
    console.error('❌ Database Error:', {
      error: err,
      query: 'PUT /api/leads/:id',
      params: req.params,
      body: req.body
    });
    
    res.status(500).json({ 
      error: 'Failed to update lead',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// ✅ Add DELETE endpoint for CORS completeness
router.delete('/:id', async (req, res) => {
  try {
    res.header('Access-Control-Allow-Origin', corsOptions.origin);
    res.header('Access-Control-Allow-Credentials', 'true');

    const leadId = parseInt(req.params.id);
    const providedUserId = parseInt(req.headers['x-user-id']);

    if (isNaN(leadId) || isNaN(providedUserId)) {
      return res.status(400).json({ error: 'Invalid lead ID or user ID' });
    }

    const result = await pool.query(
      'DELETE FROM leads_clean WHERE id = $1 AND user_id = $2 RETURNING *',
      [leadId, providedUserId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Lead not found or not owned by user' });
    }

    res.header('Cache-Control', 'no-store')
       .json({ success: true, deletedLead: result.rows[0] });
    
  } catch (err) {
    console.error('❌ Database Error:', {
      error: err,
      query: 'DELETE /api/leads/:id',
      params: req.params
    });
    
    res.status(500).json({ 
      error: 'Failed to delete lead',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

module.exports = router;
