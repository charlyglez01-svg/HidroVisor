/**
 * ============================================================================
 * ui.js — Controlador principal del frontend (SPA)
 * ============================================================================
 * Orquesta la carga de datos, la navegación, el renderizado de vistas
 * y la conexión entre el mapa Leaflet y los paneles de detalle.
 *
 * Orden de carga: config.js → map.js → ui.js → ui-v32.js (addons)
 *
 * Secciones:
 *   1. Variables de estado global
 *   2. Navegación (SPA)
 *   3. Inicialización y carga de datos
 *   4. Renderizado de vistas (Landing, Estadísticas, Ríos, Noticias)
 *   5. Lógica del sidebar y buscador
 *   6. Visualización de detalles (panel inferior + mapa)
 *   7. Mapas temáticos (coropletas y símbolos proporcionales)
 *   8. Utilidades de UI
 * ============================================================================
 */

// 1. VARIABLES DE ESTADO GLOBAL 

let currentSection = 'inicio';
let chartCuencas   = null;

// Variables para los mapas temáticos (sección "Mapas")
let mapaTematico        = null;
let cuencasLayer        = null;
let usosLayer           = null;
let mapaTematicoIniciado = false;

const CUENCAS_GEOJSON_URL = 'https://raw.githubusercontent.com/charlyglez01-svg/embalses-api/main/datos/cuencas_geo.json';


// 2. NAVEGACIÓN (SPA) 

/**
 * Activa una sección de la SPA, desactivando todas las demás.
 * También dispara acciones secundarias que cada sección necesita al abrirse
 * (invalidar tamaño del mapa, cargar datos, etc.).
 *
 * @param {string} name - Nombre de la sección: 'inicio'|'pantanos'|'rios'|
 *                        'estadisticas'|'noticias'|'mapas'
 */
function goToSection(name) {
  // Limpiar estado activo de páginas, pestañas de nav y botones móviles
  document.querySelectorAll('.section-page, .nav-tab, .mbn-btn')
    .forEach(el => el.classList.remove('active'));

  const cap = name.charAt(0).toUpperCase() + name.slice(1);

  document.getElementById('sec' + cap)?.classList.add('active');
  document.getElementById('nav' + cap)?.classList.add('active');
  document.getElementById('mbn' + cap)?.classList.add('active');

  currentSection = name;

  // Acciones específicas por sección
  switch (name) {
    case 'pantanos':
      // Leaflet a veces renderiza mal si el contenedor no tenía tamaño visible aún
      setTimeout(() => {
        map?.invalidateSize();
        map?.setView(map.getCenter(), map.getZoom(), { animate: false });
      }, 100);
      break;

    case 'estadisticas':
      if (EMBALSES?.length) renderEstadisticas();
      break;

    case 'noticias':
      renderNoticias();
      if (typeof tiempoInit === 'function') tiempoInit();
      if (typeof initMapaObservaciones === 'function') setTimeout(initMapaObservaciones, 300);
      break;

    case 'mapas':
      cerrarVisor();
      setTimeout(() => mapaTematico?.invalidateSize(), 150);
      break;

    case 'rios':
      renderRios();
      break;
  }
}


// 3. INICIALIZACIÓN Y CARGA DE DATOS 

/**
 * Punto de entrada de la aplicación. Lanza en paralelo todas las peticiones
 * necesarias para el arranque, inicializa el mapa y pinta la pantalla de inicio.
 *
 * Las cargas secundarias (GeoJSON de ríos, ticker de noticias) no bloquean
 * la inicialización principal.
 */
async function loadDataFromAPI() {
  showLoader();
  try {
    // Peticiones críticas en paralelo
    const [resEmb, resRio, resGeo] = await Promise.all([
      fetch('/api/embalses'),
      fetch('/api/rios'),
      fetch('https://raw.githubusercontent.com/codeforamerica/click_that_hood/master/public/data/spain-communities.geojson')
    ]);

    EMBALSES      = await resEmb.json();
    RIOS          = await resRio.json();
    cachedGeoJSON = await resGeo.json();

    // Carga secundaria: GeoJSON completo de tramos de ríos
    // (no bloquea; si falla, se usan RIVER_PATHS como fallback)
    fetch('/data/A3RIOS.json')
      .then(r => r.json())
      .then(d => { allRiosGeoJSON = d; })
      .catch(console.error);

    // Carga secundaria: noticias para el ticker superior
    fetch('/api/noticias')
      .then(r => r.json())
      .then(noticias => {
        if (noticias.length) {
          document.getElementById('tickerText').innerHTML = noticias
            .map(n => `<span><strong>AEMET:</strong> ${n.titulo}</span>`)
            .join('');
        }
      })
      .catch(console.error);

    if (typeof initMap === 'function') initMap();
    setTab('regions');
    renderLanding();

  } catch (e) {
    console.error('[ui] Error crítico en la carga inicial:', e);
    showNotif('⚠️ Error crítico al conectar con el servidor', true);
  } finally {
    hideLoader();
  }
}


// 4. RENDERIZADO DE VISTAS 

// Helper interno: filtra embalses que tienen datos de porcentaje válidos
function _conPct() {
  return EMBALSES.filter(e => e.pct !== null && e.pct !== undefined);
}

/**
 * Actualiza los KPIs de la pantalla de inicio (número de embalses,
 * cuencas, llenado medio y fecha de actualización).
 */
function renderLanding() {
  if (!EMBALSES?.length) return;

  const conDatos = _conPct();
  const media    = conDatos.reduce((s, e) => s + e.pct, 0) / conDatos.length;
  const cuencas  = new Set(EMBALSES.map(e => e.cuenca)).size;
  const fecha    = EMBALSES.find(e => e.fecha)?.fecha || '—';

  document.getElementById('lstEmbalses').textContent = EMBALSES.length;
  document.getElementById('lstCuencas').textContent  = cuencas;
  document.getElementById('lstMedia').textContent    = media.toFixed(1) + '%';
  document.getElementById('lstFecha').textContent    = fecha;
}

/**
 * Genera las tarjetas de ríos en la sección correspondiente.
 * Idempotente: si ya está renderizado, no vuelve a hacerlo.
 */
function renderRios() {
  if (!RIOS?.length) return;
  const grid = document.getElementById('riosGrid');
  if (grid.innerHTML.trim() !== '') return; // ya pintado

  grid.innerHTML = RIOS.map(r => `
    <div class="col-md-6 col-lg-4">
      <div class="rio-card">
        <div class="rc-header">
          <span class="rc-ico">🌊</span>
          <div>
            <h4 class="rc-name">Río ${r.n}</h4>
            <span class="rc-badge">${r.vertiente}</span>
          </div>
        </div>
        <div class="rc-stats">
          <div class="rc-stat"><span class="rc-sl">Longitud</span><span class="rc-sv">${r.longitud} <small>km</small></span></div>
          <div class="rc-stat"><span class="rc-sl">Caudal medio</span><span class="rc-sv">${r.caudal} <small>m³/s</small></span></div>
          <div class="rc-stat"><span class="rc-sl">Fuente</span><span class="rc-sv">${r.fuente}</span></div>
        </div>
        <div class="rc-region">${r.reg}</div>
      </div>
    </div>`).join('');
}

/**
 * Calcula y renderiza todos los KPIs, gráficos, rankings y distribuciones
 * de la sección de Estadísticas. Destruye los gráficos Chart.js previos
 * antes de crearlos de nuevo para evitar memory leaks.
 */
function renderEstadisticas() {
  if (!EMBALSES?.length) return;

  const conPct = _conPct();
  const media  = conPct.reduce((s, e) => s + e.pct, 0) / conPct.length;
  const totalCap = EMBALSES.reduce((s, e) => s + (e.cap || 0), 0);
  const totalVol = EMBALSES.reduce((s, e) => s + (e.vol || 0), 0);

  const optimos   = conPct.filter(e => e.pct >= 70).length;
  const precaucion = conPct.filter(e => e.pct >= 40 && e.pct < 70).length;
  const criticos  = conPct.filter(e => e.pct < 40).length;

  // KPIs principales 
  document.getElementById('statsKpis').innerHTML = `
    <div class="col-6 col-md-3"><div class="sc">
      <div class="sc-l">Llenado medio nacional</div>
      <div class="sc-v ${pClsSC(media)}">${media.toFixed(1)}<span class="sc-u">%</span></div>
      <div class="sc-desc">Porcentaje medio de llenado sobre el total monitorizado</div>
    </div></div>
    <div class="col-6 col-md-3"><div class="sc">
      <div class="sc-l">Capacidad total</div>
      <div class="sc-v text-white">${(totalCap/1000).toFixed(0)}<span class="sc-u">Mm³</span></div>
      <div class="sc-desc">Volumen máximo acumulado de la red de embalses</div>
    </div></div>
    <div class="col-6 col-md-3"><div class="sc">
      <div class="sc-l">Agua almacenada</div>
      <div class="sc-v text-info">${(totalVol/1000).toFixed(0)}<span class="sc-u">Mm³</span></div>
      <div class="sc-desc">Volumen de agua actualmente embalsada</div>
    </div></div>
    <div class="col-6 col-md-3"><div class="sc">
      <div class="sc-l">En estado crítico</div>
      <div class="sc-v text-danger">${criticos}<span class="sc-u">embalses</span></div>
      <div class="sc-desc">Embalses con nivel inferior al 40% de su capacidad</div>
    </div></div>
  `;

  // Agrupación por cuenca 
  // Calculamos medias y totales aquí una sola vez; se usa en el gráfico,
  // en el bloque de "cuencas destacadas" y en la tabla por CCAA.
  const cuencas = {};
  EMBALSES.forEach(e => {
    if (!e.cuenca) return;
    if (!cuencas[e.cuenca]) cuencas[e.cuenca] = { pcts: [], cap: 0, vol: 0, n: 0 };
    cuencas[e.cuenca].n++;
    cuencas[e.cuenca].cap += e.cap || 0;
    cuencas[e.cuenca].vol += e.vol || 0;
    if (e.pct != null) cuencas[e.cuenca].pcts.push(e.pct);
  });

  // Calculamos la media por cuenca una sola vez (antes se hacía dos veces)
  const cuencaMediaMap = {};
  Object.entries(cuencas).forEach(([nombre, d]) => {
    if (d.pcts.length > 0) {
      cuencaMediaMap[nombre] = +(d.pcts.reduce((a, b) => a + b, 0) / d.pcts.length).toFixed(1);
    }
  });

  const cuencaNames  = Object.keys(cuencaMediaMap).sort();
  const cuencaMedias = cuencaNames.map(c => cuencaMediaMap[c]);

  // ── Gráfico de barras por cuenca ──
  if (chartCuencas) chartCuencas.destroy();
  chartCuencas = new Chart(document.getElementById('chartCuencas'), {
    type: 'bar',
    data: {
      labels: cuencaNames,
      datasets: [{
        label: 'Llenado medio (%)',
        data:  cuencaMedias,
        backgroundColor: cuencaMedias.map(v => v >= 70 ? '#00e67688' : v >= 40 ? '#ffc40088' : '#e040fb88'),
        borderColor:     cuencaMedias.map(v => v >= 70 ? '#00e676'   : v >= 40 ? '#ffc400'   : '#e040fb'),
        borderWidth: 2,
        borderRadius: 6
      }]
    },
   options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { 
          max: 100, 
          grid: { color: 'rgba(255,255,255,0.05)' }, 
          ticks: { 
            callback: v => v + '%',
            color: '#94a3b8',
            font: { size: 12 }
          } 
        },
        y: { 
          grid: { display: false }, 
          ticks: { 
            autoSkip: false, 
            color: '#cbd5e1', 
            font: { 
              size: 14, 
              weight: '500' 
            } 
          } 
        }
      }
    }
  });

  //  Rankings Top 5 / Bottom 5 
  const sorted  = [...conPct].sort((a, b) => b.pct - a.pct);
  const rankHtml = list => list.map((e, i) => `
    <div class="rank-item">
      <span class="rank-pos">${i + 1}</span>
      <div class="rank-info">
        <span class="rank-name">${e.n}</span>
        <span class="rank-sub">${e.cuenca || ''}</span>
      </div>
      <span class="rank-pct" style="color:${fillC(e.pct)}">${e.pct.toFixed(1)}%</span>
    </div>`).join('');

  document.getElementById('rankingTop').innerHTML    = rankHtml(sorted.slice(0, 5));
  document.getElementById('rankingBottom').innerHTML = rankHtml(sorted.slice(-5).reverse());

  // ── Distribución de estados y cuencas en los extremos ──
  const cuencasSorted  = Object.entries(cuencaMediaMap).sort((a, b) => b[1] - a[1]);
  const cuencaMasLlena = cuencasSorted[0]                          || ['—', 0];
  const cuencaMasVacia = cuencasSorted[cuencasSorted.length - 1]   || ['—', 0];

  const pctOptimos   = ((optimos    / conPct.length) * 100).toFixed(1);
  const pctPrecaucion= ((precaucion / conPct.length) * 100).toFixed(1);
  const pctCriticos  = ((criticos   / conPct.length) * 100).toFixed(1);

  document.getElementById('distribucionEstados').innerHTML = `
    <div class="row g-4">
      <div class="col-md-7">
        <p class="text-white-50 small mb-3">
          Clasificación de los ${conPct.length} embalses con datos:
          <b class="text-success">óptimo</b> (>70%),
          <b class="text-warning">precaución</b> (40-70%),
          y <b style="color:#e040fb">crítico</b> (<40%).
        </p>
        <div class="dest-row mb-3">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span class="small fw-bold text-success">● Óptimos</span>
            <span class="small fw-bold text-success">${optimos} embalses · ${pctOptimos}%</span>
          </div>
          <div class="dest-bar-bg"><div class="dest-bar" style="width:${pctOptimos}%;background:#00e676;"></div></div>
        </div>
        <div class="dest-row mb-3">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span class="small fw-bold text-warning">● Precaución</span>
            <span class="small fw-bold text-warning">${precaucion} embalses · ${pctPrecaucion}%</span>
          </div>
          <div class="dest-bar-bg"><div class="dest-bar" style="width:${pctPrecaucion}%;background:#ffc400;"></div></div>
        </div>
        <div class="dest-row mb-1">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span class="small fw-bold" style="color:#e040fb">● Críticos</span>
            <span class="small fw-bold" style="color:#e040fb">${criticos} embalses · ${pctCriticos}%</span>
          </div>
          <div class="dest-bar-bg"><div class="dest-bar" style="width:${pctCriticos}%;background:#e040fb;"></div></div>
        </div>
      </div>
      <div class="col-md-5">
        <p class="text-white-50 small mb-3">Cuencas hidrográficas en los extremos actuales.</p>
        <div class="dest-cuenca mb-3">
          <div class="dest-cuenca-label">🏆 Cuenca más llena</div>
          <div class="dest-cuenca-nombre">${cuencaMasLlena[0]}</div>
          <div class="dest-cuenca-bar-wrap">
            <div class="dest-bar-bg"><div class="dest-bar" style="width:${cuencaMasLlena[1]}%;background:#00e676;"></div></div>
            <span class="dest-cuenca-pct" style="color:#00e676">${cuencaMasLlena[1]}%</span>
          </div>
        </div>
        <div class="dest-cuenca">
          <div class="dest-cuenca-label">⚠️ Cuenca más vacía</div>
          <div class="dest-cuenca-nombre">${cuencaMasVacia[0]}</div>
          <div class="dest-cuenca-bar-wrap">
            <div class="dest-bar-bg"><div class="dest-bar" style="width:${cuencaMasVacia[1]}%;background:#e040fb;"></div></div>
            <span class="dest-cuenca-pct" style="color:#e040fb">${cuencaMasVacia[1]}%</span>
          </div>
        </div>
      </div>
    </div>`;

  // Tabla resumen por CCAA 
  const ccaaData = {};
  EMBALSES.forEach(e => {
    const reg = e.reg || 'Otras';
    if (!ccaaData[reg]) ccaaData[reg] = { n: 0, cap: 0, vol: 0, pcts: [] };
    ccaaData[reg].n++;
    ccaaData[reg].cap += e.cap || 0;
    ccaaData[reg].vol += e.vol || 0;
    if (e.pct != null) ccaaData[reg].pcts.push(e.pct);
  });

  document.getElementById('tablaCCAA').innerHTML = Object.entries(ccaaData)
    .sort((a, b) => b[1].n - a[1].n)
    .map(([ccaa, d]) => {
      const media = d.pcts.length
        ? d.pcts.reduce((a, b) => a + b, 0) / d.pcts.length
        : 0;
      return `<tr>
        <td class="fw-bold">${ccaa}</td>
        <td class="text-end">${d.n}</td>
        <td class="text-end">${d.cap.toLocaleString('es')}</td>
        <td class="text-end">${d.vol.toLocaleString('es')}</td>
        <td>
          <div class="d-flex align-items-center gap-2">
            <div style="flex:1;height:6px;background:rgba(255,255,255,0.1);border-radius:3px;">
              <div style="width:${media}%;height:100%;background:${fillC(media)};border-radius:3px;"></div>
            </div>
            <span style="color:${fillC(media)};font-weight:700;min-width:42px;">${media.toFixed(1)}%</span>
          </div>
        </td>
      </tr>`;
    }).join('');
}

/**
 * Descarga y renderiza las tarjetas de avisos meteorológicos de AEMET.
 * Idempotente: si ya hay tarjetas en el grid, no vuelve a llamar a la API.
 */
async function renderNoticias() {
  const grid = document.getElementById('noticiasGrid');
  if (grid.querySelector('.noticia-card')) return; // ya renderizado

  try {
    const res     = await fetch('/api/noticias');
    const noticias = await res.json();
    if (!noticias.length) throw new Error('Sin noticias');

    grid.innerHTML = noticias.map(n => `
      <div class="col-md-6 col-lg-4">
        <a href="${n.link || '#'}" target="_blank" style="text-decoration:none;">
          <div class="noticia-card">
            <div class="nc-ico">🌤️</div>
            <h5 class="nc-title">${n.titulo}</h5>
            <p class="nc-desc" style="font-size:0.85rem;color:#a1b8d1;">${n.descripcion || ''}</p>
            <div class="nc-footer">
              <span class="nc-badge">AEMET</span>
              <span class="nc-date">${n.fecha || 'Hoy'}</span>
            </div>
          </div>
        </a>
      </div>`).join('');

  } catch {
    grid.innerHTML = '<div class="col-12 text-center text-white-50 py-5"><p>⚠️ No se han podido cargar los avisos meteorológicos</p></div>';
  }
}


// 5. LÓGICA DEL SIDEBAR Y BUSCADOR 

/**
 * Cambia la pestaña activa del sidebar (regiones / embalses / ríos)
 * y actualiza el placeholder del buscador acorde.
 * @param {'regions'|'embalses'|'rios'} t
 */
function setTab(t) {
  activeTab = t;
  document.querySelectorAll('.stab').forEach(el => el.classList.remove('active'));

  const tabIds = { regions: 1, embalses: 2, rios: 3 };
  document.getElementById(`stab${tabIds[t]}`)?.classList.add('active');

  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.value = '';
    const placeholders = {
      regions:  '🔍 Buscar comunidad...',
      embalses: '🔍 Buscar embalse...',
      rios:     '🔍 Buscar río...'
    };
    searchInput.placeholder = placeholders[t] || '🔍 Buscar...';
  }

  buildSidebar('');
}

/**
 * Reacción al input del buscador. Anula el filtro regional activo si
 * el usuario escribe algo (se asume que quiere una búsqueda global).
 * @param {string} v - Valor actual del input.
 */
function onSearch(v) {
  if (v.trim() !== '') currentRegionFilter = null;
  buildSidebar(v.toLowerCase());
}

/**
 * Reconstruye el contenido del sidebar según la pestaña activa y el filtro actual.
 * Se llama en cada cambio de pestaña, cada búsqueda y cada selección de región.
 * @param {string} f - Texto de filtro en minúsculas (cadena vacía = sin filtro).
 */
function buildSidebar(f) {
  const body = document.getElementById('sbBody');
  body.innerHTML = '';

  if (activeTab === 'regions') {
    Object.keys(REGIONS).forEach(reg => {
      if (f && !reg.toLowerCase().includes(f)) return;
      const hdr = document.createElement('div');
      hdr.className = 'rhdr text-white';
      hdr.innerHTML = `📍 ${reg}`;
      hdr.onclick   = () => highlightRegion(reg);
      body.appendChild(hdr);
    });

  } else if (activeTab === 'embalses') {
    // Badge de filtro activo con botón para limpiarlo
    if (currentRegionFilter && !f) {
      const pill = document.createElement('div');
      pill.className = 'p-3 bg-black bg-opacity-25 border-bottom border-secondary border-opacity-25 d-flex justify-content-between align-items-center';
      pill.innerHTML = `
        <span class="text-info small fw-bold">📍 Solo en ${currentRegionFilter}</span>
        <button class="btn btn-sm btn-outline-danger py-0 px-2" style="font-size:0.75rem" onclick="clearRegionFilter()">✕</button>`;
      body.appendChild(pill);
    }

    EMBALSES.forEach(e => {
      if (currentRegionFilter && e.reg !== currentRegionFilter) return;
      if (f && !e.n.toLowerCase().includes(f)) return;

      const pctText = e.pct != null ? e.pct.toFixed(1) + '%' : '—';
      const item    = document.createElement('div');
      item.className = 'ei text-white';
      item.innerHTML = `
        <div class="d-flex align-items-center gap-2">
          <div class="edot" style="background:${fillC(e.pct)}"></div>
          <span>${e.n}</span>
          <span class="ms-auto fw-bold" style="color:${fillC(e.pct)}">${pctText}</span>
        </div>
        <div class="em mt-1 text-white-50 small">${e.reg} · ${e.cuenca}</div>`;
      item.onclick = () => showDetail('embalse', e.id);
      body.appendChild(item);
    });

  } else {
    RIOS.forEach(r => {
      if (f && !r.n.toLowerCase().includes(f)) return;
      const item = document.createElement('div');
      item.className = 'ei text-white';
      item.innerHTML = `
        <div class="d-flex align-items-center gap-2">
          <span style="color:#00d4ff">🌊 Río ${r.n}</span>
        </div>
        <div class="em mt-1 text-white-50 small">${r.longitud} km</div>`;
      item.onclick = () => showDetail('rio', r.id);
      body.appendChild(item);
    });
  }
}

/** Quita el filtro regional activo y reconstruye el sidebar. */
function clearRegionFilter() {
  currentRegionFilter = null;
  buildSidebar('');
}


// 6. VISUALIZACIÓN DE DETALLES (PANEL Y MAPA PRINCIPAL)

/**
 * Centra el mapa en la región indicada, dibuja su polígono
 * y filtra el sidebar para mostrar solo sus embalses.
 * @param {string} reg - Nombre de la región (clave en REGIONS).
 */
function highlightRegion(reg) {
  const data = REGIONS[reg];
  if (!data) return;

  currentRegionFilter = reg;
  map.flyTo([data.lat, data.lng], data.zoom, { animate: true, duration: 1.5, easeLinearity: 0.25 });

  if (borderLayer) map.removeLayer(borderLayer);

  const dashboard = document.getElementById('dashboard');
  if (dashboard.classList.contains('d-block')) closeDashboard();

  // Dibujamos el polígono de la CCAA si tenemos el GeoJSON cargado
  if (cachedGeoJSON) {
    const feature = cachedGeoJSON.features.find(f =>
      f.properties && data.aliases.some(a => cleanText(f.properties.name).includes(cleanText(a)))
    );
    if (feature) {
      borderLayer = L.geoJSON(feature, {
        style: { color: '#00d4ff', weight: 3, opacity: 1, fillColor: '#00d4ff', fillOpacity: 0.15 }
      }).addTo(map);
      setTimeout(() => map.fitBounds(borderLayer.getBounds(), { padding: [20, 20] }), 500);
    }
  }

  setTimeout(() => {
    setTab('embalses');
    showNotif(`Mostrando embalses de <b>${reg}</b>`);
  }, 1200);
}

/**
 * Abre el panel de detalle inferior con la información del embalse o río seleccionado.
 * Genera los gráficos y centra el mapa en el elemento.
 *
 * Para ríos: intenta dibujar el tramo real desde allRiosGeoJSON usando un algoritmo
 * de matching por proximidad. Si no lo encuentra, usa el RIVER_PATHS estático.
 *
 * @param {'embalse'|'rio'} type
 * @param {number} id - ID del elemento.
 */
async function showDetail(type, id) {
  if (currentSection !== 'pantanos') goToSection('pantanos');

  document.getElementById('newsTicker').classList.replace('d-flex', 'd-none');
  document.getElementById('dashboard').classList.replace('d-none', 'd-block');

  if (riverLayer)  map.removeLayer(riverLayer);
  if (borderLayer) map.removeLayer(borderLayer);

  if (type === 'embalse') {
    const e      = EMBALSES.find(x => x.id === id);
    const pctVal = e.pct != null ? e.pct.toFixed(1) : '—';

    document.getElementById('dIcon').innerHTML  = getEmbalseIcon(e.pct).options.html;
    document.getElementById('dName').textContent = `Embalse de ${e.n}`;
    document.getElementById('dSub').textContent  = `${e.reg} · Cuenca: ${e.cuenca}`;
    document.getElementById('dSource').textContent = `Fuente: ${e.fuente}`;

    document.getElementById('statsRow').innerHTML = `
      <div class="col-6 col-md-3"><div class="sc"><div class="sc-l">Capacidad</div><div class="sc-v text-white">${e.cap ?? '—'}<span class="sc-u">hm³</span></div></div></div>
      <div class="col-6 col-md-3"><div class="sc"><div class="sc-l">Agua actual</div><div class="sc-v text-info">${e.vol ?? '—'}<span class="sc-u">hm³</span></div></div></div>
      <div class="col-6 col-md-3"><div class="sc"><div class="sc-l">Llenado</div><div class="sc-v ${pClsSC(e.pct)}">${pctVal}<span class="sc-u">%</span></div></div></div>
      <div class="col-6 col-md-3"><div class="sc"><div class="sc-l">Uso eléctrico</div><div class="sc-v text-white">${e.electrico ? '⚡ Sí' : 'No'}</div></div></div>`;

    document.getElementById('chartDonutContainer').style.display = 'none';
    document.getElementById('chart1Title').textContent = 'Evolución Anual (estimada)';
    renderCharts(e, type);

    map.flyTo([e.lat, e.lng], 12, { animate: true, duration: 1.5, easeLinearity: 0.25 });

  } else {
    showLoader();
    const r = RIOS.find(x => x.id === id);

    document.getElementById('dIcon').innerHTML   = getRioIcon().options.html;
    document.getElementById('dName').textContent  = `Río ${r.n}`;
    document.getElementById('dSub').textContent   = `Vertiente: ${r.vertiente}`;
    document.getElementById('dSource').textContent = `Fuente: ${r.fuente}`;
    document.getElementById('statsRow').innerHTML  = `
      <div class="col-6"><div class="sc"><div class="sc-l">Longitud</div><div class="sc-v text-white">${r.longitud}<span class="sc-u">km</span></div></div></div>
      <div class="col-6"><div class="sc"><div class="sc-l">Caudal medio</div><div class="sc-v text-info">${r.caudal}<span class="sc-u">m³/s</span></div></div></div>`;

    document.getElementById('chartDonutContainer').style.display = 'none';
    document.getElementById('chart1Title').textContent = 'Caudal Histórico (m³/s)';
    renderCharts(r, type);

    await new Promise(resolve => setTimeout(resolve, 50));

    // Matching del tramo de río en el GeoJSON completo 
    // Algoritmo: para cada geometría del GeoJSON, muestreamos sus vértices
    // y calculamos la distancia mínima al cuadrado a cada RIVER_PATH.
    // Si la distancia mínima al path del río actual está dentro del umbral,
    // incluimos la geometría en el dibujo.
    if (allRiosGeoJSON?.geometries) {
      const filteredGeoms = [];
      for (const geom of allRiosGeoJSON.geometries) {
        const flat  = extractFlatCoords(geom.coordinates);
        const step  = Math.max(1, Math.floor(flat.length / 50)); // muestreo para rendimiento
        let globalMinSq    = Infinity;
        let closestRiverId = null;

        for (const rId in RIVER_PATHS) {
          const path     = RIVER_PATHS[rId].coordinates;
          let localMinSq = Infinity;
          for (let i = 0; i < flat.length; i += step) {
            const sc = flat[i];
            for (let j = 0; j < path.length; j++) {
              const pc  = path[j];
              const dSq = (sc[0] - pc[0]) ** 2 + (sc[1] - pc[1]) ** 2;
              if (dSq < localMinSq) localMinSq = dSq;
            }
          }
          if (localMinSq < globalMinSq) { globalMinSq = localMinSq; closestRiverId = Number(rId); }
        }
        if (closestRiverId === id && globalMinSq < 0.25) filteredGeoms.push(geom);
      }

      riverLayer = filteredGeoms.length > 0
        ? L.geoJSON(
            { type: "FeatureCollection", features: filteredGeoms.map(g => ({ type: "Feature", geometry: g })) },
            { style: { color: '#00d4ff', weight: 4, opacity: 0.9 } }
          ).addTo(map)
        : L.geoJSON(RIVER_PATHS[id], { style: { color: '#00d4ff', weight: 4, opacity: 0.9 } }).addTo(map);
    } else {
      // Fallback: GeoJSON complejo no disponible, usamos las líneas estáticas
      riverLayer = L.geoJSON(RIVER_PATHS[id], { style: { color: '#00d4ff', weight: 4, opacity: 0.9 } }).addTo(map);
    }

    if (riverLayer) map.flyToBounds(riverLayer.getBounds(), { padding: [50, 50], animate: true });
    else            map.flyTo([r.lat, r.lng], 7, { animate: true });

    hideLoader();
  }

  setTimeout(() => map.invalidateSize(), 200);
}

/** Cierra el panel de detalle y restaura el ticker. */
function closeDashboard() {
  document.getElementById('dashboard').classList.replace('d-block', 'd-none');
  document.getElementById('newsTicker').classList.replace('d-none', 'd-flex');

  if (riverLayer)  map.removeLayer(riverLayer);
  if (borderLayer) map.removeLayer(borderLayer);

  setTimeout(() => {
    map.invalidateSize();
    map.setView(map.getCenter(), map.getZoom(), { animate: false });
  }, 200);
}

/**
 * Renderiza los gráficos del panel de detalle.
 *
 * AVISO: los datos son SIMULADOS mediante funciones sinusoidales para emular
 * el ciclo hídrico anual. No son datos reales históricos. Si en el futuro el
 * backend expone series temporales, hay que sustituir la generación por fetch.
 *
 * @param {Object} dataObj - Objeto embalse o río.
 * @param {'embalse'|'rio'} type
 */
function renderCharts(dataObj, type) {
  if (lChart) lChart.destroy();
  if (dChart) dChart.destroy();

  const months = ['Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic','Ene','Feb'];

  if (type === 'embalse') {
    const base = dataObj.pct || 50;
    // Senoidal + ruido pequeño para emular variación estacional
    const data = months.map((_, i) =>
      +Math.max(5, Math.min(100, base + Math.sin((i + 2) * Math.PI / 6) * 14 + (Math.random() - .5) * 8)).toFixed(1)
    );
    lChart = new Chart(document.getElementById('chartLine'), {
      type: 'line',
      data: {
        labels: months,
        datasets: [{ label: 'Nivel', data, borderColor: fillC(dataObj.pct),
          backgroundColor: fillC(dataObj.pct) + '33', fill: true, tension: 0.4, pointRadius: 0 }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });

  } else {
    const base = dataObj.caudal;
    const data = months.map((_, i) =>
      +Math.max(10, base + Math.cos((i + 2) * Math.PI / 6) * (base * 0.5) + (Math.random() - .5) * 20).toFixed(0)
    );
    lChart = new Chart(document.getElementById('chartLine'), {
      type: 'bar',
      data: {
        labels: months,
        datasets: [{ label: 'Caudal', data, backgroundColor: '#00d4ff' }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
  }
}


// 7. MAPAS TEMÁTICOS (COROPLETAS Y SÍMBOLOS PROPORCIONALES)

/**
 * Inicializa el mapa temático si no existe todavía.
 * renderMapaCuencas() y renderMapaUsos().
 */
function _initMapaTematico() {
  if (mapaTematicoIniciado) return;
  mapaTematico = L.map('mapaTematico', { zoomControl: true }).setView([40.0, -3.5], 5);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19, attribution: '© CartoDB'
  }).addTo(mapaTematico);
  mapaTematicoIniciado = true;
}

/**
 * Muestra el visor cartográfico del tipo especificado, ocultando el catálogo.
 * Configura la leyenda interactiva y lanza el render del mapa correspondiente.
 * @param {'cuencas'|'usos'} tipo
 */
function abrirVisor(tipo) {
  document.getElementById('catalogoVisores').classList.add('d-none');
  document.getElementById('visorActivo').classList.remove('d-none');

  const mtLegend = document.getElementById('mtLegend');
  const panel    = document.getElementById('mtInfoPanel');
  panel.innerHTML = '<p class="text-white-50 text-center small">Haz clic en un elemento del mapa para ver sus detalles</p>';

  if (tipo === 'cuencas') {
    document.getElementById('tituloVisorActivo').innerHTML = '💧 Llenado por Cuenca Hidrográfica';
    
    // Convertimos la leyenda estática en Filtros Interactivos (Switches de Bootstrap)
    mtLegend.innerHTML = `
      <div class="d-flex align-items-center flex-wrap gap-3 w-100 p-2 rounded" style="background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.05);">
        <div class="fw-bold text-info me-2"><span class="fs-6">⚙️</span> Filtrar Cuencas:</div>
        
        <div class="form-check form-switch m-0 d-flex align-items-center gap-2">
          <input class="form-check-input shadow-none m-0 border-secondary" type="checkbox" id="chkC_optimo" checked onchange="renderMapaCuencas()">
          <label class="form-check-label text-white-50" for="chkC_optimo" style="cursor:pointer;"><span style="display:inline-block;width:10px;height:10px;background:#00e676;border-radius:50%;margin-right:4px;"></span> Óptimo</label>
        </div>
        
        <div class="form-check form-switch m-0 d-flex align-items-center gap-2">
          <input class="form-check-input shadow-none m-0 border-secondary" type="checkbox" id="chkC_precaucion" checked onchange="renderMapaCuencas()">
          <label class="form-check-label text-white-50" for="chkC_precaucion" style="cursor:pointer;"><span style="display:inline-block;width:10px;height:10px;background:#ffc400;border-radius:50%;margin-right:4px;"></span> Precaución</label>
        </div>
        
        <div class="form-check form-switch m-0 d-flex align-items-center gap-2">
          <input class="form-check-input shadow-none m-0 border-secondary" type="checkbox" id="chkC_critico" checked onchange="renderMapaCuencas()">
          <label class="form-check-label text-white-50" for="chkC_critico" style="cursor:pointer;"><span style="display:inline-block;width:10px;height:10px;background:#e040fb;border-radius:50%;margin-right:4px;"></span> Crítico</label>
        </div>
      </div>`;
      
    renderMapaCuencas();

  } else if (tipo === 'usos') {
    document.getElementById('tituloVisorActivo').innerHTML = '⚡ Mapa de Vocación: Energía vs. Consumo';
    
    // Inyectamos los switches de filtro y el slider de reserva en la leyenda
    mtLegend.innerHTML = `
      <div class="d-flex align-items-center flex-wrap gap-4 w-100 p-3 rounded" style="background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.05);">
        
        <div class="d-flex align-items-center flex-wrap gap-3">
          <div class="fw-bold text-info me-2"><span class="fs-6">⚙️</span> Filtrar Usos:</div>
          
          <div class="form-check form-switch m-0 d-flex align-items-center gap-2">
            <input class="form-check-input shadow-none m-0 border-secondary" type="checkbox" id="chkU_hidro" checked onchange="renderMapaUsos()">
            <label class="form-check-label text-white-50" for="chkU_hidro" style="cursor:pointer;"><span style="display:inline-block;width:12px;height:12px;background:#facc15;border-radius:50%;margin-right:4px;"></span> Hidroeléctrico</label>
          </div>
          
          <div class="form-check form-switch m-0 d-flex align-items-center gap-2">
            <input class="form-check-input shadow-none m-0 border-secondary" type="checkbox" id="chkU_consumo" checked onchange="renderMapaUsos()">
            <label class="form-check-label text-white-50" for="chkU_consumo" style="cursor:pointer;"><span style="display:inline-block;width:12px;height:12px;background:#38bdf8;border-radius:50%;margin-right:4px;"></span> Consumo / Riego</label>
          </div>
        </div>

        <div class="d-none d-lg-block" style="width: 1px; height: 24px; background: rgba(255,255,255,0.1);"></div>

        <div class="d-flex align-items-center gap-3 flex-grow-1" style="min-width: 250px;">
          <label class="text-white-50 small text-nowrap m-0 fw-bold" for="rangeU_reserva">Reserva mínima > </label>
          <input type="range" class="form-range flex-grow-1" id="rangeU_reserva" min="0" max="100" value="0" oninput="document.getElementById('valU_reserva').innerText = this.value + '%'; renderMapaUsos()">
          <span id="valU_reserva" class="text-info fw-bold" style="min-width: 45px; font-family: var(--font-data);">0%</span>
        </div>

      </div>`;
      
    renderMapaUsos();
  }

  setTimeout(() => mapaTematico?.invalidateSize(), 200);
}

/** Oculta el visor activo y muestra el catálogo de visores. */
function cerrarVisor() {
  document.getElementById('visorActivo').classList.add('d-none');
  document.getElementById('catalogoVisores').classList.remove('d-none');
}

/**
 * Carga el GeoJSON de cuencas hidrográficas y pinta un mapa coroplético
 * leyendo los filtros interactivos marcados por el usuario.
 */
async function renderMapaCuencas() {
  _initMapaTematico();

  if (cuencasLayer) mapaTematico.removeLayer(cuencasLayer);
  if (usosLayer)    mapaTematico.removeLayer(usosLayer);

  showLoader();
  try {
    // 1. Agregación de datos por cuenca
    const estadoCuencas = {};
    EMBALSES.forEach(e => {
      if (!e.cuenca) return;
      if (!estadoCuencas[e.cuenca]) estadoCuencas[e.cuenca] = { sum: 0, n: 0, cap: 0, vol: 0, embalses: [] };
      if (e.pct != null) { estadoCuencas[e.cuenca].sum += e.pct; estadoCuencas[e.cuenca].n++; }
      estadoCuencas[e.cuenca].cap += e.cap || 0;
      estadoCuencas[e.cuenca].vol += e.vol || 0;
      estadoCuencas[e.cuenca].embalses.push(e.n);
    });

    // 2. Leer el estado de los interruptores HTML
    const showOptimo = document.getElementById('chkC_optimo')?.checked ?? true;
    const showPrecaucion = document.getElementById('chkC_precaucion')?.checked ?? true;
    const showCritico = document.getElementById('chkC_critico')?.checked ?? true;

    const geojson = await fetch(CUENCAS_GEOJSON_URL).then(r => r.json());

    // 3. Pintar en el mapa aplicando el filtro nativo
    cuencasLayer = L.geoJSON(geojson, {
      
      // LA MAGIA OCURRE AQUÍ: Leaflet decide si dibuja la cuenca o no
      filter: (feature) => {
        const nombre = feature.properties.cuenca;
        const datos  = estadoCuencas[nombre];
        const pct    = datos?.n > 0 ? datos.sum / datos.n : null;

        if (pct === null) return true; // Mostramos siempre las que no tienen datos
        if (pct >= 70 && showOptimo) return true;
        if (pct >= 40 && pct < 70 && showPrecaucion) return true;
        if (pct < 40 && showCritico) return true;
        
        return false; // Si no cumple las marcadas, no se dibuja
      },

      style: feature => {
        const nombre = feature.properties.cuenca;
        const datos  = estadoCuencas[nombre];
        const pct    = datos?.n > 0 ? datos.sum / datos.n : null;
        return {
          fillColor:   pct === null ? '#333' : pct >= 70 ? '#00e676' : pct >= 40 ? '#ffc400' : '#e040fb',
          fillOpacity: 0.65,
          color:       '#1a2638',
          weight:      2,
          opacity:     1
        };
      },
      onEachFeature: (feature, layer) => {
        const nombre = feature.properties.cuenca;
        const datos  = estadoCuencas[nombre];
        const pct    = datos?.n > 0 ? (datos.sum / datos.n).toFixed(1) : null;

        layer.bindTooltip(`
          <b>${nombre}</b><br>
          ${pct ? `Llenado: <b style="color:${fillC(parseFloat(pct))}">${pct}%</b>` : 'Sin datos'}
        `, { sticky: true });

        layer.on({
          mouseover: e => e.target.setStyle({ weight: 3, fillOpacity: 0.85 }),
          mouseout:  e => cuencasLayer.resetStyle(e.target),
          click:     () => mostrarInfoCuenca(nombre, datos, pct)
        });
      }
    }).addTo(mapaTematico);

    // Zoom dinámico: Si queda alguna cuenca pintada, enfoca la cámara en ellas
    if (cuencasLayer.getLayers().length > 0) {
      mapaTematico.fitBounds(cuencasLayer.getBounds(), { padding: [20, 20] });
    }

  } catch (err) {
    console.error('[ui] Error cargando capa de cuencas:', err);
    showNotif('⚠️ Error cargando el mapa de cuencas', true);
  } finally {
    hideLoader();
  }
}
/**
 * Actualiza el panel lateral del visor de cuencas con la info de la cuenca clicada.
 * @param {string} nombre - Nombre de la cuenca.
 * @param {Object} datos  - Objeto con sum/n/cap/vol/embalses.
 * @param {string|null} pct - Media de llenado ya formateada, o null si no hay datos.
 */
/**
 * Actualiza el panel de detalles del visor de cuencas con una tarjeta de diseño modular.
 */
function mostrarInfoCuenca(nombre, datos, pct) {
  if (!datos) return;
  const panel = document.getElementById('mtInfoPanel');
  const color = pct ? fillC(parseFloat(pct)) : '#888';

  panel.innerHTML = `
    <div class="mt-info-card">
      <div class="mt-info-header">
        <h4 class="mt-info-name">💧 Cuenca del ${nombre}</h4>
        <span class="mt-info-pct" style="color:${color}">${pct ? pct + '%' : '—'}</span>
      </div>
      
      <div class="mt-info-stats">
        <div class="mt-stat"><span class="mt-sl">Instalaciones</span><span class="mt-sv">${datos.embalses.length}</span></div>
        <div class="mt-stat"><span class="mt-sl">Capacidad total</span><span class="mt-sv">${datos.cap.toLocaleString('es')} hm³</span></div>
        <div class="mt-stat"><span class="mt-sl">Agua almacenada</span><span class="mt-sv">${datos.vol.toLocaleString('es')} hm³</span></div>
        <div class="mt-stat"><span class="mt-sl">Llenado promedio</span><span class="mt-sv" style="color:${color}">${pct ? pct + '%' : '—'}</span></div>
      </div>
      
      <div class="mt-info-list">
        <span class="mt-sl">Instalaciones principales monitorizadas:</span>
        <div class="mt-embalses-list">
          ${datos.embalses.slice(0, 8).map(n => `<span class="mt-emb-tag">${n}</span>`).join('')}
          ${datos.embalses.length > 8 ? `<span class="mt-emb-tag text-white-50">+${datos.embalses.length - 8} más</span>` : ''}
        </div>
      </div>
    </div>`;
}

/**
 * Pinta un mapa de símbolos proporcionales donde cada embalse es un círculo
 * cuyo radio representa su capacidad (raíz cuadrada normalizada) y cuyo color
 * indica su vocación principal (hidroeléctrico vs consumo/riego).
 */
/**
 * Pinta un mapa de símbolos proporcionales donde cada embalse es un círculo.
 * Lee los filtros de uso (Hidroeléctrico/Consumo) y el slider de reserva mínima.
 */
function renderMapaUsos() {
  _initMapaTematico();

  if (cuencasLayer) mapaTematico.removeLayer(cuencasLayer);
  if (usosLayer)    mapaTematico.removeLayer(usosLayer);

  showLoader();
  try {
    usosLayer = L.layerGroup();

    // 1. Capturar los valores seleccionados en el panel de control
    const showHidro = document.getElementById('chkU_hidro')?.checked ?? true;
    const showConsumo = document.getElementById('chkU_consumo')?.checked ?? true;
    const minReserva = parseInt(document.getElementById('rangeU_reserva')?.value || "0", 10);

    const maxCap = Math.max(...EMBALSES.map(e => e.cap || 0));
    const embalsesOrdenados = [...EMBALSES].sort((a, b) => (b.cap || 0) - (a.cap || 0));

    embalsesOrdenados.forEach(e => {
      if (!e.lat || !e.lng || !e.cap) return;

      const isElectric = e.electrico === true;
      const pct = e.pct; // Porcentaje de llenado actual

      // 2. Aplicar Filtros de Uso
      if (isElectric && !showHidro) return;
      if (!isElectric && !showConsumo) return;

      // 3. Aplicar Filtro del Slider (Reserva actual)
      if (pct !== null && pct < minReserva) return;
      if (minReserva > 0 && pct === null) return; // Si exige un % mínimo, ocultamos los que no tienen datos

      // 4. Calcular estilos de los que pasaron el filtro
      const radius     = Math.max(4, Math.sqrt(e.cap / maxCap) * 35);
      const colorFill  = isElectric ? '#facc15' : '#38bdf8';
      const colorStroke= isElectric ? '#ca8a04' : '#0284c7';
      const tipoUso    = isElectric ? '⚡ Hidroeléctrico' : '💧 Consumo / Riego';
      const formatCap  = e.cap.toLocaleString('es');

      const circle = L.circleMarker([e.lat, e.lng], {
        radius, fillColor: colorFill, color: colorStroke,
        weight: 1.5, opacity: 1, fillOpacity: 0.65
      });

      // Añadimos el % de reserva al bocadillo al pasar el ratón
      circle.bindTooltip(`
        <div style="font-family:var(--font-body); text-align:center;">
          <b style="font-size:1.05rem;">${e.n}</b><br>
          <span style="font-size:0.85rem; color:#888;">${e.cuenca}</span><br>
          <div style="margin-top:5px;margin-bottom:5px;padding:2px 5px;background:rgba(0,0,0,0.15);border-radius:4px;font-size:0.85rem;">${tipoUso}</div>
          <div>Reserva: <b style="color:${colorFill}">${pct !== null ? pct.toFixed(1) + '%' : 'S/D'}</b></div>
        </div>`, { direction: 'top' });

      // Modificamos el click para que la tarjeta de abajo también enseñe el porcentaje real
      circle.on('click', () => {
        document.getElementById('mtInfoPanel').innerHTML = `
          <div class="mt-info-card" style="border-left: 4px solid ${colorFill}">
            <div class="mt-info-header">
              <h4 class="mt-info-name">📍 ${e.n}</h4>
              <span class="mt-info-pct" style="color:${colorFill}">${isElectric ? '⚡' : '💧'}</span>
            </div>
            
            <div class="mt-info-stats">
              <div class="mt-stat"><span class="mt-sl">Cuenca Hidrográfica</span><span class="mt-sv">${e.cuenca}</span></div>
              <div class="mt-stat"><span class="mt-sl">Capacidad Total</span><span class="mt-sv">${formatCap} hm³</span></div>
              <div class="mt-stat">
                <span class="mt-sl">Reservas Actuales</span>
                <span class="mt-sv">${(e.vol || 0).toLocaleString('es')} hm³ <span style="font-size:0.85rem; color:${colorFill}">(${pct !== null ? pct.toFixed(1) + '%' : '—'})</span></span>
              </div>
              <div class="mt-stat"><span class="mt-sl">Vocación de Uso</span><span class="mt-sv" style="color:${colorFill}">${tipoUso}</span></div>
            </div>
          </div>`;
      });

      circle.addTo(usosLayer);
    });

    usosLayer.addTo(mapaTematico);

    // Evitamos re-centrar el mapa constantemente mientras se arrastra el slider
    // Solo lo centramos si es la carga inicial (cuando la reserva mínima está a 0)
    if (minReserva === 0 && showHidro && showConsumo) {
      mapaTematico.setView([40.0, -3.5], 6, { animate: true });
    }

  } catch (err) {
    console.error('[ui] Error renderizando mapa de usos:', err);
    showNotif('⚠️ Error renderizando mapa de usos', true);
  } finally {
    hideLoader();
  }
}


// 8. UTILIDADES DE UI 

let notifT;

/**
 * Muestra un banner flotante temporal en la UI.
 * Si se llama varias veces seguidas, el timer se reinicia (última notif gana).
 * @param {string}  msg     - Texto (acepta HTML) a mostrar.
 * @param {boolean} isError - Si true, aplica estilos de alerta (rojo). Default: false.
 */
function showNotif(msg, isError = false) {
  clearTimeout(notifT);
  const n = document.getElementById('notif');
  n.classList.toggle('error', isError);
  n.innerHTML = msg;
  n.classList.remove('hide');
  notifT = setTimeout(() => n.classList.add('hide'), isError ? 5000 : 3000);
}

/** Abre/cierra el menú de perfil. */
function toggleMenu() {
  document.getElementById('profileDropdown').classList.toggle('show');
}

/** Abre/cierra el sidebar lateral en móvil y el overlay oscuro. */
function toggleSidebar() {
  document.getElementById('appSidebar').classList.toggle('open');
  document.getElementById('mobileOverlay').classList.toggle('open');
  // Leaflet necesita recalcular tamaño tras el slide del sidebar
  setTimeout(() => map?.invalidateSize(), 300);
}

/** Abre/cierra el panel de filtros. */
function toggleFilterPanel() {
  document.getElementById('filterPanel').classList.toggle('open');
}

// Arrancamos cuando el navegador haya terminado de cargar todos los recursos
window.addEventListener('load', loadDataFromAPI);