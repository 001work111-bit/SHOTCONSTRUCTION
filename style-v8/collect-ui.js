/* Main path: inspect real selected templates, create a reusable style without AI. */
(function(){
 'use strict';
 const E=window.CoversStyleEngineV5;
 const h=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function open(ctx){
   const templates=ctx.targets();if(!templates.length){ctx.ui.message='Нет шаблонов в выделении или фильтре.';ctx.refresh();return;}
   const main=templates.reduce((map,t)=>{map[t.visualStyle]=(map[t.visualStyle]||0)+1;return map;},{});
   const source=Object.entries(main).sort((a,b)=>b[1]-a[1])[0]?.[0]||ctx.ui.styleId;
   const from=STYLES[source]||STYLES[ctx.ui.styleId]||{};
   const candidate={name:'',accent:from.accent,canvasBg:from.canvasBg||'#ffffff',imageRadius:from.imageRadius??8};
   let report;
   try{report=E.collectFromTemplates(candidate,GROUP_ORDER,templates);}catch(err){ctx.ui.message=err.message;ctx.refresh();return;}
   const modal=document.createElement('div');modal.className='v5-ai';modal.style.cssText='position:fixed;z-index:210;inset:0;background:#000c;display:flex;align-items:center;justify-content:center;padding:16px';
   modal.innerHTML=`<div style="width:min(570px,100%);max-height:90vh;overflow:auto;background:#1d222b;color:#e7eaf0;border:1px solid #394557;border-radius:10px;padding:18px;font:12px/1.6 Inter,system-ui,sans-serif">
     <header style="display:flex;align-items:center;justify-content:space-between;gap:10px"><b>Собрать стиль · без AI</b><button data-close>✕</button></header>
     <p style="color:#a8b3c3">Источник: ${h(checked.size?'отмеченные шаблоны':'видимые по фильтрам')}. Пресеты создаются отдельно от шаблонов; их содержимое и размеры не изменятся.</p>
     <label>Название стиля<input data-name maxlength="100" value="${h((from.name||'Новый стиль')+' · из шаблонов')}" style="display:block;box-sizing:border-box;width:100%;background:#10141a;color:white;border:1px solid #394557;border-radius:5px;padding:9px;margin:6px 0 12px"></label>
     <div style="background:#12161e;border-radius:6px;padding:11px"><strong>${report.templates}</strong> шаблонов · <strong>${report.accepted}</strong> текстов принято из ${report.textBlocks} · <strong>${report.skipped}</strong> пропущено<br>
     ${report.categories} категорий · ${report.combinations} сочетаний вес/цвет · ${report.colors} уникальных фактических цветов</div>
     <div style="max-height:210px;overflow:auto;margin:10px 0;border:1px solid #394557;border-radius:6px;padding:10px">${report.byGroup.map(x=>`<div>${h(x.group)}: ${x.roles} ролей · ${x.variants} вариантов</div>`).join('')}</div>
     ${report.issues.length?`<details><summary>Пропуски (${report.skipped})</summary><pre style="white-space:pre-wrap;max-height:100px;overflow:auto">${h(report.issues.join('\n'))}</pre></details>`:'<small style="color:#9ba8b8">Ошибок разбора нет.</small>'}
     <p style="color:#a8b3c3">Варианты каждой роли сортируются по частоте. Для авто сохранены исходные кегли и семейства как служебные признаки; кегль целевого текста не меняется.</p>
     <div style="display:flex;gap:8px;justify-content:flex-end"><button data-close>Отмена</button><button data-create class="primary" style="padding:7px 12px">Создать стиль</button></div></div>`;
   document.body.append(modal);
   modal.addEventListener('click',e=>{
     if(e.target===modal||e.target.closest('[data-close]')){modal.remove();return;}
     if(!e.target.closest('[data-create]'))return;
     const name=modal.querySelector('[data-name]').value.trim();if(!name){modal.querySelector('[data-name]').focus();return;}
     ctx.step(()=>{const id=E.uid('style');candidate.name=name;candidate.builtin=false;candidate.color=candidate.accent||candidate.v4.palette['Color 1'];candidate.accent ||= candidate.color;
       candidate.v4.collectionStats=report;EDITOR_STYLES[id]=candidate;ctx.ui.styleId=id;ctx.ui.category='__all';ctx.ui.choice={};ctx.ui.draft=null;
       ctx.ui.message=`Стиль «${name}» собран: ${report.templates} шаблонов, ${report.accepted} текстов, ${report.combinations} вариантов, ${report.skipped} пропущено. Шаблоны не менялись.`;
     },{catalog:true});modal.remove();
   });
 }
 window.CoversStyleCollectV5={open};
})();
