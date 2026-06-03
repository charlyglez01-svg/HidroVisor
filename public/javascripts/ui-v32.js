// ============================================================
// ui-v32.js 
//
// Módulo aditivo. Debe cargarse SIEMPRE después de ui.js.
//
// Patrón: envuelve las funciones globales de ui.js con versiones
// mejoradas, preservando el comportamiento original como fallback.
//
// Por qué typeof en vez de window.X: EMBALSES, RIOS y cachedGeoJSON
// están declaradas con 'let' en config.js, lo que las hace inaccesibles
// via window.* en modo no-módulo (scripts clásicos de navegador).
// ============================================================

(function () {
  'use strict';

  // Helpers de acceso a variables globales con let 
  // No accesibles via window en scripts clásicos de navegador.
  function hasEmbalses() { return typeof EMBALSES !== 'undefined' && EMBALSES?.length > 0; }
  function hasRios()     { return typeof RIOS      !== 'undefined' && RIOS?.length > 0; }
  function hasGeoJSON()  { return typeof cachedGeoJSON !== 'undefined' && !!cachedGeoJSON; }


  // 1. NAVEGACIÓN CON URL HASH 
  // Mejoras sobre goToSection() original:
  //   - Sincroniza la URL con location.hash
  //   - Actualiza document.title según la sección
  //   - Añade la clase header-solid en secciones que no son inicio
  //   - Maneja 'mapas' que el original no tenía (se añadió en v3)

  const VALID_SECTIONS = ['inicio', 'pantanos', 'rios', 'estadisticas', 'noticias', 'mapas'];
  const _origGoTo = window.goToSection;

  const SECTION_TITLES = {
    inicio:       'HidroVisor — Monitorización Hídrica',
    pantanos:     'Embalses · HidroVisor',
    rios:         'Ríos · HidroVisor',
    estadisticas: 'Estadísticas · HidroVisor',
    noticias:     'Alertas AEMET · HidroVisor',
    mapas:        'Mapas Temáticos · HidroVisor'
  };

  window.goToSection = function (name, opts = {}) {
    if (!VALID_SECTIONS.includes(name)) name = 'inicio';

    if (name === 'mapas') {
      // La sección 'mapas' se añadió en v3 y el goToSection original no la conoce,
      // así que la manejamos manualmente aquí.
      document.querySelectorAll('.section-page').forEach(s => s.classList.remove('active'));
      document.getElementById('secMapas')?.classList.add('active');
      document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
      document.getElementById('navMapas')?.classList.add('active');
      document.querySelectorAll('.mbn-btn').forEach(b => b.classList.remove('active'));
      document.getElementById('mbnMapas')?.classList.add('active');
      window.currentSection = 'mapas';
      renderMapasTematicos();
    } else {
      if (typeof _origGoTo === 'function') _origGoTo(name);
    }

    // Header con fondo sólido en todas las secciones excepto el inicio (tiene hero)
    document.getElementById('appHeader')?.classList.toggle('header-solid', name !== 'inicio');

    // Sincronizar URL hash
    if (!opts.fromHash && location.hash !== '#' + name) {
      history.pushState({ section: name }, '', '#' + name);
    }

    // Scroll al inicio de la sección (excepto las que tienen mapa de pantalla completa)
    if (name !== 'pantanos' && name !== 'mapas') {
      const cap = name.charAt(0).toUpperCase() + name.slice(1);
      document.getElementById('sec' + cap)?.scrollTo(0, 0);
    }

    document.title = SECTION_TITLES[name] || 'HidroVisor';
  };

  // Navegación con botón atrás/adelante del navegador
  window.addEventListener('popstate', () => {
    const name = (location.hash || '#inicio').replace('#', '');
    window.goToSection(name, { fromHash: true });
  });

  // Si la página se carga con un hash en la URL, navegamos a esa sección
  function initHash() {
    const hash = location.hash.replace('#', '');
    if (hash && VALID_SECTIONS.includes(hash) && hash !== 'inicio') {
      setTimeout(() => window.goToSection(hash, { fromHash: true }), 200);
    }
  }
  // El DOMContentLoaded puede haberse disparado ya si el script carga tarde
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initHash);
  else initHash();


  // 2. DASHBOARD REDISEÑADO 
  // Envuelve showDetail() para reemplazar el header del panel por uno
  // mejorado visualmente con pill de estado y badge de fuente.

  const _origShowDetail = window.showDetail;

  window.showDetail = async function (type, id) {
    await _origShowDetail(type, id);

    const dashboard = document.getElementById('dashboard');
    if (!dashboard) return;

    // Construimos los datos del header según el tipo de elemento
    let item, statusColor, statusLabel, regionText, sourceText, titleText, iconSvg;

    if (type === 'embalse') {
      item = EMBALSES.find(x => x.id === id);
      if (!item) return;
      const pct = item.pct;
      if      (pct == null)  { statusLabel = 'Sin dato';   statusColor = 'var(--accent-cyan)';  }
      else if (pct >= 70)    { statusLabel = 'Óptimo';     statusColor = 'var(--status-good)';  }
      else if (pct >= 40)    { statusLabel = 'Precaución'; statusColor = 'var(--status-avg)';   }
      else                   { statusLabel = 'Crítico';    statusColor = 'var(--status-bad)';   }
      regionText = `${item.reg} · Cuenca: ${item.cuenca}`;
      sourceText = item.fuente || 'MITECO';
      titleText  = `Embalse de ${item.n}`;
      iconSvg    = getEmbalseIcon(pct || 50).options.html;

    } else {
      item = RIOS.find(x => x.id === id);
      if (!item) return;
      statusColor = 'var(--accent-cyan)';
      statusLabel = item.vertiente;
      regionText  = `Vertiente ${item.vertiente}`;
      sourceText  = item.fuente || 'CEDEX';
      titleText   = `Río ${item.n}`;
      iconSvg     = getRioIcon().options.html;
    }

    // Reemplazamos el header original por el v2
    const oldHdr = dashboard.querySelector('.d-flex.justify-content-between');
    if (oldHdr) {
      const el = document.createElement('div');
      el.className = 'dash-header-v2';
      el.innerHTML = `
        <div class="dash-id-block">
          <div class="d-ico-v2">${iconSvg}</div>
          <div>
            <h2 class="dash-name-v2">${titleText}</h2>
            <div class="dash-meta-row">
              <span class="dash-region">${regionText}</span>
              <span class="dash-status-pill" style="color:${statusColor}">
                <span class="dot"></span>${statusLabel}
              </span>
              <span class="dash-source-badge">Fuente: ${sourceText}</span>
            </div>
          </div>
        </div>
        <button class="btn-close-dash-v2" onclick="closeDashboard()">
          <span>✕</span><span class="d-none d-sm-inline">Cerrar panel</span>
        </button>`;
      oldHdr.replaceWith(el);
    }

    // Envolvemos cada canvas de gráfico en el nuevo contenedor estilizado
    dashboard.querySelectorAll('.bg-dark.p-3.rounded').forEach(c => {
      const titleEl = c.querySelector('.chart-label');
      const canvas  = c.querySelector('canvas');
      if (!canvas) return;

      const p = document.createElement('div');
      p.className = 'chart-panel';
      p.innerHTML = `
        <div class="chart-panel-header">
          <h5 class="chart-panel-title">${titleEl ? titleEl.textContent : 'Gráfico'}</h5>
          <span class="chart-panel-tag">Datos</span>
        </div>
        <div class="chart-panel-canvas-wrap"></div>`;
      p.querySelector('.chart-panel-canvas-wrap').appendChild(canvas);
      c.replaceWith(p);
    });
  };


  // 3. RÍOS — VERSIÓN MEJORADA 
  // Añade barra de caudal relativo con animación CSS y efecto reveal
  // en las tarjetas. Reemplaza completamente el renderRios() original.

  window.renderRios = function () {
    if (!hasRios()) return;
    const grid = document.getElementById('riosGrid');
    if (!grid) return;

    const maxCaudal = Math.max(...RIOS.map(r => r.caudal || 0));

    grid.innerHTML = RIOS.map((r, idx) => {
      const flowPct = maxCaudal ? Math.min(100, (r.caudal / maxCaudal) * 100) : 0;
      return `
        <div class="col-md-6 col-lg-4 reveal" style="transition-delay:${idx * 0.07}s">
          <div class="rio-card" onclick="showDetail('rio', ${r.id})">
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
            <div class="rc-flow-bar">
              <div class="rc-flow-label">
                <span>Caudal relativo</span>
                <span>${flowPct.toFixed(0)}%</span>
              </div>
              <div class="rc-flow-track">
                <div class="rc-flow-fill" data-pct="${flowPct}" style="width:0"></div>
              </div>
            </div>
            <div class="rc-region">${r.reg}</div>
          </div>
        </div>`;
    }).join('');

    requestAnimationFrame(() => {
      // Animamos las barras de caudal con un pequeño delay escalonado
      grid.querySelectorAll('.rc-flow-fill').forEach((el, i) => {
        setTimeout(() => { el.style.width = el.dataset.pct + '%'; }, 200 + i * 100);
      });
      // Efecto reveal de las tarjetas
      grid.querySelectorAll('.reveal').forEach(el => {
        setTimeout(() => el.classList.add('revealed'), 50);
      });
    });
  };


  //  4. ESTADÍSTICAS — DONUT + BAR CHART COMPLEMENTARIO 
  // Inyecta una fila extra con un donut overview y un bar chart horizontal
  // justo después del bloque de KPIs que pinta el original.

  const _origRenderEst = window.renderEstadisticas;
  let donutChart     = null;
  let barStatusChart = null;

  // Opciones de tooltip compartidas para los dos gráficos de esta sección
  // (evita repetir el mismo objeto literal dos veces)
  const _tooltipOpts = {
    backgroundColor: 'rgba(2,10,22,.95)',
    borderColor:     'rgba(0,200,240,.3)',
    borderWidth:     1,
    titleFont:       { family: "'Chakra Petch', sans-serif", weight: '700', size: 12 },
    bodyFont:        { family: "'Outfit', sans-serif", size: 13 },
    padding:         12,
    cornerRadius:    10
  };

  window.renderEstadisticas = function () {
    if (typeof _origRenderEst === 'function') _origRenderEst();
    if (!hasEmbalses()) return;

    // Idempotente: si la fila ya existe, no la regeneramos
    if (document.getElementById('donutOverviewRow')) return;

    const conPct    = EMBALSES.filter(e => e.pct !== null);
    const optimos   = conPct.filter(e => e.pct >= 70).length;
    const precaucion = conPct.filter(e => e.pct >= 40 && e.pct < 70).length;
    const criticos  = conPct.filter(e => e.pct < 40).length;
    const sinDato   = EMBALSES.length - conPct.length;
    const total     = EMBALSES.length;
    const media     = conPct.reduce((s, e) => s + e.pct, 0) / (conPct.length || 1);

    const kpisRow = document.getElementById('statsKpis');
    if (!kpisRow) return;

    // Construimos la fila del donut y la insertamos después de los KPIs
    const donutRow = document.createElement('div');
    donutRow.id        = 'donutOverviewRow';
    donutRow.className = 'row g-4 mb-4 reveal';

    donutRow.innerHTML = `
      <div class="col-lg-7">
        <div class="donut-overview-card">
          <h5 class="stat-card-title mb-4">Distribución por estado de almacenamiento</h5>
          <div class="donut-body">
            <div class="donut-canvas-wrap">
              <canvas id="chartDonutOverview"></canvas>
              <div class="donut-center-label">
                <div class="donut-center-val" style="color:${fillC(media)}">${media.toFixed(1)}%</div>
                <div class="donut-center-sub">Media nacional</div>
              </div>
            </div>
            <div class="donut-legend">
              <div class="donut-legend-item">
                <div class="dl-dot" style="background:var(--status-good);box-shadow:0 0 6px var(--status-good)"></div>
                <span class="dl-label">Óptimo</span>
                <span class="dl-val text-success">${optimos}</span>
                <span class="dl-pct">${total ? (optimos / total * 100).toFixed(1) : 0}%</span>
              </div>
              <div class="donut-legend-item">
                <div class="dl-dot" style="background:var(--status-avg);box-shadow:0 0 6px var(--status-avg)"></div>
                <span class="dl-label">Precaución</span>
                <span class="dl-val text-warning">${precaucion}</span>
                <span class="dl-pct">${total ? (precaucion / total * 100).toFixed(1) : 0}%</span>
              </div>
              <div class="donut-legend-item">
                <div class="dl-dot" style="background:var(--status-bad);box-shadow:0 0 6px var(--status-bad)"></div>
                <span class="dl-label">Crítico</span>
                <span class="dl-val text-danger">${criticos}</span>
                <span class="dl-pct">${total ? (criticos / total * 100).toFixed(1) : 0}%</span>
              </div>
              ${sinDato > 0 ? `
              <div class="donut-legend-item">
                <div class="dl-dot" style="background:#2a4560"></div>
                <span class="dl-label">Sin dato</span>
                <span class="dl-val" style="color:#6a8aaa">${sinDato}</span>
                <span class="dl-pct">${total ? (sinDato / total * 100).toFixed(1) : 0}%</span>
              </div>` : ''}
            </div>
          </div>
        </div>
      </div>
      <div class="col-lg-5">
        <div class="donut-overview-card h-100">
          <h5 class="stat-card-title mb-4">Totales por categoría</h5>
          <div class="bar-status-wrap"><canvas id="chartBarStatus"></canvas></div>
          <div class="bar-status-totals">
            <div class="bst-row">
              <span class="bst-lbl">Total monitorizado</span>
              <span class="bst-val">${total}</span>
            </div>
            <div class="bst-row">
              <span class="bst-lbl">Con datos disponibles</span>
              <span class="bst-val">${conPct.length}</span>
            </div>
          </div>
        </div>
      </div>`;

    kpisRow.after(donutRow);

    //  Donut principal 
    const donutCtx = document.getElementById('chartDonutOverview');
    if (donutCtx) {
      const labels = ['Óptimo (≥70%)', 'Precaución (40–70%)', 'Crítico (<40%)'];
      const data   = [optimos, precaucion, criticos];
      const colors = ['#00e5a3', '#f59e0b', '#f43f5e'];
      if (sinDato > 0) { labels.push('Sin dato'); data.push(sinDato); colors.push('#2a4560'); }

      donutChart = new Chart(donutCtx, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{
            data,
            backgroundColor: colors,
            borderColor:     '#020d1a',
            borderWidth:     3,
            hoverBorderColor:'#0a1e35',
            hoverOffset:     10
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          cutout: '65%',
          plugins: {
            legend: { display: false },
            tooltip: {
              ..._tooltipOpts,
              callbacks: {
                label: c => `  ${c.parsed} embalses (${total ? (c.parsed / total * 100).toFixed(1) : 0}%)`
              }
            }
          }
        }
      });
    }

    //  Bar chart horizontal complementario 
    const barCtx = document.getElementById('chartBarStatus');
    if (barCtx) {
      barStatusChart = new Chart(barCtx, {
        type: 'bar',
        data: {
          labels: ['Óptimo', 'Precaución', 'Crítico', 'Sin dato'],
          datasets: [{
            label: 'Nº de embalses',
            data:  [optimos, precaucion, criticos, sinDato],
            backgroundColor: ['#00e5a3dd', '#f59e0bdd', '#f43f5edd', '#2a4560dd'],
            borderColor:     ['#00e5a3',   '#f59e0b',   '#f43f5e',   '#4a6a88'],
            borderWidth:     1.5,
            borderRadius:    6,
            barPercentage:   0.7
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: 'y',
          plugins: {
            legend: { display: false },
            tooltip: {
              ..._tooltipOpts,
              padding:     10,
              cornerRadius: 8,
              callbacks: { label: c => `  ${c.parsed.x} embalses` }
            }
          },
          scales: {
            x: {
              beginAtZero: true,
              grid:  { color: 'rgba(255,255,255,.04)' },
              ticks: { font: { family: "'JetBrains Mono', monospace", size: 11 }, color: '#6a8aaa' }
            },
            y: {
              grid:  { display: false },
              ticks: { font: { family: "'Chakra Petch', sans-serif", weight: '700', size: 12 }, color: '#a0c0dc' }
            }
          }
        }
      });
    }

    setTimeout(() => donutRow.classList.add('revealed'), 100);
  };


  // 5. NOTICIAS — VERSIÓN MEJORADA 
  // Añade skeleton loader mientras carga y asigna iconos contextuales
  // según el contenido del título del aviso. Usa data-v32 para idempotencia.

  window.renderNoticias = async function () {
    const grid = document.getElementById('noticiasGrid');
    if (!grid || grid.dataset.v32 === 'done') return;

    // Skeleton placeholders mientras esperamos al servidor
    grid.innerHTML = Array.from({ length: 6 }).map(() => `
      <div class="col-md-6 col-lg-4">
        <div class="nc-skeleton">
          <div class="skeleton-bar tall" style="width:42px"></div>
          <div class="skeleton-bar"></div>
          <div class="skeleton-bar" style="width:80%"></div>
          <div class="skeleton-bar short"></div>
        </div>
      </div>`).join('');

    try {
      const res    = await fetch('/api/noticias');
      const titulos = await res.json();
      if (!titulos?.length) throw new Error('Sin datos');

      // Elige el emoji más apropiado según palabras clave del título
      const pickIcon = t => {
        const l = t.toLowerCase();
        if (/lluvia|precipita|tormen/.test(l))   return '🌧️';
        if (/calor|ola de|calur/.test(l))         return '🌡️';
        if (/viento|ráfaga|rafag/.test(l))        return '💨';
        if (/nieve|hielo|nev/.test(l))            return '❄️';
        if (/inunda|crec|desborda/.test(l))       return '🌊';
        if (/sequía|sequia/.test(l))              return '☀️';
        if (/niebla/.test(l))                     return '🌫️';
        return '⚠️';
      };

      grid.innerHTML = titulos.map((t, i) => `
        <div class="col-md-6 col-lg-4 reveal" style="transition-delay:${i * 0.08}s">
          <div class="noticia-card">
            <div class="nc-ico">${pickIcon(t)}</div>
            <h5 class="nc-title">${t}</h5>
            <div class="nc-footer">
              <span class="nc-badge">AEMET</span>
              <span class="nc-date">Hoy</span>
            </div>
          </div>
        </div>`).join('');

      grid.dataset.v32 = 'done'; // marca para no re-renderizar

      requestAnimationFrame(() => {
        grid.querySelectorAll('.reveal').forEach(el => el.classList.add('revealed'));
      });

    } catch (e) {
      grid.innerHTML = '<div class="col-12 text-center py-5"><p style="color:#5a7a98;">⚠️ No se pudieron cargar las alertas AEMET</p></div>';
    }
  };


  // 6. MAPAS TEMÁTICOS — COROPLETA POR CCAA 
  // Implementación básica con Leaflet GeoJSON.
  // Pendiente de migración a API-IDEE (IDEE.style.Choropleth) cuando
  // esté disponible la integración oficial del IGN/CNIG.
  //
  // Permite cambiar la métrica visualizada (llenado, nº embalses, capacidad)
  // mediante los botones .tm-layer-btn del HTML.

  let tmMap      = null;
  let tmGeoLayer = null;
  let currentMetric = 'pct_medio';

  //  Interpolación de color entre dos RGB 
  /**
   * Interpolación lineal entre dos colores RGB.
   * @param {number[]} a - Color origen [r, g, b].
   * @param {number[]} b - Color destino [r, g, b].
   * @param {number}   t - Factor de interpolación [0, 1].
   * @returns {number[]} Color interpolado [r, g, b].
   */
  function lerpColor(a, b, t) {
    return [
      Math.round(a[0] + (b[0] - a[0]) * t),
      Math.round(a[1] + (b[1] - a[1]) * t),
      Math.round(a[2] + (b[2] - a[2]) * t)
    ];
  }

  /**
   * Calcula el color de relleno de un polígono según su valor normalizado.
   * Cada métrica tiene su propia escala de color para facilitar la lectura.
   *
   * @param {number|null} val  - Valor de la métrica.
   * @param {number}      min  - Mínimo del rango actual.
   * @param {number}      max  - Máximo del rango actual.
   * @param {string}      metric
   * @returns {string} Color CSS (rgb o rgba).
   */
  function getChoroColor(val, min, max, metric) {
    if (val == null || isNaN(val)) return 'rgba(42,69,96,.3)'; // sin datos → gris oscuro
    const t = max > min ? (val - min) / (max - min) : 0.5;
    let c;
    if (metric === 'pct_medio') {
      // Escala tricolor: rojo (vacío) → ámbar → verde (lleno)
      c = t >= 0.5
        ? lerpColor([245, 158, 11], [0, 229, 163], (t - 0.5) * 2)
        : lerpColor([244,  63, 94], [245, 158, 11], t * 2);
    } else if (metric === 'num_embalses') {
      c = lerpColor([10, 30, 60], [0, 200, 240], t);   // azul marino → cian
    } else {
      c = lerpColor([10, 30, 60], [26, 108, 255], t);  // azul marino → azul eléctrico
    }
    return `rgb(${c.join(',')})`;
  }

  //  Agregación de datos por CCAA 
  /**
   * Agrupa los datos de EMBALSES por comunidad autónoma y calcula totales y medias.
   * @returns {Object} Mapa { nombre_ccaa: { n, cap, vol, pcts, pct_medio } }
   */
  function aggregateByCCAA() {
    const data = {};
    if (!hasEmbalses()) return data;

    EMBALSES.forEach(e => {
      const r = e.reg || 'Otras';
      if (!data[r]) data[r] = { n: 0, cap: 0, vol: 0, pcts: [] };
      data[r].n++;
      data[r].cap += e.cap || 0;
      data[r].vol += e.vol || 0;
      if (e.pct !== null) data[r].pcts.push(e.pct);
    });

    // Calculamos pct_medio aquí para no repetirlo en cada render
    Object.values(data).forEach(d => {
      d.pct_medio = d.pcts.length
        ? d.pcts.reduce((a, b) => a + b, 0) / d.pcts.length
        : null;
    });

    return data;
  }

  /**
   * Busca la entrada de ccaaData que corresponde a un feature GeoJSON.
   * Usa los aliases de REGIONS para resolver nombres distintos (ej. "Comunitat Valenciana" → "Com. Valenciana").
   * @returns {{ key: string, data: Object }|null}
   */
  function matchFeatureToCCAA(feature, ccaaData) {
    if (!feature.properties?.name) return null;
    const featureName = cleanText(feature.properties.name);

    // Primero intentamos con los aliases definidos en REGIONS (más fiable)
    if (typeof REGIONS !== 'undefined') {
      for (const reg in REGIONS) {
        for (const alias of REGIONS[reg].aliases) {
          if (featureName.includes(cleanText(alias)) || cleanText(alias).includes(featureName)) {
            if (ccaaData[reg]) return { key: reg, data: ccaaData[reg] };
          }
        }
      }
    }

    // Fallback: comparación directa con las claves del objeto de datos
    for (const k in ccaaData) {
      if (cleanText(k) === featureName || featureName.includes(cleanText(k))) {
        return { key: k, data: ccaaData[k] };
      }
    }

    return null;
  }

  // Helpers de métricas 
  function getMetricValue(d, metric) {
    if (!d) return null;
    if (metric === 'pct_medio')     return d.pct_medio;
    if (metric === 'num_embalses')  return d.n;
    if (metric === 'capacidad')     return d.cap;
    return null;
  }
  function getMetricLabel(metric) {
    if (metric === 'pct_medio')    return '% Llenado medio';
    if (metric === 'num_embalses') return 'Nº Embalses';
    if (metric === 'capacidad')    return 'Capacidad (hm³)';
    return '';
  }
  function getMetricFormat(val, metric) {
    if (val == null)               return '—';
    if (metric === 'pct_medio')    return val.toFixed(1) + '%';
    if (metric === 'num_embalses') return val.toString();
    if (metric === 'capacidad')    return val.toLocaleString('es-ES') + ' hm³';
    return val.toString();
  }

  /**
   * Cambia la métrica del mapa temático y lo vuelve a renderizar.
   * Llamada desde los botones .tm-layer-btn del HTML.
   * @param {'pct_medio'|'num_embalses'|'capacidad'} metric
   */
  window.setThematicLayer = function (metric) {
    currentMetric = metric;
    document.querySelectorAll('.tm-layer-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.metric === metric);
    });
    renderChoropleth();
  };

  /** Pinta la capa GeoJSON de CCAA sobre tmMap con colores según la métrica activa. */
  function renderChoropleth() {
    if (!tmMap || !hasGeoJSON()) return;

    const ccaaData = aggregateByCCAA();
    const vals     = Object.values(ccaaData)
      .map(d => getMetricValue(d, currentMetric))
      .filter(v => v != null);
    const minVal = vals.length ? Math.min(...vals) : 0;
    const maxVal = vals.length ? Math.max(...vals) : 100;

    if (tmGeoLayer) tmMap.removeLayer(tmGeoLayer);

    tmGeoLayer = L.geoJSON(cachedGeoJSON, {
      style: feature => {
        const match = matchFeatureToCCAA(feature, ccaaData);
        const val   = match ? getMetricValue(match.data, currentMetric) : null;
        return {
          fillColor:   getChoroColor(val, minVal, maxVal, currentMetric),
          fillOpacity: 0.7,
          color:       'rgba(0,200,240,.4)',
          weight:      1.5,
          opacity:     0.85
        };
      },
      onEachFeature: (feature, layer) => {
        const match = matchFeatureToCCAA(feature, ccaaData);
        const name  = feature.properties.name || '';
        const val   = match ? getMetricFormat(getMetricValue(match.data, currentMetric), currentMetric) : '—';

        layer.bindTooltip(
          `<b>${name}</b><br>${getMetricLabel(currentMetric)}: <b>${val}</b>`,
          { direction: 'top', className: 'tm-tooltip', sticky: true }
        );

        layer.on({
          mouseover: e => {
            e.target.setStyle({ weight: 3, color: '#00c8f0', fillOpacity: 0.88 });
            e.target.bringToFront();
            if (match) updateTMInfo(match.key, match.data);
          },
          mouseout: e => tmGeoLayer.resetStyle(e.target),
          click: () => {
            if (match) {
              // Al clicar en una CCAA, navegamos a la sección de pantanos con esa región filtrada
              window.goToSection('pantanos');
              setTimeout(() => highlightRegion(match.key), 600);
            }
          }
        });
      }
    }).addTo(tmMap);

    updateTMLegend(minVal, maxVal, currentMetric);
  }

  /** Actualiza la leyenda de gradiente del mapa temático. */
  function updateTMLegend(min, max, metric) {
    const legendEl = document.getElementById('tmLegend');
    if (!legendEl) return;

    const gradColors = metric === 'pct_medio'
      ? 'linear-gradient(90deg, #f43f5e, #f59e0b, #00e5a3)'
      : metric === 'num_embalses'
        ? 'linear-gradient(90deg, rgb(10,30,60), #00c8f0)'
        : 'linear-gradient(90deg, rgb(10,30,60), #1a6cff)';

    legendEl.innerHTML = `
      <div class="tm-legend-title">Leyenda — ${getMetricLabel(metric)}</div>
      <div class="tm-legend-gradient" style="background:${gradColors}"></div>
      <div class="tm-legend-labels">
        <span>${getMetricFormat(min, metric)}</span>
        <span>${getMetricFormat(max, metric)}</span>
      </div>`;
  }

  /**
   * Actualiza el panel de info lateral con los datos de la CCAA bajo el cursor.
   * @param {string} ccaaName
   * @param {Object} d - Datos agregados de la CCAA.
   */
  function updateTMInfo(ccaaName, d) {
    const info = document.getElementById('tmInfo');
    if (!info) return;

    const media  = d.pct_medio != null ? d.pct_medio.toFixed(1) + '%' : '—';
    const volPct = d.cap > 0 ? ((d.vol / d.cap) * 100).toFixed(1) + '%' : '—';

    info.innerHTML = `
      <h4 class="tm-info-title">${ccaaName}</h4>
      <div class="tm-info-stats">
        <div class="tm-info-row"><span class="tm-info-label">Embalses</span><span class="tm-info-val">${d.n}</span></div>
        <div class="tm-info-row"><span class="tm-info-label">Llenado medio</span><span class="tm-info-val" style="color:${fillC(d.pct_medio || 0)}">${media}</span></div>
        <div class="tm-info-row"><span class="tm-info-label">Capacidad total</span><span class="tm-info-val">${d.cap.toLocaleString('es-ES')} hm³</span></div>
        <div class="tm-info-row"><span class="tm-info-label">Agua almacenada</span><span class="tm-info-val">${d.vol.toLocaleString('es-ES')} hm³</span></div>
        <div class="tm-info-row"><span class="tm-info-label">Proporción almacenada</span><span class="tm-info-val">${volPct}</span></div>
      </div>`;
  }

  /**
   * Inicializa el mapa tmMap si no existe y lanza el render de la coropleta.
   * Si los datos GeoJSON aún no están disponibles, reintenta cada 700ms.
   * Llamada desde goToSection('mapas').
   */
  function renderMapasTematicos() {
    if (!tmMap) {
      const mapEl = document.getElementById('thematicMap');
      if (!mapEl) return;
      tmMap = L.map('thematicMap', { zoomControl: false }).setView([39.5, -3.0], 6);
      L.control.zoom({ position: 'topright' }).addTo(tmMap);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19, attribution: '© CartoDB'
      }).addTo(tmMap);
    }

    setTimeout(() => tmMap.invalidateSize(), 300);

    // Retry hasta que cachedGeoJSON esté disponible (puede tardar si la conexión es lenta)
    if (!hasGeoJSON()) {
      const info = document.getElementById('tmInfo');
      if (info) info.innerHTML = `
        <h4 class="tm-info-title">Cargando datos...</h4>
        <p style="color:#5a7a98;font-size:.9rem;">Preparando los límites de CCAA y las estadísticas de embalses.</p>`;
      setTimeout(renderMapasTematicos, 700);
      return;
    }

    renderChoropleth();
  }

  console.log('[HidroVisor v3.2.1] Overrides aplicados ✓');

})();