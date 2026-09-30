// Home contract: execute the real page renderer against public catalog data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets/home.css'), 'utf8');

assert.match(html, /<h1\b[^>]*>Game Development<br>Knowledge Portal<\/h1>/, 'Home identifies the game development knowledge portal');
assert.doesNotMatch(html, /class="(?:stats|metric|quick-grid|quick-card|panel)"|id="stats"|<h2>探索する<\/h2>/, 'Home contains content, not KPI or navigation cards');
assert.doesNotMatch(css, /\.stats\b|\.metric\b|\.quick-card\b|\.home-category\b/, 'Home CSS removes obsolete dashboard systems');
assert.match(html, /technical-environment\.svg/);
assert.match(html, /<figcaption>.*Geometry.*Lighting.*GPU.*<\/figcaption>/, 'Technical hero explains the visual as a knowledge domain');
assert.match(html, /data-global-search/);
assert.match(html, /data-search-target/);
assert.match(html, /href="trend\.html"[^>]*>今日の技術トレンド/, 'Trend is an editorial entry');

async function renderHome({empty = false, failure = false, catalogs = {}} = {}) {
  const listeners = new Map();
  const elements = new Map(['docs', 'collections'].map(id => [id, {
    innerHTML: '', listeners: [], addEventListener(...args) {this.listeners.push(args);}
  }]));
  const errors = [];
  const context = {
    URL, URLSearchParams,
    location: {pathname: '/index.html'},
    document: {getElementById: id => elements.get(id) || null},
    window: {addEventListener: (event, handler) => listeners.set(event, handler)},
    console: {error: error => errors.push(error)},
    // Only the HTTP transport is replaced; loader and renderer are production code.
    fetch: async url => {
      if (failure) return {ok: false, status: 503};
      return {ok: true, json: async () => empty ? [] : catalogs[url] || JSON.parse(fs.readFileSync(path.join(root, url), 'utf8'))};
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/catalog.js'), 'utf8'), context);
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/human-portal.js'), 'utf8'), context);
  await listeners.get('DOMContentLoaded')();
  return {elements, C: context.window.MRCCatalog, errors};
}

(async () => {
  const {elements, C, errors} = await renderHome();
  assert.equal(errors.length, 0);
  const docs = elements.get('docs').innerHTML;
  const guides = elements.get('collections').innerHTML;
  assert.equal((docs.match(/class="document-entry"/g) || []).length, 4, 'Four actual documents have full presentation entries');
  assert.equal((docs.match(/class="document-thumbnail/g) || []).length, 4);
  assert.match(docs, /loading="lazy" decoding="async"/);
  assert.match(docs, /href="viewer\.html\?/);
  assert.match(docs, /class="document-meta"/);
  assert.match(docs, /document\.html\?id=RES-/);
  assert.ok(elements.get('docs').listeners.some(([name, , capture]) => name === 'error' && capture), 'Missing thumbnail errors retain the shared fallback');
  const publicDocs = JSON.parse(fs.readFileSync(path.join(root, 'catalog/document-presentation.json'), 'utf8'));
  for (const title of [...docs.matchAll(/<h3><a [^>]+>(.*?)<\/a><\/h3>/g)].map(match => match[1])) {
    assert.ok(publicDocs.some(doc => C.escapeHtml(doc.title) === title), 'Featured titles come from the public presentation index');
  }
  const collections = JSON.parse(fs.readFileSync(path.join(root, 'catalog/collections.json'), 'utf8'));
  const resources = C.byId(await C.load('resources'));
  const previews = [...guides.matchAll(/<a class="reading-guide" href="collection\.html\?id=([^"]+)">([\s\S]*?)<\/a>/g)];
  assert.equal(previews.length, 3, 'Home presents three real Reading Paths');
  for (const [, id, markup] of previews) {
    const collection = collections.find(row => row.id === decodeURIComponent(id));
    assert.ok(collection);
    const preview = C.readingPreview(collection);
    assert.ok(preview.steps.length >= 2 && preview.steps.length <= 3);
    assert.match(markup, /class="path-preview"/);
    assert.equal((markup.match(/class="path-number"/g) || []).length, preview.steps.length);
    for (const step of preview.steps) {
      assert.ok(markup.includes(C.escapeHtml(resources.get(step.id).title)), 'Every step displays its actual resource title');
      assert.ok(markup.includes(C.escapeHtml(C.roleLabel(step.role))), 'Every step displays its actual reading role');
    }
    if (preview.more) assert.ok(markup.includes(`+${preview.more} more`));
  }
  const incomplete = await renderHome({catalogs: {'catalog/collections.json': [
    {...collections[0], id: 'COL-EMPTY', title: 'Empty path', resources: []},
    {...collections[0], id: 'COL-SINGLE', title: 'Single step', resources: collections[0].resources.slice(0, 1)},
    {...collections[0], id: 'COL-UNRESOLVED', title: 'Unresolved path', resources: [{id: 'RES-MISSING', role: 'foundation'}, ...collections[0].resources.slice(0, 2)]},
    ...collections
  ]}});
  assert.doesNotMatch(incomplete.elements.get('collections').innerHTML, /Empty path|Single step|Unresolved path/, 'Home does not invent multi-step paths for incomplete metadata');
  const empty = await renderHome({empty: true});
  assert.match(empty.elements.get('docs').innerHTML, /role="status"/);
  assert.match(empty.elements.get('collections').innerHTML, /role="status"/);
  const failed = await renderHome({failure: true});
  assert.match(failed.elements.get('docs').innerHTML, /role="alert"/);
  assert.match(failed.elements.get('collections').innerHTML, /role="alert"/);
  console.log('OK: Home visual discovery contract, real document/viewer links, source thumbnails and fallback, three reading previews, empty/error states');
})().catch(error => {console.error(error); process.exitCode = 1;});
