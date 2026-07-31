const DEFAULT_ORIGINS = [
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://10.102.1.3:5500'
]

function allowedOrigins() {
  return (process.env.CORS_ORIGINS || DEFAULT_ORIGINS.join(','))
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
}

function isAllowedOrigin(origin) {
  return !origin || allowedOrigins().includes(origin)
}

function extractToken(request) {
  const authorization = request.get?.('authorization') || request.headers?.authorization || ''
  return request.get?.('x-api-key') || request.headers?.['x-api-key'] || request.query?.token || authorization.replace(/^Bearer\s+/i, '')
}

function requireApiToken(request, response, next) {
  const expectedToken = process.env.API_AUTH_TOKEN
  if (!expectedToken) {
    return response.status(503).json({ error: 'API_AUTH_TOKEN no está configurado' })
  }
  if (extractToken(request) !== expectedToken) {
    return response.status(401).json({ error: 'No autorizado' })
  }
  next()
}

module.exports = { allowedOrigins, isAllowedOrigin, extractToken, requireApiToken }
