/* Independent image library: recursive folder import and durable, short pool: references. */
(function(){
 'use strict';
 const prefix='pool:', key='cs_v5_imgpool', urls=new Map();
 let memoryOnly=false;
 const blank='data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
 const resolve=src=>!src?'':!String(src).startsWith(prefix)?src:urls.get(src)||blank;
 window.CoversMediaV7={resolve,ready:null};
 let dbPromise;
 function database(){return dbPromise||=new Promise((ok,fail)=>{
   if(!window.indexedDB){fail(Error('IndexedDB недоступен'));return;}
   const req=indexedDB.open('covers-v7-image-library',1);
   req.onupgradeneeded=()=>{req.result.createObjectStore('images',{keyPath:'id'});};
   req.onsuccess=()=>ok(req.result);req.onerror=()=>fail(req.error);
 });}
 async function get(id){const db=await database();return new Promise((ok,fail)=>{
   const req=db.transaction('images','readonly').objectStore('images').get(id);
   req.onsuccess=()=>ok(req.result);req.onerror=()=>fail(req.error);
 });}
 async function put(entry){const db=await database();return new Promise((ok,fail)=>{
   const req=db.transaction('images','readwrite').objectStore('images').put(entry);
   req.onsuccess=()=>ok();req.onerror=()=>fail(req.error);
 });}
 const ident=()=>prefix+(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));
 async function decode(file){
   const img=await createImageBitmap(file);
   try{const scale=Math.min(1,1200/img.width,1200/img.height);
     const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));
     canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
     const type=/^image\/(png|webp)$/.test(file.type||'')?file.type:'image/jpeg';
     return await new Promise((ok,fail)=>canvas.toBlob(blob=>blob?ok(blob):fail(Error('Ошибка обработки изображения')),type,.78));
   }finally{img.close?.();}
 }
 function persistList(){try{localStorage.setItem(key,JSON.stringify(imagePool));}catch(e){toast('Библиотека изображений: список не записан — '+e.message);}}
 function repaintLoaded(){refreshImgPoolBtn();if(document.getElementById('imgPoolModal')?.classList.contains('on'))renderImgPool();
   if(window.SB_Gallery?.mode==='grid')SB_Gallery.updateCards(Object.keys(LIB));
   const t=getActiveTpl();if(t)renderCanvasTemplate(t);
 }
 async function load(){let refs=[];try{refs=JSON.parse(localStorage.getItem(key)||'[]');if(!Array.isArray(refs))refs=[];}catch(_){}
   imagePool=[];
   // Also reload files still assigned to templates after removal from the pool.
   const needed=new Set(Object.values(LIB).flatMap(t=>(t.blocks||[]).filter(b=>b.kind==='image'&&String(b.src||'').startsWith(prefix)).map(b=>b.src)));
   for(const ref of refs){if(typeof ref==='string'&&ref.startsWith(prefix)){imagePool.push(ref);needed.add(ref);}}
   try{for(const ref of needed){const record=await get(ref);if(record?.blob&&!urls.has(ref))urls.set(ref,URL.createObjectURL(record.blob));}}
   catch(e){toast('Не удалось открыть хранилище изображений: '+e.message);}
   // Migrate compact v6 data URLs, without importing them into every template JSON again.
   const legacy=refs.filter(x=>typeof x==='string'&&x.startsWith('data:image/'));
   if(legacy.length){await addFiles(legacy.map((data,i)=>({data,name:'Из старой библиотеки '+(i+1)})));persistList();}
   repaintLoaded();
 }
 async function addFiles(files){let added=0,skipped=0;
   // Sequential decoding avoids exhausting memory for large nested folders.
   for(const file of Array.from(files||[])){
     try{
       if(!file?.data&&!/^image\//.test(file.type||'')&&!/\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(file.name||'')){skipped++;continue;}
       const blob=await decode(file.data?await(await fetch(file.data)).blob():file);
       const id=ident();try{await put({id,name:file.webkitRelativePath||file.name||'image',blob});}catch(e){memoryOnly=true;}
       urls.set(id,URL.createObjectURL(blob));imagePool.push(id);added++;
       if(added%20===0){persistList();refreshImgPoolBtn();}
     }catch(e){skipped++;console.warn('Изображение не добавлено:',file.name,e);}
   }
   persistList();refreshImgPoolBtn();if(document.getElementById('imgPoolModal')?.classList.contains('on'))renderImgPool();
   if(memoryOnly)toast('Изображения загружены только в эту вкладку: постоянное хранилище недоступно. Откройте скачанный HTML в браузере.');
   else if(skipped)toast('Загружено '+added+' изображений, пропущено '+skipped);
   return {added,skipped};
 }
 // Original init and drop/file handlers reference these names at event time.
 window.loadImagePool=function(){window.CoversMediaV7.ready=load();return window.CoversMediaV7.ready;};
 window.saveImagePool=persistList;
 window.addFilesToPool=addFiles;
 window.pickPoolImage=function(){const pool=imagePool.length?imagePool:[];return pool.length?pool[Math.floor(Math.random()*pool.length)]:'';};
 function available(){if(imagePool.length)return true;toast('Сначала добавьте картинки через 🖼 → 📁 Папка или ＋ Загрузить');return false;}
 function update(ids,slots){if(!slots)return;
   window.CoversStyleV5?.persistMedia(ids); // Save on its own; during a manual session modify only the image fields of its baseline.
   if(window.SB_Gallery?.mode==='grid')SB_Gallery.updateCards(ids);
   const t=getActiveTpl();if(t&&ids.includes(t.id)){renderCanvasTemplate(t);renderInspector(t);}
   toast('🎲 Обновлено изображений: '+slots);
 }
 function randomizeTemplates(list){if(!available())return;
   const ids=list.map(t=>t.id);
   if(!window.CoversStyleV5?.sessionActive)pushUndo();
   let n=0;for(const t of list)for(const b of t.blocks||[])if(b.kind==='image'){b.src=pickPoolImage();b.isTemplatePlaceholder=false;n++;}
   update(ids,n);
 }
 function all(){randomizeTemplates(Object.values(LIB));}
 function one(){let target=null;
   if(checked.size>1){toast('Для 🎲 1 выделите только один шаблон');return;}
   if(checked.size===1)target=LIB[[...checked][0]];
   else target=getActiveTpl();
   if(!target){toast('Выберите один шаблон');return;}
   randomizeTemplates([target]);
 }
 window.randomizeVisible=all;
 window.randomizeOneSlot=function(blockId){const t=getActiveTpl();if(!t?.blocks.some(x=>x.id===blockId&&x.kind==='image'))return;
   randomizeTemplates([t]);
 };
 // File inputs with webkitdirectory recursively provide files from all subfolders.
 const folder=document.getElementById('imgPoolDirInput');
 folder?.addEventListener('change',async e=>{const files=Array.from(e.target.files||[]);if(!files.length)return;
   toast('Загружается папка: '+files.length+' файлов…');const result=await addFiles(files);e.target.value='';if(!memoryOnly)toast('Папка: добавлено '+result.added+', пропущено '+result.skipped+' · всего '+imagePool.length);});
 window.CoversMediaV7.all=all;
 document.getElementById('btnRandOne').onclick=one;
 document.getElementById('btnRandAll').onclick=all;
 document.getElementById('btnImgPool').onclick=()=>openImgPool();
})();
