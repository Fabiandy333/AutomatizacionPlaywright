/**
 * pendingSignals: reemplazo de `page.pause()` para un backend real.
 *
 * Cada automatizacion, al llegar a un punto donde necesita informacion
 * que solo el usuario puede dar (ej. el codigo OTP que llega a su correo),
 * llama a `waitFor(key)` y el codigo se queda "congelado" en un `await`
 * hasta que otra parte del backend (la ruta que recibe el POST del
 * frontend) llama a `resolve(key, valor)`.
 *
 * key sugerida: `${executionId}:otp`, `${executionId}:recaptcha`, etc.
 * asi un mismo executionId puede tener varias señales distintas.
 */

const pendientes = new Map(); // key -> { resolve, reject, timeoutHandle }

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutos por defecto

function waitFor(key, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (pendientes.has(key)) {
    throw new Error(`Ya existe una señal pendiente para "${key}"`);
  }

  return new Promise((resolve, reject) => {
    const timeoutHandle = setTimeout(() => {
      pendientes.delete(key);
      reject(new Error(`Tiempo de espera agotado para "${key}" (${timeoutMs}ms)`));
    }, timeoutMs);

    pendientes.set(key, { resolve, reject, timeoutHandle });
  });
}

function resolveSignal(key, value) {
  const pendiente = pendientes.get(key);
  if (!pendiente) {
    return false; // no habia nadie esperando esta señal (ya expiro o no existe)
  }
  clearTimeout(pendiente.timeoutHandle);
  pendientes.delete(key);
  pendiente.resolve(value);
  return true;
}

function rejectSignal(key, error) {
  const pendiente = pendientes.get(key);
  if (!pendiente) return false;
  clearTimeout(pendiente.timeoutHandle);
  pendientes.delete(key);
  pendiente.reject(error instanceof Error ? error : new Error(error));
  return true;
}

function isWaiting(key) {
  return pendientes.has(key);
}

module.exports = { waitFor, resolveSignal, rejectSignal, isWaiting };
