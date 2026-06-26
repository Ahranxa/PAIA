# Guía de Migración a ERP Ligero con Permisos Granulares

## Resumen de Cambios

Esta migración transforma el sistema de inventario básico en un ERP ligero con:
- **Autenticación JWT** con contraseñas hasheadas (bcrypt)
- **Sistema de permisos granular** independiente de roles
- **Auditoría completa** de todas las acciones
- **Movimientos atómicos** para evitar race conditions
- **5 roles base**: Administrador, Responsable de Inventario, Supervisor, Operador, Auditor

## Pre-requisitos

- Node.js 14+
- Supabase project configurado
- Acceso a SQL Editor de Supabase

## Paso 1: Instalar Dependencias

```bash
npm install
```

Esto instalará las nuevas dependencias:
- `bcrypt` - Para hashear contraseñas
- `jsonwebtoken` - Para generar y validar tokens JWT

## Paso 2: Ejecutar Scripts SQL en Supabase

### 2.1 Crear Sistema de Permisos y Roles

Ejecuta el archivo `backend/schema-permisos.sql` en el SQL Editor de Supabase.

Este script:
- Crea tabla `permisos` con 20 permisos base
- Crea tabla `roles` con 5 roles base
- Crea tabla `roles_permisos` para la relación muchos-a-muchos
- Asigna permisos a cada rol según la matriz definida
- Migra usuarios existentes a los nuevos roles
- Agrega columna `rol_id` a tabla `usuarios`

### 2.2 Crear Sistema de Auditoría

Ejecuta el archivo `backend/schema-auditoria.sql` en el SQL Editor de Supabase.

Este script:
- Crea tabla `auditoría` inmutable
- Crea índices para optimizar consultas
- Crea vista `vw_auditoria_detalle` con información de usuario
- Crea funciones para resumen de auditoría y detección de actividad sospechosa
- Configura RLS para proteger la tabla de auditoría

### 2.3 Crear Funciones RPC para Movimientos Atómicos

Ejecuta el archivo `backend/schema-movimientos-atomicos.sql` en el SQL Editor de Supabase.

Este script:
- Crea función `registrar_movimiento()` para movimientos atómicos
- Crea función `transferir_stock()` para transferencias
- Crea función `ajustar_stock()` para ajustes manuales
- Crea función `verificar_consistencia_stock()` para validar integridad
- Crea índices adicionales para optimizar rendimiento

## Paso 3: Configurar Variables de Entorno

Agrega estas variables a tu archivo `.env`:

```env
JWT_SECRET=tu-secreto-jwt-muy-seguro-aqui
```

**IMPORTANTE**: Cambia `JWT_SECRET` por una cadena aleatoria segura en producción.

## Paso 4: Desplegar Cambios

### 4.1 Commit y Push

```bash
git add .
git commit -m "Migración a ERP con permisos granulares"
git push
```

### 4.2 Render desplegará automáticamente

Render detectará los cambios y desplegará la nueva versión.

## Paso 5: Verificar Despliegue

### 5.1 Probar Health Check

```bash
curl https://paia-4.onrender.com/api/health
```

Debería retornar:
```json
{
  "status": "ok",
  "message": "Servidor funcionando correctamente"
}
```

### 5.2 Probar Login

```bash
curl -X POST https://paia-4.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"aranxa.lopez@outlook.com","password":"LinkNayru3@"}'
```

Debería retornar un token JWT:
```json
{
  "message": "Login exitoso",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "usuario": {
    "id": "...",
    "nombre": "Administrador",
    "email": "aranxa.lopez@outlook.com",
    "rol": "administrador"
  }
}
```

### 5.3 Probar Endpoint Protegido

```bash
curl https://paia-4.onrender.com/api/inventario \
  -H "Authorization: Bearer TU_TOKEN_JWT"
```

## Cambios en el Frontend

El frontend ahora:
- Almacena el token JWT en `localStorage` como `authToken`
- Usa `authenticatedFetch()` para todas las peticiones API
- Incluye automáticamente el header `Authorization: Bearer TOKEN`
- Tiene función `cerrarSesion()` para limpiar token y usuario

## Nuevos Endpoints API

### Autenticación
- `POST /api/auth/login` - Retorna token JWT
- `POST /api/auth/register` - Hashea contraseña con bcrypt

### Productos (Protegidos)
- `POST /api/inventario` - Requiere permiso `product.create`
- `PUT /api/inventario/:id` - Requiere permiso `product.edit`
- `DELETE /api/inventario/:id` - Requiere permiso `product.delete`

### Movimientos (Protegidos)
- `POST /api/inventario/:id/movimiento` - Requiere permiso `stock.entry`
  - Usa función RPC `registrar_movimiento()` para atomicidad

### Categorías (Protegidos)
- `POST /api/categorias` - Requiere permiso `category.manage`
- `PUT /api/categorias/:id` - Requiere permiso `category.manage`
- `DELETE /api/categorias/:id` - Requiere permiso `category.manage`

### Usuarios (Protegidos)
- `GET /api/usuarios` - Requiere rol `administrador`
- `PUT /api/usuarios/:id/rol` - Requiere rol `administrador`

## Matriz de Permisos por Rol

| Permiso | Admin | Responsable | Supervisor | Operador | Auditor |
|---------|-------|-------------|------------|----------|---------|
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
| settings.manage | ✅ | ✅ | ❌ | ❌ | ❌ |

## Auditoría

Todas las acciones críticas se registran automáticamente en la tabla `auditoría`:

- **usuario_id** - ID del usuario que realizó la acción
- **accion** - Tipo de acción (create, update, delete, etc.)
- **modulo** - Módulo afectado (productos, usuarios, etc.)
- **registro_id** - ID del registro afectado
- **registro_tipo** - Tipo de registro
- **ip_address** - Dirección IP del cliente
- **user_agent** - Navegador/cliente
- **latitud/longitud** - Ubicación GPS si disponible
- **valores_anteriores** - JSON con valores antes del cambio
- **valores_nuevos** - JSON con valores después del cambio
- **fecha** - Timestamp de la acción

La auditoría es **inmutable** - no se pueden eliminar registros.

## Movimientos Atómicos

El endpoint de movimientos ahora usa la función RPC `registrar_movimiento()` que:

1. **Bloquea la fila del producto** con `FOR UPDATE` para evitar race conditions
2. **Calcula el nuevo stock** de forma segura
3. **Actualiza el stock** en la base de datos
4. **Registra el movimiento** en la tabla `movimientos`
5. **Retorna el resultado** como JSON

Todo esto en una sola transacción atómica.

## Compatibilidad con Usuarios Existentes

La migración es **compatible con usuarios existentes**:

- Las contraseñas en texto plano se migran automáticamente a bcrypt en el primer login
- Los roles antiguos (`usuario`, `editor`, `administrador`) se mapean a nuevos roles
- El middleware de autorización soporta ambos sistemas durante la transición

## Solución de Problemas

### Error 401 Unauthorized

**Causa**: Token JWT inválido o expirado

**Solución**: 
- Verifica que el token se esté enviando en el header `Authorization: Bearer TOKEN`
- Verifica que `JWT_SECRET` esté configurado en Render
- Vuelve a iniciar sesión para obtener un nuevo token

### Error 403 Forbidden

**Causa**: Usuario no tiene el permiso requerido

**Solución**:
- Verifica que el usuario tenga el rol correcto
- Verifica que el rol tenga el permiso asignado en la tabla `roles_permisos`
- Contacta al administrador para asignar permisos

### Error 500 en Movimientos

**Causa**: La función RPC `registrar_movimiento` no existe

**Solución**:
- Ejecuta el script `backend/schema-movimientos-atomicos.sql` en Supabase
- Verifica que la función se haya creado correctamente

### Contraseñas No Funcionan

**Causa**: Las contraseñas antiguas en texto plano no se migraron

**Solución**:
- El primer login de cada usuario migrará automáticamente la contraseña a bcrypt
- Si hay problemas, resetea la contraseña del usuario

## Rollback

Si necesitas revertir los cambios:

1. **Restaurar versión anterior**:
   ```bash
   git checkout <commit-anterior>
   git push
   ```

2. **Eliminar tablas nuevas en Supabase** (opcional):
   ```sql
   DROP TABLE IF EXISTS auditoria CASCADE;
   DROP TABLE IF EXISTS roles_permisos CASCADE;
   DROP TABLE IF EXISTS roles CASCADE;
   DROP TABLE IF EXISTS permisos CASCADE;
   ```

3. **Eliminar funciones RPC**:
   ```sql
   DROP FUNCTION IF EXISTS registrar_movimiento;
   DROP FUNCTION IF EXISTS transferir_stock;
   DROP FUNCTION IF EXISTS ajustar_stock;
   DROP FUNCTION IF EXISTS verificar_consistencia_stock;
   ```

## Próximos Pasos

Después de esta migración, considera:

1. **Crear interfaz de administración de roles** para gestionar permisos
2. **Crear visor de auditoría** para revisar el historial de acciones
3. **Implementar rate limiting** para prevenir ataques
4. **Agregar 2FA** para mayor seguridad
5. **Implementar caché con Redis** para optimizar rendimiento
6. **Crear reportes avanzados** con análisis de datos

## Soporte

Si encuentras problemas durante la migración:

1. Revisa los logs de Render
2. Verifica que los scripts SQL se ejecutaron correctamente
3. Confirma que las variables de entorno están configuradas
4. Consulta el documento `ANALISIS_ERP.md` para más detalles técnicos
