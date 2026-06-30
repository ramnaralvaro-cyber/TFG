// filter_analysis.js — Análisis de filtros

let analysisListenersSetUp = false;

function populateAnalysisSelectors() {
    const epochSel = document.getElementById('analysisEpochSelect');
    epochSel.innerHTML = '<option value="">-- Elegir --</option>';
    availableEpochs.forEach(({ epoch, filename }) => {
        const opt = document.createElement('option');
        opt.value = filename; opt.textContent = `Época ${epoch}`;
        epochSel.appendChild(opt);
    });
    if (availableEpochs.length > 0) epochSel.value = availableEpochs[0].filename;

    if (analysisListenersSetUp) return;
    analysisListenersSetUp = true;

    document.getElementById('analysisEpochSelect').addEventListener('change', async function() {
        const layerSel   = document.getElementById('analysisLayerSelect').value;
        const firstLayer = layerSel === 'compare' ? 'conv1d_1' : layerSel;
        const epochData  = await ensureEpochLoaded(this.value);
        populateAnalysisFilterSelector(firstLayer, epochData);
    });

    document.getElementById('analysisLayerSelect').addEventListener('change', async function() {
        const epochFile  = document.getElementById('analysisEpochSelect').value;
        if (!epochFile) return;
        const epochData  = await ensureEpochLoaded(epochFile);
        const firstLayer = this.value === 'compare' ? 'conv1d_1' : this.value;
        populateAnalysisFilterSelector(firstLayer, epochData);
    });
}

function populateAnalysisFilterSelector(layerName, epochData) {
    const filterSel = document.getElementById('analysisFilterSelect');
    filterSel.innerHTML = '<option value="">Todos</option>';
    if (!epochData || !epochData.layers?.[layerName]) return;
    Object.keys(epochData.layers[layerName].filters)
        .sort((a, b) => parseInt(a) - parseInt(b))
        .forEach(filterId => {
            const opt = document.createElement('option');
            opt.value = filterId; opt.textContent = `Filter ${filterId}`;
            filterSel.appendChild(opt);
        });
}

async function renderAnalysis() {
    const content     = document.getElementById('analysisContent');
    const epochFile   = document.getElementById('analysisEpochSelect').value;
    const filterSel   = document.getElementById('analysisFilterSelect').value;
    const classFilter = document.getElementById('analysisClassFilter').value;
    const layerSel    = document.getElementById('analysisLayerSelect').value;
    const layerName   = (layerSel && layerSel !== 'compare') ? layerSel : 'conv1d_1';

    if (!epochFile) { content.innerHTML = '<p>Elegir época primero.</p>'; return; }

    const epochData = await ensureEpochLoaded(epochFile);
    if (!epochData) { content.innerHTML = '<p>Error al cargar datos.</p>'; return; }

    if (!epochData.filter_importance || !epochData.filter_importance[layerName]) {
        content.innerHTML = '<p style="color:#888;font-style:italic">Sin datos de importancia. Regenera el JSON con conv1d.py actualizado.</p>';
        return;
    }

    const fi             = epochData.filter_importance[layerName];
    const importanceData = fi.all !== undefined ? (fi[classFilter] ?? fi.all) : fi;
    const actualClass    = fi[classFilter] ? classFilter : 'all';

    if (!importanceData) {
        content.innerHTML = '<p style="color:#888;font-style:italic">Sin datos de importancia para esta capa.</p>';
        return;
    }

    const contributions = (layerName === 'conv1d_2' && epochData.conv1d2_contributions)
        ? epochData.conv1d2_contributions : null;

    renderMeanActivationTable(epochData, filterSel, actualClass, importanceData, layerName, contributions);
}

function renderMeanActivationTable(epochData, filterSel, classFilter, importanceData, layerName, contributions) {
    const content   = document.getElementById('analysisContent');
    const BARPX     = 380;
    const CLASS_LABEL = { all: 'Ambas clases', nucleosome: 'Nucleosomas', non_nucleosome: 'No-nucleosomas' };
    const showContrib = layerName === 'conv1d_2' && contributions !== null;

    let entries = Object.entries(importanceData)
        .map(([fid, vals]) => ({ fid, ...vals }))
        .sort((a, b) => b.mean_activation - a.mean_activation);

    if (filterSel) entries = entries.filter(e => e.fid === filterSel);

    if (entries.length > MAX_ANALYSIS_FILTERS) {
        entries = entries.slice(0, MAX_ANALYSIS_FILTERS);
        showMessage(`Vista limitada al top ${MAX_ANALYSIS_FILTERS} filtros.`, 'info');
    }

    const total  = Object.keys(importanceData).length;
    const nDead  = Object.values(importanceData).filter(v => v.is_dead).length;
    const maxVal = entries.length > 0 ? entries[0].mean_activation : 1;

    let html = `<p style="font-size:12px;color:#555;margin:0 0 8px">
        <strong>${layerName} Mean Activation</strong> — Época ${epochData.epoch} —
        <strong>${CLASS_LABEL[classFilter] ?? classFilter}</strong> —
        ${total} filtros <span style="color:#e74c3c">${nDead} muertos</span></p>`;

    html += `<table style="border-collapse:collapse;width:100%;max-width:780px;font-size:12px">
        <thead><tr>
            <th style="border:1px solid #ddd;padding:4px 8px;text-align:left">Rank</th>
            <th style="border:1px solid #ddd;padding:4px 8px;text-align:left">Filtro</th>
            <th style="border:1px solid #ddd;padding:4px 8px;text-align:right">Mean Act</th>
            <th style="border:1px solid #ddd;padding:4px 8px">vs. máx ${maxVal.toFixed(4)}</th>
            <th style="border:1px solid #ddd;padding:4px 8px;width:32px"></th>
            ${showContrib ? '<th style="border:1px solid #ddd;padding:4px 8px;text-align:left">Top conv1d_1</th>' : ''}
        </tr></thead><tbody>`;

    entries.forEach((entry, rank) => {
        const barPx    = maxVal > 0 ? Math.round(entry.mean_activation / maxVal * BARPX) : 0;
        const dimStyle = entry.is_dead ? 'color:#bbb' : '';
        const barColor = entry.is_dead ? '#ddd' : '#3498db';

        html += `<tr data-filter-id="${entry.fid}">
            <td style="border:1px solid #eee;padding:3px 8px;${dimStyle}">${rank + 1}</td>
            <td style="border:1px solid #eee;padding:3px 8px;font-family:monospace;${dimStyle}">Filter ${entry.fid}</td>
            <td style="border:1px solid #eee;padding:3px 8px;text-align:right;font-family:monospace;${dimStyle}">${entry.mean_activation.toFixed(6)}</td>
            <td style="border:1px solid #eee;padding:3px 8px">
                <div style="background:${barColor};height:10px;width:${barPx}px;border-radius:2px"></div>
            </td>`;

        if (showContrib) {
            const topFilters  = contributions[entry.fid];
            const tooltipText = topFilters.map((r, i) => {
                const val = r.contribution ?? r.correlation ?? 0;
                return `${i+1}. F${r.filter_id}: ${val.toFixed(4)}`;
            }).join('\n');
            const filterIds = topFilters.map(r => `F${r.filter_id}`).join('&nbsp;');
            html += `<td style="border:1px solid #eee;padding:3px 8px;font-family:monospace;font-size:11px;cursor:help;" title="${tooltipText}">${filterIds}</td>`;
        }

        const epochFile = document.getElementById('analysisEpochSelect')?.value || '';
        html += `<td style="border:1px solid #eee;padding:3px 6px;text-align:center;">
            <button class="analysis-heatmap-btn"
                    title="Ver activaciones de F${entry.fid} en Heatmap"
                    onclick="navigateToHeatmap('${entry.fid}','${classFilter}','${epochFile}')">
                <i class="bi bi-grid-3x3"></i></button></td>`;
        html += `</tr>`;
    });

    html += '</tbody></table>';
    content.innerHTML = html;
    applyAnalysisHighlight();
}

// ── Destacar filas cuando se llega desde el Heatmap ─────────
function applyAnalysisHighlight() {
    const nav = window._pendingHeatmapNavigation;
    if (!nav) return;

    var needsRerender = false;

    var classEl = document.getElementById('analysisClassFilter');
    if (classEl && nav.classFilter && classEl.value !== nav.classFilter) {
        classEl.value = nav.classFilter;
        needsRerender = true;
    }

    var epochSel = document.getElementById('analysisEpochSelect');
    if (epochSel && nav.epochFile && epochSel.value !== nav.epochFile) {
        var opt = Array.from(epochSel.options).find(function(o) { return o.value === nav.epochFile; });
        if (opt) { epochSel.value = nav.epochFile; needsRerender = true; }
    }

    if (needsRerender) {
        renderAnalysis();
        return;
    }

    window._pendingHeatmapNavigation = null;
    var filterIds = (nav.filterIds || []).map(String);
    if (!filterIds.length) return;

    function _hl() {
        var scrolled = false;
        document.querySelectorAll('#analysisContent tr[data-filter-id]').forEach(function(row) {
            var match = filterIds.indexOf(String(row.dataset.filterId)) >= 0;
            row.style.background    = match ? '#f0f5ff' : '';
            row.style.outline       = match ? '2px solid #0d6efd' : '';
            row.style.outlineOffset = match ? '-1px' : '';
            if (match && !scrolled) {
                row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                scrolled = true;
            }
        });
    }

    _hl();
    requestAnimationFrame(_hl);
    setTimeout(_hl, 150);
}

// navigateToHeatmap (scope global de motifs.js)
function navigateToHeatmap(filterId, classFilter, epochFile) {
    if (typeof window.navigateToHeatmap === 'function' && window.navigateToHeatmap !== navigateToHeatmap) {
        window.navigateToHeatmap(filterId, classFilter, epochFile);
        return;
    }
    window._pendingHeatmapFilter = {
        filterId: String(filterId), classFilter: classFilter || 'all', epochFile: epochFile || ''
    };
    const tabEl = document.querySelector('a[href="#tabHeatmap"]');
    if (tabEl) bootstrap.Tab.getOrCreateInstance(tabEl).show();
    requestAnimationFrame(() => {
        if (typeof _applyPendingHeatmapFilter === 'function') _applyPendingHeatmapFilter();
    });
}
