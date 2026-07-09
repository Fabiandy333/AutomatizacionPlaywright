require('dotenv').config();
const { firefox } = require('playwright');

//Normalizar la fecha en el formato DD/MM/YYYY
function normalizeDate(value) {
  const cleaned = value.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    return cleaned;
  }

  const match = cleaned.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!match) {
    throw new Error('Formato de fecha inválido. Usa YYYY-MM-DD o DD/MM/YYYY.');
  }

  const [, day, month, year] = match;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

(async () => {
  const numberDocument = process.env.NUMBER_DOCUMENT;
  const name = process.env.APPLICANT_NAME;
  const numberPhone = process.env.NUMBER_PHONE;
  const address = process.env.ADDRESS;
  const email = process.env.EMAIL;
  const paymentDate = normalizeDate(process.env.PAYMENT_DATE || '');
  const baseUrl = process.env.BASE_URL_QA;

  if (!numberDocument || !name || !numberPhone || !address || !email || !paymentDate) {
    throw new Error('Faltan variables de entorno. Revisa el archivo .env.');
  }

  const browser = await firefox.launch({ headless: false });

  if (browser.isConnected()) {
    console.log('Browser is connected');
    const page = await browser.newPage();
    await page.goto(baseUrl);

    if (await page.locator("//*[@id='databundle_passportschedulingrequest_dniSolicitante']").isVisible()) {
      await page.locator("//*[@id='databundle_passportschedulingrequest_documentTypeSolicitante']").selectOption({ index: 1 });
      await page.locator("//*[@id='databundle_passportschedulingrequest_dniSolicitante']").fill(`${numberDocument}`);
      await page.locator("//*[@id='databundle_passportschedulingrequest_nameApplicant']").fill(name);
      await page.locator("//*[@id='databundle_passportschedulingrequest_passportRequestType']").selectOption({ index: 1 });
      await page.locator("//*[@id='databundle_passportschedulingrequest_cellPhone']").fill(`${numberPhone}`);
      await page.locator("//*[@id='databundle_passportschedulingrequest_address']").fill(address);
      await page.locator("//*[@id='databundle_passportschedulingrequest_email']").fill(email);
      await page.locator("//*[@id='databundle_passportschedulingrequest_confirmemail']").fill(email);
      await page.locator("//*[@id='fechaPago']").fill(paymentDate);

    }
  }
})();
