# Sistema de Inventario - Tienda

Aplicación web para administrar y monitorear inventarios de una tienda. Desarrollada en México, junio 2026.

## 🛠️ Tecnologías

### Backend
- Node.js
- Express.js
- Supabase (base de datos)
- CORS

### Frontend
- JavaScript (Vanilla)
- HTML5
- Tailwind CSS (via CDN)

## 📁 Estructura del Proyecto

```
inventory-management-app/
├── backend/
│   ├── package.json
│   ├── server.js
│   ├── .env.example
│   └── supabase-schema.sql
└── frontend/
    ├── index.html
    ├── config.js
    └── app.js
```

## 🚀 Configuración

### 1. Configurar Supabase

1. Crea una cuenta en [supabase.com](https://supabase.com)
2. Crea un nuevo proyecto
3. Ve al SQL Editor de Supabase
4. Ejecuta el script `backend/supabase-schema.sql`
5. Copia tu `SUPABASE_URL` y `SUPABASE_ANON_KEY` desde Settings > API

### 2. Configurar Backend

```bash
cd backend
npm install
```

Crea el archivo `.env` en la carpeta backend:

```env
SUPABASE_URL=tu_supabase_project_url
SUPABASE_ANON_KEY=tu_supabase_anon_key
PORT=3001
```

### 3. Ejecutar Backend

```bash
cd backend
npm start
```

O para desarrollo con auto-reload:

```bash
npm run dev
```

El backend estará disponible en `http://localhost:3001`

### 4. Ejecutar Frontend

Simplemente abre el archivo `frontend/index.html` en tu navegador, o usa un servidor local:

```bash
# Si tienes Python instalado
cd frontend
python -m http.server 8000

# O con Node.js
npx serve frontend
```

El frontend estará disponible en `http://localhost:8000`

## 📋 Funcionalidades

### Gestión de Productos
- ✅ Crear nuevos productos
- ✅ Editar productos existentes
- ✅ Eliminar productos
- ✅ Buscar productos por nombre, SKU o categoría
- ✅ Ver lista completa de inventario

### Monitoreo de Inventario
- ✅ Estadísticas en tiempo real (total productos, valor del inventario, etc.)
- ✅ Alertas de stock bajo
- ✅ Registro de movimientos (entradas/salidas)
- ✅ Historial de movimientos por producto
- ✅ Categorización de productos

### Campos de Producto
- SKU (código único)
- Nombre
- Descripción
- Categoría
- Stock actual
- Stock mínimo (para alertas)
- Precio de compra
- Precio de venta
- Proveedor

## 🔌 API Endpoints

### Productos
- `GET /api/inventario` - Obtener todos los productos
- `GET /api/inventario/:id` - Obtener un producto por ID
- `POST /api/inventario` - Crear nuevo producto
- `PUT /api/inventario/:id` - Actualizar producto
- `DELETE /api/inventario/:id` - Eliminar producto
- `GET /api/inventario/buscar/:termino` - Buscar productos
- `GET /api/inventario/alertas/bajo-stock` - Obtener productos con bajo stock

### Movimientos
- `POST /api/inventario/:id/movimiento` - Registrar movimiento de inventario
- `GET /api/inventario/:id/movimientos` - Obtener historial de movimientos

### Estadísticas
- `GET /api/inventario/estadisticas` - Obtener estadísticas generales

### Health
- `GET /api/health` - Verificar estado del servidor

## 💡 Uso

1. **Agregar Producto**: Click en "Nuevo Producto" y llena el formulario
2. **Editar Producto**: Click en el icono de lápiz ✏️ en la tabla
3. **Eliminar Producto**: Click en el icono de basura 🗑️
4. **Registrar Movimiento**: Click en el icono de entrada 📥 para agregar o quitar stock
5. **Ver Historial**: Click en el icono de documento 📋 para ver movimientos
6. **Buscar**: Usa la barra de búsqueda para filtrar productos

## 🎨 Características de UI

- Diseño moderno con Tailwind CSS
- Responsive (móvil y escritorio)
- Alertas visuales para stock bajo
- Modales para formularios
- Tabla con información completa
- Estadísticas en tarjetas
- Fecha actual en español (formato México)

## 📝 Notas

- La aplicación usa moneda mexicana (MXN)
- La fecha y hora están configuradas para zona horaria de México
- Los precios se muestran con 2 decimales
- El stock mínimo por defecto es 5 unidades

## 🔒 Seguridad

- Row Level Security (RLS) habilitado en Supabase
- En producción, configurar políticas de seguridad apropiadas
- Usar variables de entorno para credenciales

## 🐛 Troubleshooting

### Error de conexión a Supabase
- Verifica que las credenciales en `.env` sean correctas
- Asegúrate de que el proyecto de Supabase esté activo

### CORS errors
- El backend ya tiene CORS habilitado para todos los orígenes
- En producción, restringir a dominios específicos

### Frontend no carga datos
- Verifica que el backend esté corriendo en el puerto 3001
- Revisa la consola del navegador para errores

## 📄 Licencia

ISC

## 👤 Autor

Desarrollado para gestión de inventario de tienda - México 2026
