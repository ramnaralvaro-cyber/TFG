// ============================================================
// intro.js — Landing page / página de introducción
// ============================================================

function renderIntroPage() {
    const container = document.getElementById('introContent');
    if (!container) return;
    container.innerHTML = buildIntroHTML();
}

function buildIntroHTML() {
    return `
    <!-- ── Hero ──────────────────────────────────────────── -->
    <div class="intro-hero">
        <div class="intro-hero-icon">
            <i class="bi bi-diagram-3"></i>
        </div>
        <div>
            <h2 class="intro-hero-title">CNN 1D · Visualizador de activaciones</h2>
            <p class="intro-hero-sub">
                Sistema interactivo para explorar cómo una red neuronal clasifica secuencias de ADN. Analiza visualmente qué patrones biológicos detecta el modelo y qué regiones genómicas determinan sus decisiones.
            </p>
        </div>
    </div>

    <!-- ── Arquitectura ──────────────────────────────────── -->
    <div class="intro-section">
        <h5 class="intro-section-title">
            <i class="bi bi-cpu me-2 text-primary"></i>Arquitectura del modelo
        </h5>
        <p class="intro-text">
            El modelo analiza la Entrada (fragmentos de ADN) utilizando capas convolucionales (Conv1D_1 y Conv1D_2) que buscan patrones locales y sus combinaciones. A continuación, reduce esta información con capas MaxPool y la integra en una capa Dense para tomar decisiones globales. Finalmente, la Salida indica si la secuencia corresponde a un nucleosoma o no.
        </p>
        ${buildArchDiagram()}
    </div>

    <!-- ── Secciones del visualizador ────────────────────── -->
    <div class="intro-section">
        <h5 class="intro-section-title">
            <i class="bi bi-grid me-2 text-primary"></i>Secciones del visualizador
        </h5>
        <div class="intro-cards-grid">
            ${buildSectionCard('bi-grid-3x3', '#tabHeatmap', 'Heatmap de activaciones',
                '<strong>¿Qué regiones del ADN activan cada filtro?</strong><br>Explora visualmente cómo responden los distintos filtros del modelo ante secuencias específicas.',
                '#0d6efd')}
            ${buildSectionCard('bi-fire', '#tabGradCAM', 'Grad-CAM',
                '<strong>¿Qué posiciones del ADN son clave para la decisión final?</strong><br>Descubre qué regiones de la secuencia influyen más fuertemente en la predicción hacia una clase concreta.',
                '#dc3545')}
            ${buildSectionCard('bi-flower1', '#tabMotifs', 'Motifs aprendidos',
                '<strong>¿Qué patrones biológicos ha aprendido a detectar el modelo?</strong><br>Visualiza los logos de consenso que revelan qué combinaciones de letras busca internamente cada filtro.',
                '#198754')}
            ${buildSectionCard('bi-bar-chart-line', '#tabAnalysis', 'Análisis de filtros',
                '<strong>¿Cuáles son los filtros más importantes y cómo interactúan?</strong><br>Analiza la relevancia global de cada detector y descubre cómo se combinan entre las distintas capas.',
                '#fd7e14')}
            ${buildSectionCard('bi-lightbulb', '#tabLime', 'LIME (Explainer local)',
                '<strong>¿Cómo cambiaría la predicción si mutamos la secuencia?</strong><br>Evalúa la importancia de cada fragmento introduciendo perturbaciones aleatorias en la secuencia original.',
                '#ffc107')}
            ${buildSectionCard('bi-clipboard-data', '#tabFeatures', 'Características Base',
                '<strong>¿Qué propiedades estadísticas tiene el dataset original?</strong><br>Revisa las métricas y características biológicas básicas de las secuencias antes de ser procesadas por la red.',
                '#0dcaf0')}
        </div>
    </div>

    <!-- ── Conceptos clave ───────────────────────────────── -->
    <div class="intro-section">
        <h5 class="intro-section-title">
            <i class="bi bi-lightbulb me-2 text-primary"></i>Conceptos clave
        </h5>
        <div class="intro-concepts-grid">
            ${buildConceptChip('Activación',
                'Nivel de afinidad que muestra la red por una zona específica de la secuencia. Es como una señal de fluorescencia que se ilumina cuando el modelo localiza un patrón de interés en el ADN.')}
            ${buildConceptChip('Filtro (kernel)',
                'Detector especializado que escanea la secuencia en ventanas de 12 bases buscando patrones genéticos concretos. Actúan como sondas virtuales diseñadas para identificar características como promotores o zonas ricas en GC.')}
            ${buildConceptChip('Motif',
                'El patrón de consenso ideal que un filtro intenta localizar en el genoma. Se representa estadísticamente indicando la preferencia de bases (A, C, G o T) esperada en cada posición del detector.')}
            ${buildConceptChip('Época',
                'Cada ciclo de entrenamiento completo donde el modelo revisa todas las secuencias para mejorar su precisión. El sistema guarda el estado de la red en cada paso, lo que facilita observar cómo refina sus hallazgos biológicos con el tiempo.')}
            ${buildConceptChip('Grad-CAM',
                'Técnica que resalta las zonas de la secuencia que más peso han tenido para tomar la decisión de clasificación final. Funciona como un mapa de calor que señala directamente las regiones genómicas determinantes.')}
            ${buildConceptChip('Filtro muerto',
                'Un detector que ha dejado de responder a las secuencias de ADN y se ha vuelto inactivo. Equivale a una sonda estropeada que no encuentra ningún patrón útil y ya no contribuye a la predicción.')}
        </div>
    </div>

    <!-- ── Cómo empezar ──────────────────────────────────── -->
    <div class="intro-section mt-5">
        <h5 class="intro-section-title border-bottom pb-2">
            <i class="bi bi-play-circle me-2 text-primary"></i>Cómo empezar
        </h5>
        <div class="intro-text mt-3">
            <ol>
                <li><strong>Preparar datos:</strong> Ejecuta el script de entrenamiento para generar los ficheros JSON que necesita el visualizador.</li>
                <li><strong>Cargar dataset:</strong> Usa el menú desplegable superior "Dataset" para cargar los resultados disponibles.</li>
                <li><strong>Navegar:</strong> Utiliza las pestañas superiores o los botones de esta página para explorar las distintas herramientas.</li>
            </ol>
        </div>
    </div>
    `;
}

function buildArchDiagram() {
    const layers = [
        { label: 'Entrada', sub: '150 bp · one-hot\n(seq_len × 4)', color: '#6c757d', icon: 'bi-dna' },
        { label: 'Conv1D_1', sub: '32 filtros · kernel 12\nReLU · padding same', color: '#0d6efd', icon: 'bi-grid-3x3' },
        { label: 'MaxPool', sub: 'pool_size = 2\n(reduce a mitad)', color: '#6c757d', icon: 'bi-arrows-collapse' },
        { label: 'Conv1D_2', sub: '32 filtros · kernel 12\nReLU · padding same', color: '#6f42c1', icon: 'bi-grid-3x3' },
        { label: 'MaxPool', sub: 'pool_size = 2', color: '#6c757d', icon: 'bi-arrows-collapse' },
        { label: 'Flatten', sub: '', color: '#6c757d', icon: 'bi-list' },
        { label: 'Dense 128', sub: 'ReLU · Dropout 0.3', color: '#198754', icon: 'bi-diagram-2' },
        { label: 'Salida', sub: 'Softmax · 2 clases\nNucleosoma / No-nuc.', color: '#dc3545', icon: 'bi-bullseye' },
    ];

    const items = layers.map((l, i) => `
        <div class="arch-step" style="--arch-color:${l.color};">
            <div class="arch-box">
                <i class="bi ${l.icon} arch-icon"></i>
                <span class="arch-label">${l.label}</span>
                <span class="arch-sub">${l.sub.replace(/\n/g,'<br>')}</span>
            </div>
            ${i < layers.length - 1 ? '<div class="arch-arrow"><i class="bi bi-chevron-right"></i></div>' : ''}
        </div>
    `).join('');

    return `<div class="arch-diagram">${items}</div>
    <div class="arch-legend">
        <span class="arch-leg-item" style="color:#0d6efd;"><i class="bi bi-circle-fill me-1" style="font-size:8px"></i>Conv1D_1 — motifs locales (12 bp)</span>
        <span class="arch-leg-item" style="color:#6f42c1;"><i class="bi bi-circle-fill me-1" style="font-size:8px"></i>Conv1D_2 — combinaciones de motifs</span>
        <span class="arch-leg-item" style="color:#198754;"><i class="bi bi-circle-fill me-1" style="font-size:8px"></i>Dense — integración global</span>
    </div>`;
}

function buildSectionCard(icon, tabHref, title, desc, color) {
    return `
    <div class="intro-section-card" style="--card-accent:${color};">
        <div class="intro-section-card-head">
            <i class="bi ${icon}" style="color:${color};font-size:20px;"></i>
            <strong>${title}</strong>
        </div>
        <p class="intro-section-card-desc">${desc}</p>
        <button class="intro-nav-btn" onclick="switchToSection('${tabHref.replace('#tab', '').toLowerCase()}')">
            <i class="bi bi-arrow-right-circle me-1"></i>Ir a ${title.split(' ')[0]}
        </button>
    </div>`;
}

function buildConceptChip(term, definition) {
    return `
    <div class="intro-concept">
        <span class="intro-concept-term">${term}</span>
        <span class="intro-concept-def">${definition}</span>
    </div>`;
}
