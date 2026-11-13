const fs=require('fs');
const path=require('path');
const vm=require('vm');
const ts=require('typescript');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const cache=new Map();
function load(name) {
  if(cache.has(name)) return cache.get(name);
  const exports={}; cache.set(name,exports);
  const code=ts.transpileModule(fs.readFileSync(path.join('src/renderer/src/engine',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,{exports,require:id=>['./Component','./Logic','./Selection'].includes(id)?load(id.slice(2)):{},performance,console,crypto:require('node:crypto').webcrypto,structuredClone},{filename:name});
  return exports;
}
const C=load('Component');
const {LogicDisplay}=load('Logic');
const {transformComponent,expandGroups}=load('Selection');
const {GraphicsRenderer}=load('Engine');
function renderer(components) {
  const r=Object.create(GraphicsRenderer.prototype);
  Object.assign(r,{logicDisplay:new LogicDisplay(),selectedComponents:[],selectedComponent:null,temporarySelectedComponent:null,undoStack:[],redoStack:[],maximumStack:50,readonly:false,selectionGesture:null,dragHandle:null,_componentIndexes:new Map(),modes:{Select:1,Navigate:2},mode:1,mouseAction:{Down:1,Move:2,Up:3},zoom:1,displayRef:{style:{},focus(){}},temporaryPoints:[],temporaryVectors:[]});
  r.logicDisplay.components=components;
  r.markDirty=()=>{}; r.cleanLog=()=>{}; r.update=()=>{};
  r.saveState(); return r;
}
test('uniform scaling preserves rotations and transforms nested geometry in local coordinates',()=>{
  const shape=new C.Shape(10,20,'Assembly',30);
  shape.components=[new C.Line(0,0,10,10),new C.Label(5,5,'test',12),new C.Picture(2,2,'test')];
  transformComponent(shape,2,-10,-20);
  assert.equal(shape.x,10); assert.equal(shape.y,20); assert.equal(shape.rotation,30);
  assert.equal(shape.components[0].x2,20); assert.equal(shape.components[1].fontSize,24); assert.equal(shape.components[2].imageScale,2);
});
test('group membership and image size survive serialization and importing',()=>{
  const line=new C.Line(0,0,10,10); line.groupId='group';
  const pic=new C.Picture(20,20,'image'); pic.groupId='group'; pic.imageScale=2;
  const box=new C.BoundBox(1,2,3,4);
  const logic=new LogicDisplay(); logic.importJSON(JSON.parse(JSON.stringify([line,pic,box])),logic.components);
  assert.equal(logic.components[0].groupId,'group'); assert.equal(logic.components[1].imageScale,2);
  assert.equal(logic.components[2].type,C.componentTypes.boundBox);
  assert.deepEqual(Array.from(expandGroups(logic.components,[0])),[0,1]);
});
test('group, ungroup, scale and delete have repeatable undo and redo',()=>{
  const r=renderer([new C.Line(0,0,10,0),new C.Line(0,10,10,10)]);
  r.setSelection([0,1]); r.groupSelection();
  const id=r.logicDisplay.components[0].groupId;
  assert.ok(id); assert.equal(r.logicDisplay.components[1].groupId,id);
  r.undo(); assert.equal(r.logicDisplay.components[0].groupId,undefined);
  r.redo(); assert.equal(r.logicDisplay.components[0].groupId,id);
  r.undo(); r.redo(); assert.equal(r.logicDisplay.components[1].groupId,id);
  r.setSelection([0]); assert.equal(r.getSelection().length,2);
  r.scaleSelection(2); assert.equal(r.logicDisplay.components[0].x1,-5);
  r.undo(); assert.equal(r.logicDisplay.components[0].x1,0);
  r.setSelection([0]); r.groupSelection(true); assert.equal(r.logicDisplay.components[1].groupId,undefined);
  r.undo(); assert.equal(r.logicDisplay.components[1].groupId,id);
  r.setSelection([0]); r.deleteSelection(); assert.equal(r.logicDisplay.components.length,0);
  r.undo(); assert.equal(r.logicDisplay.components.length,2);
});
test('Shift-click toggles whole groups and box selection contains objects',()=>{
  const r=renderer([new C.Line(0,0,10,0),new C.Line(0,10,10,10)]);
  r.getCursorXRaw=()=>50; r.getCursorYRaw=()=>50; r.findIntersectionWith=()=>0;
  r.selectionAction({shiftKey:true},1); assert.deepEqual(Array.from(r.getSelection()),[0]);
  r.selectionAction({shiftKey:true},1); assert.equal(r.getSelection().length,0);
  r.findIntersectionWith=()=>null; r.getCursorXRaw=()=>-10; r.getCursorYRaw=()=>-10;
  r.selectionAction({shiftKey:false},1);
  r.getCursorXRaw=()=>20; r.getCursorYRaw=()=>20;
  r.selectionAction({},3); assert.equal(r.getSelection().length,2);
});
test('cancel restores a drag and invalid scales cannot corrupt geometry',()=>{
  const r=renderer([new C.Line(0,0,10,0)]); r.setSelection([0]);
  const before=JSON.stringify(r.logicDisplay.components);
  for (const k of [NaN,Infinity,-1,0]) r.scaleSelection(k);
  assert.equal(JSON.stringify(r.logicDisplay.components),before);
  r.selectionGesture={kind:'move',indexes:[0],originals:structuredClone(r.logicDisplay.components)};
  r.logicDisplay.components[0].x1=100;
  r.cancelEditing(); assert.equal(r.logicDisplay.components[0].x1,0);
});
