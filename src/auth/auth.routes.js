const { Router } = require('express');

const jwt = require('jsonwebtoken');

const { findUser, ROLES } = require('./users');

const router = Router();

function getJwtSecret() {
  if (!process.env.JWT_SECRET) {
    console.warn('[auth] JWT_SECRET no configurado; usando valor de desarrollo.');
  }

  return process.env.JWT_SECRET || 'dev-secret-no-usar-en-produccion';
}

function firmarToken(usuario) {
  return jwt.sign(
    {
      username: usuario.username,
      rol: usuario.rol,
      proyectosVisibles: usuario.proyectosVisibles,
    },
    getJwtSecret(),
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' },
  );
}

function publicarUsuario(usuario) {
  return {
    username: usuario.username,
    rol: usuario.rol,
    rolNombre: ROLES[usuario.rol]?.nombre || usuario.rol,
    permisos: ROLES[usuario.rol]?.permisos || {},
    proyectosVisibles: usuario.proyectosVisibles,
  };
}

/**
 * POST /api/auth/login
 *
 * Body: { username, password }
 */
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña son obligatorios.' });
  }

  const usuario = findUser(username);

  if (!usuario || usuario.password !== password) {
    return res.status(401).json({ error: 'Credenciales inválidas.' });
  }

  const token = firmarToken(usuario);

  return res.json({
    token,
    usuario: publicarUsuario(usuario),
  });
});

/**
 * Middleware: autentica por Bearer token.
 */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';

  const token = header.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    return res.status(401).json({ error: 'No autorizado.' });
  }

  try {
    const payload = jwt.verify(token, getJwtSecret());

    req.usuario = payload;

    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Sesión inválida o expirada.' });
  }
}

/**
 * GET /api/auth/me
 */
router.get('/me', requireAuth, (req, res) => {
  const usuario = findUser(req.usuario.username);

  if (!usuario) {
    return res.status(404).json({ error: 'Usuario no encontrado.' });
  }

  return res.json({ usuario: publicarUsuario(usuario) });
});

module.exports = router;
module.exports.requireAuth = requireAuth;
