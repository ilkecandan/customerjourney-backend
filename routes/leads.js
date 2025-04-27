// 📄 routes/leads.js – Complete Updated Version

const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateToken } = require('../middleware/auth');

// 🔹 Constants
const VALID_STAGES = ['awareness', 'interest', 'intent', 'evaluation', 'purchase'];
const DEFAULT_STAGE = 'awareness';

// 🔹 Helper Functions
const groupLeadsByStage = (leads) => {
  const grouped = VALID_STAGES.reduce((acc, stage) => {
    acc[stage] = [];
    return acc;
  }, {});

  leads.forEach(lead => {
    const stage = VALID_STAGES.includes(lead.stage) ? lead.stage : DEFAULT_STAGE;
    
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
};

const validateLeadData = (leadData) => {
  const errors = [];
  
  if (!leadData.company || leadData.company.trim().length < 2) {
    errors.push('Company name must be at least 2 characters');
  }
  
  if (leadData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(leadData.email)) {
    errors.push('Invalid email format');
  }
  
  return errors.length > 0 ? errors : null;
};

const normalizeContent = (content) => {
  if (Array.isArray(content)) {
    return content.map(c => c.trim()).filter(Boolean).join(',');
  }
  return typeof content === 'string' ? content.trim() : '';
};

// 🔹 Middleware for lead ownership verification
const verifyLeadOwnership = async (req, res, next) => {
  try {
    const leadId = parseInt(req.params.id);
    const userId = parseInt(req.user?.id || req.headers['x-user-id']);
    
    if (isNaN(leadId) {
      return res.status(400).json({ error: 'Invalid lead ID' });
    }

    const result = await pool.query(
      'SELECT user_id FROM leads_clean WHERE id = $1',
      [leadId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    if (result.rows[0].user_id !== userId) {
      return res.status(403).json({ error: 'Unauthorized access' });
    }

    next();
  } catch (err) {
    console.error('Ownership verification error:', err);
    res.status(500).json({ error: 'Server error during verification' });
  }
};

// 🔹 GET all leads for a user
router.get('/:userId', authenticateToken, async (req, res) => {
  try {
    const requestedUserId = parseInt(req.params.userId);
    const authUserId = req.user.id;

    if (requestedUserId !== authUserId) {
      return res.status(403).json({ error: 'Unauthorized access' });
    }

    const result = await pool.query(
      `SELECT id, user_id, company, contact, email, phone, stage, 
              source, industry, status, notes, content, 
              created_at as "dateAdded", updated_at as "lastContact"
       FROM leads_clean 
       WHERE user_id = $1 
       ORDER BY created_at DESC`,
      [requestedUserId]
    );

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
router.post('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      company,
      contact = '',
      email = '',
      phone = '',
      stage = DEFAULT_STAGE,
      source = '',
      industry = '',
      status = '',
      notes = '',
      content = ''
    } = req.body;

    const normalizedContent = normalizeContent(content);
    const validationErrors = validateLeadData({ company, email });
    
    if (validationErrors) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: validationErrors 
      });
    }

    const leadStage = VALID_STAGES.includes(stage) ? stage : DEFAULT_STAGE;

    const result = await pool.query(
      `INSERT INTO leads_clean 
       (user_id, company, contact, email, phone, stage, source, 
        industry, status, notes, content)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        userId,
        company.trim(),
        contact.trim(),
        email.trim(),
        phone.trim(),
        leadStage,
        source.trim(),
        industry.trim(),
        status.trim(),
        notes.trim(),
        normalizedContent
      ]
    );

    const allLeads = await pool.query(
      'SELECT * FROM leads_clean WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );

    res.status(201).json(groupLeadsByStage(allLeads.rows));

  } catch (err) {
    console.error('POST lead error:', err);
    res.status(500).json({ 
      error: 'Failed to add lead',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// 🔹 PUT update lead
router.put('/:id', authenticateToken, verifyLeadOwnership, async (req, res) => {
  try {
    const leadId = parseInt(req.params.id);
    const {
      company,
      contact,
      email,
      phone,
      stage,
      source,
      industry,
      status,
      notes,
      content
    } = req.body;

    const normalizedContent = normalizeContent(content);
    const validationErrors = validateLeadData({ company, email });
    
    if (validationErrors) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: validationErrors 
      });
    }

    const leadStage = VALID_STAGES.includes(stage) ? stage : null;

    const result = await pool.query(
      `UPDATE leads_clean SET
        company = COALESCE($1, company),
        contact = COALESCE($2, contact),
        email = COALESCE($3, email),
        phone = COALESCE($4, phone),
        stage = COALESCE($5, stage),
        source = COALESCE($6, source),
        industry = COALESCE($7, industry),
        status = COALESCE($8, status),
        notes = COALESCE($9, notes),
        content = COALESCE($10, content),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $11
       RETURNING *`,
      [
        company?.trim(),
        contact?.trim(),
        email?.trim(),
        phone?.trim(),
        leadStage,
        source?.trim(),
        industry?.trim(),
        status?.trim(),
        notes?.trim(),
        normalizedContent,
        leadId
      ]
    );

    const allLeads = await pool.query(
      'SELECT * FROM leads_clean WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
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
router.delete('/:id', authenticateToken, verifyLeadOwnership, async (req, res) => {
  try {
    const leadId = parseInt(req.params.id);

    await pool.query(
      'DELETE FROM leads_clean WHERE id = $1',
      [leadId]
    );

    const allLeads = await pool.query(
      'SELECT * FROM leads_clean WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
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

// 🔹 GET metrics for user
router.get('/metrics/:userId', authenticateToken, async (req, res) => {
  try {
    const requestedUserId = parseInt(req.params.userId);
    const authUserId = req.user.id;

    if (requestedUserId !== authUserId) {
      return res.status(403).json({ error: 'Unauthorized access' });
    }

    const result = await pool.query(
      `SELECT id, stage, created_at, updated_at, status 
       FROM leads_clean 
       WHERE user_id = $1`,
      [requestedUserId]
    );

    const leads = result.rows;
    const now = new Date();
    const daysAgo = (date) => (now - new Date(date)) / (1000 * 60 * 60 * 24);

    // Initialize metrics
    const metrics = {
      totalLeads: leads.length,
      stageCounts: VALID_STAGES.reduce((acc, stage) => {
        acc[stage] = 0;
        return acc;
      }, {}),
      totalDaysInFunnel: 0,
      hotLeads: 0,
      staleLeads: 0,
      recentLeads: 0
    };

    // Calculate metrics
    leads.forEach(lead => {
      const stage = VALID_STAGES.includes(lead.stage) ? lead.stage : DEFAULT_STAGE;
      metrics.stageCounts[stage]++;
      
      const age = daysAgo(lead.created_at);
      metrics.totalDaysInFunnel += age;

      if (age <= 7) metrics.recentLeads++;
      if (['intent', 'evaluation', 'purchase'].includes(stage) {
        if (age <= 7) metrics.hotLeads++;
      }
      if (age > 14 && ['awareness', 'interest'].includes(stage)) {
        metrics.staleLeads++;
      }
    });

    // Calculate conversion rates
    const considerationCount = metrics.stageCounts.intent + metrics.stageCounts.evaluation;
    
    const response = {
      totalLeads: metrics.totalLeads,
      awarenessToInterest: metrics.stageCounts.awareness > 0
        ? Math.round((metrics.stageCounts.interest / metrics.stageCounts.awareness) * 100)
        : 0,
      interestToConsideration: metrics.stageCounts.interest > 0
        ? Math.round((considerationCount / metrics.stageCounts.interest) * 100)
        : 0,
      conversionRate: metrics.stageCounts.awareness > 0
        ? Math.round((metrics.stageCounts.purchase / metrics.stageCounts.awareness) * 100)
        : 0,
      avgTimeInFunnel: metrics.totalLeads > 0 
        ? Math.round(metrics.totalDaysInFunnel / metrics.totalLeads)
        : null,
      stageDistribution: Object.entries(metrics.stageCounts).reduce((acc, [stage, count]) => {
        acc[stage] = metrics.totalLeads > 0 
          ? Math.round((count / metrics.totalLeads) * 100) 
          : 0;
        return acc;
      }, {}),
      leadsAddedThisWeek: metrics.recentLeads,
      inferredHotLeads: metrics.hotLeads,
      engagementRate: metrics.totalLeads > 0
        ? Math.round((metrics.recentLeads / metrics.totalLeads) * 100)
        : 0,
      staleLeads: metrics.staleLeads
    };

    res.json(response);

  } catch (err) {
    console.error('Metrics error:', err);
    res.status(500).json({ 
      error: 'Failed to calculate metrics',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

module.exports = router;
