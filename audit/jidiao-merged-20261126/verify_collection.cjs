const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const root=path.resolve(__dirname,'../..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const server=http.createServer((req,res)=>{
 const p=new URL(req.url,'http://localhost').pathname;
 if(p==='/'||p==='/index.html'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);return;}
 const f=path.join(root,p);if(!f.startsWith(root+path.sep)||!fs.existsSync(f)){res.writeHead(404).end();return;}
 res.setHeader('Content-Type',f.endsWith('.css')?'text/css':f.endsWith('.js')?'text/javascript':'application/octet-stream');res.end(fs.readFileSync(f));
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const checks=[],errors=[];
 try{
  const ctx=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto('http://127.0.0.1:'+server.address().port);await p.waitForFunction(()=>window.__BGB_TEST__);
  const before=await p.evaluate(()=>{const t=window.__BGB_TEST__;t.state.cfg.exam='2026-12-10';t.state.cfg.start='2026-11-20';t.state.cfg.rev=3;t.state.cfg.notes={keep:'旧笔记'};t.state.cfg.clozes={'U-W-F0001':{v:2,x:'旧文本',m:[[0,1]]}};t.state.recs['U-W-F0001']=[360,4,2,1,2,123456];t.state.log['300']=[3,2,1,5];t.saveLocal();return JSON.stringify({recs:t.state.recs,log:t.state.log,exam:t.state.cfg.exam,start:t.state.cfg.start,rev:t.state.cfg.rev,clozes:t.state.cfg.clozes,notes:t.state.cfg.notes});});
  const baseCount=await p.evaluate(()=>window.__BGB_TEST__.poolIds('all').length);
  await p.locator('[data-jm-open]').click();
  await p.locator('.jm-group').first().waitFor();assert.match(await p.locator('.brand').innerText(),/181.*804.*649/s);checks.push('home entry and 181 groups');
  assert.equal(await p.evaluate(()=>window.__BGB_TEST__.poolIds('jidiao').length),649);
  assert.equal(await p.evaluate(()=>window.__BGB_TEST__.questions.length),13391);
  assert.equal(await p.evaluate(()=>window.__BGB_TEST__.poolIds('all').length),baseCount);checks.push('independent pool; legacy totals unchanged');
  await p.locator('#q-search').fill('跨局交路机车工作计划编制和执行');await p.waitForTimeout(400);
  assert.equal(await p.locator('.jm-group').count(),1);await p.locator('.jm-group>summary').click();
  assert.match(await p.locator('.jm-passages').innerText(),/指图定机车折返局/);assert.match(await p.locator('.jm-passages').innerText(),/（四）/);
  await p.locator('[data-jm-hide]').click();assert.equal(await p.locator('.jm-passages').isVisible(),false);
  await p.locator('[data-jm-hide]').click();assert.equal(await p.locator('.jm-passages').isVisible(),true);checks.push('complete four-clause source and cover/reveal');
  const after=await p.evaluate(()=>{const t=window.__BGB_TEST__;return JSON.stringify({recs:t.state.recs,log:t.state.log,exam:t.state.cfg.exam,start:t.state.cfg.start,rev:t.state.cfg.rev,clozes:t.state.cfg.clozes,notes:t.state.cfg.notes});});assert.equal(after,before);checks.push('reading does not alter records/dates/due/clozes/notes');
  await p.evaluate(()=>{window.__BGB_TEST__.state.cfg.learnFirst=0;});
  for(const kind of ['c','m','j','f','r']){
   const id=await p.evaluate(k=>{const t=window.__BGB_TEST__,s=t.JIDIAO.originals.find(s=>s.kind===k);t.startMergedPractice(null,s.sourceId);return s.practiceId;},kind);
   await p.waitForTimeout(60);
   assert.equal(await p.evaluate(()=>window.__BGB_TEST__.studyQuestion(window.__BGB_TEST__.QMAP.get(window.__BGB_TEST__.ui.xs.queue[0].split('|')[0])).k),kind);
   if(kind==='c'||kind==='m'){
    const expected=await p.evaluate(id=>window.__BGB_TEST__.QMAP.get(id).o.length,id);
    assert.equal(await p.locator('[data-opt]').count(),expected);
   }
   await p.evaluate(()=>{const t=window.__BGB_TEST__;t.ui.studying=false;t.ui.tab='bank';t.ui.sBank='jidiao';t.render();});
  }checks.push('all five original types preserved; all choice options rendered');
  await p.locator('#q-search').fill('');await p.waitForTimeout(400);
  assert.equal(await p.locator('.jm-group').count(),20);await p.locator('[data-jm-more]').click();assert.equal(await p.locator('.jm-group').count(),40);
  await p.locator('#jm-book').selectOption('机调规');assert.equal(await p.locator('.jm-group').count(),20);checks.push('search, regulation filter, and pagination');
  const downloadEvent=p.waitForEvent('download');await p.locator('[data-jm-export]').click();const download=await downloadEvent;const downloaded=await download.path();const exported=JSON.parse(fs.readFileSync(downloaded,'utf8'));assert.equal(exported.originals.length,804);checks.push('full collection JSON export');
  const overflow=await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false);checks.push('mobile width');
  await p.reload();await p.waitForFunction(()=>window.__BGB_TEST__);assert.equal(await p.locator('#s-bank-plan').inputValue(),'jidiao');
  await p.goto('http://127.0.0.1:'+server.address().port+'/?collection=jidiao');await p.waitForFunction(()=>window.__BGB_TEST__);assert.equal(await p.locator('.jm-group').count(),20);checks.push('selection persistence and direct collection URL');
  await p.locator('.jm-group>summary').first().click();await p.screenshot({path:path.join(__dirname,'collection-mobile.png'),fullPage:false});
  assert.deepEqual(errors,[]);checks.push('no JavaScript errors');
  const report={passed:true,checks,errors};fs.writeFileSync(path.join(__dirname,'browser-verification.json'),JSON.stringify(report,null,2));process.stdout.write(JSON.stringify(report));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;server.close();});
