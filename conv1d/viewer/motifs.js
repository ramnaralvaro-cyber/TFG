// motifs.js — Motifs: composición nucleotídica por filtro

let currentLayerForMotif = 'conv1d_1';
let _lastMotifFilters = [];

function populateMotifsSelectors() {
    const epochSel = document.getElementById('motifsEpochSelect');
    epochSel.innerHTML = '<option value="">-- Elegir --</option>';
    availableEpochs.forEach(({ epoch, filename }) => {
        const opt = document.createElement('option');
        opt.value = filename; opt.textContent = `Época ${epoch}`;
        epochSel.appendChild(opt);
    });
    if (availableEpochs.length > 0) epochSel.value = availableEpochs[0].filename;
}

async function renderMotifs() {
    const layerName   = 'conv1d_1';
    const epochFile   = document.getElementById('motifsEpochSelect').value;
    const hideNull    = document.getElementById('motifsHideNull').checked;
    const classFilter = document.getElementById('motifsClassFilter').value;
    const content     = document.getElementById('motifsContent');

    if (!epochFile) { content.innerHTML = '<p>Elegir época primero.</p>'; return; }

    const epochData = await ensureEpochLoaded(epochFile);
    if (!epochData || !epochData.motifs) {
        content.innerHTML = '<p>Sin datos de motifs. Regenera con conv1d.py actualizado.</p>';
        return;
    }

    const motifLayer = epochData.motifs?.[layerName];
    const motifData  = motifLayer?.all !== undefined ? motifLayer[classFilter] : motifLayer;

    if (!motifData) {
        content.innerHTML = '<p>Sin datos de motifs para esta capa/época.</p>';
        return;
    }

    let filters = Object.keys(motifData).map(fid => ({ fid, motif: motifData[fid] }));
    if (hideNull) filters = filters.filter(f => f.motif !== null);
    filters.sort((a, b) => +a.fid - +b.fid);

    if (filters.length > MAX_MOTIF_CARDS) {
        filters = filters.slice(0, MAX_MOTIF_CARDS);
        showMessage(`Mostrando primeros ${MAX_MOTIF_CARDS} motifs por rendimiento.`, 'info');
    }

    currentLayerForMotif = layerName;
    _lastMotifFilters    = filters;
    content.innerHTML    = filters.map(({ fid, motif }) => buildMotifCard(fid, motif)).join('');
    applyMotifHighlight();
}

function buildMotifCard(fid, motif) {
    if (!motif) {
        return `<div class="motif-card">
            <h4>Filter ${fid}</h4>
            <div class="motif-null">Sin fragmentos válidos para este filtro</div>
        </div>`;
    }

    const COLORS    = { A: '#2ecc71', C: '#3498db', G: '#f39c12', T: '#e74c3c' };
    const sliderEl  = document.getElementById('motifThresholdSlider');
    const THRESHOLD = sliderEl ? sliderEl.value / 100 : 0.8;
    const consensus = motif.positions.map(p => {
        const b   = p.dominant;
        const pct = p[b];
        if (pct >= THRESHOLD) {
            return '<span style="display:inline-block;width:14px;text-align:center;' +
                `background:${COLORS[b]};color:#fff;font-weight:bold;` +
                'border-radius:2px;font-family:monospace;font-size:10px;margin:1px;">' +
                `${b}</span>`;
        } else {
            return '<span style="display:inline-block;width:14px;text-align:center;' +
                `color:${COLORS[b]};font-weight:normal;` +
                'font-family:monospace;font-size:10px;margin:1px;">' +
                `${b}</span>`;
        }
    }).join('');

    const _classFilter = document.getElementById('motifsClassFilter')?.value || 'all';
    const _epochFile   = document.getElementById('motifsEpochSelect')?.value   || '';

    return `<div class="motif-card" data-filter-id="${fid}"
                 style="position:relative;min-width:180px;cursor:pointer;"
                 onclick="openMotifModal('${fid}', currentLayerForMotif)">
        <span class="motif-hl-badge"
              style="display:none;position:absolute;top:4px;left:8px;
                     font-size:9px;color:#0d6efd;font-weight:700;
                     background:#e0ecff;padding:1px 6px;border-radius:3px;
                     pointer-events:none;z-index:2;">← Heatmap</span>
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
            <h4 style="margin:0;">Filter ${fid}
                <span style="font-weight:normal;font-size:11px;color:#888;margin-left:6px;display:inline-block;">
                    n=${motif.n_sequences} | len=${motif.max_length}
                </span>
            </h4>
            <button class="motif-heatmap-btn"
                    title="Ver activaciones en Heatmap"
                    onclick="event.stopPropagation(); navigateToHeatmap('${fid}', '${_classFilter}', '${_epochFile}')">
                <i class="bi bi-grid-3x3"></i>
            </button>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:1px;">${consensus}</div>
    </div>`;
}

function applyMotifThreshold() {
    if (!_lastMotifFilters.length) return;
    const content = document.getElementById('motifsContent');
    content.innerHTML = _lastMotifFilters
        .map(({ fid, motif }) => buildMotifCard(fid, motif))
        .join('');
}

// ── Destacar cards al llegar desde el Heatmap ───────────────
// No consume _pendingHeatmapNavigation hasta que los datos son correctos.
function applyMotifHighlight() {
    const nav = window._pendingHeatmapNavigation;
    if (!nav) return;

    // 1. Sincronizar selectores; re-renderizar si algo cambió
    var needsRerender = false;

    var classEl = document.getElementById('motifsClassFilter');
    if (classEl && nav.classFilter && classEl.value !== nav.classFilter) {
        classEl.value = nav.classFilter;
        needsRerender = true;
    }

    var epochSel = document.getElementById('motifsEpochSelect');
    if (epochSel && nav.epochFile && epochSel.value !== nav.epochFile) {
        var opt = Array.from(epochSel.options).find(function(o) { return o.value === nav.epochFile; });
        if (opt) { epochSel.value = nav.epochFile; needsRerender = true; }
    }

    if (needsRerender) {
        // Nav sigue seteado — renderMotifs lo leerá al terminar
        renderMotifs();
        return;
    }

    // 2. Datos correctos: consumir y aplicar highlight
    window._pendingHeatmapNavigation = null;
    var filterIds = (nav.filterIds || []).map(String);
    if (!filterIds.length) return;

    function _hl() {
        var first = null;
        document.querySelectorAll('.motif-card').forEach(function(card) {
            var fid = String(
                card.dataset.filterId !== undefined ? card.dataset.filterId
                : card.dataset.filter  !== undefined ? card.dataset.filter : ''
            );
            var on = filterIds.indexOf(fid) >= 0;
            card.style.border     = on ? '2px solid #0d6efd' : '';
            card.style.boxShadow  = on ? '0 0 0 3px rgba(13,110,253,.18)' : '';
            card.style.background = on ? '#f0f5ff' : '';
            card.style.paddingTop = on ? '24px' : '';
            var badge = card.querySelector('.motif-hl-badge');
            if (badge) badge.style.display = on ? 'inline-block' : 'none';
            if (on && !first) first = card;
        });
        if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    _hl();
    requestAnimationFrame(_hl);
    setTimeout(_hl, 150);
}

function openMotifModal(fid, layerName) {
    const epochFile   = document.getElementById('motifsEpochSelect').value;
    const classFilter = document.getElementById('motifsClassFilter').value;
    const epochData   = loadedEpochs[epochFile];
    const motifLayer  = epochData?.motifs?.[layerName];
    const motifData   = motifLayer?.all !== undefined ? motifLayer[classFilter] : motifLayer;

    if (!motifData || !motifData[fid]) return;
    const motif = motifData[fid];

    const BASES  = ['A','C','G','T'];
    const COLORS = { A:'#2ecc71', C:'#3498db', G:'#f39c12', T:'#e74c3c' };

    const headerCells = motif.positions.map((_, i) =>
        `<th style="text-align:center;min-width:28px;font-weight:normal;color:#666;font-size:10px;">${i+1}</th>`
    ).join('');

    const tableRows = BASES.map(b => {
        const cells = motif.positions.map(p => {
            const pct   = (p[b]*100).toFixed(1);
            const isMax = p.dominant === b;
            return `<td style="text-align:center;font-size:10px;${isMax
                ? `font-weight:bold;color:${COLORS[b]};background:#f9f9f9`
                : 'color:#555'}">${pct}</td>`;
        }).join('');
        return `<tr><td style="padding:2px 6px;background:${COLORS[b]};color:#fff;font-weight:bold;font-size:11px;border-radius:2px;white-space:nowrap">${b}</td>${cells}</tr>`;
    }).join('');

    const nRow = `<tr style="border-top:2px solid #ddd">
        <td style="font-size:9px;color:#888;padding:2px 4px">n</td>
        ${motif.positions.map(p => `<td style="text-align:center;font-size:9px;color:#888">${p.n}</td>`).join('')}
    </tr>`;

    const THRESHOLD = 0.8;
    const consensus = motif.positions.map(p => {
        const b = p.dominant;
        if (p[b] >= THRESHOLD)
            return `<span style="display:inline-block;width:18px;text-align:center;background:${COLORS[b]};color:#fff;font-weight:bold;border-radius:2px;margin:1px;font-family:monospace;font-size:12px">${b}</span>`;
        return `<span style="display:inline-block;width:18px;text-align:center;color:${COLORS[b]};font-weight:normal;border-radius:2px;margin:1px;font-family:monospace;font-size:12px">${b}</span>`;
    }).join('');

    let modal = document.getElementById('motifDetailModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'motifDetailModal';
        modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.55);z-index:9999;display:flex;align-items:center;justify-content:center;';
        modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
    <div style="background:#fff;border-radius:8px;padding:22px;max-width:92vw;max-height:85vh;overflow:auto;box-shadow:0 4px 24px rgba(0,0,0,0.3)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <h3 style="margin:0">Filter ${fid} — ${layerName}</h3>
            <button onclick="document.getElementById('motifDetailModal').remove()"
                    style="background:none;border:none;font-size:20px;cursor:pointer">×</button>
        </div>
        <p style="margin:0 0 10px;color:#666;font-size:12px">${motif.n_sequences} secuencias — longitud máx. ${motif.max_length}</p>
        <div style="margin-bottom:8px;display:flex;gap:1px;flex-wrap:nowrap">${consensus}</div>
        <div style="overflow-x:auto">
            <table style="border-collapse:collapse;width:100%">
                <thead><tr><th style="min-width:20px"></th>${headerCells}</tr></thead>
                <tbody>${tableRows}${nRow}</tbody>
            </table>
        </div>
    </div>`;
}

function navigateToHeatmap(filterId, classFilter, epochFile) {
    window._pendingHeatmapFilter = {
        filterId   : String(filterId),
        classFilter: classFilter || 'all',
        epochFile  : epochFile   || ''
    };
    const tabEl = document.querySelector('a[href="#tabHeatmap"]');
    if (tabEl) bootstrap.Tab.getOrCreateInstance(tabEl).show();
    requestAnimationFrame(function() { _applyPendingHeatmapFilter(); });
}

function _applyPendingHeatmapFilter() {
    const p = window._pendingHeatmapFilter;
    if (!p) return;
    const checkboxes = document.querySelectorAll('#filterOverlayGrid input[type=checkbox]');
    if (!checkboxes.length) return;
    window._pendingHeatmapFilter = null;

    const vizMode = document.getElementById('vizMode');
    if (vizMode) vizMode.value = 'comparefilters';

    ['singleFilterMode','compareEpochsMode','allFiltersSeqMode'].forEach(id => {
        const el = document.getElementById(id); if (el) el.style.display = 'none';
    });
    const cfPanel = document.getElementById('compareFiltersMode');
    if (cfPanel) cfPanel.style.display = 'flex';
    const sg = document.getElementById('seqSelectGroup');
    if (sg) sg.style.display = 'none';

    const classEl = document.getElementById('heatmapClassFilter');
    if (classEl) classEl.value = p.classFilter;

    checkboxes.forEach(function(cb) { cb.checked = cb.value === p.filterId; });

    if (p.epochFile) {
        if (typeof populateEpochSelectCompareSeqs === 'function') populateEpochSelectCompareSeqs();
        const epochSel = document.getElementById('epochSelectCompareSeqs');
        if (epochSel) {
            const opt = Array.from(epochSel.options).find(o => o.value === p.epochFile);
            if (opt) epochSel.value = p.epochFile;
        }
        ['epochSelectSingle','epochSelectAllFilters'].forEach(id => {
            const el = document.getElementById(id);
            if (el) { const opt = Array.from(el.options).find(o => o.value === p.epochFile); if (opt) el.value = p.epochFile; }
        });
    }

    if (typeof renderVisualization === 'function') renderVisualization();
}
