/* Library style manager: explicit COPY into a NEW program style. Never called by Apply in the editor. */
(function(){
 'use strict';
 const h=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function duplicateIntoNewProgramStyle(sourceIds){
   if(window.CoversStyleV5?.sessionActive){toast('Сначала завершите ручную сессию');return;}
   const sources=[...new Set(sourceIds)].map(id=>LIB[id]).filter(Boolean);
   if(!sources.length){toast('Сначала выделите шаблоны либо выберите стиль в списке');return;}
   const name=prompt(`Название нового стиля программы для ${sources.length} копий:`);if(!name?.trim())return;
   const clean=name.trim().slice(0,100),base=STYLES[sources[0].visualStyle]||STYLES['cinematic'];
   let id='program_'+clean.toLowerCase().replace(/[^a-z0-9а-яё]+/gi,'_').replace(/^_+|_+$/g,'').slice(0,50);
   if(id==='program_')id='program_'+Date.now();
   const stem=id;let i=2;while(STYLES[id])id=stem+'_'+i++;
   pushUndo();
   const style=deepClone(base);delete style.v4;style.name=clean;style.builtin=false;
   style.color=nextStyleColor();style.exportFile='custom_'+id+'.js';
   STYLES[id]=style;
   const copies=[];
   for(const t of sources){
     const copy=deepClone(t);
     copy.id=makeUniqueTpl(t.id+'_copy');copy.label=(t.label||t.id)+' (копия)';
     copy.visualStyle=id;copy.isFavorite=false;
     // Keep original roles, edited block appearance and editor bindings on the duplicate.
     LIB[copy.id]=copy;copies.push(copy.id);
   }
   store.saveStyles();store.save();styleFilter=id;
   checked=new Set(copies);anchorId=copies[0];renderTopFilterDDs();
   selectTpl(copies[0],true);renderStyleMgrList();
   toast(`Создан программный стиль «${clean}»: ${copies.length} копий`);
 }
 document.getElementById('bulkCopyProgram')?.addEventListener('click',()=>duplicateIntoNewProgramStyle([...checked]));
 const original=window.renderStyleMgrList;
 window.renderStyleMgrList=function(){
   original();
   const box=document.getElementById('styleMgrList');if(!box)return;
   const bar=document.createElement('div');bar.style.cssText='display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 12px';
   bar.innerHTML=`<button type="button" class="mini-btn" data-copy-selected style="padding:8px 10px">⧉ Выделенные → новый программный стиль</button><span style="font-size:10px;color:var(--ui-muted)">${checked.size?'Выделено: '+checked.size:'Или копируйте все шаблоны из строки стиля ↓'}</span>`;
   box.prepend(bar);
   bar.querySelector('[data-copy-selected]').onclick=()=>duplicateIntoNewProgramStyle([...checked]);
   box.querySelectorAll('.sm-row').forEach(row=>{
     const id=row.dataset.sm,button=document.createElement('button');button.type='button';button.className='sm-del';button.style.cssText='width:auto;padding:5px 7px;white-space:nowrap';
     button.textContent='⧉ Все';button.title=`Копировать все шаблоны «${STYLES[id]?.name||id}» в новый стиль программы`;
     button.dataset.copyProgram=id;button.onclick=()=>duplicateIntoNewProgramStyle(Object.values(LIB).filter(t=>t.visualStyle===id).map(t=>t.id));
     row.insertBefore(button,row.querySelector('[data-smdel]'));
   });
 };
 window.CoversProgramCopyV6={duplicateIntoNewProgramStyle};
})();
