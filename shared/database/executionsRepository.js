/**
 * Repositorio de ejecuciones. Implementacion en memoria para arrancar
 * rapido; en produccion cambia el Map por tu ORM/driver de base de datos
 * (misma interfaz: crear, actualizarEstado, obtener).
 */

const ejecuciones = new Map();
// executionId -> { id, proyecto, caso, estado, usuario, comprobanteUrl, creadoEn, actualizadoEn }

function crear({ id, proyecto, caso, usuario }) {
  const registro = {
    id,
    proyecto,
    caso,
    usuario,
    estado: 'pendiente', // pendiente | esperando_otp | esperando_recaptcha | en_progreso | exitoso | fallido
    comprobanteUrl: null,
    error: null,
    creadoEn: new Date().toISOString(),
    actualizadoEn: new Date().toISOString(),
  };
  ejecuciones.set(id, registro);
  return registro;
}

function actualizar(id, cambios) {
  const registro = ejecuciones.get(id);
  if (!registro) return null;
  Object.assign(registro, cambios, { actualizadoEn: new Date().toISOString() });
  return registro;
}

function obtener(id) {
  return ejecuciones.get(id) || null;
}

module.exports = { crear, actualizar, obtener };
