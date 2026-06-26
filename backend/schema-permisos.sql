-- ============================================
-- MIGRACIÓN PARA SISTEMA DE PERMISOS Y ROLES
-- ============================================

-- Paso 1: Crear tabla de permisos
CREATE TABLE IF NOT EXISTS permisos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo VARCHAR(50) UNIQUE NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  descripcion TEXT,
  modulo VARCHAR(50) NOT NULL,
  activo BOOLEAN DEFAULT TRUE,
  fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insertar permisos base
INSERT INTO permisos (codigo, nombre, descripcion, modulo) VALUES
('product.create', 'Crear productos', 'Permite crear nuevos productos', 'productos'),
('product.edit', 'Editar productos', 'Permite editar productos existentes', 'productos'),
('product.delete', 'Eliminar productos', 'Permite eliminar productos', 'productos'),
('category.manage', 'Gestionar categorías', 'Permite crear, editar y eliminar categorías', 'categorias'),
('stock.entry', 'Registrar entradas', 'Permite registrar entradas de stock', 'stock'),
('stock.exit', 'Registrar salidas', 'Permite registrar salidas de stock', 'stock'),
('stock.adjust', 'Ajustar stock manual', 'Permite ajustar stock manualmente', 'stock'),
('stock.transfer', 'Transferir stock', 'Permite transferir stock entre ubicaciones', 'stock'),
('inventory.view', 'Ver inventario', 'Permite ver el inventario', 'inventario'),
('movement.view', 'Ver movimientos', 'Permite ver el historial de movimientos', 'movimientos'),
('dashboard.view', 'Ver dashboard', 'Permite ver el dashboard y estadísticas', 'dashboard'),
('reports.view', 'Ver reportes', 'Permite ver reportes avanzados', 'reportes'),
('alerts.manage', 'Gestionar alertas', 'Permite gestionar alertas de stock bajo', 'alertas'),
('users.manage', 'Gestionar usuarios', 'Permite gestionar usuarios', 'usuarios'),
('roles.manage', 'Gestionar roles', 'Permite gestionar roles y permisos', 'roles'),
('gps.view', 'Ver ubicación GPS', 'Permite ver ubicación GPS de movimientos', 'gps'),
('audit.view', 'Ver auditoría', 'Permite ver el log de auditoría', 'auditoría'),
('ai.read', 'Leer análisis IA', 'Permite leer análisis de IA', 'ia'),
('ai.suggest', 'Recibir sugerencias IA', 'Permite recibir sugerencias de IA', 'ia'),
('settings.manage', 'Gestionar configuración', 'Permite gestionar configuración del sistema', 'configuración')
ON CONFLICT (codigo) DO NOTHING;

-- Paso 2: Crear tabla de roles
CREATE TABLE IF NOT EXISTS roles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre VARCHAR(50) UNIQUE NOT NULL,
  descripcion TEXT,
  activo BOOLEAN DEFAULT TRUE,
  fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insertar roles base
INSERT INTO roles (nombre, descripcion) VALUES
('administrador', 'Acceso completo al sistema'),
('responsable_inventario', 'Administra productos, stock y reportes'),
('supervisor', 'Solo consulta dashboards, reportes y auditoría'),
('operador', 'Solo registra entradas y salidas autorizadas'),
('auditor', 'Acceso exclusivo de lectura a historial y auditoría')
ON CONFLICT (nombre) DO NOTHING;

-- Paso 3: Crear tabla de relación roles-permisos
CREATE TABLE IF NOT EXISTS roles_permisos (
  rol_id UUID REFERENCES roles(id) ON DELETE CASCADE,
  permiso_id UUID REFERENCES permisos(id) ON DELETE CASCADE,
  PRIMARY KEY (rol_id, permiso_id)
);

-- Paso 4: Asignar permisos a roles

-- Administrador: Todos los permisos
INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r, permisos p
WHERE r.nombre = 'administrador'
ON CONFLICT DO NOTHING;

-- Responsable de Inventario
INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r, permisos p
WHERE r.nombre = 'responsable_inventario'
AND p.codigo IN (
  'product.create', 'product.edit', 'product.delete',
  'category.manage',
  'stock.entry', 'stock.exit', 'stock.adjust', 'stock.transfer',
  'inventory.view', 'movement.view',
  'dashboard.view', 'reports.view',
  'alerts.manage',
  'gps.view'
)
ON CONFLICT DO NOTHING;

-- Supervisor
INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r, permisos p
WHERE r.nombre = 'supervisor'
AND p.codigo IN (
  'inventory.view', 'movement.view',
  'dashboard.view', 'reports.view',
  'audit.view',
  'ai.read'
)
ON CONFLICT DO NOTHING;

-- Operador
INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r, permisos p
WHERE r.nombre = 'operador'
AND p.codigo IN (
  'stock.entry', 'stock.exit',
  'inventory.view', 'movement.view'
)
ON CONFLICT DO NOTHING;

-- Auditor
INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r, permisos p
WHERE r.nombre = 'auditor'
AND p.codigo IN (
  'movement.view',
  'audit.view'
)
ON CONFLICT DO NOTHING;

-- Paso 5: Actualizar tabla de usuarios para soportar rol_id
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS rol_id UUID REFERENCES roles(id);

-- Paso 6: Migrar usuarios existentes a nuevos roles
-- Administrador antiguo -> administrador
UPDATE usuarios u
SET rol_id = r.id
FROM roles r
WHERE u.rol = 'administrador' AND r.nombre = 'administrador';

-- Editor antiguo -> responsable_inventario
UPDATE usuarios u
SET rol_id = r.id
FROM roles r
WHERE u.rol = 'editor' AND r.nombre = 'responsable_inventario';

-- Usuario antiguo -> operador
UPDATE usuarios u
SET rol_id = r.id
FROM roles r
WHERE u.rol = 'usuario' AND r.nombre = 'operador';

-- Paso 7: Crear índices
CREATE INDEX IF NOT EXISTS idx_permisos_codigo ON permisos(codigo);
CREATE INDEX IF NOT EXISTS idx_permisos_modulo ON permisos(modulo);
CREATE INDEX IF NOT EXISTS idx_roles_nombre ON roles(nombre);
CREATE INDEX IF NOT EXISTS idx_roles_permisos_rol ON roles_permisos(rol_id);
CREATE INDEX IF NOT EXISTS idx_roles_permisos_permiso ON roles_permisos(permiso_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_rol_id ON usuarios(rol_id);

-- Paso 8: Habilitar RLS en nuevas tablas
ALTER TABLE permisos ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles_permisos ENABLE ROW LEVEL SECURITY;

-- Políticas de seguridad (permitir todo para desarrollo, ajustar en producción)
CREATE POLICY "Permitir todo en permisos" ON permisos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir todo en roles" ON roles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir todo en roles_permisos" ON roles_permisos FOR ALL USING (true) WITH CHECK (true);
