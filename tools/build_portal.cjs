// Stage the static Pages site from validated public inputs. No dependencies.
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fingerprint(file, contents) {
  const {dir, name, ext} = path.parse(file);
  const digest = createHash('sha256').update(contents).digest('hex').slice(0, 20);
  return path.posix.join(dir, `${name}.${digest}${ext}`);
}

async function buildPortal(root, output) {
  root = path.resolve(root);
  output = path.resolve(output);
  // Refuse to overlay a previous release or source tree.
  fs.mkdirSync(output);
  const read = file => fs.readFileSync(path.join(root, file));
  const write = (file, contents) => fs.writeFileSync(path.join(output, file), contents);
  for (const dir of ['assets', 'catalog', 'data', 'preview']) {
    const source = path.join(root, dir);
    if (fs.existsSync(source)) fs.cpSync(source, path.join(output, dir), {recursive:true});
  }
  write('.nojekyll', '');
  const manifest = JSON.parse(read('catalog/manifest.json'));
  assert.match(manifest.sourceCommit, /^[a-f0-9]{40}$/i);

  const files = {};
  const writeCatalog = (name, bytes) => {
    const file = fingerprint(`catalog/${name}.json`, bytes);
    write(file, bytes);
    files[name] = file;
  };
  for (const file of fs.readdirSync(path.join(root, 'catalog')).sort()) {
    if (!file.endsWith('.json')) continue;
    writeCatalog(path.basename(file, '.json'), read(`catalog/${file}`));
  }

  const script = read('assets/catalog.js').toString('utf8');
  const window = {};
  vm.runInNewContext(script, {window, fetch: async file => ({ok:true, json:async () => JSON.parse(read(file))})});
  const home = Buffer.from(JSON.stringify(await window.MRCCatalog.load('home')));
  assert.ok(home.length <= 10_000, `Home projection exceeds 10,000 bytes (${home.length})`);
  writeCatalog('home', home);

  const release = {sourceCommit:manifest.sourceCommit, files};
  const marker = 'const release = null;';
  assert.equal(script.split(marker).length, 2, 'Catalog loader must contain one release marker');
  const compiled = script.replace(marker, `const release = ${JSON.stringify(release)};`);
  const loaderPath = fingerprint('assets/catalog.js', compiled);
  write(loaderPath, compiled);

  const scripts = new Map([['assets/catalog.js', loaderPath]]);
  for (const page of fs.readdirSync(root).filter(file => file.endsWith('.html')).sort()) {
    let html = read(page).toString('utf8').replace(/(<script\b[^>]*\bsrc=")(assets\/[a-z-]+\.js)"/g,
      (_, start, file) => {
        if (!scripts.has(file)) {
          const bytes = read(file);
          const version = fingerprint(file, bytes);
          write(version, bytes);
          scripts.set(file, version);
        }
        return start + scripts.get(file) + '"';
      });
    if (page === 'index.html') {
      html = html.replace('  <script defer', `  <link rel="preload" as="fetch" crossorigin href="${files.home}">\n  <script defer`);
    }
    write(page, html);
  }
  return {...release, loaderPath};
}

module.exports = {buildPortal};

if (require.main === module) {
  const [output] = process.argv.slice(2);
  assert.ok(output, 'Usage: node tools/build_portal.cjs NEW_OUTPUT_DIR');
  buildPortal(path.resolve(__dirname, '..'), output)
    .then(({files}) => console.log(`Staged Pages site with ${Object.keys(files).length} versioned Catalog files`))
    .catch(error => { console.error(error); process.exitCode = 1; });
}
