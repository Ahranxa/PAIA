const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

/**
 * Cache de permisos por rol para evitar consultas repetidas
 * Formato: { rolId: [permiso1, permiso2, ...] }
 */
const permisosCache = new Map();

/**
 * Tiempo de vida del cache en milisegundos (5 minutos)
 */
const CACHE_TTL = 5 * 60 * 1000;

/**
 * Obtener permisos de un rol
 */
const obtenerPermisosRol = async (rolId) => {
  // Verificar cache
  const cached = permisosCache.get(rolId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.permisos;
  }
  
  // Consultar permisos
  const { data: permisos, error } = await supabase
    .from('roles_permisos')
    .select('permisos(*)')
    .eq('rol_id', rolId);
  
  if (error) {
    console.error('Error al obtener permisos:', error);
    return [];
  }
  
  const permisosList = permisos.map(p => p.permisos.codigo);
  
  // Guardar en cache
  permisosCache.set(rolId, {
    permisos: permisosList,
    timestamp: Date.now()
  });
  
  return permisosList;
};

/**
 * Middleware de autorización por permiso
 * Requiere que el middleware de autenticación se haya ejecutado antes
 */
const authorize = (permisoRequerido) => {
  return async (req, res, next) => {
    try {
      if (!req.usuario) {
        return res.status(401).json({ error: 'No autenticado' });
      }
      
      // Si es administrador, permitir todo
      if (req.usuario.rol === 'administrador') {
        return next();
      }
      
      // Si el usuario no tiene rol_id aún (migración en progreso), usar rol antiguo
      if (!req.usuario.rol_id) {
        // Mapeo temporal de roles antiguos a permisos
        const permisosPorRolAntiguo = {
          'administrador': ['*'],
          'editor': ['product.create', 'product.edit', 'inventory.view', 'movement.view'],
          'usuario': ['inventory.view', 'movement.view']
        };
        
        const permisosUsuario = permisosPorRolAntiguo[req.usuario.rol] || [];
        
        if (permisosUsuario.includes('*') || permisosUsuario.includes(permisoRequerido)) {
          return next();
        }
        
        return res.status(403).json({ 
          error: 'No tienes permiso para realizar esta acción',
          requerido: permisoRequerido
        });
      }
      
      // Obtener permisos del rol
      const permisos = await obtenerPermisosRol(req.usuario.rol_id);
      
      if (permisos.includes('*') || permisos.includes(permisoRequerido)) {
        return next();
      }
      
      return res.status(403).json({ 
        error: 'No tienes permiso para realizar esta acción',
        requerido: permisoRequerido,
        permisos_usuario: permisos
      });
    } catch (error) {
      console.error('Error en autorización:', error);
      res.status(500).json({ error: 'Error en autorización' });
    }
  };
};

/**
 * Middleware de autorización por rol (compatibilidad)
 */
const requireRole = (rolesPermitidos) => {
  return (req, res, next) => {
    if (!req.usuario) {
      return res.status(401).json({ error: 'No autenticado' });
    }
    
    if (rolesPermitidos.includes(req.usuario.rol)) {
      return next();
    }
    
    return res.status(403).json({ 
      error: 'Rol no autorizado',
      requerido: rolesPermitidos
    });
  };
};

/**
 * Middleware de autorización opcional
 * No rechaza si no tiene permiso, pero agrega flag tienePermiso
 */
const optionalAuthorize = (permisoRequerido) => {
  return async (req, res, next) => {
    try {
      if (!req.usuario) {
        req.tienePermiso = false;
        return next();
      }
      
      if (req.usuario.rol === 'administrador') {
        req.tienePermiso = true;
        return next();
      }
      
      if (!req.usuario.rol_id) {
        const permisosPorRolAntiguo = {
          'administrador': ['*'],
          'editor': ['product.create', 'product.edit', 'inventory.view', 'movement.view'],
          'usuario': ['inventory.view', 'movement.view']
        };
        
        const permisosUsuario = permisosPorRolAntiguo[req.usuario.rol] || [];
        req.tienePermiso = permisosUsuario.includes('*') || permisosUsuario.includes(permisoRequerido);
        return next();
      }
      
      const permisos = await obtenerPermisosRol(req.usuario.rol_id);
      req.tienePermiso = permisos.includes('*') || permisos.includes(permisoRequerido);
      
      next();
    } catch (error) {
      req.tienePermiso = false;
      next();
    }
  };
};

/**
 * Limpiar cache de permisos
 */
const limpiarCache = () => {
  permisosCache.clear();
};

/**
 * Limpiar cache de un rol específico
 */
const limpiarCacheRol = (rolId) => {
  permisosCache.delete(rolId);
};

module.exports = {
  authorize,
  requireRole,
  optionalAuthorize,
  limpiarCache,
  limpiarCacheRol
};
