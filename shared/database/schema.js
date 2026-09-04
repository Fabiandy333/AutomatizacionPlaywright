const { query } = require('./db');

/**
 * Script de migración DDL que crea todas las tablas de QA Automation Suite
 * conforme a las especificaciones y jerarquías del sistema:
 *   - roles, usuarios, usuario_proyectos
 *   - empresas, proyectos, ambientes, motores_automatizacion
 *   - planes_prueba, secciones_prueba, casos_prueba, configuraciones_caso
 *   - ejecuciones, logs_ejecucion, evidencias_ejecucion
 */
async function migrar() {
  console.log('--- Iniciando migración de base de datos ---');

  await query(`
    -- Extensiones necesarias
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

    -- 1. Roles
    CREATE TABLE IF NOT EXISTS roles (
      id VARCHAR(50) PRIMARY KEY,
      nombre VARCHAR(100) NOT NULL,
      descripcion TEXT,
      permisos JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- 2. Usuarios
    CREATE TABLE IF NOT EXISTS usuarios (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      username VARCHAR(50) UNIQUE NOT NULL,
      email VARCHAR(150),
      nombre VARCHAR(100),
      apellido VARCHAR(100),
      password_hash VARCHAR(255) NOT NULL,
      rol_id VARCHAR(50) REFERENCES roles(id) ON UPDATE CASCADE,
      activo BOOLEAN DEFAULT TRUE,
      ultimo_acceso TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- 3. Empresas (Enigma, PlayTech, etc.)
    CREATE TABLE IF NOT EXISTS empresas (
      id VARCHAR(50) PRIMARY KEY,
      nombre VARCHAR(100) NOT NULL,
      descripcion TEXT,
      activo BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- 4. Proyectos (Pasaportes, Loteria del Valle, SMS, GMV, etc.)
    CREATE TABLE IF NOT EXISTS proyectos (
      id VARCHAR(50) PRIMARY KEY,
      empresa_id VARCHAR(50) NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      nombre VARCHAR(100) NOT NULL,
      descripcion TEXT,
      modulo_backend VARCHAR(50),
      activo BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- 5. Relación Usuarios <-> Proyectos (Control de acceso)
    CREATE TABLE IF NOT EXISTS usuario_proyectos (
      usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      proyecto_id VARCHAR(50) NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
      PRIMARY KEY (usuario_id, proyecto_id)
    );

    -- 6. Ambientes (QA, DEV, UAT, PROD)
    CREATE TABLE IF NOT EXISTS ambientes (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      proyecto_id VARCHAR(50) NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
      codigo VARCHAR(20) NOT NULL, -- QA, DEV, UAT, PROD
      nombre VARCHAR(100),
      url_base TEXT,
      variables_config JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(proyecto_id, codigo)
    );

    -- 7. Motores de automatización (Playwright, API REST, SQL, RPA, Mobile)
    CREATE TABLE IF NOT EXISTS motores_automatizacion (
      id VARCHAR(50) PRIMARY KEY,
      nombre VARCHAR(100) NOT NULL,
      tipo VARCHAR(50) NOT NULL, -- ui, api, db, rpa, mobile
      descripcion TEXT,
      activo BOOLEAN DEFAULT TRUE
    );

    -- 8. Planes de prueba (Flujo Agendamiento, Flujo Soporte, etc.)
    CREATE TABLE IF NOT EXISTS planes_prueba (
      id VARCHAR(100) PRIMARY KEY,
      proyecto_id VARCHAR(50) NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
      nombre VARCHAR(150) NOT NULL,
      descripcion TEXT,
      version VARCHAR(20) DEFAULT '1.0',
      activo BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- 9. Secciones de prueba
    CREATE TABLE IF NOT EXISTS secciones_prueba (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      plan_id VARCHAR(100) NOT NULL REFERENCES planes_prueba(id) ON DELETE CASCADE,
      nombre VARCHAR(150) NOT NULL,
      orden INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- 10. Casos de prueba
    CREATE TABLE IF NOT EXISTS casos_prueba (
      id VARCHAR(50) PRIMARY KEY, -- PST-QA-01, etc.
      seccion_id UUID NOT NULL REFERENCES secciones_prueba(id) ON DELETE CASCADE,
      criterio TEXT NOT NULL,
      pasos JSONB DEFAULT '[]'::jsonb,
      tipo VARCHAR(50) DEFAULT 'funcional',
      motor_id VARCHAR(50) REFERENCES motores_automatizacion(id),
      script_identificador VARCHAR(150),
      prioridad VARCHAR(20) DEFAULT 'media',
      activo BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- 11. Configuraciones de caso (schemas dinámicos y templates)
    CREATE TABLE IF NOT EXISTS configuraciones_caso (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      caso_id VARCHAR(50) UNIQUE NOT NULL REFERENCES casos_prueba(id) ON DELETE CASCADE,
      schema_formulario JSONB,
      template_datos JSONB,
      endpoint_override TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- 12. Ejecuciones
    CREATE TABLE IF NOT EXISTS ejecuciones (
      id VARCHAR(100) PRIMARY KEY, -- executionId (UUID o slug)
      caso_id VARCHAR(50) REFERENCES casos_prueba(id) ON DELETE SET NULL,
      proyecto_id VARCHAR(50) REFERENCES proyectos(id) ON DELETE SET NULL,
      ambiente_id UUID REFERENCES ambientes(id) ON DELETE SET NULL,
      usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
      tipo_disparo VARCHAR(30) DEFAULT 'manual', -- manual, masivo, programado
      estado VARCHAR(50) NOT NULL DEFAULT 'pendiente', -- pendiente, en_cola, en_progreso, esperando_otp, exitoso, fallido
      posicion_cola INT,
      total_cola INT,
      datos_entrada JSONB,
      resultado JSONB,
      comprobante_url TEXT,
      error_mensaje TEXT,
      duracion_ms INT,
      iniciado_en TIMESTAMPTZ,
      finalizado_en TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- 13. Logs de ejecución
    CREATE TABLE IF NOT EXISTS logs_ejecucion (
      id BIGSERIAL PRIMARY KEY,
      ejecucion_id VARCHAR(100) NOT NULL REFERENCES ejecuciones(id) ON DELETE CASCADE,
      tipo VARCHAR(20) NOT NULL DEFAULT 'info', -- info, ok, fail, warn
      mensaje TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- 14. Evidencias de ejecución (screenshots, comprobantes, videos)
    CREATE TABLE IF NOT EXISTS evidencias_ejecucion (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      ejecucion_id VARCHAR(100) NOT NULL REFERENCES ejecuciones(id) ON DELETE CASCADE,
      tipo VARCHAR(30) NOT NULL, -- screenshot, video, pdf, url
      titulo VARCHAR(150),
      ruta_o_url TEXT NOT NULL,
      tamano_bytes BIGINT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Índices para optimizar consultas frecuentes
    CREATE INDEX IF NOT EXISTS idx_ejecuciones_caso ON ejecuciones(caso_id);
    CREATE INDEX IF NOT EXISTS idx_ejecuciones_proyecto ON ejecuciones(proyecto_id);
    CREATE INDEX IF NOT EXISTS idx_ejecuciones_estado ON ejecuciones(estado);
    CREATE INDEX IF NOT EXISTS idx_ejecuciones_created_at ON ejecuciones(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_logs_ejecucion ON logs_ejecucion(ejecucion_id, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_evidencias_ejecucion ON evidencias_ejecucion(ejecucion_id);
  `);

  console.log('✓ Tablas e índices creados exitosamente en PostgreSQL.');
}

if (require.main === module) {
  migrar()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Error durante la migración:', err);
      process.exit(1);
    });
}

module.exports = { migrar };
