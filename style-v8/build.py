"""Build independent, self-contained Styles v8 from the untouched Original."""
from pathlib import Path
import re
root=Path(__file__).resolve().parent
src=(root.parent/'uploads/Sandbox_Original.html').read_text()
src=re.sub(r'<script>\(function\(\)\{function c\(\).*?</script>','',src,count=1,flags=re.S)
assert 'const GROUP_ORDER' in src and 'window.SB_Gallery={' in src
for old,new in [('cs_lib','cs_v5_lib'),('cs_styles','cs_v5_styles'),('cs_batches','cs_v5_batches'),('cs_prompts','cs_v5_prompts'),('cs_imgpool','cs_v5_imgpool'),('cs_tpl_dir','cs_v5_tpl_dir')]:
    src=src.replace("'"+old+"'","'"+new+"'")
src=src.replace('<button class="tb-btn" id="btnRandAll" title="Рандомизировать все картинки">🎲 Все</button>', '<button class="tb-btn" id="btnRandAll" title="Рандомизировать ВСЕ шаблоны библиотеки">🎲 Все</button>\n      <button class="tb-btn" id="btnRandOne" title="Рандомизировать один выделенный шаблон">🎲 1</button>',1)
src=src.replace('        <button class="tb-btn danger" id="btnImgPoolClear">Очистить</button>', '        <label class="tb-btn" style="cursor:pointer">📁 Папка<input type="file" id="imgPoolDirInput" accept="image/*" webkitdirectory directory multiple style="display:none"></label>\n        <button class="tb-btn danger" id="btnImgPoolClear">Очистить</button>',1)
src=src.replace('<button class="tb-btn danger" id="btnClear">Очистить</button>', '<button class="tb-btn" id="btnStylesV5" title="Редактор стилей">Стили</button>\n    <button class="tb-btn danger" id="btnClear">Очистить</button>',1)
old='const GROUP_ORDER = ["Intro","About","Project Cover","Project Content","Gallery","Text","Contact / Outro"];'
assert old in src
new=old+'''
// One shared category registry for library, style editor, filters and AI reception.
try{const extra=JSON.parse(localStorage.getItem('cs_v5_groups')||'[]');if(Array.isArray(extra))extra.forEach(g=>{if(typeof g==='string'&&g.length<=80&&!GROUP_ORDER.includes(g))GROUP_ORDER.push(g);});}catch(_){}
function ensureGroupName(value){
  const name=String(value||'').trim();if(!name)return 'Project Cover';
  if(!GROUP_ORDER.includes(name)){
    GROUP_ORDER.push(name);
    if(!window.CoversStyleV5?.sessionActive){try{localStorage.setItem('cs_v5_groups',JSON.stringify(GROUP_ORDER));}catch(_){}}
  }
  return name;
}
'''
src=src.replace(old,new,1)
# Preserve category registry across regular Undo and session Cancel.
src=src.replace("checked:[...checked], styleFilter, favOnly };", "checked:[...checked], styleFilter, favOnly, groups:[...GROUP_ORDER], groupFilter:[...groupFilterSel] };")
src=src.replace("LIB=s.LIB||{}; BATCHES=s.BATCHES||{}; STYLES=s.STYLES||STYLES;", "LIB=s.LIB||{}; BATCHES=s.BATCHES||{}; STYLES=s.STYLES||STYLES; if(s.groups){GROUP_ORDER.splice(0,GROUP_ORDER.length,...s.groups);groupFilterSel.clear();(s.groupFilter||[]).forEach(g=>groupFilterSel.add(g));try{if(!window.CoversStyleV5?.sessionActive)localStorage.setItem('cs_v5_groups',JSON.stringify(GROUP_ORDER));}catch(_){}}")
# Program-side copying is explicit, next to the existing template Duplicate and bulk selection.
assert '<button class="mini-btn" id="actDup">⧉ Дублировать</button>' in src
src=src.replace('<button class="mini-btn" id="actDup">⧉ Дублировать</button>', '<button class="mini-btn" id="actDup">⧉ Дублировать</button>\n      <button class="mini-btn" id="actCopyToProgram" title="Копировать выбранные шаблоны в новый стиль программы">⧉ В новый стиль</button>',1)
src=src.replace("  document.getElementById('actCopy').onclick=()=>{", "  document.getElementById('actCopyToProgram').onclick=()=>window.CoversProgramCopyV6?.duplicateIntoNewProgramStyle(checked.size?[...checked]:[t.id]);\n  document.getElementById('actCopy').onclick=()=>{",1)
src=src.replace('          <button class="bbtn ghost" id="bulkClear">Снять</button>', '          <button class="bbtn ghost" id="bulkCopyProgram" title="Копировать выделенные в новый стиль программы">⧉ В новый стиль</button>\n          <button class="bbtn ghost" id="bulkClear">Снять</button>',1)
src=src.replace('<div class="brow">\n          <button class="bbtn ghost" id="bulkCopyProgram"', '<div class="brow v7-bulk-actions">\n          <button class="bbtn ghost" id="bulkCopyProgram"',1)
src=src.replace('</style>\n</head>', '.bulk-bar .brow.v7-bulk-actions{grid-template-columns:minmax(0,1.35fr) minmax(0,.65fr) 36px;gap:5px}.v7-bulk-actions .bbtn{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:5px 3px;font-size:10px}\n</style>\n</head>',1)

# A single undo history includes the independent editor-style metadata, but Cancel uses only templates.
src=src.replace('STYLES:deepClone(STYLES), selectedId', 'STYLES:deepClone(STYLES), EDITOR_STYLES:deepClone(EDITOR_STYLES), selectedId',1)
src=src.replace('STYLES=s.STYLES||STYLES; if(s.groups)', 'STYLES=s.STYLES||STYLES; if(s.EDITOR_STYLES)EDITOR_STYLES=s.EDITOR_STYLES;window.CoversEditorStoreV6?.persist(); if(s.groups)',1)
# Archives transfer BOTH namespaces independently. Older archives are migrated by reconcile().

src=src.replace('      if(d.batches && typeof d.batches', "      if(d.editorStyles && typeof d.editorStyles==='object')EDITOR_STYLES=d.editorStyles;else if(d.styles)Object.entries(d.styles).forEach(([id,st])=>{if(st?.v4)EDITOR_STYLES[id]=st;});\n      if(d.batches && typeof d.batches",1)
src=src.replace('      store.save(); store.saveStyles(); store.saveBatches();\n      renderLib();', '      window.CoversEditorStoreV6?.reconcile();store.save(); store.saveStyles(); store.saveBatches();\n      renderLib();',1)
# Never silently file unknown template groups under Project Cover.
src=src.replace("GROUP_ORDER.includes(raw.templateGroup)?raw.templateGroup:'Project Cover'", "ensureGroupName(raw.templateGroup)")
src=src.replace("GROUP_ORDER.includes(t.templateGroup)?t.templateGroup:'Project Cover'", "ensureGroupName(t.templateGroup)")
# Retain v4 bindings through legacy JS template exports/imports; archive retains them already.
src=src.replace('batch:batchId,blocks:raw.blocks}', 'batch:batchId,blocks:raw.blocks,v5Bindings:raw.v5Bindings||raw.v4Bindings||{}}')
src=src.replace('batch:bid,blocks:raw.blocks}', 'batch:bid,blocks:raw.blocks,v5Bindings:raw.v5Bindings||raw.v4Bindings||{}}')
# Keep v4 bindings in the legacy JSON importer too.
src=src.replace('      isFavorite: !!(raw.isFavorite || raw.favorite),\n      blocks\n    };', '      isFavorite: !!(raw.isFavorite || raw.favorite),\n      blocks, v5Bindings:raw.v5Bindings||raw.v4Bindings||{}\n    };', 1)
# Archives carry a category registry even for empty style categories; older archives still work.
src=src.replace('templates:LIB, styles:STYLES, batches:BATCHES, prompts:PROMPTS', 'templates:LIB, styles:STYLES, editorStyles:EDITOR_STYLES, batches:BATCHES, prompts:PROMPTS, groups:GROUP_ORDER',1)
src=src.replace("if(d.styles && typeof d.styles==='object') STYLES=Object.assign({'editorial-blue':STYLES['editorial-blue'],'cinematic':STYLES['cinematic']},d.styles);", "if(d.styles && typeof d.styles==='object') STYLES=Object.assign({'editorial-blue':STYLES['editorial-blue'],'cinematic':STYLES['cinematic']},d.styles); if(Array.isArray(d.groups))d.groups.forEach(ensureGroupName); Object.values(STYLES).forEach(st=>Object.keys(st.v4?.categories||{}).forEach(ensureGroupName));")
src=src.replace("            LIB[t.id]=t;\n          }\n        });", "            t.templateGroup=ensureGroupName(t.templateGroup);t.v5Bindings ||= t.v4Bindings||{};LIB[t.id]=t;\n          }\n        });",1)
# Keep text layout and source shape fills untouched; neutralise only media safety plates in previews.
src=src.replace("sh.style.background = b.style?.fill||'#fff';", "sh.style.background = window.CoversNeutralMediaV6?.(t,b)||b.style?.fill||'#fff';",1)
# Only the Map _buildPreviewHtml uses this local fill declaration.
start=src.index('function _buildPreviewHtml(t)')
pos=src.index("const fill=(b.style&&b.style.fill)||'#fff';",start)
src=src[:pos]+src[pos:].replace("const fill=(b.style&&b.style.fill)||'#fff';", "const fill=window.CoversNeutralMediaV6?.(t,b)||(b.style&&b.style.fill)||'#fff';",1)
# Single-view image placeholders: no colored fallback image for either program style.
src=src.replace("img.src = b.src || FALLBACK_IMAGES[0];", "if(b.src)img.src=b.src;else frame.style.background='#d7d9dd';",1)
src=src.replace("      frame.appendChild(img);\n      if(b.isTemplatePlaceholder && !b.src){", "      if(b.src)frame.appendChild(img);\n      if(!b.src){",1)
src=src.replace("ph.style.color = (st.accent||'#5b8cff')+'aa';", "ph.style.color = '#717782';",1)
src=src.replace("ph.style.background = `linear-gradient(135deg,${st.accent||'#5b8cff'}10,${st.accent||'#5b8cff'}05)`;", "ph.style.background = '#d7d9dd';",1)
src=src.replace("ph.style.border = `1px dashed ${st.accent||'#5b8cff'}30`;", "ph.style.border = '1px solid #c6cad1';",1)
src=src.replace("dice.className='slot-dice';dice.title='Рандомизировать слот';", "dice.className='slot-dice';dice.title='Рандомизировать один шаблон';",1)
src=src.replace('Загрузи свои картинки (JPG/PNG/WebP) — они используются при рандомизации плейсхолдеров. Можно просто перетащить файлы в окно.', 'Загрузите картинки или папку целиком: изображения из вложенных папок тоже попадут в библиотеку. Загрузка не зависит от «Начать».',1)
src=src.replace('кубик 🎲 в углу при наведении на картинку — только этот слот.', 'кубик 🎲 в режиме «Один» — весь текущий шаблон.',1)
src=src.replace("ib.title='🖼 Библиотека картинок (ЛКМ — добавить, ПКМ — библиотека)';", "ib.title='🖼 Библиотека картинок (ЛКМ — открыть: файлы или папка с подпапками)';",1)
src=src.replace('Нет картинок. Нажми «＋ Загрузить» или перетащи файлы в окно.', 'Нет картинок. Нажмите «＋ Загрузить» или «📁 Папка».',1)
# Pool dialog is discoverable by left-click; randomizer handlers do not depend on delayed legacy init.
src=src.replace("const rb=document.getElementById('btnRandAll');if(rb)rb.onclick=randomizeVisible;", "const rb=document.getElementById('btnRandAll');if(rb)rb.onclick=()=>window.CoversMediaV7.all();",1)
src=src.replace("const inp=document.getElementById('imgPoolInput');if(inp)inp.click();\n      };", "openImgPool();\n      };",1)
# Older inline/external media still resets on load, but v7 pool references survive reload.
src=src.replace("t.blocks.forEach(b=>{if(b.kind==='image'){b.src=\"\";b.isTemplatePlaceholder=true;delete b.naturalSize;", "t.blocks.forEach(b=>{if(b.kind==='image'&&!String(b.src||'').startsWith('pool:')){b.src=\"\";b.isTemplatePlaceholder=true;delete b.naturalSize;",1)
# Render media references from IndexedDB without embedding megabytes into each template.
src=src.replace("if(b.src)img.src=b.src;else frame.style.background='#d7d9dd';", "if(b.src)img.src=window.CoversMediaV7.resolve(b.src);else frame.style.background='#d7d9dd';",1)
src=src.replace("<img src=\"'+src+'\" style=", "<img src=\"'+window.CoversMediaV7.resolve(src)+'\" style=",1)
# Neutral, non-stretched Map image previews; the original Single renderer remains unchanged.
src=src.replace("const src = b.src || (typeof FALLBACK_IMAGES!=='undefined'&&FALLBACK_IMAGES[0])||'';", "const src = window.CoversMediaV7.resolve(b.src) || '';",1)
src=src.replace("parts.push('<div style=\"'+base+'overflow:hidden;border-radius:'+radius+'px;background:#e7e5df;\">');", "parts.push('<div style=\"'+base+'overflow:hidden;border-radius:'+radius+'px;background:#d7d9dd;\">');",1)
old="if(src){parts.push('<img src=\"'+escG(src)+'\" alt=\"\" style=\"position:absolute;left:50%;top:50%;width:'+b.w+'px;height:'+b.h+'px;transform:translate(-50%,-50%);display:block;border:0;\">');}"
new="if(src){const tx=b.imageTransform||{};parts.push('<img src=\"'+escG(src)+'\" alt=\"\" style=\"position:absolute;left:0;top:0;width:100%;height:100%;object-fit:cover;object-position:center;transform:translate('+(Number(tx.offsetX)||0)+'px,'+(Number(tx.offsetY)||0)+'px) scale('+(Number(tx.scale)||1)+');transform-origin:center;display:block;border:0;\">');}"
assert old in src;src=src.replace(old,new,1)
old="parts.push('<div style=\"position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:'+_hexToRgba(accent,0.7)+';background:linear-gradient(135deg,'+_hexToRgba(accent,0.06)+','+_hexToRgba(accent,0.02)+');border:1px dashed '+_hexToRgba(accent,0.2)+';border-radius:'+radius+'px;font-size:11px;font-weight:800;letter-spacing:.12em;font-family:Inter,Arial,Helvetica,sans-serif;text-transform:uppercase;\">'+escG((b.role||'image').toUpperCase())+'</div>');"
new="parts.push('<div style=\"position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#717782;background:#d7d9dd;border:1px solid #c6cad1;border-radius:'+radius+'px;font-size:11px;font-weight:500;font-family:Inter,Arial,Helvetica,sans-serif;\">'+escG(b.role||'Image')+'</div>');"
assert old in src;src=src.replace(old,new,1)
mapStart=src.index('function _buildPreviewHtml(t)')
pos=src.index('if(b.isTemplatePlaceholder && !b.src){',mapStart)
src=src[:pos]+src[pos:].replace('if(b.isTemplatePlaceholder && !b.src){','if(!b.src){',1)
# Replace only affected, already-rendered Map previews synchronously. No grid rebuild or loading placeholders.
needle='  function setupObserver(){'
assert needle in src
replacement="""  function updateCards(ids){
    if(gstate.mode!=='grid')return;
    const changed=new Set(ids||[]);
    document.querySelectorAll('#galRoot .gal-card').forEach(card=>{
      const id=card.dataset.id;
      if(changed.has(id)&&gstate.rendered.has(id))renderCard(card,id);
    });
    paintCards();
  }
"""
src=src.replace(needle,replacement+needle,1)
src=src.replace('    setMode, rebuild, setRailCollapsed, fitAll, setColumns, cycleColumns,','    setMode, rebuild, updateCards, setRailCollapsed, fitAll, setColumns, cycleColumns,',1)
# Render all map cards synchronously; the old lazy preview placeholder would jump when scrolled.
assert 'cards.slice(0,8).forEach(c=>{' in src
src=src.replace('cards.slice(0,8).forEach(c=>{','cards.forEach(c=>{',1)
# Undo/Redo may restore data without tearing down an already-visible Map.
src=src.replace("if(gstate.mode==='grid') rebuild(false); // список/фильтры/мутации", "if(gstate.mode==='grid'&&!window.__v5SkipGalleryRebuild) rebuild(false); // список/фильтры/мутации",1)
src=src.replace("if(window.__galleryReady && SB_Gallery && SB_Gallery.state.mode==='grid') SB_Gallery.rebuild(true);", "if(window.__galleryReady && SB_Gallery && SB_Gallery.state.mode==='grid'&&!window.__v5SkipGalleryRebuild) SB_Gallery.rebuild(true);",1)
# Imported categories should appear in filters immediately, including imported v4 archives.
src=src.replace("      renderLib(); renderBulkBar();\n      toast('Архив загружен:", "      renderLib(); renderTopFilterDDs(); renderBulkBar();\n      toast('Архив загружен:",1)
# Card preview text has stable block ID and paints existing multi-selection on rebuild.
old="parts.push('<div style=\"'+cs+'\">'+(b.content||'')+'</div>');"
new="parts.push('<div class=\"'+(window.CoversStyleV5?.blockPicks.has(t.id+'\\u0000'+b.id)?'v5-picked':'')+'\" data-v5-block=\"'+escG(b.id)+'\" style=\"'+cs+'\">'+(b.content||'')+'</div>');"
assert old in src;src=src.replace(old,new,1)
insert='\n'.join('<script>\n'+(root/f).read_text().replace('</script','<\\/script')+'\n</script>' for f in ('editor-store.js','engine.js','ai-contract.js','map-v5.js','editor.js','collect-ui.js','ai-ui.js','program-copy.js','media-v7.js'))
assert src.count('</body>')==1
src=src.replace('</body>',insert+'\n</body>',1)
path=root.parent/'Sandbox_Styles_v8_WORKING.html';path.write_text(src)
print(path,path.stat().st_size)
