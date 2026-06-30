// ============================================================
// utils.js — Utilidades Compartidas y Componentes Visuales
// ============================================================

/**
 * Genera o recupera un tooltip global D3.
 * @param {string} id - Id del elemento DOM
 * @returns {d3.Selection}
 */
window.getOrCreateTooltip = function(id) {
    let t = d3.select(`#${id}`);
    if (t.empty()) {
        t = d3.select('body').append('div')
            .attr('id', id)
            .attr('class', 'viz-tooltip')
            .style('opacity', 0);
    }
    return t;
};

/**
 * Renderiza los controles de paginación para conjuntos de datos grandes.
 * @param {string} containerId - Elemento contenedor
 * @param {number} totalItems - Número total de elementos
 * @param {number} pageSize - Elementos por página
 * @param {number} currentPage - Página actual (0-indexada)
 * @param {Function} onPageChange - Callback al cambiar de página
 */
window.renderPaginationControls = function(containerId, totalItems, pageSize, currentPage, onPageChange) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    // Primero, si ya existe un control antiguo, lo eliminamos
    const prevControl = container.querySelector('.pagination-controls-wrap');
    if (prevControl) prevControl.remove();

    const totalPages = Math.ceil(totalItems / pageSize);
    if (totalPages <= 1) return;

    let wrap = document.createElement('div');
    wrap.className = 'pagination-controls-wrap d-flex justify-content-center mt-3 gap-2 align-items-center pb-2';

    var prevDisabled = currentPage === 0 ? 'disabled' : '';
    var nextDisabled = currentPage === totalPages - 1 ? 'disabled' : '';
    wrap.innerHTML = '<button class="btn btn-sm btn-outline-primary" ' + prevDisabled + ' data-action="prev">' +
                     '<i class="bi bi-chevron-left"></i> Anterior' +
                     '</button>' +
                     '<span class="text-secondary" style="font-size:13px; font-weight: 500;">Página ' + (currentPage + 1) + ' de ' + totalPages + '</span>' +
                     '<button class="btn btn-sm btn-outline-primary" ' + nextDisabled + ' data-action="next">' +
                     'Siguiente <i class="bi bi-chevron-right"></i>' +
                     '</button>';

    wrap.querySelector('[data-action="prev"]')?.addEventListener('click', () => {
        if (currentPage > 0) onPageChange(currentPage - 1);
    });
    wrap.querySelector('[data-action="next"]')?.addEventListener('click', () => {
        if (currentPage < totalPages - 1) onPageChange(currentPage + 1);
    });

    container.appendChild(wrap);
};

/**
 * Llena un selector de HTML <select> con opciones.
 * @param {string|HTMLElement} selectEl - ID o elemento del selector
 * @param {Array} items - Array de elementos
 * @param {Function} valueFn - Extrae el valor del item
 * @param {Function} textFn - Extrae el texto del item
 * @param {boolean} addEmpty - Si true, añade '-- Elegir --' al principio
 */
window.populateSelectHelper = function(selectEl, items, valueFn, textFn, addEmpty = false) {
    const sel = typeof selectEl === 'string' ? document.getElementById(selectEl) : selectEl;
    if (!sel) return;
    
    sel.innerHTML = '';
    if (addEmpty) {
        sel.innerHTML = '<option value="">-- Elegir --</option>';
    }
    
    items.forEach(item => {
        const opt = document.createElement('option');
        opt.value = valueFn(item); 
        opt.textContent = textFn(item);
        sel.appendChild(opt);
    });
    
    if (items.length > 0 && !addEmpty) {
        sel.value = valueFn(items[0]);
        sel.disabled = false;
    } else if (items.length === 0) {
        sel.disabled = true;
    }
};

/**
 * Formatea una clase de secuencia para los colores de D3
 */
window.classColor = function(seqLabel) {
    if (seqLabel === 'Nucleosome')     return '#2ecc71';
    if (seqLabel === 'Non-Nucleosome') return '#e74c3c';
    return '#aaa';
};
