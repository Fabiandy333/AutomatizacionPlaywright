class DatosPersonalesPage {
  constructor(page) {
    this.page = page;
  }

  async cargar(usuario) {
    await this.page
      .getByLabel("Tipo de documento")
      .selectOption(usuario.tipoDocumento);

    await this.page
      .getByRole("spinbutton", {
        name: "Número de documento",
      })
      .fill(usuario.numberDocument);

    // await this.page.evaluate((fecha) => {
    //   const elemento = document.getElementById(
    //     "databundle_passportschedulingrequest_fechaNacimiento",
    //   );

    //   if (!elemento) {
    //     throw new Error("No se encontró el campo de fecha de nacimiento.");
    //   }

    //   elemento.value = fecha;

    //   elemento.dispatchEvent(
    //     new Event("input", {
    //       bubbles: true,
    //     }),
    //   );

    //   elemento.dispatchEvent(
    //     new Event("change", {
    //       bubbles: true,
    //     }),
    //   );
    // }, usuario.dateOfBirth);

    await this.page
      .getByRole("textbox", {
        name: "Nombre completo",
      })
      .fill(usuario.name);

    await this.page
      .getByLabel("Tipo de solicitud")
      .selectOption(usuario.tipoSolicitud);

    await this.page
      .getByRole("spinbutton", {
        name: "Número de celular",
      })
      .fill(usuario.numberPhone);

    if (usuario.numberFixed) {
      await this.page
        .getByRole("spinbutton", {
          name: "Número de teléfono fijo",
        })
        .fill(usuario.numberFixed);
    }

    await this.page
      .getByRole("textbox", {
        name: "Dirección",
      })
      .fill(usuario.address);

    await this.page
      .getByRole("textbox", {
        name: "Correo electrónico",
        exact: true,
      })
      .fill(usuario.email);

    await this.page
      .getByRole("textbox", {
        name: "Confirmar correo electrónico",
      })
      .fill(usuario.email);

    /*
     * Fecha de pago.
     *
     * El sitio utiliza input[type=date].
     */
    await this.page.evaluate((isoDate) => {
      const elemento = document.getElementById("temporal_fechapago");

      if (!elemento) {
        throw new Error("No se encontró el campo fechaPago.");
      }

      elemento.value = isoDate;

      elemento.dispatchEvent(
        new Event("input", {
          bubbles: true,
        }),
      );

      elemento.dispatchEvent(
        new Event("change", {
          bubbles: true,
        }),
      );
    }, this.toIsoDate(usuario.paymentDate));

    /*
     * Acompañante.
     */
    if (usuario.isCompanion) {
      await this.page.locator("#step1-acompanante").check();

      await this.page
        .getByLabel("Tipo de acompañante")
        .selectOption(usuario.tipoCompanion);

      await this.page
        .getByRole("spinbutton", {
          name: "Número de identificación",
        })
        .fill(usuario.numberCompanion);

      await this.page
        .getByRole("textbox", {
          name: "Nombre y Apellido",
        })
        .fill(usuario.nameCompanion);
    } else {
      await this.page.locator("#step1-acompanante").uncheck();
    }
  }

  async solicitarValidacionCorreo() {
    await this.page
      .getByRole("button", {
        name: "Validar correo electrónico",
      })
      .click();

    await this.page
      .getByRole("button", {
        name: "Enviar Código",
      })
      .click();
  }

  async ingresarOtp(codigo) {
    await this.page
      .getByRole("textbox", {
        name: "Digitar código enviado al",
      })
      .fill(codigo);
  }

  async aceptarPolitica() {
    await this.page
      .getByRole("checkbox", {
        name: "Acepto la política de",
      })
      .setChecked(true);
  }

  toIsoDate(ddmmyyyy) {
    if (!ddmmyyyy) {
      throw new Error("paymentDate es obligatorio.");
    }

    const partes = ddmmyyyy.split("/");

    if (partes.length !== 3) {
      throw new Error(`Fecha inválida: ${ddmmyyyy}. Se esperaba DD/MM/YYYY.`);
    }

    const [dd, mm, yyyy] = partes;

    return `${yyyy}-${mm}-${dd}`;
  }
}

module.exports = DatosPersonalesPage;
