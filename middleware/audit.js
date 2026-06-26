const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

/**
 * Registrar entrada en auditoría
 */
const registrarAuditoria = async (datos) => {
  try {
    const {
      usuario_id,
      accion,
      modulo,
      registro_id,
      registro_tipo,
      ip_address,
      user_agent,
      latitud,
      longitud,
      valores_anteriores,
      valores_nuevos
    } = datos;
    
    const { error } = await supabase.from('auditoria').insert([{
      usuario_id,
      accion,
      modulo,
      registro_id,
      registro_tipo,
      ip_address,
      user_agent,
      latitud,
      longitud,
      valores_anteriores,
      valores_nuevos
    }]);
    
    if (error) {
      console.error('Error al registrar auditoría:', error);
    }
  } catch (error) {
    console.error('Error en registro de auditoría:', error);
  }
};

/**
 * Middleware de auditoría
 * Registra automáticamente las acciones exitosas
 */
const auditLog = (accion, modulo) => {
  return (req, res, next) => {
    // Guardar valores anteriores si es una actualización
    if (req.method === 'PUT' || req.method === 'PATCH') {
      req.valoresAnteriores = req.body; // Se puede mejorar obteniendo de DB
    }
    
    // Interceptamos el método send para registrar después de la respuesta
    const originalSend = res.send;
    
    res.send = function(data) {
      // Solo registrar si la respuesta fue exitosa (2xx o 3xx)
      if (res.statusCode >= 200 && res.statusCode < 400) {
        const datosAuditoria = {
          usuario_id: req.usuario?.id,
          accion,
          modulo,
          registro_id: req.params.id || req.body?.id,
          registro_tipo: modulo,
          ip_address: req.ip || req.connection.remoteAddress,
          user_agent: req.get('user-agent'),
          latitud: req.body?.latitud || req.usuario?.latitud,
          longitud: req.body?.longitud || req.usuario?.longitud,
          valores_anteriores: req.valoresAnteriores,
          valores_nuevos: req.method === 'DELETE' ? null : req.body
        };
        
        // Registrar en background (no bloquear respuesta)
        registrarAuditoria(datosAuditoria).catch(console.error);
      }
      
      originalSend.call(this, data);
    };
    
    next();
  };
};

/**
 * Middleware de auditoría detallada
 * Registra valores anteriores obteniendo de la base de datos
 */
const auditLogDetailed = (accion, modulo) => {
  return async (req, res, next) => {
    // Para actualizaciones, obtener valores anteriores de DB
    if ((req.method === 'PUT' || req.method === 'PATCH') && req.params.id) {
      try {
        const { data: registroActual } = await supabase
          .from(modulo)
          .select('*')
          .eq('id', req.params.id)
          .single();
        
        req.valoresAnteriores = registroActual;
      } catch (error) {
        console.error('Error al obtener valores anteriores:', error);
      }
    }
    
    const originalSend = res.send;
    
    res.send = function(data) {
      if (res.statusCode >= 200 && res.statusCode < 400) {
        const datosAuditoria = {
          usuario_id: req.usuario?.id,
          accion,
          modulo,
          registro_id: req.params.id || req.body?.id,
          registro_tipo: modulo,
          ip_address: req.ip || req.connection.remoteAddress,
          user_agent: req.get('user-agent'),
          latitud: req.body?.latitud || req.usuario?.latitud,
          longitud: req.body?.longitud || req.usuario?.longitud,
          valores_anteriores: req.valoresAnteriores,
          valores_nuevos: req.method === 'DELETE' ? null : req.body
        };
        
        registrarAuditoria(datosAuditoria).catch(console.error);
      }
      
      originalSend.call(this, data);
    };
    
    next();
  };
};

/**
 * Obtener historial de auditoría
 */
const obtenerAuditoria = async (filtros = {}) => {
  try {
    let query = supabase
      .from('auditoria')
      .select('*, usuarios(nombre, email)')
      .order('fecha', { ascending: false });
    
    if (filtros.usuario_id) {
      query = query.eq('usuario_id', filtros.usuario_id);
    }
    
    if (filtros.modulo) {
      query = query.eq('modulo', filtros.modulo);
    }
    
    if (filtros.accion) {
      query = query.eq('accion', filtros.accion);
    }
    
    if (filtros.registro_id) {
      query = query.eq('registro_id', filtros.registro_id);
    }
    
    if (filtros.fecha_inicio) {
      query = query.gte('fecha', filtros.fecha_inicio);
    }
    
    if (filtros.fecha_fin) {
      query = query.lte('fecha', filtros.fecha_fin);
    }
    
    if (filtros.limit) {
      query = query.limit(filtros.limit);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    return data;
  } catch (error) {
    console.error('Error al obtener auditoría:', error);
    throw error;
  }
};

module.exports = {
  auditLog,
  auditLogDetailed,
  registrarAuditoria,
  obtenerAuditoria
};
