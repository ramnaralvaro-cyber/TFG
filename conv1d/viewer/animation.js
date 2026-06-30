// ============================================================
// animation.js — Modos de animacion del heatmap de activaciones
// Requiere: JSCharting (CDN), globals de test.html:
//   availableEpochs, ensureEpochLoaded, calculateActivationsForFilter,
//   createHeatmapHTML, sequenceMap, sequenceLabels, renderVisualization
// ============================================================

'use strict';

const Anim = {
    chart:  null,
    timer:  null,
    paused: false,
    frame:  0,
    frames: [],
    mode:   null
};

// ── Utilidades ────────────────────────────────────────────────────────────────
function _val(id, fb) { const e=document.getElementById(id); return e?e.value:fb; }
function _showInfo(msg) { const e=document.getElementById('animInfoText'); if(e) e.textContent=msg; }
function _showSpeed() {
    const fps=parseFloat(_val('animSpeed','1'));
    const e=document.getElementById('animSpeedVal');
    if(e) e.textContent=fps+' fps';
}

// ── Controles publicos ────────────────────────────────────────────────────────
function animPlay() {
    Anim.paused=false;
    document.getElementById('btnAnimPlay').disabled=true;
    document.getElementById('btnAnimPause').disabled=false;
}
function animPause() {
    Anim.paused=true;
    document.getElementById('btnAnimPlay').disabled=false;
    document.getElementById('btnAnimPause').disabled=true;
}
function animStop() {
    if(Anim.timer){ clearInterval(Anim.timer); Anim.timer=null; }
    Anim.paused=false; Anim.frame=0; Anim.frames=[];
    _destroyChart(); _showInfo('');
}
function animSetFrame(value) {
    if(Anim.mode!=='epoch'||!Anim.frames.length) return;
    Anim.frame=Math.max(0,Math.min(parseInt(value),Anim.frames.length-1));
    _renderFrame();
}
function animSetSpeed() {
    if(!Anim.timer) return;
    clearInterval(Anim.timer);
    Anim.timer=setInterval(_tick, _interval());
    _showSpeed();
}

// ── Cambio de modo ────────────────────────────────────────────────────────────
function onAnimModeChange() {
    const mode=_val('animModeSelect','static');
    animStop();
    const panel=document.getElementById('animControlsPanel');
    if(panel) panel.style.display=(mode==='static')?'none':'flex';
    const esr=document.getElementById('epochSliderRow');
    if(esr) esr.style.display=(mode==='epoch')?'inline-flex':'none';
    const ear=document.getElementById('epochSelectAnimRow');
    if(ear) ear.style.display=(mode==='intensity')?'inline-flex':'none';
    if(mode==='static'){ renderVisualization(); return; }
    Anim.mode=mode;
    if(mode==='epoch')     _initEpoch();
    if(mode==='intensity') _initIntensity();
}

// ── MODO A: Epoch Evolution ───────────────────────────────────────────────────
async function _initEpoch() {
    const seqId    =_val('seqSelect','');
    const filterId =_val('filterSelectSingle','');
    const layerName=_val('layerSelect','');
    if(!seqId||!filterId||!layerName){
        _showInfo('Selecciona secuencia, capa y filtro (Modo 1) antes de animar.');
        return;
    }
    _showInfo('Cargando epocas...');
    Anim.frames=[];
    for(const {filename} of availableEpochs){
        const ed=await ensureEpochLoaded(filename);
        if(!ed) continue;
        const acts=calculateActivationsForFilter(seqId,layerName,filterId,ed);
        if(acts) Anim.frames.push({label:`Epoca ${ed.epoch}`,activations:acts});
    }
    if(!Anim.frames.length){ _showInfo('Sin datos de activacion para esta combinacion.'); return; }
    const seqOrig=sequenceMap[parseInt(seqId)];
    const slider=document.getElementById('epochSliderAnim');
    if(slider){ slider.min=0; slider.max=Anim.frames.length-1; slider.value=0; }
    _initJSCLine(seqOrig.length);
    Anim.frame=0; _renderFrame();
    Anim.paused=false;
    Anim.timer=setInterval(_tick,_interval());
    _showInfo('Animando '+Anim.frames.length+' epocas | Filtro '+filterId+' | Seq '+seqId);
    _showSpeed();
}

// ── MODO B: Activation Progression ───────────────────────────────────────────
async function _initIntensity() {
    const seqId    =_val('seqSelect','');
    const filterId =_val('filterSelectSingle','');
    const layerName=_val('layerSelect','');
    const epochFile=_val('epochSelectAnim','');
    if(!seqId||!filterId||!layerName||!epochFile){
        _showInfo('Selecciona secuencia, capa, filtro y epoca antes de animar.');
        return;
    }
    _showInfo('Cargando datos...');
    const ed=await ensureEpochLoaded(epochFile);
    if(!ed){ _showInfo('Error al cargar la epoca.'); return; }
    const actsRaw=calculateActivationsForFilter(seqId,layerName,filterId,ed);
    if(!actsRaw){ _showInfo('Sin datos de activacion.'); return; }
    const seqOrig=sequenceMap[parseInt(seqId)];
    const maxAct=Math.max(...actsRaw);
    const STEPS=40;
    Anim.frames=Array.from({length:STEPS+1},(_,k)=>{
        const thr=(maxAct*k)/STEPS;
        return { label:'Umbral >= '+thr.toFixed(3), threshold:thr,
                 activations:actsRaw.map(v=>v>=thr?v:0) };
    });
    _initJSCBar(seqOrig.length, maxAct);
    Anim.frame=0; _renderFrame();
    Anim.paused=false;
    Anim.timer=setInterval(_tick,_interval());
    _showInfo('Progresion de intensidad | Filtro '+filterId+' | Seq '+seqId+' | Epoca '+ed.epoch);
    _showSpeed();
}

// ── Tick ──────────────────────────────────────────────────────────────────────
function _tick(){
    if(Anim.paused||!Anim.frames.length) return;
    Anim.frame=(Anim.frame+1)%Anim.frames.length;
    const sl=document.getElementById('epochSliderAnim');
    if(sl&&Anim.mode==='epoch') sl.value=Anim.frame;
    _renderFrame();
}

// ── Render frame ──────────────────────────────────────────────────────────────
function _renderFrame(){
    const frame=Anim.frames[Anim.frame];
    if(!frame) return;
    const seqId   =_val('seqSelect','');
    const filterId=_val('filterSelectSingle','');
    if(!seqId||!filterId) return;
    const seqOrig =sequenceMap[parseInt(seqId)];
    const seqLabel=sequenceLabels[parseInt(seqId)];
    // Actualizar heatmap de caracteres (usa createHeatmapHTML de test.html)
    document.getElementById('vizContent').innerHTML=
        createHeatmapHTML(seqOrig, frame.activations, frame.label, 'single', seqLabel);
    // Actualizar grafico JSCharting
    if(Anim.chart){
        const pts=frame.activations.map((v,i)=>({x:i,y:v}));
        Anim.chart.options({title_label_text:frame.label, series:[{name:frame.label,points:pts}]});
    }
}

// ── JSCharting helpers ────────────────────────────────────────────────────────
function _initJSCLine(seqLen){
    _destroyChart();
    document.getElementById('animChartContainer').style.display='block';
    Anim.chart=JSC.Chart('animChartContainer',{
        type:'line',
        title:{label:{text:'Evolucion de activaciones por epoca'}},
        xAxis:{label:{text:'Posicion'},scale:{range:[0,seqLen-1]}},
        yAxis:{label:{text:'Activacion'}},
        legend:{visible:false},
        animation:{duration:200},
        defaultPoint:{marker:{visible:false}},
        palette:['#e93e3a'],
        series:[{name:'Activacion',points:[]}]
    });
}
function _initJSCBar(seqLen,maxAct){
    _destroyChart();
    document.getElementById('animChartContainer').style.display='block';
    Anim.chart=JSC.Chart('animChartContainer',{
        type:'column',
        title:{label:{text:'Progresion de intensidades de activacion'}},
        xAxis:{label:{text:'Posicion'},scale:{range:[0,seqLen-1]}},
        yAxis:{label:{text:'Activacion'},scale:{range:[0,maxAct*1.05]}},
        legend:{visible:false},
        animation:{duration:150},
        palette:['#f3903f'],
        series:[{name:'Activacion',points:[]}]
    });
}
function _destroyChart(){
    if(Anim.chart){ try{Anim.chart.dispose();}catch(_){} Anim.chart=null; }
    const c=document.getElementById('animChartContainer');
    if(c){ c.innerHTML=''; c.style.display='none'; }
}
function _interval(){ return Math.max(100,Math.round(1000/parseFloat(_val('animSpeed','1')))); }
