// middleware/auth.js
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'cambiame-en-produccion-urgentemente';

function requireAuth(req, res, next) {
  const token = req.cookies?.hv_token;
  if (!token) {
    if (req.accepts('html')) return res.redirect('/login');
    return res.status(401).json({ ok: false, msg: 'No autenticado' });
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.clearCookie('hv_token');
    if (req.accepts('html')) return res.redirect('/login');
    res.status(401).json({ ok: false, msg: 'Token inválido o expirado' });
  }
}

function optionalAuth(req, res, next) {
  const token = req.cookies?.hv_token;
  if (token) {
    try { req.user = jwt.verify(token, JWT_SECRET); } catch {}
  }
  next();
}

module.exports = { requireAuth, optionalAuth };