// ============================================================
// heatmap.js — Heatmap de activaciones Conv1D con D3.js
// Overlay global de filtros: selección múltiple aplicada
// a todos los modos de visualización existentes.
// ============================================================

// Colormaps
const COLORMAPS = {
  red:   [[255,255,255],[255,179,179],[255,102,102],[255,0,0],[128,0,0]],
  green: [[255,255,255],[182,242,182],[ 76,175, 80],[ 27,94, 32]],
  blue:  [[255,255,255],[179,217,255],[ 33,150,243],[ 13,71,161]],
  heat:  [[255,243, 59],[253,199, 12],[243,144, 63],[237,104,60],[233,62,58]],
  viridis: [[68,1,84],[59,82,139],[33,145,140],[94,201,98],[253,231,37]],
  cividis: [[0,32,77],[65,77,107],[124,123,120],[191,173,105],[255,233,69]],
  inferno: [[0,0,4],[87,16,110],[187,55,84],[249,141,10],[252,255,164]],
  bluemonotone: [[240,248,255],[176,226,255],[99,184,255],[28,134,238],[0,104,139]]
};

function sampleColormap(name, t) {
  const stops = COLORMAPS[name] || COLORMAPS.red;
  const n = stops.length - 1;
  const pos = Math.max(0, Math.min(1, t)) * n;
  const i = Math.min(Math.floor(pos), n - 1);
  const f = pos - i;
  const [r1,g1,b1] = stops[i], [r2,g2,b2] = stops[i+1];
  return [
    Math.round(r1 + f*(r2-r1)),
    Math.round(g1 + f*(g2-g1)),
    Math.round(b1 + f*(b2-b1))
  ];
}
function applyPowerScaling(norm, gamma) {
  return gamma <= 1 ? norm : Math.pow(norm, gamma);
}
function perceivedBrightness(r, g, b) {
  return (0.299*r + 0.587*g + 0.114*b) / 255;
}

// Escala de color por filtro
const FILTER_COLORS = d3.scaleOrdinal(d3.schemeTableau10);

// Lectura del estado de filtros activos y método de combinación
function getActiveFilters() {
  return Array.from(
    document.querySelectorAll('#filterOverlayGrid input[type=checkbox]:checked')
  ).map(cb => cb.value);
}
function getCombineMethod() {
  return document.getElementById('filterCombineMethod')?.value || 'sum';
}

// Calculo de activaciones
// Un filtro  devuelve {combined, perFilter} con el mismo shape
// N filtros  combina según method (sum | max | mean)
function calculateActivationsForFilter(seqId, layerName, filterId, epochData) {
  const seqOriginal = sequenceMap[parseInt(seqId)];
  if (!seqOriginal) return null;
  const seqLength   = seqOriginal.length;
  const activations = new Array(seqLength).fill(0);
  const layer       = epochData.layers[layerName];
  if (!layer || !layer.filters[filterId]) return activations;
  const seqNode = layer.filters[filterId].sequences[seqId];
  if (!seqNode || !seqNode.fragments) return activations;

  const topN      = parseInt(document.getElementById('heatmapTopN')?.value)    || 999;
  const threshold = parseFloat(document.getElementById('heatmapThreshold')?.value) || 0;

  [...seqNode.fragments]
    .filter(f => f.activation >= threshold)
    .sort((a,b) => b.activation - a.activation)
    .slice(0, topN)
    .forEach(({ fragment_pos: pos, fragment_length: len, activation }) => {
      for (let i = pos; i < pos + len + 1 && i < seqLength; i++)
        activations[i] = Math.max(activations[i], activation);
    });
  return activations;
}

function calculateMultiFilterActivations(seqId, layerName, filterIds, epochData, method = 'sum') {
  const seqOriginal = sequenceMap[parseInt(seqId)];
  if (!seqOriginal) return null;
  const seqLength = seqOriginal.length;
  const combined  = new Array(seqLength).fill(0);
  const perFilter = {};

  filterIds.forEach(fid => {
    const acts = calculateActivationsForFilter(seqId, layerName, fid, epochData)
              || new Array(seqLength).fill(0);
    perFilter[fid] = acts;
    for (let i = 0; i < seqLength; i++) {
      if      (method === 'max')  combined[i] = Math.max(combined[i], acts[i]);
      else if (method === 'mean') combined[i] += acts[i] / filterIds.length;
      else                        combined[i] += acts[i];           // sum
    }
  });
  return { combined, perFilter };
}

// Constructor fildas de datos
// Devuelve la estructura estándar que consume renderD3Heatmap.
// Un filtro  tooltip simple; varios  tooltip con breakdown.
function buildActivationRow(label, seqId, layerName, epochData, selectedFilters, method) {
  const seqOriginal = sequenceMap[parseInt(seqId)];
  const seqLabel    = sequenceLabels[parseInt(seqId)];
  if (!seqOriginal || !selectedFilters.length) return null;

  if (selectedFilters.length === 1) {
    const fid  = selectedFilters[0];
    const acts = calculateActivationsForFilter(seqId, layerName, fid, epochData);
    if (!acts) return null;
    return { label, seqOriginal, seqLabel,
             combined: acts, perFilter: { [fid]: acts },
             selectedFilters, method: 'single' };
  }

  const result = calculateMultiFilterActivations(seqId, layerName, selectedFilters, epochData, method);
  if (!result) return null;
  return { label, seqOriginal, seqLabel,
           combined: result.combined, perFilter: result.perFilter,
           selectedFilters, method };
}

// Tooltip dinámico
function buildHeatmapTooltip(base, pi, act, row) {
  const { perFilter, selectedFilters, method, seqLabel } = row;
  const header = `<strong>${base}</strong> <span class="tip-pos">pos: ${pi}</span>`;

  if (selectedFilters.length === 1 || method === 'single') {
    return `${header}<br>act: ${act.toFixed(4)}`;
  }

  const contribs = [...selectedFilters]
    .map(fid => ({ fid, val: (perFilter[fid] || [])[pi] || 0 }))
    .sort((a,b) => b.val - a.val);

  const bars = contribs
    .filter(({ val }) => val > 0)          // ocultar filtros sin contribución
    .map(({ fid, val }) => {
      const pct = act > 0 ? Math.round((val / act) * 100) : 0;
      const col = FILTER_COLORS(fid);
      return `<div class="tip-row">
        <div class="tip-bar-bg">
          <div class="tip-bar-fill" style="width:${pct}%;background:${col}"></div>
        </div>
        <span class="tip-fid">F${fid}</span>
        <span class="tip-val">${val.toFixed(4)}</span>
        <span class="tip-pct">${pct}%</span>
      </div>`;
    }).join('');

  return `${header}
    <div class="tip-total">Combined (${method}): <strong>${act.toFixed(4)}</strong></div>
    <div class="tip-sep"></div>
    <div class="tip-contribs">${bars}</div>`;
}

// Renderizado D3.js
const D3_CELL_W  = 8;
const D3_CELL_H  = 20;
const D3_ROW_GAP = 2;
const D3_LABEL_W = 115;

function renderD3Heatmap(containerId, rowsData) {
  const container = document.getElementById(containerId);
  d3.select(container).selectAll('*').remove();

  if (!rowsData?.length) {
    container.innerHTML = '<p class="text-muted p-2">Sin datos de activación.</p>';
    return;
  }

  const colormap = document.getElementById('heatmapColormap')?.value || 'red';
  const gamma    = parseFloat(document.getElementById('heatmapGamma')?.value) || 2;
  const seqLen   = rowsData[0].seqOriginal.length;

  let maxLabelLen = 0;
  rowsData.forEach(r => {
    if (r.label && r.label.length > maxLabelLen) maxLabelLen = r.label.length;
  });
  // Approx 5.5px por carácter + 65px para el botón "Detalles" y margen
  const dynamicLabelW = Math.max(D3_LABEL_W, Math.round(maxLabelLen * 5.5) + 65);

  const ML = dynamicLabelW + 10, MR = 16, MT = 18, MB = 8;
  const svgW = seqLen * D3_CELL_W + ML + MR;
  const svgH = rowsData.length * (D3_CELL_H + D3_ROW_GAP) + MT + MB;

  const wrapper = document.createElement('div');
  wrapper.style.overflowX = 'auto';
  container.appendChild(wrapper);

  const svg = d3.select(wrapper).append('svg')
    .attr('width', svgW).attr('height', svgH);
  
  // Asignamos una clase g global para controlar el hover CSS de celdas
  const g = svg.append('g')
    .attr('transform', `translate(${ML},${MT})`)
    .attr('class', 'heatmap-interactive-group');

  // Eje X: marcas cada 10 pb
  for (let p = 0; p < seqLen; p += 10) {
    g.append('text')
      .attr('x', p * D3_CELL_W + D3_CELL_W / 2).attr('y', -5)
      .attr('text-anchor', 'middle').attr('font-size', '8px').attr('fill', '#aaa')
      .text(p);
      
    // Guías verticales secundarias
    if (p > 0) {
      g.append('line')
        .attr('x1', p * D3_CELL_W).attr('y1', 0)
        .attr('x2', p * D3_CELL_W).attr('y2', rowsData.length * (D3_CELL_H + D3_ROW_GAP))
        .attr('stroke', 'rgba(0,0,0,0.06)')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '2,2')
        .attr('pointer-events', 'none');
    }
  }

  const tip = getOrCreateTooltip('d3-heatmap-tip');
  const rectsData = [];

  rowsData.forEach((row, ri) => {
    const ry = ri * (D3_CELL_H + D3_ROW_GAP);

    // Normalización min-max por fila (comportamiento original)
    const minAct = Math.min(...row.combined);
    const maxAct = Math.max(...row.combined);

    // Franja de clase
    g.append('rect')
      .attr('x', -6).attr('y', ry)
      .attr('width', 4).attr('height', D3_CELL_H)
      .attr('fill', classColor(row.seqLabel));

    // Etiqueta de fila
    svg.append('text')
      .attr('x', ML - 10).attr('y', MT + ry + D3_CELL_H / 2)
      .attr('text-anchor', 'end').attr('dominant-baseline', 'middle')
      .attr('font-size', '10px').attr('fill', '#333')
      .text(row.label);

    const matchSeqId = row.label.match(/\d+/);
    if (matchSeqId) {
      const seqIdStr = matchSeqId[0];
      const btnW = 54, btnH = 16;
      const btnGroup = svg.append('g')
        .style('cursor', 'pointer')
        .attr('transform', `translate(4, ${MT + ry + (D3_CELL_H - btnH) / 2})`)
        .on('click', () => {
           if (typeof handleAnalyzeSequenceFromHeatmap === 'function') {
               handleAnalyzeSequenceFromHeatmap(seqIdStr);
           }
        });
        
      btnGroup.append('rect')
        .attr('width', btnW).attr('height', btnH).attr('rx', 3)
        .attr('fill', '#eef2ff').attr('stroke', '#818cf8').attr('stroke-width', 1);
        
      btnGroup.append('text')
        .attr('x', btnW / 2).attr('y', btnH / 2)
        .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
        .attr('font-size', '9px').attr('fill', '#4f46e5').attr('font-weight', '600')
        .attr('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif')
        .text('Detalles');
        
      btnGroup.append('title').text('Analizar características (Seq ' + seqIdStr + ')');
    }

    let currentRegion = null;
    let inRegion = false;

    row.combined.forEach((act, pi) => {
      if (pi >= seqLen) return;
      let norm = 0;
      if (maxAct > minAct) norm = (act - minAct) / (maxAct - minAct);
      else if (maxAct > 0) norm = 1;

      // Evaluar región continua
      if (norm > 0.05) {
          if (!inRegion) {
              inRegion = true;
              currentRegion = `R${ri}-reg${pi}`;
          }
      } else {
          inRegion = false;
          currentRegion = null;
      }

      const scaled   = applyPowerScaling(norm, gamma);
      const [r,gc,b] = sampleColormap(colormap, scaled);
      const bright   = perceivedBrightness(r, gc, b);
      const base     = row.seqOriginal[pi] || '';
      const cx       = pi * D3_CELL_W;
      const hasBorder = (norm > 0.35 && maxAct > 0);

      rectsData.push({
          cx, ry, r, gc, b, base, pi, act, row, bright, 
          hasBorder, regionId: currentRegion
      });
    });
  });

  // BATCH DOM INJECTION: Rectángulos
  g.selectAll('rect.d3-cell-rect')
    .data(rectsData)
    .join('rect')
    .attr('class', d => d.regionId ? `d3-cell-rect ${d.regionId}` : 'd3-cell-rect')
    .attr('x', d => d.cx).attr('y', d => d.ry)
    .attr('width', D3_CELL_W).attr('height', D3_CELL_H)
    .attr('fill', d => `rgb(${d.r},${d.gc},${d.b})`)
    .attr('stroke', d => d.hasBorder ? 'rgba(0,0,0,0.4)' : null)
    .attr('stroke-width', d => d.hasBorder ? 1 : null)
    .style('cursor', 'crosshair')
    .on('mouseover', (event, d) => {
        tip.style('opacity', 1).html(buildHeatmapTooltip(d.base, d.pi, d.act, d.row));
        if (d.regionId) d3.selectAll('.' + d.regionId).classed('heatmap-region-highlight', true);
    })
    .on('mousemove', (event) => {
        tip.style('left', (event.pageX + 14) + 'px').style('top', (event.pageY - 32) + 'px');
    })
    .on('mouseout', (event, d) => {
        tip.style('opacity', 0);
        if (d.regionId) d3.selectAll('.' + d.regionId).classed('heatmap-region-highlight', false);
    });

  // BATCH DOM INJECTION: Textos
  g.selectAll('text.d3-cell-text')
    .data(rectsData)
    .join('text')
    .attr('class', 'd3-cell-text')
    .attr('x', d => d.cx + D3_CELL_W / 2).attr('y', d => d.ry + D3_CELL_H / 2)
    .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
    .attr('font-size', '9px')
    .attr('font-family', "'JetBrains Mono', 'Fira Code', monospace")
    .attr('font-weight', '600')
    .attr('fill', d => d.bright > 0.55 ? '#111' : '#fff')
    .attr('pointer-events', 'none')
    .text(d => d.base);

  // Leyenda de filtros activos (solo en modo multi-filtro)
  const sample = rowsData[0];
  if (sample?.selectedFilters?.length > 1) {
    _renderOverlayLegend(container, sample.selectedFilters, sample.method);
  }
  _renderHeatmapNavBar(sample ? sample.selectedFilters : []);
}

function _renderOverlayLegend(container, filterIds, method) {
  const wrap = document.createElement('div');
  wrap.className = 'overlay-legend';
  const methodPill = document.createElement('span');
  methodPill.className = 'overlay-legend-method';
  methodPill.textContent = method;
  wrap.appendChild(methodPill);
  filterIds.forEach(fid => {
    const col  = FILTER_COLORS(fid);
    const pill = document.createElement('span');
    pill.className = 'overlay-legend-pill';
    pill.style.cssText = `border-color:${col};background:${col}18;`;
    pill.innerHTML = `<span style="background:${col}" class="overlay-legend-dot"></span>F${fid}`;
    wrap.appendChild(pill);
  });
  container.appendChild(wrap);
}

// ── Dispatcher principal ─────────────────────────────────────
function renderVisualization() {
  const mode      = document.getElementById('vizMode').value;
  const seqId     = document.getElementById('seqSelect').value;
  const layerName = 'conv1d_1';

  if (!layerName) {
    document.getElementById('vizContent').innerHTML =
      '<p class="text-muted p-2">Elegir capa.</p>'; return;
  }

  const selectedFilters = getActiveFilters();
  if (!selectedFilters.length) {
    document.getElementById('vizContent').innerHTML =
      '<p class="text-muted p-2"><em>Selecciona al menos un filtro en el panel de Filtros activos.</em></p>';
    return;
  }

  if (mode === 'comparefilters') { renderCompareFiltersMode(layerName, selectedFilters); return; }

  if (!seqId) {
    document.getElementById('vizContent').innerHTML =
      '<p class="text-muted p-2">Elegir secuencia.</p>'; return;
  }
  if (!sequenceMap[parseInt(seqId)]) {
    document.getElementById('vizContent').innerHTML =
      '<p class="text-muted p-2">Secuencia no encontrada.</p>'; return;
  }

  const seqOriginal = sequenceMap[parseInt(seqId)];
  if      (mode === 'single')        renderSingleFilterMode(seqId, layerName, seqOriginal, selectedFilters);
  else if (mode === 'compareepochs') renderCompareEpochsMode(seqId, layerName, seqOriginal, selectedFilters);
  else if (mode === 'allfiltersseq') renderAllFiltersForSeqMode(seqId, layerName, seqOriginal, selectedFilters);
}

// Modo 1: una secuencia, filtros overlay
async function renderSingleFilterMode(seqId, layerName, seqOriginal, selectedFilters) {
  const epochFile = document.getElementById('epochSelectSingle').value;
  if (!epochFile) return;
  const epochData = await ensureEpochLoaded(epochFile);
  if (!epochData) return;

  const method = getCombineMethod();
  const row    = buildActivationRow(
    selectedFilters.length === 1
      ? `F${selectedFilters[0]} · E${epochData.epoch}`
      : `[${selectedFilters.map(f=>'F'+f).join('+')}] · E${epochData.epoch}`,
    seqId, layerName, epochData, selectedFilters, method
  );
  if (!row) return;

  renderD3Heatmap('vizContent', [row]);
  renderInputVectorTable(seqId, layerName, selectedFilters[0], epochData);
  updateContextInfo(
    `Single · ${selectedFilters.map(f=>'F'+f).join('+')} · ${method} · E${epochData.epoch} · Seq ${seqId}`
  );
}

// Modo 2: todas las secuencias, filtros overlay
async function renderCompareFiltersMode(layerName, selectedFilters) {
  const epochFile = document.getElementById('epochSelectCompareSeqs').value;
  if (!epochFile) return;
  const epochData = await ensureEpochLoaded(epochFile);
  if (!epochData) return;

  // Recoger todas las secuencias que tienen datos en los filtros seleccionados
  const seqSet = new Set();
  selectedFilters.forEach(fid => {
    const layer = epochData.layers[layerName];
    if (layer?.filters[fid])
      Object.keys(layer.filters[fid].sequences).forEach(sid => seqSet.add(sid));
  });

  const classFilter = document.getElementById('heatmapClassFilter').value;
  let seqIds = [...seqSet].map(Number).sort((a,b)=>a-b).map(String);
  if (classFilter !== 'all') {
    const target = classFilter === 'nucleosome' ? 'Nucleosome' : classFilter === 'non_nucleosome' ? 'Non-Nucleosome' : null;
    seqIds = seqIds.filter(id => sequenceLabels[parseInt(id)] === target);
  }

  const currentConfig = `${layerName}-${selectedFilters.join(',')}-${classFilter}-${epochFile}`;
  if (window._lastHeatmapConfig !== currentConfig) {
      window._heatmapCurrentPage = 0;
      window._lastHeatmapConfig = currentConfig;
  }

  const PAGE_SIZE = 20;
  const totalItems = seqIds.length;
  const startIndex = window._heatmapCurrentPage * PAGE_SIZE;
  const pagedSeqIds = seqIds.slice(startIndex, startIndex + PAGE_SIZE);

  const method   = getCombineMethod();
  const rowsData = pagedSeqIds
    .map(sid => buildActivationRow(`Seq ${sid}`, sid, layerName, epochData, selectedFilters, method))
    .filter(Boolean);

  renderD3Heatmap('vizContent', rowsData);
  document.getElementById('inputVectorContainer').style.display = 'none';
  updateContextInfo(
    `Todas seqs · ${selectedFilters.map(f=>'F'+f).join('+')} · ${method} · E${epochData.epoch} · Total: ${totalItems} seqs`
  );

  renderPaginationControls('vizContent', totalItems, PAGE_SIZE, window._heatmapCurrentPage, (newPage) => {
      window._heatmapCurrentPage = newPage;
      renderCompareFiltersMode(layerName, selectedFilters);
  });
}


// Modo 3: todas las épocas, filtros overlay
async function renderCompareEpochsMode(seqId, layerName, seqOriginal, selectedFilters) {
  const method     = getCombineMethod();
  const loadedData = [];
  for (const { filename } of availableEpochs) {
    const d = await ensureEpochLoaded(filename);
    if (d) loadedData.push(d);
  }

  const rowsData = loadedData
    .map(epochData => buildActivationRow(
      selectedFilters.length === 1
        ? `Época ${epochData.epoch}`
        : `E${epochData.epoch} · [${selectedFilters.map(f=>'F'+f).join('+')}]`,
      seqId, layerName, epochData, selectedFilters, method
    ))
    .filter(Boolean);

  renderD3Heatmap('vizContent', rowsData);
  document.getElementById('inputVectorContainer').style.display = 'none';
  updateContextInfo(
    `Todas épocas · ${selectedFilters.map(f=>'F'+f).join('+')} · ${method} · Seq ${seqId}`
  );
}

// Modo 4: todas las secuencias, todos los filtros, modo overlay
// Cada filtro activo = 1 fila, activaciones individuales (no combinadas)
async function renderAllFiltersForSeqMode(seqId, layerName, seqOriginal, selectedFilters) {
  const epochFile = document.getElementById('epochSelectAllFilters').value;
  if (!epochFile) return;
  const epochData = await ensureEpochLoaded(epochFile);
  if (!epochData) return;

  const rowsData = selectedFilters
    .map(fid => buildActivationRow(`F${fid}`, seqId, layerName, epochData, [fid], 'single'))
    .filter(Boolean);

  renderD3Heatmap('vizContent', rowsData);
  document.getElementById('inputVectorContainer').style.display = 'none';
  updateContextInfo(
    `Filtros individuales · [${selectedFilters.map(f=>'F'+f).join(',')}] · E${epochData.epoch} · Seq ${seqId}`
  );
}

// Input vector table (solo para conv1d_2)
function renderInputVectorTable(seqId, layerName, filterId, epochData) {
  const container = document.getElementById('inputVectorContainer');
  const content   = document.getElementById('inputVectorContent');
  if (layerName !== 'conv1d_2') { container.style.display = 'none'; return; }
  const layer   = epochData.layers[layerName];
  const seqNode = layer?.filters[filterId]?.sequences[seqId];
  if (!seqNode?.activations?.length) { container.style.display = 'none'; return; }

  let html = '';
  seqNode.activations.forEach(act => {
    const iv = act.input_vector;
    html += `<p style="font-weight:bold;margin:10px 0 4px">
      Pos: ${act.position} | Act: ${act.activation.toFixed(6)} | ${iv.length}×${iv[0].length}</p>`;
    html += `<table style="border-collapse:collapse;font-size:11px;font-family:monospace;margin-bottom:12px">
      <thead><tr><th style="border:1px solid #ccc;padding:2px 6px">row</th>`;
    for (let c = 0; c < iv[0].length; c++)
      html += `<th style="border:1px solid #ccc;padding:2px 4px">${c}</th>`;
    html += '</tr></thead><tbody>';
    for (let r = 0; r < iv.length; r++) {
      html += `<tr><td style="border:1px solid #ccc;padding:2px 6px;font-weight:bold">${r}</td>`;
      for (let c = 0; c < iv[0].length; c++) {
        const val = iv[r][c];
        const bg  = val > 0
          ? `rgba(0,${Math.round(180*Math.min(1,val*.5))},${Math.round(220*Math.min(1,val*.5))},0.4)`
          : 'transparent';
        html += `<td style="border:1px solid #eee;padding:2px 4px;background:${bg}">${val.toFixed(3)}</td>`;
      }
      html += '</tr>';
    }
    html += '</tbody></table>';
  });
  content.innerHTML = html;
  container.style.display = 'block';
}

// Compatibilidad

function buildHeatmapTable(col1Header, rowsHtml) {
    return `<table style="border-collapse:collapse;width:100%;">
        <colgroup><col style="width:80px;"><col></colgroup>
        <thead>
            <tr style="border-bottom:1px solid #ddd;">
                <th style="text-align:left;padding:3px 8px;font-size:10px;
                           color:#999;font-weight:normal;">${col1Header}</th>
                <th style="text-align:left;padding:3px 4px;font-size:10px;
                           color:#999;font-weight:normal;">Secuencia</th>
            </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
    </table>`;
}

function createSequenceRow(rowLabel, seqOriginal, activations, seqLabel) {
    const colormapEl = document.getElementById('heatmapColormap');
    const gammaEl    = document.getElementById('heatmapGamma');
    const colormap   = colormapEl ? colormapEl.value          : 'red';
    const gamma      = gammaEl    ? parseFloat(gammaEl.value) : 2.0;

    const minAct = Math.min(...activations);
    const maxAct = Math.max(...activations);
    const border = classColor(seqLabel);

    let spans = '';
    for (let i = 0; i < seqOriginal.length; i++) {
        const act  = activations[i];
        let norm   = 0;
        if (maxAct > minAct)                      norm = (act - minAct) / (maxAct - minAct);
        else if (maxAct === minAct && maxAct > 0) norm = 1;

        const scaled = applyPowerScaling(norm, gamma);
        const [r, g, b] = sampleColormap(colormap, scaled);
        const textCol = perceivedBrightness(r, g, b) > 0.55 ? '#111' : '#fff';

        spans += `<span style="background:rgb(${r},${g},${b});color:${textCol};` +
                 `font-weight:bold;padding:1px 0;font-family:monospace;font-size:15px;" ` +
                 `title="Pos:${i} Act:${act.toFixed(4)}">${seqOriginal[i]}</span>`;
    }

    return `<tr>
        <td style="border-left:4px solid ${border};padding:2px 8px;font-size:11px;
                   white-space:nowrap;vertical-align:middle;color:#555;min-width:70px;"
            title="${seqLabel || ''}">${rowLabel}</td>
        <td style="padding:2px 4px;line-height:1.6;">${spans}</td>
    </tr>`;
}

function navigateFromHeatmap(target) {
    const filterIds   = getActiveFilters();
    const classFilter = document.getElementById('heatmapClassFilter') ? document.getElementById('heatmapClassFilter').value : 'all';
    const mode        = document.getElementById('vizMode') ? document.getElementById('vizMode').value : 'comparefilters';
    const epochSelId  = mode === 'comparefilters' ? 'epochSelectCompareSeqs'
                      : mode === 'allfiltersseq'  ? 'epochSelectAllFilters'
                      : 'epochSelectSingle';
    const epochFile   = document.getElementById(epochSelId) ? document.getElementById(epochSelId).value : '';

    window._pendingHeatmapNavigation = { filterIds: filterIds, classFilter: classFilter, epochFile: epochFile };

    const tabEl = document.querySelector('a[href="#' + target + '"]');
    if (tabEl) bootstrap.Tab.getOrCreateInstance(tabEl).show();
}


function _renderHeatmapNavBar(filterIds) {
    const existing = document.getElementById('heatmapNavBar');
    if (existing) existing.remove();
    if (!filterIds || !filterIds.length) return;

    const vizPanel = document.getElementById('vizContent');
    if (!vizPanel) return;

    const bar = document.createElement('div');
    bar.id = 'heatmapNavBar';
    bar.className = 'heatmap-nav-bar';

    const label = document.createElement('span');
    label.className = 'heatmap-nav-label';
    label.innerHTML = '<i class="bi bi-box-arrow-up-right me-1"></i>Ver F' + filterIds.join(', F') + ' en:';
    bar.appendChild(label);

    const btnDefs = [
        { icon: 'bi-flower1',      text: 'Motifs',          target: 'tabMotifs'   },
        { icon: 'bi-bar-chart-line', text: 'Análisis filtros', target: 'tabAnalysis' }
    ];
    btnDefs.forEach(function(def) {
        const btn = document.createElement('button');
        btn.className = 'heatmap-nav-btn';
        btn.innerHTML = '<i class="bi ' + def.icon + ' me-1"></i>' + def.text;
        btn.addEventListener('click', function() { navigateFromHeatmap(def.target); });
        bar.appendChild(btn);
    });

    vizPanel.parentNode.insertBefore(bar, vizPanel);
}
