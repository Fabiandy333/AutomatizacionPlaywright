const { randomUUID } = require('crypto');
const { agendarCitaPasaporte } = require('../automations/agendar_cita_pasaporte');
const executionsRepo = require('../../../shared/database/executionsRepository');
const pendingSignals = require('../../../shared/queue/pendingSignals');
const { obtenerLog } = require('../../../shared/logger/logger');

/**
 * Inicia el agendamiento de UN usuario. No espera a que termine (puede
 * tardar minutos por el OTP/reCAPTCHA) — responde de inmediato con el
 * executionId para que el frontend haga polling o abra el log en vivo.
 */
function iniciarAgendamiento(usuario) {
  const executionId = randomUUID();

  executionsRepo.crear({ id: executionId, proyecto: 'pasaportes', caso: 'agendar_cita', usuario });

  agendarCitaPasaporte(usuario, executionId).catch(() => {
    // el error ya quedo registrado en executionsRepo y en el log por el
    // propio orquestador; aqui solo evitamos un unhandled rejection.
  });

  return { executionId };
}

/**
 * Inicia el agendamiento para un LOTE de usuarios (el arreglo que manda
 * el frontend). Se corren de a uno, en orden: el mismo operador que
 * resuelve el OTP y el reCAPTCHA no puede atender dos ventanas a la vez.
 * Devuelve de inmediato el executionId de cada usuario para que el
 * frontend pueda seguir el progreso de todos.
 */
function iniciarLote(usuarios) {
  const ejecuciones = usuarios.map((usuario) => {
    const executionId = randomUUID();
    executionsRepo.crear({ id: executionId, proyecto: 'pasaportes', caso: 'agendar_cita', usuario });
    return { executionId, usuario };
  });

  // Encadena las ejecuciones una despues de otra (no en paralelo)
  ejecuciones.reduce(
    (cadena, { executionId, usuario }) =>
      cadena.then(() => agendarCitaPasaporte(usuario, executionId).catch(() => {})),
    Promise.resolve()
  );

  return ejecuciones.map(({ executionId, usuario }) => ({ executionId, name: usuario.name }));
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
  return registro;
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
