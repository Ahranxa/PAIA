require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
// Configurar CORS para permitir desarrollo local y producción en Render
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  process.env.FRONTEND_URL || '*'
];

app.use(cors({
  origin: function(origin, callback) {
    // Permitir solicitudes sin origin (como mobile apps o curl)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      callback(new Error('No permitido por CORS'));
    }
  },
  credentials: true
}));

app.use(express.json());

// Servir archivos estáticos del frontend
const path = require('path');
app.use(express.static(path.join(__dirname, 'frontend')));

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Servidor funcionando correctamente' });
});

// Obtener todos los productos
app.get('/api/inventario', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('productos')
      .select('*')
      .order('nombre');
    
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Obtener un producto por ID
app.get('/api/inventario/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('productos')
      .select('*')
      .eq('id', req.params.id)
      .single();
    
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Crear nuevo producto
app.post('/api/inventario', async (req, res) => {
  try {
    const { nombre, descripcion, categoria, stock, stock_minimo, precio_compra, precio_venta, proveedor, sku } = req.body;
    
    const { data, error } = await supabase
      .from('productos')
      .insert([{
        nombre,
        descripcion,
        categoria,
        stock: stock || 0,
        stock_minimo: stock_minimo || 5,
        precio_compra: precio_compra || 0,
        precio_venta: precio_venta || 0,
        proveedor,
        sku
      }])
      .select();
    
    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Actualizar producto
app.put('/api/inventario/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('productos')
      .update(req.body)
      .eq('id', req.params.id)
      .select();
    
    if (error) throw error;
    res.json(data[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Eliminar producto
app.delete('/api/inventario/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('productos')
      .delete()
      .eq('id', req.params.id);
    
    if (error) throw error;
    res.json({ message: 'Producto eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Obtener productos con bajo stock
app.get('/api/inventario/alertas/bajo-stock', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('productos')
      .select('*')
      .lt('stock', 'stock_minimo')
      .order('stock');
    
    if (error) {
      console.error('Error en consulta de alertas:', error);
      throw error;
    }
    
    if (!data) {
      return res.json([]);
    }
    
    res.json(data);
  } catch (error) {
    console.error('Error en alertas:', error);
    res.status(500).json({ error: error.message });
  }
});

// Obtener estadísticas del inventario
app.get('/api/inventario/estadisticas', async (req, res) => {
  try {
    const { data: productos, error } = await supabase
      .from('productos')
      .select('*');
    
    if (error) {
      console.error('Error en consulta de productos:', error);
      throw error;
    }
    
    if (!productos || productos.length === 0) {
      return res.json({
        totalProductos: 0,
        valorTotalInventario: 0,
        productosBajoStock: 0,
        valorVentaPotencial: 0,
        porCategoria: {}
      });
    }
    
    const totalProductos = productos.length;
    const valorTotalInventario = productos.reduce((sum, p) => sum + (p.stock * (p.precio_compra || 0)), 0);
    const productosBajoStock = productos.filter(p => p.stock < p.stock_minimo).length;
    const valorVentaPotencial = productos.reduce((sum, p) => sum + (p.stock * (p.precio_venta || 0)), 0);
    
    // Agrupar por categoría
    const porCategoria = productos.reduce((acc, p) => {
      acc[p.categoria] = (acc[p.categoria] || 0) + 1;
      return acc;
    }, {});
    
    res.json({
      totalProductos,
      valorTotalInventario,
      productosBajoStock,
      valorVentaPotencial,
      porCategoria
    });
  } catch (error) {
    console.error('Error en estadísticas:', error);
    res.status(500).json({ error: error.message });
  }
});

// Buscar productos
app.get('/api/inventario/buscar/:termino', async (req, res) => {
  try {
    const termino = req.params.termino;
    const { data, error } = await supabase
      .from('productos')
      .select('*')
      .or(`nombre.ilike.%${termino}%,sku.ilike.%${termino}%,categoria.ilike.%${termino}%`);
    
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Registrar movimiento de inventario
app.post('/api/inventario/:id/movimiento', async (req, res) => {
  try {
    const { tipo, cantidad, motivo, latitud, longitud, usuario_id } = req.body;
    const productoId = req.params.id;
    
    // Obtener producto actual
    const { data: producto, error: errorProducto } = await supabase
      .from('productos')
      .select('*')
      .eq('id', productoId)
      .single();
    
    if (errorProducto) throw errorProducto;
    
    // Calcular nuevo stock
    const nuevoStock = tipo === 'entrada' 
      ? producto.stock + cantidad 
      : producto.stock - cantidad;
    
    if (nuevoStock < 0) {
      return res.status(400).json({ error: 'Stock insuficiente' });
    }
    
    // Actualizar producto
    const { data: productoActualizado, error: errorUpdate } = await supabase
      .from('productos')
      .update({ stock: nuevoStock })
      .eq('id', productoId)
      .select();
    
    if (errorUpdate) throw errorUpdate;
    
    // Registrar movimiento con ubicación y usuario
    const { data: movimiento, error: errorMovimiento } = await supabase
      .from('movimientos')
      .insert([{
        producto_id: productoId,
        usuario_id,
        tipo,
        cantidad,
        stock_anterior: producto.stock,
        stock_nuevo: nuevoStock,
        motivo,
        latitud,
        longitud
      }])
      .select();
    
    if (errorMovimiento) throw errorMovimiento;
    
    res.json({ producto: productoActualizado[0], movimiento: movimiento[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Obtener historial de movimientos
app.get('/api/inventario/:id/movimientos', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('movimientos')
      .select('*, usuarios(nombre, email)')
      .eq('producto_id', req.params.id)
      .order('fecha', { ascending: false });
    
    if (error) {
      console.error('Error en consulta de movimientos:', error);
      throw error;
    }
    
    console.log('Movimientos encontrados:', data?.length || 0);
    if (data && data.length > 0) {
      console.log('Primer movimiento:', JSON.stringify(data[0], null, 2));
    }
    
    if (!data) {
      return res.json([]);
    }
    
    res.json(data);
  } catch (error) {
    console.error('Error en movimientos:', error);
    res.status(500).json({ error: error.message });
  }
});

// Registrar usuario
app.post('/api/auth/register', async (req, res) => {
  try {
    const { nombre, email, password } = req.body;

    const { data: existente } = await supabase
      .from('usuarios')
      .select('id')
      .eq('email', email)
      .single();

    if (existente) {
      return res.status(400).json({
        error: 'El correo ya está registrado'
      });
    }

    const { data, error } = await supabase
      .from('usuarios')
      .insert([{
        nombre,
        email,
        password
      }])
      .select();

    if (error) throw error;

    res.status(201).json({
      message: 'Usuario registrado correctamente',
      usuario: data[0]
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Iniciar sesión
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const { data: usuario, error } = await supabase
      .from('usuarios')
      .select('*')
      .eq('email', email)
      .eq('password', password)
      .single();

    if (error || !usuario) {
      return res.status(401).json({
        error: 'Correo o contraseña incorrectos'
      });
    }

    res.json({
      message: 'Login exitoso',
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol
      }
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ ENDPOINTS DE CATEGORÍAS ============

// Obtener todas las categorías
app.get('/api/categorias', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('categorias')
      .select('*')
      .eq('activo', true)
      .order('nombre');
    
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Obtener una categoría por ID
app.get('/api/categorias/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('categorias')
      .select('*')
      .eq('id', req.params.id)
      .single();
    
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Crear nueva categoría
app.post('/api/categorias', async (req, res) => {
  try {
    const { nombre, descripcion } = req.body;
    
    const { data, error } = await supabase
      .from('categorias')
      .insert([{
        nombre,
        descripcion
      }])
      .select();
    
    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Actualizar categoría
app.put('/api/categorias/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('categorias')
      .update(req.body)
      .eq('id', req.params.id)
      .select();
    
    if (error) throw error;
    res.json(data[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Eliminar categoría (soft delete)
app.delete('/api/categorias/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('categorias')
      .update({ activo: false })
      .eq('id', req.params.id);
    
    if (error) throw error;
    res.json({ message: 'Categoría eliminada correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ ENDPOINTS DE GESTIÓN DE USUARIOS ============

// Obtener todos los usuarios (solo administrador)
app.get('/api/usuarios', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('usuarios')
      .select('id, nombre, email, rol, activo, fecha_creacion')
      .order('nombre');
    
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Actualizar rol de usuario
app.put('/api/usuarios/:id/rol', async (req, res) => {
  try {
    const { rol } = req.body;
    
    const { data, error } = await supabase
      .from('usuarios')
      .update({ rol })
      .eq('id', req.params.id)
      .select();
    
    if (error) throw error;
    res.json(data[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Servir frontend para SPA (todas las rutas no-API van a index.html)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/index.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});