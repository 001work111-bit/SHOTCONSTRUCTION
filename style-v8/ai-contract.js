/* v4 AI analysis and strict reception. Export includes source sizes; presets contain ONLY weight+color. */
(function(root){
 'use strict';
 const hex=x=>/^#[0-9a-f]{6}$/i.test(x||'');
 const roleAliases={'overlay-title':'overlayTitle',overlaytitle:'overlayTitle','overlay-body':'overlayBody',overlaybody:'overlayBody',smallmeta:'meta',meta1:'meta','meta-left':'meta','meta-right':'meta','meta-top':'meta','meta-bottom':'meta',kicker:'overline',statement:'title',quote:'body','body-right':'body',author:'meta',small:'meta','footer-links':'meta'};
 function canonicalRole(name){const s=String(name||'').trim(),common=['meta','body','title','overline','subtitle','caption','overlayTitle','overlayBody'];return roleAliases[s.toLowerCase()]||common.find(x=>x.toLowerCase()===s.toLowerCase())||s;}
 const safeFont=x=>typeof x==='string'&&/^[\w\s,\-'"А-Яа-яЁё]{1,100}$/.test(x);
 function analysis(templates){
   return {type:'covers-style-analysis',schemaVersion:4,categories:[...new Set(templates.map(t=>t.templateGroup))],templates:templates.map(t=>({id:t.id,templateGroup:t.templateGroup,visualStyle:t.visualStyle,blocks:(t.blocks||[]).filter(b=>b.kind==='text').map(b=>({id:b.id,sourceRole:b.role,semanticType:b.style?.semanticType||null,fontFamily:b.style?.fontFamily||'',fontSize:Number(b.style?.fontSize)||0,fontWeight:Number(b.style?.fontWeight)||400,color:b.style?.color||''}))}))};
 }
 function normalize(text,registeredGroups){
   if(typeof text!=='string'||!text.trim()||text.length>1024*1024)throw Error('Нужен JSON размером до 1 МБ.');
   let data;try{data=JSON.parse(text);}catch(e){throw Error('Ошибка JSON: '+e.message);}
   if(!data||typeof data!=='object'||Array.isArray(data)||data.type!=='covers-style'||data.schemaVersion!==4)throw Error('Ожидается объект type=covers-style, schemaVersion=4.');
   if(!data.palette||typeof data.palette!=='object'||Array.isArray(data.palette))throw Error('Отсутствует palette.');
   const palette={Primary:'#ffffff',Secondary:'#888888',Accent:'#5b8cff',White:'#ffffff'};
   for(const [k,color] of Object.entries(data.palette)){
     if(['__proto__','constructor','prototype'].includes(k)||!/^[-\wА-Яа-яЁё ]{1,32}$/.test(k)||!hex(color))throw Error('Ошибка цвета '+k);
     if(k==='White'&&color.toLowerCase()!=='#ffffff')throw Error('White всегда #ffffff.');
     palette[k]=color;
   }
   if(!data.typography||typeof data.typography!=='object'||Array.isArray(data.typography))throw Error('Отсутствует typography: семейства и веса для каждой роли.');
   const typography={};
   for(const [sourceRole,x] of Object.entries(data.typography)){
     const role=canonicalRole(sourceRole);
     if(!/^[-\wА-Яа-яЁё ]{1,40}$/.test(role)||['__proto__','constructor','prototype'].includes(role)||!x||typeof x!=='object'||!safeFont(x.family)||!Array.isArray(x.weights)||!x.weights.length)throw Error('Неверная глобальная настройка роли '+role);
     const ws=[...new Set(x.weights.map(Number))];
     if(ws.some(n=>!Number.isInteger(n)||n<100||n>900||n%100!==0))throw Error('Веса должны быть кратны 100: '+role);
     if(typography[role]&&typography[role].family!==x.family)throw Error('Конфликт глобальных шрифтов для объединяемой роли: '+role);
     typography[role]={family:x.family,weights:[...new Set([...(typography[role]?.weights||[]),...ws])].sort((a,b)=>a-b)};
   }
   if(!data.categories||typeof data.categories!=='object'||Array.isArray(data.categories)||!Object.keys(data.categories).length)throw Error('В ответе нет категорий.');
   const categories={};const statistics=[];let total=0;
   for(const [group,x] of Object.entries(data.categories)){
     if(!/^[\wА-Яа-яЁё /._-]{1,80}$/.test(group)||['__proto__','constructor','prototype'].includes(group)||!x||typeof x!=='object'||!x.roles||typeof x.roles!=='object'||Array.isArray(x.roles))throw Error('Неверная категория: '+group);
     const roles={};let count=0;
     for(const [sourceRole,items] of Object.entries(x.roles)){
       const role=canonicalRole(sourceRole);
       if(!typography[role]||!Array.isArray(items)||items.length>40)throw Error('Неизвестная роль или слишком много вариантов: '+group+'/'+role);
       const normalized=items.map((item,i)=>{
         if(!item||typeof item!=='object'||typeof item.colorToken!=='string'||!Object.hasOwn(palette,item.colorToken)||!typography[role].weights.includes(Number(item.weight)))throw Error(`Несоответствие палитре/весам: ${group}/${role} №${i+1}`);
         if(Object.hasOwn(item,'fontSize')||Object.hasOwn(item,'size')||Object.hasOwn(item,'sizeHint'))throw Error(`Размер не входит в пресет: ${group}/${role} №${i+1}`);
         return {id:String(item.id||'ai_'+group.replace(/\W/g,'_')+'_'+sourceRole.replace(/\W/g,'_')+'_'+i),colorToken:item.colorToken,weight:Number(item.weight)};
       });
       if(normalized.some(v=>!/^[\w-]{1,100}$/.test(v.id)))throw Error('Некорректный ID варианта: '+group+'/'+role);
       roles[role] ||= [];
       for(const item of normalized){
         if(roles[role].some(v=>v.weight===item.weight&&v.colorToken===item.colorToken))continue;
         if(roles[role].some(v=>v.id===item.id))throw Error('Повтор ID варианта: '+group+'/'+role);
         roles[role].push(item);count++;
       }
     }
     categories[group]={roles};statistics.push({group,roles:Object.keys(roles).length,variants:count,unknown:!registeredGroups.includes(group)});total+=count;
   }
   if(!total)throw Error('В ответе нет вариантов.');
   return {name:String(data.name||'AI style').trim().slice(0,80),model:{schemaVersion:4,palette,typography,categories,applyFontFamily:false},statistics,unknownGroups:statistics.filter(x=>x.unknown).map(x=>x.group)};
 }
 const api={analysis,normalize};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.CoversAIContractV5=api;
})(typeof window!=='undefined'?window:globalThis);
