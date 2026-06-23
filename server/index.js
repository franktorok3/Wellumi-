require('dotenv').config();

const cors = require('cors');
const express = require('express');
const apiRouter = require('./src/routes/api');
const { config } = require('./src/config');

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(apiRouter);

app.listen(config.port, () => {
  console.log(`Wellumi API server running on http://localhost:${config.port}`);
});
