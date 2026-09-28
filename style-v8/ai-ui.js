/* AI style reception: analysis -> strict preview -> explicit create; demo is clearly labelled. */
(function(){
 'use strict';
 const E=window.CoversStyleEngineV5,AI=window.CoversAIContractV5;
 const h=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
 const contract=`Ты анализируешь шаблоны Covers Sandbox. Вход: JSON type=covers-style-analysis, schemaVersion=4. У каждой записи есть категория, исходная роль текста, semanticType, шрифт, размер, вес и цвет. Верни ТОЛЬКО валидный JSON без Markdown с type=covers-style и schemaVersion=4. Схема: {"type":"covers-style","schemaVersion":4,"name":"Имя","palette":{"Primary":"#ffffff","Secondary":"#888888","Accent":"#5b8cff","White":"#ffffff"},"typography":{"meta":{"family":"Inter","weights":[400,600]},"title":{"family":"Inter","weights":[700,800]}},"categories":{"Intro":{"roles":{"meta":[{"colorToken":"Primary","weight":400},{"colorToken":"Accent","weight":600}],"title":[{"colorToken":"Primary","weight":800}]}}}}. Все встреченные категории перечисли под их точными системными именами. У каждой используемой роли должна быть глобальная настройка typography с семейством и разрешёнными весами. Нормализуй имена ролей: Meta→meta, Body→body, Title→title; meta1 и meta-left объединяй в meta, overlay-title в overlayTitle. Для одной смысловой роли сохраняй все найденные сочетания как варианты одной роли. Цвет каждого варианта должен ссылаться на глобальную палитру; дополнительные цвета назови отдельно. Вариант пресета содержит ТОЛЬКО colorToken и weight (ID можно добавить). Размер НЕ входит в вариант и НЕ должен меняться в шаблоне; исходный размер используй лишь для анализа повторов и распределения вариантов. Не меняй содержимое, геометрию, line-height и letter-spacing. Если двух вариантов одной роли нельзя уверенно различить, сохрани оба и не выдумывай размер в ответе. White — всегда #ffffff. Только JSON.`;
 const KEY='cs_v5_style_prompts';
 let prompts={};try{prompts=JSON.parse(localStorage.getItem(KEY)||'{}');}catch(_){}
 function persist(){try{localStorage.setItem(KEY,JSON.stringify(prompts));}catch(_){}}
 function open(ctx){
   const modal=document.createElement('div');modal.className='v5-ai';modal.style.cssText='position:fixed;z-index:200;inset:0;background:#000b;display:flex;align-items:center;justify-content:center;padding:18px';
   modal.innerHTML=`<div style="width:min(840px,100%);max-height:94vh;overflow:auto;background:#1d222b;color:#e7eaf0;border:1px solid #394557;border-radius:10px;padding:18px;font:12px/1.5 Inter,system-ui,sans-serif"><header style="display:flex;justify-content:space-between;align-items:center"><b>AI JSON · дополнительный импорт</b><button data-close>✕</button></header><p style="color:#9da7b7">Сначала скачайте анализ шаблонов и промпт. Проверка JSON ничего не меняет в библиотеке.</p><div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center"><span>Исходный стиль:</span><select data-source-style style="background:#12161e;color:white;padding:7px;border:1px solid #394557;border-radius:5px"></select><button data-analysis>Скачать анализ</button><button data-prompt-download>Скачать промпт</button></div><textarea data-json spellcheck="false" placeholder='{"type":"covers-style","schemaVersion":4,...}' style="box-sizing:border-box;margin-top:12px;width:100%;height:160px;background:#10141a;color:#e7eaf0;border:1px solid #394557;border-radius:6px;padding:9px;font:11px/1.4 ui-monospace,monospace"></textarea><div style="display:flex;gap:7px;margin:9px 0"><button data-check>Проверить JSON</button></div><div data-stats style="white-space:pre-wrap;background:#12161e;border-radius:6px;padding:10px;min-height:40px;color:#b3bccb">Ожидается AI JSON.</div><div data-groups></div><div style="display:flex;gap:7px;margin:12px 0"><input data-name type="text" placeholder="Название нового стиля" style="flex:1;min-width:0;padding:8px;background:#10141a;border:1px solid #394557;color:white;border-radius:5px"><button data-import disabled>Создать стиль</button></div><hr style="border:0;border-top:1px solid #394557;margin:16px 0"><b>Промпты</b><p style="color:#9da7b7;margin:6px 0">Встроенный контракт неизменяемый. Собственные версии можно сохранить и скачать.</p><div style="display:flex;gap:5px"><select data-prompt-list style="flex:1;min-width:0;background:#10141a;color:white;padding:7px;border:1px solid #394557;border-radius:5px"></select><button data-new-prompt>＋</button><button data-remove-prompt>✕</button></div><textarea data-prompt-text style="box-sizing:border-box;width:100%;height:98px;margin:7px 0;background:#10141a;color:#e7eaf0;border:1px solid #394557;border-radius:6px;padding:8px;font:11px/1.4 ui-monospace,monospace"></textarea><button data-save-prompt>Сохранить промпт</button></div>`;
   document.body.append(modal);
   const $=s=>modal.querySelector(s);let parsed=null;
   const source=$('[data-source-style]'),stats=$('[data-stats]');
   source.innerHTML='<option value="">Все цели</option>'+Object.entries(STYLES).map(([id,s])=>`<option value="${h(id)}">${h(s.name)}</option>`).join('');
   if(Object.values(LIB).some(t=>t.visualStyle===ctx.ui.styleId))source.value=ctx.ui.styleId;
   else if(Object.values(LIB).some(t=>t.visualStyle==='editorial-blue'))source.value='editorial-blue';
   const bank=$('[data-prompt-list]');
   function refreshPrompts(){bank.innerHTML='<option value="__base">Контракт v4 · встроенный</option>'+Object.keys(prompts).map(x=>`<option value="${h(x)}">${h(x)}</option>`).join('');bank.value='__base';$('[data-prompt-text]').value=contract;}
   refreshPrompts();
   bank.onchange=()=>{$('[data-prompt-text]').value=bank.value==='__base'?contract:prompts[bank.value]||'';};
   $('[data-new-prompt]').onclick=()=>{const name=prompt('Имя копии промпта');if(!name||name==='__base'||prompts[name]||name.length>80)return;prompts[name]=contract;persist();refreshPrompts();bank.value=name;bank.onchange();};
   $('[data-remove-prompt]').onclick=()=>{if(bank.value==='__base')return;delete prompts[bank.value];persist();refreshPrompts();};
   $('[data-save-prompt]').onclick=()=>{if(bank.value==='__base'){stats.textContent='Встроенный контракт нельзя менять — создайте копию.';return;}prompts[bank.value]=$('[data-prompt-text]').value;persist();stats.textContent='Промпт сохранён.';};
   $('[data-prompt-download]').onclick=()=>download('covers-style-contract-v4.txt',$('[data-prompt-text]').value,'text/plain');
   $('[data-analysis]').onclick=()=>{const targets=ctx.targets().filter(t=>!source.value||t.visualStyle===source.value);if(!targets.length){stats.textContent='В выбранном стиле и области действия нет шаблонов. Снимите фильтр или выделите шаблоны.';return;}
     const data=AI.analysis(targets);download('covers-style-analysis-v4.json',JSON.stringify(data,null,2),'application/json');stats.textContent=`Анализ: ${targets.length} шаблонов · ${data.templates.reduce((n,t)=>n+t.blocks.length,0)} текстов · ${data.categories.join(', ')}.`;};
   $('[data-json]').oninput=()=>{parsed=null;$('[data-import]').disabled=true;$('[data-groups]').innerHTML='';stats.textContent='Данные изменены. Проверьте JSON заново.';};
   $('[data-check]').onclick=()=>{
     try{parsed=AI.normalize($('[data-json]').value,GROUP_ORDER);$('[data-name]').value=parsed.name;$('[data-import]').disabled=false;
       stats.textContent=`Вариантов: ${parsed.statistics.reduce((n,x)=>n+x.variants,0)} · цветов: ${Object.keys(parsed.model.palette).length} · глобальных ролей: ${Object.keys(parsed.model.typography).length}\n`+parsed.statistics.map(x=>`${x.group}: ${x.roles} ролей / ${x.variants} вариантов${x.unknown?' · новая категория':''}`).join('\n');
       $('[data-groups]').innerHTML=parsed.unknownGroups.map(g=>`<div style="display:flex;gap:7px;align-items:center;margin:7px 0"><label style="min-width:130px">${h(g)}</label><select data-map-group="${h(g)}" style="flex:1;background:#10141a;color:white;padding:7px"><option value="__new">Добавить как системную</option>${GROUP_ORDER.map(x=>`<option value="${h(x)}">Сопоставить с ${h(x)}</option>`).join('')}</select></div>`).join('');
     }catch(err){parsed=null;$('[data-import]').disabled=true;stats.textContent=err.message;$('[data-groups]').innerHTML='';}
   };
   $('[data-import]').onclick=()=>{
     if(!parsed||ctx.ui.draft){stats.textContent='Проверьте JSON и завершите черновик перед импортом.';return;}
     const name=$('[data-name]').value.trim();if(!name){stats.textContent='Введите имя стиля.';return;}
     const incoming=JSON.parse(JSON.stringify(parsed.model));const replacements={};
     modal.querySelectorAll('[data-map-group]').forEach(el=>replacements[el.dataset.mapGroup]=el.value);
     ctx.step(()=>{
       for(const [group,mapping] of Object.entries(replacements)){
         const to=mapping==='__new'?ensureGroupName(group):mapping;
         if(to!==group){const addition=incoming.categories[group];incoming.categories[to] ||= {roles:{}};
           for(const [r,list] of Object.entries(addition.roles))incoming.categories[to].roles[r]=[...(incoming.categories[to].roles[r]||[]),...list.map(x=>({...x,id:E.uid('v')}))];
           delete incoming.categories[group];
         }
       }
       const id=E.uid('style');EDITOR_STYLES[id]={name,builtin:false,color:incoming.palette.Accent,accent:incoming.palette.Accent,canvasBg:'#ffffff',imageRadius:8,v4:incoming};
       ctx.ui.styleId=id;ctx.ui.choice={};ctx.ui.message=`Создан AI-стиль «${name}». Пресеты доступны сразу; шаблоны ещё не перекрашены.`;
     },{catalog:true});if(!ctx.session())ctx.saveGroups();modal.remove();
   };
   $('[data-close]').onclick=()=>modal.remove();modal.onclick=e=>{if(e.target===modal)modal.remove();};
 }
 window.CoversStyleAIUIV5={open};
})();
