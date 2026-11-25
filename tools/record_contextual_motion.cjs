// Records ordinary-speed Chromium interactions. Run after installing Playwright Chromium.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const {serve} = require('./measure_portal_performance.cjs');

async function record(browser, final, origin, mobile, dark) {
  const size = mobile ? {width:390, height:844} : {width:1080, height:720};
  const context = await browser.newContext({
    viewport:size,
    isMobile:mobile,
    hasTouch:mobile,
    recordVideo:{dir:path.dirname(final), size}
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const start = Date.now();
  const moments = {};
  const mark = label => { moments[label] = Date.now() - start; };
  const wait = () => page.waitForTimeout(500);
  const nav = file => page.locator(`${mobile ? '.mobile-nav' : '.side-nav'} a[href="${file}"]`);
  const activate = locator => mobile ? locator.tap() : locator.click();
  const visit = async (label, locator, destination, visible) => {
    mark(label);
    await activate(locator);
    await page.waitForURL(destination);
    await page.locator(visible).first().waitFor();
    await wait();
  };
  const back = async (label, visible) => {
    mark(label);
    await page.goBack({waitUntil:'commit'});
    await page.locator(visible).first().waitFor();
    await wait();
  };
  try {
    if (dark) await context.addInitScript(() => {
      if (!localStorage.getItem('myresourcecenter-theme')) localStorage.setItem('myresourcecenter-theme', 'dark');
    });
    await page.goto(new URL('index.html', origin).href);
    await page.locator('#docs .document-entry').first().waitFor();
    await wait();
    await visit('home-to-documents', nav('documents.html'), '**/documents.html', '.document-entry');
    await visit('documents-to-detail', page.locator('.document-detail').first(), '**/document.html?id=*', '.detail-hero');
    await back('history-back', '.document-entry');
    mark('history-forward');
    await page.goForward({waitUntil:'commit'});
    await page.locator('.detail-hero').waitFor();
    await wait();
    await visit('detail-to-documents', page.locator('.breadcrumb a'), '**/documents.html', '.document-entry');
    await visit('peer-to-home', nav('index.html'), '**/index.html', '#docs .document-entry');
    await visit('home-to-websites', nav('websites.html'), '**/websites.html', '.website-card');
    await visit('websites-to-detail', page.locator('.website-details').first(), '**/website.html?id=*', '.detail-hero');
    await back('website-history-back', '.website-card');
    for (const number of [2, 1]) {
      mark(`website-page-${number}`);
      await page.locator(`#pagination a.website-page-number[data-page="${number}"]`).press('Enter');
      await page.waitForFunction(target => (new URL(location.href).searchParams.get('page') || '1') === target, String(number));
      await wait();
    }
    mark('website-search');
    const search = page.locator('#q');
    await activate(search);
    await page.keyboard.insertText('Unity');
    await wait();
    await search.clear();
    mark('website-filter');
    const filter = page.locator('#category');
    await filter.selectOption({index:1});
    await wait();
    await filter.selectOption({index:0});
    await visit('peer-to-collections', nav('collections.html'), '**/collections.html', '.reading-guide');
    await visit('collection-to-detail', page.locator('.reading-guide').first(), '**/collection.html?id=*', '.reading-path');
    await visit('collection-to-list', page.locator('.breadcrumb a'), '**/collections.html', '.reading-guide');
    mark('theme-toggle');
    await activate(page.locator('.theme-toggle'));
    await wait();
    await visit('peer-to-documents', nav('documents.html'), '**/documents.html', '.document-entry');
    // The route and Viewer shell are local. Block the third-party frame.
    await page.route('https://drive.google.com/**', route => route.abort());
    await page.route('https://docs.google.com/**', route => route.abort());
    await visit('documents-to-viewer', page.locator('.document-title[href^="viewer.html"]').first(), '**/viewer.html?*', 'iframe');
  } finally {
    const video = page.video();
    await context.close();
    await video.saveAs(final);
    await video.delete();
    fs.writeFileSync(final.replace(/\.webm$/, '.json'), JSON.stringify(moments, null, 2) + '\n');
  }
}

async function main() {
  const [directory, ...variants] = process.argv.slice(2);
  assert.ok(directory && variants.length, 'Usage: node tools/record_contextual_motion.cjs OUTPUT NAME=STAGED_ROOT [...]');
  fs.mkdirSync(directory, {recursive:true});
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  const browser = await chromium.launch({
    ...(executablePath ? {executablePath} : {}),
    ignoreDefaultArgs:['--disable-back-forward-cache']
  });
  try {
    for (const variant of variants) {
      const [name, root] = variant.split('=');
      assert.match(name, /^[a-z0-9-]+$/);
      const server = await serve(path.resolve(root));
      try {
        await record(browser, path.join(directory, `${name}-desktop.webm`), server.origin, false, false);
        await record(browser, path.join(directory, `${name}-mobile.webm`), server.origin, true, true);
        console.log('Recorded', name);
      } finally {
        server.close();
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch(error => {console.error(error); process.exitCode = 1;});
