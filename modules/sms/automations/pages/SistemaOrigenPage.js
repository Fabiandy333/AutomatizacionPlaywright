/**
 * Page Object:
 * SMS Internacional -> Administración -> Sistema Origen
 *
 * Esta clase contiene únicamente:
 * - navegación
 * - selectores
 * - interacción con formulario
 * - interacción con tabla
 *
 * La lógica de ejecución y resultados está en sistema_origen.js
 */

class SistemaOrigenPage {
  constructor(page) {
    this.page = page;
  }

  // =========================================================
  // LOGIN
  // =========================================================

  async abrirLogin(baseUrl) {
    await this.page.goto(baseUrl, {
      waitUntil: "domcontentloaded",
    });
  }

  async ingresarUsuario(usuario) {
    await this.page.getByRole("textbox", { name: "Usuario" }).fill(usuario);
  }

  async ingresarClave(clave) {
    await this.page.getByRole("textbox", { name: "Clave" }).fill(clave);
  }

  async hacerLogin(usuario, clave) {
    await this.ingresarUsuario(usuario);
    await this.ingresarClave(clave);

    await this.page.getByRole("link", { name: "Ingresar" }).click();
  }

  async esperarHome() {
    await this.page.waitForURL(/home\.xhtml/, {
      timeout: 10000,
    });
  }

  // =========================================================
  // NAVEGACIÓN
  // =========================================================

  async irASistemaOrigen() {
    await this.page.getByRole("button", { name: " Administración" }).click();

    await this.page.getByRole("link", { name: "  Sistema origen" }).click();

    await this.page.waitForURL(/sistemaOrigen\.xhtml/, {
      timeout: 10000,
    });
  }

  // =========================================================
  // MENSAJES
  // =========================================================

  async leerMensajeResultado() {
    const alerta = this.page.locator('[role="alert"]').last();

    try {
      await alerta.waitFor({
        state: "visible",
        timeout: 5000,
      });
    } catch {
      // Puede no existir dependiendo del resultado.
    }

    return ((await alerta.textContent().catch(() => "")) || "").trim();
  }

  // =========================================================
  // FORMULARIO
  // =========================================================

  async llenarFormulario({ nombre, codigoPais }) {
    await this.page.getByRole("textbox", { name: "Nombre*" }).fill(nombre);

    await this.page
      .getByRole("textbox", { name: "Código país*" })
      .fill(codigoPais);
  }

  async registrar() {
    await this.page.getByRole("button", { name: "Registrar" }).click();
  }

  async crearRegistro({ nombre, codigoPais }) {
    await this.llenarFormulario({
      nombre,
      codigoPais,
    });

    await this.registrar();

    return this.leerMensajeResultado();
  }

  // =========================================================
  // TABLA
  // =========================================================

  filaPorNombre(nombre) {
    return this.page
      .locator("tr")
      .filter({
        hasText: nombre,
      })
      .first();
  }

  async esperarFila(nombre) {
    const fila = this.filaPorNombre(nombre);

    await fila.waitFor({
      state: "visible",
      timeout: 10000,
    });

    return fila;
  }

  async obtenerTextoFila(nombre) {
    const fila = await this.esperarFila(nombre);

    return ((await fila.textContent().catch(() => "")) || "").trim();
  }

  async registroExiste(nombre) {
    try {
      await this.filaPorNombre(nombre).waitFor({
        state: "visible",
        timeout: 5000,
      });

      return true;
    } catch {
      return false;
    }
  }

  // =========================================================
  // EDICIÓN
  // =========================================================

  async editarRegistro(nombreActual, { nombreNuevo, codigoPaisNuevo }) {
    const fila = await this.esperarFila(nombreActual);

    const botonEditar = fila.locator("button").first();

    await botonEditar.click();

    await this.llenarFormulario({
      nombre: nombreNuevo,
      codigoPais: codigoPaisNuevo,
    });

    await this.registrar();

    return this.leerMensajeResultado();
  }

  // =========================================================
  // ACTIVAR / INACTIVAR
  // =========================================================

  async alternarEstado(nombre) {
    const fila = await this.esperarFila(nombre);

    // Según el hallazgo de QA:
    // botón 0 = editar
    // botón 1 = activar/inactivar
    const botonToggle = fila.locator("button").nth(1);

    await botonToggle.click();

    const dialogo = this.page.getByRole("dialog", {
      name: "Confirmación",
    });

    await dialogo.waitFor({
      state: "visible",
      timeout: 5000,
    });

    const textoDialogo = (await dialogo.textContent().catch(() => "")) || "";

    await dialogo
      .getByRole("button", {
        name: "Aceptar",
      })
      .click();

    const mensaje = await this.leerMensajeResultado();

    return {
      dialogo: textoDialogo.trim(),
      mensaje: mensaje.trim(),
    };
  }
}

module.exports = SistemaOrigenPage;
