const { Router } = require("express");

const pasaportesService = require("../services/pasaportes.service");

const { obtenerLog, obtenerEmitter } = require("../../../shared/logger/logger");

const router = Router();

/**
 * Inicia un agendamiento.
 *
 * Body individual:
 *
 * {
 *   tipoDocumento,
 *   numberDocument,
 *   dateOfBirth,
 *   name,
 *   tipoSolicitud,
 *   numberPhone,
 *   address,
 *   email,
 *   paymentDate
 * }
 *
 * También acepta un arreglo de usuarios.
 */
router.post("/agendar", (req, res) => {
  try {
    if (Array.isArray(req.body)) {
      const ejecuciones = pasaportesService.iniciarLote(req.body);

      return res.status(202).json({
        ejecuciones,
      });
    }

    const resultado = pasaportesService.iniciarAgendamiento(req.body);

    return res.status(202).json(resultado);
  } catch (error) {
    return res.status(400).json({
      error: error.message,
    });
  }
});

/**
 * Obtiene el resumen general de la cola.
 */
router.get("/cola", (req, res) => {
  try {
    return res.json(pasaportesService.obtenerCola());
  } catch (error) {
    return res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * Obtiene el estado de una ejecución.
 */
router.get("/:executionId/estado", (req, res) => {
  try {
    const resultado = pasaportesService.obtenerEstado(req.params.executionId);

    return res.json(resultado);
  } catch (error) {
    return res.status(404).json({
      error: error.message,
    });
  }
});

/**
 * Recibe OTP.
 */
router.post("/:executionId/otp", (req, res) => {
  try {
    const resultado = pasaportesService.recibirCodigoOtp(
      req.params.executionId,
      req.body.codigo,
    );

    return res.json(resultado);
  } catch (error) {
    return res.status(409).json({
      error: error.message,
    });
  }
});

/**
 * Confirmación manual de reCAPTCHA.
 */
router.post("/:executionId/recaptcha-resuelto/:paso", (req, res) => {
  try {
    const resultado = pasaportesService.confirmarRecaptchaResuelto(
      req.params.executionId,
      req.params.paso,
    );

    return res.json(resultado);
  } catch (error) {
    return res.status(409).json({
      error: error.message,
    });
  }
});

/**
 * Logs completos.
 */
router.get("/:executionId/log", (req, res) => {
  try {
    const logs = pasaportesService.obtenerLogDeEjecucion(
      req.params.executionId,
    );

    return res.json(logs);
  } catch (error) {
    return res.status(404).json({
      error: error.message,
    });
  }
});

/**
 * SSE de logs en tiempo real.
 */
router.get("/:executionId/logs", (req, res) => {
  const executionId = req.params.executionId;

  try {
    pasaportesService.obtenerEstado(executionId);
  } catch (error) {
    return res.status(404).json({
      error: error.message,
    });
  }

  res.setHeader("Content-Type", "text/event-stream");

  res.setHeader("Cache-Control", "no-cache");

  res.setHeader("Connection", "keep-alive");

  res.setHeader("Access-Control-Allow-Origin", "*");

  /*
   * Histórico.
   */
  const logsHistoricos = obtenerLog(executionId);

  logsHistoricos.forEach((entry) => {
    res.write(`data: ${JSON.stringify(entry)}\n\n`);
  });

  const emitter = obtenerEmitter(executionId);

  const onLog = (entry) => {
    res.write(`data: ${JSON.stringify(entry)}\n\n`);
  };

  emitter.on("log", onLog);

  req.on("close", () => {
    emitter.removeListener("log", onLog);

    res.end();
  });
});

module.exports = router;
