// =============================================================================
// routes/index.js — Rutas principales de la aplicación
//
// Este archivo hace tres cosas a la vez:
//
//   1. Rutas de vistas (páginas renderizadas con EJS/Pug/etc.)
//   2. API propia: embalses y ríos (datos de GitHub + geodata local)
//   3. API de AEMET: municipios, predicción y observaciones meteorológicas
// =============================================================================

const express = require('express');
const router  = express.Router();

const githubService = require('../services/githubService');
const geoData       = require('../utils/geoData');


// =============================================================================
// CONFIGURACIÓN AEMET
//
// La API de AEMET requiere una clave por query string en cada petición.
// Todas las llamadas siguen el mismo patrón de dos pasos:
//   1. Petición al endpoint → devuelve una URL temporal con los datos reales
//   2. Fetch a esa URL temporal → devuelve el JSON/buffer con los datos
//
// Esto lo gestiona fetchAemetSeguro() más abajo.
// =============================================================================
const AEMET_KEY  = process.env.AEMET_API_KEY;
const AEMET_BASE = 'https://opendata.aemet.es/opendata/api';

// Límite de estaciones meteorológicas que enviamos al cliente en /observaciones.
// AEMET devuelve varios miles — renderizarlos todos en el mapa es demasiado
// para el navegador. Con 100 marcadores el mapa va fluido sin perder cobertura.
const LIMITE_MARCADORES_MAPA = 100;

// Caché en memoria para el listado de municipios. Se carga una vez al arrancar
// y se reutiliza en todas las peticiones.
let municipiosCache = null;


// =============================================================================
// getMunicipios() → Array
//
// Descarga y cachea el listado completo de municipios de AEMET (necesario para
// relacionar nombres con códigos de predicción). Lo intenta hasta 3 veces con
// 1.5s de espera entre intentos para absorber errores transitorios de red.
//
// La respuesta de AEMET viene codificada en ISO-8859-1, de ahí el TextDecoder.
//
// Importante: esta función se llama al final de su definición para pre-cargar
// la caché al arrancar el servidor. Eso significa que si AEMET está caído en
// el momento del deploy, el servidor arranca igualmente pero municipiosCache
// quedará como array vacío hasta que alguien llame a /api/aemet/municipios.
// =============================================================================
async function getMunicipios() {
  if (municipiosCache) return municipiosCache;

  let ultimoError;
  for (let i = 0; i < 3; i++) {
    try {
      const r1 = await fetch(`${AEMET_BASE}/maestro/municipios?api_key=${AEMET_KEY}`);
      const j1 = await r1.json();

      // La respuesta es la URL donde están los datos reales — patrón habitual de AEMET
      const r2     = await fetch(j1.datos);
      const buffer = await r2.arrayBuffer();

      // AEMET sirve este endpoint en ISO-8859-1, no en UTF-8
      const text        = new TextDecoder('iso-8859-1').decode(buffer);
      municipiosCache   = JSON.parse(text);

      console.log(`Municipios AEMET cargados: ${municipiosCache.length}`);
      return municipiosCache;

    } catch(e) {
      ultimoError = e;
      console.log(`Intento ${i+1} fallido al cargar municipios. Reintentando en 1.5s...`);
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }

  console.error('Error definitivo cargando municipios AEMET:', ultimoError.message || ultimoError);
  return [];
}

// Pre-carga al arrancar. El resultado se descarta aquí — solo nos interesa
// que la caché quede rellena para las peticiones posteriores.
getMunicipios();


// =============================================================================
// fetchAemetSeguro(endpoint, reintentos?) → JSON
//
// Wrapper genérico para cualquier endpoint de AEMET que siga el patrón de
// "primero dame la URL, luego ve a buscar los datos a esa URL".
//
// Maneja reintentos automáticos y trata el rate limit (429) con más espera
// que un error normal de red. Lanza el último error si se agotan los intentos.
//
// @param endpoint   - Ruta relativa del API, ej: '/prediccion/especifica/...'
// @param reintentos - Número de intentos antes de rendirse (por defecto 3)
// @returns          - Objeto JSON con los datos de la respuesta final de AEMET
// =============================================================================
async function fetchAemetSeguro(endpoint, reintentos = 3) {
  let ultimoError;

  for (let i = 0; i < reintentos; i++) {
    try {
      const r1 = await fetch(`${AEMET_BASE}${endpoint}?api_key=${AEMET_KEY}`);
      const j1 = await r1.json();

      if (j1.estado === 429) throw new Error("Rate limit de AEMET alcanzado (429)");
      if (!j1.datos) throw new Error(j1.descripcion || 'Sin URL de datos intermedios');

      const r2 = await fetch(j1.datos);
      if (!r2.ok) throw new Error(`Fallo en la descarga del JSON final (${r2.status})`);

      return await r2.json();

    } catch (e) {
      ultimoError = e;
      // El rate limit de AEMET necesita más tiempo de espera que un error normal
      const waitTime = e.message.includes('429') ? 5000 : 1500;
      console.log(`Fallo AEMET en [${endpoint}]. Reintento ${i+1}/${reintentos} en ${waitTime/1000}s...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  throw ultimoError;
}


// =============================================================================
// RUTAS DE VISTAS
// =============================================================================

// GET / — Página principal del visor hídrico
// currentUser viene inyectado por el middleware de sesión de Mongo (app.js)
// y lo pasamos a la vista para mostrar el nombre del usuario si está logado.
router.get('/', function (req, res) {
  res.render('index', {
    title: 'HidroVisor - Sistema Oficial',
    currentUser: res.locals.currentUser
  });
});

// GET /login y /registro — Páginas de autenticación (solo vistas, sin lógica)
// La lógica real está en routes/auth.js
router.get('/login',    (req, res) => res.render('login'));
router.get('/registro', (req, res) => res.render('registro'));

// GET /mapas-tematicos — Visor de capas WMS via API-IDEE
router.get('/mapas-tematicos', (req, res) => res.render('mapas-tematicos'));


// =============================================================================
// API — DATOS PROPIOS DEL VISOR
// =============================================================================

// GET /api/embalses
// Devuelve el listado completo de embalses desde el servicio de GitHub.
// Si el servicio falla, githubService.getEmbalses() devuelve null y aquí
// enviamos array vacío para no romper el frontend.
router.get('/api/embalses', async function (req, res) {
  const embalses = await githubService.getEmbalses();
  res.json(embalses || []);
});

// GET /api/rios
// Devuelve los datos de ríos desde el archivo de geodata local (utils/geoData).
// Es estático, no hay petición externa — si los datos cambian hay que actualizar
// el archivo y reiniciar el servidor.
router.get('/api/rios', function (req, res) {
  res.json(geoData.RIOS);
});

// GET /api/noticias
// Obtiene las últimas noticias de AEMET via RSS (a través de rss2json).
// Devuelve los 8 primeros items con título, enlace, fecha y descripción limpia
// (sin etiquetas HTML). Si falla, devuelve array vacío sin romper nada.
router.get('/api/noticias', async function(req, res) {
  try {
    const response = await fetch('https://api.rss2json.com/v1/api.json?rss_url=http%3A%2F%2Fwww.aemet.es%2Fes%2Fnoticias.rss');
    const data     = await response.json();

    const titulos = data.items.slice(0, 8).map(item => ({
      titulo:      item.title,
      link:        item.link,
      fecha:       item.pubDate ? item.pubDate.split(' ')[0] : 'Hoy',
      // Limpiamos el HTML de la descripción y la recortamos para la UI
      descripcion: item.description
        ? item.description.replace(/<[^>]*>/g, '').slice(0, 120) + '...'
        : ''
    }));

    res.json(titulos);
  } catch(e) {
    res.json([]);
  }
});


// =============================================================================
// API — METEOROLOGÍA AEMET
// =============================================================================

// GET /api/aemet/municipios
// Devuelve el listado de municipios de España cacheado en memoria.
// Se usa en el frontend para el buscador de localidades del módulo meteo.
// charset=utf-8 explícito porque el contenido viene de ISO-8859-1 que ya
// convertimos en getMunicipios(), pero Express a veces no lo infiere solo.
router.get('/api/aemet/municipios', async function(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const municipios = await getMunicipios();
  res.json(municipios);
});

// GET /api/aemet/prediccion/:cod
// Devuelve la predicción diaria para un municipio concreto.
// El parámetro :cod puede venir con o sin el prefijo 'id' (según de dónde
// venga en el frontend), por eso lo limpiamos antes de pasarlo a AEMET.
// Ejemplo: /api/aemet/prediccion/id28079 o /api/aemet/prediccion/28079
router.get('/api/aemet/prediccion/:cod', async function(req, res) {
  try {
    const codLimpio = req.params.cod.replace('id', '');
    const datos     = await fetchAemetSeguro(`/prediccion/especifica/municipio/diaria/${codLimpio}`);
    res.json(datos);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/aemet/observaciones
// Devuelve lecturas en tiempo real de estaciones meteorológicas convencionales.
// AEMET devuelve miles de estaciones — filtramos las que tienen coordenadas y
// temperatura válidas, y luego submuestreamos hasta LIMITE_MARCADORES_MAPA
// para no sobrecargar el mapa del cliente.
router.get('/api/aemet/observaciones', async function(req, res) {
  try {
    const r1 = await fetch(`${AEMET_BASE}/observacion/convencional/todas?api_key=${AEMET_KEY}`);
    const j1 = await r1.json();
    if (!j1.datos) throw new Error(j1.descripcion || 'Sin datos');

    const r2     = await fetch(j1.datos);
    const buffer = await r2.arrayBuffer();
    const text   = new TextDecoder('iso-8859-1').decode(buffer);
    const datos  = JSON.parse(text);

    // Solo nos interesan estaciones con posición y temperatura conocidas
    const estacionesValidas = datos
      .filter(e => e.lat && e.lon && e.ta !== undefined && e.ta !== null)
      .map(e => ({
        nombre: e.ubi || e.idema, // nombre legible, o el código si no hay nombre
        lat:    parseFloat(e.lat),
        lng:    parseFloat(e.lon),
        ta:     parseFloat(e.ta),
        hr:     e.hr   ?? null,
        prec:   e.prec ?? null,
        vv:     e.vv   ?? null,
      }));

    // Submuestreo uniforme para quedarnos con ~LIMITE_MARCADORES_MAPA estaciones
    const salto = Math.max(1, Math.floor(estacionesValidas.length / LIMITE_MARCADORES_MAPA));
    const estacionesReducidas = estacionesValidas.filter((_, index) => index % salto === 0);

    res.json(estacionesReducidas);

  } catch(e) {
    console.error('Error en /api/aemet/observaciones:', e.message);
    res.status(500).json({ error: e.message });
  }
});


module.exports = router;