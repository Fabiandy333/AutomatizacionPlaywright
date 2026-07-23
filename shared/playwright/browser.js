const { chromium } = require('playwright');

/**
 * Lanza el navegador. `headless` deberia ser `false` solo en un entorno
 * donde alguien pueda ver la pantalla para resolver el reCAPTCHA
 * manualmente (ver nota en agendar_cita_pasaporte.js). En un servidor
 * sin interfaz grafica, `headless: true` no permite esa intervencion
 * humana, asi que ese paso quedaria bloqueado — ver el comentario
 * "OJO - reCAPTCHA" en el flujo principal.
 */
async function lanzarNavegador({ headless = false } = {}) {
  const browser = await chromium.launch({ headless });
  const page = await browser.newPage();
  return { browser, page };
}

module.exports = { lanzarNavegador };
