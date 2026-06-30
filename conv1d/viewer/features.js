// ============================================================
// features.js — Análisis de características estructurales
// ============================================================

const BASES = ['A', 'C', 'G', 'T'];
const BASE_COLORS = { A: '#2ecc71', C: '#3498db', G: '#f39c12', T: '#e74c3c' };

// 1. Frecuencia de monómeros
function calcMonomerFrequencies(seq) {
    const counts = { A: 0, C: 0, G: 0, T: 0 };
    for (let i = 0; i < seq.length; i++) {
        const c = seq[i];
        if (counts[c] !== undefined) counts[c]++;
    }
    const len = seq.length;
    return {
        A: len ? counts.A / len : 0,
        C: len ? counts.C / len : 0,
        G: len ? counts.G / len : 0,
        T: len ? counts.T / len : 0
    };
}

// 2. Clustering
function calcLetterClustering(seq) {
    const res = { A: 0, C: 0, G: 0, T: 0 };
    BASES.forEach(nt => {
        const indices = [];
        for (let i = 0; i < seq.length; i++) {
            if (seq[i] === nt) indices.push(i);
        }
        if (indices.length < 2) { res[nt] = 0; return; }
        
        let sumD = 0;
        const dists = [];
        for (let i = 1; i < indices.length; i++) {
            const d = indices[i] - indices[i-1];
            dists.push(d);
            sumD += d;
        }
        
        const mean = sumD / dists.length;
        if (mean === 0) { res[nt] = 0; return; }
        
        let sumSq = 0;
        for (let d of dists) {
            sumSq += Math.pow(d - mean, 2);
        }
        const variance = sumSq / dists.length;
        const std = Math.sqrt(variance);
        res[nt] = std / mean;
    });
    return res;
}

// 3. Rachas y Huecos
function calcRunsAndGaps(seq) {
    const res = {};
    BASES.forEach(nt => {
        const runs = [];
        const gaps = [];
        let currentRun = 0;
        let currentGap = 0;
        let inRun = false;
        
        for (let i = 0; i < seq.length; i++) {
            if (seq[i] === nt) {
                if (!inRun && currentGap > 0) { gaps.push(currentGap); currentGap = 0; }
                inRun = true;
                currentRun++;
            } else {
                if (inRun && currentRun > 0) { runs.push(currentRun); currentRun = 0; }
                inRun = false;
                currentGap++;
            }
        }
        if (currentRun > 0) runs.push(currentRun);
        if (currentGap > 0 && runs.length > 0) gaps.push(currentGap);
        
        res[nt] = {
            max_run: runs.length ? Math.max(...runs) : 0,
            mean_run: runs.length ? runs.reduce((a,b)=>a+b,0)/runs.length : 0,
            num_runs: runs.length,
            max_gap: gaps.length ? Math.max(...gaps) : 0,
            mean_gap: gaps.length ? gaps.reduce((a,b)=>a+b,0)/gaps.length : 0
        };
    });
    return res;
}

// 4. HRI
// Proporción de distancias que son múltiplo de 10
function calcHRI(seq) {
    const res = {};
    BASES.forEach(n1 => BASES.forEach(n2 => {
        const dinuc = n1 + n2;
        const indices = [];
        for (let i = 0; i < seq.length - 1; i++) {
            if (seq[i] === n1 && seq[i+1] === n2) indices.push(i);
        }
        res[dinuc] = 0;
        if (indices.length < 2) return;
        
        let totalPairs = 0;
        let period10 = 0;
        for (let i = 0; i < indices.length; i++) {
            for (let j = i + 1; j < indices.length; j++) {
                const d = indices[j] - indices[i];
                totalPairs++;
                if (d % 10 === 0) period10++;
            }
        }
        if (totalPairs > 0) {
            res[dinuc] = period10 / totalPairs;
        }
    }));
    return res;
}

// 5. Frecuencia de dinucleótidos
function calcDinucleotideFrequencies(seq) {
    const counts = {};
    BASES.forEach(n1 => BASES.forEach(n2 => { counts[n1+n2] = 0; }));
    if (seq.length < 2) return counts;
    
    for (let i = 0; i < seq.length - 1; i++) {
        const d = seq.substring(i, i+2);
        if (counts[d] !== undefined) counts[d]++;
    }
    const total = seq.length - 1;
    for (let k in counts) counts[k] /= total;
    return counts;
}

// UI Integration

function populateFeaturesSeqSelector(delayRender = false) {
    const classFilter = document.getElementById('featuresClassFilter')?.value || 'all';
    const seqSel = document.getElementById('featuresSeqSelect');
    if (!seqSel || !sequenceMap) return;

    seqSel.innerHTML = '';
    const seqIds = Object.keys(sequenceMap).map(Number).sort((a,b)=>a-b).map(String);
    
    seqIds.forEach(sid => {
        const label = sequenceLabels[sid] || 'Unknown';
        if (classFilter !== 'all') {
            const wantNuc = classFilter === 'nucleosome';
            if (wantNuc && label !== 'Nucleosome') return;
            if (!wantNuc && label !== 'Non-Nucleosome') return;
        }
        const opt = document.createElement('option');
        opt.value = sid;
        opt.textContent = `Seq ${sid} — ${label}`;
        seqSel.appendChild(opt);
    });
    
    seqSel.disabled = (seqSel.options.length === 0);
    if (seqSel.options.length > 0) {
        seqSel.value = seqSel.options[0].value;
        if (!delayRender) renderFeatureAnalysis();
    }
}

function handleAnalyzeSequenceFromHeatmap(seqId) {
    // Navigate to Features tab
    const tabEl = document.querySelector('a[href="#tabFeatures"]');
    if (tabEl) bootstrap.Tab.getOrCreateInstance(tabEl).show();

    // Small delay to let DOM render
    setTimeout(() => {
        const seqSel = document.getElementById('featuresSeqSelect');
        const classFilter = document.getElementById('featuresClassFilter');
        if (classFilter) {
            classFilter.value = 'all';
            populateFeaturesSeqSelector(true);
        }
        if (seqSel) {
            seqSel.value = seqId;
        }
        renderFeatureAnalysis();
    }, 50);
}

function renderFeatureAnalysis() {
    const seqId = document.getElementById('featuresSeqSelect')?.value;
    const content = document.getElementById('featuresContent');
    if (!seqId || !sequenceMap[seqId]) {
        content.innerHTML = '<p class="text-muted p-3">Selecciona una secuencia válida.</p>';
        return;
    }
    
    const seq = sequenceMap[seqId];
    const label = sequenceLabels[seqId];
    
    // Calculate metrics
    const monomers = calcMonomerFrequencies(seq);
    const cv = calcLetterClustering(seq);
    const runsGaps = calcRunsAndGaps(seq);
    const dinucs = calcDinucleotideFrequencies(seq);
    const hri = calcHRI(seq);
    
    let html = `
    <div style="margin-bottom:16px; background:#f8f9fa; border:1px solid #dee2e6; border-radius:8px; padding:12px 16px;">
        <div style="font-weight:700;font-size:14px;margin-bottom:8px;">
            <i class="bi bi-card-text text-primary me-1"></i> Análisis estructural de la Seq ${seqId}
        </div>
        <div style="font-size:12px; color:#555;">
            <strong>Clase:</strong> <span style="color:${classColor(label)}">${label}</span> | 
            <strong>Longitud:</strong> ${seq.length} pb
        </div>
        <div style="font-family:monospace; font-size:10px; margin-top:10px; word-break:break-all; color:#888;">
            ${seq}
        </div>
    </div>
    
    <div class="row g-3">
        <!-- Izquierda -->
        <div class="col-md-6">
            <div class="card shadow-sm h-100">
                <div class="card-header bg-white font-weight-bold" style="font-size:13px;">
                    <i class="bi bi-pie-chart text-secondary me-1"></i> Frecuencia de Monómeros <i class="bi bi-info-circle ms-1" data-bs-toggle="tooltip" title="Porcentaje de presencia de cada base sobre el total de la secuencia."></i>
                </div>
                <div class="card-body">
                    ${renderMonomerBars(monomers)}
                </div>
            </div>
        </div>
        
        <div class="col-md-6">
            <div class="card shadow-sm h-100">
                <div class="card-header bg-white font-weight-bold" style="font-size:13px;">
                    <i class="bi bi-bullseye text-secondary me-1"></i> Clustering (CV de distancias) <i class="bi bi-info-circle ms-1" data-bs-toggle="tooltip" title="Desviación estándar de las distancias entre bases dividida por su media. Valores > 1 indican agrupamiento (clusters)."></i>
                </div>
                <div class="card-body">
                    ${renderCVTable(cv)}
                    <p class="text-muted mt-2 mb-0" style="font-size:10px;">Valores > 1 indican clustering (acumulación). Cerca de 1 es aleatorio.</p>
                </div>
            </div>
        </div>
        
        <!-- Centro -->
        <div class="col-12">
            <div class="card shadow-sm">
                <div class="card-header bg-white font-weight-bold" style="font-size:13px;">
                    <i class="bi bi-bar-chart-line text-secondary me-1"></i> Rachas (Runs) <i class="bi bi-info-circle ms-1" data-bs-toggle="tooltip" title="Segmentos consecutivos de la misma base."></i> y Huecos (Gaps) <i class="bi bi-info-circle ms-1" data-bs-toggle="tooltip" title="Distancia en nucleótidos entre dos rachas de la misma base."></i>
                </div>
                <div class="card-body">
                    ${renderRunsGapsTable(runsGaps)}
                </div>
            </div>
        </div>

        <!-- Derecha / Abajo -->
        <div class="col-md-6">
            <div class="card shadow-sm h-100">
                <div class="card-header bg-white font-weight-bold" style="font-size:13px;">
                    <i class="bi bi-grid-3x2 text-secondary me-1"></i> Frecuencia de Dinucleótidos
                </div>
                <div class="card-body">
                    ${renderDinucHeatmap(dinucs, false)}
                </div>
            </div>
        </div>

        <div class="col-md-6">
            <div class="card shadow-sm h-100">
                <div class="card-header bg-white font-weight-bold" style="font-size:13px;">
                    <i class="bi bi-arrow-repeat text-secondary me-1"></i> HRI (Periodicidad dist. múltiplo de 10) <i class="bi bi-info-circle ms-1" data-bs-toggle="tooltip" title="Proporción de pares de dinucleótidos cuya distancia es múltiplo de 10pb, indicando periodicidad estructural."></i>
                </div>
                <div class="card-body">
                    ${renderDinucHeatmap(hri, true)}
                </div>
            </div>
        </div>
    </div>
    `;
    
    content.innerHTML = html;

    // Inicializar tooltips de Bootstrap
    [...content.querySelectorAll('[data-bs-toggle="tooltip"]')].forEach(el => new bootstrap.Tooltip(el));
}

function renderMonomerBars(monos) {
    let html = '';
    BASES.forEach(nt => {
        const val = (monos[nt] * 100).toFixed(1);
        html += `
        <div style="margin-bottom:8px;">
            <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:2px;">
                <span style="font-weight:600; color:${BASE_COLORS[nt]};">${nt}</span>
                <span>${val}%</span>
            </div>
            <div class="progress" style="height:8px;">
                <div class="progress-bar" style="width:${val}%; background-color:${BASE_COLORS[nt]};"></div>
            </div>
        </div>`;
    });
    return html;
}

function renderCVTable(cv) {
    let html = `<table class="table table-sm table-borderless" style="font-size:12px; margin-bottom:0;">
        <thead><tr style="border-bottom:1px solid #eee;"><th>Base</th><th>Índice de Dispersión (CV)</th><th>Distribución</th></tr></thead>
        <tbody>`;
    BASES.forEach(nt => {
        const val = cv[nt];
        const barW = Math.min(100, val * 30);
        html += `<tr>
            <td style="font-weight:600; color:${BASE_COLORS[nt]}">${nt}</td>
            <td>${val.toFixed(3)}</td>
            <td>
                <div style="background:#f0f0f0; width:100px; height:8px; border-radius:2px; margin-top:6px;">
                    <div style="background:#555; width:${barW}px; height:8px; border-radius:2px;"></div>
                </div>
            </td>
        </tr>`;
    });
    html += `</tbody></table>`;
    return html;
}

function renderRunsGapsTable(rg) {
    let html = `<div class="table-responsive"><table class="table table-sm text-center" style="font-size:11px; margin-bottom:0;">
        <thead style="background:#f8f9fa;">
            <tr>
                <th class="text-start">Base</th>
                <th>Total de Rachas</th><th>Longitud Promedio</th><th>Racha Máxima</th>
                <th style="border-left:1px solid #dee2e6;">Total de Espacios</th><th>Hueco Promedio</th><th>Hueco Máximo</th>
            </tr>
        </thead>
        <tbody>`;
    BASES.forEach(nt => {
        const data = rg[nt];
        html += `<tr>
            <td class="text-start font-weight-bold" style="color:${BASE_COLORS[nt]}; font-weight:600;">${nt}</td>
            <td>${data.num_runs}</td><td>${data.mean_run.toFixed(2)}</td><td>${data.max_run}</td>
            <td style="border-left:1px solid #dee2e6;">${data.num_runs - 1}</td><td>${data.mean_gap.toFixed(2)}</td><td>${data.max_gap}</td>
        </tr>`;
    });
    html += `</tbody></table></div>`;
    return html;
}

function renderDinucHeatmap(metrics, bgNorm) {
    let html = `<div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:4px;">`;
    
    // Find absolute max for color scaling
    let maxVal = 0;
    for (let k in metrics) if (metrics[k] > maxVal) maxVal = metrics[k];
    
    BASES.forEach(n1 => {
        BASES.forEach(n2 => {
            const val = metrics[n1+n2];
            let norm = maxVal > 0 ? val / maxVal : 0;
            // Background color intensity depending on norm
            const bgDec = Math.round(255 - (norm * 100)); // from white to light blue
            const bg = `rgb(${bgDec}, ${bgDec}, 255)`;
            const textCol = norm > 0.6 ? '#fff' : '#333';
            const tooltipAttr = bgNorm ? ` data-bs-toggle="tooltip" title="Frecuencia de repetición cada 10 pares de bases para ${n1}${n2}"` : '';
            
            html += `<div style="background:${bg}; border:1px solid #dee2e6; border-radius:4px; padding:6px; text-align:center;"${tooltipAttr}>
                <div style="font-weight:700; font-size:11px; color:#555;">${n1}${n2}</div>
                <div style="font-size:10px; font-family:monospace; color:${textCol};">${bgNorm ? val.toFixed(3) : (val*100).toFixed(1)+'%'}</div>
            </div>`;
        });
    });
    html += `</div>`;
    return html;
}
