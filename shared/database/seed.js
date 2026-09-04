const { query } = require('./db');

async function poblarDatosIniciales() {
  console.log('--- Iniciando Seed de datos iniciales en PostgreSQL ---');

  // 1. Roles
  await query(`
    INSERT INTO roles (id, nombre, descripcion, permisos) VALUES
    ('admin', 'Super Administrador', 'Acceso total a la plataforma, gestión de usuarios y configuraciones', 
     '{"ejecutar": true, "configurar": true, "verLogs": true, "verEvidencias": true, "verResultados": true, "verMetricas": true, "programar": true, "ejecucionMasiva": true, "gestionarUsuarios": true, "gestionarProyectos": true}'::jsonb),
    ('qa_lead', 'Líder QA', 'Gestión de casos, estadísticas, reportes y programación masiva',
     '{"ejecutar": true, "configurar": true, "verLogs": true, "verEvidencias": true, "verResultados": true, "verMetricas": true, "programar": true, "ejecucionMasiva": true, "gestionarUsuarios": false, "gestionarProyectos": false}'::jsonb),
    ('qa_automation', 'Ingeniero QA Automation', 'Asociación de scripts, configuración de endpoints y motores',
     '{"ejecutar": true, "configurar": true, "verLogs": true, "verEvidencias": true, "verResultados": true, "verMetricas": true, "programar": true, "ejecucionMasiva": true, "gestionarUsuarios": false, "gestionarProyectos": false}'::jsonb),
    ('analista', 'Analista Funcional', 'Ejecución manual, configuración de datos por formularios, resolución de OTP',
     '{"ejecutar": true, "configurar": true, "verLogs": true, "verEvidencias": true, "verResultados": true, "verMetricas": false, "programar": false, "ejecucionMasiva": false, "gestionarUsuarios": false, "gestionarProyectos": false}'::jsonb),
    ('desarrollador', 'Desarrollador', 'Consulta de logs técnicos, screenshots, videos y errores para depuración',
     '{"ejecutar": false, "configurar": false, "verLogs": true, "verEvidencias": true, "verResultados": true, "verMetricas": false, "programar": false, "ejecucionMasiva": false, "gestionarUsuarios": false, "gestionarProyectos": false}'::jsonb),
    ('auditor', 'Auditor / Solo Lectura', 'Solo lectura de métricas, reportes y evidencias',
     '{"ejecutar": false, "configurar": false, "verLogs": true, "verEvidencias": true, "verResultados": true, "verMetricas": true, "programar": false, "ejecucionMasiva": false, "gestionarUsuarios": false, "gestionarProyectos": false}'::jsonb)
    ON CONFLICT (id) DO UPDATE SET permisos = EXCLUDED.permisos, nombre = EXCLUDED.nombre;
  `);

  // 2. Usuarios
  await query(`
    INSERT INTO usuarios (username, email, nombre, apellido, password_hash, rol_id) VALUES
    ('admin', 'admin@playtech.com', 'Admin', 'General', 'admin123', 'admin'),
    ('analista', 'analista@playtech.com', 'Carlos', 'Analista', 'analista123', 'analista'),
    ('auditor', 'auditor@playtech.com', 'Maria', 'Auditora', 'auditor123', 'auditor')
    ON CONFLICT (username) DO NOTHING;
  `);

  // 3. Motores de automatización
  await query(`
    INSERT INTO motores_automatizacion (id, nombre, tipo, descripcion) VALUES
    ('playwright', 'Playwright Engine', 'ui', 'Automatización de interfaz web con Playwright y navegadores Chromium/Firefox/WebKit'),
    ('api_rest', 'API REST Engine', 'api', 'Ejecución de pruebas automatizadas a servicios RESTful'),
    ('sql', 'Database Verification Engine', 'db', 'Pruebas de verificación de integridad y datos en bases de datos'),
    ('rpa', 'RPA Engine', 'rpa', 'Automatización de procesos robóticos de escritorio'),
    ('mobile', 'Appium / Mobile Engine', 'mobile', 'Automatización para aplicaciones móviles Android/iOS')
    ON CONFLICT (id) DO NOTHING;
  `);

  // 4. Empresas
  await query(`
    INSERT INTO empresas (id, nombre, descripcion) VALUES
    ('enigma', 'Enigma', 'Empresa cliente con proyectos externos'),
    ('playtech', 'PlayTech', 'Empresa principal y proyectos internos')
    ON CONFLICT (id) DO NOTHING;
  `);

  // 5. Proyectos
  await query(`
    INSERT INTO proyectos (id, empresa_id, nombre, descripcion, modulo_backend) VALUES
    ('loteria-valle', 'enigma', 'Loteria del Valle', 'Gestión de casos de soporte y compras de Lotería del Valle', 'loteria-valle'),
    ('pasaportes', 'enigma', 'Pasaportes', 'Automatización de citas y validaciones para la Gobernación del Valle', 'pasaportes'),
    ('gmv', 'enigma', 'Gestion movil de ventas', 'Gestión móvil de ventas GMV', 'gmv'),
    ('octoplus', 'playtech', 'Octoplus', 'Módulo interno Octoplus', 'octoplus'),
    ('directory', 'playtech', 'Directory', 'Módulo interno Directory', 'directory'),
    ('sms', 'playtech', 'SMS', 'Plataforma internacional de mensajería SMS', 'sms'),
    ('smartbot', 'playtech', 'SmartBot', 'Bot conversacional inteligente', 'smartbot'),
    ('tu-viaje', 'playtech', 'Tu Viaje', 'Plataforma Tu Viaje', 'tu-viaje')
    ON CONFLICT (id) DO NOTHING;
  `);

  // 6. Ambientes de prueba por proyecto
  await query(`
    INSERT INTO ambientes (proyecto_id, codigo, nombre, url_base) VALUES
    ('pasaportes', 'QA', 'Ambiente QA Pasaportes', 'https://passports.appoloatiende.com/home/agendar'),
    ('pasaportes', 'PROD', 'Ambiente Producción Pasaportes', 'https://pasaportes.valledelcauca.gov.co/home/agendar'),
    ('sms', 'QA', 'Ambiente QA SMS', 'https://sms-internacional.playtechla.com/SMSInternacional/app/pages/login.xhtml')
    ON CONFLICT (proyecto_id, codigo) DO NOTHING;
  `);

  // 7. Planes de prueba
  await query(`
    INSERT INTO planes_prueba (id, proyecto_id, nombre, descripcion) VALUES
    ('flujo-agendamiento', 'pasaportes', 'Flujo agendamiento', 'Plan de prueba automatizado para el agendamiento de citas de pasaportes'),
    ('flujo-soporte', 'loteria-valle', 'Flujo Soporte', 'Plan de prueba para gestión de solicitudes y tickets de soporte'),
    ('flujo-login', 'sms', 'Flujo Login', 'Validación de autenticación en la plataforma SMS')
    ON CONFLICT (id) DO NOTHING;
  `);

  console.log('✓ Datos iniciales (Roles, Usuarios, Empresas, Proyectos, Ambientes y Planes) insertados.');
}

if (require.main === module) {
  poblarDatosIniciales()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Error durante el seed:', err);
      process.exit(1);
    });
}

module.exports = { poblarDatosIniciales };
