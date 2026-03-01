require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(helmet());
app.use(cors());
app.use(express.json());

// Routes
const apiRoutes = require('./routes/api.routes');
app.use('/api', apiRoutes);

// Detailed error handling for unhandled routes
app.use((req, res, next) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
app.listen(PORT, () => {
    console.log(`AsteroidServer listening on port ${PORT}`);
});
