// Chromium lab comparison. See docs/technical-motion.md for the command and methodology.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const [output, count, ...origins] = process.argv.slice(2);
const trials = Number(count);
const routes = {
  documents: ['.document-entry', '.document-title'],
  websites: ['.website-card', '.website-title']
};

async function tracePagination(cdp, page, link, file) {
  await page.evaluate(()=>{
    for (const [prototype, method] of [[Element.prototype,'scrollIntoView'],[HTMLElement.prototype,'focus']]) {
      const original=prototype[method];
      prototype[method]=function(...args) {
        const start=performance.now();
        try { return original.apply(this,args); }
        finally { performance.measure('pagination:'+method,{start,end:performance.now()}); }
      };
    }
  });
  const done = new Promise(resolve=>cdp.once('Tracing.tracingComplete',resolve));
  await cdp.send('Tracing.start',{
    categories:'devtools.timeline,blink.user_timing,disabled-by-default-devtools.timeline.stack',
    transferMode:'ReturnAsStream'
  });
  await link.evaluate(node=>{
    performance.mark('pagination:start');
    node.click();
    performance.mark('pagination:end');
    performance.measure('pagination:click','pagination:start','pagination:end');
  });
  await cdp.send('Tracing.end');
  const {stream} = await done;
  const chunks = [];
  for (;;) {
    const {data,eof,base64Encoded} = await cdp.send('IO.read',{handle:stream});
    chunks.push(Buffer.from(data,base64Encoded?'base64':'utf8'));
    if (eof) break;
  }
  await cdp.send('IO.close',{handle:stream});
  fs.writeFileSync(file,Buffer.concat(chunks));
}

async function run(browser, origin, route, traceFile) {
  const context = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  try {
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
    await page.addInitScript(()=>{
      window.frameIntervals=[];
      let previous;
      function frame(now) {
        if (previous !== undefined) window.frameIntervals.push(now-previous);
        previous=now;
        if(now<1450) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
    await page.goto(new URL(route+'.html',origin).href,{waitUntil:'domcontentloaded'});
    const [card,title] = routes[route];
    await page.locator(card).first().waitFor();
    await page.waitForFunction(()=>performance.now()>1500);
    const frameIntervals=await page.evaluate(()=>window.frameIntervals);
    const search=await page.locator('#q').evaluate(input=>
      ['R','Re','Ren','Rend','Rendering','missing-exact-test','','UNI','Unity',''].map(value=>{
        input.value=value;
        const start=performance.now();
        input.dispatchEvent(new InputEvent('input',{bubbles:true}));
        return performance.now()-start;
      })
    );
    const pageLink=page.locator('#pagination a[data-page="2"]').first();
    await pageLink.scrollIntoViewIfNeeded();
    if (traceFile) {
      await tracePagination(cdp,page,pageLink,traceFile);
      return;
    }
    const paging=await pageLink.evaluate(node=>{
      const start=performance.now();
      node.click();
      return performance.now()-start;
    });
    assert.equal(new URL(page.url()).searchParams.get('page'),'2');
    assert.equal(await page.locator(title+':focus').count(),1);
    return {frameIntervals,search,paging};
  } finally {
    await context.close();
  }
}

async function main() {
  assert.ok(output && Number.isSafeInteger(trials) && trials>=0 && origins.length>=2,
    'Usage: node tools/measure_mobile_motion.cjs OUTPUT_DIR TRIALS URL [URL ...]');
  fs.mkdirSync(output,{recursive:true});
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  const browser = await chromium.launch(executablePath?{executablePath}:{});
  try {
    const runs=origins.map(origin=>({origin,documents:[],websites:[]}));
    for(let trial=0;trial<trials;trial++) {
      for(const route of Object.keys(routes)) {
        // Rotate the starting variant to limit systematic ordering effects.
        for(let index=0;index<runs.length;index++) {
          const variant=runs[(index+trial)%runs.length];
          variant[route].push(await run(browser,variant.origin,route));
        }
      }
      console.log('Finished trial',trial+1);
    }
    fs.writeFileSync(path.join(output,'runs.json'),JSON.stringify({chromium:browser.version(),runs}));
    for(const [index,variant] of runs.entries()) {
      for(const route of Object.keys(routes)) {
        await run(browser,variant.origin,route,path.join(output,`${index}-${route}.trace.json`));
      }
    }
  } finally {
    await browser.close();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
