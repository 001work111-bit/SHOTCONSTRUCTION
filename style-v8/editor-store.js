/* Independent editor presets. STYLES exclusively describe program/library styles. */
let EDITOR_STYLES={};
(function(){
 'use strict';
 const KEY='cs_v5_editor_styles';
 try{const data=JSON.parse(localStorage.getItem(KEY)||'null');if(data&&typeof data==='object'&&!Array.isArray(data))EDITOR_STYLES=data;}catch(_){}
 function persist(){try{localStorage.setItem(KEY,JSON.stringify(EDITOR_STYLES));}catch(e){console.warn('Editor presets could not be saved',e);}}
 function reconcile(){
   // v5 placed editor-only styles in STYLES and sometimes wrote their IDs to visualStyle.
   for(const [id,style] of Object.entries(STYLES)){
     const editorOnly=/^(style_|demo_)/.test(id)&&!!style.v4;
     if(style.v4&&!EDITOR_STYLES[id])EDITOR_STYLES[id]=deepClone(style);
     if(!editorOnly)continue;
     for(const t of Object.values(LIB))if(t.visualStyle===id){
       t.editorStyleId ||= id;
       t.visualStyle=STYLES[t.programStyleId]?t.programStyleId:/^eb_/i.test(t.id)?'editorial-blue':'cinematic';
     }
     delete STYLES[id];
   }
   for(const id of ['cinematic','editorial-blue'])if(STYLES[id]&&!EDITOR_STYLES[id])EDITOR_STYLES[id]=deepClone(STYLES[id]);
   // Older imported binding maps can be reused without changing the program style.
   for(const t of Object.values(LIB)){
     t.v5Bindings ||= t.v4Bindings||{};
     if(!t.editorStyleId){const ids=Object.keys(t.v5Bindings).filter(id=>EDITOR_STYLES[id]&&Object.keys(t.v5Bindings[id]||{}).length);
       if(ids.length)t.editorStyleId=ids.at(-1);
     }
   }
   store.save();store.saveStyles();persist();
 }
 reconcile();
 // Display-only neutralisation for translucent safety plates over empty media.
 // Original template fills stay intact and reappear when a real image is supplied.
 window.CoversNeutralMediaV6=function(t,b){
   const fill=b?.style?.fill;
   if(b?.kind!=='shape'||!fill||!/(safe[-_ ]?plate|media[-_ ]?overlay|image[-_ ]?overlay)/i.test(b.role||''))return fill;
   const overlaps=(t?.blocks||[]).some(img=>img.kind==='image'&&!img.src&&
     b.x<img.x+img.w&&b.x+b.w>img.x&&b.y<img.y+img.h&&b.y+b.h>img.y);
   if(!overlaps)return fill;
   const alpha=String(fill).match(/^rgba?\([^)]*,\s*(0?\.\d+|1(?:\.0+)?)\s*\)$/i)?.[1];
   return alpha?`rgba(99,104,112,${alpha})`:'#858b94';
 };
 window.CoversEditorStoreV6={persist,reconcile};
})();
