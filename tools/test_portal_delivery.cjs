const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'assets/catalog.js'), 'utf8');
const shard = 'websites-latest-01';

function loader(script, directory, counts, {fail} = {}) {
  const window = {};
  vm.runInNewContext(script, {window, fetch: async (url, init) => {
    counts.set(url, (counts.get(url) || 0) + 1);
    if (fail?.(url, counts.get(url))) return {ok:false, status:503};
    if (/\.[a-f0-9]{20}\.json$/.test(url)) assert.equal(init?.cache, undefined);
    return {ok:true, json:async () => JSON.parse(fs.readFileSync(path.join(directory, url), 'utf8'))};
  }});
  return window.MRCCatalog;
}

async function main() {
  const counts = new Map();
  const sourceCatalog = loader(source, root, counts, {fail:(url, attempts) =>
    url === `catalog/${shard}.json` && attempts === 1});
  const first = await Promise.allSettled([sourceCatalog.load('websites'), sourceCatalog.load('resources')]);
  assert.deepEqual(first.map(result => result.status), ['rejected', 'rejected'], 'overlapping loaders share a transient shard failure');
  const {websites, resources} = await sourceCatalog.loadMany('websites', 'resources');
  assert.ok(websites.length && resources.length);
  assert.equal(counts.get(`catalog/${shard}.json`), 2, 'both consumers share one retry');
  assert.equal(counts.get('catalog/websites-latest-02.json'), 1, 'successful physical files stay shared');

  const {buildPortal} = require('./build_portal.cjs');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-delivery-'));
  try {
    const after = path.join(temp, 'release');
    const next = path.join(temp, 'next');
    const fixture = path.join(temp, 'source');
    const firstRelease = await buildPortal(root, after);
    const duplicate = await buildPortal(root, path.join(temp, 'duplicate'));
    assert.deepEqual(firstRelease, duplicate, 'identical inputs produce identical URLs');
    const {files, loaderPath, sourceCommit} = firstRelease;
    assert.equal(sourceCommit, JSON.parse(fs.readFileSync(path.join(root, 'catalog/manifest.json'))).sourceCommit);
    assert.ok(fs.statSync(path.join(after, files.home)).size <= 10_000);
    const html = fs.readFileSync(path.join(after, 'index.html'), 'utf8');
    assert.ok(html.includes(`as="fetch" crossorigin href="${files.home}"`));
    assert.ok(html.includes(`src="${loaderPath}"`));
    const builtCounts = new Map();
    const builtScript = fs.readFileSync(path.join(after, loaderPath), 'utf8');
    const builtCatalog = loader(builtScript, after, builtCounts);
    assert.equal(builtCatalog.sourceCommit, sourceCommit);
    const home = await builtCatalog.load('home');
    assert.deepEqual([...builtCounts.keys()], [files.home]);
    assert.deepEqual(home, JSON.parse(JSON.stringify(await sourceCatalog.load('home'))), 'staged and source Home use the same public selections');
    assert.equal(JSON.stringify(await builtCatalog.load('websites')), JSON.stringify(websites));

    for (const name of ['catalog', 'assets', 'data']) fs.cpSync(path.join(root, name), path.join(fixture, name), {recursive:true});
    for (const name of fs.readdirSync(root).filter(name=>name.endsWith('.html'))) fs.copyFileSync(path.join(root,name),path.join(fixture,name));
    const changed = path.join(fixture, 'catalog', `${shard}.json`);
    const rows = JSON.parse(fs.readFileSync(changed, 'utf8'));
    rows[0].title += ' (updated)';
    fs.writeFileSync(changed, JSON.stringify(rows));
    const secondRelease = await buildPortal(fixture, next);
    assert.notEqual(secondRelease.files[shard], files[shard]);
    assert.notEqual(secondRelease.loaderPath, loaderPath);
    assert.equal(secondRelease.files['website-facets'], files['website-facets']);
    assert.equal(secondRelease.files.home, files.home);
    assert.ok(!fs.existsSync(path.join(next, files[shard])), 'a removed version cannot serve mismatched bytes');
    await assert.rejects(loader(builtScript, next, new Map()).load('websites'), /ENOENT/);
    const nextCatalog = loader(fs.readFileSync(path.join(next, secondRelease.loaderPath), 'utf8'), next, new Map());
    assert.equal((await nextCatalog.load('websites')).find(row => row.id === rows[0].id).title, rows[0].title);
  } finally {
    fs.rmSync(temp, {recursive:true, force:true});
  }
  console.log('OK: Catalog coalescing, retry, deterministic Home, release isolation and unchanged-file reuse');
}

main().catch(error => {console.error(error); process.exitCode = 1;});
