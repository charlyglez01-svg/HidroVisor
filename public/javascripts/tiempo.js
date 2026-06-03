// ============================================================
// tiempo.js — Predicción por municipio (AEMET) y mapa de observaciones
//
// Depende de: config.js (showLoader/hideLoader, showNotif), Leaflet,
// y los endpoints /api/aemet/* del backend.
// ============================================================

//  Mapeos AEMET 
// Los IDs de municipio de AEMET tienen formato "id" + código provincia (2 dígitos)
// + código municipio (3 dígitos), ej: "id28079" = Madrid.

/** Código de provincia → nombre de CCAA */
const PROV_CCAA = {
  "04":"Andalucía",  "11":"Andalucía",  "14":"Andalucía",  "18":"Andalucía",
  "21":"Andalucía",  "23":"Andalucía",  "29":"Andalucía",  "41":"Andalucía",
  "22":"Aragón",     "44":"Aragón",     "50":"Aragón",
  "33":"Asturias",
  "07":"Islas Baleares",
  "35":"Canarias",   "38":"Canarias",
  "39":"Cantabria",
  "02":"Castilla-La Mancha", "13":"Castilla-La Mancha", "16":"Castilla-La Mancha",
  "19":"Castilla-La Mancha", "45":"Castilla-La Mancha",
  "05":"Castilla y León", "09":"Castilla y León", "24":"Castilla y León",
  "34":"Castilla y León", "37":"Castilla y León", "40":"Castilla y León",
  "42":"Castilla y León", "47":"Castilla y León", "49":"Castilla y León",
  "08":"Cataluña",   "17":"Cataluña",   "25":"Cataluña",   "43":"Cataluña",
  "03":"Com. Valenciana", "12":"Com. Valenciana", "46":"Com. Valenciana",
  "06":"Extremadura","10":"Extremadura",
  "15":"Galicia",    "27":"Galicia",    "32":"Galicia",    "36":"Galicia",
  "26":"La Rioja",
  "28":"Madrid",
  "30":"Murcia",
  "31":"Navarra",
  "01":"País Vasco", "20":"País Vasco", "48":"País Vasco",
  "51":"Ceuta",      "52":"Melilla"
};

/** Código de provincia → nombre de provincia */
const PROV_NOMBRE = {
  "01":"Álava",      "02":"Albacete",   "03":"Alicante",   "04":"Almería",    "05":"Ávila",
  "06":"Badajoz",    "07":"Islas Baleares", "08":"Barcelona","09":"Burgos",    "10":"Cáceres",
  "11":"Cádiz",      "12":"Castellón",  "13":"Ciudad Real","14":"Córdoba",    "15":"A Coruña",
  "16":"Cuenca",     "17":"Girona",     "18":"Granada",    "19":"Guadalajara","20":"Guipúzcoa",
  "21":"Huelva",     "22":"Huesca",     "23":"Jaén",       "24":"León",       "25":"Lleida",
  "26":"La Rioja",   "27":"Lugo",       "28":"Madrid",     "29":"Málaga",     "30":"Murcia",
  "31":"Navarra",    "32":"Ourense",    "33":"Asturias",   "34":"Palencia",   "35":"Las Palmas",
  "36":"Pontevedra", "37":"Salamanca",  "38":"Santa Cruz de Tenerife", "39":"Cantabria",
  "40":"Segovia",    "41":"Sevilla",    "42":"Soria",      "43":"Tarragona",  "44":"Teruel",
  "45":"Toledo",     "46":"Valencia",   "47":"Valladolid", "48":"Vizcaya",    "49":"Zamora",
  "50":"Zaragoza",   "51":"Ceuta",      "52":"Melilla"
};

/**
 * Tabla de iconos para el estado del cielo según los códigos de AEMET.
 * Códigos no listados aquí se renderizan como 🌡️ (genérico).
 */
const CIELO = {
  "11":"☀️", "11n":"🌙", "12":"🌤️", "13":"⛅", "14":"🌥️", "15":"☁️", "16":"☁️",
  "17":"🌦️", "23":"🌧️", "24":"🌧️", "25":"🌧️", "26":"🌨️", "33":"🌩️", "34":"🌩️",
  "36":"🌨️", "51":"🌫️", "61":"🌧️", "71":"🌨️", "81":"⛈️", "82":"⛈️", "83":"⛈️"
};

// Estado interno del módulo
let _municipios = [];
let _cargado    = false;
let _cargando   = false; // Evita race condition si tiempoInit() se llama varias veces seguidas

//  Helpers privados 
/**
 * Extrae el código de provincia de 2 dígitos del ID de municipio AEMET.
 * Formato del ID: "id" + 2 dígitos provincia + 3 dígitos municipio → ej. "id28079"
 * @param {string} id - ID de municipio AEMET.
 * @returns {string} Código de provincia, ej: "28"
 */
function _prov(id) {
  return id.replace('id', '').slice(0, 2);
}

// Inicialización del selector de municipios

/**
 * Carga el listado de municipios desde el backend y rellena el selector de CCAA.
 * Idempotente: si ya están cargados (o se está cargando), no hace nada.
 * Llamada automáticamente cuando el usuario navega a la sección "Noticias".
 */
async function tiempoInit() {
  if (_cargado || _cargando) return;
  _cargando = true;

  try {
    const r     = await fetch('/api/aemet/municipios');
    _municipios = await r.json();
    _cargado    = true;

    // Extraemos las CCAA únicas y las ordenamos alfabéticamente
    const sel   = document.getElementById('selCCAA');
    const ccaas = new Set();
    _municipios.forEach(m => {
      const c = PROV_CCAA[_prov(m.id)];
      if (c) ccaas.add(c);
    });
    [...ccaas].sort().forEach(c => {
      const o = document.createElement('option');
      o.value = c; o.textContent = c;
      sel.appendChild(o);
    });

  } catch (e) {
    console.error('[tiempo] Error cargando municipios AEMET:', e);
  } finally {
    _cargando = false;
  }
}

// Selectores en cascada (CCAA → Provincia → Municipio) 

/**
 * Reacciona al cambio de CCAA: rellena el selector de provincias
 * y resetea el de municipios.
 */
function tiempoSelectCCAA() {
  const ccaa  = document.getElementById('selCCAA').value;
  const sProv = document.getElementById('selProvincia');
  const sMun  = document.getElementById('selMunicipio');

  // Reseteamos los niveles inferiores
  sProv.innerHTML = '<option value="">— Selecciona provincia —</option>';
  sMun.innerHTML  = '<option value="">— Primero elige provincia —</option>';
  sProv.disabled  = !ccaa;
  sMun.disabled   = true;
  document.getElementById('prediccionPanel').style.display = 'none';

  if (!ccaa) return;

  // Provincias que pertenecen a la CCAA elegida
  const provs = Object.entries(PROV_CCAA)
    .filter(([, c]) => c === ccaa)
    .map(([p]) => p)
    .sort();

  provs.forEach(p => {
    const o = document.createElement('option');
    o.value = p; o.textContent = PROV_NOMBRE[p] || p;
    sProv.appendChild(o);
  });
}

/**
 * Reacciona al cambio de provincia: filtra y carga los municipios correspondientes.
 */
function tiempoSelectProv() {
  const prov = document.getElementById('selProvincia').value;
  const sMun = document.getElementById('selMunicipio');

  sMun.innerHTML = '<option value="">— Selecciona municipio —</option>';
  sMun.disabled  = !prov;
  document.getElementById('prediccionPanel').style.display = 'none';

  if (!prov) return;

  // Filtramos y ordenamos alfabéticamente
  _municipios
    .filter(m => _prov(m.id) === prov)
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
    .forEach(m => {
      const o = document.createElement('option');
      o.value = m.id; o.textContent = m.nombre;
      sMun.appendChild(o);
    });
}

/**
 * Reacciona a la selección de un municipio: llama al backend y renderiza la predicción.
 */
async function tiempoSelectMun() {
  const id  = document.getElementById('selMunicipio').value;
  const nom = document.getElementById('selMunicipio').selectedOptions[0]?.text;
  if (!id) return;

  showLoader();
  try {
    const r    = await fetch(`/api/aemet/prediccion/${id}`);
    const data = await r.json();
    if (!data || data.error) throw new Error(data?.error || 'Sin datos de AEMET');
    _renderPrediccion(data[0], nom);
  } catch (e) {
    console.error('[tiempo] Error obteniendo predicción:', e);
    showNotif('⚠️ No se pudo obtener la predicción', true);
  } finally {
    hideLoader();
  }
}

// Render de la predicción 

/**
 * Pinta las tarjetas de la predicción de 7 días para el municipio seleccionado.
 * @param {Object} pred   - Objeto de predicción devuelto por AEMET.
 * @param {string} nombre - Nombre del municipio para mostrarlo en el título.
 */
function _renderPrediccion(pred, nombre) {
  document.getElementById('predMunicipio').textContent   = '📍 ' + nombre;
  document.getElementById('predElaboracion').textContent = pred.elaborado
    ? 'Elaborado: ' + pred.elaborado
    : '';

  const dias = pred.prediccion?.dia || [];

  document.getElementById('predDias').innerHTML = dias.slice(0, 7).map(dia => {
    const f      = new Date(dia.fecha);
    const fnom   = f.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
    const tmax   = dia.temperatura?.maxima ?? '—';
    const tmin   = dia.temperatura?.minima ?? '—';

    // Estado del cielo: preferimos el valor del periodo completo "00-24", sino el primero
    const cielo  = dia.estadoCielo?.find(e => e.periodo === '00-24') || dia.estadoCielo?.[0];
    const ico    = cielo ? (CIELO[cielo.value] || '🌡️') : '🌡️';
    const desc   = cielo?.descripcion || '';

    // Prob. de precipitación: también preferimos el periodo completo
    const lluvia = dia.probPrecipitacion?.find(p => p.periodo === '00-24')?.value
                ?? dia.probPrecipitacion?.[0]?.value
                ?? '—';

    return `
      <div class="pred-dia">
        <div class="pd-fecha">${fnom}</div>
        <div class="pd-ico">${ico}</div>
        <div class="pd-desc">${desc}</div>
        <div class="pd-temps">
          <span class="pd-tmax">${tmax}°</span>
          <span class="pd-tmin">${tmin}°</span>
        </div>
        <div class="pd-lluvia">🌧️ ${lluvia}%</div>
      </div>`;
  }).join('');

  document.getElementById('prediccionPanel').style.display = 'block';
}

//  Mapa de observaciones en tiempo real 

let mapaObs       = null;
let obsLayer      = null;
let mapaObsIniciado = false;

/**
 * Devuelve un color de fondo para una etiqueta de temperatura.
 * Escala fría (azul) → cálida (rojo) según rangos habituales en España.
 * @param {number} t - Temperatura en °C.
 * @returns {string} Color CSS.
 */
function getTempColor(t) {
  if (t <= 0)  return '#00d4ff';
  if (t <= 10) return '#4fc3f7';
  if (t <= 15) return '#81c784';
  if (t <= 20) return '#ffee58';
  if (t <= 25) return '#ffa726';
  if (t <= 30) return '#ef5350';
  return '#b71c1c';
}

/**
 * Inicializa (o refresca) el mapa de observaciones meteorológicas en tiempo real.
 * Llama a /api/aemet/observaciones y pinta etiquetas de temperatura sobre el mapa.
 *
 * El mapa se crea solo la primera vez; en llamadas siguientes se elimina la capa
 * anterior y se vuelven a pedir los datos al servidor.
 *
 * El "escudo" de validación evita errores si el backend devuelve error
 * (p. ej. falta la API key de AEMET) — el mapa se queda limpio y se muestra aviso.
 */
async function initMapaObservaciones() {
  // Creamos el mapa solo la primera vez
  if (!mapaObsIniciado) {
    mapaObs = L.map('mapaObservaciones', { zoomControl: true }).setView([40.0, -3.5], 5);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19, attribution: '© CartoDB'
    }).addTo(mapaObs);
    mapaObsIniciado = true;
  }

  // Necesario para que Leaflet recalcule el tamaño tras los cambios de layout
  setTimeout(() => mapaObs?.invalidateSize(), 200);

  // Limpiamos la capa anterior antes de cargar datos nuevos
  if (obsLayer) mapaObs.removeLayer(obsLayer);

  try {
    const r          = await fetch('/api/aemet/observaciones');
    const estaciones = await r.json();

    // ── Validación ("el escudo") ──
    // Si el servidor nos manda un error o algo que no es un array, paramos aquí.
    // Típicamente ocurre cuando falta la API key de AEMET en el .env del servidor.
    if (estaciones.error) throw new Error(estaciones.error);
    if (!Array.isArray(estaciones)) throw new Error('Formato inesperado desde /api/aemet/observaciones');

    obsLayer = L.layerGroup();

    estaciones.forEach(est => {
      // Descartamos estaciones sin coordenadas o sin temperatura registrada
      if (est.lat === undefined || est.lng === undefined || est.ta == null) return;

      const color = getTempColor(est.ta);
      const icon  = L.divIcon({
        className: '',
        html: `<div style="
          background:${color}; color:#000; font-size:0.72rem; font-weight:800;
          font-family:Montserrat,sans-serif; padding:3px 7px; border-radius:5px;
          border:1px solid rgba(0,0,0,0.25); white-space:nowrap;
          box-shadow:0 2px 6px rgba(0,0,0,0.4); text-align:center; min-width:36px;
        ">${est.ta.toFixed(1)}°</div>`,
        iconSize:   [42, 22],
        iconAnchor: [21, 11]
      });

      // Tooltip con todos los datos disponibles de la estación
      let tooltipHtml = `
        <div style="font-family:Montserrat,sans-serif;">
          <b>${est.nombre}</b><br>
          🌡️ Temp. Actual: <b>${est.ta.toFixed(1)}°C</b>`;
      if (est.hr   != null) tooltipHtml += `<br>💧 Humedad: ${est.hr}%`;
      if (est.prec != null) tooltipHtml += `<br>🌧️ Lluvia: ${est.prec} mm`;
      if (est.vv   != null) tooltipHtml += `<br>💨 Viento: ${est.vv} km/h`;
      tooltipHtml += `</div>`;

      L.marker([est.lat, est.lng], { icon })
        .bindTooltip(tooltipHtml, { direction: 'top' })
        .addTo(obsLayer);
    });

    obsLayer.addTo(mapaObs);
    document.getElementById('obsActualizacion').textContent =
      'Actualizado: ' +
      new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) +
      ' (Datos AEMET)';

  } catch (e) {
    // No propagamos el error — el mapa se queda sin datos y avisamos suavemente
    console.warn('[tiempo] Observaciones no disponibles:', e.message);
    document.getElementById('obsActualizacion').textContent =
      '⚠️ Temporalmente sin conexión con AEMET.';
  }
}