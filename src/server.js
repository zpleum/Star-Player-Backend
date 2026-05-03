const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const morgan = require('morgan');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// Routes
app.use('/api/youtube', require('./routes/youtube'));
app.use('/api/lyrics', require('./routes/lyrics'));
app.use('/api/cover', require('./routes/cover'));

app.get('/', (req, res) => {
  res.json({ message: 'Star Player Backend is running' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
