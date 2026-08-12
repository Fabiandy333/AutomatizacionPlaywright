const { Router } = require("express");

const smsService = require("../services/sms.service");

const { obtenerLog, obtenerEmitter } = require("../../../shared/logger/logger");

const router = Router();

// ============================================================
// INICIAR SISTEMA ORIGEN
// ============================================================

router.post("/sistema-origen", (req, res) => {
  try {
    const resultado = smsService.iniciarSistemaOrigen(req.body || {});

    return res.status(202).json(resultado);
  } catch (error) {
    return res.status(400).json({
      error: error.message,
    });
  }
});

// ============================================================
// ESTADO
// ============================================================

router.get("/:executionId/estado", (req, res) => {
  try {
    const resultado = smsService.obtenerEstado(req.params.executionId);

    res.json(resultado);
  } catch (error) {
    res.status(404).json({
      error: error.message,
    });
  }
});

// ============================================================
// LOG HISTÓRICO
// ============================================================

router.get("/:executionId/log", (req, res) => {
  try {
    smsService.obtenerEstado(req.params.executionId);

    res.json(smsService.obtenerLogDeEjecucion(req.params.executionId));
  } catch (error) {
    res.status(404).json({
      error: error.message,
    });
  }
});

// ============================================================
// SSE - LOGS EN TIEMPO REAL
// ============================================================

router.get("/:executionId/logs", (req, res) => {
  const executionId = req.params.executionId;

  try {
    smsService.obtenerEstado(executionId);
  } catch (error) {
    return res.status(404).json({
      error: error.message,
    });
  }

  res.setHeader("Content-Type", "text/event-stream");

  res.setHeader("Cache-Control", "no-cache");

  res.setHeader("Connection", "keep-alive");

  res.setHeader("Access-Control-Allow-Origin", "*");

  // --------------------------------------------------------
  // LOGS HISTÓRICOS
  // --------------------------------------------------------

  const logsHistoricos = obtenerLog(executionId);

  logsHistoricos.forEach((entry) => {
    res.write(`data: ${JSON.stringify(entry)}\n\n`);
  });

  // --------------------------------------------------------
  // LOGS NUEVOS
  // --------------------------------------------------------

  const emitter = obtenerEmitter(executionId);

  const onLog = (entry) => {
    res.write(`data: ${JSON.stringify(entry)}\n\n`);
  };

  emitter.on("log", onLog);

  // --------------------------------------------------------
  // DESCONEXIÓN
  // --------------------------------------------------------

  req.on("close", () => {
    emitter.removeListener("log", onLog);

    res.end();
  });
});

module.exports = router;
