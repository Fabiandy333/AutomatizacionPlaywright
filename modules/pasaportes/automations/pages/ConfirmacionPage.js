class ConfirmacionPage {
  constructor(page, log) {
    this.page = page;
    this.log = log;
  }

  async confirmar() {

    /*
     * Paso final: Agendar.
     */
    await this.page
      .getByRole('button', {
        name: 'Agendar',
      })
      .click();

    this.log.ok(
      'Solicitud de agendamiento enviada.'
    );

    /*
     * Encuesta de satisfacción.
     */
    await this.page
      .getByRole('button', {
        name: 'Calificar',
      })
      .click();

    /*
     * Confirmación.
     */
    await this.page
      .getByRole('button', {
        name: 'Aceptar',
      })
      .click();

    /*
     * Esperamos confirmación definitiva.
     */
    await this.page
      .getByRole('heading', {
        name: 'Cita agendada con éxito',
      })
      .waitFor({
        timeout: 15000,
      });

    const comprobanteHref =
      await this.page
        .getByRole('link', {
          name: 'Descargar comprobante',
        })
        .getAttribute('href');

    if (!comprobanteHref) {
      throw new Error(
        'La cita fue confirmada pero no se encontró el enlace del comprobante.'
      );
    }

    const comprobanteUrl =
      comprobanteHref.startsWith('http')
        ? comprobanteHref
        : `https://passports.appoloatiende.com/${comprobanteHref}`;

    this.log.ok(
      `Cita agendada con éxito. Comprobante: ${comprobanteUrl}`
    );

    return {
      estado: 'exitoso',
      comprobanteUrl,
    };
  }
}

module.exports = ConfirmacionPage;