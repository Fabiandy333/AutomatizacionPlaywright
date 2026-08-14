const {
  randomUUID,
} = require('crypto');

const {
  agendarCitaPasaporte,
} = require('../automations/agendar_cita_pasaporte');

const executionsRepo =
  require('../../../shared/database/executionsRepository');

const pendingSignals =
  require('../../../shared/queue/pendingSignals');

const {
  obtenerLog,
} = require('../../../shared/logger/logger');

const pasaportesQueue =
  require('../queue/pasaportesQueue');

const REQUIRED_USER_FIELDS = [
  'tipoDocumento',
  'numberDocument',
  'dateOfBirth',
  'name',
  'tipoSolicitud',
  'numberPhone',
  'address',
  'email',
  'paymentDate',
];

function validateUser(usuario) {

  if (
    !usuario ||
    Array.isArray(usuario) ||
    typeof usuario !== 'object'
  ) {
    throw new Error(
      'El cuerpo debe ser un usuario válido.'
    );
  }

  const missingFields =
    REQUIRED_USER_FIELDS.filter(
      (field) =>
        !String(
          usuario[field] || ''
        ).trim()
    );

  if (missingFields.length) {
    throw new Error(
      `Faltan campos requeridos: ${missingFields.join(', ')}`
    );
  }

  if (
    !/^\S+@\S+\.\S+$/.test(
      usuario.email
    )
  ) {
    throw new Error(
      'El correo electrónico no es válido.'
    );
  }
}

/**
 * Encola una ejecución.
 */
function enqueueExecution(
  usuario,
  executionId
) {

  return pasaportesQueue.encolar({
    executionId,
    usuario,

    ejecutar: async () => {

      await agendarCitaPasaporte(
        usuario,
        executionId
      );
    },
  });
}

/**
 * Inicia un agendamiento individual.
 */
function iniciarAgendamiento(
  usuario
) {

  validateUser(usuario);

  const executionId =
    randomUUID();

  executionsRepo.crear({
    id: executionId,
    proyecto: 'pasaportes',
    caso: 'agendar_cita',
    usuario,
  });

  const posicion =
    enqueueExecution(
      usuario,
      executionId
    );

  return {
    executionId,
    email: usuario.email,
    posicion: posicion.posicion,
    total: posicion.total,
    estado: 'en_cola',
  };
}

/**
 * Inicia un lote.
 *
 * IMPORTANTE:
 *
 * Todos los usuarios se crean inmediatamente,
 * pero solamente UNO será procesado a la vez.
 */
function iniciarLote(
  usuarios
) {

  if (
    !Array.isArray(usuarios) ||
    usuarios.length === 0
  ) {
    throw new Error(
      'El lote debe contener al menos un usuario.'
    );
  }

  if (usuarios.length > 20) {
    throw new Error(
      'El lote no puede superar 20 usuarios.'
    );
  }

  usuarios.forEach(
    validateUser
  );

  const ejecuciones =
    usuarios.map(
      (usuario) => {

        const executionId =
          randomUUID();

        executionsRepo.crear({
          id: executionId,
          proyecto: 'pasaportes',
          caso: 'agendar_cita',
          usuario,
        });

        return {
          executionId,
          usuario,
        };
      }
    );

  const resultados =
    ejecuciones.map(
      ({
        executionId,
        usuario,
      }) => {

        const posicion =
          enqueueExecution(
            usuario,
            executionId
          );

        return {
          executionId,
          name: usuario.name,
          email: usuario.email,
          posicion:
            posicion.posicion,
          total:
            posicion.total,
          estado: 'en_cola',
        };
      }
    );

  return resultados;
}

/**
 * Recibe el OTP enviado por el frontend.
 */
function recibirCodigoOtp(
  executionId,
  codigo
) {

  if (!codigo) {
    throw new Error(
      'El código OTP es obligatorio.'
    );
  }

  if (
    !executionsRepo.obtener(
      executionId
    )
  ) {
    throw new Error(
      'executionId no existe.'
    );
  }

  const entregado =
    pendingSignals.resolveSignal(
      `${executionId}:otp`,
      codigo
    );

  if (!entregado) {
    throw new Error(
      'Esta ejecución no está esperando un código OTP en este momento.'
    );
  }

  return {
    ok: true,
  };
}

/**
 * Mantiene compatibilidad con el endpoint existente.
 *
 * Actualmente el RecaptchaHandler detecta que el reto
 * desapareció directamente en Playwright, pero conservamos
 * este endpoint por compatibilidad con el frontend/panel.
 */
function confirmarRecaptchaResuelto(
  executionId,
  paso
) {

  if (
    !executionsRepo.obtener(
      executionId
    )
  ) {
    throw new Error(
      'executionId no existe.'
    );
  }

  const entregado =
    pendingSignals.resolveSignal(
      `${executionId}:recaptcha_${paso}`,
      true
    );

  if (!entregado) {
    /*
     * No fallamos si el flujo actual está manejando
     * el reto directamente desde Playwright.
     */
    return {
      ok: true,
      mensaje:
        'El reCAPTCHA está siendo controlado directamente por la ventana del navegador.',
    };
  }

  return {
    ok: true,
  };
}

/**
 * Devuelve estado completo de una ejecución.
 */
function obtenerEstado(
  executionId
) {

  const registro =
    executionsRepo.obtener(
      executionId
    );

  if (!registro) {
    throw new Error(
      'executionId no existe.'
    );
  }

  const estadoCola =
    pasaportesQueue.obtenerEstado(
      executionId
    );

  return {
    id: registro.id,

    proyecto:
      registro.proyecto,

    caso:
      registro.caso,

    estado:
      registro.estado,

    posicionCola:
      estadoCola.posicion ??
      registro.posicionCola,

    totalCola:
      estadoCola.total ??
      registro.totalCola,

    ejecutando:
      estadoCola.ejecutando,

    esperaRestanteMs:
      registro.esperaRestanteMs || 0,

    comprobanteUrl:
      registro.comprobanteUrl,

    error:
      registro.error,

    creadoEn:
      registro.creadoEn,

    actualizadoEn:
      registro.actualizadoEn,

    iniciadoEn:
      registro.iniciadoEn,

    finalizadoEn:
      registro.finalizadoEn,
  };
}

/**
 * Obtiene logs de una ejecución.
 */
function obtenerLogDeEjecucion(
  executionId
) {

  if (
    !executionsRepo.obtener(
      executionId
    )
  ) {
    throw new Error(
      'executionId no existe.'
    );
  }

  return obtenerLog(
    executionId
  );
}

/**
 * Resumen general de la cola.
 */
function obtenerCola() {
  return pasaportesQueue
    .obtenerResumen();
}

module.exports = {
  iniciarAgendamiento,
  iniciarLote,
  recibirCodigoOtp,
  confirmarRecaptchaResuelto,
  obtenerEstado,
  obtenerLogDeEjecucion,
  obtenerCola,
};