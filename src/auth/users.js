/*
 * Configuración de usuarios y roles (MVP).
 *
 * Los usuarios NO se guardan en base de datos todavía: se definen
 * mediante variables de entorno (password) para no exponer claves en
 * el repositorio. La estructura ya contempla el paso futuro a
 * PostgreSQL (usuarios + roles + permisos).
 *
 * Cada usuario tiene:
 *   - username
 *   - password  (leída de .env)
 *   - rol       (admin | qa-lead | analista | auditor)
 *   - proyectosVisibles: '*' (todos) o array de ids de empresa/proyecto.
 *     Se puede filtrar el sidebar por empresa (enigma, playtech) o por
 *     proyecto/subproyecto (pasaportes, sms, loteria-valle, ...).
 */

// Mapa de capacidades por rol. Los roles disponibles en el frontend
// deben coincidir con estas claves.
const ROLES = {
  admin: {
    nombre: 'Administrador',
    permisos: {
      ejecutar: true,
      configurar: true,
      verLogs: true,
      verEvidencias: true,
      verResultados: true,
      verMetricas: true,
      programar: true,
      ejecucionMasiva: true,
      gestionarUsuarios: true,
      gestionarProyectos: true,
    },
  },
  'qa-lead': {
    nombre: 'QA Lead',
    permisos: {
      ejecutar: true,
      configurar: true,
      verLogs: true,
      verEvidencias: true,
      verResultados: true,
      verMetricas: true,
      programar: true,
      ejecucionMasiva: true,
      gestionarUsuarios: false,
      gestionarProyectos: false,
    },
  },
  analista: {
    nombre: 'Analista QA',
    permisos: {
      ejecutar: true,
      configurar: true,
      verLogs: true,
      verEvidencias: true,
      verResultados: true,
      verMetricas: false,
      programar: false,
      ejecucionMasiva: false,
      gestionarUsuarios: false,
      gestionarProyectos: false,
    },
  },
  auditor: {
    nombre: 'Auditor',
    permisos: {
      ejecutar: false,
      configurar: false,
      verLogs: true,
      verEvidencias: true,
      verResultados: true,
      verMetricas: true,
      programar: false,
      ejecucionMasiva: false,
      gestionarUsuarios: false,
      gestionarProyectos: false,
    },
  },
};

function parseProyectosVisibles(raw) {
  if (raw === '*' || raw === undefined || raw === null || raw === '') {
    return '*';
  }

  return String(raw)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

/*
 * Lee la definición de usuarios desde APP_USERS (JSON) en .env.
 *
 * Ejemplo de APP_USERS:
 * [
 *   { "username": "admin",  "passwordEnv": "PASS_ADMIN",  "rol": "admin",    "proyectos": "*" },
 *   { "username": "andres", "passwordEnv": "PASS_ANALISTA","rol":"analista", "proyectos": "enigma" }
 * ]
 *
 * passwordEnv indica el NOMBRE de la variable de entorno que contiene
 * la contraseña real (así el .env no lleva la clave embebida en un JSON
 * enorme y podemos reciclar valores).
 */
function cargarUsuariosDesdeEnv() {
  const raw = process.env.APP_USERS;

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);

    return (Array.isArray(parsed) ? parsed : []).map((item) => ({
      username: String(item.username || '').trim(),
      password: process.env[item.passwordEnv] || '',
      rol: item.rol || 'analista',
      proyectosVisibles: parseProyectosVisibles(
        item.proyectos ?? item.proyectosVisibles,
      ),
    }));
  } catch (error) {
    console.error('[auth] No se pudo parsear APP_USERS:', error.message);

    return [];
  }
}

// Fallback local de desarrollo si APP_USERS no está definida.
// Las contraseñas también se leen de variables de entorno para que el
// código en sí no contenga claves.
function usuariosFallback() {
  return [
    {
      username: 'admin',
      password: process.env.PASS_ADMIN || 'admin123',
      rol: 'admin',
      proyectosVisibles: '*',
    },
    {
      username: 'analista',
      password: process.env.PASS_ANALISTA || 'analista123',
      rol: 'analista',
      proyectosVisibles: '*',
    },
    {
      username: 'auditor',
      password: process.env.PASS_AUDITOR || 'auditor123',
      rol: 'auditor',
      proyectosVisibles: '*',
    },
  ];
}

function getUsuarios() {
  const desdeEnv = cargarUsuariosDesdeEnv();

  if (desdeEnv.length > 0) {
    return desdeEnv;
  }

  return usuariosFallback();
}

function findUser(username) {
  return getUsuarios().find(
    (user) => user.username.toLowerCase() === String(username || '').toLowerCase(),
  ) || null;
}

function puede(premisos, permiso) {
  return Boolean(premisos && premisos[permiso]);
}

module.exports = {
  ROLES,
  getUsuarios,
  findUser,
  puede,
};
