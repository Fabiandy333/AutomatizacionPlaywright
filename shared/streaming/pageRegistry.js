// Mapea executionId -> objeto `page` de Playwright, mientras esa
// ejecucion esta corriendo. Sirve para que el servidor de sockets pueda
// encontrar la pagina correcta cuando alguien pide ver su pantalla.

const paginasActivas = new Map();

function registrar(executionId, page) {
  paginasActivas.set(executionId, page);
}

function quitar(executionId) {
  paginasActivas.delete(executionId);
}

function obtener(executionId) {
  return paginasActivas.get(executionId) || null;
}

module.exports = { registrar, quitar, obtener };