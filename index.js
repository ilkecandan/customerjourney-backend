// 📄 index.js

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./db');

const authRoutes = require('./routes/auth');
const leadsRoutes = require('./routes/leads');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

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

// ✅ Routes
app.use('/api/auth', authRoutes);
app.use('/api/leads', leadsRoutes);

// ✅ Server start
app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
});
