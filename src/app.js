const express = require('express');

const app = express();

app.use(express.json());

app.use('/api/pasaportes', require('../modules/pasaportes'));
// app.use('/api/octoplus', require('../modules/octoplus'));

module.exports = app;