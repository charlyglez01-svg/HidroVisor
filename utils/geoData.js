// /utils/geoData.js
// Módulo centralizado de datos geográficos del proyecto HidroVisor.
// Aquí viven los datos estáticos de ríos y comunidades, las coordenadas
// de embalses y las funciones de búsqueda y geolocalización.

// Datos principales de los ríos españoles más relevantes para el sistema.
// Los caudales medios proceden de distintos organismos de cuenca (CEDEX, CHE, CHD...).
const RIOS = [
  {id:101, n:"Tajo", lat:39.86, lng:-4.02, reg:"Varias", vertiente:"Atlántica", longitud:1007, caudal:444, fuente:"CEDEX"},
  {id:102, n:"Ebro", lat:41.65, lng:-0.87, reg:"Varias", vertiente:"Mediterránea", longitud:930, caudal:426, fuente:"CHE"},
  {id:103, n:"Duero", lat:41.65, lng:-4.72, reg:"Castilla y León", vertiente:"Atlántica", longitud:897, caudal:675, fuente:"CHD"},
  {id:104, n:"Guadiana", lat:38.91, lng:-5.14, reg:"Varias", vertiente:"Atlántica", longitud:742, caudal:78, fuente:"CHG"},
  {id:105, n:"Guadalquivir", lat:37.38, lng:-5.98, reg:"Andalucía", vertiente:"Atlántica", longitud:657, caudal:164, fuente:"CHG"},
  {id:106, n:"Miño", lat:42.50, lng:-8.00, reg:"Galicia", vertiente:"Atlántica", longitud:315, caudal:340, fuente:"CHMS"}
];

// Centroides aproximados de cada comunidad autónoma.
// Se usan para el algoritmo de asignación espacial de embalses.
const CCAAs = [
  {n: "Andalucía", lat: 37.40, lng: -4.50}, {n: "Aragón", lat: 41.50, lng: -0.60},
  {n: "Asturias", lat: 43.30, lng: -5.90}, {n: "Islas Baleares", lat: 39.60, lng: 2.90},
  {n: "Canarias", lat: 28.30, lng: -15.80}, {n: "Cantabria", lat: 43.20, lng: -4.00},
  {n: "Castilla y León", lat: 41.70, lng: -4.70}, {n: "Castilla-La Mancha", lat: 39.60, lng: -3.00},
  {n: "Cataluña", lat: 41.70, lng: 1.50}, {n: "Com. Valenciana", lat: 39.50, lng: -0.50},
  {n: "Extremadura", lat: 39.20, lng: -6.10}, {n: "Galicia", lat: 42.80, lng: -7.90},
  {n: "Madrid", lat: 40.50, lng: -3.70}, {n: "Murcia", lat: 38.00, lng: -1.50},
  {n: "Navarra", lat: 42.70, lng: -1.60}, {n: "País Vasco", lat: 43.00, lng: -2.60},
  {n: "La Rioja", lat: 42.30, lng: -2.50}
];

// Coordenadas reales de los embalses, almacenadas en un JSON externo
// para mantener este fichero manejable y facilitar actualizaciones futuras.
const COORDENADAS = require('../data/coordenadas_reales.json');

/**
 * Normaliza un texto para comparaciones insensibles a tildes y mayúsculas.
 * Útil para buscar nombres de embalses que pueden llegar escritos de formas distintas.
 */
function normalizar(texto) {
    if (!texto) return "";
    return texto.toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

// Preconstruimos el diccionario de coordenadas con claves normalizadas.
// Lo hacemos aquí una sola vez para no repetir el trabajo en cada búsqueda.
const dictNormalizado = {};
for (const [key, coords] of Object.entries(COORDENADAS)) {
    dictNormalizado[normalizar(key)] = coords;
}

/**
 * Busca las coordenadas de un embalse por nombre, con tolerancia a variaciones.
 * Primero intenta coincidencia exacta (normalizada); si falla, prueba coincidencia parcial.
 * Esto cubre casos como "El Atazar" vs "Atazar, El" que vienen de fuentes distintas.
 */
function encontrarCoordenadas(nombre) {
    const nombreNorm = normalizar(nombre);

    // Búsqueda exacta: la opción más rápida y segura
    if (dictNormalizado[nombreNorm]) return dictNormalizado[nombreNorm];

    // Si no hay coincidencia exacta, intentamos por inclusión en ambas direcciones
    for (const [keyNorm, coords] of Object.entries(dictNormalizado)) {
        if (nombreNorm.includes(keyNorm) || keyNorm.includes(nombreNorm)) return coords;
    }

    // Si llegamos aquí es que el embalse no está en nuestros datos
    return null;
}

/**
 * Dado un punto geográfico, devuelve la comunidad autónoma española a la que pertenece.
 * Usa el centroide más cercano como heurística: no es perfecto en los límites,
 * pero para embalses del interior es más que suficiente.
 * 
 * Nota: usamos la distancia euclídea al cuadrado (sin raíz) para ahorrar operaciones.
 */
function obtenerComunidad(lat, lng) {
    let minDist = Infinity;
    let closest = "España"; // Valor por defecto si algo falla
    for(let r of CCAAs) {
        let d = Math.pow(lat - r.lat, 2) + Math.pow(lng - r.lng, 2);
        if(d < minDist) { minDist = d; closest = r.n; }
    }
    return closest;
}

// Exportamos todo lo que puedan necesitar el resto de módulos del proyecto
module.exports = {
    RIOS,
    CCAAs,
    COORDENADAS,
    normalizar,
    encontrarCoordenadas,
    obtenerComunidad
};