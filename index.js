require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const leadsRoutes = require('./routes/leads');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => res.send('🧠 FunnelFlow API is running'));

app.use('/api/auth', authRoutes);
app.use('/api/leads', leadsRoutes);

app.listen(port, () => console.log(`🚀 Server running on http://localhost:${port}`));
