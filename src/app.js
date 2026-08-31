const path = require('path');
const fs = require('fs');
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
  '/api/auth',
  require('../src/auth/auth.routes')
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

function resolverDistFrontend() {
  const candidatas = [
    path.resolve(__dirname, '../../AutomatizaciónFrontEnd/dist'),
    path.resolve(__dirname, '../../AutomatizaciónFrontEnd/build'),
  ];

  return candidatas.find((dir) => fs.existsSync(path.join(dir, 'index.html'))) || null;
}

const distFrontend = resolverDistFrontend();

if (distFrontend) {
  app.use(express.static(distFrontend));

  // Fallback SPA: cualquier GET que no sea /api ni un archivo estático con
  // extensión se resuelve con index.html para que las rutas del
  // BrowserRouter funcionen al recargar (p. ej. /pasaportes/flujo-soporte).
  app.use((req, res, next) => {
    const esApi = req.url.startsWith('/api') || req.url.startsWith('/socket.io');

    const tieneExtension = path.extname(req.url.split('?')[0]) !== '';

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return next();
    }

    if (esApi || tieneExtension) {
      return next();
    }

    res.sendFile(path.join(distFrontend, 'index.html'));
  });
}

module.exports = app;