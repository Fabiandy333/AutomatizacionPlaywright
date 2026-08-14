class UbicacionFechaPage {
  constructor(page, log) {
    this.page = page;
    this.log = log;

    this.tarjetasSede =
      this.page.locator(
        'div.d-flex.justify-content-between.align-items-center.flex-wrap'
      );

    this.fechasDisponibles =
      this.page.locator(
        'td.day.highlight'
      );
  }

  async seleccionarSedeConDisponibilidad({
    timeoutMs = 8000,
  } = {}) {

    const total =
      await this.tarjetasSede.count();

    if (total === 0) {
      throw new Error(
        'No se encontraron sedes para seleccionar.'
      );
    }

    for (let i = 0; i < total; i++) {

      const tarjeta =
        this.tarjetasSede.nth(i);

      const sede =
        (await tarjeta.innerText())
          .replace(/\s+/g, ' ')
          .trim();

      this.log.info(
        `Probando sede: ${sede}`
      );

      await tarjeta
        .locator('label.radio-btn')
        .click();

      /*
       * La disponibilidad se carga vía AJAX.
       * Esperamos a que aparezca una fecha.
       */
      const disponible =
        await this.fechasDisponibles
          .first()
          .waitFor({
            state: 'attached',
            timeout: timeoutMs,
          })
          .then(() => true)
          .catch(() => false);

      if (!disponible) {

        this.log.info(
          `Sede "${sede}" sin fechas disponibles.`
        );

        continue;
      }

      const fecha =
        this.fechasDisponibles.first();

      const tituloFecha =
        await fecha.getAttribute('title');

      this.log.ok(
        `Sede con disponibilidad encontrada: "${sede}".`
      );

      return {
        sedeTexto: sede,
        fechaLocator: fecha,
        tituloFecha,
      };
    }

    throw new Error(
      'Ninguna sede tiene fechas disponibles en este momento.'
    );
  }
}

module.exports = UbicacionFechaPage;