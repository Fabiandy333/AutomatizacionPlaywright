/**
 * Automatizacion de agendamiento de cita de pasaporte.
 * Sitio: https://passports.appoloatiende.com/home/agendar
 *
 * IMPORTANTE:
 * - El codigo OTP no se automatiza: llega al correo del titular.
 *   `pendingSignals.waitFor(...)` congela el flujo hasta que el backend
 *   recibe el codigo por HTTP (POST /:executionId/otp).
 * - El reCAPTCHA tampoco se automatiza. Es INVISIBLE y solo se activa
 *   al hacer click en "Siguiente" — por eso el click va PRIMERO, y solo
 *   se pausa a esperar confirmacion humana si de verdad aparecio un
 *   reto visual (si paso solo, se sigue de largo sin pausar nunca).
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
 *
 * Esta funcion revisa si aparece ese overlay dentro de un tiempo corto
 * (se llama justo despues de aceptar la politica de datos, que es donde
 * casi siempre se dispara el reto). Si aparece, pausa esperando la
 * confirmacion humana y luego espera a que el overlay desaparezca
 * (senal de que el reto ya se resolvio). Si no aparece, no hace nada.
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
  log.info('Aparecio un reto de reCAPTCHA (overlay detectado), resuelvelo en la ventana del navegador.');
  await pendingSignals.waitFor(`${executionId}:recaptcha_1`, { timeoutMs: RECAPTCHA_TIMEOUT_MS });

  // Tras la confirmacion humana, se espera a que el overlay desaparezca
  // de verdad (evita seguir de largo si el operador confirmo antes de tiempo)
  await overlay.waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {});
  log.ok('Reto de reCAPTCHA resuelto, continuando.');
  return true;
}

/**
 * Ejecuta el agendamiento completo para UN usuario.
 * executionId identifica esta corrida especifica: es la clave que usan
 * las rutas HTTP para avisarle a este flujo que ya llego el OTP
 * (POST /:executionId/otp) o que el operador ya resolvio el reCAPTCHA
 * (POST /:executionId/recaptcha-resuelto/1).
 */
async function agendarCitaPasaporte(usuario, executionId) {
  const log = crearLogger(executionId);
  executionsRepo.actualizar(executionId, { estado: 'en_progreso' });

  // OJO - reCAPTCHA: este flujo asume que hay un operador humano frente a
  // esta ventana del navegador (por eso headless: false). No se debe
  // intentar resolver el reto automaticamente bajo ninguna circunstancia.
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  pageRegistry.registrar(executionId, page);

  try {
    log.info(`Iniciando agendamiento para ${usuario.name} (doc ${usuario.numberDocument})`);

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

    // --- Aqui iba el page.pause(): ahora se espera el OTP real ---
    executionsRepo.actualizar(executionId, { estado: 'esperando_otp' });
    log.info('Esperando que el frontend envie el codigo OTP...');
    const codigoOtp = await pendingSignals.waitFor(`${executionId}:otp`, { timeoutMs: OTP_TIMEOUT_MS });
    log.ok(`Codigo OTP recibido: ${codigoOtp}`);
    await page.getByRole('textbox', { name: 'Digitar código enviado al' }).fill(codigoOtp);

    await page.getByRole('checkbox', { name: 'Acepto la política de' }).setChecked(true);

    // El reto de reCAPTCHA casi siempre se dispara justo al aceptar la
    // politica de datos (antes de llegar a "Siguiente"). Se detecta por
    // el overlay que pinta Google, no por tiempos ni por adivinar.
    const RECAPTCHA_DETECCION_TIMEOUT_MS = 4000;
    await manejarRecaptchaSiAparece(page, executionId, log, RECAPTCHA_DETECCION_TIMEOUT_MS);

    // 4. Avanzar — si el reto ya se resolvio arriba (o nunca aparecio),
    // este click deberia pasar directo al paso 2.
    await page.getByRole('button', { name: 'Siguiente' }).click();

    // Respaldo: por si el reto aparece justo en este punto en vez de
    // al aceptar la politica (el sitio no siempre lo dispara igual).
    const pasoSolo = await avanzoAutomaticamente(page, AVANCE_AUTOMATICO_TIMEOUT_MS);

    if (!pasoSolo) {
      const seManejoAqui = await manejarRecaptchaSiAparece(page, executionId, log, 500);
      if (!seManejoAqui) {
        // No hay overlay pero tampoco avanzo — puede ser lentitud de red,
        // no necesariamente un reto. Se espera un poco mas antes de fallar.
        await page.getByRole('tab', { name: '2. Lugar, Fecha y hora', selected: true }).waitFor({ timeout: 15000 });
      }
    } else {
      log.ok('El reCAPTCHA no volvio a aparecer, continuando.');
    }

    // 5. Paso 2 — Lugar, fecha y hora (dinamico, no estatico)

    // Sede: se busca la tarjeta que contiene el texto "norte" (mas robusto
    // que depender del indice/orden en que la pagina las liste) y se hace
    // click en su boton "Seleccionar".
    const tarjetaSedeNorte = page
      .locator('#step2-tab-pane div')
      .filter({ hasText: /norte/i })
      .first();
    await tarjetaSedeNorte.getByRole('button', { name: 'Seleccionar' }).click();
    log.ok('Sede "Cali, Norte" seleccionada');

    // Fecha: el sitio marca con la clase "highlight" los dias con cupos.
    // Se toma la primera disponible en el orden en que aparece el calendario.
    const fechaDisponible = page.locator('table td.highlight').first();
    if ((await fechaDisponible.count()) === 0) {
      throw new Error('No hay fechas disponibles para agendar en esta sede.');
    }
    const tituloFecha = await fechaDisponible.getAttribute('title');
    await fechaDisponible.click();
    log.info(`Fecha seleccionada (${tituloFecha || 'sin detalle'})`);

    // Hora: elementos .buttonList-interval son los horarios con cupo.
    const horaDisponible = page.locator('.buttonList-interval').first();
    if ((await horaDisponible.count()) === 0) {
      throw new Error(
        'La fecha seleccionada no tiene horas disponibles. Se necesita elegir otra fecha (no automatizado todavia).'
      );
    }
    const horaTexto = (await horaDisponible.innerText()).replace(/\s+/g, ' ').trim();
    await horaDisponible.click();
    log.ok(`Hora seleccionada: ${horaTexto}`);

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
    pageRegistry.quitar(executionId);
    await browser.close();
  }
}

module.exports = { agendarCitaPasaporte };