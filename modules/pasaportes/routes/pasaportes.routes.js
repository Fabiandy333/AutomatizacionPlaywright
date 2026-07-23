const { Router } = require('express');
const pasaportesService = require('../services/pasaportes.service');

const router = Router();

// Inicia el agendamiento. Body: un objeto usuario, O un arreglo de
// usuarios (el mismo formato que ya venias enviando: numberDocument,
// name, numberPhone, address, email, paymentDate, isCompanion, etc.)
router.post('/agendar', (req, res) => {
  try {
    if (Array.isArray(req.body)) {
      const ejecuciones = pasaportesService.iniciarLote(req.body);
      return res.status(202).json({ ejecuciones });
    }
    const { executionId } = pasaportesService.iniciarAgendamiento(req.body);
    res.status(202).json({ executionId, estado: 'pendiente' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// El frontend llama esto en cuanto el usuario digita el codigo que le
// llego al correo. Body: { "codigo": "123456" }
router.post('/:executionId/otp', (req, res) => {
  try {
    const resultado = pasaportesService.recibirCodigoOtp(req.params.executionId, req.body.codigo);
    res.json(resultado);
  } catch (error) {
    res.status(409).json({ error: error.message });
  }
});

// OJO: pensado para un panel interno de operador que esta viendo la
// ventana del navegador — no para el frontend publico. paso es 1 o 2
// (el flujo tiene dos puntos donde puede aparecer el reCAPTCHA).
router.post('/:executionId/recaptcha-resuelto/:paso', (req, res) => {
  try {
    const resultado = pasaportesService.confirmarRecaptchaResuelto(req.params.executionId, req.params.paso);
    res.json(resultado);
  } catch (error) {
    res.status(409).json({ error: error.message });
  }
});

router.get('/:executionId/estado', (req, res) => {
  try {
    res.json(pasaportesService.obtenerEstado(req.params.executionId));
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

router.get('/:executionId/log', (req, res) => {
  res.json(pasaportesService.obtenerLogDeEjecucion(req.params.executionId));
});

module.exports = router;
