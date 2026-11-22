const {chromium}=require('C:/Users/eilot/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const BASE='06a0048294dac927fab2f3bdd8f12d73a529031d';
const oldIndex=execFileSync('git',['show',BASE+':index.html'],{cwd:__dirname,maxBuffer:10*1024*1024});
const oldSW=execFileSync('git',['show',BASE+':sw.js'],{cwd:__dirname});
let current=false;
const requests=[];
const server=http.createServer((req,res)=>{
 const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
 requests.push({url:req.url,current,cache:req.headers['cache-control']});
 const file=path.resolve(__dirname,name);
 res.setHeader('X-Test-Version',current?'new':'old');
 res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.png')?'image/png':name.endsWith('.webmanifest')?'application/manifest+json':'text/html');
 // Reproduce a browser that retained the original long-lived HTTP cache.
 res.setHeader('Cache-Control',name==='sw.js'?'no-cache':'public,max-age=31536000');
 if(!current&&name==='index.html')return res.end(oldIndex);
 if(!current&&name==='sw.js')return res.end(oldSW);
 if(!file.startsWith(__dirname+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end();}
 fs.createReadStream(file).pipe(res);
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch();
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const base='http://127.0.0.1:'+server.address().port;
  async function diagnostics(label,response){
   console.error(label,JSON.stringify({requests,response:response?{status:response.status(),fromSW:response.fromServiceWorker(),headers:await response.allHeaders()}:null}));
  }
  await page.goto(base+'/');
  await page.waitForFunction(()=>navigator.serviceWorker.controller);
  await page.waitForFunction(()=>navigator.serviceWorker.getRegistration().then(r=>r.active?.state==='activated'));
  await page.waitForFunction(()=>OFFLINE_READY);
  await page.evaluate(()=>{window.__OLD_CONTROLLER=navigator.serviceWorker.controller;});
  const legacy={cfg:{exam:'2026-11-27',start:'2026-11-08',rev:4,bank:'all',cap:13,heard:{kept:true},u:987},
   recs:{'E-D0001':[333,3,4,0,2,12345],'U-W-S0009':[321,1,2,1,0,12344]},
   log:{320:[2,3,4,1]},sess:null};
  await page.evaluate(o=>{Object.assign(S.cfg,o.cfg);S.recs=o.recs;S.log=o.log;S.sess=o.sess;saveLocal();},legacy);
  await page.evaluate(()=>caches.open('unrelated-app-keep').then(c=>c.put('/unrelated',new Response('keep'))));
  current=true;
  // The old worker ignores query strings. Install the new worker without losing state,
  // then load the same-origin version entrance, as a normal refresh would.
  await page.evaluate(()=>navigator.serviceWorker.getRegistration().then(r=>r.update()));
  await page.waitForFunction(async()=>{const r=await navigator.serviceWorker.getRegistration();return r.active?.state==='activated'&&!r.installing&&await caches.match(location.origin+'/?v=exam-scope-20261122-v2').then(async hit=>!!hit&&(await hit.text()).includes('id="scope-data"'));});
  // Confirm the controlling worker's code, rather than comparing unstable JS wrappers.
  await page.waitForFunction(()=>new Promise(resolve=>{
   const channel=new MessageChannel(),timeout=setTimeout(()=>resolve(false),500);
   channel.port1.onmessage=e=>{clearTimeout(timeout);resolve(e.data?.cache==='jdbg-app-exam-scope-20261122-v2');};
   navigator.serviceWorker.controller?.postMessage({type:'BGB_VERSION'},[channel.port2]);
  }),{},{timeout:15000});
  let response=await page.goto(base+'/?v=exam-scope-20261122-v2'),refreshes=0;
  // A legacy controlled document may retain its original navigation response once.
  // One normal refresh is supported; no cache, storage or existing record is cleared.
  if(!await page.evaluate(()=>!!window.__BGB_TEST__)){
   response=await page.reload();refreshes++;
  }
  await page.waitForFunction(()=>window.__BGB_TEST__?.scope.size===10067,{},{timeout:15000}).catch(async error=>{await diagnostics('Upgrade timeout',response);throw error;});
  assert.equal((await response.allHeaders())['x-test-version'],'new');
  assert.ok(requests.some(r=>r.current&&r.url==='/?v=exam-scope-20261122-v2'&&r.cache==='no-cache'));
  assert.deepEqual(await page.evaluate(()=>window.__BGB_TEST__.state.recs),legacy.recs);
  assert.deepEqual(await page.evaluate(()=>window.__BGB_TEST__.state.log),legacy.log);
  const cfg=await page.evaluate(()=>window.__BGB_TEST__.state.cfg);
  for(const key of ['exam','start','rev','bank','cap','heard','u'])assert.deepEqual(cfg[key],legacy.cfg[key]);
  assert.equal(cfg.scope,'core');
  assert.equal(await page.evaluate(()=>caches.has('unrelated-app-keep')),true);
  assert.equal(await page.evaluate(()=>window.__BGB_TEST__.poolIds().includes('U-W-S0009')),false);
  assert.equal(await page.evaluate(()=>window.__BGB_TEST__.poolIds().every(id=>window.__BGB_TEST__.questionScope(id).status==='core')),true);
  assert.equal(await page.evaluate(()=>window.__BGB_TEST__.poolIds().some(id=>window.__BGB_TEST__.questions.find(q=>q.i===id).auto)),false);
  // Repair only the unfinished queue; keep answered history and all records.
  const repaired=await page.evaluate(()=>{
   const t=window.__BGB_TEST__,s={queue:['U-W-S0009|0','U-W-S0009|0','E-D0001|0'],pos:1,recent:['U-W-S0009|0','E-D0001|2']};
   t.repairSession(s);return s;
  });
  assert.deepEqual(repaired.queue,['U-W-S0009|0','E-D0001|0']);assert.equal(repaired.pos,1);
  assert.deepEqual(repaired.recent,['E-D0001|2']);
  // Re-open an old imported session: it must not restore removed questions.
  await page.evaluate(()=>{
   const t=window.__BGB_TEST__;t.mergeState({sess:{queue:['U-W-S0009|0','E-D0001|0'],pos:0,recent:['U-W-S0009|0'],u:Date.now()+10000}});
  });
  assert.deepEqual(await page.evaluate(()=>window.__BGB_TEST__.state.sess.queue),['E-D0001|0']);
  await page.waitForTimeout(1700);
  await context.setOffline(true);await page.reload();
  await page.waitForFunction(()=>window.__BGB_TEST__?.scope.size===10067);
  assert.deepEqual(await page.evaluate(()=>window.__BGB_TEST__.state.recs),legacy.recs);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  assert.deepEqual(errors,[]);
  fs.mkdirSync(path.join(__dirname,'test-results'),{recursive:true});
  await page.screenshot({path:path.join(__dirname,'test-results','scope-upgrade-offline-390.png'),fullPage:true});
  await context.close();
  console.log('Normal refreshes after version entry: '+refreshes);
  console.log('Passed: real old Service Worker and HTTP cache upgrade; preserved records, log, dates, due and settings; source filters and old queues; no automatic cloze in practice; unrelated caches; offline reload; 390px layout.');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
