// 📄 index.js

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./db');

const authRoutes = require('./routes/auth');
const leadsRoutes = require('./routes/leads');

const app = express();
const port = process.env.PORT || 3000;

// ✅ Centralized CORS Configuration
const corsOptions = {
  origin: ['https://funnelflow.live', 'http://localhost:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id'],
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// ✅ Automatically handle preflight OPTIONS
app.options('*', cors(corsOptions));

app.use(express.json());

// ✅ Health check
app.get('/', (req, res) => res.send('🧠 FunnelFlow API is running'));

// ✅ DB test
app.get('/api/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('✅ Database connected successfully at:', result.rows[0].now);
    res.json({ success: true, time: result.rows[0].now });
  } catch (err) {
    console.error('❌ Database connection failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Debug: leads_clean column names
app.get('/api/debug/leads-columns', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'leads_clean'
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Core API Routes
app.use('/api/auth', authRoutes);
app.use('/api/leads', leadsRoutes);

// ✅ Start server
app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
});
