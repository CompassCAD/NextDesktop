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
  const code=ts.transpileModule(fs.readFileSync(path.join('src/renderer/src/engine',name+'.ts'),'utf8').replace(/(undo|redo) = \(\): void => \{/g, '$1(): void {'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,{exports,require:id=>['./Component','./Logic','./Selection'].includes(id)?load(id.slice(2)):id.endsWith('.svg')?{default:id}:{},performance,console,crypto:require('node:crypto').webcrypto,structuredClone},{filename:name});
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

test('group dragging snaps the translation and preserves spacing, with free movement when disabled',()=>{
  for (const snap of [true,false]) {
    const r=renderer([new C.Line(3,3,103,3),new C.Line(3,103,103,103)]);
    r.setSelection([0,1]); r.snap=snap; r.gridSpacing=10;
    let x=50,y=3;
    r.getCursorXRaw=()=>x; r.getCursorYRaw=()=>y; r.findIntersectionWith=()=>0;
    r.selectionAction({shiftKey:false},1);
    x+=16; y+=24; r.selectionAction({shiftKey:false},2);
    assert.equal(r.logicDisplay.components[0].x1,snap?23:19);
    assert.equal(r.logicDisplay.components[0].y1,snap?23:27);
    assert.equal(r.logicDisplay.components[1].y1-r.logicDisplay.components[0].y1,100);
    assert.match(r.displayRef.style.cursor,/^url\(".*move.svg"\) 16 16, default$/);
    r.selectionAction({},3);
    assert.equal(r.undoStack.length,2);
    assert.equal(JSON.parse(r.undoStack[0])[0].x1,3);
  }
});

test('all group corners resize without Shift and use the matching custom cursor',()=>{
  for (const [cx,cy,asset] of [[0,0,'nwse-1'],[100,0,'nwse-2'],[0,100,'nwse-2'],[100,100,'nwse-1']]) {
    const r=renderer([new C.Line(0,0,100,0),new C.Line(0,100,100,100)]);
    r.setSelection([0,1]);
    let x=cx,y=cy;
    r.getCursorXRaw=()=>x; r.getCursorYRaw=()=>y; r.findIntersectionWith=()=>0;
    r.selectionAction({shiftKey:false},2);
    assert.ok(r.displayRef.style.cursor.includes(`${asset}.svg"`));
    assert.ok(r.displayRef.style.cursor.startsWith('url('));
    r.selectionAction({shiftKey:false},1);
    assert.equal(r.selectionGesture.kind,'scale');
    assert.ok(r.displayRef.style.cursor.includes(`${asset}.svg"`));
    x+=cx===0?-100:100; y+=cy===0?-100:100;
    r.selectionAction({shiftKey:false},2);
    assert.equal(r.logicDisplay.components[0].x2-r.logicDisplay.components[0].x1,200);
    assert.ok(r.displayRef.style.cursor.includes(`${asset}.svg"`));
    r.selectionAction({shiftKey:true},2);
    assert.equal(r.logicDisplay.components[0].x2-r.logicDisplay.components[0].x1,200);
    assert.equal(r.logicDisplay.components[1].y1-r.logicDisplay.components[0].y1,200);
    assert.ok(r.displayRef.style.cursor.includes(`${asset}.svg"`));
  }
});

test('selection outlines are solid and handles match the white rectangles with blue borders',()=>{
  const r=renderer([new C.Line(0,0,100,0),new C.Line(0,100,100,100)]);
  r.setSelection([0,1]); r.cOutX=0; r.cOutY=0; r.selectedColor='#0088ff';
  const fills=[],strokes=[];
  r.context={save(){},restore(){},setLineDash(dash){assert.equal(dash.length,0)},
    fillRect(...rect){fills.push({rect,color:this.fillStyle})},
    strokeRect(...rect){strokes.push({rect,color:this.strokeStyle,width:this.lineWidth})}};
  r.refreshSelectionTools();
  assert.equal(fills.length,4); assert.equal(strokes.length,5);
  for (const fill of fills) { assert.equal(fill.color,'#ffffff'); assert.deepEqual(fill.rect.slice(2),[8,8]); }
  for (const stroke of strokes) { assert.equal(stroke.color,r.selectedColor); assert.equal(stroke.width,2); }
});

test('shared position edits move every group member and support undo/redo',()=>{
  const r=renderer([new C.Line(0,0,10,0),new C.Line(0,10,10,10)]);
  r.setSelection([0,1]); r.groupSelection();
  let changes=0; r.onComponentChangeCallback=()=>changes++;
  r.moveSelection(20,-5);
  assert.equal(r.logicDisplay.components[0].x1,20);
  assert.equal(r.logicDisplay.components[1].y1,5);
  assert.equal(r.getSelectionBounds().minX,20);
  assert.equal(changes,1);
  r.undo(); assert.equal(r.logicDisplay.components[0].x1,0);
  r.redo(); assert.equal(r.logicDisplay.components[0].x1,20);
  r.setSelection([0]);
  const before=JSON.stringify(r.logicDisplay.components);
  r.moveSelection(NaN,1); r.moveSelection(1,Infinity);
  r.readonly=true; r.moveSelection(10,10);
  assert.equal(JSON.stringify(r.logicDisplay.components),before);
});

test('grouping and ungrouping notify hierarchy and selection subscribers',()=>{
  const r=renderer([new C.Line(0,0,10,0),new C.Line(0,10,10,10)]);
  r.setSelection([0,1]);
  const memberships=[]; const selections=[];
  r.onComponentArrayChanged=()=>memberships.push(r.logicDisplay.components.map(c=>c.groupId));
  r.onComponentChangeCallback=()=>selections.push(Array.from(r.getSelection()));
  r.groupSelection(); r.groupSelection(true);
  assert.ok(memberships[0][0]); assert.equal(memberships[0][0],memberships[0][1]);
  assert.deepEqual(memberships[1],[undefined,undefined]);
  assert.deepEqual(selections,[[0,1],[0,1]]);
});

test('individual child selection transforms and deletes only that child',()=>{
  const r=renderer([new C.Line(0,0,10,0),new C.Line(0,10,10,10)]);
  r.setSelection([0,1]); r.groupSelection();
  const id=r.logicDisplay.components[0].groupId;
  r.setSelection([0],false);
  assert.deepEqual(Array.from(r.getSelection()),[0]);
  assert.equal(r.selectedComponent,0);
  r.moveSelection(5,5);
  r.scaleSelection(2);
  assert.equal(r.logicDisplay.components[1].x1,0);
  assert.equal(r.logicDisplay.components[1].y1,10);
  assert.equal(r.logicDisplay.components[0].groupId,id);
  r.setSelection([0]);
  assert.deepEqual(Array.from(r.getSelection()),[0,1]);
  assert.equal(r.selectedComponent,null);
  r.setSelection([1],false); r.deleteSelection();
  assert.equal(r.logicDisplay.components.length,1);
  assert.equal(r.logicDisplay.components[0].groupId,id);
  r.undo(); assert.equal(r.logicDisplay.components.length,2);
});

test('group names persist, undo and redo, and reject blank or readonly edits',()=>{
  const r=renderer([new C.Line(0,0,10,0),new C.Line(0,10,10,10)]);
  r.setSelection([0,1]); r.groupSelection();
  const id=r.logicDisplay.components[0].groupId;
  r.renameGroup(id,'  Assembly  ');
  assert.ok(r.logicDisplay.components.every(c=>c.groupName==='Assembly'));
  const logic=new LogicDisplay();
  logic.importJSON(JSON.parse(JSON.stringify(r.logicDisplay.components)),logic.components);
  assert.ok(logic.components.every(c=>c.groupName==='Assembly'));
  r.undo(); assert.equal(r.logicDisplay.components[0].groupName,'Group 1');
  r.redo(); assert.equal(r.logicDisplay.components[0].groupName,'Assembly');
  const depth=r.undoStack.length;
  r.renameGroup(id,'   '); r.renameGroup(id,'Assembly');
  r.readonly=true; r.renameGroup(id,'Changed');
  assert.equal(r.undoStack.length,depth);
  assert.equal(r.logicDisplay.components[0].groupName,'Assembly');
  r.readonly=false; r.setSelection([0]); r.groupSelection(true);
  assert.ok(r.logicDisplay.components.every(c=>c.groupName===undefined && c.groupId===undefined));
});

test('new groups get numbered names and custom names replace the complete label',()=>{
  const r=renderer(Array.from({length:6},(_,i)=>new C.Line(i,0,i,10)));
  r.setSelection([0,1]); r.groupSelection();
  r.setSelection([2,3]); r.groupSelection();
  assert.equal(r.logicDisplay.components[0].groupName,'Group 1');
  assert.equal(r.logicDisplay.components[2].groupName,'Group 2');
  r.renameGroup(r.logicDisplay.components[2].groupId,'Walls · east');
  assert.equal(r.logicDisplay.components[2].groupName,'Walls · east');
  r.setSelection([4,5]); r.groupSelection();
  assert.equal(r.logicDisplay.components[4].groupName,'Group 2');
});

test('hierarchy ranges follow visible rows and Ctrl toggles only the target',()=>{
  const {selectHierarchyIndexes:select}=load('Selection');
  const rows=[{key:'group',indexes:[0,1]},{key:'a',indexes:[0]},{key:'b',indexes:[1]},{key:'c',indexes:[2]},{key:'d',indexes:[3]}];
  const result=(...args)=>Array.from(select(rows,...args));
  assert.deepEqual(result('c','a',[0],true,false),[0,1,2]);
  assert.deepEqual(result('a','c',[2],true,false),[0,1,2]);
  assert.deepEqual(result('c','a',[0],false,true),[0,2]);
  assert.deepEqual(result('a','c',[0,2],false,true),[2]);
  assert.deepEqual(result('b','a',[3],true,true),[3,0,1]);
  assert.deepEqual(result('group',null,[],false,false),[0,1]);
  assert.deepEqual(result('a','group',[0,1],false,false),[0]);
  assert.deepEqual(result('c','hidden',[0],true,false),[2]);
});
