const { normalizeDate } = require("./utils");

async function llenarFormulario(page, usuario) {
  // Select obligatorios
  await page
    .locator("#databundle_passportschedulingrequest_documentTypeSolicitante")
    .selectOption({ index: 1 });

  await page
    .locator("#databundle_passportschedulingrequest_passportRequestType")
    .selectOption({ index: 1 });

  const fieldMap = {
    numberDocument: "#databundle_passportschedulingrequest_dniSolicitante",
    name: "#databundle_passportschedulingrequest_nameApplicant",
    numberPhone: "#databundle_passportschedulingrequest_cellPhone",
    address: "#databundle_passportschedulingrequest_address",
    email: "#databundle_passportschedulingrequest_email",
    paymentDate: "#fechaPago",
  };

  for (const [campo, selector] of Object.entries(fieldMap)) {
    let valor = usuario[campo];

    if (!valor) continue;

    if (campo === "paymentDate") {
      valor = normalizeDate(valor);
    }

    await page
      .locator("#databundle_passportschedulingrequest_confirmemail")
      .fill(usuario.email);
    await page.locator(selector).fill(String(valor));

    console.log(`${campo}: ${valor}`);
  }
  await page
    .locator("//*[@id='databundle_passportschedulingrequest_acceptDataPolicy']")
    .click();
  await page.locator("//*[@id='miBoton']").click();

  // Esperar a que el modal/ventana flotante sea visible en la pantalla
  const modalSelector =
    "xpath=/html/body/main/div[1]/div[1]/div[3]/div[1]/form/div[1]/div[11]/div/div/div[3]";
  await page.waitForSelector(modalSelector, { state: "visible" });

  // Dar click en el botón para enviar el código OTP
  const botonOtpSelector = 'xpath=//*[@id="sendCodOtp"]';
  await page.click(botonOtpSelector);
}

module.exports = {
  llenarFormulario,
};
