require("dotenv").config();

const { llenarFormulario } = require("./form");
const fs = require("fs");
const readline = require("readline");
const { firefox } = require("playwright");

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function esperarEnter() {
    return new Promise(resolve => {
        rl.question(
            "\nPresiona ENTER cuando hayas ingresado el código del correo electrónico y estés listo para continuar...",
            () => resolve()
        );
    });
}

(async () => {

    const baseUrl = process.env.BASE_URL_QA;
    console.log("BASE_URL_QA:", baseUrl);

    if (!baseUrl) {
        throw new Error("Falta BASE_URL_QA");
    }

    const usuarios = JSON.parse(
        fs.readFileSync("./users.json", "utf8")
    );

    const browser = await firefox.launch({
        headless: false
    });

    const context = await browser.newContext();

    for (const usuario of usuarios) {

        const page = await context.newPage();

        try {
            await page.goto(baseUrl);
            await llenarFormulario(
                page,
                usuario,
                baseUrl
            );

            console.log(
                "\nEsperando que ingreses el codigo del correo electronico."
            );
            await esperarEnter();

            console.log(
                "\nContinuando con el proceso de registro para el usuario:",
                usuario.name
            );
            await esperarEnter();
            // await page.locator("//*[@id='passportNextStep1']").click();
            // await page.locator("/html/body/main/div[1]/div[1]/div[3]/div[2]/div[1]/div/div[2]/label/span").click();
            
            

        } catch (err) {

            console.error(
                `Error con ${usuario.name}`,
                err.message
            );

        } finally {

            await page.close();

        }

    }

    rl.close();
    await browser.close();

})();