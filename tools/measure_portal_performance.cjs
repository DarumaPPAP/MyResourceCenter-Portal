// Run from the source checkout. See docs/portal-performance.md for the lab protocol.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {gzipSync} = require('node:zlib');
const {chromium} = require('playwright');

const selectors = {
  home: ['index.html', '#docs .document-entry'],
  websites: ['websites.html', '.website-card'],
  collection: ['collection.html', '.reading-path li']
};
const types = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json',
  '.svg':'image/svg+xml', '.webp':'image/webp', '.png':'image/png'};
const categories = [
  'devtools.timeline', 'blink.user_timing', 'loading',
  'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame',
  'disabled-by-default-devtools.timeline.stack', 'disabled-by-default-v8.compile'
].join(',');

async function serve(root) {
  const files = new Map();
  const server = http.createServer((request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      const relative = decodeURIComponent(url.pathname.replace(/^\/portal\//, ''));
      const file = path.resolve(root, relative || 'index.html');
      if (!file.startsWith(root + path.sep)) return response.writeHead(404).end();
      if (!files.has(file)) {
        if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return response.writeHead(404).end();
        const body = fs.readFileSync(file);
        const type = types[path.extname(file)] || 'application/octet-stream';
        const compressed = /^(?:text\/|application\/json|image\/svg)/.test(type) ? gzipSync(body) : null;
        files.set(file, {body, type, compressed, etag: `"${createHash('sha256').update(body).digest('hex')}"`});
      }
      const {body, type, compressed, etag} = files.get(file);
      const headers = {'Content-Type': type, 'Cache-Control': 'public, max-age=600',
        ETag: etag, Vary: 'Accept-Encoding', 'Timing-Allow-Origin': '*'};
      if (request.headers['if-none-match'] === etag) return response.writeHead(304, headers).end();
      if (compressed && /\bgzip\b/.test(request.headers['accept-encoding'] || '')) {
        return response.writeHead(200, {...headers, 'Content-Encoding':'gzip'}).end(compressed);
      }
      return response.writeHead(200, headers).end(body);
    } catch {
      return response.writeHead(400).end();
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {origin:`http://127.0.0.1:${server.address().port}/portal/`, close:() => server.close()};
}

function observe() {
  const data = window.labPerformance = {lcp:[], shifts:[], longTasks:[], events:[], frames:[], interactions:[]};
  const options = {'largest-contentful-paint': 'lcp',
    'layout-shift': 'shifts', longtask: 'longTasks', event: 'events'};
  performance.setResourceTimingBufferSize(3000);
  for (const [type, key] of Object.entries(options)) {
    if (!PerformanceObserver.supportedEntryTypes.includes(type)) continue;
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        data[key].push({...entry.toJSON(), ...(type === 'largest-contentful-paint' ?
          {element: entry.element?.tagName, url: entry.url} : {})});
      }
    }).observe({type, buffered:true, durationThreshold:16});
  }
  const measureFrame = previous => requestAnimationFrame(now => {
    if (previous !== undefined) data.frames.push({time:now, duration:now - previous});
    if (now < 12000) measureFrame(now);
  });
  measureFrame();
  for (const eventName of ['input', 'click']) {
    window.addEventListener(eventName, event => {
      if (eventName === 'input' ? event.target.id !== 'q' : !event.target.closest('#pagination a[data-page]')) return;
      performance.mark(`lab:${eventName}:start`);
      data.interactions.push({event, start:performance.now()});
    }, true);
    window.addEventListener(eventName, event => {
      const interaction = data.interactions.at(-1);
      if (interaction?.event !== event) return;
      interaction.duration = performance.now() - interaction.start;
      interaction.name = eventName;
      interaction.trusted = event.isTrusted;
      delete interaction.event;
      performance.mark(`lab:${eventName}:end`);
    });
  }
}

// Native Response.json() combines body consumption and parsing without a
// separate timeline slice. Only trace runs use this diagnostic equivalent.
function instrumentJsonParse() {
  const json = Response.prototype.json;
  Response.prototype.json = async function() {
    if (!new URL(this.url || location.href).pathname.includes('/catalog/')) return json.call(this);
    const text = await this.text();
    const start = performance.now();
    try {
      return JSON.parse(text);
    } finally {
      performance.measure('lab:json:' + new URL(this.url).pathname.split('/').pop(),
        {start, end:performance.now()});
    }
  };
}

async function withTrace(cdp, file, run) {
  if (!file) return run();
  await cdp.send('Tracing.start', {categories, transferMode:'ReturnAsStream'});
  try {
    return await run();
  } finally {
    const done = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve));
    await cdp.send('Tracing.end');
    const {stream} = await done;
    const chunks = [];
    for (;;) {
      const {data, eof, base64Encoded} = await cdp.send('IO.read', {handle:stream});
      chunks.push(Buffer.from(data, base64Encoded ? 'base64' : 'utf8'));
      if (eof) break;
    }
    await cdp.send('IO.close', {handle:stream});
    fs.writeFileSync(file, gzipSync(Buffer.concat(chunks)));
  }
}

function collectNetwork(cdp, origin) {
  const chain = new Map();
  cdp.on('Network.requestWillBeSent', ({requestId, request, timestamp, type}) => {
    if (request.url.startsWith(origin)) chain.set(requestId, {
      url:request.url, start:timestamp, type,
      requestCacheControl:request.headers['Cache-Control'] || request.headers['cache-control']
    });
  });
  cdp.on('Network.requestServedFromCache', ({requestId}) => {
    if (chain.has(requestId)) chain.get(requestId).servedFromCache = true;
  });
  cdp.on('Network.responseReceived', ({requestId, response}) => {
    if (!chain.has(requestId)) return;
    const headers = Object.fromEntries(Object.entries(response.headers).map(([name,value]) => [name.toLowerCase(), value]));
    Object.assign(chain.get(requestId), {
      status:response.status, diskCache:response.fromDiskCache, protocol:response.protocol,
      cacheControl:headers['cache-control'], age:headers.age, etag:headers.etag,
      encoding:headers['content-encoding'], timing:response.timing
    });
  });
  cdp.on('Network.loadingFinished', ({requestId, encodedDataLength, timestamp}) => {
    if (chain.has(requestId)) Object.assign(chain.get(requestId), {encodedDataLength, end:timestamp});
  });
  return chain;
}

async function snapshot(page, cdp, network) {
  const heap = await cdp.send('Runtime.getHeapUsage');
  const metrics = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(({name,value}) => [name,value]));
  const timings = await page.evaluate(() => ({
    ...window.labPerformance,
    navigation:performance.getEntriesByType('navigation')[0]?.toJSON(),
    resources:performance.getEntriesByType('resource').map(entry => entry.toJSON()),
    measures:performance.getEntriesByType('measure').map(entry => entry.toJSON()),
    cards:document.querySelectorAll('.website-card').length,
    count:document.querySelector('#count')?.textContent
  }));
  return {...timings, heap, metrics, network:[...network.values()]};
}

async function scenario(browser, origin, reducedMotion, size, trace) {
  const context = await browser.newContext({viewport:{width:390,height:844}, deviceScaleFactor:2,
    isMobile:true, hasTouch:true, reducedMotion});
  try {
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', {rate:4});
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline:false, latency:80, downloadThroughput:200000, uploadThroughput:95000
    });
    await cdp.send('Performance.enable');
    const network = collectNetwork(cdp, origin);
    await page.addInitScript(observe);
    if (trace) await page.addInitScript(instrumentJsonParse);
    const samples = [];
    let collectionUrl;
    async function navigate(route, label = route) {
      const [file, selector] = selectors[route];
      network.clear();
      const url = route === 'collection' ? collectionUrl : new URL(file, origin).href;
      const response = await page.goto(url, {waitUntil:'domcontentloaded'});
      assert.equal(response.status(), 200);
      await page.locator(selector).first().waitFor();
      const ready = await page.evaluate(name => {
        performance.mark('lab:ready:' + name);
        return performance.now();
      }, label);
      if (route === 'home') collectionUrl = await page.locator('#collections a.reading-guide').first().evaluate(link => link.href);
      await page.waitForTimeout(1000); // Common observation window for LCP, CLS, decode and animation.
      samples.push({label, ready, ...await snapshot(page, cdp, network)});
    }

    return await withTrace(cdp, trace, async () => {
      if (!size) await navigate('home');
      await navigate('websites');
      const before = samples.at(-1);
      const search = await page.locator('#q').evaluate(input =>
        ['R','Re','Ren','Rendering','rendering','missing-exact-test','','UNI','Unity',''].map(value => {
          input.value = value;
          const start = performance.now();
          input.dispatchEvent(new InputEvent('input', {bubbles:true}));
          return {value, duration:performance.now() - start};
        })
      );
      await page.locator('#q').press('x');
      await page.locator('#q').press('Backspace');
      const link = page.locator('#pagination a.website-page-number[data-page="2"]');
      await link.click();
      await page.locator('.website-title:focus').waitFor();
      assert.equal(new URL(page.url()).searchParams.get('page'), '2');
      await page.waitForTimeout(350);
      samples.push({label:'interactions', search, ready:before.ready, ...await snapshot(page, cdp, network)});
      if (!size) {
        await navigate('collection');
        await navigate('home', 'home-warm');
        await navigate('websites', 'websites-warm');
      }
      return samples;
    });
  } finally {
    await context.close();
  }
}

async function main() {
  const [out, repeat, sizeArg, ...variantArgs] = process.argv.slice(2);
  const trials = Number(repeat), size = Number(sizeArg);
  assert.ok(out && Number.isSafeInteger(trials) && trials > 0 && [0,1000,5000].includes(size) && variantArgs.length,
    'Usage: node tools/measure_portal_performance.cjs OUTPUT TRIALS 0|1000|5000 NAME=PATH_OR_HTTPS [...]');
  fs.mkdirSync(out, {recursive:true});
  const variants = [];
  let browser;
  try {
    for (const arg of variantArgs) {
      const separator = arg.indexOf('=');
      const name = arg.slice(0, separator), target = arg.slice(separator + 1);
      assert.match(name, /^[a-z0-9-]+$/);
      const remote = /^https?:\/\//.test(target);
      const server = remote ? null : await serve(path.resolve(target));
      variants.push({name, server, origin:remote ? target.replace(/\/?$/, '/') : server.origin, runs:[]});
    }
    const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
    browser = await chromium.launch(executablePath ? {executablePath} : {});
    for (let trial = 0; trial < trials; trial++) {
      for (const motion of ['no-preference', 'reduce']) {
        for (let offset = 0; offset < variants.length; offset++) {
          const variant = variants[(trial + offset) % variants.length];
          const file = path.join(out, `${size}-${variant.name}-${motion}.trace.json.gz`);
          variant.runs.push({trial, motion, samples:await scenario(browser, variant.origin, motion, size)});
          if (trial === 0 && (size === 0 || motion === 'no-preference')) {
            await scenario(browser, variant.origin, motion, size, file);
          }
          console.log(size || 'public catalog', variant.name, motion, trial + 1);
        }
      }
    }
    const payload = {size, trials, chromium:browser.version(), node:process.version, measuredAt:new Date().toISOString(),
      variants:variants.map(({name,origin,runs}) => ({name,origin,runs}))};
    fs.writeFileSync(path.join(out, `${size}-runs.json.gz`), gzipSync(JSON.stringify(payload)));
  } finally {
    await browser?.close();
    for (const variant of variants) variant.server?.close();
  }
}

main().catch(error => {console.error(error); process.exitCode = 1;});
