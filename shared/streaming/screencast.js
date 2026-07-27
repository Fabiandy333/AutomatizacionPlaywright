/**
 * Streaming de pantalla (solo VISUALIZACION) de una pagina de Playwright,
 * usando el comando nativo de Chrome DevTools Protocol (CDP)
 * Page.startScreencast.
 *
 * IMPORTANTE: este modulo es deliberadamente de UNA SOLA VIA.
 * Emite fotogramas hacia quien los pida (onFrame), pero no expone
 * ningun metodo para inyectar clics, teclas o eventos hacia la pagina.
 * Si en el futuro alguien intenta agregar esa funcionalidad aqui, es una
 * señal de que se esta construyendo el bypass de reCAPTCHA que ya
 * decidimos no construir — no agregar `Input.dispatchMouseEvent` ni
 * similares a este archivo.
 */

async function iniciarScreencast(page, onFrame) {
  const cdpSession = await page.context().newCDPSession(page);

  cdpSession.on('Page.screencastFrame', async (evento) => {
    // data ya viene en base64, lista para un <img src="data:image/jpeg;base64,...">
    onFrame(evento.data);
    // hay que confirmar cada frame o CDP deja de mandar mas
    await cdpSession.send('Page.screencastFrameAck', { sessionId: evento.sessionId });
  });

  await cdpSession.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 60,
    maxWidth: 960,
    maxHeight: 600,
    everyNthFrame: 1,
  });

  return {
    detener: async () => {
      try {
        await cdpSession.send('Page.stopScreencast');
        await cdpSession.detach();
      } catch {
        // la pagina/navegador ya pudo haberse cerrado
      }
    },
  };
}

module.exports = { iniciarScreencast };