/**
 * Logger simple por ejecucion. Guarda las lineas en memoria (para poder
 * consultarlas por HTTP mientras corre) y las imprime en consola.
 *
 * En produccion, reemplaza el array en memoria por una tabla en
 * shared/database (ej. `ejecuciones_log`) para que sobreviva un reinicio
 * del servidor y se pueda auditar despues.
 */

const logsPorEjecucion = new Map(); // executionId -> [{ time, type, text }]

function crearLogger(executionId) {
  if (!logsPorEjecucion.has(executionId)) {
    logsPorEjecucion.set(executionId, []);
  }

  function log(text, type = 'info') {
    const entry = { time: new Date().toISOString(), type, text };
    logsPorEjecucion.get(executionId).push(entry);
    console.log(`[${executionId}] [${type.toUpperCase()}] ${text}`);
    return entry;
  }

  return {
    info: (text) => log(text, 'info'),
    ok: (text) => log(text, 'ok'),
    error: (text) => log(text, 'error'),
  };
}

function obtenerLog(executionId) {
  return logsPorEjecucion.get(executionId) || [];
}

module.exports = { crearLogger, obtenerLog };
