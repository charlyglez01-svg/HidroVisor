// =============================================================================
// routes/auth.js — Rutas de autenticación de usuario
//
// Gestiona todo el ciclo de vida de sesión: registro, login, logout y
// consulta de usuario activo.
//
// Todas las sesiones se manejan mediante JWT en cookie httpOnly (hv_token).
// No se usa express-session ni passport — el token se lee manualmente en
// cada ruta que lo necesite usando el helper userFromToken().
// =============================================================================

const express = require('express');
const jwt     = require('jsonwebtoken');
const router  = express.Router();
const User    = require('../models/User');

// ─────────────────────────────────────────────────────────────────────────────
// Configuración JWT.
// ─────────────────────────────────────────────────────────────────────────────
const JWT_SECRET  = process.env.JWT_SECRET  || 'cambiame-en-produccion-urgentemente';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '7d';


// =============================================================================
// Helper: enviarToken(res, user)
//
// Firma un JWT con los datos básicos del usuario y lo mete en una cookie
// httpOnly llamada 'hv_token'. La cookie dura 7 días igual que el token,
// así que si cambias JWT_EXPIRES recuerda actualizar también el maxAge.
//
// Se llama al final de /registro y /login para unificar ese comportamiento.
// No devuelve nada útil al caller salvo el token en sí (por si lo necesitas
// en algún contexto sin respuesta HTTP, aunque aquí no se usa así).
// =============================================================================
function enviarToken(res, user) {
  const token = jwt.sign(
    { id: user._id, email: user.email, rol: user.rol },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );

  res.cookie('hv_token', token, {
    httpOnly: true,
    // En desarrollo la cookie viaja aunque no sea HTTPS, en producción no.
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 días en ms — igual que JWT_EXPIRES
  });

  return token;
}


// =============================================================================
// Helper: userFromToken(req) → User | null
//
// Lee la cookie hv_token, verifica la firma del JWT y busca al usuario en
// base de datos. Devuelve el documento completo del usuario o null si la
// cookie no existe, está caducada o el usuario ya no existe en BD.
//
// Ojo: esto implica una consulta a Mongo en cada ruta que lo llame.
// Por ahora es asumible, pero si el tráfico crece podría merecer convertirse
// en middleware que cachee el usuario en req.user.
// =============================================================================
async function userFromToken(req) {
  const token = req.cookies?.hv_token;
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return await User.findById(decoded.id);
  } catch {
    // Token inválido, caducado o usuario eliminado — tratamos todo igual
    return null;
  }
}


// =============================================================================
// POST /auth/registro
//
// Crea una cuenta nueva. Valida campos obligatorios, coincidencia de
// contraseñas, longitud mínima y unicidad de email antes de insertar.
//
// Body esperado: { nombre, email, password, password2 }
// Respuesta OK:  201 { ok: true, user: SafeObject }  + cookie hv_token
// Respuesta KO:  400 / 409 / 500 { ok: false, msg: string }
//
// El modelo User ya hashea la contraseña antes de guardar (pre-save hook),
// así que aquí no hay que hacer nada más con ella.
// =============================================================================
router.post('/registro', async (req, res) => {
  try {
    const { nombre, email, password, password2 } = req.body;

    // Validaciones básicas antes de tocar la base de datos
    if (!nombre || !email || !password) {
      return res.status(400).json({ ok: false, msg: 'Faltan campos obligatorios' });
    }
    if (password !== password2) {
      return res.status(400).json({ ok: false, msg: 'Las contraseñas no coinciden' });
    }
    if (password.length < 8) {
      return res.status(400).json({ ok: false, msg: 'Contraseña mínima de 8 caracteres' });
    }

    // Comprobamos unicidad manualmente para dar un mensaje claro.
    // Mongo también lanzaría error de índice único, pero el mensaje sería feo.
    const existente = await User.findOne({ email: email.toLowerCase() });
    if (existente) {
      return res.status(409).json({ ok: false, msg: 'Ese email ya está registrado' });
    }

    const nuevo = await User.create({ nombre, email, password });
    enviarToken(res, nuevo);

    res.status(201).json({ ok: true, user: nuevo.toSafeObject() });

  } catch (err) {
    // Los errores de validación de Mongoose tienen su propia estructura
    if (err.name === 'ValidationError') {
      const primeros = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({ ok: false, msg: primeros[0] });
    }
    console.error('Error en /registro:', err);
    res.status(500).json({ ok: false, msg: 'Error interno del servidor' });
  }
});


// =============================================================================
// POST /auth/login
//
// Autentica a un usuario existente. Busca por email (case-insensitive),
// compara la contraseña con el hash almacenado y emite un token si todo ok.
// También actualiza el campo ultimoAcceso del usuario.
//
// Body esperado: { email, password }
// Respuesta OK:  200 { ok: true, user: SafeObject }  + cookie hv_token
// Respuesta KO:  400 / 401 / 500 { ok: false, msg: string }
//
// Nota: los mensajes de error para "usuario no encontrado" y "contraseña
// incorrecta" son idénticos a propósito — evita enumerar usuarios válidos.
// =============================================================================
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ ok: false, msg: 'Email y contraseña obligatorios' });
    }

    // select('+password') es necesario porque el campo está marcado como
    // select: false en el modelo para que no salga en consultas normales
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');

    if (!user) {
      return res.status(401).json({ ok: false, msg: 'Credenciales inválidas' });
    }

    const coincide = await user.compararPassword(password);
    if (!coincide) {
      return res.status(401).json({ ok: false, msg: 'Credenciales inválidas' });
    }

    // Guardamos sin validar para no re-ejecutar reglas del modelo en un simple
    // update de timestamp — es seguro porque no estamos cambiando datos críticos
    user.ultimoAcceso = new Date();
    await user.save({ validateBeforeSave: false });

    enviarToken(res, user);
    res.json({ ok: true, user: user.toSafeObject() });

  } catch (err) {
    console.error('Error en /login:', err);
    res.status(500).json({ ok: false, msg: 'Error interno del servidor' });
  }
});


// =============================================================================
// POST /auth/logout
//
// Cierra la sesión limpiando la cookie del token. No necesita autenticación
// previa — si no hay cookie, simplemente no hay nada que borrar.
//
// Respuesta: 200 { ok: true }
// =============================================================================
router.post('/logout', (req, res) => {
  res.clearCookie('hv_token');
  res.json({ ok: true });
});


// =============================================================================
// GET /auth/me
//
// Devuelve el usuario actualmente autenticado según la cookie.
// El frontend lo usa al cargar la app para saber si hay sesión activa
// sin redirigir ni lanzar un 401 — por eso devuelve 200 en ambos casos.
//
// Respuesta (autenticado):    200 { ok: true,  user: SafeObject }
// Respuesta (no autenticado): 200 { ok: false, user: null }
// =============================================================================
router.get('/me', async (req, res) => {
  const user = await userFromToken(req);
  if (!user) return res.json({ ok: false, user: null });
  res.json({ ok: true, user: user.toSafeObject() });
});

module.exports = router;