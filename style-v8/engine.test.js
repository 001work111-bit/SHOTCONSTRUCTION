const assert=require('assert'),fs=require('fs'),vm=require('vm'),path=require('path');
const E=require('./engine.js'),AI=require('./ai-contract.js');
const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(path.resolve('uploads/portfolio_template_library_all_96.js'),'utf8'),sandbox);
const templates=JSON.parse(JSON.stringify(sandbox.window.MY_CUSTOM_COVERS));assert.equal(templates.length,97);
const samples=templates.filter(t=>t.visualStyle==='editorial-blue');assert(samples.length>30);
const groups=[...new Set(samples.map(x=>x.templateGroup))];const style={name:'Demo',accent:'#1b16ff'};
const before=structuredClone(templates),stats=E.collectFromTemplates(style,groups,samples);
assert.equal(stats.templates,samples.length);assert(stats.combinations>20);assert(stats.accepted>100);
assert.deepEqual(Object.keys(style.v4.categories).sort(),groups.sort());
const originalColors=new Set(samples.flatMap(t=>t.blocks.filter(b=>b.kind==='text'&&E.validColor(b.style?.color)).map(b=>E.normalizeColor(b.style.color))));
for(const color of originalColors)assert(Object.values(style.v4.palette).includes(color),`missing color ${color}`);
for(const [cat,info] of Object.entries(style.v4.categories))for(const [role,variants] of Object.entries(info.roles)){
 const counts=variants.map(x=>style.v4.sourceProfiles[cat][role][x.id]?.count);
 assert.deepEqual(counts,[...counts].sort((a,b)=>b-a));
 for(const v of variants){assert(!('fontSize' in v));assert(!('fontFamily' in v));assert(E.validColor(style.v4.palette[v.colorToken]));}
}
let changed=0;for(const t of templates)changed+=E.auto(t,'demo',style,'auto').changed;assert(changed>100);for(let i=0;i<templates.length;i++){assert.equal(templates[i].visualStyle,before[i].visualStyle);if(templates[i].editorStyleId)assert.equal(templates[i].editorStyleId,'demo');}
for(let i=0;i<templates.length;i++){
 const a=before[i],b=templates[i];assert.equal(a.blocks.length,b.blocks.length);
 for(let j=0;j<a.blocks.length;j++){const x=a.blocks[j],y=b.blocks[j];for(const k of ['id','kind','role','x','y','w','h','content'])assert.equal(x[k],y[k]);
   if(x.kind==='text')for(const k of ['fontSize','lineHeight','letterSpacing','textTransform','textAlign','fontFamily'])assert.deepEqual(x.style?.[k],y.style?.[k]);}
}
const make=(id,category,size,color,weight,font='Inter')=>({id,templateGroup:category,blocks:[{id:id+'txt',kind:'text',role:'title',style:{fontSize:size,fontWeight:weight,color,fontFamily:font}}]});
const refs=[make('a','Intro',12,'#111111',400),make('b','Intro',12,'#111111',400),make('c','Intro',23,'#222222',700)];
const synthetic={name:'Nearest'};const result=E.collectFromTemplates(synthetic,['Intro','About'],refs);assert.equal(result.combinations,2);
assert.deepEqual(Object.keys(synthetic.v4.categories),['Intro']);assert.equal(synthetic.v4.categories.Intro.roles.title[0].weight,400);
for(const [size,expected] of [[12,400],[25,700]]){const target=make('new'+size,'Intro',size,'#dddddd',500);E.auto(target,'nearest',synthetic,'auto');assert.equal(target.blocks[0].style.fontWeight,expected);assert.equal(target.blocks[0].style.fontSize,size);}
const target=make('cross','About',72,'#eeeeee',900),b=target.blocks[0];assert(E.bind(target,b,'nearest',synthetic,'Intro','title',synthetic.v4.categories.Intro.roles.title[0].id));assert.equal(target.v5Bindings.nearest[b.id].categoryId,'Intro');assert.equal(target.editorStyleId,'nearest');assert.equal(b.style.fontSize,72);
const remap={name:'Remap'};E.collectFromTemplates(remap,['Intro'],[make('one','Intro',12,'#111111',400),make('two','Intro',14,'#222222',400)]);const old=remap.v4.categories.Intro.roles.title.map(x=>x.id),tokens=remap.v4.typography.title.allowedColors;const affected=make('x','Intro',12,'#bbbbbb',500);affected.visualStyle='cinematic';E.bind(affected,affected.blocks[0],'remap',remap,'Intro','title',old[1]);const r=E.remapRoleColor(remap,'remap',{x:affected},'title',tokens[1],tokens[0]);assert.equal(r.merged,1);assert.equal(remap.v4.categories.Intro.roles.title.length,1);assert.equal(affected.v5Bindings.remap.xtxt.variantId,old[0]);assert.equal(affected.visualStyle,'cinematic');assert.equal(affected.blocks[0].style.color,remap.v4.palette[tokens[0]]);
const beforeRemoved=structuredClone(affected),removed=E.removeVariant(remap,'remap',{x:affected},'Intro','title',old[0]);assert.equal(removed.unlinked,1);assert.equal(affected.editorStyleId,undefined);assert.equal(affected.visualStyle,beforeRemoved.visualStyle);
const amb={id:'Z',templateGroup:'Intro',blocks:[{id:'x',kind:'text',role:'meta',style:{fontSize:14}},{id:'y',kind:'text',role:'meta',style:{fontSize:14}}]};
const manual={};E.ensure(manual,['Intro'],{a:{templateGroup:'Intro'}},'manual-new');E.auto(amb,'syn',manual,'auto');const first=amb.v5Bindings.syn.x.variantId; // single preset, variants is noop
assert.equal(amb.blocks[0].style.fontSize,14);assert.equal(first,manual.v4.categories.Intro.roles.meta[0].id);
const data={type:'covers-style',schemaVersion:4,name:'AI',palette:{Primary:'#222222',Secondary:'#999999',Accent:'#ff0000',White:'#ffffff'},typography:{meta:{family:'Inter',weights:[400,700]}},categories:{Intro:{roles:{meta:[{colorToken:'Accent',weight:700},{colorToken:'Primary',weight:400}]}}}};
assert.equal(AI.normalize(JSON.stringify(data),['Intro']).statistics[0].variants,2);
assert.throws(()=>AI.normalize(JSON.stringify({...data,categories:{Intro:{roles:{meta:[{colorToken:'Accent',weight:700,fontSize:14}]}}}}),['Intro']),/Размер/);
console.log('v6 engine tests passed',stats,changed);
