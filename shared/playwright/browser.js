const { chromium } = require('playwright');

/**
 * Lanza una instancia de Chromium con un BrowserContext independiente.
 *
 * Cada ejecución tiene:
 *
 * Browser
 *   └── Context
 *        └── Page
 *
 * headless: false es necesario actualmente porque el operador
 * debe poder resolver manualmente OTP/reCAPTCHA.
 */
async function lanzarNavegador({
  headless = false,
  viewport = null,
} = {}) {
  const browser = await chromium.launch({
    headless,
  });

  const contextOptions = {};

  if (viewport) {
    contextOptions.viewport = viewport;
  }

  const context = await browser.newContext(
    contextOptions
  );

  const page = await context.newPage();

  return {
    browser,
    context,
    page,
  };
}

async function cerrarNavegador(browser) {
  if (!browser) {
    return;
  }

  try {
    await browser.close();
  } catch (error) {
    console.error(
      '[Playwright] Error cerrando navegador:',
      error.message
    );
  }
}

module.exports = {
  lanzarNavegador,
  cerrarNavegador,
};