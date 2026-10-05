const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const CONTENT_TYPES = {
  '.css':'text/css', '.html':'text/html', '.ico':'image/x-icon', '.js':'text/javascript',
  '.json':'application/json', '.png':'image/png', '.svg':'image/svg+xml', '.webp':'image/webp'
};

function createServer() {
  return http.createServer((request,response) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
    catch { response.writeHead(400).end(); return; }
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const file = path.resolve(ROOT, relative);
    if (!file.startsWith(`${ROOT}${path.sep}`)) { response.writeHead(403).end(); return; }
    fs.stat(file, (statError,stat) => {
      if (statError || !stat.isFile()) { response.writeHead(404).end(); return; }
      response.writeHead(200, {
        'Cache-Control':'no-store',
        'Content-Type':CONTENT_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream'
      });
      fs.createReadStream(file).pipe(response);
    });
  });
}

async function openPage(page,origin,pathName) {
  const response = await page.goto(`${origin}/${pathName}`, {waitUntil:'networkidle'});
  assert.equal(response.status(),200,`${pathName} should load`);
  return response;
}

async function main() {
  const server = createServer();
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  let browser;
  try {
    const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
    browser = await chromium.launch({
      headless:true,
      ...(executablePath ? {executablePath} : {}),
      args:process.platform === 'linux' ? ['--no-sandbox'] : []
    });
    const context = await browser.newContext({viewport:{width:1280,height:900}});
    await context.route('**/assets/generated/site-icons/**',route=>route.abort());
    await context.route('https://drive.google.com/**',route=>route.abort());
    const page = await context.newPage();
    const pageErrors = [];
    const failedLocalResponses = [];
    page.on('pageerror',error=>pageErrors.push(error.message));
    page.on('response',response=>{
      if (!response.url().startsWith(origin) || response.status() < 400) return;
      const pathname = new URL(response.url()).pathname;
      if (pathname !== '/favicon.ico') failedLocalResponses.push(`${response.status()} ${pathname}`);
    });

    const pages = [
      'index.html','documents.html','websites.html','trend.html','taxonomy.html',
      'viewer.html?id=drive_smoke&format=PDF&title=Browser%20Smoke'
    ];
    for (const width of [390,768,1280]) {
      await page.setViewportSize({width,height:900});
      for (const pagePath of pages) {
        await openPage(page,origin,pagePath);
        const dimensions = await page.evaluate(()=>({viewport:window.innerWidth,document:document.documentElement.scrollWidth}));
        assert.ok(dimensions.document <= dimensions.viewport,`${pagePath} overflows horizontally at ${width}px: ${JSON.stringify(dimensions)}`);
      }
    }

    await openPage(page,origin,'documents.html');
    await page.locator('.document-entry').first().waitFor();
    assert.ok(await page.locator('.document-entry').count() <= 20,'Documents renders at most 20 cards');
    assert.ok(await page.locator('#category option[value="__unclassified__"]').count(),'Documents exposes the UI-only unclassified filter');
    await page.locator('#category').selectOption('__unclassified__');
    await page.waitForFunction(()=>new URL(location.href).searchParams.get('category')==='__unclassified__');
    const unclassifiedCount = await page.locator('.document-entry').count();
    assert.ok(unclassifiedCount > 0 && unclassifiedCount <= 20,'unclassified documents remain visible');
    await page.locator('#pagination a.document-page-number[data-page="2"]').click();
    await page.waitForFunction(()=>new URL(location.href).searchParams.get('page')==='2');
    assert.ok(await page.locator('.document-entry').count() <= 20,'Documents paginates after filtering');
    await page.goBack();
    await page.waitForFunction(()=>!new URL(location.href).searchParams.has('page'));

    await openPage(page,origin,'websites.html');
    await page.locator('.website-card').first().waitFor();
    assert.equal(await page.locator('.website-card').count(),20,'Websites renders 20 cards per page');
    const iconSource = await page.locator('.site-icon-image').first().getAttribute('src');
    assert.match(iconSource,/^assets\/generated\/site-icons\/[a-z0-9._-]+\.png$/i,'Site Icons must use a safe local hostname cache path');
    await page.locator('.site-icon-box.is-missing .site-icon-fallback').first().waitFor();
    await page.locator('#pagination a.website-page-number[data-page="2"]').click();
    await page.waitForFunction(()=>new URL(location.href).searchParams.get('page')==='2');
    await page.goBack();
    await page.waitForFunction(()=>!new URL(location.href).searchParams.has('page'));
    await page.locator('#category').selectOption('Tech');
    await page.locator('#site').selectOption('__other__');
    await page.locator('#author').selectOption('__other__');
    await page.locator('#sort').selectOption('asc');
    await page.waitForFunction(()=>{
      const query=new URL(location.href).searchParams;
      return query.get('category')==='Tech' && query.get('site')==='__other__' && query.get('author')==='__other__' && query.get('sort')==='asc';
    });
    const websiteCards = await page.locator('.website-card').count();
    assert.ok(websiteCards > 0 && websiteCards <= 20,'conjunctive Website filters return a paged result');
    const dates = (await page.locator('.website-published-at').allTextContents()).filter(value=>/^\d{4}-\d{2}-\d{2}$/.test(value));
    assert.deepEqual(dates,[...dates].sort(),'Website publication dates sort ascending');

    await openPage(page,origin,'index.html');
    await page.locator('[data-search-target]').selectOption('websites.html');
    await page.locator('[data-global-search]').fill('Unity');
    await page.locator('[data-global-search]').press('Enter');
    await page.waitForURL('**/websites.html?q=Unity');
    await page.locator('.website-card').first().waitFor();

    await openPage(page,origin,'taxonomy.html');
    await page.locator('#domains a[href="documents.html?category=Graphics"]').click();
    await page.waitForURL('**/documents.html?category=Graphics');
    await page.waitForFunction(()=>document.getElementById('category').value==='Graphics');
    assert.equal(await page.locator('#category').inputValue(),'Graphics','Domain navigation selects the exact Document Category');
    await openPage(page,origin,'taxonomy.html');
    await page.locator('#tags a[href="documents.html?tag=Shader"]').click();
    await page.waitForURL('**/documents.html?tag=Shader');
    await page.waitForFunction(()=>document.getElementById('tag').value==='Shader');
    assert.equal(await page.locator('#tag').inputValue(),'Shader','Tag navigation selects the exact Document Tag');
    await openPage(page,origin,'taxonomy.html');
    await page.locator('#engines a[href="websites.html?q=Unity"]').click();
    await page.waitForURL('**/websites.html?q=Unity');
    await page.locator('.website-card').first().waitFor();

    await openPage(page,origin,'index.html');
    await page.locator('.theme-toggle').click();
    assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
    await openPage(page,origin,'trend.html');
    assert.equal(await page.locator('html').getAttribute('data-theme'),'dark','shared theme persists across pages');
    await page.locator('.side-nav a[href="taxonomy.html"]').click();
    await page.waitForURL('**/taxonomy.html');
    await page.locator('.theme-toggle').click();
    assert.equal(await page.locator('html').getAttribute('data-theme'),'light');

    await openPage(page,origin,'viewer.html?id=drive_smoke&format=PDF&title=Browser%20Smoke');
    assert.ok(await page.locator('.viewer-frame').count(),'Viewer route renders its frame');
    assert.deepEqual(pageErrors,[],'Portal pages should not throw browser JavaScript errors');
    assert.deepEqual(failedLocalResponses,[],'Portal pages should not have missing local assets');
    await context.close();
    process.stdout.write('OK: six Portal pages at mobile/tablet/desktop; filters, pagination, taxonomy, theme, Viewer and local icon fallback\n');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
}

main().catch(error=>{console.error(error);process.exitCode=1;});
