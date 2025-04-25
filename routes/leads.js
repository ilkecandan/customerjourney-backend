// 📄 routes/leads.js – Final CORS + Debugging Version
const express = require('express');
const router = express.Router();
const pool = require('../db');
const cors = require('cors');

// ✅ Allowed Origins
const allowedOrigins = [
  'https://ilkecandan.github.io',
  'http://localhost:3000'
];

// ✅ Dynamic CORS Middleware
const corsOptionsDelegate = function (req, callback) {
  const origin = req.header('Origin');
  if (!origin || allowedOrigins.includes(origin)) {
    callback(null, {
      origin: origin,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'x-user-id'],
      optionsSuccessStatus: 200
    });
  } else {
    console.warn('❗ Blocked CORS origin:', origin);
    callback(new Error('Not allowed by CORS'), null);
  }
};

// ✅ Apply CORS middleware to router
router.use(cors(corsOptionsDelegate));
router.options('*', cors(corsOptionsDelegate));

// ✅ Manual headers for double safety
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

// ✅ Grouping Helper
function groupLeadsByStage(leads) {
  const grouped = {
    awareness: [], interest: [], intent: [], evaluation: [], purchase: []
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

// ======================================
// 📥 GET /api/leads/:userId
// ======================================
router.get('/:userId', async (req, res) => {
  try {
    console.log('🔎 GET /api/leads/', req.params.userId, 'Headers:', req.headers);

    const requestedUserId = parseInt(req.params.userId);
    const providedUserId = parseInt(req.headers['x-user-id']);

    if (isNaN(requestedUserId)) {
      console.warn('⚠️ Invalid userId in params');
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    if (requestedUserId !== providedUserId) {
      console.warn('⚠️ User ID mismatch - Unauthorized access');
      return res.status(403).json({ error: 'Unauthorized access' });
    }

    const result = await pool.query({
      text: 'SELECT * FROM leads_clean WHERE user_id = $1',
      values: [requestedUserId],
      timeout: 5000
    });

    console.log('✅ Leads fetched:', result.rowCount);

    const groupedLeads = groupLeadsByStage(result.rows);
    res.header('Cache-Control', 'no-store, max-age=0').json(groupedLeads);

  } catch (err) {
    console.error('❌ DB Error @ GET /api/leads/:userId', err);
    res.status(500).json({ error: 'Failed to fetch leads' });
  }
});

// ======================================
// ➕ POST /api/leads
// ======================================
router.post('/', async (req, res) => {
  try {
    console.log('🛠️ POST /api/leads', 'Body:', req.body);

    const { user_id, company = '', contact = '', email = '', stage = 'awareness', notes = '' } = req.body;

    if (!user_id) return res.status(400).json({ error: 'user_id is required' });
    if (!company.trim()) return res.status(400).json({ error: 'Company name is required' });

    const cleanCompany = company.trim().length >= 2 ? company.trim() : 'Untitled Company';

    await pool.query(
      `INSERT INTO leads_clean (user_id, company, contact, email, stage, notes, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
      [user_id, cleanCompany, contact, email, stage, notes]
    );

    console.log('✅ New lead inserted for user_id:', user_id);

    const result = await pool.query('SELECT * FROM leads_clean WHERE user_id = $1', [user_id]);
    const groupedLeads = groupLeadsByStage(result.rows);

    res.status(201).header('Cache-Control', 'no-store').json(groupedLeads);

  } catch (err) {
    console.error('❌ DB Error @ POST /api/leads', err);
    res.status(500).json({ error: 'Failed to add lead' });
  }
});

// ======================================
// ✏️ PUT /api/leads/:id
// ======================================
router.put('/:id', async (req, res) => {
  try {
    console.log('🖊️ PUT /api/leads/', req.params.id, 'Body:', req.body);

    const leadId = parseInt(req.params.id);
    const providedUserId = parseInt(req.headers['x-user-id']);

    if (isNaN(leadId) || isNaN(providedUserId)) {
      console.warn('⚠️ Invalid IDs in PUT');
      return res.status(400).json({ error: 'Invalid IDs' });
    }

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

    if (!company.trim() || !contact.trim()) {
      console.warn('⚠️ Missing company/contact');
      return res.status(400).json({ error: 'Company and contact are required' });
    }

    const updateResult = await pool.query(
      `UPDATE leads_clean SET
        company = $1, contact = $2, email = $3, phone = $4,
        stage = $5, source = $6, industry = $7, status = $8,
        notes = $9, content_strategies = $10, last_contact = $11,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $12 AND user_id = $13
       RETURNING *`,
      [
        company, contact, email, phone, stage,
        source, industry, status, notes,
        JSON.stringify(Array.isArray(contentStrategies) ? contentStrategies : []),
        lastContact, leadId, providedUserId
      ]
    );

    if (updateResult.rowCount === 0) {
      console.warn('⚠️ No lead updated, wrong user or missing lead');
      return res.status(404).json({ error: 'Lead not found or not owned by user' });
    }

    console.log('✅ Lead updated successfully:', leadId);

    const updatedLead = updateResult.rows[0];
    res.header('Cache-Control', 'no-store').json({
      ...updatedLead,
      currentStage: updatedLead.stage,
      contentStrategies: updatedLead.content_strategies || []
    });

  } catch (err) {
    console.error('❌ DB Error @ PUT /api/leads/:id', err);
    res.status(500).json({ error: 'Failed to update lead' });
  }
});

// ======================================
// 🗑️ DELETE /api/leads/:id
// ======================================
router.delete('/:id', async (req, res) => {
  try {
    console.log('🗑️ DELETE /api/leads/', req.params.id);

    const leadId = parseInt(req.params.id);
    const providedUserId = parseInt(req.headers['x-user-id']);

    if (isNaN(leadId) || isNaN(providedUserId)) {
      console.warn('⚠️ Invalid ID in DELETE');
      return res.status(400).json({ error: 'Invalid lead ID or user ID' });
    }

    const result = await pool.query(
      'DELETE FROM leads_clean WHERE id = $1 AND user_id = $2 RETURNING *',
      [leadId, providedUserId]
    );

    if (result.rowCount === 0) {
      console.warn('⚠️ No lead deleted - not found or wrong user');
      return res.status(404).json({ error: 'Lead not found or not owned by user' });
    }

    console.log('✅ Lead deleted:', result.rows[0]);

    res.header('Cache-Control', 'no-store').json({ success: true, deletedLead: result.rows[0] });

  } catch (err) {
    console.error('❌ DB Error @ DELETE /api/leads/:id', err);
    res.status(500).json({ error: 'Failed to delete lead' });
  }
});

// ======================================
// 📜 Handle any stray OPTIONS requests
// ======================================
router.options('*', (req, res) => {
  console.log('⚙️ OPTIONS preflight hit');
  res.sendStatus(204);
});

module.exports = router;
