const { randomUUID } = require('crypto');
const { agendarCitaPasaporte } = require('../automations/agendar_cita_pasaporte');
const executionsRepo = require('../../../shared/database/executionsRepository');
const pendingSignals = require('../../../shared/queue/pendingSignals');
const { obtenerLog } = require('../../../shared/logger/logger');

const REQUIRED_USER_FIELDS = ['tipoDocumento', 'numberDocument', 'dateOfBirth', 'name', 'tipoSolicitud', 'numberPhone', 'address', 'email', 'paymentDate'];
let executionQueue = Promise.resolve();

function validateUser(usuario) {
  if (!usuario || Array.isArray(usuario) || typeof usuario !== 'object') {
    throw new Error('El cuerpo debe ser un usuario válido');
  }
  const missingFields = REQUIRED_USER_FIELDS.filter((field) => !String(usuario[field] || '').trim());
  if (missingFields.length) throw new Error(`Faltan campos requeridos: ${missingFields.join(', ')}`);
  if (!/^\S+@\S+\.\S+$/.test(usuario.email)) throw new Error('El correo electrónico no es válido');
}

function enqueueExecution(usuario, executionId) {
  executionQueue = executionQueue
    .catch(() => {})
    .then(() => agendarCitaPasaporte(usuario, executionId))
    .catch(() => {});
}

/**
 * Inicia el agendamiento de UN usuario. No espera a que termine (puede
 * tardar minutos por el OTP/reCAPTCHA) — responde de inmediato con el
 * executionId para que el frontend haga polling o abra el log en vivo.
 */
function iniciarAgendamiento(usuario) {
  validateUser(usuario);
  const executionId = randomUUID();

  executionsRepo.crear({ id: executionId, proyecto: 'pasaportes', caso: 'agendar_cita', usuario });

  enqueueExecution(usuario, executionId);

  return { executionId, email: usuario.email};
}

/**
 * Inicia el agendamiento para un LOTE de usuarios (el arreglo que manda
 * el frontend). Se corren de a uno, en orden: el mismo operador que
 * resuelve el OTP y el reCAPTCHA no puede atender dos ventanas a la vez.
 * Devuelve de inmediato el executionId de cada usuario para que el
 * frontend pueda seguir el progreso de todos.
 */
function iniciarLote(usuarios) {
  if (!Array.isArray(usuarios) || usuarios.length === 0) throw new Error('El lote debe contener al menos un usuario');
  if (usuarios.length > 20) throw new Error('El lote no puede superar 20 usuarios');
  usuarios.forEach(validateUser);
  const ejecuciones = usuarios.map((usuario) => {
    const executionId = randomUUID();
    executionsRepo.crear({ id: executionId, proyecto: 'pasaportes', caso: 'agendar_cita', usuario });
    return { executionId, usuario };
  });

  ejecuciones.forEach(({ executionId, usuario }) => enqueueExecution(usuario, executionId));

  return ejecuciones.map(({ executionId, usuario }) => ({ 
    executionId, 
    name: usuario.name,
  email: usuario.email }));
}

function recibirCodigoOtp(executionId, codigo) {
  if (!executionsRepo.obtener(executionId)) throw new Error('executionId no existe');
  const entregado = pendingSignals.resolveSignal(`${executionId}:otp`, codigo);
  if (!entregado) throw new Error('Esta ejecucion no esta esperando un codigo OTP en este momento');
  return { ok: true };
}

/**
 * Confirma que el reCAPTCHA de esa ventana ya fue resuelto. paso es 1 o 2
 * (el flujo tiene dos puntos donde puede aparecer el reto). Pensado para
 * un endpoint interno/de operador que SI esta viendo esa ventana, no
 * para el frontend publico.
 */
function confirmarRecaptchaResuelto(executionId, paso) {
  if (!executionsRepo.obtener(executionId)) throw new Error('executionId no existe');
  const entregado = pendingSignals.resolveSignal(`${executionId}:recaptcha_${paso}`, true);
  if (!entregado) throw new Error(`Esta ejecucion no esta esperando confirmacion de reCAPTCHA (paso ${paso})`);
  return { ok: true };
}

function obtenerEstado(executionId) {
  const registro = executionsRepo.obtener(executionId);
  if (!registro) throw new Error('executionId no existe');
  return {
    id: registro.id,
    proyecto: registro.proyecto,
    caso: registro.caso,
    estado: registro.estado,
    comprobanteUrl: registro.comprobanteUrl,
    error: registro.error,
    creadoEn: registro.creadoEn,
    actualizadoEn: registro.actualizadoEn,
  };
}

function obtenerLogDeEjecucion(executionId) {
  return obtenerLog(executionId);
}

module.exports = {
  iniciarAgendamiento,
  iniciarLote,
  recibirCodigoOtp,
  confirmarRecaptchaResuelto,
  obtenerEstado,
  obtenerLogDeEjecucion,
};
