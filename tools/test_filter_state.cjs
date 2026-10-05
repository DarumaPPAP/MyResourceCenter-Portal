// Run with node tools/test_filter_state.cjs (no dependencies).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
class Control {
  constructor(id, tagName = 'SELECT') { this.id = id; this.tagName = tagName; this.value = ''; this.listeners = {}; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  emit(type) { for (const fn of this.listeners[type] || []) fn(); }
  click() { this.emit('click'); }
  focus() { this.focused = true; }
}
const controls = [new Control('q', 'INPUT'), new Control('format')];
const clear = new Control('clear', 'BUTTON');
let url = new URL('https://example.test/documents.html?q=GPU&format=PDF&keep=yes');
const location = { get href() { return url.href; }, get search() { return url.search; } };
const handlers = {}, windowHandlers = {};
const context = {
  URL, URLSearchParams, location,
  history: { replaceState(_, __, value) { url = new URL(value); } },
  document: { getElementById: id => id === 'clear' ? clear : null, addEventListener: (type, fn) => { handlers[type] = fn; } },
  window: { addEventListener: (type, fn) => { windowHandlers[type] = fn; } }
};
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname, '../assets/catalog.js'), 'utf8'), context);
let renders = 0;
clear.addEventListener('click', () => { controls.forEach(c => { c.value = ''; }); });
context.window.MRCCatalog.bindFilterState(controls, () => renders++);
assert.equal(controls[0].value, 'GPU');
assert.equal(controls[1].value, 'PDF');
controls[0].value = '影 & 光'; controls[0].emit('input');
assert.equal(url.searchParams.get('q'), '影 & 光');
assert.equal(url.searchParams.get('keep'), 'yes');
controls[1].value = 'PPTX'; controls[1].emit('change');
assert.equal(url.searchParams.get('format'), 'PPTX');
handlers.click({ target: { closest: () => true } });
assert.equal(url.searchParams.has('q'), false);
assert.equal(url.searchParams.has('format'), false);
assert.equal(url.searchParams.get('keep'), 'yes');
assert.equal(controls[0].focused, true);
url = new URL('https://example.test/documents.html?q=Unity&format=PDF');
windowHandlers.popstate();
assert.equal(controls[0].value, 'Unity');
assert.equal(controls[1].value, 'PDF');
assert.equal(renders, 1);
console.log('OK: filter URL restoration, Japanese text encoding, reset, focus, and history navigation');

// The Website page persists all six controls, including Unicode Author values.
const websiteControls = ['q','category','tag','site','author','sort'].map(id => new Control(id, id === 'q' ? 'INPUT' : 'SELECT'));
const websiteClear = new Control('clear', 'BUTTON');
let websiteUrl = new URL('https://example.test/websites.html?q=shader&category=Tech&tag=Unity&site=qiita.com&author=alice&sort=asc&keep=1');
const websiteLocation = {get href(){return websiteUrl.href;},get search(){return websiteUrl.search;}};
const websiteWindowHandlers = {}, websiteHandlers = {};
const websiteContext = {
  URL, URLSearchParams, location:websiteLocation,
  history:{replaceState(_,__,value){websiteUrl=new URL(value);}},
  document:{getElementById:id=>id==='clear'?websiteClear:null,addEventListener:(type,fn)=>{websiteHandlers[type]=fn;}},
  window:{addEventListener:(type,fn)=>{websiteWindowHandlers[type]=fn;}}
};
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../assets/catalog.js'),'utf8'),websiteContext);
websiteClear.addEventListener('click',()=>websiteControls.forEach(control=>{control.value='';}));
websiteContext.window.MRCCatalog.bindFilterState(websiteControls,()=>{});
assert.deepEqual(websiteControls.map(control=>control.value),['shader','Tech','Unity','qiita.com','alice','asc']);
websiteControls[4].value='佐藤 花子';websiteControls[4].emit('change');
assert.equal(websiteUrl.searchParams.get('author'),'佐藤 花子');
assert.equal(websiteUrl.searchParams.get('keep'),'1');
websiteControls[5].value='desc';websiteControls[5].emit('change');
assert.equal(websiteUrl.searchParams.get('sort'),'desc');
websiteControls.forEach(control=>{control.value='';});websiteClear.click();
for(const key of ['q','category','tag','site','author','sort'])assert.equal(websiteUrl.searchParams.has(key),false);
assert.equal(websiteUrl.searchParams.get('keep'),'1');
websiteUrl=new URL('https://example.test/websites.html?q=GPU&category=Idea&tag=AI&site=other&author=__other__&sort=asc');
websiteWindowHandlers.popstate();
assert.deepEqual(websiteControls.map(control=>control.value),['GPU','Idea','AI','other','__other__','asc']);
console.log('OK: Website q/category/tag/site/author/sort URL persistence, Unicode, reset and history restoration');

// Document filter edits reset only the page parameter while preserving unrelated URL state.
const documentControls=['q','category','format','tag'].map(id=>new Control(id,id==='q'?'INPUT':'SELECT'));
const documentClear=new Control('clear','BUTTON');
let documentUrl=new URL('https://example.test/documents.html?q=shader&category=Graphics&format=PDF&tag=Shader&page=3&keep=1');
const documentLocation={get href(){return documentUrl.href;},get search(){return documentUrl.search;}};
const documentWindowHandlers={},documentHandlers={};
const documentContext={
  URL,URLSearchParams,location:documentLocation,
  history:{replaceState(_,__,value){documentUrl=new URL(value);}},
  document:{getElementById:id=>id==='clear'?documentClear:null,addEventListener:(type,fn)=>{documentHandlers[type]=fn;}},
  window:{addEventListener:(type,fn)=>{documentWindowHandlers[type]=fn;}}
};
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../assets/catalog.js'),'utf8'),documentContext);
documentClear.addEventListener('click',()=>documentControls.forEach(control=>{control.value='';}));
documentContext.window.MRCCatalog.bindFilterState(documentControls,()=>{},{clearParams:['page']});
assert.deepEqual(documentControls.map(control=>control.value),['shader','Graphics','PDF','Shader']);
documentControls[0].value='Unity';documentControls[0].emit('input');
assert.equal(documentUrl.searchParams.get('q'),'Unity');
assert.equal(documentUrl.searchParams.has('page'),false);
assert.equal(documentUrl.searchParams.get('keep'),'1');
documentUrl=new URL('https://example.test/documents.html?q=Shader&page=2&keep=1');
documentWindowHandlers.popstate();
assert.deepEqual(documentControls.map(control=>control.value),['Shader','','','']);
assert.equal(documentUrl.searchParams.get('page'),'2','Back/Forward restoration keeps the page URL for the page controller');
console.log('OK: Document filter edits reset page state and Back/Forward restores filters without losing unrelated parameters');
