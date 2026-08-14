class RecaptchaHandler {
  constructor({
    page,
    executionId,
    executionsRepo,
    log,
    timeoutMs = 3 * 60 * 1000,
  }) {
    this.page = page;
    this.executionId = executionId;
    this.executionsRepo = executionsRepo;
    this.log = log;
    this.timeoutMs = timeoutMs;
  }

  obtenerOverlay() {
    return this.page
      .locator('div[style*="2000000000"]')
      .first();
  }

  async esperarSiAparece(
    deteccionTimeoutMs = 4000
  ) {
    const overlay =
      this.obtenerOverlay();

    let aparecio = false;

    try {
      await overlay.waitFor({
        state: 'visible',
        timeout: deteccionTimeoutMs,
      });

      aparecio = true;

    } catch {
      aparecio = false;
    }

    if (!aparecio) {
      return false;
    }

    this.executionsRepo.actualizar(
      this.executionId,
      {
        estado: 'esperando_recaptcha',
      }
    );

    this.log.info(
      'Apareció un reto de reCAPTCHA. Resuélvelo manualmente en la ventana del navegador.'
    );

    await overlay.waitFor({
      state: 'hidden',
      timeout: this.timeoutMs,
    });

    this.log.ok(
      'Reto de reCAPTCHA resuelto. Continuando.'
    );

    return true;
  }
}

module.exports = RecaptchaHandler;