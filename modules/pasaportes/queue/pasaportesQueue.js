const executionsRepo = require("../../../shared/database/executionsRepository");

const MIN_INTERVAL_MS = Number(
  process.env.PASAPORTES_MIN_INTERVAL_MS || 300000,
);

// 300000 ms = 5 minutos

const cola = [];

let ejecutando = false;
let ultimoFinalizadoEn = null;
let ejecucionActual = null;

/**
 * Espera una cantidad determinada de milisegundos.
 */
function esperar(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Calcula el tiempo aproximado que falta
 * para que una ejecución pueda comenzar.
 *
 * Se calcula tomando como referencia:
 *
 * - La ejecución que está actualmente en curso.
 * - Las ejecuciones que están delante en la cola.
 * - El intervalo mínimo entre ejecuciones.
 */
function calcularEstimacion(index = 0) {
  const ejecucionesDelante = index + (ejecutando ? 1 : 0);

  if (ejecucionesDelante <= 0) {
    return {
      estimacionMs: 0,
      estimacionTexto: "Disponible para ejecutar",
    };
  }

  /*
   * Cada ejecución necesita como mínimo
   * una ventana de MIN_INTERVAL_MS.
   */
  let estimacionMs = ejecucionesDelante * MIN_INTERVAL_MS;

  /*
   * Si no hay una ejecución activa pero existe
   * una ejecución anterior, descontamos el tiempo
   * que ya ha transcurrido desde ella.
   */
  if (!ejecutando && ultimoFinalizadoEn) {
    const transcurrido = Date.now() - ultimoFinalizadoEn;

    estimacionMs = Math.max(0, estimacionMs - transcurrido);
  }

  return {
    estimacionMs,
    estimacionTexto: formatearTiempo(estimacionMs),
  };
}

/**
 * Formatea milisegundos para mostrar
 * una estimación amigable.
 */
function formatearTiempo(ms) {
  if (!ms || ms <= 0) {
    return "Disponible próximamente";
  }

  const totalSeconds = Math.ceil(ms / 1000);

  const minutes = Math.floor(totalSeconds / 60);

  const seconds = totalSeconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${String(seconds).padStart(2, "0")}s aprox.`;
  }

  return `${seconds}s aprox.`;
}

/**
 * Actualiza la posición de todos los elementos
 * que siguen en cola.
 */
function actualizarPosiciones() {
  const total = cola.length;

  cola.forEach((item, index) => {
    const posicion = index + 1;

    const estimacion = calcularEstimacion(index);

    executionsRepo.actualizar(item.executionId, {
      estado: "en_cola",
      posicionCola: posicion,
      totalCola: total,
      esperaRestanteMs: 0,
      estimacionMs: estimacion.estimacionMs,
      estimacionTexto: estimacion.estimacionTexto,
    });
  });
}

/**
 * Devuelve información de la cola para
 * una ejecución específica.
 */
function obtenerEstado(executionId) {
  /*
   * Ejecución actualmente ocupando el turno.
   */
  if (ejecucionActual && ejecucionActual.executionId === executionId) {
    return {
      enCola: false,
      posicion: 0,
      total: cola.length,
      ejecutando: true,
      estadoActual: ejecucionActual.estadoActual,
      esperaMinimaMs: MIN_INTERVAL_MS,
      esperaRestanteMs: ejecucionActual.esperaRestanteMs || 0,
      estimacionMs: 0,
      estimacionTexto: "Ejecutando ahora",
    };
  }

  /*
   * Ejecución esperando en la cola.
   */
  const index = cola.findIndex((item) => item.executionId === executionId);

  if (index === -1) {
    return {
      enCola: false,
      posicion: null,
      total: cola.length,
      ejecutando,
      estadoActual: null,
      esperaMinimaMs: MIN_INTERVAL_MS,
      esperaRestanteMs: 0,
      estimacionMs: 0,
      estimacionTexto: null,
    };
  }

  const estimacion = calcularEstimacion(index);

  return {
    enCola: true,
    posicion: index + 1,
    total: cola.length,
    ejecutando,
    estadoActual: "en_cola",
    esperaMinimaMs: MIN_INTERVAL_MS,
    esperaRestanteMs: 0,
    estimacionMs: estimacion.estimacionMs,
    estimacionTexto: estimacion.estimacionTexto,
  };
}

/**
 * Agrega una ejecución a la cola.
 */
function encolar({ executionId, usuario, ejecutar }) {
  if (!executionId) {
    throw new Error("executionId es obligatorio para encolar una ejecución.");
  }

  if (typeof ejecutar !== "function") {
    throw new Error("La función ejecutar es obligatoria.");
  }

  const item = {
    executionId,
    usuario,
    ejecutar,
    encoladoEn: Date.now(),
  };

  cola.push(item);

  actualizarPosiciones();

  /*
   * El procesamiento comienza inmediatamente
   * si no existe otra ejecución.
   */
  procesarSiguiente();

  const estado = obtenerEstado(executionId);

  return {
    executionId,
    posicion: estado.posicion ?? 0,
    total: estado.total ?? cola.length,
    estado: estado.estadoActual || "en_cola",
    esperaRestanteMs: estado.esperaRestanteMs || 0,
    estimacionMs: estado.estimacionMs || 0,
    estimacionTexto: estado.estimacionTexto || null,
  };
}

/**
 * Procesa la cola de forma estrictamente secuencial.
 */
async function procesarSiguiente() {
  if (ejecutando) {
    return;
  }

  const item = cola.shift();

  if (!item) {
    return;
  }

  ejecutando = true;

  ejecucionActual = {
    executionId: item.executionId,
    estadoActual: "esperando_ventana",
    esperaRestanteMs: 0,
  };

  actualizarPosiciones();

  const { executionId, ejecutar } = item;

  try {
    /*
     * Si ya hubo una ejecución anterior,
     * respetamos el intervalo mínimo.
     */
    if (ultimoFinalizadoEn) {
      const transcurrido = Date.now() - ultimoFinalizadoEn;

      const tiempoRestante = MIN_INTERVAL_MS - transcurrido;

      if (tiempoRestante > 0) {
        ejecucionActual.estadoActual = "esperando_ventana";

        ejecucionActual.esperaRestanteMs = tiempoRestante;

        executionsRepo.actualizar(executionId, {
          estado: "esperando_ventana",
          posicionCola: 0,
          totalCola: cola.length,
          esperaRestanteMs: tiempoRestante,
          estimacionMs: tiempoRestante,
          estimacionTexto: formatearTiempo(tiempoRestante),
        });

        await esperar(tiempoRestante);
      }
    }

    /*
     * La ventana ya está disponible.
     */
    ejecucionActual.estadoActual = "en_progreso";

    ejecucionActual.esperaRestanteMs = 0;

    executionsRepo.actualizar(executionId, {
      estado: "en_progreso",
      posicionCola: 0,
      totalCola: cola.length,
      esperaRestanteMs: 0,
      estimacionMs: 0,
      estimacionTexto: "Ejecutando ahora",
      iniciadoEn: new Date().toISOString(),
    });

    /*
     * Ejecutamos la automatización.
     */
    await ejecutar();
  } catch (error) {
    console.error(`[PasaportesQueue] Error en ${executionId}:`, error.message);

    executionsRepo.actualizar(executionId, {
      error: error.message,
    });
  } finally {
    ultimoFinalizadoEn = Date.now();

    executionsRepo.actualizar(executionId, {
      finalizadoEn: new Date().toISOString(),
    });

    ejecucionActual = null;

    ejecutando = false;

    actualizarPosiciones();

    /*
     * Permitimos que el event loop termine
     * la ejecución actual antes de continuar.
     */
    setImmediate(() => {
      procesarSiguiente();
    });
  }
}

/**
 * Obtiene información general de la cola.
 */
function obtenerResumen() {
  return {
    ejecutando,

    cantidadEnCola: cola.length,

    ultimoFinalizadoEn,

    intervaloMinimoMs: MIN_INTERVAL_MS,

    ejecucionActual: ejecucionActual
      ? {
          executionId: ejecucionActual.executionId,

          estado: ejecucionActual.estadoActual,

          esperaRestanteMs: ejecucionActual.esperaRestanteMs,
        }
      : null,

    items: cola.map((item, index) => {
      const estimacion = calcularEstimacion(index);

      return {
        executionId: item.executionId,

        posicion: index + 1,

        name: item.usuario?.name || null,

        email: item.usuario?.email || null,

        encoladoEn: item.encoladoEn,

        estimacionMs: estimacion.estimacionMs,

        estimacionTexto: estimacion.estimacionTexto,
      };
    }),
  };
}

module.exports = {
  encolar,
  obtenerEstado,
  obtenerResumen,
};
