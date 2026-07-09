# Cargue de Usuarios

Automatización desarrollada con Playwright para realizar el cargue de usuarios en el Portal de Pasaportes de la Gobernación del Valle.

## Tecnologías

- Node.js
- Playwright
- Dotenv

## Instalación

```bash
npm install

## Configuración

NUMBER_DOCUMENT= 
APPLICANT_NAME=
NUMBER_PHONE=
ADDRESS=
EMAIL=
PAYMENT_DATE=
BASE_URL_QA=

## Ejecución

npm start

---

## Escalabilidad futura

Cuando crees otra automatización:

```text
pasaportes-gobernacion-valle/
│
├── cargue-usuarios/
├── actualizar-usuarios/
├── consultar-citas/
└── generar-reportes/

Cada una tendrá:

.env
package.json
src/
README.md