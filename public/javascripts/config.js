// ============================================================
// config.js — Estado global, configuración compartida y datos estáticos
// Cargado primero. Todos los demás módulos dependen de este.
// ============================================================

//  Configuración global de Chart.js 
// Aplicamos defaults aquí para no repetirlos en cada gráfico
Chart.defaults.color        = '#2a4560';
Chart.defaults.borderColor  = 'rgba(255,255,255,0.04)';
Chart.defaults.font.family  = "'Outfit', sans-serif";
Chart.defaults.font.size    = 13;

// Datos de aplicación (se rellenan tras la llamada a la API) ──
let EMBALSES = [];
let RIOS     = [];

// Estado global de la UI 
// Estas variables son leídas y escritas desde distintos módulos
let activeTab            = 'regions';
let currentRegionFilter  = null;

// Referencias a instancias de Chart.js 
// Se destruyen y recrean cada vez que se cambia el detalle activo
let lChart = null;
let dChart = null;

//  Estado del mapa principal (Leaflet) 
let map              = null;
let borderLayer      = null;   // Polígono de la CCAA seleccionada
let riverLayer       = null;   // Tramo de río activo
let cachedGeoJSON    = null;   // GeoJSON de comunidades autónomas (cargado al inicio)
let allRiosGeoJSON   = null;   // GeoJSON completo de tramos de ríos (carga secundaria)
let embalsesLayerGroup = null;
let riosLayerGroup     = null;

// Estado del radar de precipitaciones 
let radarLayers        = [];
let radarTimestamps    = [];
let animationPosition  = 0;
let animationTimer     = null;
let isRadarActive      = false;

//  Metadatos de regiones 
// Usados tanto para la navegación del sidebar como para el matching GeoJSON.
// "aliases" sirve para identificar la feature GeoJSON correcta (los nombres
// no siempre coinciden exactamente con los del backend).
const REGIONS = {
  "Andalucía":          { lat: 37.40, lng: -4.50, zoom: 7, aliases: ["andalucia"] },
  "Aragón":             { lat: 41.50, lng: -0.60, zoom: 7, aliases: ["aragon"] },
  "Asturias":           { lat: 43.30, lng: -5.90, zoom: 8, aliases: ["asturias", "principado de asturias"] },
  "Islas Baleares":     { lat: 39.60, lng:  2.90, zoom: 8, aliases: ["islasbaleares", "illesbalears", "baleares"] },
  "Canarias":           { lat: 28.30, lng: -15.80, zoom: 7, aliases: ["canarias", "islascanarias"] },
  "Cantabria":          { lat: 43.20, lng: -4.00, zoom: 8, aliases: ["cantabria"] },
  "Castilla y León":    { lat: 41.70, lng: -4.70, zoom: 7, aliases: ["castillayleon", "castillay", "yleon", "castillaleon"] },
  "Castilla-La Mancha": { lat: 39.60, lng: -3.00, zoom: 7, aliases: ["castillalamancha"] },
  "Cataluña":           { lat: 41.70, lng:  1.50, zoom: 7, aliases: ["cataluna", "catalunya"] },
  "Com. Valenciana":    { lat: 39.50, lng: -0.50, zoom: 7, aliases: ["comunidadvalenciana", "comunitatvalenciana", "valencia"] },
  "Extremadura":        { lat: 39.20, lng: -6.10, zoom: 7, aliases: ["extremadura"] },
  "Galicia":            { lat: 42.80, lng: -7.90, zoom: 7, aliases: ["galicia"] },
  "Madrid":             { lat: 40.50, lng: -3.70, zoom: 9, aliases: ["madrid", "comunidaddemadrid"] },
  "Murcia":             { lat: 38.00, lng: -1.50, zoom: 8, aliases: ["murcia", "regiondemurcia"] },
  "Navarra":            { lat: 42.70, lng: -1.60, zoom: 8, aliases: ["navarra", "comunidadforaldenavarra"] },
  "País Vasco":         { lat: 43.00, lng: -2.60, zoom: 8, aliases: ["paisvasco", "euskadi"] },
  "La Rioja":           { lat: 42.30, lng: -2.50, zoom: 8, aliases: ["larioja", "rioja"] }
};

//  Geometrías estáticas de ríos principales
// Fallback: si allRiosGeoJSON no se carga o el algoritmo de matching falla,
// usamos estas líneas simplificadas para dibujar el cauce en el mapa.
// Clave = ID del río en RIOS[].id
const RIVER_PATHS = {
  101: { type: "LineString", coordinates: [[-1.66,40.38],[-2.33,40.12],[-3.18,40.03],[-4.05,39.86],[-5.25,39.81],[-6.21,39.67],[-7.21,39.65],[-8.61,39.25],[-9.15,38.69]] },
  102: { type: "LineString", coordinates: [[-4.14,43.02],[-3.45,42.75],[-2.67,42.55],[-1.81,42.27],[-1.15,41.85],[-0.58,41.65],[-0.04,41.42],[0.55,41.24],[0.85,40.72]] },
  103: { type: "LineString", coordinates: [[-2.88,41.95],[-3.52,41.68],[-4.12,41.58],[-4.89,41.49],[-5.65,41.51],[-6.38,41.33],[-7.15,41.15],[-8.04,41.14],[-8.66,41.14]] },
  104: { type: "LineString", coordinates: [[-2.80,39.05],[-3.45,39.15],[-4.25,39.01],[-5.15,38.95],[-6.12,38.86],[-6.95,38.85],[-7.35,38.25],[-7.42,37.20]] },
  105: { type: "LineString", coordinates: [[-2.95,37.88],[-3.55,38.05],[-4.15,37.95],[-4.85,37.85],[-5.65,37.55],[-6.01,37.25],[-6.35,36.78]] },
  106: { type: "LineString", coordinates: [[-7.30,43.25],[-7.55,42.95],[-7.82,42.65],[-8.15,42.15],[-8.45,41.95],[-8.85,41.85]] }
};

// Helpers de color y clase según % de llenado
// Usados en múltiples módulos para colorear marcadores, textos y barras.
// Verde: óptimo (≥70%), Ámbar: precaución (40–70%), Rojo: crítico (<40%)
const fillC  = p => p >= 70 ? '#00e5a3' : p >= 40 ? '#f59e0b' : '#f43f5e';
const pClsSC = p => p >= 70 ? 'text-success' : p >= 40 ? 'text-warning' : 'text-danger';

/**
 * Normaliza una cadena para comparaciones difusas:
 * quita tildes, pasa a minúsculas y elimina caracteres no alfanuméricos.
 * @param {string} str
 * @returns {string}
 */
const cleanText = str =>
  str.toLowerCase()
     .normalize("NFD")
     .replace(/[\u0300-\u036f]/g, "")
     .replace(/[^a-z0-9]/g, "");

//  Loader global 
// El loader cubre toda la pantalla durante operaciones pesadas (fetch, render de mapa).
function showLoader() { document.getElementById('appLoader').classList.remove('d-none'); }
function hideLoader() { document.getElementById('appLoader').classList.add('d-none'); }