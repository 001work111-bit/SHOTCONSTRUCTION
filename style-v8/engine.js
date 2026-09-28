/* Styles v5: collect exact category/role/color/weight combinations from real templates.
   sourceProfiles are matching metadata, NOT part of a preset; geometry never changes. */
(function(root){
 'use strict';
 const coreRoles=['meta','body','title','overline','subtitle','caption','overlayTitle','overlayBody'];
 const fixedColors={Primary:'#ffffff',Secondary:'#888888',Accent:'#5b8cff',White:'#ffffff'};
 const aliases={'overlay-title':'overlayTitle',overlaytitle:'overlayTitle','overlay-body':'overlayBody',overlaybody:'overlayBody',smallmeta:'meta',meta1:'meta','meta-left':'meta','meta-right':'meta','meta-top':'meta','meta-bottom':'meta',kicker:'overline',statement:'title',quote:'body','body-right':'body',author:'meta',small:'meta','footer-links':'meta'};
 const uid=p=>(p||'v')+'_'+Math.random().toString(36).slice(2,10);
 const validHex=x=>/^#[0-9a-f]{6}$/i.test(String(x||''));
 function normalizeColor(value){
   const raw=String(value||'').trim().toLowerCase();
   if(validHex(raw))return raw;
   if(/^#[0-9a-f]{3}$/.test(raw))return '#'+[...raw.slice(1)].map(c=>c+c).join('');
   const rgb=raw.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*(0?(?:\.\d+)?|1(?:\.0+)?)\s*)?\)$/);
   if(!rgb||rgb.slice(1,4).some(n=>Number(n)>255))return null;
   if(rgb[4]!==undefined){const alpha=Number(rgb[4]);if(alpha<0||alpha>1)return null;return `rgba(${rgb[1]},${rgb[2]},${rgb[3]},${alpha})`;}
   return '#'+rgb.slice(1,4).map(n=>Number(n).toString(16).padStart(2,'0')).join('');
 }
 function colorSwatch(value){if(validHex(value))return value;
   const m=String(value).match(/^rgba\((\d+),(\d+),(\d+),/);
   return m?'#'+m.slice(1,4).map(n=>Number(n).toString(16).padStart(2,'0')).join(''):'#ffffff';
 }
 const validColor=x=>!!normalizeColor(x);
 const fontName=x=>String(x||'Inter').split(',')[0].trim().replace(/^["']|["']$/g,'')||'Inter';
 const normalizedFont=x=>fontName(x).toLocaleLowerCase();
 function roleOf(b){
   const raw=String(b.role||'').trim(),sem=String(b.style?.semanticType||'').trim();
   if(/^overlay(title|body)$/i.test(sem))return sem.toLowerCase().endsWith('title')?'overlayTitle':'overlayBody';
   const norm=s=>aliases[s.toLowerCase()]||coreRoles.find(r=>r.toLowerCase()===s.toLowerCase())||s;
   return norm(raw||sem||'body');
 }
 function fontRegistry(library){
   const found=new Map([['inter','Inter']]);
   for(const t of Object.values(library||{}))for(const b of t.blocks||[])if(b.kind==='text'){
     const name=fontName(b.style?.fontFamily);if(/^[\w\s.'-]{1,100}$/.test(name))found.set(name.toLocaleLowerCase(),name);
   }
   return [...found.values()].sort((a,b)=>a.localeCompare(b,'ru'));
 }
 function ensure(style,groups,library,mode){
   if(!style.v4)style.v4={schemaVersion:4,palette:{...fixedColors,Accent:validHex(style.accent)?style.accent:'#5b8cff'},typography:{},categories:{},sourceProfiles:{},applyFontFamily:false};
   const v=style.v4;v.schemaVersion=4;v.palette ||= {...fixedColors};v.palette.White='#ffffff';
   if(v.colorMode!=='observed')for(const [k,c] of Object.entries(fixedColors))if(!validColor(v.palette[k]))v.palette[k]=c;
   v.typography ||= {};v.categories ||= {};v.sourceProfiles ||= {};
   const seen=new Set(coreRoles);
   for(const t of Object.values(library||{}))for(const b of t.blocks||[])if(b.kind==='text')seen.add(roleOf(b));
   for(const cat of Object.values(v.categories))for(const r of Object.keys(cat.roles||{}))seen.add(r);
   for(const r of seen){v.typography[r] ||= {family:'Inter',weights:[400,500,600,700,800]};
     if(!Array.isArray(v.typography[r].weights))v.typography[r].weights=[400,500,600,700,800];
     if(!Array.isArray(v.typography[r].allowedColors))v.typography[r].allowedColors=Object.keys(v.palette);}
   if(mode==='manual-new'){
     const names=new Set(Object.values(library||{}).map(t=>t.templateGroup).filter(Boolean));
     for(const g of groups||[])if(names.has(g)){
       v.categories[g] ||= {roles:{}};
       for(const r of coreRoles)v.categories[g].roles[r] ||= [{id:uid('v'),colorToken:'Primary',weight:v.typography[r].weights[0]||400}];
     }
   }
   return v;
 }
 const variants=(v,category,role)=>v?.categories?.[category]?.roles?.[role]||[];
 function bindings(t,styleId){const all=t.v5Bindings||(t.v5Bindings={});return all[styleId]||(all[styleId]={});}
 const getBinding=(t,b,styleId)=>t.v5Bindings?.[styleId]?.[b.id]||null;
 function paint(b,v,role,variant,options={}){
   if(!b||b.kind!=='text'||!variant||!validColor(v.palette[variant.colorToken]))return false;
   b.style ||= {};b.style.color=v.palette[variant.colorToken];b.style.fontWeight=Number(variant.weight);
   if(!options.keepFamily&&v.applyFontFamily&&v.typography[role]?.family)b.style.fontFamily=v.typography[role].family;
   return true;
 }
 function bind(t,b,styleId,style,category,role,variantId,options={}){
   const v=style.v4,items=variants(v,category,role),variant=items.find(x=>x.id===variantId)||items[0];
   const prior=getBinding(t,b,styleId),original=prior?.original||{color:b.style?.color,fontWeight:b.style?.fontWeight,fontFamily:b.style?.fontFamily};
   if(!variant||!paint(b,v,role,variant,options))return false;
   bindings(t,styleId)[b.id]={categoryId:category,roleId:role,variantId:variant.id,manual:true,original};
   t.editorStyleId=styleId;return true;
 }
 function switchBound(t,styleId,style,category,role,variant){
   let n=0;const m=t.v5Bindings?.[styleId];if(!m)return 0;
   for(const b of t.blocks||[]){const x=m[b.id];if(!x||x.categoryId!==category||x.roleId!==role||b.kind!=='text')continue;
     if(paint(b,style.v4,role,variant)){x.variantId=variant.id;n++;}}
   return n;
 }
 function previewDraft(t,styleId,style,category,role,variant){
   let n=0;const m=t.v5Bindings?.[styleId];if(!m)return 0;
   for(const b of t.blocks||[]){const x=m[b.id];if(x&&x.categoryId===category&&x.roleId===role&&paint(b,style.v4,role,variant))n++;}return n;
 }
 function hash(s){let h=2166136261;for(const c of String(s)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
 function nearest(items,t,b,same,profiles){
   if(items.length===1)return {variant:items[0],ambiguous:false,reason:'only'};
   const size=Number(b.style?.fontSize)||0,details=profiles||{};
   const withSize=items.filter(v=>Number(details[v.id]?.medianSize)>0);
   if(size>0&&withSize.length===items.length){
     const font=normalizedFont(b.style?.fontFamily);
     const ranks=items.map((v,i)=>{
       const p=details[v.id],srcFont=p.fonts?.[0]?.name;
       return {v,i,score:Math.abs(Math.log(size/p.medianSize))+(srcFont&&normalizedFont(srcFont)===font?0:0.08)};
     }).sort((a,c)=>a.score-c.score||a.i-c.i);
     if(ranks[1]&&Math.abs(ranks[0].score-ranks[1].score)>1e-6)return {variant:ranks[0].v,ambiguous:false,reason:'size/font'};
   }
   const ordered=[...same].sort((a,c)=>(Number(a.style?.fontSize)||0)-(Number(c.style?.fontSize)||0)||String(a.id).localeCompare(String(c.id)));
   if(ordered.length>1&&new Set(ordered.map(x=>Number(x.style?.fontSize)||0)).size>1)
     return {variant:items[Math.round(ordered.indexOf(b)*(items.length-1)/(ordered.length-1))],ambiguous:false,reason:'rank'};
   return {variant:items[hash(t.id+'/'+b.id)%items.length],ambiguous:true,reason:'tie'};
 }
 function auto(t,styleId,style,mode){
   const v=style.v4,group=t.templateGroup,category=v.categories[group];
   if(!category)return {changed:0,ambiguous:0,unknown:0,manual:0};
   let changed=0,ambiguous=0,unknown=0,manual=0;
   const text=(t.blocks||[]).filter(b=>b.kind==='text');
   for(const b of text){
     const old=getBinding(t,b,styleId);if(old?.manual){manual++;continue;}
     const role=roleOf(b),items=variants(v,group,role);
     if(!items.length){unknown++;continue;}
     const same=text.filter(x=>!getBinding(t,x,styleId)?.manual&&roleOf(x)===role);
     const chosen=nearest(items,t,b,same,v.sourceProfiles?.[group]?.[role]);
     if(mode==='variants'&&(!old||!old.ambiguous||!chosen.ambiguous))continue;
     const idx=items.findIndex(x=>x.id===old?.variantId);
     const item=mode==='variants'?items[(Math.max(idx,0)+1)%items.length]:chosen.variant;
     const original=old?.original||{color:b.style?.color,fontWeight:b.style?.fontWeight,fontFamily:b.style?.fontFamily};
     if(paint(b,v,role,item)){
       bindings(t,styleId)[b.id]={categoryId:group,roleId:role,variantId:item.id,manual:false,ambiguous:chosen.ambiguous,original};
       changed++;if(chosen.ambiguous)ambiguous++;
     }
   }
   if(changed)t.editorStyleId=styleId;
   return {changed,ambiguous,unknown,manual};
 }
 function remapRoleColor(style,styleId,library,role,removed,replacement){
   const v=style.v4,spec=v.typography[role];if(!spec||removed===replacement||!spec.allowedColors.includes(replacement))throw Error('Выберите разрешённый цвет-замену.');
   let variantsChanged=0,merged=0,painted=0;v.variantRedirects ||= {};
   for(const [cat,data] of Object.entries(v.categories)){
     const list=data.roles?.[role]||[],profiles=v.sourceProfiles?.[cat]?.[role]||{};
     for(const item of [...list]){
       if(item.colorToken!==removed)continue;
       item.colorToken=replacement;variantsChanged++;
       const duplicate=list.find(x=>x!==item&&x.weight===item.weight&&x.colorToken===replacement);
       if(!duplicate)continue;
       if(profiles[item.id]){
         if(profiles[duplicate.id])profiles[duplicate.id].count=(profiles[duplicate.id].count||0)+(profiles[item.id].count||0);
         else profiles[duplicate.id]=profiles[item.id];
         delete profiles[item.id];
       }
       v.variantRedirects[item.id]=duplicate.id;
       list.splice(list.indexOf(item),1);merged++;
       for(const t of Object.values(library||{}))for(const x of Object.values(t.v5Bindings?.[styleId]||{}))if(x.variantId===item.id)x.variantId=duplicate.id;
     }
     list.sort((a,b)=>(profiles[b.id]?.count||0)-(profiles[a.id]?.count||0));
   }
   spec.allowedColors=spec.allowedColors.filter(x=>x!==removed);
   for(const t of Object.values(library||{}))for(const b of t.blocks||[]){
     const x=getBinding(t,b,styleId);if(!x||x.roleId!==role||b.kind!=='text')continue;
     const item=variants(v,x.categoryId,role).find(z=>z.id===x.variantId);
     if(item&&paint(b,v,role,item))painted++;
   }
   return {variantsChanged,merged,painted};
 }
 function removeVariant(style,styleId,library,cat,role,variantId){
   const v=style.v4,list=variants(v,cat,role),idx=list.findIndex(x=>x.id===variantId);
   if(idx<0)return {removed:0,linked:0,unlinked:0};
   const [removed]=list.splice(idx,1);
   delete v.sourceProfiles?.[cat]?.[role]?.[removed.id];v.variantRedirects ||= {};
   const fallback=list[0]||null;v.variantRedirects[variantId]=fallback?.id||null;
   let linked=0,unlinked=0;
   for(const t of Object.values(library||{}))for(const b of t.blocks||[]){
     const x=getBinding(t,b,styleId);if(x?.variantId!==variantId||x.categoryId!==cat||x.roleId!==role)continue;
     if(fallback){x.variantId=fallback.id;paint(b,v,role,fallback);linked++;}
     else{if(x.original){for(const attr of ['color','fontWeight','fontFamily'])if(x.original[attr]!==undefined)b.style[attr]=x.original[attr];}
       delete t.v5Bindings[styleId][b.id];unlinked++;}
     if(!Object.keys(t.v5Bindings?.[styleId]||{}).length&&t.editorStyleId===styleId)delete t.editorStyleId;
   }
   return {removed:1,linked,unlinked};
 }
 function reconcileBindings(style,styleId,library){
   const v=style.v4,redirect=v.variantRedirects||{};let repaired=0,unlinked=0;
   for(const t of Object.values(library||{}))for(const b of t.blocks||[]){
     const m=t.v5Bindings?.[styleId],x=m?.[b.id];if(!x)continue;
     let item=variants(v,x.categoryId,x.roleId).find(q=>q.id===x.variantId);
     let id=x.variantId,limit=20;while(!item&&Object.hasOwn(redirect,id)&&redirect[id]&&limit--){id=redirect[id];item=variants(v,x.categoryId,x.roleId).find(q=>q.id===id);}
     if(item){if(x.variantId!==item.id){x.variantId=item.id;repaired++;}paint(b,v,x.roleId,item);}else{delete m[b.id];unlinked++;}
     if(!Object.keys(m).length&&t.editorStyleId===styleId)delete t.editorStyleId;
   }
   return {repaired,unlinked};
 }
 function collectFromTemplates(style,groups,templates){
   const chosen=(templates||[]).filter(t=>t&&Array.isArray(t.blocks));
   if(!chosen.length)throw Error('Не выбрано ни одного шаблона.');
   const catNames=[...new Set(chosen.map(t=>t.templateGroup).filter(Boolean))];
   const paletteHits=new Map(),bucket=new Map(),fontVotes=new Map(),weightVotes=new Map(),issues=[];
   let scanned=0,accepted=0;
   for(const t of chosen){
     for(const b of t.blocks){if(b.kind!=='text')continue;scanned++;
       const color=normalizeColor(b.style?.color),w=Number(b.style?.fontWeight),size=Number(b.style?.fontSize),role=roleOf(b),font=fontName(b.style?.fontFamily);
       if(!color||!Number.isInteger(w)||w<100||w>900){issues.push(`${t.id}/${b.id}: неподдерживаемый цвет или допустимый вес`);continue;}
       accepted++;paletteHits.set(color,(paletteHits.get(color)||0)+1);
       const key=JSON.stringify([t.templateGroup,role,w,color]);let info=bucket.get(key);
       if(!info){info={category:t.templateGroup,role,weight:w,color,count:0,sizes:[],fonts:new Map(),first:bucket.size};bucket.set(key,info);}
       info.count++;if(Number.isFinite(size)&&size>0)info.sizes.push(size);
       info.fonts.set(font,(info.fonts.get(font)||0)+1);
       const fontKey=role+'\u0000'+font; fontVotes.set(fontKey,(fontVotes.get(fontKey)||0)+1);
       const weightKey=role+'\u0000'+w;weightVotes.set(weightKey,(weightVotes.get(weightKey)||0)+1);
     }
   }
   if(!accepted)throw Error('Не найдено текстовых блоков с HEX-цветом и весом.');
   // No inference that a particular source color means Primary, Accent or Secondary.
   // Every observed color is a separate, editable token, even if it matches White.
   const rank=[...paletteHits].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
   const palette={},tokens=new Map();
   for(const [hex] of rank){const name='Color '+(tokens.size+1);palette[name]=hex;tokens.set(hex,name);}
   palette.White='#ffffff';
   const typography={},seenRoles=new Set([...coreRoles,...[...bucket.values()].map(x=>x.role)]);
   for(const role of seenRoles){
     const ws=[...weightVotes].filter(([key])=>key.startsWith(role+'\u0000')).map(([key])=>Number(key.split('\u0000')[1])).sort((a,b)=>a-b);
     const families=[...fontVotes].filter(([key])=>key.startsWith(role+'\u0000')).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
     typography[role]={family:families.length?families[0][0].split('\u0000')[1]:'Inter',weights:ws.length?ws:[400,500,600,700,800],allowedColors:[...new Set([...bucket.values()].filter(x=>x.role===role).map(x=>tokens.get(x.color)))]};
   }
   const categories={},profiles={};for(const cat of groups||[])if(catNames.includes(cat)){categories[cat]={roles:{}};profiles[cat]={};}
   for(const cat of catNames)if(!categories[cat]){categories[cat]={roles:{}};profiles[cat]={};}
   const grouped=new Map();for(const item of bucket.values()){
     const k=item.category+'\u0000'+item.role; if(!grouped.has(k))grouped.set(k,[]);grouped.get(k).push(item);
   }
   let combinations=0;
   for(const [k,list] of grouped){const sep=k.indexOf('\u0000'),cat=k.slice(0,sep),role=k.slice(sep+1);
     list.sort((a,b)=>b.count-a.count||a.first-b.first);
     const variants=categories[cat].roles[role]=[];profiles[cat][role]={};
     for(const item of list){const id=uid('v'),sorted=item.sizes.sort((a,b)=>a-b);
       variants.push({id,weight:item.weight,colorToken:tokens.get(item.color)});
       profiles[cat][role][id]={count:item.count,medianSize:sorted.length?sorted[Math.floor((sorted.length-1)/2)]:null,minSize:sorted[0]||null,maxSize:sorted.at(-1)||null,
         fonts:[...item.fonts].sort((a,b)=>b[1]-a[1]).map(([name,count])=>({name,count}))};
       combinations++;
     }
   }
   style.v4={schemaVersion:4,colorMode:'observed',palette,typography,categories,sourceProfiles:profiles,applyFontFamily:false};
   return {templates:chosen.length,textBlocks:scanned,accepted,skipped:scanned-accepted,categories:catNames.length,colors:rank.length,combinations,issues:issues.slice(0,30),byGroup:Object.entries(categories).map(([group,c])=>({group,roles:Object.keys(c.roles).length,variants:Object.values(c.roles).flat().length}))};
 }
 const api={coreRoles,fixedColors,roleOf,fontName,fontRegistry,uid,validHex,validColor,colorSwatch,normalizeColor,ensure,variants,getBinding,bind,switchBound,previewDraft,auto,paint,collectFromTemplates,remapRoleColor,removeVariant,reconcileBindings};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;root.CoversStyleEngineV5=api;
})(typeof window!=='undefined'?window:globalThis);
