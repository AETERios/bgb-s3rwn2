const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const root=path.resolve(__dirname,'../..');
const server=http.createServer((req,res)=>{
 const name=new URL(req.url,'http://localhost').pathname;
 const f=path.resolve(root,'.'+(name==='/'?'/index.html':name));
 if(!f.startsWith(root+path.sep)||!fs.existsSync(f)){res.writeHead(404).end();return;}
 let data=fs.readFileSync(f);
 if(f.endsWith('index.html'))data=data.toString().replace('scopeFor:questionScope,poolIds,','corrHTML,judgmentDiffHTML,today,scopeFor:questionScope,poolIds,');
 res.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':'text/html;charset=utf-8');res.end(data);
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const checks=[];
 try{
  const ctx=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const url='http://127.0.0.1:'+server.address().port;
  await page.goto(url);await page.waitForFunction(()=>window.__BGB_TEST__);
  assert.equal(await page.evaluate(()=>window.__BGB_TEST__.state.cfg.learnFirst),0);
  checks.push('new users default to direct answering');
  const preserved=await page.evaluate(()=>{
   const t=window.__BGB_TEST__,s=t.state;s.cfg.learnFirst=1;
   s.cfg.exam='2026-12-10';s.cfg.start='2026-11-20';
   s.cfg.clozes=s.cfg.clozes||{};s.cfg.clozes['d-0916']={v:2,m:[[1,3]],x:t.QMAP.get('d-0916').x};
   s.recs['j1-0340']=[t.today()+9,9,4,1,2,88];t.saveLocal();
   return JSON.stringify({exam:s.cfg.exam,start:s.cfg.start,cloze:s.cfg.clozes['d-0916'],rec:s.recs['j1-0340']});
  });
  await page.reload();await page.waitForFunction(()=>window.__BGB_TEST__);
  assert.equal(await page.evaluate(()=>{const s=window.__BGB_TEST__.state;return JSON.stringify({exam:s.cfg.exam,start:s.cfg.start,cloze:s.cfg.clozes['d-0916'],rec:s.recs['j1-0340']});}),preserved);
  assert.equal(await page.evaluate(()=>window.__BGB_TEST__.state.cfg.learnFirst),1);
  checks.push('legacy preference and learning dates, due records, custom cloze survive reload');
  async function one(id){await page.evaluate(id=>{const t=window.__BGB_TEST__;t.state.cfg.bank='all';t.state.cfg.scope='all';t.ui.xs=t.newSess([id],'one');t.ui.xs.queue=[id+'|0'];t.ui.mode='extra';t.enterStudy();},id);}
  await one('j1-0340');
  assert.equal(await page.locator('[data-judge]').count(),2);
  assert.equal(await page.locator('[data-learn-test]').count(),0);
  assert.equal(await page.locator('.corr').count(),0);
  assert.equal(await page.locator('.verdict').count(),0);
  checks.push('legacy learnFirst=1 does not reveal judgment answer or explanation before answering');
  await page.locator('[data-judge="0"]').click();
  const contrast=page.locator('[data-correction-status="bank_contrast"]');await contrast.waitFor();
  assert.match(await contrast.innerText(),/为什么错/);assert.match(await contrast.innerText(),/之内/);
  assert.ok(await contrast.locator('.judgment-source').count());assert.equal(await contrast.locator('del').count(),1);
  checks.push('false judgment shows full source, source question number and visible changed wording after answering');
  await one('j1-0340');await page.locator('[data-learn-open]').click();
  assert.equal(await page.locator('[data-learn-test]').count(),1);
  await page.locator('[data-learn-test]').click();assert.equal(await page.locator('[data-judge]').count(),2);
  checks.push('optional knowledge card still works when explicitly opened');
  await one('U-N-J0002');assert.equal(await page.locator('.corr').count(),0);
  await page.locator('[data-judge="0"]').click();
  const web=page.locator('[data-correction-status="verified_web"]');assert.match(await web.innerText(),/恶意程序/);
  assert.match(await web.locator('a').getAttribute('href'),/^https:\/\/learn.microsoft.com\//);
  checks.push('web verified explanation links directly to the checked primary source');
  await one('U-W-J0008');await page.locator('[data-judge="0"]').click();
  assert.equal(await page.locator('[data-correction-status="pending"]').count(),1);
  checks.push('incomplete evidence remains visibly pending');
  const stats=await page.evaluate(()=>{
   const t=window.__BGB_TEST__,entries=JSON.parse(document.getElementById('judgment-explanation-data').textContent).entries;
   const missing=entries.filter(e=>!t.corrHTML(t.QMAP.get(e.id)));
   const conflicts=entries.filter(e=>e.status==='conflict');
   return {n:entries.length,missing:missing.length,conflicts:conflicts.length,clearConflicts:conflicts.every(e=>/题库答案存在冲突/.test(t.corrHTML(t.QMAP.get(e.id))))};
  });
  assert.deepEqual(stats,{n:1688,missing:0,conflicts:8,clearConflicts:true});
  checks.push('all 1688 false judgments have an evidence state; all eight conflicts stay explicit');
  const ids=await page.evaluate(()=>{const t=window.__BGB_TEST__;return {choice:t.questions.find(q=>q.k==='c'&&!q.sourceOnly).i,multi:t.questions.find(q=>q.k==='m'&&!q.sourceOnly).i};});
  for(const id of [ids.choice,ids.multi]){await one(id);assert.equal(await page.locator('[data-learn-test]').count(),0);assert.ok(await page.locator('[data-opt]').count()>=2);}
  checks.push('choice and multiple choice start directly with their original options');
  await one('d-0916');assert.ok(await page.locator('input.fill').count()>0);
  assert.ok(await page.evaluate(()=>document.activeElement?.matches('input.fill')));
  checks.push('fill question starts directly with the first input focused');
  await page.setViewportSize({width:1440,height:900});await one('j1-0340');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  assert.deepEqual(errors,[]);checks.push('desktop layout and browser execution have no errors');
  fs.writeFileSync(path.join(__dirname,'ui-result.json'),JSON.stringify({version:'r24',passed:checks.length,checks},null,2));
  console.log(JSON.stringify({passed:checks.length,checks}));await ctx.close();
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;server.close();});
