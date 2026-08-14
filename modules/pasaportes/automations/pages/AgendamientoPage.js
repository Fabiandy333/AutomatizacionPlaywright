class AgendamientoPage {
  constructor(page) {
    this.page = page;

    this.url = "https://passports.appoloatiende.com/home/agendar";
  }

  async abrir() {
    await this.page.goto(this.url, {
      waitUntil: "domcontentloaded",
    });
  }

  async siguiente() {
    await this.page
      .getByRole("button", {
        name: "Siguiente",
      })
      .click();
  }

  async esperarPaso2() {
    await this.page
      .getByRole("tab", {
        name: "2. Lugar, Fecha y hora",
        selected: true,
      })
      .waitFor({
        timeout: 15000,
      });
  }
}

module.exports = AgendamientoPage;
