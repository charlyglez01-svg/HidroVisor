// /services/githubService.js

const axios = require('axios');
const geoData = require('../utils/geoData');

let cacheEmbalses = [];
let ultimaActualizacion = 0;
const TIEMPO_CACHE = 1 * 60 * 60 * 1000; // 1 hora

async function sincronizarConApiGithub() {
  console.log("[Service] Descargando datos desde GitHub...");
  try {
    const API_URL = "https://raw.githubusercontent.com/charlyglez01-svg/embalses-api/main/datos/embalses.json";
    const { data } = await axios.get(API_URL, { timeout: 10000 });
    const embalsesAPI = Array.isArray(data) ? data : (data.embalses || data.data || Object.values(data));

    let listaValidada = [];
    let descartados = 0;

    embalsesAPI.forEach((item, index) => {
        const nombre = item.nombre || item.embalse || item.name || `Embalse ${index}`;
        let lat = parseFloat(item.latitud || item.lat || item.y);
        let lng = parseFloat(item.longitud || item.lng || item.lon || item.x);

        if (isNaN(lat) || isNaN(lng)) {
            const coordsRescate = geoData.encontrarCoordenadas(nombre);
            if (coordsRescate) {
                lat = coordsRescate[0]; 
                lng = coordsRescate[1];
            } else {
                descartados++; 
                return; 
            }
        }
        
        listaValidada.push({
            id: item.id || index + 1,
            n: nombre,
            lat: lat,
            lng: lng,
            reg: geoData.obtenerComunidad(lat, lng),
            cuenca: item.cuenca || "—",
            cap: item.capacidad_hm3 ?? null,   // Capacidad total hm³
            vol: item.volumen_hm3   ?? null,   // Agua actual hm³
            pct: item.porcentaje    ?? null,   // % llenado
            electrico: item.electrico || false,
            fecha: item.fecha || null,
            fuente: "MITECO"
        });
    });
    
    cacheEmbalses = listaValidada;
    ultimaActualizacion = Date.now();
    console.log(`[Service] Éxito. ${cacheEmbalses.length} embalses cargados.`);

  } catch (error) {
    console.log(`[Service Error] No se pudo leer la API: ${error.message}`);
  }
}

async function getEmbalses() {
    if (cacheEmbalses.length === 0 || (Date.now() - ultimaActualizacion > TIEMPO_CACHE)) {
        await sincronizarConApiGithub();
    }
    return cacheEmbalses;
}

module.exports = {
    getEmbalses
};