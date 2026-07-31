require('dotenv').config();

const http = require('http');
const { Server } = require('socket.io');
const app = require('./src/app');
const pageRegistry = require('./shared/streaming/pageRegistry');
const { iniciarScreencast } = require('./shared/streaming/screencast');
const { allowedOrigins, extractToken } = require('./src/security');

const PORT = process.env.PORT || 3000;
if (!process.env.API_AUTH_TOKEN) {
    throw new Error('API_AUTH_TOKEN es obligatorio. Configúralo en el archivo .env.');
}

// http.createServer envuelve el mismo "app" de Express que ya tenias.
// Las rutas HTTP normales (/api/pasaportes/...) siguen funcionando
// exactamente igual; esto solo AGREGA el canal de sockets encima.
const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: allowedOrigins() },
});

io.use((socket, next) => {
    if (!allowedOrigins().includes(socket.handshake.headers.origin)) {
        return next(new Error('Origen no permitido'));
    }
    if (extractToken({ headers: socket.handshake.headers, query: socket.handshake.auth }) !== process.env.API_AUTH_TOKEN) {
        return next(new Error('No autorizado'));
    }
    next();
});


// Streaming de pantalla EN SOLO LECTURA. El cliente unicamente puede
// suscribirse/desuscribirse a ver los fotogramas de una ejecucion — no
// existe (ni debe agregarse) ningun evento de este socket que reenvie
// clics, teclas o coordenadas hacia la pagina.
io.on('connection', (socket) => {
    let detenerScreencastActual = null;

    socket.on('suscribirse-stream', async ({ executionId }) => {
        const page = pageRegistry.obtener(executionId);
        if (!page) {
            socket.emit('stream-error', { executionId, error: 'Esa ejecucion no tiene una ventana activa en este momento' });
            return;
        }

        const { detener } = await iniciarScreencast(page, (frameBase64) => {
            socket.emit('frame', { executionId, data: frameBase64 });
        });
        detenerScreencastActual = detener;
    });

    socket.on('desuscribirse-stream', async () => {
        if (detenerScreencastActual) {
            await detenerScreencastActual();
            detenerScreencastActual = null;
        }
    });

    socket.on('disconnect', async () => {
        if (detenerScreencastActual) {
            await detenerScreencastActual();
        }
    });
});

// OJO: ya no es app.listen(...), es server.listen(...) — porque ahora
// "server" es el que tiene tanto el Express como el Socket.IO adentro.
server.listen(PORT, () => {
    console.log(`Servidor iniciado ${PORT}`);
});
