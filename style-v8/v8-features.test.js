const {chromium}=require('playwright'),assert=require('assert'),path=require('path'),os=require('os'),fs=require('fs'),cp=require('child_process');
(async()=>{
 const images=fs.mkdtempSync(path.join(os.tmpdir(),'covers-v7-test-'));
 fs.mkdirSync(path.join(images,'nested'));
 cp.execFileSync('python3',['-c',`from PIL import Image; Image.new('RGB',(4,4),'red').save('${images}/a.png'); Image.new('RGB',(4,4),'green').save('${images}/nested/b.png')`]);
 const browser=await chromium.launch({args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:1600,height:950}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const clickFixed=sel=>page.locator(sel).evaluate(el=>el.click());
 try{
 await page.goto('file://'+path.resolve('Sandbox_Styles_v8_WORKING.html'));
 await page.setInputFiles('#jsFileInput',path.resolve('uploads/portfolio_template_library_all_96.js'));
 await page.waitForFunction(()=>Object.keys(LIB).length===97);
 await page.click('#btnImgPool');assert(await page.locator('#imgPoolModal').isVisible(),'left-click opens discoverable folder control');
 await page.locator('#imgPoolDirInput').setInputFiles(images);
 await page.waitForFunction(()=>imagePool.length===2);
 assert(await page.evaluate(()=>imagePool.every(x=>x.startsWith('pool:'))));
 assert.equal(await page.locator('#imgPoolGrid .img-thumb').count(),2);
 await page.click('#imgPoolClose');
 await page.click('#btnStylesV5');await page.evaluate(()=>{styleFilter='editorial-blue';renderLib();renderTopFilterDDs();renderInspector(getActiveTpl());});
 await page.click('[data-collect]');await page.click('.v5-ai [data-create]');
 const editorId=await page.evaluate(()=>CoversStyleV5.styleId);
 const flattened=await page.evaluate(id=>{const v=EDITOR_STYLES[id].v4,source=Object.values(v.categories).reduce((n,c)=>n+(c.roles.meta||[]).length,0);return {source,shown:document.querySelectorAll('[data-pick-merged="meta"]').length,rows:document.querySelectorAll('.v5-editor .role [data-open-role="meta"]').length};},editorId);
 assert(flattened.source>flattened.shown,flattened);assert.equal(flattened.rows,1);
 await page.click('[data-open-role="meta"][data-category="__all"]');assert((await page.locator('.v5-editor .role .preset-info').first().textContent()).includes('Источники:'));
 // Both automatic commands must be usable without Begin and preserve panel scroll.
 await page.evaluate(()=>document.getElementById('inspBody').scrollTop=260);
 await clickFixed('[data-auto]');assert(Math.abs((await page.evaluate(()=>document.getElementById('inspBody').scrollTop))-260)<5);
 await clickFixed('[data-variants]');assert(Math.abs((await page.evaluate(()=>document.getElementById('inspBody').scrollTop))-260)<5);
 // Flat number switches linked texts across category sources in a manual session.
 const common=await page.evaluate(id=>{
   const v=EDITOR_STYLES[id].v4,groups=new Map();
   for(const [cat,c] of Object.entries(v.categories))for(const x of c.roles.meta||[]){const k=Number(x.weight)+'|'+CoversStyleEngineV5.normalizeColor(v.palette[x.colorToken]);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(cat);}
   return [...groups].sort((a,b)=>b[1].length-a[1].length)[0][0];
 },editorId);
 await page.locator(`[data-pick-merged="meta"][data-appearance="${common}"]`).evaluate(el=>el.click());
 const sources=await page.locator('[data-merged-category="meta"] option').allTextContents();assert(sources.length>1);
 await page.selectOption('[data-merged-category="meta"]',{label:sources.at(-1)});
 await clickFixed('[data-edit-merged="meta"]');assert.equal(await page.locator('[data-category-filter]').inputValue(),sources.at(-1));
 await page.selectOption('[data-category-filter]','__all');
 const preMeta=await page.evaluate(({id,common})=>Object.values(LIB).flatMap(t=>t.editorStyleId===id?(t.blocks||[]).filter(b=>b.kind==='text'&&t.v5Bindings?.[id]?.[b.id]?.roleId==='meta').map(b=>{
   const link=t.v5Bindings[id][b.id],v=EDITOR_STYLES[id].v4,item=v.categories[link.categoryId].roles.meta.find(x=>x.id===link.variantId);
   return {t:t.id,b:b.id,variant:item.id,appearance:Number(item.weight)+'|'+CoversStyleEngineV5.normalizeColor(v.palette[item.colorToken])};
 }):[]),{id:editorId,common});
 const selectedMeta=preMeta.find(x=>x.appearance!==common);assert(selectedMeta&&preMeta.length>2);
 await page.evaluate(({t,b})=>{selectTpl(t);selectedBlockId=b;renderCanvasTemplate(LIB[t]);renderInspector(LIB[t]);},selectedMeta);
 await clickFixed('[data-start]');assert(Math.abs((await page.evaluate(()=>document.getElementById('inspBody').scrollTop))-260)<5);
 await page.locator(`[data-pick-merged="meta"][data-appearance="${common}"]`).evaluate(el=>el.click());
 assert(await page.evaluate(({preMeta,id,common,selectedMeta})=>preMeta.every(({t,b,variant})=>{
   const tpl=LIB[t],link=tpl.v5Bindings[id][b],v=EDITOR_STYLES[id].v4,item=v.categories[link.categoryId].roles[link.roleId].find(x=>x.id===link.variantId);
   return t===selectedMeta.t&&b===selectedMeta.b?Number(item.weight)+'|'+CoversStyleEngineV5.normalizeColor(v.palette[item.colorToken])===common&&link.manual:link.variantId===variant;
 }),{preMeta,id:editorId,common,selectedMeta}),'one selected text changes; all other texts retain individual numbers');
 await clickFixed('[data-auto]');await clickFixed('[data-variants]');
 await clickFixed('[data-cancel]');assert(Math.abs((await page.evaluate(()=>document.getElementById('inspBody').scrollTop))-260)<5);
 // Full-library randomization ignores the selection and current filters, without Begin.
 const scenario=await page.evaluate(()=>{const blue=Object.values(LIB).find(t=>t.visualStyle==='editorial-blue'&&t.blocks.some(b=>b.kind==='image'));
   const cine=Object.values(LIB).find(t=>t.visualStyle==='cinematic'&&t.blocks.some(b=>b.kind==='image'));
   checked=new Set([blue.id]);styleFilter='editorial-blue';renderLib();return {blue:blue.id,cine:cine.id};});
 await page.click('#btnRandAll');
 assert(await page.evaluate(({blue,cine})=>[blue,cine].every(id=>LIB[id].blocks.some(b=>b.kind==='image'&&b.src.startsWith('pool:'))),scenario));
 // One randomizes only the one checked template; clearing its slot makes the effect unambiguous.
 await page.evaluate(({blue,cine})=>{LIB[blue].blocks.find(b=>b.kind==='image').src='';LIB[cine].blocks.find(b=>b.kind==='image').src='';},scenario);
 await page.click('#btnRandOne');
 assert(await page.evaluate(({blue,cine})=>LIB[blue].blocks.some(b=>b.kind==='image'&&b.src.startsWith('pool:'))&&LIB[cine].blocks.some(b=>b.kind==='image'&&b.src===''),scenario));
 await page.evaluate(()=>{checked.clear();styleFilter='all';renderLib();renderTopFilterDDs();renderInspector(getActiveTpl());});
 const single=await page.evaluate(()=>{const t=Object.values(LIB).find(t=>t.blocks.filter(b=>b.kind==='image').length>1);if(!t)return null;
   selectTpl(t.id);t.blocks.filter(b=>b.kind==='image').forEach(b=>b.src='');renderCanvasTemplate(t);return t.id;});
 assert(single,'fixture has a multi-image template');
 await page.locator('#cvCanvas .slot-dice').first().click();
 assert(await page.evaluate(tid=>LIB[tid].blocks.filter(b=>b.kind==='image').every(b=>b.src.startsWith('pool:')),single),'Single-view dice randomizes the whole selected template');
 await page.click('[data-view="grid"]');await page.waitForFunction(()=>document.querySelectorAll('.gal-card [data-v5-block]').length>10);
 // Choose bound source and two targets on separate cards. No manual session is active.
 const picks=await page.evaluate(id=>{
   const found=Object.values(LIB).filter(t=>t.editorStyleId===id&&t.blocks.some(b=>b.kind==='text'&&t.v5Bindings?.[id]?.[b.id])).slice(0,2);
   const outsider=Object.values(LIB).find(t=>t.visualStyle==='cinematic'&&t.blocks.some(b=>b.kind==='text'));
   const source=found.map(t=>({t:t.id,b:t.blocks.find(b=>b.kind==='text'&&t.v5Bindings[id][b.id]).id}));
   source.push({t:outsider.id,b:outsider.blocks.find(b=>b.kind==='text').id});return source;
 },editorId);
 assert.equal(picks.length,3);
 const alt=async(p,more=false)=>page.evaluate(({p,more})=>{
   const card=[...document.querySelectorAll('.gal-card')].find(n=>n.dataset.id===p.t),text=[...card.querySelectorAll('[data-v5-block]')].find(n=>n.dataset.v5Block===p.b);
   text.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,altKey:true,ctrlKey:more}));
 },{p,more});
 await alt(picks[0]);assert.equal(await page.evaluate(()=>CoversStyleV5.blockPicks.size),1);
 await page.evaluate(()=>document.getElementById('inspBody').scrollTop=320);
 await clickFixed('[data-copy-text]');assert(Math.abs((await page.evaluate(()=>document.getElementById('inspBody').scrollTop))-320)<5);
 const snapshot=await page.evaluate(({picks,id})=>{
   const src=LIB[picks[0].t],x=src.v5Bindings[id][picks[0].b],preset=EDITOR_STYLES[id].v4.categories[x.categoryId].roles[x.roleId].find(v=>v.id===x.variantId);
   LIB[picks[2].t].blocks.find(b=>b.id===picks[2].b).style.fontFamily='CinemaOnly';
   const data=picks.slice(1).map(p=>{const t=LIB[p.t],b=t.blocks.find(b=>b.id===p.b);return {t:t.id,b:b.id,font:b.style.fontFamily,size:b.style.fontSize,role:b.role,content:b.content,geometry:[b.x,b.y,b.w,b.h],program:t.visualStyle};});
   EDITOR_STYLES[id].v4.applyFontFamily=true; // transfer must still preserve target family.
   return {binding:x,weight:preset.weight,color:EDITOR_STYLES[id].v4.palette[preset.colorToken],data};
 },{picks,id:editorId});
 await alt(picks[1]);await alt(picks[2],true);
 assert.equal(await page.evaluate(()=>CoversStyleV5.blockPicks.size),2);
 await clickFixed('[data-paste-text]');
 assert(await page.evaluate(({snapshot,id})=>snapshot.data.every(x=>{
   const t=LIB[x.t],b=t.blocks.find(b=>b.id===x.b),link=t.v5Bindings[id][x.b];return link.categoryId===snapshot.binding.categoryId&&link.roleId===snapshot.binding.roleId&&link.variantId===snapshot.binding.variantId&&b.style.fontWeight===snapshot.weight&&b.style.color===snapshot.color&&b.style.fontFamily===x.font&&b.style.fontSize===x.size&&b.role===x.role&&b.content===x.content&&JSON.stringify([b.x,b.y,b.w,b.h])===JSON.stringify(x.geometry)&&t.visualStyle===x.program&&t.editorStyleId===id;
 }),{snapshot,id:editorId}));
 assert(Math.abs((await page.evaluate(()=>document.getElementById('inspBody').scrollTop))-320)<5);
 const previewCard=await page.evaluate(()=>{window.__v7Card=document.querySelector('.gal-card');return window.__v7Card.dataset.id;});
 await page.evaluate(()=>window.undo());
 assert(!await page.evaluate(({picks,id})=>LIB[picks[2].t].editorStyleId===id,{picks,id:editorId}),'one Undo reverts the cross-program paste');
 await page.evaluate(()=>window.redo());
 assert(await page.evaluate(({picks,id})=>LIB[picks[2].t].editorStyleId===id,{picks,id:editorId}));
 assert(await page.evaluate(()=>window.__v7Card===document.querySelector('.gal-card')),'Undo/redo do not rebuild Map cards');
 // One text from another card remains selected after a regular card click? No: card selection stays normal.
 await page.locator('.gal-card').first().dispatchEvent('click');assert.equal(await page.evaluate(()=>CoversStyleV5.blockPicks.size),0);
 await page.locator('.gal-card').nth(1).dispatchEvent('click',{ctrlKey:true});assert.equal(await page.evaluate(()=>checked.size),2,'regular Ctrl+click still selects multiple templates');
 await page.locator('.gal-card').first().dispatchEvent('dblclick');assert.equal(await page.evaluate(()=>SB_Gallery.mode),'single','double click still opens One');
 await page.click('[data-view="grid"]');
 await clickFixed('[data-start]');assert(Math.abs((await page.evaluate(()=>document.getElementById('inspBody').scrollTop))-320)<5);
 await page.click('#btnImgPool');assert(await page.locator('#imgPoolModal').isVisible());
 await page.locator('#imgPoolInput').setInputFiles(path.join(images,'nested','b.png'));await page.waitForFunction(()=>imagePool.length===3);
 await page.click('#imgPoolClose');
 await page.click('#btnRandAll');const mediaDuring=await page.evaluate(tid=>LIB[tid].blocks.find(b=>b.kind==='image')?.src,scenario.cine);
 await page.click('[data-cancel]');
 assert.equal(await page.evaluate(tid=>LIB[tid].blocks.find(b=>b.kind==='image')?.src,scenario.cine),mediaDuring,'Cancel leaves image randomization intact');
 assert(await page.evaluate(({picks,id})=>picks.slice(1).every(p=>!!LIB[p.t].v5Bindings[id][p.b]),{picks,id:editorId}),'outside-session copy persists');
 // Compact ordinary action bar fits all three controls on one row.
 await page.click('#btnStylesV5');await page.evaluate(()=>{checked.add(Object.keys(LIB)[0]);renderLib();renderBulkBar();});
 const geometry=await page.evaluate(()=>{const ids=['bulkCopyProgram','bulkClear','bulkDelete'],els=ids.map(x=>document.getElementById(x).getBoundingClientRect()),bar=document.getElementById('bulkBar').getBoundingClientRect();return {els:els.map(x=>({x:x.x,right:x.right,y:x.y,center:x.y+x.height/2})),right:bar.right};});
 assert(geometry.els.every(x=>Math.abs(x.center-geometry.els[0].center)<2&&x.right<=geometry.right+1),JSON.stringify(geometry));
 await page.reload();await page.waitForFunction(()=>imagePool.length===3);
 assert(await page.evaluate(({picks,id})=>picks.slice(1).every(p=>!!LIB[p.t].v5Bindings[id][p.b]),{picks,id:editorId}));
 const afterReload=await page.evaluate(({scenario})=>({slot:LIB[scenario.cine].blocks.filter(b=>b.kind==='image').map(b=>({src:b.src,url:CoversMediaV7.resolve(b.src)})),pool:imagePool,notice:document.querySelector('#toast').textContent}),{scenario});
 assert(afterReload.slot.some(b=>b.src.startsWith('pool:')&&b.url.startsWith('blob:')),JSON.stringify(afterReload));
 await page.click('#btnStylesV5');await page.selectOption('[data-style]',editorId);
 const mergedDelete=await page.evaluate(()=>{
   const chip=[...document.querySelectorAll('[data-pick-merged="meta"]')].find(el=>{
     const v=EDITOR_STYLES[CoversStyleV5.styleId].v4,k=el.dataset.appearance;
     return Object.values(v.categories).filter(c=>(c.roles.meta||[]).some(x=>Number(x.weight)+'|'+CoversStyleEngineV5.normalizeColor(v.palette[x.colorToken])===k)).length>1;
   });
   const v=EDITOR_STYLES[CoversStyleV5.styleId].v4,k=chip.dataset.appearance;
   return {appearance:k,ids:Object.entries(v.categories).flatMap(([cat,c])=>(c.roles.meta||[]).filter(x=>Number(x.weight)+'|'+CoversStyleEngineV5.normalizeColor(v.palette[x.colorToken])===k).map(x=>x.id))};
 });
 await page.locator(`[data-pick-merged="meta"][data-appearance="${mergedDelete.appearance}"]`).click({modifiers:['Alt']});
 assert(await page.evaluate(({id,ids})=>{const v=EDITOR_STYLES[id].v4;return Object.values(v.categories).every(c=>(c.roles.meta||[]).every(x=>!ids.includes(x.id)))&&Object.values(LIB).every(t=>Object.values(t.v5Bindings?.[id]||{}).every(x=>!ids.includes(x.variantId)));},{id:editorId,ids:mergedDelete.ids}),'merged deletion repairs every source category');
 assert.deepEqual(errors,[]);console.log('v8 features passed:',flattened,'folder recursion, map copy, scroll, media persistence, undo scope, compact bulk bar');
 }finally{await browser.close();fs.rmSync(images,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1)});
