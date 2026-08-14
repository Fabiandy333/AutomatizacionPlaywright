/**
 * Automatización de agendamiento de cita de pasaporte.
 *
 * Este archivo funciona como ORQUESTADOR.
 *
 * La interacción con cada pantalla está separada mediante POM:
 *
 * AgendamientoPage
 * DatosPersonalesPage
 * UbicacionFechaPage
 * SeleccionCitaPage
 * ConfirmacionPage
 *
 * Los componentes transversales son:
 *
 * OtpHandler
 * RecaptchaHandler
 */

const {
  lanzarNavegador,
  cerrarNavegador,
} = require("../../../shared/playwright/browser");

const executionsRepo = require("../../../shared/database/executionsRepository");
const pendingSignals = require("../../../shared/queue/pendingSignals");
const { crearLogger } = require("../../../shared/logger/logger");
const pageRegistry = require("../../../shared/streaming/pageRegistry");
const AgendamientoPage = require("./pages/AgendamientoPage");
const DatosPersonalesPage = require("./pages/DatosPersonalesPage");
const UbicacionFechaPage = require("./pages/UbicacionFechaPage");
const SeleccionCitaPage = require("./pages/SeleccionCitaPage");
const ConfirmacionPage = require("./pages/ConfirmacionPage");
const OtpHandler = require("./components/OtpHandler");
const RecaptchaHandler = require("./components/RecaptchaHandler");
const OTP_TIMEOUT_MS = 5 * 60 * 1000;
const RECAPTCHA_TIMEOUT_MS = 3 * 60 * 1000;
const AVANCE_AUTOMATICO_TIMEOUT_MS = 6000;

/**
 * Después de hacer click en "Siguiente",
 * comprueba si el formulario avanzó automáticamente.
 */
async function avanzoAutomaticamente(page, timeoutMs) {
  try {
    await page
      .getByRole("tab", {
        name: "2. Lugar, Fecha y hora",
        selected: true,
      })
      .waitFor({
        timeout: timeoutMs,
      });

    return true;
  } catch {
    return false;
  }
}

/**
 * Ejecuta el agendamiento completo para UN usuario.
 *
 * La cola es responsable de llamar esta función de uno en uno.
 */
async function agendarCitaPasaporte(usuario, executionId) {
  const log = crearLogger(executionId);

  let browser = null;

  try {
    executionsRepo.actualizar(executionId, {
      estado: "en_progreso",
      iniciadoEn: new Date().toISOString(),
    });

    log.info("Iniciando agendamiento.");

    /*
     * -----------------------------------
     * NAVEGADOR
     * -----------------------------------
     */

    const navegador = await lanzarNavegador({
      headless: false,
    });

    browser = navegador.browser;

    const page = navegador.page;

    /*
     * Registramos la página para que
     * Socket.IO pueda mostrar la pantalla.
     */
    pageRegistry.registrar(executionId, page);

    /*
     * -----------------------------------
     * PAGE OBJECTS
     * -----------------------------------
     */

    const agendamientoPage = new AgendamientoPage(page);

    const datosPersonalesPage = new DatosPersonalesPage(page);

    const ubicacionFechaPage = new UbicacionFechaPage(page, log);

    const seleccionCitaPage = new SeleccionCitaPage(page, log);

    const confirmacionPage = new ConfirmacionPage(page, log);

    /*
     * -----------------------------------
     * COMPONENTES
     * -----------------------------------
     */

    const otpHandler = new OtpHandler({
      page,
      executionId,
      pendingSignals,
      executionsRepo,
      log,
      timeoutMs: OTP_TIMEOUT_MS,
    });

    const recaptchaHandler = new RecaptchaHandler({
      page,
      executionId,
      executionsRepo,
      log,
      timeoutMs: RECAPTCHA_TIMEOUT_MS,
    });

    /*
     * -----------------------------------
     * PASO 1
     * -----------------------------------
     */

    await agendamientoPage.abrir();

    log.info("Página de agendamiento cargada.");

    await datosPersonalesPage.cargar(usuario);

    log.ok("Formulario de datos personales completado.");

    /*
     * -----------------------------------
     * OTP
     * -----------------------------------
     */

    await datosPersonalesPage.solicitarValidacionCorreo();

    log.info(`Código OTP solicitado y enviado a ${usuario.email}.`);

    const codigoOtp = await otpHandler.esperarCodigo();

    await datosPersonalesPage.ingresarOtp(codigoOtp);

    await datosPersonalesPage.aceptarPolitica();

    /*
     * -----------------------------------
     * RECAPTCHA
     * PRIMER PUNTO
     * -----------------------------------
     */

    await recaptchaHandler.esperarSiAparece(4000);

    /*
     * -----------------------------------
     * PASO 2
     * -----------------------------------
     */

    await agendamientoPage.siguiente();

    /*
     * Puede que el reCAPTCHA sea invisible
     * y el formulario avance solo.
     */

    const pasoAutomatico = await avanzoAutomaticamente(
      page,
      AVANCE_AUTOMATICO_TIMEOUT_MS,
    );

    if (!pasoAutomatico) {
      /*
       * Puede aparecer un reto visual
       * después del click en Siguiente.
       */
      const recaptcha = await recaptchaHandler.esperarSiAparece(1000);

      if (!recaptcha) {
        await agendamientoPage.esperarPaso2();
      }
    } else {
      log.ok("El reCAPTCHA no volvió a aparecer.");
    }

    /*
     * -----------------------------------
     * SEDE
     * -----------------------------------
     */

    const seleccion =
      await ubicacionFechaPage.seleccionarSedeConDisponibilidad();

    log.info(`Fecha disponible encontrada en "${seleccion.sedeTexto}".`);

    /*
     * -----------------------------------
     * FECHA
     * -----------------------------------
     */

    await seleccionCitaPage.seleccionarFecha(seleccion.fechaLocator);

    log.info(`Fecha seleccionada: ${seleccion.tituloFecha || "sin detalle"}`);

    /*
     * -----------------------------------
     * HORA
     * -----------------------------------
     */

    const hora = await seleccionCitaPage.seleccionarPrimeraHoraDisponible();

    log.ok(`Hora seleccionada: ${hora}.`);

    await agendamientoPage.siguiente();

    log.ok("Sede, fecha y hora seleccionadas.");

    /*
     * -----------------------------------
     * CONFIRMACIÓN
     * -----------------------------------
     */

    const resultado = await confirmacionPage.confirmar();

    executionsRepo.actualizar(executionId, {
      estado: "exitoso",
      comprobanteUrl: resultado.comprobanteUrl,
      finalizadoEn: new Date().toISOString(),
    });

    return resultado;
  } catch (error) {
    log.error(error.message);

    executionsRepo.actualizar(executionId, {
      estado: "fallido",
      error: error.message,
      finalizadoEn: new Date().toISOString(),
    });

    throw error;
  } finally {
    /*
     * Quitamos la página del registro
     * antes de cerrar el navegador.
     */
    pageRegistry.quitar(executionId);

    await cerrarNavegador(browser);
  }
}

module.exports = {
  agendarCitaPasaporte,
};
