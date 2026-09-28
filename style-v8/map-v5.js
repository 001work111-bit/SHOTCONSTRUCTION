/* Map v6: a single size slider determines number of columns; gaps are exact pixels. */
(function(){
 'use strict';
 const KEY='cs_v5_map_v6',config={row:12,column:12,size:270};
 try{Object.assign(config,JSON.parse(localStorage.getItem(KEY)||localStorage.getItem('cs_v5_map')||'{}'));}catch(_){}
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||a));
 if(config.size<=100)config.size=270; // migrate the old percentage slider
 config.row=clamp(config.row,0,80);config.column=clamp(config.column,0,80);config.size=clamp(config.size,140,500);
 const style=document.createElement('style');style.textContent=`
   #galRoot .gal-scroll{background:#101317}
   #galRoot [data-gal-grid]{grid-template-columns:repeat(auto-fit,minmax(min(100%,var(--v6-card-size,270px)),var(--v6-card-size,270px)))!important;justify-content:center!important;row-gap:var(--v6-row-gap,12px)!important;column-gap:var(--v6-col-gap,12px)!important}
   #galRoot .gal-card{width:100%!important;margin:0!important;border-radius:7px!important;background:#d8dade!important;overflow:hidden}
   #galRoot .gal-frame{border-radius:inherit;overflow:hidden;background:#d8dade}
   #galRoot .gal-cols{display:none!important}
   #galRoot .v6-map-controls{display:flex;align-items:center;justify-content:center;gap:13px;flex-wrap:wrap;color:var(--ui-muted);font-size:10px}
   #galRoot .v6-map-controls label{display:flex;align-items:center;gap:5px;white-space:nowrap}
   #galRoot .v6-map-controls input{width:100px;accent-color:var(--ui-accent)}
   #galRoot .v6-map-controls output{min-width:36px;font:10px ui-monospace,monospace;text-align:right}
 `;document.head.append(style);
 function apply(){const root=document.getElementById('galRoot');if(!root)return;
   root.style.setProperty('--v6-row-gap',config.row+'px');root.style.setProperty('--v6-col-gap',config.column+'px');root.style.setProperty('--v6-card-size',config.size+'px');
   root.querySelectorAll('[data-v6-setting]').forEach(el=>{const key=el.dataset.v6Setting;el.value=config[key];el.nextElementSibling.textContent=config[key]+'px';});
   window.SB_Gallery?.fitAll?.();try{localStorage.setItem(KEY,JSON.stringify(config));}catch(_){}
 }
 function mount(){const root=document.getElementById('galRoot');if(!root||root.querySelector('.v6-map-controls'))return;
   const bar=root.querySelector('.gal-colbar');if(!bar)return;
   const controls=document.createElement('div');controls.className='v6-map-controls';
   for(const [key,label,min,max,step] of [['size','Размер',140,500,10],['row','↕',0,80,2],['column','↔',0,80,2]]){
     const row=document.createElement('label');row.title=key==='size'?'Размер карточки определяет количество колонок':key==='row'?'Расстояние между строками':'Расстояние между карточками по горизонтали';
     row.innerHTML=`${label} <input type="range" data-v6-setting="${key}" min="${min}" max="${max}" step="${step}"><output></output>`;
     row.querySelector('input').addEventListener('input',e=>{config[key]=clamp(e.target.value,min,max);apply();});controls.append(row);
   }
   bar.append(controls);root.addEventListener('dblclick',e=>{
     const card=e.target.closest('.gal-card');if(!card||!root.contains(card)||!LIB[card.dataset.id]||e.altKey)return;
     e.preventDefault();selectTpl(card.dataset.id,true);SB_Gallery.setMode('single');
   });apply();
 }
 document.getElementById('viewSwitch')?.addEventListener('click',()=>setTimeout(mount,0));
 window.CoversMapV5={mount,apply,config};
})();
