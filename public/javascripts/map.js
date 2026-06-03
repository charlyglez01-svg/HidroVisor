// ============================================================
// map.js — Inicialización del mapa principal y lógica del Radar
//
// Depende de: config.js (EMBALSES, RIOS, fillC), Leaflet, y
// las funciones showDetail() / showLoader() / hideLoader() de ui.js
// ============================================================

// Iconos de marcadores 

function getEmbalseIcon(pct) {
  const color = fillC(pct); 
  
  const svg = `
    <svg class="marker-embalse" width="28" height="28" style="color: ${color}; fill: currentColor;">
      <use href="#icon-gota-embalse" />
    </svg>`;

  return L.divIcon({
    className:     'custom-svg-icon',
    html:          svg,
    iconSize:      [28, 28],
    iconAnchor:    [14, 28],
    tooltipAnchor: [0, -28]
  });
}

function getRioIcon() {
  const svg = `
    <svg class="marker-rio" width="28" height="28">
      <use href="#icon-rio" />
    </svg>`;
    
  return L.divIcon({
    className:     'custom-svg-icon',
    html:          svg,
    iconSize:      [28, 28],
    iconAnchor:    [14, 14],
    tooltipAnchor: [0, -14]
  });
}


// Utilidad geoespacial 

/**
 * Aplana recursivamente una estructura de coordenadas GeoJSON (cualquier profundidad).
 * Útil para comparar geometrías de tipo MultiLineString o GeometryCollection
 * con los RIVER_PATHS sin tener que conocer la profundidad de antemano.
 *
 * @param {Array} coords - Array de coordenadas (puede estar anidado).
 * @returns {Array<[number, number]>} - Array plano de pares [lng, lat].
 */
function extractFlatCoords(coords) {
  const result = [];
  function recurse(c) {
    if (!c || c.length === 0) return;
    // Si el primer elemento es un número, es una coordenada [lng, lat]
    if (typeof c[0] === 'number') result.push(c);
    else c.forEach(recurse);
  }
  recurse(coords);
  return result;
}

// Inicialización del mapa principal 

/**
 * Crea e inicializa el mapa Leaflet con todas sus capas, controles
 * y marcadores. Llamada una sola vez desde loadDataFromAPI() en ui.js.
 *
 * Capas base disponibles: CartoDB Dark (default), PNOA Satélite, IGN Topográfico.
 * Capas overlay: Cuencas WMS, Embalses (cluster), Ríos.
 */
function initMap() {
  map = L.map('map', { zoomControl: false }).setView([39.5, -3.0], 6);
  L.control.zoom({ position: 'topright' }).addTo(map);

  // ── Capas base ──
  const capaCartoDark = L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    { maxZoom: 19, attribution: '© CartoDB' }
  ).addTo(map); // la activamos por defecto 

  const capaPNOA = L.tileLayer.wms('https://www.ign.es/wms-inspire/pnoa-ma', {
    layers: 'OI.OrthoimageCoverage', format: 'image/png', transparent: false
  });
  const capaIGNBase = L.tileLayer.wms('https://www.ign.es/wms-inspire/ign-base', {
    layers: 'IGNBaseTodo', format: 'image/png', transparent: false
  });

  // ── Capa overlay: cuencas hidrográficas (WMS oficial IDEE) ──
  const capaCuencas = L.tileLayer.wms('https://servicios.idee.es/wms-inspire/hidrografia', {
    layers: 'HY.PhysicalWaters.Catchments', format: 'image/png', transparent: true, opacity: 0.4
  });

  // Layer groups para embalses y ríos 
  embalsesLayerGroup = L.markerClusterGroup({
    iconCreateFunction: cluster => {
      const count = cluster.getChildCount();
      return L.divIcon({
        html:      `<div class="custom-cluster"><span>${count}</span></div>`,
        className: 'custom-cluster-icon',
        iconSize:  L.point(34, 34)
      });
    },
    maxClusterRadius:    40,
    spiderfyOnMaxZoom:   true,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true
  });
  riosLayerGroup = L.layerGroup();

  // Control de capas (selector top-right)
  L.control.layers(
    { "Modo Noche": capaCartoDark, "Satélite (PNOA)": capaPNOA, "Topográfico": capaIGNBase },
    { "Cuencas Hidrográficas": capaCuencas, "Todos los Embalses": embalsesLayerGroup, "Ríos Principales": riosLayerGroup },
    { position: 'topright' }
  ).addTo(map);

  // Poblamos el layer de embalses 
  // Capturamos `e.id` en el closure para evitar el bug clásico de cierre sobre variable de bucle
  EMBALSES.forEach(e => {
    const id     = e.id;
    const marker = L.marker([e.lat, e.lng], { icon: getEmbalseIcon(e.pct) })
      .bindTooltip(`<b>${e.n}</b><br>Llenado: ${e.pct}%`, { direction: 'top' });
    marker.on('click', ev => { L.DomEvent.stopPropagation(ev); showDetail('embalse', id); });
    marker.addTo(embalsesLayerGroup);
  });

  // Poblamos el layer de ríos 
  RIOS.forEach(r => {
    const id     = r.id;
    const marker = L.marker([r.lat, r.lng], { icon: getRioIcon() })
      .bindTooltip(`<b>Río ${r.n}</b>`, { direction: 'top' });
    marker.on('click', ev => { L.DomEvent.stopPropagation(ev); showDetail('rio', id); });
    marker.addTo(riosLayerGroup);
  });

  // Ambas capas visibles al inicio
  riosLayerGroup.addTo(map);
  embalsesLayerGroup.addTo(map);

  // Pequeño delay para que el contenedor ya tenga tamaño definitivo en el DOM
  setTimeout(() => map.invalidateSize(), 300);
}

// Radar de precipitaciones (RainViewer) 

/**
 * Activa o desactiva la animación del radar de precipitaciones.
 * Los tiles se obtienen de la API pública de RainViewer y se animan
 * en bucle mostrando las últimas horas.
 *
 * Si ya está activo, limpia las capas y detiene la animación.
 * Si está inactivo, descarga los frames (solo la primera vez) y arranca.
 */
async function toggleRadar() {
  const btn           = document.getElementById('btnRadar');
  const timeContainer = document.getElementById('radarTimeContainer');
  const controlDiv    = document.getElementById('radarControl');

  if (isRadarActive) {
    // Apagar radar
    clearInterval(animationTimer);
    radarLayers.forEach(layer => map.removeLayer(layer));
    timeContainer.classList.replace('d-flex', 'd-none');
    controlDiv.classList.remove('active');
    btn.innerHTML = '<span class="fs-6">🌧️</span> <span class="d-none d-sm-inline">Activar Precipitaciones</span><span class="d-inline d-sm-none">Radar</span>';
    btn.classList.replace('btn-info',  'btn-dark');
    btn.classList.replace('text-dark', 'text-info');
    isRadarActive = false;
    return;
  }

  // Encender radar
  showLoader();
  try {
    // Solo descargamos los frames una vez; se reutilizan si el usuario
    // activa/desactiva el radar varias veces en la misma sesión.
    if (radarLayers.length === 0) {
      const res  = await fetch('https://api.rainviewer.com/public/weather-maps.json');
      const data = await res.json();
      data.radar.past.forEach(frame => {
        const layer = L.tileLayer(
          `https://tilecache.rainviewer.com${frame.path}/256/{z}/{x}/{y}/2/1_1.png`,
          { opacity: 0, zIndex: 10 }
        );
        radarLayers.push(layer);
        radarTimestamps.push(frame.time);
      });
    }

    radarLayers.forEach(layer => layer.addTo(map));
    controlDiv.classList.add('active');
    timeContainer.classList.replace('d-none', 'd-flex');
    btn.innerHTML = '<span class="fs-6">⏹️</span> <span class="d-none d-sm-inline">Ocultar Radar</span><span class="d-inline d-sm-none">Ocultar</span>';
    btn.classList.replace('btn-dark', 'btn-info');
    btn.classList.replace('text-info', 'text-dark');
    isRadarActive = true;
    playRadarAnimation();

  } catch (e) {
    console.error('[radar] Error cargando datos de RainViewer:', e);
    showNotif('⚠️ No se pudo cargar el radar de precipitaciones', true);
  } finally {
    hideLoader();
  }
}

/**
 * Arranca el bucle de animación del radar.
 * Cada 600ms hace fade out del frame anterior y fade in del siguiente,
 * mostrando también el timestamp del frame activo.
 */
function playRadarAnimation() {
  animationPosition = 0;
  const timeUi = document.getElementById('radarTime');

  animationTimer = setInterval(() => {
    // Frame anterior: opacidad 0
    const prev = animationPosition === 0 ? radarLayers.length - 1 : animationPosition - 1;
    radarLayers[prev].setOpacity(0);

    // Frame actual: opacidad visible
    radarLayers[animationPosition].setOpacity(0.75);

    // Actualizar reloj del radar
    timeUi.innerText = new Date(radarTimestamps[animationPosition] * 1000)
      .toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

    animationPosition = (animationPosition + 1) % radarLayers.length;
  }, 600);
}