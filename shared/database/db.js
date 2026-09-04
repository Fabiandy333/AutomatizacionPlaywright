require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT || '5432', 10),
  database: process.env.PGDATABASE || 'AutomationQA',
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'postgres',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[PostgreSQL] Error inesperado en el pool:', err.message);
});

/**
 * Ejecuta una consulta SQL con parámetros.
 */
async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    return res;
  } catch (err) {
    console.error('[PostgreSQL] Error en query:', { text, error: err.message });
    throw err;
  }
}

/**
 * Obtiene un cliente dedicado del pool (para transacciones).
 */
async function getClient() {
  return pool.connect();
}

/**
 * Verifica la conectividad con la base de datos.
 */
async function testConnection() {
  try {
    const res = await pool.query('SELECT NOW() as now, current_database() as db');
    return { ok: true, now: res.rows[0].now, db: res.rows[0].db };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = {
  pool,
  query,
  getClient,
  testConnection,
};
