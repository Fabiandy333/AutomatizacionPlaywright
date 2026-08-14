const executionsRepo = require('../../../shared/database/executionsRepository');

const MIN_INTERVAL_MS = Number(
  process.env.PASAPORTES_MIN_INTERVAL_MS || 300000
);

// 300000 ms = 5 minutos

const cola = [];

let ejecutando = false;
let ultimoFinalizadoEn = null;

/**
 * Espera una cantidad determinada de milisegundos.
 */
function esperar(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Actualiza la posición de todos los elementos que siguen en cola.
 */
function actualizarPosiciones() {
  const total = cola.length;

  cola.forEach((item, index) => {
    const posicion = index + 1;

    executionsRepo.actualizar(
      item.executionId,
      {
        estado: 'en_cola',
        posicionCola: posicion,
        totalCola: total,
      }
    );
  });
}

/**
 * Devuelve información de la cola.
 */
function obtenerEstado(executionId) {
  const index = cola.findIndex(
    (item) => item.executionId === executionId
  );

  if (index === -1) {
    return {
      enCola: false,
      posicion: null,
      total: cola.length,
      ejecutando,
    };
  }

  return {
    enCola: true,
    posicion: index + 1,
    total: cola.length,
    ejecutando,
    esperaMinimaMs: MIN_INTERVAL_MS,
  };
}

/**
 * Agrega una ejecución a la cola.
 */
function encolar({
  executionId,
  usuario,
  ejecutar,
}) {
  if (!executionId) {
    throw new Error(
      'executionId es obligatorio para encolar una ejecución.'
    );
  }

  if (typeof ejecutar !== 'function') {
    throw new Error(
      'La función ejecutar es obligatoria.'
    );
  }

  const item = {
    executionId,
    usuario,
    ejecutar,
    encoladoEn: Date.now(),
  };

  cola.push(item);

  actualizarPosiciones();

  procesarSiguiente();

  return {
    executionId,
    posicion: cola.length,
    total: cola.length,
  };
}

/**
 * Procesa la cola de forma estrictamente secuencial.
 *
 * IMPORTANTE:
 *
 * Nunca se ejecutan dos automatizaciones simultáneamente.
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

  actualizarPosiciones();

  const {
    executionId,
    ejecutar,
  } = item;

  try {
    /*
     * Si ya hubo una ejecución anterior, esperamos el intervalo
     * configurado antes de abrir el siguiente navegador.
     */
    if (ultimoFinalizadoEn) {
      const transcurrido =
        Date.now() - ultimoFinalizadoEn;

      const tiempoRestante =
        MIN_INTERVAL_MS - transcurrido;

      if (tiempoRestante > 0) {
        executionsRepo.actualizar(
          executionId,
          {
            estado: 'esperando_ventana',
            posicionCola: 0,
            totalCola: cola.length,
            esperaRestanteMs: tiempoRestante,
          }
        );

        await esperar(tiempoRestante);
      }
    }

    executionsRepo.actualizar(
      executionId,
      {
        estado: 'en_progreso',
        posicionCola: 0,
        totalCola: cola.length,
        esperaRestanteMs: 0,
        iniciadoEn: new Date().toISOString(),
      }
    );

    await ejecutar();

  } catch (error) {

    /*
     * El error real ya es manejado normalmente por
     * agendar_cita_pasaporte.js.
     *
     * Aquí evitamos que un error detenga toda la cola.
     */
    console.error(
      `[PasaportesQueue] Error en ${executionId}:`,
      error.message
    );

  } finally {

    ultimoFinalizadoEn = Date.now();

    executionsRepo.actualizar(
      executionId,
      {
        finalizadoEn: new Date().toISOString(),
      }
    );

    ejecutando = false;

    actualizarPosiciones();

    /*
     * Procesamos el siguiente elemento.
     *
     * Se usa setImmediate para evitar una cadena profunda
     * de llamadas síncronas.
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
    items: cola.map((item, index) => ({
      executionId: item.executionId,
      posicion: index + 1,
      name: item.usuario?.name || null,
      email: item.usuario?.email || null,
      encoladoEn: item.encoladoEn,
    })),
  };
}

module.exports = {
  encolar,
  obtenerEstado,
  obtenerResumen,
};