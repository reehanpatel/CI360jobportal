require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

connectDB();

app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/personnel', require('./routes/personnel'));
app.use('/api/clients', require('./routes/clients'));
app.use('/api/services', require('./routes/services'));
app.use('/api/jobs', require('./routes/jobs'));
app.use('/api/roster', require('./routes/roster'));
app.use('/api/targets', require('./routes/targets'));
app.use('/api/salary', require('./routes/salary'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/notifications', require('./routes/notifications'));

// Serve Vite production build static assets if built
const webDistPath = path.join(__dirname, '../web/dist');
app.use(express.static(webDistPath));

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date() }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`CI360 backend server running on http://localhost:${PORT}`));
