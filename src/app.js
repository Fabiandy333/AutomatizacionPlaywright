const express = require('express');
const cors = require('cors');
const {
  isAllowedOrigin,
  requireApiToken
} = require('./security');

const app = express();

app.use(cors({
  origin(origin, callback) {
    callback(
      null,
      isAllowedOrigin(origin)
    );
  },
}));

app.use(
  express.json({
    limit: '100kb',
  })
);

app.use(
  '/api',
  requireApiToken
);

app.use(
  '/api/pasaportes',
  require('../modules/pasaportes/index')
);

app.use(
  '/api/sms',
  require('../modules/sms/index')
);

module.exports = app;