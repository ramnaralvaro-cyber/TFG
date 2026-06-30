// ============================================================
// ui_controls.js — Estado global, inicialización, selectores
// Con soporte de manifest.json por dataset para evitar
// escanear 50 archivos JSON en cada carga.
// ============================================================

// ── Límites Globales de Visualización (Rendimiento) ────────────
const MAX_DISPLAY_SEQUENCES  = 100;
const MAX_MOTIF_CARDS        = 50;
const MAX_CONCURRENT_FILTERS = 33;
const MAX_ANALYSIS_FILTERS   = 100;

// ── Dataset activo (leído de ?dataset=) ──────────────────────
const _urlParams = new URLSearchParams(window.location.search);
let DATASET = _urlParams.get('dataset');

if (!DATASET) {
    DATASET = localStorage.getItem('last_dataset') || '';
    if (DATASET) {
        const url = new URL(window.location.href);
        url.searchParams.set('dataset', DATASET);
        window.history.replaceState({}, '', url);
    }
} else {
    localStorage.setItem('last_dataset', DATASET);
}

const DATA_PATH = DATASET ? `../output_model/${DATASET}/` : null;

let currentData        = null;
let sequencesMetadata  = null;
let sequenceMap        = {};
let sequenceLabels     = {};
let availableEpochs    = [];
let loadedEpochs       = {};

// ── Event listeners ───────────────────────────────────────────
function setupEventListeners() {
    // Heatmap / Main UI
    document.getElementById('vizMode')?.addEventListener('change', handleModeChange);
    document.getElementById('seqSelect')?.addEventListener('change', updateLayerAndDisplay);
    document.getElementById('layerSelect')?.addEventListener('change', updateFilterSelectors);
    
    ['epochSelectSingle', 'epochSelectAllFilters', 'epochSelectCompareSeqs',
     'heatmapClassFilter', 'heatmapColormap', 'heatmapTopN',
     'heatmapThreshold', 'filterCombineMethod'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', (e) => {
            if (id === 'heatmapClassFilter') populateSequenceSelector();
            if (typeof renderVisualization === 'function') renderVisualization();
        });
    });
    
    document.getElementById('heatmapGamma')?.addEventListener('input', (e) => {
        const valInfo = document.getElementById('heatmapGammaVal');
        if (valInfo) valInfo.textContent = e.target.value;
        if (typeof renderVisualization === 'function') renderVisualization();
    });

    // Grad-CAM
    ['gradcamLayerSelect', 'gradcamEpochSelect', 'gradcamClassSelect', 'gradcamClassFilter'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', () => {
            if (typeof renderGradCAM === 'function') renderGradCAM();
        });
    });
    
    const debugBtn = document.querySelector('#tabGradCAM .btn-outline-secondary');
    if (debugBtn) debugBtn.addEventListener('click', () => {
        if (typeof debugGradCAM === 'function') debugGradCAM();
    });

    // Motifs
    ['motifsLayerSelect', 'motifsEpochSelect', 'motifsClassFilter', 'motifsHideNull'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', () => {
            if (typeof renderMotifs === 'function') renderMotifs();
        });
    });
    
    document.getElementById('motifThresholdSlider')?.addEventListener('input', (e) => {
        if (e.target.nextElementSibling) e.target.nextElementSibling.textContent = e.target.value + '%';
        if (typeof applyMotifThreshold === 'function') applyMotifThreshold();
    });

    // Analysis
    ['analysisEpochSelect', 'analysisLayerSelect', 'analysisFilterSelect', 'analysisClassFilter'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', () => {
            if (typeof renderAnalysis === 'function') renderAnalysis();
        });
    });

    // LIME
    ['limeEpochSelect', 'limeClassFilter'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', () => {
            if (typeof _populateLimeSeqSelector === 'function') _populateLimeSeqSelector();
        });
    });
    document.getElementById('limeSeqSelect')?.addEventListener('change', () => {
        if (typeof renderLime === 'function') renderLime();
    });

    // Features
    document.getElementById('featuresClassFilter')?.addEventListener('change', () => {
        if (typeof populateFeaturesSeqSelector === 'function') populateFeaturesSeqSelector();
    });
    document.getElementById('featuresSeqSelect')?.addEventListener('change', () => {
        if (typeof renderFeatureAnalysis === 'function') renderFeatureAnalysis();
    });

    // Navbar / Datasets
    document.getElementById('datasetSelect')?.addEventListener('change', e => switchDataset(e.target.value));

    // Tabs
    document.querySelectorAll('[data-bs-toggle="tab"]').forEach(tab => {
        tab.addEventListener('shown.bs.tab', e => {
            const target = e.target.getAttribute('href') || e.target.dataset.bsTarget;
            if (target === '#tabGradCAM')  { if (typeof renderGradCAM === 'function') renderGradCAM(); }
            if (target === '#tabMotifs')   { if (typeof renderMotifs === 'function') renderMotifs(); }
            if (target === '#tabAnalysis') { if (typeof renderAnalysis === 'function') renderAnalysis(); }
            if (target === '#tabFeatures') { if (typeof populateFeaturesSeqSelector === 'function') populateFeaturesSeqSelector(); }
        });
    });
    
    if (typeof renderIntroPage === 'function') renderIntroPage();
}

// ── Dataset system ────────────────────────────────────────────
function switchDataset(name) {
    if (!name) return;
    const url = new URL(window.location.href);
    url.searchParams.set('dataset', name);
    window.location.href = url.toString();
}

async function loadDatasetsManifest() {
    try {
        const r = await fetch('../output_model/datasets.json');
        if (r.ok) return await r.json();
    } catch (_) {}
    return null;
}

async function populateDatasetSelector() {
    const sel    = document.getElementById('datasetSelect');
    const banner = document.getElementById('datasetBanner');

    const manifest = await loadDatasetsManifest();
    if (!manifest || !sel) return manifest;

    const names = Array.isArray(manifest.datasets)
        ? manifest.datasets
        : Object.keys(manifest.datasets || {});

    if (!names.length) {
        sel.innerHTML = 'Sin datasets disponibles';
        sel.disabled  = true;
        return manifest;
    }

    sel.innerHTML = '-- Seleccionar dataset --';
    names.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        if (name === DATASET) opt.selected = true;
        sel.appendChild(opt);
    });
    sel.disabled = false;
    if (banner) banner.textContent = DATASET || '';
    return manifest;
}

// ── Inicialización ─────────────────────────────────────────────
async function initializeApp() {
    setupEventListeners();
    handleModeChange();

    const manifest = await populateDatasetSelector();

    let isDatasetValid = false;
    if (manifest) {
        const names = Array.isArray(manifest.datasets) ? manifest.datasets : Object.keys(manifest.datasets || {});
        if (DATASET && names.includes(DATASET)) {
            isDatasetValid = true;
        } else if (DATASET && !names.includes(DATASET)) {
            showMessage(`El dataset especificado '${DATASET}' no se encuentra registrado.`, 'error');
        }
    } else {
        if (DATASET) isDatasetValid = true; 
    }

    if (!isDatasetValid || !DATA_PATH) {
        if (!DATASET) showMessage('Bienvenido. Selecciona un dataset para comenzar su exploración.', 'info');
        setTabsEnabled(false);
        switchToSection('intro');
        return;
    }

    try {
        const r = await fetch(DATA_PATH + 'sequences_metadata_test.json');
        //const r = await fetch(DATA_PATH + 'sequences_metadata_valid.json'); // Alternativa: usar metadatos de validación
        //const r = await fetch(DATA_PATH + 'sequences_metadata_train.json'); // Alternativa: usar metadatos de entrenamiento
        if (r.ok) {
            sequencesMetadata = await r.json();
            let ignoredCount = 0;
            sequencesMetadata.sequences.forEach(seq => {
                const isValid = /^[ACGTacgt]+$/.test(seq.seq_original);
                if (isValid) {
                    sequenceMap[seq.sequence_idx]    = seq.seq_original.toUpperCase();
                    sequenceLabels[seq.sequence_idx] = seq.label_text;
                } else {
                    ignoredCount++;
                }
            });
            const loaded = Object.keys(sequenceMap).length;
            showMessage(`${loaded} secuencias cargadas`, 'success');
            if (ignoredCount > 0) {
                showMessage(`Se omitieron ${ignoredCount} secuencias por contener caracteres inválidos (distintos de A,C,G,T).`, 'warning');
            }
        } else {
            showMessage(`El dataset '${DATASET}' no contiene metadatos válidos o no existe (Error 404).`, 'error');
            setTabsEnabled(false);
            switchToSection('intro');
            return;
        }
    } catch (err) {
        showMessage(`Error metadatos: ${err.message}`, 'error');
        setTabsEnabled(false);
        switchToSection('intro');
        return;
    }

    await detectAvailableEpochs(manifest);
}

// ── Detección de épocas ────────────────────────────────────────
// Prioridad:
//   1. DATA_PATH/manifest.json  → { epochs: [1, 5, 10, ...] }
//   2. datasets.json            → { datasets: { nombre: { epochs: [...] } } }
//   3. Fallback: escaneo de 50 archivos por HEAD (lento)
async function detectAvailableEpochs(globalManifest) {
    let epochList   = null;
    let limeEpochs  = [];   // épocas con LIME disponible (de manifest.json)

    // 1. Manifest por dataset
    try {
        const r = await fetch(DATA_PATH + 'manifest.json');
        if (r.ok) {
            const m = await r.json();
            if (Array.isArray(m.epochs) && m.epochs.length) {
                epochList  = m.epochs;
                limeEpochs = Array.isArray(m.lime_epochs) ? m.lime_epochs : [];
                showMessage(`manifest.json: ${epochList.length} épocas`, 'info');
            }
        }
    } catch (_) {}

    // 2. Manifest global
    if (!epochList && globalManifest?.datasets &&
        !Array.isArray(globalManifest.datasets)) {
        const info = globalManifest.datasets[DATASET];
        if (Array.isArray(info?.epochs) && info.epochs.length) {
            epochList = info.epochs;
            showMessage(`datasets.json: ${epochList.length} épocas`, 'info');
        }
    }

    // 3. Fallback: escaneo paralelo
    if (!epochList) {
        showMessage('Buscando épocas disponibles (puede tardar)…', 'info');
        const checks = Array.from({ length: 50 }, (_, i) => {
            const epoch    = i + 1;
            const filename = `activations_test_epoch_${epoch}.json`;
            //const filename = `activations_valid_epoch_${epoch}.json`; // Alternativa: validar con archivos de validación
            //const filename = `activations_train_epoch_${epoch}.json`; // Alternativa: usar archivos de entrenamiento 
            return fetch(DATA_PATH + filename, { method: 'HEAD' })
                .then(r => r.ok ? { epoch, filename } : null)
                .catch(() => null);
        });
        const results   = await Promise.all(checks);
        availableEpochs = results.filter(Boolean);
    } else {
        availableEpochs = epochList.map(epoch => ({
            epoch,
            filename: `activations_test_epoch_${epoch}.json`
        }));
    }

    if (!availableEpochs.length) {
        showMessage('No se encontraron archivos de épocas. Dataset incompleto.', 'error');
        setTabsEnabled(false);
        switchToSection('intro');
        return;
    }

    showMessage(`${availableEpochs.length} épocas disponibles.`, 'success');
    setTabsEnabled(true);
    await loadFirstEpoch();
    populateEpochSelect();
    if (typeof populateAnalysisSelectors  === 'function') populateAnalysisSelectors();
    if (typeof populateMotifsSelectors    === 'function') populateMotifsSelectors();
    if (typeof populateLimeSelectors      === 'function') populateLimeSelectors(limeEpochs);
    if (typeof populateGradCAMEpochSelect === 'function') populateGradCAMEpochSelect();
    handleModeChange();

    // Auto-render inicial de todos los tabs
    if (typeof renderGradCAM  === 'function') renderGradCAM();
    if (typeof renderMotifs   === 'function') renderMotifs();
    if (typeof renderAnalysis === 'function') renderAnalysis();
}

// ── Cargar primera época ───────────────────────────────────────
async function loadFirstEpoch() {
    const { filename } = availableEpochs[0];
    try {
        const r = await fetch(DATA_PATH + filename);
        if (r.ok) {
            const data     = await r.json();
            currentData    = data;
            loadedEpochs[filename] = data;
            populateSequenceSelector();
            showMessage(`Época ${data.epoch} cargada`, 'success');
        } else {
            showMessage(`No se pudo cargar ${filename}`, 'error');
        }
    } catch (err) {
        showMessage(`Error al cargar primera época: ${err.message}`, 'error');
    }
}

// ── Poblar selectores de época ─────────────────────────────────
function populateEpochSelect() {
    ['epochSelectSingle', 'epochSelectAllFilters'].forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) return;
        sel.innerHTML = '';
        availableEpochs.forEach(({ epoch, filename }) => {
            const opt = document.createElement('option');
            opt.value = filename; opt.textContent = `Época ${epoch}`;
            sel.appendChild(opt);
        });
        if (availableEpochs.length > 0) {
            sel.value    = availableEpochs[0].filename;
            sel.disabled = false;
        }
    });
    populateEpochSelectCompareSeqs();
}

// ── Poblar selector de secuencias ──────────────────────────────
function populateSequenceSelector() {
    const seqSelect   = document.getElementById('seqSelect');
    const classFilter = document.getElementById('heatmapClassFilter').value;
    seqSelect.innerHTML = '-- Secuencia --';
    if (!currentData) return;

    const sequences = new Set();
    for (const layerName in currentData.layers) {
        const layer = currentData.layers[layerName];
        for (const filterId in layer.filters)
            for (const seqId in layer.filters[filterId].sequences)
                sequences.add(seqId);
    }

    let sorted = Array.from(sequences).sort((a, b) => parseInt(a) - parseInt(b));
    if (classFilter !== 'all') {
        const target = classFilter === 'nucleosome'     ? 'Nucleosome'
                     : classFilter === 'non_nucleosome' ? 'Non-Nucleosome' : null;
        sorted = sorted.filter(id => sequenceLabels[parseInt(id)] === target);
    }

    sorted.forEach(seqId => {
        const opt = document.createElement('option');
        opt.value = seqId;
        opt.textContent = `Seq ${seqId}`;
        seqSelect.appendChild(opt);
    });
    seqSelect.disabled = false;
    if (sorted.length > 0) {
        seqSelect.value = sorted[0];
        updateLayerAndDisplay();
    }
}

// ── Actualizar capas disponibles ───────────────────────────────
function updateLayerAndDisplay() {
    const seqId    = document.getElementById('seqSelect')?.value;
    if (!seqId || !currentData) {
        return;
    }

    const layers = new Set();
    for (const layerName in currentData.layers) {
        const layer = currentData.layers[layerName];
        for (const fid in layer.filters)
            if (seqId in layer.filters[fid].sequences) layers.add(layerName);
    }

    if (layers.size > 0) {
        updateFilterSelectors();
    }
}

// ── Actualizar overlay de filtros ──────────────────────────────
function updateFilterSelectors() {
    const layerName = 'conv1d_1';
    if (!layerName || !currentData) { disableAllFilterSelectors(); return; }

    const layer   = currentData.layers[layerName];
    const filters = Object.keys(layer.filters)
        .sort((a, b) => parseInt(a) - parseInt(b));

    populateFilterOverlayGrid(filters);
    populateEpochSelectCompareSeqs();

    if (typeof _applyPendingHeatmapFilter === 'function') {
        _applyPendingHeatmapFilter();
    }

    renderVisualization();
}

function disableAllFilterSelectors() {
    const grid = document.getElementById('filterOverlayGrid');
    if (grid) grid.innerHTML =
        '<span class="text-muted" style="font-size:11px;padding:6px;">'
        + 'Selecciona una capa para ver los filtros disponibles.</span>';
}

// ── Grid global de filtros overlay ─────────────────────────────
function populateFilterOverlayGrid(filterIds) {
    const grid = document.getElementById('filterOverlayGrid');
    if (!grid) return;

    const prevSelected = new Set(
        Array.from(grid.querySelectorAll('input[type=checkbox]:checked'))
            .map(cb => cb.value)
    );

    grid.innerHTML = '';

    const actions = document.createElement('div');
    actions.className = 'overlay-actions';
    actions.innerHTML = `<button onclick="selectAllOverlayFilters()" class="btn btn-xs btn-outline-secondary">Todos</button>
                         <button onclick="clearAllOverlayFilters()"  class="btn btn-xs btn-outline-secondary">Ninguno</button>`;
    grid.appendChild(actions);

    const cbWrap = document.createElement('div');
    cbWrap.className = 'overlay-checkbox-grid';
    filterIds.forEach(fid => {
        const isChecked = prevSelected.size === 0
            ? fid === filterIds[0]
            : prevSelected.has(fid);
        const lbl = document.createElement('label');
        lbl.className = 'overlay-cb-label';
        lbl.innerHTML = `<input type="checkbox" value="${fid}" ${isChecked ? 'checked' : ''}
                          onchange="handleFilterSelectionChange(this)"> F${fid}`;
        cbWrap.appendChild(lbl);
    });
    grid.appendChild(cbWrap);
}

function handleFilterSelectionChange(checkbox) {
    const checkedBoxes = document.querySelectorAll('#filterOverlayGrid input[type=checkbox]:checked');
    if (checkedBoxes.length > MAX_CONCURRENT_FILTERS) {
        checkbox.checked = false;
        showMessage(`Límite de ${MAX_CONCURRENT_FILTERS} filtros simultáneos alcanzado por rendimiento.`, 'warning');
        return;
    }
    renderVisualization();
}

function selectAllOverlayFilters() {
    let count = 0;
    document.querySelectorAll('#filterOverlayGrid input[type=checkbox]')
        .forEach(cb => { 
            if (count < MAX_CONCURRENT_FILTERS) {
                cb.checked = true; 
                count++;
            } else {
                cb.checked = false;
            }
        });
    if (count === MAX_CONCURRENT_FILTERS) {
        showMessage(`Solo se seleccionaron los primeros ${MAX_CONCURRENT_FILTERS} filtros por límite de rendimiento.`, 'warning');
    }
    renderVisualization();
}

function clearAllOverlayFilters() {
    document.querySelectorAll('#filterOverlayGrid input[type=checkbox]')
        .forEach(cb => { cb.checked = false; });
    renderVisualization();
}

// ── Selector de época para modo comparefilters ─────────────────
function populateCompareSequencesFilters(layerName) {
    populateEpochSelectCompareSeqs();
}

function populateEpochSelectCompareSeqs() {
    const sel = document.getElementById('epochSelectCompareSeqs');
    if (!sel) return;
    sel.innerHTML = '';
    availableEpochs.forEach(({ epoch, filename }) => {
        const opt = document.createElement('option');
        opt.value = filename; opt.textContent = `Época ${epoch}`;
        sel.appendChild(opt);
    });
    if (availableEpochs.length > 0) {
        sel.value    = availableEpochs[0].filename;
        sel.disabled = false;
    }
}

// ── Cambiar modo ───────────────────────────────────────────────
function handleModeChange() {
    const mode      = document.getElementById('vizMode')?.value;
    const layerName = 'conv1d_1';

    document.getElementById('singleFilterMode').style.display   = mode === 'single'         ? 'flex' : 'none';
    document.getElementById('compareFiltersMode').style.display = mode === 'comparefilters' ? 'flex' : 'none';
    document.getElementById('compareEpochsMode').style.display  = mode === 'compareepochs'  ? 'flex' : 'none';
    document.getElementById('allFiltersSeqMode').style.display  = mode === 'allfiltersseq'  ? 'flex' : 'none';

    const seqSelectGroup = document.getElementById('seqSelectGroup');
    if (seqSelectGroup) {
        if (mode === 'comparefilters') {
            seqSelectGroup.classList.remove('d-flex');
            seqSelectGroup.classList.add('d-none');
        } else {
            seqSelectGroup.classList.remove('d-none');
            seqSelectGroup.classList.add('d-flex');
        }
    }

    if (mode === 'comparefilters' && layerName) populateCompareSequencesFilters(layerName);
    renderVisualization();
}

// ── Cargar época con caché ─────────────────────────────────────
async function ensureEpochLoaded(filename) {
    if (loadedEpochs[filename]) return loadedEpochs[filename];
    try {
        const r = await fetch(DATA_PATH + filename);
        if (r.ok) {
            const data = await r.json();
            loadedEpochs[filename] = data;
            return data;
        }
    } catch (err) {
        showMessage(`Error cargando ${filename}: ${err.message}`, 'error');
    }
    return null;
}

// ── Utilidades ─────────────────────────────────────────────────
function updateContextInfo(info) {
    const box = document.getElementById('infoBox');
    const ctx = document.getElementById('contextInfo');
    if (box) box.style.display = 'block';
    if (ctx) ctx.textContent   = info;
}

function showMessage(msg, type) {
    console.log(`[${type}] ${msg}`);
    const container = document.getElementById('messageContainer');
    if (!container) return;
    const MAP = { success: 'alert-success', error: 'alert-danger',
                  info: 'alert-info',       warning: 'alert-warning' };
    const cls = MAP[type] || 'alert-secondary';
    const el  = document.createElement('div');
    el.className = `alert ${cls} alert-dismissible fade show py-1 px-3 mb-1`;
    el.style.fontSize = '12px';
    el.setAttribute('role', 'alert');
    el.innerHTML = `${msg}
        <button type="button" class="btn-close btn-close-sm" data-bs-dismiss="alert"></button>`;
    container.appendChild(el);
    if (type === 'success' || type === 'info') {
        setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 3000);
    }
}


// ── Bridge de compatibilidad con llamadas directas ───────────
// Llamado desde botones inline de filter_analysis.js
function navigateToHeatmap(filterId, classFilter, epochFile) {
  navigateTo('heatmap', {
    filters:     [String(filterId)],
    classFilter: classFilter || 'all',
    epoch:       epochFile    || null,
    fromSection: 'analysis',
  });
}


// ============================================================
// NAVEGACIÓN CONTEXTUAL
// ============================================================
const appState = {
  filters: [], classFilter: 'all', epoch: null, fromSection: null,
};
let _pendingHighlightFilters = [];
function consumePendingHighlights() {
  const f = [..._pendingHighlightFilters]; _pendingHighlightFilters = []; return f;
}
function setTabsEnabled(enabled) {
  const tabs = document.querySelectorAll('#mainTabs .nav-link:not([href="#tabIntro"])');
  tabs.forEach(tab => {
      if (enabled) tab.classList.remove('disabled');
      else tab.classList.add('disabled');
  });
}
function switchToSection(name) {
  const map = { heatmap:'#tabHeatmap', motifs:'#tabMotifs', intro:'#tabIntro',
                analysis:'#tabAnalysis', gradcam:'#tabGradCAM', lime:'#tabLime', features:'#tabFeatures' };
  const targetId = map[name];
  if (!targetId) return;

  const el = document.querySelector(`[data-bs-toggle="tab"][href="${targetId}"]`);
  if (el) {
      if (el.classList.contains('disabled')) {
          showMessage('Esta sección no está disponible sin un dataset válido.', 'warning');
          return;
      }
      bootstrap.Tab.getOrCreateInstance(el).show();
  }
}
function navigateTo(section, ctx = {}) {
  if (Array.isArray(ctx.filters))    appState.filters     = ctx.filters;
  if (ctx.classFilter !== undefined) appState.classFilter = ctx.classFilter;
  if (ctx.epoch       !== undefined) appState.epoch       = ctx.epoch;
  appState.fromSection = ctx.fromSection || section;
  if      (section === 'heatmap')  { _applyHeatmapContext();  switchToSection('heatmap');  setTimeout(() => renderVisualization(), 160); }
  else if (section === 'motifs')   { _applyMotifContext();    switchToSection('motifs');   }
  else if (section === 'analysis') { _applyAnalysisContext(); switchToSection('analysis'); }
  else                             { switchToSection(section); }
}
function _applyHeatmapContext() {
  const vm = document.getElementById('vizMode');
  if (vm) vm.value = 'comparefilters';
  // Mostrar panel compareFilters sin disparar render
  const panels = { singleFilterMode:false, compareFiltersMode:true, compareEpochsMode:false, allFiltersSeqMode:false };
  Object.entries(panels).forEach(([id,show]) => { const el = document.getElementById(id); if (el) el.style.display = show ? 'flex' : 'none'; });
  const sg = document.getElementById('seqSelectGroup');
  if (sg) { sg.classList.remove('d-flex'); sg.classList.add('d-none'); }
  const cf = document.getElementById('heatmapClassFilter');
  if (cf && appState.classFilter) cf.value = appState.classFilter;
  // Re-poblar épocas y luego fijar la del contexto
  if (typeof populateEpochSelectCompareSeqs === 'function') populateEpochSelectCompareSeqs();
  if (appState.epoch) {
    const ep = document.getElementById('epochSelectCompareSeqs');
    if (ep) { const o = ep.querySelector(`option[value="${appState.epoch}"]`); if (o) ep.value = appState.epoch; }
  }
  // Marcar checkboxes del filtro
  if (appState.filters.length) {
    document.querySelectorAll('#filterOverlayGrid input[type=checkbox]').forEach(cb => {
      cb.checked = appState.filters.includes(cb.value);
    });
  }
}
function _applyMotifContext() {
  const cf = document.getElementById('motifsClassFilter');
  if (cf && appState.classFilter) cf.value = appState.classFilter;
  if (appState.epoch) { const ep = document.getElementById('motifsEpochSelect'); if (ep) { const o = ep.querySelector(`option[value="${appState.epoch}"]`); if (o) ep.value = appState.epoch; } }
  _pendingHighlightFilters = [...appState.filters];
}
function _applyAnalysisContext() {
  const cf = document.getElementById('analysisClassFilter');
  if (cf && appState.classFilter) cf.value = appState.classFilter;
  if (appState.epoch) { const ep = document.getElementById('analysisEpochSelect'); if (ep) { const o = ep.querySelector(`option[value="${appState.epoch}"]`); if (o) ep.value = appState.epoch; } }
  _pendingHighlightFilters = [...appState.filters];
}
// Bridge para llamadas desde botones inline (filter_analysis.js)
function navigateToHeatmap(filterId, classFilter, epochFile) {
  navigateTo('heatmap', { filters:[String(filterId)], classFilter:classFilter||'all', epoch:epochFile||null, fromSection:'analysis' });
}

window.addEventListener('load', initializeApp);
