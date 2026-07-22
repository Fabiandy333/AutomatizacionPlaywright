/**
 * Script de Playwright: agendamiento de cita de pasaporte
 * Sitio: https://passports.appoloatiende.com/home/agendar
 *
 * IMPORTANTE:
 * - En el paso de "Siguiente" del formulario de datos personales, el sitio puede
 *   mostrar un reto visual de reCAPTCHA (ej. "selecciona las imágenes con cruces
 *   peatonales"). Ese paso NO se automatiza aquí a propósito: reCAPTCHA existe
 *   para verificar que hay un humano completando el trámite, así que el script
 *   se detiene (page.pause()) y espera a que una persona lo resuelva a mano
 *   antes de continuar.
 * - El código de validación de correo (OTP) tampoco se puede automatizar porque
 *   llega al correo del titular; el script pausa para que lo ingreses tú.
 * - Requiere: npm install playwright
 */

const { chromium } = require('playwright');
require("dotenv").config();


// ---- Datos del titular (ajustar por cada usuario a agendar) ----
const usuario = {
  tipoDocumento: 'Cédula Ciudadanía', // 'Cédula Ciudadanía' - 'Registro Civil' - 'Tarjeta de Identidad'
  numberDocument: '31935469',
  name: 'Susana Cuevas',
  tipoSolicitud: 'Solicitud de pasaporte por primera vez', // 'Solicitud de pasaporte por primera vez' - 'Pasaporte de emergencia' - 'Renovación de pasaporte'
  numberPhone: '3034567890',
  numberFixed: '6025589745',
  address: 'Carrera 8 #30-40',
  email: 'analista.funcional.qa@playtechla.com',
  paymentDate: '06/03/2026', // formato DD/MM/YYYY tal como llega del origen
  isCompanion: false, // true si lleva acompañante, false si no
  //Si lleva acompañante, se debe agregar las siguientes propiedades: de lo contrario no las tiene en cuenta.
  tipoCompanion: 'Abuela', // 'Abuela' -'Abuelo' - 'Hermano' - 'Hijo' - 'Madre' - 'Padre'
  numberCompanion: '31935469',
  nameCompanion: 'Juan Pérez'
};

// Convierte DD/MM/YYYY -> YYYY-MM-DD (formato que exige el <input type="date">)
function toIsoDate(ddmmyyyy) {
  const [dd, mm, yyyy] = ddmmyyyy.split('/');
  return `${yyyy}-${mm}-${dd}`;
}

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  // 1. Ir al formulario de agendamiento
  await page.goto(process.env.BASE_URL_QA);

  // 2. Paso 1 — Datos personales
  await page.getByLabel('Tipo de documento *').selectOption(usuario.tipoDocumento);
  await page.getByRole('spinbutton', { name: 'Número de documento *' }).fill(usuario.numberDocument);
  await page.getByRole('textbox', { name: 'Nombre completo *' }).fill(usuario.name);
  await page.getByLabel('Tipo de solicitud *').selectOption(usuario.tipoSolicitud);
  await page.getByRole('spinbutton', { name: 'Número de celular *' }).fill(usuario.numberPhone);
  await page.getByRole('spinbutton', { name: 'Número de teléfono fijo' }).fill(usuario.numberFixed);
  await page.getByRole('textbox', { name: 'Dirección *' }).fill(usuario.address);
  await page.getByRole('textbox', { name: 'Correo electrónico *', exact: true }).fill(usuario.email);
  await page.getByRole('textbox', { name: 'Confirmar correo electrónico *' }).fill(usuario.email);

  // Fecha de pago: el input es type="date", así que se setea el value directo
  await page.evaluate((isoDate) => {
    const el = document.getElementById('fechaPago');
    el.value = isoDate;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, toIsoDate(usuario.paymentDate));

  if (usuario.isCompanion) {
    await page.locator('#acompanante').selectOption({ index: 1 });
    await page.getByLabel('Tipo de acompañante').selectOption(usuario.tipoCompanion);
    await page.getByRole('textbox', { name: 'Número de identificación' }).fill(usuario.numberCompanion); // Por el momento el input es de tipo text y no number
    await page.getByRole('textbox', { name: 'Nombre y Apellido' }).fill(usuario.nameCompanion);
}else{
    await page.locator('#acompanante').selectOption({ index: 0 });
}
  // 3. Validar correo electrónico (envía el código OTP)
  await page.getByRole('button', { name: 'Validar correo electrónico' }).click();
  // await page.pause(); //Antes dar click al boton enviar Codigo
  await page.getByRole('button', { name: 'Enviar Código' }).click();

  //Organizando el Backend deberia esperar que llegue el codigo OTP desde el frontend.
  // --- Pausa manual: ingresar el código OTP recibido por correo ---
  console.log('Revisa el correo y digita el código OTP en el campo correspondiente.');
  await page.pause(); // el operador ingresa el código y presiona "Resume" en el inspector


  // (alternativa sin pausa, si ya se tiene el código):
  // await page.getByRole('textbox', { name: 'Digitar código enviado al' }).fill('123456');

  // Aquí puede aparecer el reto visual de reCAPTCHA
  //Validar si se pasa esta opción continuar con el flujo de agendamiento, si no se pasa, se debe resolver manualmente.
  // --- Pausa manual: resolver el reCAPTCHA si aparece ---
  await page.getByRole('checkbox', { name: 'Acepto la política de' }).setChecked(true);
  console.log('Si aparece un reto visual de reCAPTCHA, resuélvelo manualmente.');
  await page.pause();



  // 4. Avanzar — 
  await page.getByRole('button', { name: 'Siguiente' }).click();

  // --- Pausa manual: resolver el reCAPTCHA si aparece ---
  console.log('Si aparece un reto visual de reCAPTCHA, resuélvelo manualmente.');
  await page.pause();

  // 5. Paso 2 — Lugar, fecha y hora
  // Seleccionar la primera sede disponible (ajustar selector si se requiere otra sede)
  await page.locator('.mt-2').first().click();

  // Elegir la fecha más próxima disponible (el sitio marca con cursor:pointer
  // solo los días con cupos; aquí se ejemplifica seleccionando el día 17)
  await page.getByRole('cell', { name: '17' }).click();

  // Elegir la hora más temprana disponible (ajustar el texto según lo mostrado)
  await page.getByText('04:00:00 PM 1 citas').click();

  await page.getByRole('button', { name: 'Siguiente' }).click();

  // 6. Paso 3 — Confirmación
  // (Aquí conviene volver a leer el resumen en pantalla antes de confirmar)
  await page.getByRole('button', { name: 'Confirmar' }).click();

  // Verificar que la solicitud fue aceptada por el servidor (200, no 400)
  const response = await page.waitForResponse((res) =>
    res.url().includes('/createPassportSchedulingRequest')
  );
  console.log('createPassportSchedulingRequest status:', response.status());
  if (response.status() !== 200) {
    throw new Error('El servidor rechazó la solicitud de agendamiento (revisa reCAPTCHA/OTP).');
  }

  // 7. Encuesta de satisfacción -> continuar el flujo real de confirmación
  await page.getByRole('button', { name: 'Calificar y continuar' }).click();
  await page.getByRole('button', { name: 'Tomar cita' }).click();

  // 8. Verificar mensaje final y capturar el link del comprobante
  await page.getByRole('heading', { name: 'Cita agendada con éxito' }).waitFor();
  const comprobanteHref = await page.getByRole('link', { name: 'Descargar comprobante' }).getAttribute('href');
  console.log('¡Cita agendada con éxito! Comprobante:', comprobanteHref);

  await browser.close();
})();