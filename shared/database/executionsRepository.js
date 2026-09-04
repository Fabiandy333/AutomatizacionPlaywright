/**
 * Repositorio de ejecuciones conectado a PostgreSQL.
 * Mantiene la misma interfaz síncrona/asíncrona requerida por los servicios
 * y la cola (pasaportesQueue).
 */

const { query } = require('./db');

// Cache en memoria para lecturas ultrarrápidas del polling y SSE
const ejecucionesCache = new Map();

/**
 * Crea una nueva ejecución tanto en memoria como en PostgreSQL.
 */
async function crear({ id, proyecto, caso, usuario }) {
  const ahora = new Date().toISOString();

  const registro = {
    id,
    proyecto,
    caso,
    usuario: usuario || 'sistema',
    estado: 'pendiente',
    posicionCola: null,
    totalCola: null,
    comprobanteUrl: null,
    error: null,
    creadoEn: ahora,
    actualizadoEn: ahora,
    iniciadoEn: null,
    finalizadoEn: null,
  };

  // Guardar en cache inmediato
  ejecucionesCache.set(id, registro);

  // Persistir en PostgreSQL de forma asíncrona
  query(
    `INSERT INTO ejecuciones (id, caso_id, proyecto_id, estado, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO NOTHING`,
    [id, caso || null, proyecto || null, 'pendiente', ahora, ahora]
  ).catch((err) => {
    console.error('[PostgreSQL] Error al insertar ejecución:', err.message);
  });

  return registro;
}

/**
 * Actualiza una ejecución en memoria y en PostgreSQL.
 */
function actualizar(id, cambios) {
  let registro = ejecucionesCache.get(id);

  if (!registro) {
    registro = { id, ...cambios };
    ejecucionesCache.set(id, registro);
  } else {
    Object.assign(registro, cambios);
  }

  registro.actualizadoEn = new Date().toISOString();

  // Persistir cambios en PostgreSQL
  const updates = [];
  const params = [id];
  let paramIdx = 2;

  if (cambios.estado !== undefined) {
    updates.push(`estado = $${paramIdx++}`);
    params.push(cambios.estado);
  }
  if (cambios.posicionCola !== undefined) {
    updates.push(`posicion_cola = $${paramIdx++}`);
    params.push(cambios.posicionCola);
  }
  if (cambios.totalCola !== undefined) {
    updates.push(`total_cola = $${paramIdx++}`);
    params.push(cambios.totalCola);
  }
  if (cambios.comprobanteUrl !== undefined) {
    updates.push(`comprobante_url = $${paramIdx++}`);
    params.push(cambios.comprobanteUrl);
  }
  if (cambios.error !== undefined) {
    updates.push(`error_mensaje = $${paramIdx++}`);
    params.push(cambios.error);
  }
  if (cambios.iniciadoEn !== undefined) {
    updates.push(`iniciado_en = $${paramIdx++}`);
    params.push(cambios.iniciadoEn);
  }
  if (cambios.finalizadoEn !== undefined) {
    updates.push(`finalizado_en = $${paramIdx++}`);
    params.push(cambios.finalizadoEn);
  }

  if (updates.length > 0) {
    updates.push(`updated_at = NOW()`);
    query(
      `UPDATE ejecuciones SET ${updates.join(', ')} WHERE id = $1`,
      params
    ).catch((err) => {
      console.error(`[PostgreSQL] Error al actualizar ejecución ${id}:`, err.message);
    });
  }

  return registro;
}

/**
 * Obtiene el estado de una ejecución (primero cache, o desde PostgreSQL).
 */
function obtener(id) {
  return ejecucionesCache.get(id) || null;
}

/**
 * Elimina una ejecución.
 */
function eliminar(id) {
  ejecucionesCache.delete(id);
  query(`DELETE FROM ejecuciones WHERE id = $1`, [id]).catch((err) => {
    console.error(`[PostgreSQL] Error al eliminar ejecución ${id}:`, err.message);
  });
  return true;
}

module.exports = {
  crear,
  actualizar,
  obtener,
  eliminar,
};
