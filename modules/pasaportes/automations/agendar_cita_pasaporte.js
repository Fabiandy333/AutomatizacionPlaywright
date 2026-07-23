/**
 * Automatizacion de agendamiento de cita de pasaporte.
 * Sitio: https://passports.appoloatiende.com/home/agendar
 *
 * Archivo unico (ya no depende de form.js / utils.js / agendar.js):
 * toda la logica del paso a paso vive aqui.
 *
 * IMPORTANTE (se mantiene igual que en el script original):
 * - El codigo OTP no se automatiza: llega al correo del titular. En vez de
 *   `page.pause()` (solo sirve para correr el script suelto a mano), aqui
 *   se usa `pendingSignals.waitFor(...)` para que el backend real espere
 *   el codigo que manda el frontend por HTTP.
 * - El reCAPTCHA tampoco se automatiza: existe justamente para verificar
 *   que hay un humano. El flujo original tenia DOS puntos donde puede
 *   aparecer (antes de "Siguiente" y despues de "Siguiente") — se
 *   respetan ambos como dos esperas separadas.
 */

const { chromium } = require('playwright');
const pendingSignals = require('../../../shared/queue/pendingSignals');
const executionsRepo = require('../../../shared/database/executionsRepository');
const { crearLogger } = require('../../../shared/logger/logger');

const BASE_URL = process.env.BASE_URL_QA;
const OTP_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutos para que llegue el OTP desde el frontend
const RECAPTCHA_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutos para que el operador lo resuelva

// Convierte DD/MM/YYYY -> YYYY-MM-DD (formato que exige el <input type="date">)
function toIsoDate(ddmmyyyy) {
  const [dd, mm, yyyy] = ddmmyyyy.split('/');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Ejecuta el agendamiento completo para UN usuario.
 * executionId identifica esta corrida especifica: es la clave que usan
 * las rutas HTTP para avisarle a este flujo que ya llego el OTP
 * (POST /:executionId/otp) o que el operador ya resolvio el reCAPTCHA
 * (POST /:executionId/recaptcha-resuelto).
 */
async function agendarCitaPasaporte(usuario, executionId) {
  const log = crearLogger(executionId);
  executionsRepo.actualizar(executionId, { estado: 'en_progreso' });

  // OJO - reCAPTCHA: este flujo asume que hay un operador humano frente a
  // esta ventana del navegador (por eso headless: false). No se debe
  // intentar resolver el reto automaticamente bajo ninguna circunstancia.
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  try {
    log.info(`Iniciando agendamiento para ${usuario.name} (doc ${usuario.numberDocument})`);

    // 1. Ir al formulario de agendamiento
    await page.goto(BASE_URL);

    // 2. Paso 1 — Datos personales
    await page.getByLabel('Tipo de documento *').selectOption(usuario.tipoDocumento);
    await page.getByRole('spinbutton', { name: 'Número de documento *' }).fill(usuario.numberDocument);
    await page.getByRole('textbox', { name: 'Nombre completo *' }).fill(usuario.name);
    await page.getByLabel('Tipo de solicitud *').selectOption(usuario.tipoSolicitud);
    await page.getByRole('spinbutton', { name: 'Número de celular *' }).fill(usuario.numberPhone);
    if (usuario.numberFixed) {
      await page.getByRole('spinbutton', { name: 'Número de teléfono fijo' }).fill(usuario.numberFixed);
    }
    await page.getByRole('textbox', { name: 'Dirección *' }).fill(usuario.address);
    await page.getByRole('textbox', { name: 'Correo electrónico *', exact: true }).fill(usuario.email);
    await page.getByRole('textbox', { name: 'Confirmar correo electrónico *' }).fill(usuario.email);

    // Fecha de pago: el input es type="date", asi que se setea el value directo
    await page.evaluate((isoDate) => {
      const el = document.getElementById('fechaPago');
      el.value = isoDate;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, toIsoDate(usuario.paymentDate));

    if (usuario.isCompanion) {
      await page.locator('#acompanante').selectOption({ index: 1 });
      await page.getByLabel('Tipo de acompañante').selectOption(usuario.tipoCompanion);
      await page.getByRole('textbox', { name: 'Número de identificación' }).fill(usuario.numberCompanion);
      await page.getByRole('textbox', { name: 'Nombre y Apellido' }).fill(usuario.nameCompanion);
    } else {
      await page.locator('#acompanante').selectOption({ index: 0 });
    }
    log.ok('Formulario de datos personales completado');

    // 3. Validar correo electronico (envia el codigo OTP)
    await page.getByRole('button', { name: 'Validar correo electrónico' }).click();
    await page.getByRole('button', { name: 'Enviar Código' }).click();
    log.info(`Codigo OTP solicitado, enviado a ${usuario.email}`);

    // --- Aqui iba el primer page.pause(): ahora se espera el OTP real ---
    executionsRepo.actualizar(executionId, { estado: 'esperando_otp' });
    log.info('Esperando que el frontend envie el codigo OTP...');
    const codigoOtp = await pendingSignals.waitFor(`${executionId}:otp`, { timeoutMs: OTP_TIMEOUT_MS });
    log.ok(`Codigo OTP recibido: ${codigoOtp}`);
    await page.getByRole('textbox', { name: 'Digitar código enviado al' }).fill(codigoOtp);

    await page.getByRole('checkbox', { name: 'Acepto la política de' }).setChecked(true);

    // --- Primer punto donde puede salir el reCAPTCHA (antes de "Siguiente") ---
    executionsRepo.actualizar(executionId, { estado: 'esperando_recaptcha' });
    log.info('Si aparecio un reto de reCAPTCHA, resuelvelo en la ventana del navegador (1/2).');
    await pendingSignals.waitFor(`${executionId}:recaptcha_1`, { timeoutMs: RECAPTCHA_TIMEOUT_MS });
    log.ok('Confirmacion recibida (1/2), continuando.');

    // 4. Avanzar
    await page.getByRole('button', { name: 'Siguiente' }).click();

    // --- Segundo punto donde puede salir el reCAPTCHA (despues de "Siguiente") ---
    log.info('Si aparecio un reto de reCAPTCHA, resuelvelo en la ventana del navegador (2/2).');
    await pendingSignals.waitFor(`${executionId}:recaptcha_2`, { timeoutMs: RECAPTCHA_TIMEOUT_MS });
    log.ok('Confirmacion recibida (2/2), continuando.');

    // 5. Paso 2 — Lugar, fecha y hora
    await page.locator('.mt-2').first().click();
    await page.getByRole('cell', { name: usuario.diaPreferido || '17' }).click();
    await page.getByText(usuario.horaPreferida || '04:00:00 PM 1 citas').click();
    await page.getByRole('button', { name: 'Siguiente' }).click();
    log.ok('Sede, fecha y hora seleccionadas');

    // 6. Paso 3 — Confirmacion
    await page.getByRole('button', { name: 'Confirmar' }).click();

    const response = await page.waitForResponse((res) =>
      res.url().includes('/createPassportSchedulingRequest')
    );
    log.info(`createPassportSchedulingRequest -> ${response.status()}`);
    if (response.status() !== 200) {
      throw new Error('El servidor rechazo la solicitud de agendamiento (revisa OTP/reCAPTCHA).');
    }

    // 7. Encuesta de satisfaccion -> flujo real de confirmacion
    await page.getByRole('button', { name: 'Calificar y continuar' }).click();
    await page.getByRole('button', { name: 'Tomar cita' }).click();

    // 8. Verificar mensaje final y capturar el link del comprobante
    await page.getByRole('heading', { name: 'Cita agendada con éxito' }).waitFor();
    const comprobanteHref = await page.getByRole('link', { name: 'Descargar comprobante' }).getAttribute('href');

    log.ok(`Cita agendada con exito. Comprobante: ${comprobanteHref}`);
    executionsRepo.actualizar(executionId, { estado: 'exitoso', comprobanteUrl: comprobanteHref });

    return { estado: 'exitoso', comprobanteUrl: comprobanteHref };
  } catch (error) {
    log.error(error.message);
    executionsRepo.actualizar(executionId, { estado: 'fallido', error: error.message });
    throw error;
  } finally {
    await browser.close();
  }
}

module.exports = { agendarCitaPasaporte };