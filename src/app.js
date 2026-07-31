const express = require('express');
const cors = require('cors');
const { isAllowedOrigin, requireApiToken } = require('./security');

const app = express();

app.use(cors({
  origin(origin, callback) {
    // Al devolver false, cors no agrega cabeceras para ese origen y el
    // navegador bloquea la respuesta, sin convertir una petición ajena en
    // una excepción con stack trace en el servidor.
    callback(null, isAllowedOrigin(origin));
    // console.log(`CORS: ${origin} -> ${isAllowedOrigin(origin) ? 'permitido' : 'bloqueado'}`);
  },
}));

app.use(express.json({ limit: '100kb' }));
app.use('/api', requireApiToken);

app.use('/api/pasaportes', require('../modules/pasaportes'));
// app.use('/api/octoplus', require('../modules/octoplus'));

module.exports = app;
