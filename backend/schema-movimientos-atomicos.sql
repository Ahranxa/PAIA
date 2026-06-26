-- ============================================
-- FUNCIÓN RPC PARA MOVIMIENTOS ATÓMICOS
-- ============================================

-- Esta función asegura que el stock se actualice de forma atómica
-- evitando race conditions cuando múltiples usuarios realizan movimientos simultáneos

CREATE OR REPLACE FUNCTION registrar_movimiento(
  p_producto_id UUID,
  p_tipo VARCHAR,
  p_cantidad INTEGER,
  p_motivo TEXT,
  p_latitud DECIMAL,
  p_longitud DECIMAL,
  p_usuario_id UUID
)
RETURNS JSON AS $$
DECLARE
  v_producto RECORD;
  v_nuevo_stock INTEGER;
  v_movimiento_id UUID;
  v_resultado JSON;
BEGIN
  -- Bloquear fila del producto para evitar race conditions
  -- FOR UPDATE bloquea la fila hasta que termine la transacción
  SELECT * INTO v_producto 
  FROM productos 
  WHERE id = p_producto_id 
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto no encontrado' USING ERRCODE = '23503';
  END IF;
  
  -- Validar tipo de movimiento
  IF p_tipo NOT IN ('entrada', 'salida', 'ajuste') THEN
    RAISE EXCEPTION 'Tipo de movimiento inválido: %', p_tipo USING ERRCODE = '23514';
  END IF;
  
  -- Validar cantidad positiva
  IF p_cantidad <= 0 THEN
    RAISE EXCEPTION 'La cantidad debe ser mayor a 0' USING ERRCODE = '23514';
  END IF;
  
  -- Calcular nuevo stock según tipo
  IF p_tipo = 'entrada' THEN
    v_nuevo_stock := v_producto.stock + p_cantidad;
  ELSIF p_tipo = 'salida' THEN
    v_nuevo_stock := v_producto.stock - p_cantidad;
    
    -- Validar stock suficiente
    IF v_nuevo_stock < 0 THEN
      RAISE EXCEPTION 'Stock insuficiente. Stock actual: %, solicitado: %', 
        v_producto.stock, p_cantidad USING ERRCODE = '23514';
    END IF;
  ELSE -- ajuste
    v_nuevo_stock := p_cantidad; -- Para ajustes, la cantidad es el nuevo stock
  END IF;
  
  -- Actualizar stock del producto
  UPDATE productos 
  SET stock = v_nuevo_stock,
      fecha_actualizacion = NOW()
  WHERE id = p_producto_id;
  
  -- Registrar movimiento
  INSERT INTO movimientos (
    producto_id, 
    usuario_id, 
    tipo, 
    cantidad,
    stock_anterior, 
    stock_nuevo, 
    motivo, 
    latitud, 
    longitud
  ) VALUES (
    p_producto_id, 
    p_usuario_id, 
    p_tipo, 
    p_cantidad,
    v_producto.stock, 
    v_nuevo_stock, 
    p_motivo, 
    p_latitud, 
    p_longitud
  ) RETURNING id INTO v_movimiento_id;
GET DIAGNOSTICS v_resultado = ROW_COUNT;
  
  -- Construir resultado JSON
  v_resultado := json_build_object(
    'movimiento_id', v_movimiento_id,
    'producto_id', p_producto_id,
    'tipo', p_tipo,
    'cantidad', p_cantidad,
    'stock_anterior', v_producto.stock,
    'stock_nuevo', v_nuevo_stock,
    'fecha', NOW()
  );
  
  RETURN v_resultado;
  
EXCEPTION
  WHEN OTHERS THEN
    -- En caso de error, retornar información del error
    RETURN json_build_object(
      'error', SQLERRM,
      'codigo', SQLSTATE
    );
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- FUNCIÓN PARA TRANSFERENCIA DE STOCK
-- ============================================

CREATE OR REPLACE FUNCTION transferir_stock(
  p_producto_id UUID,
  p_cantidad INTEGER,
  p_ubicacion_origen VARCHAR,
  p_ubicacion_destino VARCHAR,
  p_motivo TEXT,
  p_usuario_id UUID
)
RETURNS JSON AS $$
DECLARE
  v_producto RECORD;
  v_movimiento_entrada_id UUID;
  v_movimiento_salida_id UUID;
  v_resultado JSON;
BEGIN
  -- Bloquear fila del producto
  SELECT * INTO v_producto 
  FROM productos 
  WHERE id = p_producto_id 
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto no encontrado' USING ERRCODE = '23503';
  END IF;
  
  -- Validar stock suficiente
  IF v_producto.stock < p_cantidad THEN
    RAISE EXCEPTION 'Stock insuficiente para transferencia' USING ERRCODE = '23514';
  END IF;
  
  -- Registrar salida
  INSERT INTO movimientos (
    producto_id, 
    usuario_id, 
    tipo, 
    cantidad,
    stock_anterior, 
    stock_nuevo, 
    motivo, 
    latitud, 
    longitud
  ) VALUES (
    p_producto_id, 
    p_usuario_id, 
    'salida', 
    p_cantidad,
    v_producto.stock, 
    v_producto.stock - p_cantidad, 
    CONCAT('Transferencia a: ', p_ubicacion_destino, '. ', p_motivo), 
    NULL, 
    NULL
  ) RETURNING id INTO v_movimiento_salida_id;
  
  -- Actualizar stock
  UPDATE productos 
  SET stock = v_producto.stock - p_cantidad,
      fecha_actualizacion = NOW()
  WHERE id = p_producto_id;
  
  -- Registrar entrada
  INSERT INTO movimientos (
    producto_id, 
    usuario_id, 
    tipo, 
    cantidad,
    stock_anterior, 
    stock_nuevo, 
    motivo, 
    latitud, 
    longitud
  ) VALUES (
    p_producto_id, 
    p_usuario_id, 
    'entrada', 
    p_cantidad,
    v_producto.stock - p_cantidad, 
    v_producto.stock, 
    CONCAT('Transferencia desde: ', p_ubicacion_origen, '. ', p_motivo), 
    NULL, 
    NULL
  ) RETURNING id INTO v_movimiento_entrada_id;
  
  -- Construir resultado
  v_resultado := json_build_object(
    'movimiento_salida_id', v_movimiento_salida_id,
    'movimiento_entrada_id', v_movimiento_entrada_id,
    'producto_id', p_producto_id,
    'cantidad', p_cantidad,
    'ubicacion_origen', p_ubicacion_origen,
    'ubicacion_destino', p_ubicacion_destino,
    'stock_final', v_producto.stock,
    'fecha', NOW()
  );
  
  RETURN v_resultado;
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'error', SQLERRM,
      'codigo', SQLSTATE
    );
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- FUNCIÓN PARA AJUSTE MANUAL DE STOCK
-- ============================================

CREATE OR REPLACE FUNCTION ajustar_stock(
  p_producto_id UUID,
  p_nuevo_stock INTEGER,
  p_motivo TEXT,
  p_usuario_id UUID
)
RETURNS JSON AS $$
DECLARE
  v_producto RECORD;
  v_movimiento_id UUID;
  v_diferencia INTEGER;
  v_resultado JSON;
BEGIN
  -- Bloquear fila del producto
  SELECT * INTO v_producto 
  FROM productos 
  WHERE id = p_producto_id 
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto no encontrado' USING ERRCODE = '23503';
  END IF;
  
  -- Validar stock no negativo
  IF p_nuevo_stock < 0 THEN
    RAISE EXCEPTION 'El stock no puede ser negativo' USING ERRCODE = '23514';
  END IF;
  
  -- Calcular diferencia
  v_diferencia := p_nuevo_stock - v_producto.stock;
  
  -- Actualizar stock
  UPDATE productos 
  SET stock = p_nuevo_stock,
      fecha_actualizacion = NOW()
  WHERE id = p_producto_id;
  
  -- Determinar tipo de movimiento para auditoría
  DECLARE
    v_tipo_movimiento VARCHAR;
  BEGIN
    IF v_diferencia > 0 THEN
      v_tipo_movimiento := 'ajuste_positivo';
    ELSIF v_diferencia < 0 THEN
      v_tipo_movimiento := 'ajuste_negativo';
    ELSE
      v_tipo_movimiento := 'ajuste_sin_cambio';
    END IF;
  END;
  
  -- Registrar movimiento de ajuste
  INSERT INTO movimientos (
    producto_id, 
    usuario_id, 
    tipo, 
    cantidad,
    stock_anterior, 
    stock_nuevo, 
    motivo, 
    latitud, 
    longitud
  ) VALUES (
    p_producto_id, 
    p_usuario_id, 
    'ajuste', 
    ABS(v_diferencia),
    v_producto.stock, 
    p_nuevo_stock, 
    p_motivo, 
    NULL, 
    NULL
  ) RETURNING id INTO v_movimiento_id;
  
  -- Construir resultado
  v_resultado := json_build_object(
    'movimiento_id', v_movimiento_id,
    'producto_id', p_producto_id,
    'stock_anterior', v_producto.stock,
    'stock_nuevo', p_nuevo_stock,
    'diferencia', v_diferencia,
    'tipo_ajuste', v_tipo_movimiento,
    'fecha', NOW()
  );
  
  RETURN v_resultado;
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'error', SQLERRM,
      'codigo', SQLSTATE
    );
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- FUNCIÓN PARA VERIFICAR CONSISTENCIA DE STOCK
-- ============================================

CREATE OR REPLACE FUNCTION verificar_consistencia_stock(p_producto_id UUID DEFAULT NULL)
RETURNS TABLE (
  producto_id UUID,
  producto_nombre VARCHAR,
  stock_actual INTEGER,
  stock_calculado INTEGER,
  consistente BOOLEAN,
  diferencia INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id as producto_id,
    p.nombre as producto_nombre,
    p.stock as stock_actual,
    COALESCE(
      (SELECT SUM(CASE WHEN m.tipo = 'entrada' THEN m.cantidad ELSE -m.cantidad END)
       FROM movimientos m
       WHERE m.producto_id = p.id),
      0
    ) as stock_calculado,
    p.stock = COALESCE(
      (SELECT SUM(CASE WHEN m.tipo = 'entrada' THEN m.cantidad ELSE -m.cantidad END)
       FROM movimientos m
       WHERE m.producto_id = p.id),
      0
    ) as consistente,
    p.stock - COALESCE(
      (SELECT SUM(CASE WHEN m.tipo = 'entrada' THEN m.cantidad ELSE -m.cantidad END)
       FROM movimientos m
       WHERE m.producto_id = p.id),
      0
    ) as diferencia
  FROM productos p
  WHERE p_producto_id IS NULL OR p.id = p_producto_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- ÍNDICES ADICIONALES PARA OPTIMIZAR MOVIMIENTOS
-- ============================================

-- Índice para movimientos recientes por producto
CREATE INDEX IF NOT EXISTS idx_movimientos_producto_fecha 
ON movimientos(producto_id, fecha DESC)
WHERE fecha > NOW() - INTERVAL '30 days';

-- Índice para movimientos por usuario y fecha
CREATE INDEX IF NOT EXISTS idx_movimientos_usuario_fecha 
ON movimientos(usuario_id, fecha DESC);

-- Índice para movimientos por tipo
CREATE INDEX IF NOT EXISTS idx_movimientos_tipo 
ON movimientos(tipo);

-- Comentario sobre la función principal
COMMENT ON FUNCTION registrar_movimiento IS 'Función atómica para registrar movimientos de stock con control de concurrencia';
