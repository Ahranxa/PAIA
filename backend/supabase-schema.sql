-- Esquema de base de datos para Sistema de Inventario
-- Ejecutar este script en el SQL Editor de Supabase

-- Crear tabla de categorías
CREATE TABLE categorias (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL UNIQUE,
  descripcion TEXT,
  activo BOOLEAN DEFAULT TRUE,
  fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  fecha_actualizacion TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Crear tabla de productos
CREATE TABLE productos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre VARCHAR(255) NOT NULL,
  descripcion TEXT,
  categoria VARCHAR(100),
  stock INTEGER DEFAULT 0,
  stock_minimo INTEGER DEFAULT 5,
  precio_compra DECIMAL(10, 2) DEFAULT 0,
  precio_venta DECIMAL(10, 2) DEFAULT 0,
  proveedor VARCHAR(255),
  sku VARCHAR(100) UNIQUE,
  fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  fecha_actualizacion TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Crear tabla de movimientos de inventario
CREATE TABLE movimientos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  producto_id UUID REFERENCES productos(id) ON DELETE CASCADE,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('entrada', 'salida')),
  cantidad INTEGER NOT NULL,
  stock_anterior INTEGER NOT NULL,
  stock_nuevo INTEGER NOT NULL,
  motivo TEXT,
  fecha TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Crear índices para mejorar rendimiento
CREATE INDEX idx_productos_categoria ON productos(categoria);
CREATE INDEX idx_productos_sku ON productos(sku);
CREATE INDEX idx_movimientos_producto ON movimientos(producto_id);
CREATE INDEX idx_movimientos_fecha ON movimientos(fecha);
CREATE INDEX idx_categorias_nombre ON categorias(nombre);

-- Habilitar Row Level Security (RLS)
ALTER TABLE productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias ENABLE ROW LEVEL SECURITY;

-- Políticas de seguridad (permitir todo para desarrollo)
-- En producción, restringir según necesidades
CREATE POLICY "Permitir todo en productos" ON productos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir todo en movimientos" ON movimientos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir todo en categorias" ON categorias FOR ALL USING (true) WITH CHECK (true);

-- Función para actualizar fecha_actualización
CREATE OR REPLACE FUNCTION actualizar_fecha_actualizacion()
RETURNS TRIGGER AS $$
BEGIN
  NEW.fecha_actualizacion = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar fecha_actualización
CREATE TRIGGER trigger_actualizar_productos
BEFORE UPDATE ON productos
FOR EACH ROW
EXECUTE FUNCTION actualizar_fecha_actualizacion();

CREATE TRIGGER trigger_actualizar_categorias
BEFORE UPDATE ON categorias
FOR EACH ROW
EXECUTE FUNCTION actualizar_fecha_actualizacion();

-- Datos de ejemplo (opcional)
INSERT INTO categorias (nombre, descripcion) VALUES
('Electrónicos', 'Dispositivos electrónicos y gadgets'),
('Accesorios', 'Accesorios para computadoras y periféricos'),
('Cables', 'Cables y conectores varios'),
('Periféricos', 'Periféricos de entrada y salida'),
('Almacenamiento', 'Dispositivos de almacenamiento de datos'),
('Otros', 'Categorías misceláneas');

INSERT INTO productos (nombre, descripcion, categoria, stock, stock_minimo, precio_compra, precio_venta, proveedor, sku) VALUES
('Laptop HP Pavilion', 'Laptop 15.6" Intel i5, 8GB RAM, 256GB SSD', 'Electrónicos', 10, 5, 8500.00, 12000.00, 'HP México', 'LAP-HP-001'),
('Mouse Inalámbrico Logitech', 'Mouse ergonómico inalámbrico', 'Accesorios', 25, 10, 350.00, 550.00, 'Logitech', 'MOU-LOG-001'),
('Monitor Samsung 24"', 'Monitor LED 24" Full HD', 'Electrónicos', 8, 5, 2800.00, 4200.00, 'Samsung México', 'MON-SAM-001'),
('Teclado Mecánico RGB', 'Teclado gaming mecánico con iluminación RGB', 'Accesorios', 15, 8, 1200.00, 1800.00, 'Corsair', 'TEC-COR-001'),
('Cable HDMI 2m', 'Cable HDMI de alta velocidad 2 metros', 'Cables', 50, 20, 85.00, 150.00, 'Generico', 'CAB-HDM-001');

-- Crear tabla de usuarios
CREATE TABLE usuarios (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  rol VARCHAR(50) DEFAULT 'usuario',
  activo BOOLEAN DEFAULT TRUE,
  fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  fecha_actualizacion TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índice para búsquedas por correo
CREATE INDEX idx_usuarios_email ON usuarios(email);

-- Habilitar RLS
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;

-- Política para desarrollo
CREATE POLICY "Permitir todo en usuarios"
ON usuarios
FOR ALL
USING (true)
WITH CHECK (true);
