class SeleccionCitaPage {
  constructor(page, log) {
    this.page = page;
    this.log = log;

    this.horasDisponibles =
      this.page.locator(
        '.buttonList-interval'
      );
  }

  async seleccionarFecha(fechaLocator) {
    if (!fechaLocator) {
      throw new Error(
        'No se recibió una fecha para seleccionar.'
      );
    }

    await fechaLocator.click();

    this.log.ok(
      'Fecha seleccionada.'
    );
  }

  async seleccionarPrimeraHoraDisponible() {

    const cantidad =
      await this.horasDisponibles.count();

    if (cantidad === 0) {
      throw new Error(
        'La fecha seleccionada no tiene horas disponibles.'
      );
    }

    const hora =
      this.horasDisponibles.first();

    const texto =
      (await hora.innerText())
        .replace(/\s+/g, ' ')
        .trim();

    await hora.click();

    this.log.ok(
      `Hora seleccionada: ${texto}`
    );

    return texto;
  }
}

module.exports = SeleccionCitaPage;