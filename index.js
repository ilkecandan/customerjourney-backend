// 📄 index.js - Updated with proper CORS configuration

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./db');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const leadsRoutes = require('./routes/leads');

const app = express();
const port = process.env.PORT || 3000;

// ✅ Configure CORS properly
const allowedOrigins = [
  'https://funnelflow.live',
  'http://localhost:3000', // For local development
  'http://localhost:5173' // For Vite development
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id'],
  credentials: true
};

// Security middleware
app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// ✅ API status check
app.get('/', (req, res) => res.send('🧠 FunnelFlow API is running'));

// ✅ Test DB connection endpoint
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

// ✅ Debug: See what columns exist in the leads_clean table
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

// ✅ Routes
app.use('/api/auth', authRoutes);
app.use('/api/leads', leadsRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something broke!' });
});

// ✅ Server start
app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
});
