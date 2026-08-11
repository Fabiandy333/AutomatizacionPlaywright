const { randomUUID } = require('crypto');

const {
  ejecutarSistemaOrigen,
} = require('../automations/sistema_origen');

const executionsRepo = require('../../../shared/database/executionsRepository');
const { obtenerLog } = require('../../../shared/logger/logger');

let executionQueue = Promise.resolve();

// ============================================================
// VALIDACIÓN
// ============================================================

function validarConfiguracion(configuracion) {
  if (
    configuracion !== undefined &&
    configuracion !== null &&
    typeof configuracion !== 'object'
  ) {
    throw new Error(
      'La configuración debe ser un objeto válido.'
    );
  }

  if (
    configuracion?.registro &&
    typeof configuracion.registro !== 'object'
  ) {
    throw new Error(
      'El objeto registro debe ser válido.'
    );
  }
}

// ============================================================
// COLA
// ============================================================

function enqueueExecution(
  configuracion,
  executionId
) {
  executionQueue =
    executionQueue
      .catch(() => {})
      .then(() =>
        ejecutarSistemaOrigen(
          configuracion,
          executionId
        )
      )
      .catch(() => {});
}

// ============================================================
// INICIAR EJECUCIÓN
// ============================================================

function iniciarSistemaOrigen(
  configuracion = {}
) {
  validarConfiguracion(
    configuracion
  );

  const executionId =
    randomUUID();

  executionsRepo.crear({
    id: executionId,
    proyecto: 'sms',
    caso: 'sistema_origen',
    usuario: configuracion,
  });

  enqueueExecution(
    configuracion,
    executionId
  );

  return {
    executionId,
    estado: 'pendiente',
  };
}

// ============================================================
// ESTADO
// ============================================================

function obtenerEstado(
  executionId
) {
  const registro =
    executionsRepo.obtener(
      executionId
    );

  if (!registro) {
    throw new Error(
      'executionId no existe'
    );
  }

  return {
    id: registro.id,
    proyecto: registro.proyecto,
    caso: registro.caso,
    estado: registro.estado,
    resultado: registro.resultado,
    error: registro.error,
    creadoEn: registro.creadoEn,
    actualizadoEn: registro.actualizadoEn,
  };
}

// ============================================================
// LOG
// ============================================================

function obtenerLogDeEjecucion(
  executionId
) {
  return obtenerLog(
    executionId
  );
}

module.exports = {
  iniciarSistemaOrigen,
  obtenerEstado,
  obtenerLogDeEjecucion,
};