/**
 * Pruebas automatizadas: SMS Internacional - Sistema Origen
 *
 * Cubre:
 *   SMS-01  Inicio de sesión correcto
 *   SMS-02  Inicio de sesión con clave incorrecta
 *   SMS-03  Creación de Sistema Origen
 *   SMS-04  Registro de nuevo Sistema Origen
 *   SMS-05  Verificación del registro en tabla
 *   SMS-06  Edición del registro
 *   SMS-07  Activar / inactivar registro
 *
 * URL:
 *   https://sms-internacional.playtechla.com/SMSInternacional/app/pages/login.xhtml
 *
 * Las credenciales se obtienen exclusivamente del .env:
 *   SMS_BASE_URL
 *   SMS_USUARIO
 *   SMS_CLAVE
 */

const { chromium } = require('playwright');

const executionsRepo = require('../../../shared/database/executionsRepository');
const { crearLogger } = require('../../../shared/logger/logger');
const pageRegistry = require('../../../shared/streaming/pageRegistry');

const BASE_URL =
  process.env.SMS_BASE_URL ||
  'https://sms-internacional.playtechla.com/SMSInternacional/app/pages/login.xhtml';

const USUARIO = process.env.SMS_USUARIO;
const CLAVE = process.env.SMS_CLAVE;

const TIMEOUT_DEFAULT = 10000;

// ============================================================
// DATOS POR DEFECTO DE LA PRUEBA
// ============================================================

const REGISTRO_PRUEBA_DEFAULT = {
  nombreInicial: 'QAAutomatizadoClaude',
  codigoPaisInicial: '57',
  nombreEditado: 'QAAutomatizadoClaudeEditado',
  codigoPaisEditado: '58',
};

// ============================================================
// VALIDACIONES
// ============================================================

function validarConfiguracion() {
  if (!USUARIO) {
    throw new Error('Falta SMS_USUARIO en el archivo .env');
  }

  if (!CLAVE) {
    throw new Error('Falta SMS_CLAVE en el archivo .env');
  }

  if (!BASE_URL) {
    throw new Error('Falta SMS_BASE_URL en el archivo .env');
  }
}

// ============================================================
// HELPERS
// ============================================================

function normalizarTexto(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

async function leerMensajeResultado(page) {
  const alerta = page.locator('[role="alert"]').last();

  try {
    await alerta.waitFor({
      state: 'visible',
      timeout: 5000,
    });
  } catch {
    // Puede que algunas acciones no generen alert.
  }

  return (await alerta.textContent().catch(() => '')) || '';
}

function filaPorNombre(page, nombre) {
  return page
    .locator('tr')
    .filter({ hasText: nombre })
    .first();
}

// ============================================================
// SMS-01
// ============================================================

async function iniciarSesion(page, usuario, clave) {
  await page.goto(BASE_URL, {
    waitUntil: 'domcontentloaded',
  });

  await page
    .getByRole('textbox', { name: 'Usuario' })
    .fill(usuario);

  await page
    .getByRole('textbox', { name: 'Clave' })
    .fill(clave);

  await page
    .getByRole('link', { name: 'Ingresar' })
    .click();
}

async function testLoginExitoso(page, log) {
  log.info('SMS-01: validando ingreso con credenciales correctas...');

  await iniciarSesion(page, USUARIO, CLAVE);

  await page.waitForURL(/home\.xhtml/, {
    timeout: TIMEOUT_DEFAULT,
  });

  log.ok('SMS-01 OK: redirigió correctamente a home.xhtml');
}

// ============================================================
// SMS-02
// ============================================================

async function testLoginClaveIncorrecta(browser, log) {
  log.info(
    'SMS-02: validando que una clave incorrecta sea rechazada...'
  );

  const contexto = await browser.newContext();

  try {
    const page = await contexto.newPage();

    await iniciarSesion(
      page,
      USUARIO,
      'clave-incorrecta-de-prueba-123'
    );

    await page.waitForTimeout(2000);

    const urlActual = page.url();

    if (urlActual.includes('home.xhtml')) {
      throw new Error(
        'FALLO DE SEGURIDAD: el sistema permitió ingresar con una clave incorrecta.'
      );
    }

    log.ok(
      'SMS-02 OK: el sistema rechazó la clave incorrecta.'
    );
  } finally {
    await contexto.close();
  }
}

// ============================================================
// NAVEGACIÓN
// ============================================================

async function irASistemaOrigen(page, log) {
  log.info(
    'Navegando: Administración → Sistema Origen...'
  );

  await page
    .getByRole('button', { name: ' Administración' })
    .click();

  await page
    .getByRole('link', { name: '  Sistema origen' })
    .click();

  await page.waitForURL(/sistemaOrigen\.xhtml/, {
    timeout: TIMEOUT_DEFAULT,
  });

  log.ok('Navegación a Sistema Origen completada.');
}

// ============================================================
// SMS-03 / SMS-04
// ============================================================

async function testCrearRegistro(
  page,
  datos,
  log
) {
  log.info(
    `SMS-03/04: creando registro "${datos.nombreInicial}"...`
  );

  await page
    .getByRole('textbox', { name: 'Nombre*' })
    .fill(datos.nombreInicial);

  await page
    .getByRole('textbox', { name: 'Código país*' })
    .fill(datos.codigoPaisInicial);

  await page
    .getByRole('button', { name: 'Registrar' })
    .click();

  const mensaje = await leerMensajeResultado(page);

  const mensajeNormalizado = normalizarTexto(mensaje);

  if (
    !mensajeNormalizado.includes('almacenado con exito')
  ) {
    throw new Error(
      `SMS-03/04 FALLO: no se confirmó el registro. Mensaje recibido: "${mensaje}"`
    );
  }

  log.ok(
    `SMS-03/04 OK: ${mensaje.trim()}`
  );
}

// ============================================================
// SMS-05
// ============================================================

async function testVerificarEnTabla(
  page,
  datos,
  log
) {
  log.info(
    `SMS-05: verificando "${datos.nombreInicial}" en la tabla...`
  );

  const fila = filaPorNombre(
    page,
    datos.nombreInicial
  );

  await fila.waitFor({
    state: 'visible',
    timeout: TIMEOUT_DEFAULT,
  });

  const textoFila =
    (await fila.textContent()) || '';

  if (!textoFila.includes(datos.codigoPaisInicial)) {
    throw new Error(
      `SMS-05 FALLO: la fila no muestra el código de país "${datos.codigoPaisInicial}".`
    );
  }

  log.ok(
    'SMS-05 OK: el registro aparece correctamente en la tabla.'
  );
}

// ============================================================
// SMS-06
// ============================================================

async function testEditarRegistro(
  page,
  datos,
  log
) {
  log.info(
    `SMS-06: editando "${datos.nombreInicial}" → "${datos.nombreEditado}"...`
  );

  const fila = filaPorNombre(
    page,
    datos.nombreInicial
  );

  await fila.waitFor({
    state: 'visible',
    timeout: TIMEOUT_DEFAULT,
  });

  const botonEditar =
    fila.locator('button').first();

  await botonEditar.click();

  await page
    .getByRole('textbox', { name: 'Nombre*' })
    .fill(datos.nombreEditado);

  await page
    .getByRole('textbox', { name: 'Código país*' })
    .fill(datos.codigoPaisEditado);

  await page
    .getByRole('button', { name: 'Registrar' })
    .click();

  const mensaje =
    await leerMensajeResultado(page);

  const mensajeNormalizado =
    normalizarTexto(mensaje);

  if (
    !mensajeNormalizado.includes('modificado con exito')
  ) {
    throw new Error(
      `SMS-06 FALLO: no se confirmó la edición. Mensaje recibido: "${mensaje}"`
    );
  }

  log.ok(
    `SMS-06 OK: ${mensaje.trim()}`
  );
}

// ============================================================
// SMS-07
// ============================================================

async function testAlternarEstado(
  page,
  nombre,
  log
) {
  log.info(
    `SMS-07: alternando estado de "${nombre}"...`
  );

  const fila = filaPorNombre(
    page,
    nombre
  );

  await fila.waitFor({
    state: 'visible',
    timeout: TIMEOUT_DEFAULT,
  });

  const botonToggle =
    fila.locator('button').nth(1);

  await botonToggle.click();

  const dialogo =
    page.getByRole('dialog', {
      name: 'Confirmación',
    });

  await dialogo.waitFor({
    state: 'visible',
    timeout: 5000,
  });

  const textoDialogo =
    (await dialogo.textContent()) || '';

  await dialogo
    .getByRole('button', {
      name: 'Aceptar',
    })
    .click();

  const mensaje =
    await leerMensajeResultado(page);

  log.ok(
    `SMS-07 OK: ${textoDialogo.trim()} → ${mensaje.trim()}`
  );

  return mensaje;
}

// ============================================================
// EJECUCIÓN PRINCIPAL
// ============================================================

async function ejecutarSistemaOrigen(
  configuracion,
  executionId
) {
  validarConfiguracion();

  const log = crearLogger(executionId);

  let browser;
  let page;

  const datos = {
    ...REGISTRO_PRUEBA_DEFAULT,
    ...(configuracion?.registro || {}),
  };

  const resultados = {
    exitosos: [],
    fallidos: [],
  };

  executionsRepo.actualizar(
    executionId,
    {
      estado: 'en_progreso',
    }
  );

  try {
    log.info(
      'Iniciando automatización SMS Internacional - Sistema Origen'
    );

    browser = await chromium.launch({
      headless: false,
    });

    page = await browser.newPage();

    pageRegistry.registrar(
      executionId,
      page
    );

    // --------------------------------------------------------
    // FUNCIÓN AUXILIAR PARA EJECUTAR CADA CASO
    // --------------------------------------------------------

    async function correrCaso(nombreCaso, funcion) {
      try {
        await funcion();

        resultados.exitosos.push(
          nombreCaso
        );

        log.ok(
          `${nombreCaso} FINALIZADO CORRECTAMENTE`
        );
      } catch (error) {
        resultados.fallidos.push({
          caso: nombreCaso,
          error: error.message,
        });

        log.error(
          `${nombreCaso} FALLO: ${error.message}`
        );
      }
    }

    // --------------------------------------------------------
    // SMS-01
    // --------------------------------------------------------

    await correrCaso(
      'SMS-01',
      () =>
        testLoginExitoso(
          page,
          log
        )
    );

    // --------------------------------------------------------
    // SMS-02
    // --------------------------------------------------------

    await correrCaso(
      'SMS-02',
      () =>
        testLoginClaveIncorrecta(
          browser,
          log
        )
    );

    // --------------------------------------------------------
    // NAVEGACIÓN
    // --------------------------------------------------------

    await correrCaso(
      'Navegación - Sistema Origen',
      () =>
        irASistemaOrigen(
          page,
          log
        )
    );

    // --------------------------------------------------------
    // SMS-03 / SMS-04
    // --------------------------------------------------------

    await correrCaso(
      'SMS-03/SMS-04',
      () =>
        testCrearRegistro(
          page,
          datos,
          log
        )
    );

    // --------------------------------------------------------
    // SMS-05
    // --------------------------------------------------------

    await correrCaso(
      'SMS-05',
      () =>
        testVerificarEnTabla(
          page,
          datos,
          log
        )
    );

    // --------------------------------------------------------
    // SMS-06
    // --------------------------------------------------------

    await correrCaso(
      'SMS-06',
      () =>
        testEditarRegistro(
          page,
          datos,
          log
        )
    );

    // --------------------------------------------------------
    // SMS-07 INACTIVAR
    // --------------------------------------------------------

    await correrCaso(
      'SMS-07 - Inactivar',
      () =>
        testAlternarEstado(
          page,
          datos.nombreEditado,
          log
        )
    );

    // --------------------------------------------------------
    // SMS-07 REACTIVAR
    // --------------------------------------------------------

    await correrCaso(
      'SMS-07 - Reactivar',
      () =>
        testAlternarEstado(
          page,
          datos.nombreEditado,
          log
        )
    );

    // --------------------------------------------------------
    // LIMPIEZA
    //
    // Dejamos finalmente el registro INACTIVO.
    // --------------------------------------------------------

    await correrCaso(
      'Limpieza final - dejar inactivo',
      () =>
        testAlternarEstado(
          page,
          datos.nombreEditado,
          log
        )
    );

    // --------------------------------------------------------
    // RESUMEN
    // --------------------------------------------------------

    log.info(
      `Pruebas exitosas: ${resultados.exitosos.length}`
    );

    log.info(
      `Pruebas fallidas: ${resultados.fallidos.length}`
    );

    if (resultados.fallidos.length > 0) {
      const errores =
        resultados.fallidos
          .map(
            (item) =>
              `${item.caso}: ${item.error}`
          )
          .join(' | ');

      executionsRepo.actualizar(
        executionId,
        {
          estado: 'fallido',
          error: errores,
          resultado: resultados,
        }
      );

      return {
        estado: 'fallido',
        resultados,
      };
    }

    executionsRepo.actualizar(
      executionId,
      {
        estado: 'exitoso',
        resultado: resultados,
      }
    );

    log.ok(
      'Automatización SMS Sistema Origen finalizada correctamente.'
    );

    return {
      estado: 'exitoso',
      resultados,
    };

  } catch (error) {

    log.error(
      `Error inesperado: ${error.message}`
    );

    executionsRepo.actualizar(
      executionId,
      {
        estado: 'fallido',
        error: error.message,
      }
    );

    throw error;

  } finally {

    pageRegistry.quitar(
      executionId
    );

    if (browser) {
      await browser.close();
    }
  }
}

module.exports = {
  ejecutarSistemaOrigen,
};