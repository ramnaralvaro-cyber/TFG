// ============================================================
// lime.js — Sección LIME: explicaciones locales de predicciones
// Carga lime_test_epoch_N.json generado por conv1d.py
// ============================================================

let _limeEpochCache = {};      // { filename: data }
let _limeAvailable  = [];      // [ { epoch, filename } ]

// Detectar archivos LIME disponibles (
async function detectLimeEpochs() {
    _limeAvailable = [];
    const checks = [];
    for (let epoch = 1; epoch <= 50; epoch++) {
        const filename = `lime_test_epoch_${epoch}.json`;
        checks.push(
            fetch((typeof DATA_PATH !== 'undefined' && DATA_PATH ? DATA_PATH : '') + filename, { method: 'HEAD' })
                .then(r => r.ok ? { epoch, filename } : null)
                .catch(() => null)
        );
    }
    const results = await Promise.all(checks);
    _limeAvailable = results.filter(Boolean);
    return _limeAvailable;
}

// Poblar selectores de época y secuencia
async function populateLimeSelectors(knownLimeEpochs) {
    // Si manifest.json ya reportó las épocas LIME, usarlas directamente
    if (Array.isArray(knownLimeEpochs) && knownLimeEpochs.length) {
        const base = (typeof DATA_PATH !== 'undefined' && DATA_PATH) ? DATA_PATH : '';
        _limeAvailable = knownLimeEpochs.map(epoch => ({
            epoch,
            filename: `lime_test_epoch_${epoch}.json`
        }));
    } else if (!_limeAvailable.length) {
        await detectLimeEpochs();
    }

    // Selector de época
    const epochSel = document.getElementById('limeEpochSelect');
    if (!epochSel) return;
    epochSel.innerHTML = '';
    _limeAvailable.forEach(({ epoch, filename }) => {
        const opt = document.createElement('option');
        opt.value = filename; opt.textContent = `Época ${epoch}`;
        epochSel.appendChild(opt);
    });
    if (_limeAvailable.length > 0) {
        epochSel.value = _limeAvailable[_limeAvailable.length - 1].filename;
        epochSel.disabled = false;
    }

    // Selector de secuencias (usar el mismo sequenceLabels/sequenceMap global)
    await _populateLimeSeqSelector();
}

async function _populateLimeSeqSelector() {
    const classFilter = document.getElementById('limeClassFilter')?.value || 'all';
    const epochFile   = document.getElementById('limeEpochSelect')?.value;
    const seqSel      = document.getElementById('limeSeqSelect');
    if (!seqSel || !epochFile) return;

    const data = await _loadLimeEpoch(epochFile);
    if (!data) return;

    const seqIds = Object.keys(data.sequences)
        .map(Number).sort((a, b) => a - b).map(String);

    seqSel.innerHTML = '';
    seqIds.forEach(sid => {
        const seqData = data.sequences[sid];
        if (!seqData) return;
        if (classFilter !== 'all') {
            const wantNuc = classFilter === 'nucleosome';
            if (wantNuc && seqData.true_label !== 'Nucleosome') return;
            if (!wantNuc && seqData.true_label !== 'Non-Nucleosome') return;
        }
        const opt = document.createElement('option');
        opt.value = sid;
        opt.textContent = `Seq ${sid} — ${seqData.true_label}`;
        seqSel.appendChild(opt);
    });
    seqSel.disabled = (seqSel.options.length === 0);
    if (seqSel.options.length > 0) {
        seqSel.value = seqSel.options[0].value;
    }
    renderLime();
}

async function _loadLimeEpoch(filename) {
    if (_limeEpochCache[filename]) return _limeEpochCache[filename];
    try {
        const r = await fetch((typeof DATA_PATH !== 'undefined' && DATA_PATH ? DATA_PATH : '') + filename);
        if (!r.ok) return null;
        const data = await r.json();
        _limeEpochCache[filename] = data;
        return data;
    } catch (e) {
        console.error('Error loading LIME:', e);
        return null;
    }
}

// Renderizar explicación LIME 
async function renderLime() {
    const content   = document.getElementById('limeContent');
    const epochFile = document.getElementById('limeEpochSelect')?.value;
    const seqId     = document.getElementById('limeSeqSelect')?.value;
    if (!epochFile || seqId === undefined || seqId === '') {
        content.innerHTML = '<p class="text-muted p-3">Selecciona época y secuencia.</p>';
        return;
    }

    content.innerHTML = '<p class="text-muted p-3"><i class="bi bi-hourglass-split me-1"></i>Cargando...</p>';
    const data = await _loadLimeEpoch(epochFile);
    if (!data) {
        content.innerHTML = '<p class="text-danger p-3">No se encontró el archivo LIME. Ejecuta conv1d.py con <code>--compute-lime</code>.</p>';
        return;
    }
    const seqData = data.sequences[seqId];
    if (!seqData) {
        content.innerHTML = '<p class="text-warning p-3">Secuencia no encontrada en los datos LIME.</p>';
        return;
    }

    content.innerHTML = '';

    // Panel superior con predicción y metadatos
    _renderLimePredictionPanel(content, seqData, seqId, data.epoch);

    // Mapa de importancia por posición (D3)
    _renderLimePositionMap(content, seqData, seqId);

    // Gráfico de barras por segmento (D3)
    _renderLimeSegmentBars(content, seqData);
}

// Panel de predicción y metadatos de la secuencia
function _renderLimePredictionPanel(container, d, seqId, epoch) {
    const pred = d.original_prediction;
    const pNuc = (pred.nucleosome * 100).toFixed(1);
    const pNon = (pred.non_nucleosome * 100).toFixed(1);
    const predClass = pred.nucleosome >= pred.non_nucleosome ? 'Nucleosome' : 'Non-Nucleosome';
    const correct   = predClass === d.true_label;
    const badgeCol  = d.true_label === 'Nucleosome' ? '#2ecc71' : '#e74c3c';
    const predCol   = predClass === 'Nucleosome'    ? '#2ecc71' : '#e74c3c';

    const panel = document.createElement('div');
    panel.style.cssText = 'display:flex;flex-wrap:wrap;gap:14px;align-items:flex-start;margin-bottom:16px;';

    // Metadatos
    const meta = document.createElement('div');
    meta.style.cssText = 'flex:1 1 260px;background:#f8f9fa;border:1px solid #dee2e6;border-radius:8px;padding:12px 16px;font-size:12px;';
    meta.innerHTML =
        `<div style="font-weight:700;font-size:13px;margin-bottom:8px;">
            <i class="bi bi-info-circle me-1 text-primary"></i>Secuencia ${seqId} — Época ${epoch}
        </div>` +
        `<div><span style="color:#888;">Clase real:</span>
            <span style="font-weight:700;color:${badgeCol};">&nbsp;${d.true_label}</span></div>` +
        `<div><span style="color:#888;">Predicción:</span>
            <span style="font-weight:700;color:${predCol};">&nbsp;${predClass}</span>
            ${correct
                ? '<span style="font-size:10px;background:#d4edda;color:#155724;padding:1px 5px;border-radius:3px;margin-left:4px;">✓</span>'
                : '<span style="font-size:10px;background:#f8d7da;color:#721c24;padding:1px 5px;border-radius:3px;margin-left:4px;">✗</span>'
            }
        </div>` +
        `<div><span style="color:#888;">Segmentos:</span> ${d.n_segments}</div>` +
        `<div><span style="color:#888;">Perturbaciones:</span> ${d.n_perturbations}</div>`;
    panel.appendChild(meta);

    // Probabilidades
    const probs = document.createElement('div');
    probs.style.cssText = 'flex:1 1 240px;background:#f8f9fa;border:1px solid #dee2e6;border-radius:8px;padding:12px 16px;';
    probs.innerHTML =
        `<div style="font-weight:700;font-size:13px;margin-bottom:10px;">
            <i class="bi bi-pie-chart me-1 text-primary"></i>Probabilidades del modelo
        </div>
        <div style="margin-bottom:6px;">
            <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px;">
                <span style="color:#2ecc71;font-weight:600;">Nucleosoma</span>
                <span>${pNuc}%</span>
            </div>
            <div style="background:#e9ecef;border-radius:4px;height:10px;">
                <div style="width:${pNuc}%;background:#2ecc71;height:10px;border-radius:4px;"></div>
            </div>
        </div>
        <div>
            <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px;">
                <span style="color:#e74c3c;font-weight:600;">No-nucleosoma</span>
                <span>${pNon}%</span>
            </div>
            <div style="background:#e9ecef;border-radius:4px;height:10px;">
                <div style="width:${pNon}%;background:#e74c3c;height:10px;border-radius:4px;"></div>
            </div>
        </div>`;
    panel.appendChild(probs);

    container.appendChild(panel);
}

// Mapa de importancia por posición (D3)
function _renderLimePositionMap(container, d, seqId) {
    const CW = 8, CH = 20, ML = 125, MR = 16, MT = 18, MB = 8;
    const seq    = d.seq_original;
    const pos_w  = d.position_weights;
    const seqLen = seq.length;
    const bounds = d.boundaries || [];

    const maxAbs = Math.max(...pos_w.map(Math.abs), 1e-9);
    const svgW = seqLen * CW + ML + MR;
    const svgH = CH + MT + MB;

    const title = document.createElement('div');
    title.style.cssText = 'font-weight:600;font-size:13px;margin-bottom:6px;color:#212529;';
    title.innerHTML = '<i class="bi bi-bar-chart-line me-1 text-success"></i>Mapa de importancia LIME por posición';
    container.appendChild(title);

    const legend = document.createElement('div');
    legend.style.cssText = 'display:flex;gap:16px;font-size:10px;margin-bottom:6px;';
    legend.innerHTML =
        '<span><span style="display:inline-block;width:12px;height:8px;background:#27ae60;border-radius:2px;"></span> Favorece Nucleosoma</span>' +
        '<span><span style="display:inline-block;width:12px;height:8px;background:#e74c3c;border-radius:2px;"></span> Favorece No-Nucleosoma</span>' +
        '<span style="color:#888;">Líneas grises = límites de segmento</span>';
    container.appendChild(legend);

    const wrap = document.createElement('div');
    wrap.style.cssText = 'overflow-x:auto;margin-bottom:16px;';
    container.appendChild(wrap);

    const COLORS = { A: '#2ecc71', C: '#3498db', G: '#f39c12', T: '#e74c3c' };

    const svg = d3.select(wrap).append('svg')
        .attr('width', svgW).attr('height', svgH);
    const g = svg.append('g').attr('transform', `translate(${ML},${MT})`);

    // Clase border coloreada
    const borderCol = d.true_label === 'Nucleosome'     ? '#2ecc71' : 
                      d.true_label === 'Non-Nucleosome' ? '#e74c3c' : '#aaa';
    
    g.append('rect')
      .attr('x', -6).attr('y', 0)
      .attr('width', 4).attr('height', CH)
      .attr('fill', typeof classColor === 'function' ? classColor(d.true_label) : borderCol);

    // Etiqueta de fila (Seq ID)
    if (seqId) {
      svg.append('text')
        .attr('x', ML - 10).attr('y', MT + CH / 2)
        .attr('text-anchor', 'end').attr('dominant-baseline', 'middle')
        .attr('font-size', '10px').attr('fill', '#333')
        .text(`Seq ${seqId}`);
    }

    // Eje X: marcas cada 10 pb
    for (let p = 0; p < seqLen; p += 10) {
        g.append('text')
            .attr('x', p * CW + CW / 2).attr('y', -5)
            .attr('text-anchor', 'middle').attr('font-size', '7px').attr('fill', '#aaa')
            .text(p);
    }

    // Etiqueta eje Y
    svg.append('text')
        .attr('transform', `translate(16, ${MT + CH / 2}) rotate(-90)`)
        .attr('text-anchor', 'middle').attr('font-size', '9px').attr('fill', '#666')
        .text('importancia');

    const tip = getOrCreateTooltip('lime-tip');

    // Rectángulos de importancia
    pos_w.forEach((w, pi) => {
        if (pi >= seqLen) return;
        const norm = w / maxAbs;  // [-1, 1]
        let r, gv, b;
        if (norm > 0) {
            // verde: positivo → nucleosoma
            const t = norm;
            r = Math.round(39 + (255 - 39) * (1 - t));
            gv = Math.round(174 + (255 - 174) * (1 - t));
            b = Math.round(96 + (255 - 96) * (1 - t));
        } else {
            // rojo: negativo → no-nucleosoma
            const t = -norm;
            r = Math.round(231 + (255 - 231) * (1 - t));
            gv = Math.round(76 + (255 - 76) * (1 - t));
            b = Math.round(60 + (255 - 60) * (1 - t));
        }
        const brightness = (0.299 * r + 0.587 * gv + 0.114 * b) / 255;
        const letter = seq[pi] || '';
        const cx = pi * CW;

        g.append('rect')
            .attr('x', cx).attr('y', 0)
            .attr('width', CW).attr('height', CH)
            .attr('fill', `rgb(${r},${gv},${b})`)
            .on('mouseover', (event) => {
                tip.style('opacity', 1)
                   .html(`<b>${letter}</b> pos:${pi}<br>w=${w.toFixed(4)}<br>${w > 0 ? '▲ Nucleosoma' : w < 0 ? '▼ No-nucleosoma' : 'neutro'}`);
            })
            .on('mousemove', (event) => {
                tip.style('left', (event.pageX + 12) + 'px')
                   .style('top',  (event.pageY - 28) + 'px');
            })
            .on('mouseout', () => tip.style('opacity', 0));

        g.append('text')
            .attr('x', cx + CW / 2).attr('y', CH / 2)
            .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
            .attr('font-size', '9px')
            .attr('font-family', "'JetBrains Mono', 'Fira Code', monospace")
            .attr('font-weight', '600')
            .attr('fill', brightness > 0.55 ? '#333' : '#fff')
            .attr('pointer-events', 'none')
            .text(letter);
    });

    // Líneas de límite de segmento
    bounds.forEach(([start]) => {
        if (start === 0) return;
        g.append('line')
            .attr('x1', start * CW).attr('y1', 0)
            .attr('x2', start * CW).attr('y2', CH)
            .attr('stroke', 'rgba(100,100,100,0.35)').attr('stroke-width', 1)
            .attr('stroke-dasharray', '3,2');
    });
}

// Gráfico de barras por segmento (D3)
function _renderLimeSegmentBars(container, d) {
    const weights  = d.segment_weights;
    const K        = weights.length;
    const maxAbs   = Math.max(...weights.map(Math.abs), 1e-9);
    const BAR_W    = Math.max(18, Math.min(48, 560 / K));
    const H_UP     = 70, H_DN = 70, MT = 10, MB = 20, ML = 125, MR = 16;
    const SVG_W    = K * BAR_W + ML + MR;
    const SVG_H    = H_UP + H_DN + MT + MB;

    const title = document.createElement('div');
    title.style.cssText = 'font-weight:600;font-size:13px;margin-top:8px;margin-bottom:6px;color:#212529;';
    title.innerHTML = '<i class="bi bi-bar-chart-steps me-1 text-warning"></i>Importancia por segmento (coeficientes Ridge)';
    container.appendChild(title);

    const wrap = document.createElement('div');
    wrap.style.cssText = 'overflow-x:auto;margin-bottom:20px;';
    container.appendChild(wrap);

    const tip = getOrCreateTooltip('lime-seg-tip');
    const svg = d3.select(wrap).append('svg').attr('width', SVG_W).attr('height', SVG_H);
    const g   = svg.append('g').attr('transform', `translate(${ML},${MT})`);

    // Línea base (y=0)
    g.append('line')
        .attr('x1', 0).attr('y1', H_UP)
        .attr('x2', K * BAR_W).attr('y2', H_UP)
        .attr('stroke', '#ccc').attr('stroke-width', 1);

    // Etiqueta eje Y
    svg.append('text')
        .attr('transform', `translate(-20, ${MT + H_UP}) rotate(-90)`)
        .attr('text-anchor', 'middle').attr('font-size', '9px').attr('fill', '#666')
        .text('contribución');

    weights.forEach((w, s) => {
        const isPos  = w >= 0;
        const norm   = Math.abs(w) / maxAbs;
        const barH   = norm * (isPos ? H_UP - 5 : H_DN - 5);
        const color  = isPos ? '#27ae60' : '#e74c3c';
        const x      = s * BAR_W + BAR_W * 0.1;
        const bw     = BAR_W * 0.8;
        const y      = isPos ? H_UP - barH : H_UP;

        g.append('rect')
            .attr('x', x).attr('y', y)
            .attr('width', bw).attr('height', barH)
            .attr('fill', color).attr('rx', 2)
            .on('mouseover', (event) => {
                tip.style('opacity', 1)
                   .html(`<b>Seg ${s}</b> pos:${d.boundaries?.[s]?.[0] ?? s * 10}–${d.boundaries?.[s]?.[1] ?? (s + 1) * 10}<br>w=${w.toFixed(5)}`);
            })
            .on('mousemove', (event) => {
                tip.style('left', (event.pageX + 12) + 'px')
                   .style('top',  (event.pageY - 28) + 'px');
            })
            .on('mouseout', () => tip.style('opacity', 0));

        // Etiqueta segmento
        g.append('text')
            .attr('x', s * BAR_W + BAR_W / 2).attr('y', H_UP + H_DN - 2)
            .attr('text-anchor', 'middle').attr('font-size', '8px').attr('fill', '#555')
            .text(`s${s}`);

        // Valor encima/debajo
        if (Math.abs(w) / maxAbs > 0.15) {
            g.append('text')
                .attr('x', s * BAR_W + BAR_W / 2)
                .attr('y', isPos ? y - 2 : y + barH + 8)
                .attr('text-anchor', 'middle').attr('font-size', '7px')
                .attr('fill', color).attr('font-weight', 'bold')
                .text(w.toFixed(3));
        }
    });
}
