const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

/**
 * Middleware de autenticación
 * Verifica el token JWT y carga la información del usuario
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token no proporcionado' });
    }
    
    const token = authHeader.replace('Bearer ', '');
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret-key-default');
      
      // Obtener información completa del usuario
      const { data: usuario, error } = await supabase
        .from('usuarios')
        .select('*')
        .eq('id', decoded.userId)
        .single();
      
      if (error || !usuario) {
        return res.status(401).json({ error: 'Usuario no encontrado' });
      }
      
      if (!usuario.activo) {
        return res.status(401).json({ error: 'Usuario inactivo' });
      }
      
      req.usuario = usuario;
      req.userId = decoded.userId;
      next();
    } catch (jwtError) {
      return res.status(401).json({ error: 'Token inválido o expirado' });
    }
  } catch (error) {
    console.error('Error en autenticación:', error);
    res.status(500).json({ error: 'Error en autenticación' });
  }
};

/**
 * Middleware opcional de autenticación
 * No rechaza la petición si no hay token, pero carga el usuario si existe
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }
    
    const token = authHeader.replace('Bearer ', '');
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret-key-default');
      
      const { data: usuario } = await supabase
        .from('usuarios')
        .select('*')
        .eq('id', decoded.userId)
        .single();
      
      if (usuario && usuario.activo) {
        req.usuario = usuario;
        req.userId = decoded.userId;
      }
    } catch (jwtError) {
      // Ignorar error de token en autenticación opcional
    }
    
    next();
  } catch (error) {
    next();
  }
};

/**
 * Generar token JWT
 */
const generateToken = (userId, rol) => {
  return jwt.sign(
    { userId, rol },
    process.env.JWT_SECRET || 'secret-key-default',
    { expiresIn: '8h' }
  );
};

/**
 * Verificar token sin middleware
 */
const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET || 'secret-key-default');
  } catch (error) {
    return null;
  }
};

module.exports = {
  authenticate,
  optionalAuth,
  generateToken,
  verifyToken
};
