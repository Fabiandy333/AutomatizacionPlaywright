/**
 * Repositorio de ejecuciones.
 *
 * Actualmente utiliza memoria (Map).
 * Más adelante puede reemplazarse por PostgreSQL/SQL Server/etc.
 * manteniendo la misma interfaz.
 */

const ejecuciones = new Map();

/*
executionId -> {
  id,
  proyecto,
  caso,
  usuario,
  estado,
  posicionCola,
  totalCola,
  comprobanteUrl,
  error,
  creadoEn,
  actualizadoEn,
  iniciadoEn,
  finalizadoEn
}
*/

function crear({ id, proyecto, caso, usuario }) {
  const ahora = new Date().toISOString();

  const registro = {
    id,
    proyecto,
    caso,
    usuario,

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

  ejecuciones.set(id, registro);

  return registro;
}

function actualizar(id, cambios) {
  const registro = ejecuciones.get(id);

  if (!registro) {
    return null;
  }

  Object.assign(
    registro,
    cambios,
    {
      actualizadoEn: new Date().toISOString(),
    }
  );

  return registro;
}

function obtener(id) {
  return ejecuciones.get(id) || null;
}

function eliminar(id) {
  return ejecuciones.delete(id);
}

module.exports = {
  crear,
  actualizar,
  obtener,
  eliminar,
};