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
  const wait = () => page.waitForTimeout(680);
  const nav = file => page.locator(`${mobile ? '.mobile-nav' : '.side-nav'} a[href="${file}"]`);
  const activate = locator => mobile ? locator.tap() : locator.click();
  const visit = async (locator, destination, visible) => {
    await activate(locator);
    await page.waitForURL(destination);
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
    await visit(nav('documents.html'), '**/documents.html', '.document-entry');
    await visit(page.locator('.document-detail').first(), '**/document.html?id=*', '.detail-hero');
    await page.goBack({waitUntil:'commit'});
    await page.locator('.document-entry').first().waitFor();
    await wait();
    await visit(nav('websites.html'), '**/websites.html', '.website-card');
    for (const number of [2, 1]) {
      await page.locator(`#pagination a.website-page-number[data-page="${number}"]`).press("Enter");
      await page.waitForFunction(target => (new URL(location.href).searchParams.get('page') || '1') === target, String(number));
      await wait();
    }
    await visit(nav('collections.html'), '**/collections.html', '.reading-guide');
    await visit(page.locator('.reading-guide').first(), '**/collection.html?id=*', '.reading-path');
    await visit(nav('collections.html'), '**/collections.html', '.reading-guide');
    await page.locator('.theme-toggle').click();
    await wait();
  } finally {
    const video = page.video();
    await context.close();
    await video.saveAs(final);
    await video.delete();
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
