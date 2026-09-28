const {chromium}=require('playwright'),assert=require('assert'),path=require('path');
(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:1600,height:920}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 try{
 await page.goto('file://'+path.resolve('Sandbox_Styles_v8_WORKING.html'));
 await page.setInputFiles('#jsFileInput',path.resolve('uploads/portfolio_template_library_all_96.js'));
 await page.waitForFunction(()=>Object.keys(LIB).length===97);
 await page.click('#btnStylesV5');await page.evaluate(()=>{styleFilter='editorial-blue';renderLib();renderTopFilterDDs();renderInspector(getActiveTpl());});
 await page.click('[data-collect]');await page.click('.v5-ai [data-create]');
 const id=await page.evaluate(()=>CoversStyleV5.styleId);
 await page.click('[data-auto]');await page.selectOption('[data-category-filter]','Intro');
 const state=await page.evaluate(id=>{
   const v=EDITOR_STYLES[id].v4,variants=v.categories.Intro.roles.meta.map(x=>x.id);
   const picks=Object.values(LIB).filter(t=>t.editorStyleId===id&&t.templateGroup==='Intro').flatMap(t=>(t.blocks||[]).filter(b=>b.kind==='text'&&t.v5Bindings?.[id]?.[b.id]?.categoryId==='Intro'&&t.v5Bindings[id][b.id].roleId==='meta').map(b=>({t:t.id,b:b.id})));
   const distinct=[...new Map(picks.map(x=>[x.t,x])).values()];return {variants,picks:distinct.length>=3?distinct:picks};
 },id);
 assert(state.variants.length>=2&&state.picks.length>=3,JSON.stringify(state));
 await page.click('[data-view="grid"]');await page.waitForFunction(()=>document.querySelectorAll('.gal-card [data-v5-block]').length>30);
 const pick=async(p,add=false)=>page.evaluate(({p,add})=>{const card=[...document.querySelectorAll('.gal-card')].find(x=>x.dataset.id===p.t);
   const el=[...card.querySelectorAll('[data-v5-block]')].find(x=>x.dataset.v5Block===p.b);
   el.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,altKey:true,ctrlKey:add}));
 },{p,add});
 const selected=state.picks.slice(0,3),snapshot=()=>page.evaluate(({picks,id})=>picks.map(({t,b})=>{
   const tpl=LIB[t],x=tpl.v5Bindings[id][b];return {t,b,variant:x.variantId,manual:x.manual,color:tpl.blocks.find(z=>z.id===b).style.color,weight:tpl.blocks.find(z=>z.id===b).style.fontWeight};
 }),{picks:state.picks,id});
 const firstBefore=await snapshot();
 // A single selected text gets its own new number; no other link in this role moves.
 await pick(selected[0]);
 const other=state.variants.find(x=>x!==firstBefore[0].variant);
 await page.locator(`[data-role-row="meta"][data-category="Intro"] [data-pick][data-id="${other}"]`).evaluate(el=>el.click());
 const firstAfter=await snapshot();assert.equal(firstAfter[0].variant,other);assert(firstAfter[0].manual);
 assert.deepEqual(firstAfter.slice(1),firstBefore.slice(1),'single selection must not change other linked texts');
 assert.equal(await page.locator('[data-role-row="meta"][data-category="Intro"] .v6-selected').count(),1);
 assert((await page.locator('.v6-binding-row.v6-binding-selected').textContent()).includes('№'+(state.variants.indexOf(other)+1)));
 // Two selected blocks (possibly on different Map cards) receive ONE chosen number; third stays put.
 await pick(selected[1]);await pick(selected[2],true);
 const multiBefore=await snapshot();assert.equal(await page.evaluate(()=>CoversStyleV5.blockPicks.size),2);
 const target=state.variants.find(x=>x!==other);
 await page.locator(`[data-role-row="meta"][data-category="Intro"] [data-pick][data-id="${target}"]`).evaluate(el=>el.click());
 const multiAfter=await snapshot();assert.equal(multiAfter[0].variant,other);
 assert.equal(multiAfter[1].variant,target);assert.equal(multiAfter[2].variant,target);
 assert(multiAfter[1].manual&&multiAfter[2].manual);
 assert.deepEqual(multiAfter.slice(3),multiBefore.slice(3),'other texts of this role retain their own numbers');
 assert((await page.locator('.v6-binding-row.v6-binding-selected').count())===2);
 // Explicit picks become manual and Auto/Variants must not overwrite them.
 await page.evaluate(()=>{checked.clear();styleFilter='editorial-blue';renderLib();});
 await page.locator('[data-auto]').evaluate(el=>el.click());await page.locator('[data-variants]').evaluate(el=>el.click());
 assert.equal((await snapshot())[0].variant,other);assert.equal((await snapshot())[1].variant,target);
 // With NO selected text, changing a number only updates the choice in the panel.
 await page.evaluate(()=>{CoversStyleV5.blockPicks.clear();document.querySelectorAll('#galRoot .v5-picked').forEach(x=>x.classList.remove('v5-picked'));renderInspector(getActiveTpl());});
 const noSelectionBefore=await snapshot();
 await page.locator(`[data-role-row="meta"][data-category="Intro"] [data-pick][data-id="${other}"]`).evaluate(el=>el.click());
 assert.deepEqual(await snapshot(),noSelectionBefore);
 // Live draft changes only the selected text, then Cancel restores templates but retains the preset.
 await pick(selected[0]);const beforeDraft=await snapshot();
 await page.locator('[data-start]').evaluate(el=>el.click());
 await page.locator('[data-plus="meta"][data-category="Intro"]').evaluate(el=>el.click());
 const fresh=await page.evaluate(id=>{const v=EDITOR_STYLES[id].v4,d=CoversStyleV5.draft;return v.typography.meta.weights.find(w=>!v.categories.Intro.roles.meta.some(x=>x.colorToken===d.colorToken&&x.weight===w));},id);
 assert(fresh);await page.selectOption('[data-v-weight="meta"][data-category="Intro"]',String(fresh));
 const preview=await snapshot();assert.equal(preview[0].weight,fresh);assert.deepEqual(preview.slice(1),beforeDraft.slice(1),'preview must only paint the selected text');
 await page.locator('[data-plus="meta"][data-category="Intro"]').evaluate(el=>el.click());
 const savedDraft=await snapshot();assert.notEqual(savedDraft[0].variant,beforeDraft[0].variant);assert.deepEqual(savedDraft.slice(1),beforeDraft.slice(1));
 await page.locator('[data-cancel]').evaluate(el=>el.click());
 assert.deepEqual(await snapshot(),beforeDraft);assert(await page.evaluate(({id,fresh})=>EDITOR_STYLES[id].v4.categories.Intro.roles.meta.some(x=>x.weight===fresh),{id,fresh}));
 // The same per-text scope holds inside Begin, both for Cancel and Apply.
 const sessionTarget=state.variants.find(x=>x!==beforeDraft[0].variant);
 await pick(selected[0]);await page.locator('[data-start]').evaluate(el=>el.click());
 await page.locator(`[data-role-row="meta"][data-category="Intro"] [data-pick][data-id="${sessionTarget}"]`).evaluate(el=>el.click());
 let inSession=await snapshot();assert.equal(inSession[0].variant,sessionTarget);assert.deepEqual(inSession.slice(1),beforeDraft.slice(1));
 await page.locator('[data-cancel]').evaluate(el=>el.click());assert.deepEqual(await snapshot(),beforeDraft);
 await pick(selected[0]);await page.locator('[data-start]').evaluate(el=>el.click());
 await page.locator(`[data-role-row="meta"][data-category="Intro"] [data-pick][data-id="${sessionTarget}"]`).evaluate(el=>el.click());
 await page.locator('[data-apply]').evaluate(el=>el.click());
 inSession=await snapshot();assert.equal(inSession[0].variant,sessionTarget);assert.deepEqual(inSession.slice(1),beforeDraft.slice(1));
 assert.equal(await page.evaluate(()=>CoversStyleV5.blockPicks.size),1,'Apply leaves the selected text visible');
 assert.equal(await page.evaluate(({p,id})=>JSON.parse(localStorage.getItem('cs_v5_lib'))[p.t].v5Bindings[id][p.b].variantId,{p:selected[0],id}),sessionTarget);
 // In the flattened All view, one text in another category also keeps its own number.
 await page.selectOption('[data-category-filter]','__all');
 const across=await page.evaluate(id=>{const v=EDITOR_STYLES[id].v4;
   return Object.values(LIB).filter(t=>t.editorStyleId===id&&t.templateGroup!=='Intro').flatMap(t=>t.blocks.filter(b=>b.kind==='text'&&t.v5Bindings?.[id]?.[b.id]?.roleId==='meta').map(b=>({t:t.id,b:b.id}))).slice(0,1);
 },id);assert.equal(across.length,1);
 await pick(selected[0]);await pick(across[0],true);
 const acrossBefore=await page.evaluate(({items,id})=>items.map(({t,b})=>LIB[t].v5Bindings[id][b].variantId),{items:[...selected,across[0]],id});
 const allChip=page.locator('[data-pick-merged="meta"]').last();const appearance=await allChip.getAttribute('data-appearance');
 await allChip.evaluate(el=>el.click());
 assert(await page.evaluate(({items,id,appearance,before})=>items.every(({t,b},i)=>{
   const x=LIB[t].v5Bindings[id][b],v=EDITOR_STYLES[id].v4,item=v.categories[x.categoryId].roles[x.roleId].find(z=>z.id===x.variantId);
   return i===0||i===items.length-1?Number(item.weight)+'|'+CoversStyleEngineV5.normalizeColor(v.palette[item.colorToken])===appearance:x.variantId===before[i];
 }),{items:[...selected,across[0]],id,appearance,before:acrossBefore}));
 assert.deepEqual(errors,[]);console.log('v8 individual preset numbers passed: single, multi, blank selection, Auto, draft, All categories');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
