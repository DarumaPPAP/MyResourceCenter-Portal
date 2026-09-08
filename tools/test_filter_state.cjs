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
