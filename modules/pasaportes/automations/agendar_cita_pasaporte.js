/**
 * Automatizacion de agendamiento de cita de pasaporte.
 * Sitio: https://passports.appoloatiende.com/home/agendar
 */

const { chromium } = require('playwright');
const pendingSignals = require('../../../shared/queue/pendingSignals');
const executionsRepo = require('../../../shared/database/executionsRepository');
const { crearLogger } = require('../../../shared/logger/logger');
const pageRegistry = require('../../../shared/streaming/pageRegistry');

const BASE_URL = process.env.BASE_URL_QA;
const OTP_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutos para que llegue el OTP desde el frontend
const RECAPTCHA_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutos para que el operador lo resuelva
const AVANCE_AUTOMATICO_TIMEOUT_MS = 6000; // cuanto esperar a ver si el reCAPTCHA paso solo
const DISPONIBILIDAD_TIMEOUT_MS = 8000; // cuanto esperar a que cargue el calendario de cada sede

// Convierte DD/MM/YYYY -> YYYY-MM-DD (formato que exige el <input type="date">)
function toIsoDate(ddmmyyyy) {
  const [dd, mm, yyyy] = ddmmyyyy.split('/');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Despues de hacer click en "Siguiente", revisa si el formulario avanzo
 * solo al paso 2 (reCAPTCHA invisible paso sin reto) dentro de un tiempo
 * corto. Si no avanzo, asumimos que salio un reto visual.
 */
async function avanzoAutomaticamente(page, timeoutMs) {
  try {
    await page
      .getByRole('tab', { name: '2. Lugar, Fecha y hora', selected: true })
      .waitFor({ timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}

/**
 * El reto visual de reCAPTCHA pinta un overlay fijo de pantalla completa
 * (z-index 2000000000, fondo blanco semi-transparente) justo detras del
 * iframe del reto. Ese overlay es un marcador mucho mas confiable que
 * adivinar por tiempos o por si el formulario avanzo o no.
 */
async function manejarRecaptchaSiAparece(page, executionId, log, deteccionTimeoutMs) {
  const overlay = page.locator('div[style*="2000000000"]').first();

  let aparecio = false;
  try {
    await overlay.waitFor({ state: 'visible', timeout: deteccionTimeoutMs });
    aparecio = true;
  } catch {
    aparecio = false;
  }

  if (!aparecio) return false;

  executionsRepo.actualizar(executionId, { estado: 'esperando_recaptcha' });
  log.info('Apareció un reto de reCAPTCHA (overlay detectado), resuélvelo en la ventana del navegador.');

  await overlay.waitFor({ state: 'hidden', timeout: RECAPTCHA_TIMEOUT_MS });

  log.ok('Reto de reCAPTCHA resuelto, continuando.');
  return true;
}

/**
 * Recorre TODAS las tarjetas de sede disponibles en el paso 2 y
 * selecciona la PRIMERA que realmente tenga fechas con cupo. No fuerza
 * una sede especifica (ej. "Cali, Norte") — si esa sede en particular
 * no tiene disponibilidad en este momento, prueba la siguiente
 * automaticamente en vez de fallar.
 *
 * Devuelve { fechaLocator, tituloFecha, sedeTexto } de la sede/fecha
 * que quedo seleccionada, o lanza un Error si ninguna sede tiene cupo.
 */
async function seleccionarSedeConDisponibilidad(page, log) {
  const tarjetasSede = page.locator('div.d-flex.justify-content-between.align-items-center.flex-wrap');
  const totalSedes = await tarjetasSede.count();

  if (totalSedes === 0) {
    throw new Error('No se encontraron sedes para seleccionar.');
  }

  for (let i = 0; i < totalSedes; i++) {
    const tarjeta = tarjetasSede.nth(i);
    const textoSede = (await tarjeta.innerText()).replace(/\s+/g, ' ').trim();

    await tarjeta.locator('label.radio-btn').click();
    log.info(`Probando sede: ${textoSede}`);

    // El calendario carga la disponibilidad de esta sede via AJAX, no
    // aparece de inmediato — por eso se usa waitFor (reintenta) en vez
    // de count() (revisa una sola vez sin esperar).
    const fechasDeEstaSede = page.locator('td.day.highlight');
    const hayFecha = await fechasDeEstaSede
      .first()
      .waitFor({ state: 'attached', timeout: DISPONIBILIDAD_TIMEOUT_MS })
      .then(() => true)
      .catch(() => false);

    if (hayFecha) {
      const fechaLocator = fechasDeEstaSede.first();
      const tituloFecha = await fechaLocator.getAttribute('title');
      log.ok(`Sede con disponibilidad encontrada: "${textoSede}"`);
      return { fechaLocator, tituloFecha, sedeTexto: textoSede };
    }

    log.info(`Sede "${textoSede}" sin fechas disponibles, probando la siguiente...`);
  }

  throw new Error('Ninguna sede tiene fechas disponibles en este momento.');
}

/**
 * Ejecuta el agendamiento completo para UN usuario.
 */
async function agendarCitaPasaporte(usuario, executionId) {
  const log = crearLogger(executionId);
  executionsRepo.actualizar(executionId, { estado: 'en_progreso' });
  let browser;
  let page;

  try {
    // OJO - reCAPTCHA: este flujo asume que hay un operador humano frente a
    // esta ventana del navegador (por eso headless: false).
    browser = await chromium.launch({ headless: false });
    page = await browser.newPage();
    pageRegistry.registrar(executionId, page);
    log.info('Iniciando agendamiento');

    // 1. Ir al formulario de agendamiento
    await page.goto("https://passports.appoloatiende.com/home/agendar");

    // 2. Paso 1 — Datos personales
    await page.getByLabel('Tipo de documento *').selectOption(usuario.tipoDocumento);
    await page.getByRole('spinbutton', { name: 'Número de documento *' }).fill(usuario.numberDocument);

    // Fecha de nacimiento: el input es type="text" con un datepicker que
    // BORRA el valor si se llena con .fill() normal y pierde el foco —
    // por eso se setea el value directo via evaluate, igual que fechaPago.
    await page.evaluate((fecha) => {
      const el = document.getElementById('databundle_passportschedulingrequest_fechaNacimiento');
      el.value = fecha;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, usuario.dateOfBirth);

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

    executionsRepo.actualizar(executionId, { estado: 'esperando_otp' });
    log.info('Esperando que el frontend envie el codigo OTP...');
    const codigoOtp = await pendingSignals.waitFor(`${executionId}:otp`, { timeoutMs: OTP_TIMEOUT_MS });
    log.ok('Código OTP recibido');
    await page.getByRole('textbox', { name: 'Digitar código enviado al' }).fill(codigoOtp);

    await page.getByRole('checkbox', { name: 'Acepto la política de' }).setChecked(true);

    const RECAPTCHA_DETECCION_TIMEOUT_MS = 4000;
    await manejarRecaptchaSiAparece(page, executionId, log, RECAPTCHA_DETECCION_TIMEOUT_MS);

    await page.getByRole('button', { name: 'Siguiente' }).click();

    const pasoSolo = await avanzoAutomaticamente(page, AVANCE_AUTOMATICO_TIMEOUT_MS);

    if (!pasoSolo) {
      const seManejoAqui = await manejarRecaptchaSiAparece(page, executionId, log, 500);
      if (!seManejoAqui) {
        await page.getByRole('tab', { name: '2. Lugar, Fecha y hora', selected: true }).waitFor({ timeout: 15000 });
      }
    } else {
      log.ok('El reCAPTCHA no volvio a aparecer, continuando.');
    }

    // 5. Paso 2 — Lugar, fecha y hora (dinamico: prueba cada sede hasta
    // encontrar una con cupo disponible, no fuerza "Cali, Norte")
    const { fechaLocator, tituloFecha, sedeTexto } = await seleccionarSedeConDisponibilidad(page, log);

    await fechaLocator.click();
    log.info(`Fecha seleccionada en "${sedeTexto}" (${tituloFecha || 'sin detalle'})`);

    // Hora: elementos .buttonList-interval son los horarios con cupo.
    const horasDisponibles = page.locator('.buttonList-interval');
    if ((await horasDisponibles.count()) === 0) {
      throw new Error(
        'La fecha seleccionada no tiene horas disponibles. Se necesita elegir otra fecha (no automatizado todavia).'
      );
    }
    const horaDisponible = horasDisponibles.first();
    const horaTexto = (await horaDisponible.innerText()).replace(/\s+/g, ' ').trim();
    await horaDisponible.click();
    log.ok(`Hora seleccionada: ${horaTexto}`);

    await page.getByRole('button', { name: 'Siguiente' }).click();
    log.ok('Sede, fecha y hora seleccionadas');

    // 6. Paso 3 — Confirmacion
    await page.getByRole('button', { name: 'Agendar' }).click();

    // 7. Encuesta de satisfaccion -> flujo real de confirmacion
    await page.getByRole('button', { name: 'Calificar' }).click();

    // 8. Verificar mensaje final y capturar el link del comprobante
    await page.getByRole('button', { name: 'Aceptar' }).click();

    await page.getByRole('heading', { name: 'Cita agendada con éxito' }).waitFor();

    const comprobanteHref = await page.getByRole('link', { name: 'Descargar comprobante' }).getAttribute('href');

    log.ok(`Cita agendada con exito. Comprobante: https://passports.appoloatiende.com/${comprobanteHref}`);

    executionsRepo.actualizar(executionId, { estado: 'exitoso', comprobanteUrl: comprobanteHref });

    return { estado: 'exitoso', comprobanteUrl: comprobanteHref };
  } catch (error) {
    log.error(error.message);
    executionsRepo.actualizar(executionId, { estado: 'fallido', error: error.message });
    throw error;
  } finally {
    pageRegistry.quitar(executionId);
    if (browser) await browser.close();
  }
}

module.exports = { agendarCitaPasaporte };