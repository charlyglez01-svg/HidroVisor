const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const userSchema = new mongoose.Schema({
  nombre: {
    type: String,
    required: [true, 'El nombre es obligatorio'],
    trim: true,
    minlength: [2, 'Nombre demasiado corto'],
    maxlength: [60, 'Nombre demasiado largo']
  },
  email: {
    type: String,
    required: [true, 'El email es obligatorio'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      'Formato de email no válido'
    ]
  },
  password: {
    type: String,
    required: [true, 'La contraseña es obligatoria'],
    minlength: [8, 'La contraseña debe tener al menos 8 caracteres'],
    select: false
  },
  rol: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  emailVerificado: {
    type: Boolean,
    default: false
  },
  tokenVerificacion: String,
  ultimoAcceso: Date,
  preferencias: {
    temaOscuro: { type: Boolean, default: true },
    embalsesFavoritos: [{ type: String }]
  }
}, {
  timestamps: true
});

// Hashear contraseña antes de guardar
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
});

// Método para comparar contraseña en login
userSchema.methods.compararPassword = async function (passwordCandidata) {
  return bcrypt.compare(passwordCandidata, this.password);
};

// Método para devolver objeto seguro (sin password)
userSchema.methods.toSafeObject = function () {
  return {
    id: this._id,
    nombre: this.nombre,
    email: this.email,
    rol: this.rol,
    preferencias: this.preferencias,
    createdAt: this.createdAt
  };
};

module.exports = mongoose.model('User', userSchema);