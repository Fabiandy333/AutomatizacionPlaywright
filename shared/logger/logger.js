const { EventEmitter } = require("events");

const logsPorEjecucion = new Map();

const emitterPorEjecucion = new Map();

function crearLogger(executionId) {
  if (!logsPorEjecucion.has(executionId)) {
    logsPorEjecucion.set(executionId, []);
  }

  if (!emitterPorEjecucion.has(executionId)) {
    emitterPorEjecucion.set(executionId, new EventEmitter());
  }

  function log(text, type = "info") {
    const entry = {
      time: new Date().toISOString(),

      type,

      text,
    };

    const logs = logsPorEjecucion.get(executionId);

    logs.push(entry);

    console.log(`[${executionId}] [${type.toUpperCase()}] ${text}`);

    const emitter = emitterPorEjecucion.get(executionId);

    if (emitter) {
      emitter.emit("log", entry);
    }

    return entry;
  }

  return {
    info: (text) => log(text, "info"),

    ok: (text) => log(text, "ok"),

    error: (text) => log(text, "error"),
  };
}

function obtenerLog(executionId) {
  return logsPorEjecucion.get(executionId) || [];
}

function obtenerEmitter(executionId) {
  if (!emitterPorEjecucion.has(executionId)) {
    emitterPorEjecucion.set(executionId, new EventEmitter());
  }

  return emitterPorEjecucion.get(executionId);
}

module.exports = {
  crearLogger,
  obtenerLog,
  obtenerEmitter,
};
