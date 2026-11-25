const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const SOURCE = path.join(__dirname, '..');
const ROOT = path.resolve(process.env.PORTAL_SMOKE_ROOT || SOURCE);
const documentCatalog = /\/catalog\/document-presentation(?:\.[a-f0-9]{20})?\.json$/;
const repositoryCatalog = /\/catalog\/repositories(?:\.[a-f0-9]{20})?\.json$/;
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

async function checkCatalogRollover(context, origin) {
  const {buildPortal} = require('./build_portal.cjs');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-rollover-'));
  const stale = await context.newPage();
  try {
    const source = path.join(temp, 'source');
    const older = path.join(temp, 'older');
    for (const dir of ['catalog', 'assets']) {
      fs.cpSync(path.join(SOURCE, dir), path.join(source, dir), {recursive:true});
    }
    fs.copyFileSync(path.join(SOURCE, 'repositories.html'), path.join(source, 'repositories.html'));
    const file = path.join(source, 'catalog/repositories.json');
    const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
    const title = rows[0].title;
    rows[0].title += ' (retired revision)';
    fs.writeFileSync(file, JSON.stringify(rows));
    const {files, loaderPath} = await buildPortal(source, older);

    const route = `/repositories.html?q=${encodeURIComponent(title)}&keep=release#list`;
    const html = url => url.pathname === '/repositories.html';
    const loader = url => url.pathname === '/' + loaderPath;
    await stale.route(html, request => request.fulfill({path:path.join(older, 'repositories.html')}));
    await stale.route(loader, request => request.fulfill({path:path.join(older, loaderPath)}));
    const requests = [];
    const responses = [];
    stale.on('request', request => requests.push(new URL(request.url()).pathname));
    stale.on('response', response => responses.push([new URL(response.url()).pathname, response.status()]));

    // The old HTML and JS are available as if cached. The server only has current Catalog files.
    await openPage(stale, origin, route.slice(1));
    assert.ok(responses.some(([url,status]) => url === '/' + loaderPath && status === 200));
    assert.ok(responses.some(([url,status]) => url === '/' + files.repositories && status === 404));
    const retry = stale.getByRole('button', {name:'ページを再読み込み'});
    await retry.waitFor({timeout:5000});
    assert.equal(await retry.count(), 1);
    assert.equal(requests.filter(url => url === '/' + files.repositories).length, 1);
    assert.equal(requests.filter(url => url === '/repositories.html').length, 1);
    assert.ok(!requests.includes('/catalog/repositories.json'), 'the old loader does not fall back to the unversioned Catalog');
    assert.equal(await stale.locator('.repository-card').count(), 0);

    await stale.unroute(html);
    await stale.unroute(loader);
    const newLoader = stale.waitForResponse(response => {
      const url = new URL(response.url()).pathname;
      return /^\/assets\/catalog\.[a-f0-9]{20}\.js$/.test(url) && url !== '/' + loaderPath && response.ok();
    });
    await retry.click();
    await newLoader;
    assert.equal(stale.url(), origin + route);
    const card = stale.locator('.repository-card').first();
    await card.waitFor();
    assert.equal(await stale.locator('#q').inputValue(), title);
    assert.ok((await card.textContent()).includes(title));
    assert.doesNotMatch(await card.textContent(), /retired revision/);
    assert.equal(await stale.getByRole('alert').count(), 0);
    assert.equal(await retry.count(), 0);
  } finally {
    await stale.close();
    fs.rmSync(temp, {recursive:true, force:true});
  }
}

async function activateViewerDuringMotion(page, touch = false) {
  const viewerLink = page.locator('.detail-hero').locator('a[href^="viewer.html"]');
  await viewerLink.waitFor();
  const transitioning = await page.evaluate(() => {
    const root = document.documentElement;
    if (root.dataset.pageMotion !== 'forward') return false;
    delete root.dataset.motionSettled;
    const animation = document.querySelector('.content').getAnimations()
      .find(item => item.animationName === 'portal-page-forward');
    animation.pause();
    animation.currentTime = 85;
    return true;
  });
  if (transitioning) {
    const {x,y,width,height} = await viewerLink.boundingBox();
    if (touch) await page.touchscreen.tap(x + width / 2, y + height / 2);
    else await page.mouse.click(x + width / 2, y + height / 2);
  } else {
    await viewerLink.click();
  }
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
    await context.route('https://docs.google.com/**',route=>route.abort());
    const page = await context.newPage();
    const pageErrors = [];
    const failedLocalResponses = [];
    const recordPageError = error => {
      // Chromium reports CSS-only native transition cancellation without a script stack.
      if (error.name === 'AbortError' && error.message === 'Transition was skipped' && !error.stack) return;
      pageErrors.push(error.message);
    };
    page.on('pageerror',recordPageError);
    page.on('response',response=>{
      if (!response.url().startsWith(origin) || response.status() < 400) return;
      const pathname = new URL(response.url()).pathname;
      if (pathname !== '/favicon.ico') failedLocalResponses.push(`${response.status()} ${pathname}`);
    });

    const pages = [
      'index.html','documents.html','websites.html','repositories.html','repository.html?id=RES-20260716-007','trend.html','taxonomy.html',
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

    // Home / Trendを含む各画面でナビゲーション構成が変わらないことを確認する。
    const expectedNavigation = [
      ['index.html','ホーム'],
      ['documents.html','ドキュメント'],
      ['websites.html','Webサイト'],
      ['repositories.html','リポジトリ'],
      ['collections.html','コレクション'],
      ['taxonomy.html','分野・タグ'],
      ['trend.html','トレンド']
    ];
    let homeSidebarNote = '';
    for (const selectedHref of ['index.html','documents.html','websites.html','repositories.html','collections.html','taxonomy.html','trend.html']) {
      await openPage(page,origin,selectedHref);
      for (const selector of ['.side-nav','.mobile-nav']) {
        const actual = await page.locator(`${selector} a`).evaluateAll(links =>
          links.map(link => [link.getAttribute('href'),link.lastChild.textContent.trim()]));
        assert.deepEqual(actual,expectedNavigation,`${selectedHref}: ${selector} navigation should match Home`);
        assert.equal(await page.locator(`${selector} a[aria-current="page"]`).getAttribute('href'),selectedHref);
      }
      assert.equal(await page.locator('.side-nav a[href="repositories.html"] .icon svg').count(),1,'Repository has one SVG icon');
      if (selectedHref === 'index.html') homeSidebarNote = await page.locator('.sidebar-note').textContent();
      if (selectedHref === 'trend.html') assert.equal(await page.locator('.sidebar-note').textContent(),homeSidebarNote,'Trend sidebar note matches Home');
    }

    await openPage(page,origin,'index.html');
    const preload = page.locator('link[rel="preload"][as="fetch"]');
    if (await preload.count()) {
      const requests = await page.evaluate(() => performance.getEntriesByType('resource')
        .map(entry => new URL(entry.name).pathname).filter(pathname => pathname.startsWith('/catalog/')));
      assert.equal(requests.length, 1, 'the staged Home fetches only its preloaded projection');
      assert.match(requests[0], /^\/catalog\/home\.[a-f0-9]{20}\.json$/);
      // Model an old HTML document whose fingerprinted loader disappeared in a deployment.
      const stale = await context.newPage();
      const loader = /\/assets\/catalog\.[a-f0-9]{20}\.js$/;
      await stale.route(loader, route => route.fulfill({status:404, body:''}));
      try {
        await openPage(stale, origin, 'index.html');
        const retry = stale.getByRole('button', {name:'ページを再読み込み'});
        await retry.waitFor({timeout:5000});
        await stale.unroute(loader);
        await retry.click();
        await stale.locator('#docs .document-entry').first().waitFor();
        assert.equal(await retry.count(),0,'reloading with the current release clears the error');
      } finally {
        await stale.close();
      }
      await checkCatalogRollover(context, origin);
    }
    const heroArt = page.locator('.technical-hero > a');
    assert.equal(await heroArt.evaluate(node=>getComputedStyle(node,'::after').animationName),'portal-scan','Home scans the illustration once');
    assert.equal(await heroArt.evaluate(node=>getComputedStyle(node,'::after').animationIterationCount),'1');
    await page.keyboard.press('/');
    assert.equal(await page.locator('[data-global-search]:focus-visible').count(),1);
    assert.notEqual(await page.locator('[data-global-search]').evaluate(node=>getComputedStyle(node).boxShadow),'none','keyboard search uses the focus halo');
    const paths = page.locator('#collections .reading-guide').first();
    await paths.scrollIntoViewIfNeeded();
    await page.waitForFunction(()=>document.querySelector('#collections .reading-guide')?.classList.contains('motion-reveal'));
    assert.equal(await paths.evaluate(node=>getComputedStyle(node).animationName),'portal-enter');
    await paths.focus();
    assert.equal(await paths.evaluate(node=>getComputedStyle(node).opacity),'1','focus settles a revealed link immediately');
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await heroArt.evaluate(node=>getComputedStyle(node,'::after').animationName),'none','reduced motion stops decorative scanning');
    assert.equal(await paths.evaluate(node=>getComputedStyle(node).translate),'none');
    await page.emulateMedia({reducedMotion:'no-preference'});

    let releaseCatalog;
    const catalogReady = new Promise(resolve=>{releaseCatalog = resolve;});
    await page.route(documentCatalog,async route=>{
      await catalogReady;
      await route.continue();
    });
    await page.goto(origin+'/documents.html',{waitUntil:'domcontentloaded'});
    try {
      const skeleton = page.locator('#list .catalog-skeleton[aria-hidden="true"]').first();
      assert.ok(await skeleton.isVisible(),'slow catalog shows a decorative skeleton');
      assert.match(await page.locator('#count').textContent(),/読み込み中/);
      assert.equal(await skeleton.evaluate(node=>getComputedStyle(node,'::after').animationIterationCount),'2');
      await page.emulateMedia({reducedMotion:'reduce'});
      assert.equal(await skeleton.evaluate(node=>getComputedStyle(node,'::after').animationName),'none');
      await page.emulateMedia({reducedMotion:'no-preference'});
    } finally {
      releaseCatalog();
    }
    await page.locator('.document-entry').first().waitFor();
    await page.unroute(documentCatalog);
    assert.equal(await page.locator('#list .catalog-skeleton').count(),0,'loaded cards replace the skeleton');
    assert.ok(await page.locator('.document-entry').count() <= 20,'Documents renders at most 20 cards');
    assert.ok(await page.locator('#category option[value="__unclassified__"]').count(),'Documents exposes the UI-only unclassified filter');
    await page.locator('#category').selectOption('__unclassified__');
    await page.waitForFunction(()=>new URL(location.href).searchParams.get('category')==='__unclassified__');
    const unclassifiedCount = await page.locator('.document-entry').count();
    assert.ok(unclassifiedCount > 0 && unclassifiedCount <= 20,'unclassified documents remain visible');
    await page.setViewportSize({width:390,height:375});
    await page.locator('#pagination a.document-page-number[data-page="2"]').click();
    await page.waitForFunction(()=>new URL(location.href).searchParams.get('page')==='2');
    assert.ok(await page.locator('.document-entry').count() <= 20,'Documents paginates after filtering');
    const focusedResult = page.locator('.document-title:focus');
    await focusedResult.waitFor();
    assert.equal(await focusedResult.count(),1,'pagination focuses the new results');
    const focusedBounds = await focusedResult.boundingBox();
    assert.ok(focusedBounds.y >= 68 && focusedBounds.y + focusedBounds.height <= 375,'focused result stays visible on a short mobile viewport');
    assert.equal(await page.locator('.document-entry').first().evaluate(node=>getComputedStyle(node).opacity),'1');
    assert.equal(await page.locator('.document-entry').nth(1).evaluate(node=>getComputedStyle(node).animationName),'portal-result-page');
    await page.goBack();
    await page.waitForFunction(()=>!new URL(location.href).searchParams.has('page'));
    await page.setViewportSize({width:1280,height:900});
    await page.locator('#q').fill('no-match-motion-fixture');
    assert.equal(await page.locator('.document-entry').count(),0,'search redraws immediately');
    await page.locator('#q').fill('');
    assert.equal(await page.locator('.document-entry').first().evaluate(node=>getComputedStyle(node).animationName),'none','search never replays pagination motion');

    await openPage(page,origin,'websites.html');
    await page.locator('.website-card').first().waitFor();
    assert.equal(await page.locator('.website-card').count(),20,'Websites renders 20 cards per page');
    const iconSource = await page.locator('.site-icon-image').first().getAttribute('src');
    assert.match(iconSource,/^assets\/generated\/site-icons\/[a-z0-9._-]+\.png\?v=[a-f0-9]{12}$/i,'Site Icons must use a safe local path and public manifest version');
    await page.locator('.site-icon-box.is-missing .site-icon-fallback').first().waitFor();
    await page.setViewportSize({width:390,height:375});
    await page.locator('#pagination a.website-page-number[data-page="2"]').press('Enter');
    await page.waitForFunction(()=>new URL(location.href).searchParams.get('page')==='2');
    const focusedWebsite = page.locator('.website-title:focus');
    await focusedWebsite.waitFor();
    const websiteBounds = await focusedWebsite.boundingBox();
    assert.ok(websiteBounds.y >= 68 && websiteBounds.y + websiteBounds.height <= 375,
      'keyboard pagination keeps the focused Website visible below the sticky navigation');
    await page.goBack();
    await page.waitForFunction(()=>!new URL(location.href).searchParams.has('page'));
    await focusedWebsite.waitFor();
    await page.setViewportSize({width:1280,height:900});
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

    const expectedRepositoryCount = JSON.parse(fs.readFileSync(path.join(ROOT,'catalog/repositories.json'),'utf8')).length;
    await openPage(page,origin,'repositories.html');
    await page.locator('.repository-card').first().waitFor();
    assert.equal(await page.locator('.repository-card').count(),expectedRepositoryCount);
    assert.equal(await page.locator('.side-nav a[href="repositories.html"]').getAttribute('aria-current'),'page');
    await page.locator('#q').fill('FidelityFX-CAS');
    assert.equal(await page.locator('.repository-card').count(),1);
    await page.locator('#tag').selectOption('AMD');
    await page.waitForFunction(()=>new URL(location.href).searchParams.get('tag')==='AMD');
    await page.locator('#q').fill('no-match');
    assert.equal(await page.locator('.repository-card').count(),0);
    await page.locator('[data-reset-filters]').click();
    assert.equal(await page.locator('.repository-card').count(),expectedRepositoryCount);
    assert.equal(await page.locator('.repository-card-link').first().getAttribute('target'),'_blank');
    await page.locator('.repository-details').first().click();
    await page.waitForURL('**/repository.html?id=RES-20260716-007');
    await page.locator('h1').waitFor();
    assert.match(await page.locator('h1').textContent(),/CAS/);
    assert.equal(await page.locator('.side-nav a[aria-current="page"]').getAttribute('href'),'repositories.html');
    assert.equal(await page.locator('a[href^="collection.html?id="]').count(),0,'CAS has no canonical collection membership');
    await openPage(page,origin,'repository.html?id=RES-20260716-008');
    await page.locator('a[href="collection.html?id=COL-TEMPORAL-RENDERING"]').waitFor();
    await page.locator('a[href="collection.html?id=COL-TEMPORAL-RENDERING"]').click();
    await page.locator('a[href="repository.html?id=RES-20260716-008"]').waitFor();
    await page.locator('a[href="repository.html?id=RES-20260716-008"]').click();
    await page.locator('h1').waitFor();
    assert.ok(await page.locator('.detail-side a[href^="website.html?id="]').count());
    await openPage(page,origin,'index.html');
    await page.locator('[data-search-target]').selectOption('repositories.html');
    await page.locator('[data-global-search]').fill('FidelityFX-CAS');
    await page.locator('[data-global-search]').press('Enter');
    await page.waitForURL('**/repositories.html?q=FidelityFX-CAS');
    assert.equal(await page.locator('.repository-card').count(),1);

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
    assert.equal(await page.locator('#viewer-frame').getAttribute('src'),'https://drive.google.com/file/d/drive_smoke/preview','PDF/PPTX Viewer uses Drive preview');
    assert.equal(await page.locator('#viewer-drive-link').getAttribute('href'),'https://drive.google.com/file/d/drive_smoke/view','PDF/PPTX original link uses Drive');

    await openPage(page,origin,'viewer.html?id=native_doc&format=GOOGLE_DOC&title=Native%20Doc');
    assert.equal(await page.locator('#viewer-frame').getAttribute('src'),'https://docs.google.com/document/d/native_doc/preview','Google Docs Viewer uses native preview');
    assert.equal(await page.locator('#viewer-drive-link').getAttribute('href'),'https://docs.google.com/document/d/native_doc/edit','Google Docs original link stays native');

    await openPage(page,origin,'viewer.html?id=native_slides&format=GOOGLE_SLIDES&title=Native%20Slides');
    assert.equal(await page.locator('#viewer-frame').getAttribute('src'),'https://docs.google.com/presentation/d/native_slides/preview','Google Slides Viewer uses native preview');
    assert.equal(await page.locator('#viewer-drive-link').getAttribute('href'),'https://docs.google.com/presentation/d/native_slides/edit','Google Slides original link stays native');

    // Exercise pagination/history with a public projection fixture, without adding seed data.
    const sample=JSON.parse(fs.readFileSync(path.join(ROOT,'catalog/repositories.json'),'utf8'))[0];
    const fixture=Array.from({length:45},(_,i)=>({...sample,id:`RES-FIXTURE-${i}`,title:`Reference ${i}`}));
    await context.route(repositoryCatalog,route=>route.fulfill({json:fixture}));
    await openPage(page,origin,'repositories.html?keep=1&page=2');
    assert.equal(await page.locator('.repository-card').count(),20);
    assert.match(await page.locator('#list').textContent(),/Reference 20/);
    await page.locator('#pagination a[data-page="3"]').first().click();
    assert.equal(await page.locator('.repository-card').count(),5);
    await page.goBack();
    assert.match(await page.locator('#list').textContent(),/Reference 20/);
    await page.locator('#q').fill('Reference 44');
    assert.equal(await page.locator('.repository-card').count(),1);
    assert.equal(new URL(page.url()).searchParams.get('page'),null);
    assert.equal(new URL(page.url()).searchParams.get('keep'),'1');
    await page.locator('#clear').click();
    assert.equal(await page.locator('.repository-card').count(),20);
    await context.unroute(repositoryCatalog);
    await openPage(page,origin,'repositories.html');
    await page.setViewportSize({width:1280,height:900});
    if(process.env.PORTAL_SCREENSHOT_DIR) {
      fs.mkdirSync(process.env.PORTAL_SCREENSHOT_DIR,{recursive:true});
      await page.screenshot({path:path.join(process.env.PORTAL_SCREENSHOT_DIR,'repositories-desktop.png'),fullPage:true});
    }
    await page.setViewportSize({width:390,height:844});
    if(process.env.PORTAL_SCREENSHOT_DIR) await page.screenshot({path:path.join(process.env.PORTAL_SCREENSHOT_DIR,'repositories-mobile.png'),fullPage:true});

    // Use an un-intercepted context for the browser's native cross-document navigation.
    const navigation = await browser.newContext({viewport:{width:1280,height:900}});
    await navigation.addInitScript(()=>{
      window.addEventListener('pagereveal',event=>{
        const {viewTransition} = event;
        document.documentElement.dataset.testTransition=String(Boolean(viewTransition));
        viewTransition?.ready.then(()=>{
          const search = document.getElementById('q');
          if (!search) return;
          const {x,y,width,height} = search.getBoundingClientRect();
          document.documentElement.dataset.testTransitionInteractive=String(
            document.elementFromPoint(x+width/2,y+height/2) === search
          );
        },()=>{});
      });
    });
    const routePage = await navigation.newPage();
    routePage.on('pageerror',error=>{
      if (new URL(routePage.url()).pathname.endsWith('/viewer.html')) pageErrors.push(error.message);
      else recordPageError(error);
    });
    await openPage(routePage,origin,'index.html');
    await routePage.locator('.side-nav a[href="documents.html"]').press('Enter');
    await routePage.waitForURL('**/documents.html');
    const marker = routePage.locator('.side-nav a[aria-current="page"] .nav-indicator');
    assert.equal(await marker.isVisible(),true,'the active navigation link has a visible indicator');
    if (await routePage.evaluate(()=>'onpagereveal' in window)) {
      await routePage.waitForFunction(()=>document.documentElement.hasAttribute('data-test-transition'));
      assert.equal(await routePage.locator('html').getAttribute('data-test-transition'),'true','same-origin links use native view transitions');
      assert.equal(await marker.evaluate(node=>getComputedStyle(node).viewTransitionName),'portal-nav-marker');
      await routePage.waitForFunction(()=>document.documentElement.hasAttribute('data-test-transition-interactive'));
      assert.equal(await routePage.locator('html').getAttribute('data-test-transition-interactive'),'true','search is clickable during the native transition');
      await routePage.waitForFunction(()=>document.documentElement.dataset.pageMotion === 'crossfade');
      const search = routePage.locator('#q');
      const bounds = await search.boundingBox();
      await routePage.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      await routePage.keyboard.type('Unity');
      assert.equal(await search.inputValue(),'Unity','using the live search succeeds during transition');
      await search.fill('');
    }

    await routePage.locator('.document-detail').first().click();
    await routePage.waitForURL('**/document.html?id=*');
    if (await routePage.evaluate(()=>'onpagereveal' in window)) {
      await routePage.waitForFunction(()=>document.documentElement.dataset.pageMotion === 'forward');
      await routePage.goBack({waitUntil:'commit'});
      await routePage.waitForURL('**/documents.html');
      await routePage.waitForFunction(()=>document.documentElement.dataset.pageMotion === 'back');
      await routePage.goForward({waitUntil:'commit'});
      await routePage.waitForURL('**/document.html?id=*');
      await routePage.waitForFunction(()=>document.documentElement.dataset.pageMotion === 'forward');
    }

    await navigation.route('https://drive.google.com/**',route=>route.abort());
    await navigation.route('https://docs.google.com/**',route=>route.abort());
    await activateViewerDuringMotion(routePage);
    await routePage.waitForURL('**/viewer.html?*');
    if (await routePage.evaluate(()=>'onpagereveal' in window)) {
      await routePage.waitForFunction(()=>document.documentElement.hasAttribute('data-test-transition'));
      assert.equal(await routePage.locator('html').getAttribute('data-test-transition'),'false','document viewer skips native view transitions');
    }

    const touch = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    try {
      await touch.route('https://drive.google.com/**',route=>route.abort());
      await touch.route('https://docs.google.com/**',route=>route.abort());
      const touchPage = await touch.newPage();
      await openPage(touchPage,origin,'documents.html');
      await touchPage.locator('.document-detail').first().tap();
      await touchPage.waitForURL('**/document.html?id=*');
      if (await touchPage.evaluate(()=>'onpagereveal' in window)) {
        await touchPage.waitForFunction(()=>document.documentElement.dataset.pageMotion === 'forward');
      }
      await activateViewerDuringMotion(touchPage, true);
      await touchPage.waitForURL('**/viewer.html?*');
    } finally {
      await touch.close();
    }

    await routePage.emulateMedia({reducedMotion:'reduce'});
    await openPage(routePage,origin,'index.html');
    await routePage.locator('.side-nav a[href="documents.html"]').click();
    await routePage.waitForURL('**/documents.html');
    if (await routePage.evaluate(()=>'onpagereveal' in window)) {
      await routePage.waitForFunction(()=>document.documentElement.hasAttribute('data-test-transition'));
      assert.equal(await routePage.locator('html').getAttribute('data-test-transition'),'false','reduced motion preserves direct navigation');
    }
    await openPage(routePage,origin,'assets/technical-environment.svg');
    const mesh = routePage.locator('.technical-wireframe');
    assert.equal(await mesh.evaluate(node=>getComputedStyle(node).opacity),'0.72','reduced motion shows the finished wireframe');
    assert.equal(await mesh.evaluate(node=>getComputedStyle(node).animationName),'none');
    await routePage.emulateMedia({reducedMotion:'no-preference'});
    assert.equal(await mesh.evaluate(node=>getComputedStyle(node).animationName),'wireframe-reveal');

    await routePage.addInitScript(()=>{
      const mode=new URL(location.href).searchParams.get('motionFailure');
      if (mode==='absent') { window.IntersectionObserver=undefined; return; }
      window.IntersectionObserver=class {
        constructor(callback) {
          if (mode==='constructor') throw new Error('Motion constructor unavailable');
          this.callback=callback;
        }
        observe(target) {
          if (mode==='observe') throw new Error('Motion observe unavailable');
          setTimeout(()=>this.callback([{isIntersecting:true,target}]));
        }
        unobserve() { throw new Error('Motion unobserve unavailable'); }
      };
    });
    for (const failure of ['absent','constructor','observe','callback']) {
      const warning = failure==='absent' ? null : routePage.waitForEvent('console',{
        predicate:message=>message.type()==='warning' && message.text().startsWith('Home motion could not')
      });
      await openPage(routePage,origin,'index.html?motionFailure='+failure);
      await warning;
      assert.ok(await routePage.locator('#docs .document-entry a').first().isVisible(),failure);
      assert.ok(await routePage.locator('#collections .reading-guide').first().isVisible(),failure);
      assert.equal(await routePage.locator('#docs [role="alert"], #collections [role="alert"]').count(),0,failure);
      assert.equal(await routePage.locator('.motion-reveal').count(),0,failure);
    }
    await navigation.close();

    assert.deepEqual(pageErrors,[],'Portal pages should not throw browser JavaScript errors');
    assert.deepEqual(failedLocalResponses,[],'Portal pages should not have missing local assets');
    await context.close();
    process.stdout.write('OK: Portal pages at mobile/tablet/desktop; filters, pagination, taxonomy, theme, Viewer, local icon fallback and Technical Motion\n');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
}

main().catch(error=>{console.error(error);process.exitCode=1;});
