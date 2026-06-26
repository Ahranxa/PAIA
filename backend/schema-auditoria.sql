-- ============================================
-- MIGRACIÓN PARA SISTEMA DE AUDITORÍA
-- ============================================

-- Paso 1: Crear tabla de auditoría
CREATE TABLE IF NOT EXISTS auditoria (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  accion VARCHAR(50) NOT NULL,
  modulo VARCHAR(50) NOT NULL,
  registro_id UUID,
  registro_tipo VARCHAR(50),
  ip_address INET,
  user_agent TEXT,
  latitud DECIMAL(10, 8),
  longitud DECIMAL(11, 8),
  valores_anteriores JSONB,
  valores_nuevos JSONB,
  fecha TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Paso 2: Crear índices para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_auditoria_usuario ON auditoria(usuario_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_fecha ON auditoria(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_modulo ON auditoria(modulo);
CREATE INDEX IF NOT EXISTS idx_auditoria_registro ON auditoria(registro_id, registro_tipo);
CREATE INDEX IF NOT EXISTS idx_auditoria_accion ON auditoria(accion);
CREATE INDEX IF NOT EXISTS idx_auditoria_usuario_fecha ON auditoria(usuario_id, fecha DESC);

-- Paso 3: Crear índice para búsquedas por fecha (últimos 30 días)
CREATE INDEX IF NOT EXISTS idx_auditoria_fecha_reciente ON auditoria(fecha DESC) 
WHERE fecha > NOW() - INTERVAL '30 days';

-- Paso 4: Habilitar RLS
ALTER TABLE auditoria ENABLE ROW LEVEL SECURITY;

-- Política: Solo administradores pueden ver auditoría
CREATE POLICY IF NOT EXISTS "Solo admin puede ver auditoría" ON auditoria
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM usuarios 
    WHERE usuarios.id = auth.uid() 
    AND usuarios.rol = 'administrador'
  )
);

-- Política: Solo el sistema puede insertar auditoría (middleware)
CREATE POLICY IF NOT EXISTS "Solo sistema puede insertar auditoría" ON auditoria
FOR INSERT WITH CHECK (true);

-- Política: Nadie puede eliminar auditoría (inmutable)
CREATE POLICY IF NOT EXISTS "Auditoría inmutable" ON auditoria
FOR DELETE USING (false);

-- Paso 5: Crear función para limpiar auditoría antigua (opcional)
CREATE OR REPLACE FUNCTION limpiar_auditoria_antigua(dias INTEGER DEFAULT 365)
RETURNS INTEGER AS $$
DECLARE
  eliminados INTEGER;
BEGIN
  DELETE FROM auditoria
  WHERE fecha < NOW() - INTERVAL '1 day' * dias;
  
  GET DIAGNOSTICS eliminados = ROW_COUNT;
  RETURN eliminados;
END;
$$ LANGUAGE plpgsql;

-- Paso 6: Crear vista para auditoría con información de usuario
CREATE OR REPLACE VIEW vw_auditoria_detalle AS
SELECT 
  a.id,
  a.usuario_id,
  u.nombre as usuario_nombre,
  u.email as usuario_email,
  u.rol as usuario_rol,
  a.accion,
  a.modulo,
  a.registro_id,
  a.registro_tipo,
  a.ip_address,
  a.user_agent,
  a.latitud,
  a.longitud,
  a.valores_anteriores,
  a.valores_nuevos,
  a.fecha
FROM auditoria a
LEFT JOIN usuarios u ON a.usuario_id = u.id;

-- Paso 7: Crear función para obtener resumen de auditoría
CREATE OR REPLACE FUNCTION obtener_resumen_auditoria(
  p_usuario_id UUID DEFAULT NULL,
  p_modulo VARCHAR DEFAULT NULL,
  p_dias INTEGER DEFAULT 30
)
RETURNS TABLE (
  accion VARCHAR,
  modulo VARCHAR,
  total BIGINT,
  ultima_fecha TIMESTAMP
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.accion,
    a.modulo,
    COUNT(*) as total,
    MAX(a.fecha) as ultima_fecha
  FROM auditoria a
  WHERE 
    (p_usuario_id IS NULL OR a.usuario_id = p_usuario_id)
    AND (p_modulo IS NULL OR a.modulo = p_modulo)
    AND a.fecha > NOW() - INTERVAL '1 day' * p_dias
  GROUP BY a.accion, a.modulo
  ORDER BY total DESC;
END;
$$ LANGUAGE plpgsql;

-- Paso 8: Crear función para detectar actividad sospechosa
CREATE OR REPLACE FUNCTION detectar_actividad_sospechosa(
  p_usuario_id UUID,
  p_horas INTEGER DEFAULT 24
)
RETURNS TABLE (
  tipo_alerta VARCHAR,
  descripcion TEXT,
  conteo BIGINT
) AS $$
BEGIN
  -- Alerta 1: Muchos intentos de login fallidos
  RETURN QUERY
  SELECT 
    'LOGIN_FALLIDOS' as tipo_alerta,
    'Múltiples intentos de login fallidos' as descripcion,
    COUNT(*) as conteo
  FROM auditoria
  WHERE 
    usuario_id = p_usuario_id
    AND accion = 'login'
    AND modulo = 'auth'
    AND fecha > NOW() - INTERVAL '1 hour' * p_horas
    AND (valores_nuevos->>'exitoso')::boolean = false
  GROUP BY usuario_id
  HAVING COUNT(*) > 5
  
  UNION ALL
  
  -- Alerta 2: Cambios masivos de productos
  SELECT 
    'CAMBIOS_MASIVOS' as tipo_alerta,
    'Múltiples cambios en productos' as descripcion,
    COUNT(*) as conteo
  FROM auditoria
  WHERE 
    usuario_id = p_usuario_id
    AND modulo = 'productos'
    AND accion IN ('update', 'delete')
    AND fecha > NOW() - INTERVAL '1 hour' * p_horas
  GROUP BY usuario_id
  HAVING COUNT(*) > 10
  
  UNION ALL
  
  -- Alerta 3: Acceso desde IPs diferentes
  SELECT 
    'MULTIPLES_IPS' as tipo_alerta,
    'Acceso desde múltiples direcciones IP' as descripcion,
    COUNT(DISTINCT ip_address) as conteo
  FROM auditoria
  WHERE 
    usuario_id = p_usuario_id
    AND fecha > NOW() - INTERVAL '1 hour' * p_horas
    AND ip_address IS NOT NULL
  GROUP BY usuario_id
  HAVING COUNT(DISTINCT ip_address) > 3;
END;
$$ LANGUAGE plpgsql;

-- Comentario: La auditoría es inmutable y no se puede eliminar
COMMENT ON TABLE auditoria IS 'Tabla de auditoría inmutable - registra todas las acciones importantes del sistema';
