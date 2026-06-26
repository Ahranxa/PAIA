# Análisis y Propuesta de Evolución a ERP Ligero

## 1. Análisis de Arquitectura Actual

### 1.1 Estructura del Proyecto
```
inventory-management-app/
├── server.js (Express.js backend)
├── frontend/
│   ├── app.js (JavaScript vanilla)
│   ├── index.html
│   └── config.js
├── backend/
│   ├── server.js (copia antigua)
│   └── supabase-schema.sql
└── package.json
```

### 1.2 Stack Tecnológico
- **Backend**: Express.js + Supabase Client
- **Frontend**: JavaScript Vanilla + Tailwind CSS (CDN)
- **Base de Datos**: Supabase (PostgreSQL)
- **Despliegue**: Render

### 1.3 Autenticación Actual
- **Mecanismo**: Email/Password en texto plano
- **Almacenamiento**: localStorage en frontend
- **Validación**: Comparación directa de strings
- **Riesgo**: CRÍTICO - contraseñas no hasheadas

```javascript
// Autenticación actual (INSEGURA)
const { data: usuario, error } = await supabase
  .from('usuarios')
  .select('*')
  .eq('email', email)
  .eq('password', password)  // Texto plano
  .single();
```

### 1.4 Roles Existentes
- `usuario`: Rol base sin permisos específicos
- `editor`: Puede editar productos
- `administrador`: Acceso completo

**Problema**: Roles fijos, sin flexibilidad para agregar nuevos roles o permisos.

### 1.5 Estructura de Base de Datos

#### Tablas Actuales
- `usuarios`: id, nombre, email, password, rol, activo
- `productos`: id, nombre, descripcion, categoria, stock, stock_minimo, precios, sku
- `movimientos`: id, producto_id, usuario_id, tipo, cantidad, stock_anterior, stock_nuevo, motivo, latitud, longitud, fecha
- `categorias`: id, nombre, descripcion, activo

#### Índices Existentes
- idx_productos_categoria
- idx_productos_sku
- idx_movimientos_producto
- idx_movimientos_fecha
- idx_movimientos_usuario
- idx_categorias_nombre
- idx_usuarios_email

### 1.6 Cálculo de Stock

**Método Actual**: Stock se almacena como campo en tabla `productos` y se actualiza directamente.

```javascript
// Flujo actual de movimiento
1. Leer stock actual del producto
2. Calcular nuevo stock (stock + cantidad o stock - cantidad)
3. Actualizar producto con nuevo stock
4. Registrar movimiento
```

**Problemas Detectados**:
1. **Race Condition**: Dos movimientos simultáneos pueden sobrescribirse
2. **Inconsistencia**: Si falla el registro del movimiento, el stock ya fue actualizado
3. **No hay transacciones**: Las operaciones no son atómicas

### 1.7 Seguridad Actual

#### RLS (Row Level Security)
```sql
-- Política actual: PERMITE TODO
CREATE POLICY "Permitir todo en productos" ON productos 
FOR ALL USING (true) WITH CHECK (true);
```

**Problemas**:
- RLS configurado pero sin restricciones reales
- No hay validación de roles en backend
- Cualquier usuario autenticado puede hacer cualquier operación

#### Endpoints Sin Protección
- Todos los endpoints API son públicos
- No hay middleware de autenticación
- No hay validación de roles
- No hay rate limiting

---

## 2. Riesgos de Seguridad y Concurrency

### 2.1 Riesgos Críticos

#### 2.1.1 Contraseñas en Texto Plano
- **Severidad**: CRÍTICA
- **Impacto**: Compromiso total de cuentas si la base de datos es accesible
- **Solución**: Implementar bcrypt o Supabase Auth

#### 2.1.2 Race Conditions en Stock
```javascript
// Escenario: Usuario A y Usuario B hacen entrada simultánea
// Stock inicial: 10

// Usuario A lee: stock = 10
// Usuario B lee: stock = 10

// Usuario A actualiza: stock = 10 + 5 = 15
// Usuario B actualiza: stock = 10 + 3 = 13  // ❌ Perdió la entrada de A
```

**Solución**: Usar transacciones o optimistic locking con versiones.

#### 2.1.3 Falta de Auditoría
- No se registran: IP, navegador, cambios de valores
- No hay trazabilidad de acciones administrativas
- No se puede investigar incidentes

### 2.2 Riesgos de Integridad

#### 2.2.1 Actualización No Atómica
```javascript
// Si falla el registro del movimiento:
await supabase.from('productos').update({ stock: nuevoStock });  // ✅ Ejecutado
await supabase.from('movimientos').insert({...});  // ❌ Falló
// Resultado: Stock actualizado pero sin registro
```

**Solución**: Usar transacciones de Supabase.

#### 2.2.2 Validación Insuficiente
- No se valida que stock_nuevo sea consistente con stock_anterior + cantidad
- No se previenen movimientos negativos en backend (solo frontend)

---

## 3. Propuesta de Sistema de Permisos Granulares

### 3.1 Diseño de Tablas

#### 3.1.1 Tabla de Permisos
```sql
CREATE TABLE permisos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo VARCHAR(50) UNIQUE NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  descripcion TEXT,
  modulo VARCHAR(50) NOT NULL,
  activo BOOLEAN DEFAULT TRUE,
  fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Permisos base
INSERT INTO permisos (codigo, nombre, modulo) VALUES
('product.create', 'Crear productos', 'productos'),
('product.edit', 'Editar productos', 'productos'),
('product.delete', 'Eliminar productos', 'productos'),
('category.manage', 'Gestionar categorías', 'categorias'),
('stock.entry', 'Registrar entradas', 'stock'),
('stock.exit', 'Registrar salidas', 'stock'),
('stock.adjust', 'Ajustar stock manual', 'stock'),
('stock.transfer', 'Transferir stock', 'stock'),
('inventory.view', 'Ver inventario', 'inventario'),
('movement.view', 'Ver movimientos', 'movimientos'),
('dashboard.view', 'Ver dashboard', 'dashboard'),
('reports.view', 'Ver reportes', 'reportes'),
('alerts.manage', 'Gestionar alertas', 'alertas'),
('users.manage', 'Gestionar usuarios', 'usuarios'),
('roles.manage', 'Gestionar roles', 'roles'),
('gps.view', 'Ver ubicación GPS', 'gps'),
('audit.view', 'Ver auditoría', 'auditoría'),
('ai.read', 'Leer análisis IA', 'ia'),
('ai.suggest', 'Recibir sugerencias IA', 'ia'),
('settings.manage', 'Gestionar configuración', 'configuración');
```

#### 3.1.2 Tabla de Roles (Actualizada)
```sql
ALTER TABLE usuarios DROP CONSTRAINT usuarios_rol_check;
ALTER TABLE usuarios ALTER COLUMN rol TYPE VARCHAR(50);

CREATE TABLE roles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre VARCHAR(50) UNIQUE NOT NULL,
  descripcion TEXT,
  activo BOOLEAN DEFAULT TRUE,
  fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de relación muchos-a-muchos
CREATE TABLE roles_permisos (
  rol_id UUID REFERENCES roles(id) ON DELETE CASCADE,
  permiso_id UUID REFERENCES permisos(id) ON DELETE CASCADE,
  PRIMARY KEY (rol_id, permiso_id)
);

-- Roles base
INSERT INTO roles (nombre, descripcion) VALUES
('administrador', 'Acceso completo al sistema'),
('responsable_inventario', 'Administra productos, stock y reportes'),
('supervisor', 'Solo consulta dashboards, reportes y auditoría'),
('operador', 'Solo registra entradas y salidas autorizadas'),
('auditor', 'Acceso exclusivo de lectura a historial y auditoría');
```

#### 3.1.3 Tabla de Auditoría
```sql
CREATE TABLE auditoria (
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

CREATE INDEX idx_auditoria_usuario ON auditoria(usuario_id);
CREATE INDEX idx_auditoria_fecha ON auditoria(fecha);
CREATE INDEX idx_auditoria_modulo ON auditoria(modulo);
CREATE INDEX idx_auditoria_registro ON auditoria(registro_id, registro_tipo);
```

### 3.2 Middleware de Autenticación y Autorización

```javascript
// middleware/auth.js
const jwt = require('jsonwebtoken');

// Middleware de autenticación
const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Token no proporcionado' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { data: usuario } = await supabase
      .from('usuarios')
      .select('*, roles(*)')
      .eq('id', decoded.userId)
      .single();
    
    if (!usuario || !usuario.activo) {
      return res.status(401).json({ error: 'Usuario no válido' });
    }
    
    req.usuario = usuario;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Token inválido' });
  }
};

// Middleware de autorización por permiso
const authorize = (permisoRequerido) => {
  return async (req, res, next) => {
    try {
      const { data: permisos } = await supabase
        .from('roles_permisos')
        .select('permisos(*)')
        .eq('rol_id', req.usuario.rol_id);
      
      const tienePermiso = permisos.some(p => 
        p.permisos.codigo === permisoRequerido && 
        p.permisos.activo
      );
      
      if (!tienePermiso) {
        return res.status(403).json({ 
          error: 'No tienes permiso para realizar esta acción' 
        });
      }
      
      next();
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };
};

// Middleware de auditoría
const auditLog = (accion, modulo) => {
  return async (req, res, next) => {
    const originalSend = res.send;
    
    res.send = function(data) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        // Registrar auditoría en background
        registrarAuditoria({
          usuario_id: req.usuario?.id,
          accion,
          modulo,
          registro_id: req.params.id || req.body.id,
          registro_tipo: modulo,
          ip_address: req.ip,
          user_agent: req.get('user-agent'),
          valores_anteriores: req.valoresAnteriores,
          valores_nuevos: req.body
        }).catch(console.error);
      }
      originalSend.call(this, data);
    };
    
    next();
  };
};
```

### 3.3 Asignación de Permisos por Rol

| Permiso | Administrador | Responsable | Supervisor | Operador | Auditor |
|---------|--------------|--------------|------------|----------|---------|
| product.create | ✅ | ✅ | ❌ | ❌ | ❌ |
| product.edit | ✅ | ✅ | ❌ | ❌ | ❌ |
| product.delete | ✅ | ✅ | ❌ | ❌ | ❌ |
| category.manage | ✅ | ✅ | ❌ | ❌ | ❌ |
| stock.entry | ✅ | ✅ | ❌ | ✅ | ❌ |
| stock.exit | ✅ | ✅ | ❌ | ✅ | ❌ |
| stock.adjust | ✅ | ✅ | ❌ | ❌ | ❌ |
| stock.transfer | ✅ | ✅ | ❌ | ❌ | ❌ |
| inventory.view | ✅ | ✅ | ✅ | ✅ | ❌ |
| movement.view | ✅ | ✅ | ✅ | ✅ | ✅ |
| dashboard.view | ✅ | ✅ | ✅ | ❌ | ❌ |
| reports.view | ✅ | ✅ | ✅ | ❌ | ❌ |
| alerts.manage | ✅ | ✅ | ❌ | ❌ | ❌ |
| users.manage | ✅ | ❌ | ❌ | ❌ | ❌ |
| roles.manage | ✅ | ❌ | ❌ | ❌ | ❌ |
| gps.view | ✅ | ✅ | ❌ | ❌ | ❌ |
| audit.view | ✅ | ✅ | ✅ | ❌ | ✅ |
| ai.read | ✅ | ✅ | ✅ | ❌ | ❌ |
| ai.suggest | ✅ | ✅ | ❌ | ❌ | ❌ |
| settings.manage | ✅ | ❌ | ❌ | ❌ | ❌ |

---

## 4. Propuesta de Mejoras de Seguridad

### 4.1 Autenticación con JWT y Supabase Auth

```javascript
// Login mejorado
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  
  // Usar Supabase Auth para autenticación segura
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });
  
  if (error) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }
  
  // Obtener rol del usuario
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('*, roles(*)')
    .eq('email', email)
    .single();
  
  // Generar JWT con información del usuario
  const token = jwt.sign(
    { userId: usuario.id, rol: usuario.rol },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );
  
  res.json({ token, usuario });
});
```

### 4.2 Transacciones para Operaciones Críticas

```javascript
// Movimiento con transacción
app.post('/api/inventario/:id/movimiento', 
  authenticate,
  authorize('stock.entry'),
  auditLog('movimiento.create', 'stock'),
  async (req, res) => {
    const { tipo, cantidad, motivo, latitud, longitud } = req.body;
    const productoId = req.params.id;
    
    try {
      // Usar transacción de Supabase
      const { data, error } = await supabase.rpc(
        'registrar_movimiento',
        {
          p_producto_id: productoId,
          p_tipo: tipo,
          p_cantidad: cantidad,
          p_motivo: motivo,
          p_latitud: latitud,
          p_longitud: longitud,
          p_usuario_id: req.usuario.id
        }
      );
      
      if (error) throw error;
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);
```

### 4.3 Función RPC en Supabase para Movimiento Atómico

```sql
CREATE OR REPLACE FUNCTION registrar_movimiento(
  p_producto_id UUID,
  p_tipo VARCHAR,
  p_cantidad INTEGER,
  p_motivo TEXT,
  p_latitud DECIMAL,
  p_longitud DECIMAL,
  p_usuario_id UUID
) RETURNS JSON AS $$
DECLARE
  v_producto RECORD;
  v_nuevo_stock INTEGER;
  v_movimiento_id UUID;
BEGIN
  -- Bloquear fila del producto para evitar race conditions
  SELECT * INTO v_producto 
  FROM productos 
  WHERE id = p_producto_id 
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto no encontrado';
  END IF;
  
  -- Calcular nuevo stock
  IF p_tipo = 'entrada' THEN
    v_nuevo_stock := v_producto.stock + p_cantidad;
  ELSE
    v_nuevo_stock := v_producto.stock - p_cantidad;
    
    IF v_nuevo_stock < 0 THEN
      RAISE EXCEPTION 'Stock insuficiente';
    END IF;
  END IF;
  
  -- Actualizar stock
  UPDATE productos 
  SET stock = v_nuevo_stock,
      fecha_actualizacion = NOW()
  WHERE id = p_producto_id;
  
  -- Registrar movimiento
  INSERT INTO movimientos (
    producto_id, usuario_id, tipo, cantidad,
    stock_anterior, stock_nuevo, motivo, latitud, longitud
  ) VALUES (
    p_producto_id, p_usuario_id, p_tipo, p_cantidad,
    v_producto.stock, v_nuevo_stock, p_motivo, p_latitud, p_longitud
  ) RETURNING id INTO v_movimiento_id;
  
  -- Retornar resultado
  RETURN json_build_object(
    'movimiento_id', v_movimiento_id,
    'stock_anterior', v_producto.stock,
    'stock_nuevo', v_nuevo_stock
  );
END;
$$ LANGUAGE plpgsql;
```

---

## 5. Optimizaciones de Rendimiento

### 5.1 Problema de Escalabilidad

**Cálculo actual**: Stock almacenado en campo `stock` de tabla `productos`

**Problema con cientos de miles de movimientos**:
- El cálculo actual es eficiente (O(1) por producto)
- Pero no permite reconstruir el stock histórico
- No detecta inconsistencias entre movimientos y stock

### 5.2 Propuesta de Optimización

#### 5.2.1 Mantener Campo Stock (Método Híbrido)
- **Ventaja**: Consultas rápidas (O(1))
- **Desventaja**: Puede desincronizarse

**Solución**: 
- Mantener campo `stock` para consultas rápidas
- Agregar trigger para validar consistencia
- Proceso nocturno de reconciliación

#### 5.2.2 Índices Adicionales
```sql
-- Para consultas de stock por categoría
CREATE INDEX idx_productos_categoria_stock ON productos(categoria, stock);

-- Para movimientos recientes
CREATE INDEX idx_movimientos_recientes ON movimientos(fecha DESC) 
WHERE fecha > NOW() - INTERVAL '30 days';

-- Para auditoría por usuario y fecha
CREATE INDEX idx_auditoria_usuario_fecha ON auditoria(usuario_id, fecha DESC);
```

#### 5.2.3 Vista Materializada para Reportes
```sql
CREATE MATERIALIZED VIEW mv_resumen_stock AS
SELECT 
  p.id,
  p.nombre,
  p.categoria,
  p.stock,
  p.stock_minimo,
  COUNT(m.id) as total_movimientos,
  SUM(CASE WHEN m.tipo = 'entrada' THEN m.cantidad ELSE 0 END) as total_entradas,
  SUM(CASE WHEN m.tipo = 'salida' THEN m.cantidad ELSE 0 END) as total_salidas,
  MAX(m.fecha) as ultimo_movimiento
FROM productos p
LEFT JOIN movimientos m ON m.producto_id = p.id
GROUP BY p.id;

-- Actualizar cada hora
CREATE OR REPLACE FUNCTION refresh_mv_resumen_stock()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_resumen_stock;
END;
$$ LANGUAGE plpgsql;
```

#### 5.2.4 Caché con Redis (Opcional)
```javascript
const Redis = require('ioredis');
const redis = new Redis(process.env.REDIS_URL);

// Cachear estadísticas por 5 minutos
app.get('/api/estadisticas', async (req, res) => {
  const cacheKey = 'estadisticas:inventario';
  const cached = await redis.get(cacheKey);
  
  if (cached) {
    return res.json(JSON.parse(cached));
  }
  
  const stats = await calcularEstadisticas();
  await redis.setex(cacheKey, 300, JSON.stringify(stats));
  
  res.json(stats);
});
```

---

## 6. Plan de Implementación

### Fase 1: Seguridad Crítica (Prioridad Alta)
1. ✅ Implementar hash de contraseñas con bcrypt
2. ✅ Implementar JWT para autenticación
3. ✅ Crear middleware de autenticación
4. ✅ Proteger todos los endpoints con autenticación
5. ✅ Migrar contraseñas existentes

### Fase 2: Sistema de Permisos (Prioridad Alta)
1. ✅ Crear tablas de permisos y roles
2. ✅ Implementar middleware de autorización
3. ✅ Migrar roles existentes a nueva estructura
4. ✅ Asignar permisos a roles base
5. ✅ Aplicar middleware a endpoints

### Fase 3: Auditoría (Prioridad Media)
1. ✅ Crear tabla de auditoría
2. ✅ Implementar middleware de auditoría
3. ✅ Aplicar a endpoints críticos
4. ✅ Crear interfaz de consulta de auditoría

### Fase 4: Transacciones y Concurrencia (Prioridad Alta)
1. ✅ Crear función RPC para movimientos atómicos
2. ✅ Implementar control de concurrencia
3. ✅ Agregar test de race conditions
4. ✅ Actualizar endpoints de movimiento

### Fase 5: Optimizaciones (Prioridad Media)
1. ✅ Agregar índices adicionales
2. ✅ Crear vista materializada
3. ✅ Implementar caché (opcional)
4. ✅ Probar con volumen de datos

### Fase 6: Interfaz de Administración (Prioridad Baja)
1. ✅ Crear panel de gestión de roles
2. ✅ Crear panel de gestión de permisos
3. ✅ Crear visor de auditoría
4. ✅ Crear reportes avanzados

---

## 7. Compatibilidad y Migración

### 7.1 Estrategia de Migración
- **No eliminar** funcionalidades existentes
- **Agregar** nueva lógica en paralelo
- **Mantener** compatibilidad con frontend actual
- **Deprecar** gradualmente endpoints antiguos

### 7.2 Cambios No Destructivos
- Nuevas tablas no afectan tablas existentes
- Middleware se agrega, no reemplaza
- Nuevos endpoints coexisten con antiguos
- Migración de datos es incremental

### 7.3 Rollback Plan
- Mantener backup de base de datos
- Versionar cambios de schema
- Tener script de reversión
- Monitorear errores post-migración

---

## 8. Recomendaciones Adicionales

### 8.1 Seguridad
- Implementar rate limiting
- Agregar headers de seguridad (helmet)
- Sanitizar inputs contra SQL injection
- Implementar CORS más restrictivo
- Agregar monitoreo de intentos de intrusión

### 8.2 Monitoreo
- Implementar logging estructurado
- Agregar métricas de rendimiento
- Monitorear errores en tiempo real
- Alertas para anomalías

### 8.3 Testing
- Unit tests para middleware
- Integration tests para endpoints
- Load tests para concurrencia
- Security tests

---

## 9. Conclusión

El sistema actual tiene una base sólida pero presenta **riesgos críticos de seguridad** y **limitaciones de escalabilidad**. La implementación del sistema de permisos granulares, auditoría y mejoras de seguridad transformará la aplicación en un **ERP ligero robusto** listo para producción.

**Estimación de esfuerzo**: 2-3 semanas para implementación completa

**Riesgos**: Bajos si se sigue el plan incremental con rollback plan

**Beneficios**: Seguridad, auditoría, escalabilidad, flexibilidad de roles
