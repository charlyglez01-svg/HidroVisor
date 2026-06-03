// =============================================================================
// routes/users.js — Rutas de gestión de usuarios 
//
// Archivo generado por el scaffolding de Express. Por ahora solo tiene el
// esqueleto con una ruta GET / de prueba.
//
// La autenticación y el manejo de sesión están en routes/auth.js.
// El modelo de datos está en models/User.js.
// =============================================================================

var express = require('express');
var router  = express.Router();

// GET /users — ruta de prueba generada por Express, sin uso real todavía.
router.get('/', function(req, res, next) {
  res.send('respond with a resource');
});

module.exports = router;