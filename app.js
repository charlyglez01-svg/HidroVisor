// Cargamos las variables de entorno desde el fichero .env antes de cualquier otra cosa.
// Esto nos permite mantener credenciales y configuraciones sensibles fuera del repositorio.
require('dotenv').config();

var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
// Mongoose es el ODM que nos conecta con MongoDB de forma elegante
const mongoose = require('mongoose');

// Rutas principales de la aplicación (vistas, dashboard...)
var indexRouter = require('./routes/index');
// Rutas de autenticación: login, registro y gestión de sesiones
var authRouter = require('./routes/auth');

var app = express();

// --- CONEXIÓN A MONGODB ---
// Conectamos a la base de datos local del proyecto HidroVisor.
// La cadena de conexión debería moverse a process.env.MONGO_URI en producción.
mongoose.connect('mongodb://127.0.0.1:27017/hidrovisor')
  .then(() => console.log('Conectado a MongoDB (HidroVisor)'))
  .catch(err => console.error('Error conectando a Mongo:', err));

// Configuramos EJS como motor de plantillas y apuntamos al directorio de vistas
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Middleware de logging: muestra en consola cada petición con su estado y tiempo de respuesta
app.use(logger('dev'));

// Permitimos recibir cuerpos de petición en formato JSON y en formato de formulario
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Parseamos las cookies para poder leerlas cómodamente en los controladores
app.use(cookieParser());

// Servimos los archivos estáticos (CSS, JS del cliente, imágenes) desde /public
app.use(express.static(path.join(__dirname, 'public')));

// Montamos las rutas principales y las de autenticación
app.use('/', indexRouter);
app.use('/auth', authRouter);

// Si llegamos hasta aquí sin que ninguna ruta haya respondido, es un 404
app.use(function(req, res, next) {
  next(createError(404));
});

// Manejador de errores global: en desarrollo mostramos el stack completo,
// en producción ocultamos los detalles para no exponer información sensible
app.use(function(err, req, res, next) {
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};
  res.status(err.status || 500);
  res.render('error');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(Servidor escuchando en el puerto ${PORT});
});

module.exports = app;
