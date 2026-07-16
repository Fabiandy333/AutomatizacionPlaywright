# Cargue de Usuarios

Automatización desarrollada con Playwright para realizar el cargue de usuarios en el Portal de Pasaportes de la Gobernación del Valle.

## Tecnologías

- Node.js
- Playwright
- Dotenv

## Configuración del users.json

[
  {
    "numberDocument": "98245678",
    "name": "Luz Marina Gonzalez",
    "numberPhone": "123456",
    "address": "Calle 10 #20-30 ",
    "email": "ejemplocorreoprueba.qa@dominio.com",
    "paymentDate": "08/12/2026"
  }]

## Instalación

```bash
npm install


## Ejecución

npm start

---

## Escalabilidad futura

Cuando crees otra automatización:

```text
pasaportes-gobernacion-valle/
│
├── cargue-usuarios/


Cada una tendrá:

.env
package.json
src/
users.json
README.md