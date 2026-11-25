// Create an isolated, seeded-size lab variant. Never writes to the input checkout.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const [source, output, count] = process.argv.slice(2);
const size = Number(count);
assert.ok(source && output && [1000, 5000].includes(size),
  'Usage: node tools/make_portal_benchmark_fixture.cjs SOURCE_ROOT NEW_OUTPUT_DIR 1000|5000');
fs.mkdirSync(output);
for (const name of ['assets', 'catalog', 'data']) {
  fs.cpSync(path.join(source, name), path.join(output, name), {recursive:true});
}
for (const name of fs.readdirSync(source).filter(name => name.endsWith('.html'))) {
  fs.copyFileSync(path.join(source, name), path.join(output, name));
}
const names = ['websites', 'websites-latest-01', 'websites-latest-02', 'websites-latest-03', 'websites-latest-04'];
const catalog = name => path.join(output, 'catalog', `${name}.json`);
const shards = names.map(name => JSON.parse(fs.readFileSync(catalog(name), 'utf8')));
const seeds = shards.flat();
assert.ok(seeds.length > 0 && seeds.length < size);
for (let index = seeds.length; index < size; index++) {
  const {previewImage, ...row} = seeds[index % seeds.length];
  // Clones share host icons. They have no new thumbnails because those are keyed by the public record ID.
  shards[index % shards.length].push({...row, id:`RES-LAB-${index}`, title:`${row.title} (lab ${index})`});
}
for (const [index, name] of names.entries()) {
  fs.writeFileSync(catalog(name), JSON.stringify(shards[index], null, 2) + '\n');
}
const manifest = JSON.parse(fs.readFileSync(catalog('manifest'), 'utf8'));
manifest.counts.websites = size;
manifest.counts.resources += shards.slice(1).flat().filter(row => row.id.startsWith('RES-LAB-')).length;
fs.writeFileSync(catalog('manifest'), JSON.stringify(manifest, null, 2) + '\n');
