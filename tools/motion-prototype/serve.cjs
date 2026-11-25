// Serve an isolated copy of a staged Portal with prototype controls on each page.
const fs = require('node:fs/promises');
const path = require('node:path');
const {serve} = require('../measure_portal_performance.cjs');

async function main() {
  const [staged, output] = process.argv.slice(2);
  if (!staged || !output) throw Error('Usage: node tools/motion-prototype/serve.cjs STAGED_PORTAL NEW_OUTPUT_DIR');
  const root = path.resolve(output);
  await fs.mkdir(root);
  await fs.cp(path.resolve(staged), root, {recursive:true});
  for (const asset of ['prototype.css', 'prototype.js']) {
    await fs.copyFile(path.join(__dirname, asset), path.join(root, asset));
  }
  // The Home SVG is its own document, so page styles cannot pause its wireframe.
  const art = path.join(root, 'assets/technical-environment.svg');
  const svg = await fs.readFile(art, 'utf8');
  await fs.writeFile(art, svg.replace(/<style>[\s\S]*?<\/style>/, style => style.includes('wireframe-reveal') ? '' : style));
  const head = '<link rel="stylesheet" href="prototype.css"><script src="prototype.js"></script>';
  for (const file of await fs.readdir(root)) {
    if (!file.endsWith('.html') || file === 'viewer.html') continue;
    const target = path.join(root, file);
    const html = await fs.readFile(target, 'utf8');
    await fs.writeFile(target, html.replace('</head>', head + '</head>'));
  }
  const server = await serve(root);
  console.log(new URL('index.html', server.origin).href);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
