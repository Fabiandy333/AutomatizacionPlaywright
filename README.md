# Automatización Playwright — Backend

Backend modular en Node/Express para orquestar las automatizaciones de QA
de todos los proyectos (Pasaportes, Octoplus, Directory, SMS, SmartBot,
Tu Viaje), disparadas desde el dashboard de React.

## Estructura general

```
modules/
  <proyecto>/
    automations/     Scripts de Playwright del proyecto
    data/             Plantillas de datos (usuarios, payloads de ejemplo)
    routes/           Rutas HTTP del proyecto (<proyecto>.routes.js)
    services/         Logica de negocio (<proyecto>.service.js)
    index.js          Punto de entrada del modulo: health-check + delega a routes/

shared/
  queue/              Mecanismo de espera de input humano (OTP, reCAPTCHA)
  logger/              Log estructurado por ejecucion
  database/           Estado de cada ejecucion (repositorio)
  playwright/          Helper comun para lanzar el navegador
  constants/            Constantes compartidas entre modulos
  helpers/               Utilidades compartidas entre modulos

src/
  app.js              Registra cada modulo bajo su namespace /api/<proyecto>

server.js             Arranque del servidor (lee .env, levanta app.js)
```

## Convención de rutas por proyecto

Cada proyecto vive bajo su propio namespace `/api/<proyecto>/...`. Todos
siguen el mismo patrón, salvo el nombre de la acción que dispara la
automatización (porque cada proyecto automatiza algo distinto):

| Ruta | Método | Para qué sirve |
|---|---|---|
| `/api/<proyecto>/` | GET | Health-check del módulo |
| `/api/<proyecto>/<accion>` | POST | Dispara la automatización (`agendar`, `enviar`, `crear-caso`, etc.) |
| `/api/<proyecto>/:executionId/otp` | POST | Entrega el código OTP pendiente |
| `/api/<proyecto>/:executionId/recaptcha-resuelto/:paso` | POST | Confirma que el reCAPTCHA de ese paso ya fue resuelto |
| `/api/<proyecto>/:executionId/estado` | GET | Estado actual de esa ejecución |
| `/api/<proyecto>/:executionId/log` | GET | Historial de log de esa ejecución |

`otp`, `recaptcha-resuelto`, `estado` y `log` se mantienen **iguales** en
todos los proyectos — así el frontend puede consultarlos con una sola
función genérica sin importar de qué proyecto se trate:

```javascript
function obtenerEstado(proyecto, executionId) {
  return fetch(`http://localhost:3000/api/${proyecto}/${executionId}/estado`).then(r => r.json())
}
```

Nombres de `<accion>` ya definidos:
- `pasaportes` → `/agendar`
- `sms` → `/enviar` (pendiente de implementar)
- `smartbot` → `/conversar` (pendiente de implementar)
- Lotería del Valle (dentro de Enigma) → `/crear-caso` (pendiente de implementar, corresponde al CSV "Flujo Soporte")

## `app.js` — registrar módulos

```javascript
const express = require('express');
const app = express();

app.use(express.json());

app.use('/api/pasaportes', require('../modules/pasaportes'));
app.use('/api/octoplus', require('../modules/octoplus'));
app.use('/api/directory', require('../modules/directory'));
app.use('/api/sms', require('../modules/sms'));
app.use('/api/smartbot', require('../modules/smartbot'));
app.use('/api/tu-viaje', require('../modules/tu-viaje'));

module.exports = app;
```

Agregar un proyecto nuevo es: duplicar la carpeta `modules/pasaportes`,
renombrarla, ajustar `automations/`, `routes/` y `services/` al caso de
uso propio, y agregar una línea en `app.js`.

## Patrón del `index.js` de cada módulo

```javascript
const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
    res.json({ modulo: "Pasaportes", estado: "OK" });
});

router.use(require("./routes/pasaportes.routes"));

module.exports = router;
```

`index.js` es solo la puerta de entrada (health-check); **todas** las
rutas reales (`/agendar`, `/:executionId/otp`, etc.) viven en
`routes/<proyecto>.routes.js`, que a su vez llama a
`services/<proyecto>.service.js`.

## El problema que resuelve `shared/queue/pendingSignals.js`

Los scripts de Playwright necesitan pausar en dos puntos donde solo un
humano puede continuar:
- **OTP**: el código llega al correo del titular
- **reCAPTCHA**: existe justamente para verificar que hay un humano

En un script suelto eso se resolvía con `page.pause()`. En el backend,
`pendingSignals.waitFor(key)` congela esa línea del `async function` en
una `Promise` hasta que otra parte del backend (la ruta que recibe el
POST del frontend) llama a `resolveSignal(key, valor)`:

```javascript
// dentro de la automatizacion:
const codigoOtp = await pendingSignals.waitFor(`${executionId}:otp`);

// en la ruta, cuando el frontend manda el codigo:
pasaportesService.recibirCodigoOtp(executionId, req.body.codigo);
// -> pendingSignals.resolveSignal(`${executionId}:otp`, codigo)
```

**Importante:** el OTP lo puede resolver cualquier frontend remoto (el
código llega al correo, que puede estar en cualquier parte). El
reCAPTCHA **no** — solo lo puede resolver quien está físicamente viendo
esa ventana del navegador en el servidor. El endpoint
`/recaptcha-resuelto/:paso` está pensado para un panel de operador
interno, no para exponerlo como botón público, hasta que exista una
vista remota del navegador (streaming de pantalla + reenvío de clics).

## Estados posibles de una ejecución

`pendiente` → `en_progreso` → `esperando_otp` → `esperando_recaptcha` →
`en_progreso` → `exitoso` | `fallido`

Se consultan con `GET /api/<proyecto>/:executionId/estado`.

## Módulo Pasaportes — estado actual

- `automations/agendar_cita_pasaporte.js` — archivo único con todo el
  paso a paso (datos personales, acompañante, OTP real vía
  `pendingSignals`, los dos puntos de reCAPTCHA, selección de sede/fecha/
  hora, confirmación, verificación de la respuesta 200 del servidor, y
  captura del link del comprobante)
- `data/usuarios-plantilla.js` — arreglo de ejemplo con 6 usuarios
  (formato `module.exports`, no `export default` — eso es solo para el
  frontend en Vite/React)
- `services/pasaportes.service.js` — `iniciarAgendamiento` (un usuario)
  e `iniciarLote` (arreglo completo, se corren uno detrás de otro, nunca
  en paralelo, porque el mismo operador atiende el OTP y el reCAPTCHA)
- `routes/pasaportes.routes.js` — todas las rutas del módulo

## Frontend (dashboard React + Vite)

- Cada caso de prueba puede tener un botón de engranaje que abre un
  modal (`ConfigModal.jsx`) con el JSON que se va a enviar, editable
  antes de confirmar
- El modal soporta un prop `endpoint`: si se pasa, al presionar
  "Iniciar" hace el `POST` directo al backend y devuelve
  `{ payload, backend }` con la respuesta real (incluyendo los
  `executionId` generados)

## Pendiente / próximos pasos

- Conectar `LogPanel.jsx` del dashboard a polling real de `/estado` y
  `/log` (hoy simula con `setTimeout`)
- Implementar `automations`, `routes` y `services` de Octoplus,
  Directory, SMS, SmartBot y Tu Viaje siguiendo el mismo patrón
- Implementar el caso "Lotería del Valle / Flujo Soporte" usando el CSV
  ya parseado (`loteria-valle-soporte.json`)
- Decidir si el streaming de log se hace por Server-Sent Events o
  WebSocket