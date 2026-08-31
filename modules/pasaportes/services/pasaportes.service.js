const { randomUUID } = require("crypto");

const {
  agendarCitaPasaporte,
} = require("../automations/agendar_cita_pasaporte");

const executionsRepo = require("../../../shared/database/executionsRepository");

const pendingSignals = require("../../../shared/queue/pendingSignals");

const { obtenerLog } = require("../../../shared/logger/logger");

const pasaportesQueue = require("../queue/pasaportesQueue");

const REQUIRED_USER_FIELDS = [
  "tipoDocumento",
  "numberDocument",
  "dateOfBirth",
  "name",
  "tipoSolicitud",
  "numberPhone",
  "address",
  "email",
  "paymentDate",
];

/**
 * Valida los datos de un usuario.
 */
function validateUser(usuario) {
  if (!usuario || Array.isArray(usuario) || typeof usuario !== "object") {
    throw new Error("El cuerpo debe ser un usuario válido.");
  }

  const missingFields = REQUIRED_USER_FIELDS.filter(
    (field) => !String(usuario[field] || "").trim(),
  );

  if (missingFields.length) {
    throw new Error(`Faltan campos requeridos: ${missingFields.join(", ")}`);
  }

  if (!/^\S+@\S+\.\S+$/.test(usuario.email)) {
    throw new Error("El correo electrónico no es válido.");
  }
}

/**
 * Encola una ejecución.
 */
function enqueueExecution(usuario, executionId) {
  return pasaportesQueue.encolar({
    executionId,
    usuario,

    ejecutar: async () => {
      await agendarCitaPasaporte(usuario, executionId);
    },
  });
}

/**
 * Inicia un agendamiento individual.
 */
function iniciarAgendamiento(usuario) {
  validateUser(usuario);

  const executionId = randomUUID();

  executionsRepo.crear({
    id: executionId,
    proyecto: "pasaportes",
    caso: "agendar_cita",
    usuario,
  });

  const posicion = enqueueExecution(usuario, executionId);

  /*
   * Consultamos nuevamente porque la ejecución
   * puede haber comenzado inmediatamente.
   */
  const estado = pasaportesQueue.obtenerEstado(executionId);

  return {
    executionId,

    email: usuario.email,

    posicion: estado.posicion ?? posicion.posicion ?? 0,

    total: estado.total ?? posicion.total ?? 1,

    estado: estado.estadoActual || posicion.estado || "en_cola",

    esperaRestanteMs: estado.esperaRestanteMs ?? posicion.esperaRestanteMs ?? 0,

    estimacionMs: estado.estimacionMs ?? posicion.estimacionMs ?? 0,

    estimacionTexto: estado.estimacionTexto ?? posicion.estimacionTexto ?? null,
  };
}

/**
 * Inicia un lote.
 *
 * Todos los usuarios se crean inmediatamente,
 * pero solamente UNO será procesado a la vez.
 */
function iniciarLote(usuarios) {
  if (!Array.isArray(usuarios) || usuarios.length === 0) {
    throw new Error("El lote debe contener al menos un usuario.");
  }

  if (usuarios.length > 20) {
    throw new Error("El lote no puede superar 20 usuarios.");
  }

  usuarios.forEach(validateUser);

  const ejecuciones = usuarios.map((usuario) => {
    const executionId = randomUUID();

    executionsRepo.crear({
      id: executionId,
      proyecto: "pasaportes",
      caso: "agendar_cita",
      usuario,
    });

    return {
      executionId,
      usuario,
    };
  });

  const resultados = ejecuciones.map(({ executionId, usuario }) => {
    const posicion = enqueueExecution(usuario, executionId);

    const estado = pasaportesQueue.obtenerEstado(executionId);

    return {
      executionId,

      name: usuario.name,

      email: usuario.email,

      posicion: estado.posicion ?? posicion.posicion ?? 0,

      total: estado.total ?? posicion.total ?? usuarios.length,

      estado: estado.estadoActual || posicion.estado || "en_cola",

      esperaRestanteMs:
        estado.esperaRestanteMs ?? posicion.esperaRestanteMs ?? 0,

      estimacionMs: estado.estimacionMs ?? posicion.estimacionMs ?? 0,

      estimacionTexto:
        estado.estimacionTexto ?? posicion.estimacionTexto ?? null,
    };
  });

  return resultados;
}

/**
 * Recibe el OTP enviado por el frontend.
 */
function recibirCodigoOtp(executionId, codigo) {
  if (!codigo) {
    throw new Error("El código OTP es obligatorio.");
  }

  const registro = executionsRepo.obtener(executionId);

  if (!registro) {
    throw new Error("executionId no existe.");
  }

  const key = `${executionId}:otp`;

  const esperaActiva = pendingSignals.isWaiting(key);

  console.log(
    `[OTP-DEBUG] recibirCodigoOtp id=${executionId} estado=${registro.estado} esperandoSeñal=${esperaActiva}`,
  );

  const entregado = pendingSignals.resolveSignal(key, codigo);

  if (!entregado) {
    throw new Error(
      `Esta ejecución no está esperando un código OTP en este momento. (estado=${registro.estado}, esperandoSeñal=${esperaActiva})`,
    );
  }

  /*
   * La señal ya fue consumida. Volvemos el
   * estado del repositorio a en_progreso para
   * que el frontend deje de ver "esperando_otp"
   * y no vuelva a abrir el modal ni reenvíe OTP.
   */
  executionsRepo.actualizar(executionId, {
    estado: "en_progreso",
  });

  return {
    ok: true,
  };
}

/**
 * Confirmación manual de reCAPTCHA.
 */
function confirmarRecaptchaResuelto(executionId, paso) {
  if (!executionsRepo.obtener(executionId)) {
    throw new Error("executionId no existe.");
  }

  const entregado = pendingSignals.resolveSignal(
    `${executionId}:recaptcha_${paso}`,
    true,
  );

  if (!entregado) {
    return {
      ok: true,

      mensaje:
        "El reCAPTCHA está siendo controlado directamente por la ventana del navegador.",
    };
  }

  return {
    ok: true,
  };
}

/**
 * Devuelve estado completo
 * de una ejecución.
 */
function obtenerEstado(executionId) {
  const registro = executionsRepo.obtener(executionId);

  if (!registro) {
    throw new Error("executionId no existe.");
  }

  const estadoCola = pasaportesQueue.obtenerEstado(executionId);

  /*
   * Estado que requiere una acción humana y
   * que la cola no refleja en ejecucionActual.
   *
   * Tienen prioridad sobre el estado genérico
   * de la cola ("en_progreso").
   */
  const ESTADOS_HUMANOS = ["esperando_otp", "esperando_recaptcha"];

  const estadoEspecial = ESTADOS_HUMANOS.includes(registro.estado)
    ? registro.estado
    : null;

  const estado =
    estadoEspecial ||
    estadoCola.estadoActual ||
    registro.estado ||
    "desconocido";

  return {
    id: registro.id,

    proyecto: registro.proyecto,

    caso: registro.caso,

    estado,

    posicionCola: estadoCola.posicion ?? registro.posicionCola ?? null,

    totalCola: estadoCola.total ?? registro.totalCola ?? null,

    enCola: estadoCola.enCola ?? false,

    ejecutando: estadoCola.ejecutando ?? false,

    esperaRestanteMs:
      estadoCola.esperaRestanteMs ?? registro.esperaRestanteMs ?? 0,

    esperaMinimaMs: estadoCola.esperaMinimaMs ?? 0,

    estimacionMs: estadoCola.estimacionMs ?? registro.estimacionMs ?? 0,

    estimacionTexto:
      estadoCola.estimacionTexto ?? registro.estimacionTexto ?? null,

    comprobanteUrl: registro.comprobanteUrl,

    error: registro.error,

    creadoEn: registro.creadoEn,

    actualizadoEn: registro.actualizadoEn,

    iniciadoEn: registro.iniciadoEn,

    finalizadoEn: registro.finalizadoEn,
  };
}

/**
 * Obtiene logs de una ejecución.
 */
function obtenerLogDeEjecucion(executionId) {
  if (!executionsRepo.obtener(executionId)) {
    throw new Error("executionId no existe.");
  }

  return obtenerLog(executionId);
}

/**
 * Resumen general de la cola.
 */
function obtenerCola() {
  return pasaportesQueue.obtenerResumen();
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
