const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const {chromium}=require('C:/Users/eilot/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=__dirname,html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const parse=(text,id)=>JSON.parse(text.match(new RegExp('<script id="'+id+'"[^>]*>([\\s\\S]*?)</script>'))[1]);
const bank=parse(html,'bank-data'),scope=parse(html,'scope-data'),seed=parse(html,'seed-data');
const original=execFileSync('git',['show','06a0048294dac927fab2f3bdd8f12d73a529031d:index.html'],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024});
assert.deepEqual(bank,parse(original,'bank-data'),'question IDs, original objects, answers, options and ordering must stay unchanged');
assert.deepEqual(seed.recs,{});assert.deepEqual(seed.log,{});assert.equal(seed.sess,null);
assert.equal(bank.q.length,10067);assert.equal(scope.entries.length,10067);
new vm.Script(html.match(/<script>\s*"use strict";([\s\S]*?)<\/script>/)[1]);
const reviews=new Map(scope.entries.map(e=>[e.id,e]));
const pick=(status,auto=false)=>bank.q.filter(q=>reviews.get(q.i).status===status&&!!q.auto===auto);
const core=pick('core'),related=pick('pending'),excluded=pick('pending'),pending=pick('pending'),auto=pick('core',true);
assert.ok(core.length>100&&excluded.length&&pending.length&&auto.length);
const time=new Date('2026-11-21T10:00:00+08:00'),day=324;
const rec=[day,2,3,1,0,29911275];
const old={cfg:{bank:'all',cap:200,exam:'2026-11-27',rev:4,start:'2026-11-08',heard:{one:true},u:12},recs:{[core[0].i]:rec,[excluded[0].i]:rec},log:{'317':[22,0,15,7]},sess:{type:'day',day,queue:[excluded[0].i+'|0',core[0].i+'|0',excluded[1].i+'|0',pending[0].i+'|0',auto[0].i+'|0',related[0].i+'|0',core[1].i+'|0'],pos:1,ans:1,ok:0,bad:1,combo:0,best:0,sec:20,segN:1,segOk:0,segSec:20,recent:[excluded[0].i+'|0',core[0].i+'|1'],u:15}};
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';if(name==='seed'){res.setHeader('Content-Type','text/html');return res.end('<title>seed</title>');}const file=path.resolve(root,name);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end();}res.setHeader('Content-Type',mime[path.extname(file)]||'text/plain');fs.createReadStream(file).pipe(res);});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch();
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.clock.setFixedTime(time);
  const url='http://127.0.0.1:'+server.address().port;
  await page.goto(url+'/seed');await page.evaluate(value=>localStorage.setItem('jidiao-bgb-app-v1',JSON.stringify(value)),old);
  await page.goto(url+'/?v=exam-scope-20261122-v2');await page.waitForFunction(()=>window.__BGB_TEST__?.questions.length===10067);
  const state=await page.evaluate(()=>window.__BGB_TEST__.state);
  assert.deepEqual(state.recs[core[0].i],rec);assert.deepEqual(state.recs[excluded[0].i],rec);assert.deepEqual(state.log,old.log);
  for(const k of ['bank','cap','exam','start','rev','heard'])assert.deepEqual(state.cfg[k],old.cfg[k]);
  assert.equal(state.cfg.scope,'core');assert.equal(state.sess.pos,1);assert.equal(state.sess.queue[0],old.sess.queue[0]);
  assert.deepEqual(state.sess.queue.slice(1),[core[0].i+'|0',core[1].i+'|0']);
  const invariants=await page.evaluate(()=>{const t=window.__BGB_TEST__;return{pool:t.poolIds(),valid:t.poolIds().every(id=>t.scopeFor(id).status==='core'&&!t.QMAP.get(id).auto),recap:t.pickRecaps(t.state.sess,5)}});
  assert.ok(invariants.valid);assert.ok(invariants.pool.length>100);assert.ok(!invariants.recap.includes(excluded[0].i));
  await page.locator('[data-tab="bank"]').click();await page.locator('#q-category').selectOption('all');
  assert.equal(await page.locator('#q-scope').inputValue(),'core');await page.locator('.source-filters summary').click();await page.locator('#q-kind').selectOption('f');
  await page.locator('#q-search').fill(auto[0].q.replace(/\{\{blank:\d+\}\}/g,'').slice(0,8));await page.waitForTimeout(300);
  await page.evaluate(id=>{const t=window.__BGB_TEST__;t.ui.sKind='';t.ui.search='';t.ui.sScope='core';t.ui.openId=id;t.render();},auto[0].i);
  // A reference item can be looked up by exact original text, and never enters the practice pool.
  const originalStem=await page.evaluate(id=>window.__BGB_TEST__.originalStem(window.__BGB_TEST__.QMAP.get(id)),auto[0].i);
  assert.ok(!originalStem.includes('{{blank:'));assert.ok(!invariants.pool.includes(auto[0].i));
  await page.locator('[data-tab="settings"]').click();await page.locator('#s-bank').selectOption('party');
  assert.ok(await page.evaluate(()=>{const t=window.__BGB_TEST__;return t.poolIds().length>0&&t.poolIds().every(id=>t.scopeFor(id).subjects.includes('party')&&!t.QMAP.get(id).auto)}));
  assert.equal(await page.evaluate(()=>window.__BGB_TEST__.state.cfg.exam),'2026-11-27');
  await page.locator('[data-tab="today"]').click();await page.evaluate(()=>window.__BGB_TEST__.startExtra('random'));
  assert.ok(await page.evaluate(()=>{const t=window.__BGB_TEST__;return t.ui.xs.queue.every(e=>t.practiceEligible(e.split('|')[0]))}));
  assert.equal(await page.locator('.scope-evidence').count(),0,'scope evidence must be hidden before reveal');
  assert.equal(await page.locator('.scope-core').count(),1,'included party question is labeled core');
  await page.locator('[data-end]').click();await page.locator('[data-tab="settings"]').click();await page.locator('#s-bank').selectOption('all');
  // Withdrawn and model-generated corrections must remain clearly unverified in the actual library UI.
  for(const id of ['U-W-J0008','U-X-J0536','U-X-J0550']){
   await page.evaluate(id=>{const t=window.__BGB_TEST__;t.ui.tab='bank';t.ui.sBank='all';t.ui.sKind='';t.ui.sScope=t.scopeFor(id).status;t.ui.search=id;t.ui.openId=id;t.render();},id);
   const notice=page.locator('[data-correction-status="pending"]');
   assert.equal(await notice.count(),1,id+' must display pending correction');
   assert.equal(await notice.locator('b').innerText(),'订正待核对');
   assert.equal(await notice.locator('details').getAttribute('open'),null,'unverified reference stays collapsed');
  }
  const verifiedId=await page.evaluate(()=>[...window.__BGB_TEST__.corrections].find(([id,c])=>c.correctedText&&window.__BGB_TEST__.QMAP.has(id))[0]);
  await page.evaluate(id=>{const t=window.__BGB_TEST__;t.ui.sScope=t.scopeFor(id).status;t.ui.search=id;t.ui.openId=id;t.render();},verifiedId);
  assert.equal(await page.locator('[data-correction-status^="verified_"]').count(),1,'existing evidence-backed correction is displayed separately');
  await page.locator('[data-tab="today"]').click();
  await page.waitForFunction(async()=>{const names=await caches.keys();return names.includes('jdbg-app-exam-scope-20261122-v2')&&!!(await caches.match(location.origin+'/index.html'));});
  await ctx.setOffline(true);await page.reload();await page.waitForFunction(()=>window.__BGB_TEST__?.questions.length===10067);
  assert.deepEqual(await page.evaluate(id=>window.__BGB_TEST__.state.recs[id],excluded[0].i),rec);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);
  fs.mkdirSync(path.join(root,'test-results'),{recursive:true});await page.screenshot({path:path.join(root,'test-results','exam-scope-390.png'),fullPage:true});
  console.log(JSON.stringify({passed:true,total:bank.q.length,scope:scope.summary,corePractice:invariants.pool.length,automaticReferences:bank.q.filter(q=>q.auto).length,checks:['immutable original bank','empty publication seed','old progress and dates retained','remaining queue retirement','scope/source pools','reference-only auto','hidden scope evidence','offline reload','390px layout']}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
