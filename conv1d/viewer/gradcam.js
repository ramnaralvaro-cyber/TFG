// ============================================================
// gradcam.js — Visualización Grad-CAM 1D
// Formato: epochData.gradcam[layerName][classKey][seqIdx] = [float × seq_len]
// ============================================================

// Tabla de filtros relevantes
function renderGradCAMFilterTable(epochData, layerName, classKey) {
  const content  = document.getElementById('gradcamFilterTable');
  const rankData = epochData.gradcam_filters?.[layerName]?.[classKey];
  if (!rankData?.length) {
    content.innerHTML = '';
    return;
  }

  const top5   = rankData.slice(0, 5);
  const maxAlp = top5[0]?.alpha || 1;

  let html = `<div style="margin-top:16px">
    <p class="small text-muted">
      Top filtros por α<sub>k</sub> = |media espacial del gradiente| — promedio sobre el batch
    </p>
    <table class="table table-sm table-bordered" style="width:auto;font-size:12px">
      <thead>
        <tr><th>#</th><th>Filtro</th><th>αk</th><th>Importancia relativa</th></tr>
      </thead>
      <tbody>`;

  top5.forEach((item, i) => {
    const pct = maxAlp > 0 ? Math.round((item.alpha / maxAlp) * 100) : 0;
    html += `<tr>
      <td>${i + 1}</td>
      <td>Filter ${item.filter}</td>
      <td>${item.alpha.toFixed(6)}</td>
      <td><div style="background:#3498db;width:${pct}%;height:10px;border-radius:3px"></div></td>
    </tr>`;
  });

  html += '</tbody></table></div>';
  content.innerHTML = html;
}

// Render principal
async function renderGradCAM() {
  const content   = document.getElementById('gradcamContent');
  const epochFile = document.getElementById('gradcamEpochSelect')?.value;
  const layerName = document.getElementById('gradcamLayerSelect')?.value  || 'conv1d_1';
  const classKey  = document.getElementById('gradcamClassSelect')?.value  || 'nucleosome';
  const seqFilter = document.getElementById('gradcamClassFilter')?.value  || 'all';

  if (!epochFile) {
    content.innerHTML = '<p class="text-muted">Elegir época primero.</p>';
    document.getElementById('gradcamFilterTable').innerHTML = '';
    return;
  }

  const epochData = await ensureEpochLoaded(epochFile);
  if (!epochData) {
    content.innerHTML = '<p class="text-muted">Error al cargar datos.</p>';
    document.getElementById('gradcamFilterTable').innerHTML = '';
    return;
  }

  if (!epochData.gradcam?.[layerName]?.[classKey]) {
    content.innerHTML =
      '<p class="text-muted">Sin datos Grad-CAM. Regenera los JSONs con conv1d.py actualizado.</p>';
    document.getElementById('gradcamFilterTable').innerHTML = '';
    return;
  }

  const gcamData = epochData.gradcam[layerName][classKey];

  let seqEntries = Object.entries(gcamData)
    .map(([idx, imp]) => ({ idx: parseInt(idx), imp }))
    .sort((a, b) => a.idx - b.idx);

  if (seqFilter !== 'all') {
    const target = seqFilter === 'nucleosome' ? 'Nucleosome' : 'Non-Nucleosome';
    seqEntries   = seqEntries.filter(({ idx }) => sequenceLabels[idx] === target);
  }

  if (!seqEntries.length) {
    content.innerHTML = '<p class="text-muted">Sin secuencias para los filtros seleccionados.</p>';
    document.getElementById('gradcamFilterTable').innerHTML = '';
    return;
  }

  const currentConfig = `${layerName}-${classKey}-${seqFilter}-${epochFile}`;
  if (window._lastGradcamConfig !== currentConfig) {
      window._gradcamCurrentPage = 0;
      window._lastGradcamConfig = currentConfig;
  }

  const PAGE_SIZE = 20;
  const totalItems = seqEntries.length;
  const startIndex = window._gradcamCurrentPage * PAGE_SIZE;
  const pagedSeqEntries = seqEntries.slice(startIndex, startIndex + PAGE_SIZE);

  let rowsData = pagedSeqEntries.map(({ idx, imp }) => {
    const seq   = sequenceMap[idx];
    const label = sequenceLabels[idx];
    if (seq) {
      return {
        label: `Seq ${idx}`,
        seqOriginal: seq,
        seqLabel: label,
        combined: imp,
        method: 'single',
        selectedFilters: []
      };
    }
    return null;
  }).filter(Boolean);

  renderD3Heatmap('gradcamContent', rowsData);
  
  if (typeof renderPaginationControls === 'function') {
      renderPaginationControls('gradcamContent', totalItems, PAGE_SIZE, window._gradcamCurrentPage, (newPage) => {
          window._gradcamCurrentPage = newPage;
          renderGradCAM();
      });
  }

  renderGradCAMFilterTable(epochData, layerName, classKey);
}

// Poblar selector de épocas disponibles 
function populateGradCAMEpochSelect() {
  const sel = document.getElementById('gradcamEpochSelect');
  if (!sel) return;
  sel.innerHTML = '';
  availableEpochs.forEach(({ epoch, filename }) => {
    const opt = document.createElement('option');
    opt.value       = filename;
    opt.textContent = `Época ${epoch}`;
    sel.appendChild(opt);
  });
  if (availableEpochs.length > 0) sel.value = availableEpochs[0].filename;
}
