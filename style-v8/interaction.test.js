const {chromium}=require('playwright'),assert=require('assert'),path=require('path');
(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:1600,height:900}});const errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.goto('file://'+path.resolve('Sandbox_Styles_v8_WORKING.html'));
 await page.setInputFiles('#jsFileInput',path.resolve('uploads/portfolio_template_library_all_96.js'));
 await page.waitForFunction(()=>Object.keys(LIB).length===97);
 await page.click('#btnStylesV5');await page.evaluate(()=>{styleFilter='editorial-blue';renderLib();renderTopFilterDDs();renderInspector(getActiveTpl());});
 await page.click('[data-collect]');await page.click('.v5-ai [data-create]');
 const id=await page.evaluate(()=>CoversStyleV5.styleId),ids=await page.evaluate(()=>Object.values(LIB).filter(t=>t.templateGroup==='Project Cover'&&t.visualStyle==='editorial-blue'&&t.blocks.some(b=>b.kind==='text')).slice(0,2).map(t=>t.id));
 assert.equal(ids.length,2);await page.selectOption('select[data-category-filter]','Intro');
 const introMeta=await page.evaluate(id=>EDITOR_STYLES[id].v4.categories.Intro.roles.meta.map(x=>x.id),id);assert(introMeta.length>=2);
 await page.evaluate(id=>{styleFilter='all';renderLib();selectTpl(id);selectedBlockId=LIB[id].blocks.find(b=>b.kind==='text').id;renderCanvasTemplate(LIB[id]);renderInspector(LIB[id]);},ids[0]);
 const firstBefore=await page.evaluate(id=>structuredClone(LIB[id]),ids[0]);
 await page.click('[data-start]');
 for(const tid of ids){await page.evaluate(tid=>{selectTpl(tid);selectedBlockId=LIB[tid].blocks.find(b=>b.kind==='text').id;renderCanvasTemplate(LIB[tid]);renderInspector(LIB[tid]);},tid);await page.click('[data-assign="meta"][data-category="Intro"]');}
 await page.locator('[data-role-row="meta"][data-category="Intro"] [data-pick]').nth(1).click();
 assert(await page.evaluate(({ids,id,first,second})=>ids.every((tid,i)=>{const t=LIB[tid],b=t.blocks.find(x=>x.kind==='text');return t.visualStyle==='editorial-blue'&&t.v5Bindings[id][b.id].variantId===(i?second:first);}),{ids,id,first:introMeta[0],second:introMeta[1]}),'a number change affects only the selected text');
 // Create a new preset in the transaction. It belongs to the editor, not the program style.
 await page.locator('[data-plus="meta"][data-category="Intro"]').click();
 const fresh=await page.evaluate(id=>{const v=EDITOR_STYLES[id].v4,role=v.categories.Intro.roles.meta;
   return v.typography.meta.weights.find(w=>!role.some(x=>x.colorToken===role[1].colorToken&&x.weight===w));},id);
 assert(fresh);await page.locator('[data-v-weight="meta"][data-category="Intro"]').selectOption(String(fresh));
 await page.locator('[data-plus="meta"][data-category="Intro"]').click();
 assert.equal(await page.evaluate(id=>EDITOR_STYLES[id].v4.categories.Intro.roles.meta.length,id),introMeta.length+1);
 await page.click('[data-cancel]');
 assert.equal(await page.evaluate(()=>selectedId),ids[1]);
 assert.equal(await page.evaluate(id=>EDITOR_STYLES[id].v4.categories.Intro.roles.meta.length,id),introMeta.length+1);
 assert.deepEqual(await page.evaluate(tid=>structuredClone(LIB[tid]),ids[0]),firstBefore);
 assert(await page.evaluate(ids=>ids.every(tid=>LIB[tid].visualStyle==='editorial-blue'),ids));
 await page.evaluate(ids=>{checked=new Set(ids);paintSelection();},ids);await page.click('[data-auto]');
 // Remove a used variant in a transaction: Cancel keeps the deletion, with repaired prior bindings.
 const template=await page.evaluate(({ids,id})=>{const t=LIB[ids[0]],b=t.blocks.find(b=>b.kind==='text'&&t.v5Bindings?.[id]?.[b.id]);return {id:t.id,blockId:b.id,binding:t.v5Bindings[id][b.id]};},{ids,id});
 await page.selectOption('select[data-category-filter]',template.binding.categoryId);
 await page.click('[data-start]');
 const idx=await page.evaluate(({id,binding})=>EDITOR_STYLES[id].v4.categories[binding.categoryId].roles[binding.roleId].findIndex(x=>x.id===binding.variantId),{id,binding:template.binding});
 await page.locator(`[data-role-row="${template.binding.roleId}"][data-category="${template.binding.categoryId}"] [data-pick]`).nth(idx).click({modifiers:['Alt']});
 await page.click('[data-cancel]');
 assert(!await page.evaluate(({id,binding})=>EDITOR_STYLES[id].v4.categories[binding.categoryId].roles[binding.roleId].some(x=>x.id===binding.variantId),{id,binding:template.binding}));
 assert(await page.evaluate(({id,t})=>{const text=LIB[t.id].blocks.find(b=>b.id===t.blockId),x=LIB[t.id].v5Bindings?.[id]?.[text.id];return !x||EDITOR_STYLES[id].v4.categories[x.categoryId].roles[x.roleId].some(item=>item.id===x.variantId);},{id,t:template}));
 // Map supports Alt+text selection and in-place updates even after undo.
 await page.click('[data-view="grid"]');await page.waitForFunction(()=>document.querySelectorAll('.gal-card .sb-gal-page').length===97);
 await page.evaluate(()=>window.__firstCard=document.querySelector('.gal-card'));
 await page.click('[data-start]');const blocks=page.locator('.gal-card [data-v5-block]');
 await blocks.first().evaluate(el=>el.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,altKey:true})));
 await blocks.nth(1).evaluate(el=>el.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,altKey:true,ctrlKey:true})));
 assert.equal(await page.evaluate(()=>CoversStyleV5.blockPicks.size),2);
 await page.locator('[data-palette="Color 1"]').fill('#ff3377');
 assert(await page.evaluate(()=>document.querySelector('.gal-card')===window.__firstCard));
 await page.keyboard.press('Control+z');assert(await page.evaluate(()=>document.querySelector('.gal-card')===window.__firstCard));
 await page.click('[data-cancel]');assert.deepEqual(errors,[]);
 console.log('v8 interaction passed: cross-category links, last viewed, durable preset deletion, map selection and undo');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
