const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict');
const {chromium}=require('C:/Users/eilot/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const server=http.createServer((req,res)=>{
 let name=decodeURIComponent(new URL(req.url,'http://x').pathname);if(name.endsWith('/'))name+='index.html';
 const file=path.resolve('.'+name);if(!file.startsWith(process.cwd()+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end();}
 res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'text/html;charset=utf-8');res.end(fs.readFileSync(file));
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch();
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.clock.setFixedTime(new Date('2026-11-23T10:00:00+08:00'));
  const url='http://127.0.0.1:'+server.address().port;await page.goto(url);await page.waitForFunction(()=>window.__BGB_TEST__?.questions.length===13200);
  const inventory=await page.evaluate(()=>{const t=window.__BGB_TEST__;return {count:t.poolIds().length,scope:t.state.cfg.scope,bank:t.state.cfg.bank,cap:t.state.cfg.cap,originalMemory:t.questions.filter(q=>t.referenceOnly(q)).length,pending:t.questions.find(q=>!q.auto&&t.scopeFor(q.i).status==='pending').i,auto:t.questions.find(q=>q.auto).i,fill:t.questions.find(q=>q.k==='f'&&!q.auto).i};});
  assert.equal(inventory.count,13200);assert.equal(inventory.scope,'all');assert.equal(inventory.bank,'all');assert.equal(inventory.cap,0);
  fs.mkdirSync('test-results',{recursive:true});await page.screenshot({path:'test-results/unlimited-today-390.png',fullPage:true});
  await page.evaluate(()=>window.__BGB_TEST__.startDay());
  assert.equal(await page.evaluate(()=>new Set(window.__BGB_TEST__.state.sess.queue).size),13200,'daily queue includes every available new question');
  // A tiny legacy cap and a large answered count must never gate the remaining questions.
  const plans=[];
  for(const date of ['2026-11-21','2026-11-23','2026-11-27','2026-11-29']){
   await page.clock.setFixedTime(new Date(date+'T10:00:00+08:00'));
   const p=await page.evaluate(()=>{const t=window.__BGB_TEST__,day=t.plan().t;t.state.cfg.cap=1;t.state.log[day]=[600,200,700,100];t.state.sess=null;t.ui.studying=false;t.render();return t.plan();});
   plans.push({date,suggested:p.perDay,remaining:p.newLeft});assert.equal(p.newLeft,13200);assert.ok(p.perDay>1);
   await page.locator('[data-start="today"]').click();assert.equal(await page.evaluate(()=>window.__BGB_TEST__.state.sess.queue.length),13200);
  }
  // Updating the examination day changes the recommendation without changing availability.
  const suggestions=await page.evaluate(()=>{const t=window.__BGB_TEST__;t.state.cfg.rev=0;t.state.log={};t.state.cfg.exam='2026-12-01';let near=t.plan().fullPerDay;t.state.cfg.exam='2026-12-20';return {near,far:t.plan().fullPerDay,count:t.poolIds().length,shown:t.plan().perDay};});
  assert.ok(suggestions.near>suggestions.far);assert.equal(suggestions.count,13200);
  const imported=await page.evaluate(()=>{const t=window.__BGB_TEST__;t.mergeState({cfg:{scope:'core',bank:'professional',cap:7,exam:'2026-11-27',start:'2026-11-08',rev:4,u:Date.now()+10000}});return {scope:t.state.cfg.scope,bank:t.state.cfg.bank,cap:t.state.cfg.cap,exam:t.state.cfg.exam,start:t.state.cfg.start,rev:t.state.cfg.rev,count:t.poolIds().length};});
  assert.deepEqual(imported,{scope:'all',bank:'all',cap:0,exam:'2026-11-27',start:'2026-11-08',rev:4,count:13200},'legacy imports also migrate without changing dates');
  // Completed sessions may immediately start another round even when every record is scheduled in the future.
  const preserved=await page.evaluate(()=>{const t=window.__BGB_TEST__,day=t.plan().t;for(const q of t.questions)t.state.recs[q.i]=[day+10,10,3,0,2,12345];t.state.log={fixture:[12,34,40,6]};t.state.cfg.notes={keep:'原有笔记'};t.state.sess=t.newSess([t.questions[0].i],'day');t.state.sess.pos=1;t.ui.studying=false;t.render();return JSON.stringify({recs:t.state.recs,log:t.state.log,notes:t.state.cfg.notes});});
  await page.locator('[data-start="today"]').click();assert.equal(await page.evaluate(()=>window.__BGB_TEST__.state.sess.queue.length),13200);
  assert.equal(await page.evaluate(()=>{const t=window.__BGB_TEST__;return JSON.stringify({recs:t.state.recs,log:t.state.log,notes:t.state.cfg.notes});}),preserved);
  // Both reference and pending entries have a real per-question learning action.
  for(const id of [inventory.auto,inventory.pending,inventory.fill]){
   await page.evaluate(id=>{const t=window.__BGB_TEST__;t.ui.studying=false;t.ui.tab='bank';t.ui.sKind='';t.ui.sScope='all';t.ui.sBank='all';t.ui.sSubject='';t.ui.search=id;t.ui.openId=id;t.render();},id);
   await page.locator('[data-study-one="'+id+'"]').click();
   await page.evaluate(()=>{const t=window.__BGB_TEST__;if(t.ui.card&&t.ui.card.data){t.ui.card.mode='type';t.render();}});
   assert.equal(await page.evaluate(()=>window.__BGB_TEST__.ui.xs.queue[0]),id+'|0');
   if(id===inventory.auto){assert.ok(await page.locator('input.fill').count()>=1);assert.equal(await page.locator('[data-check]').count(),1);assert.equal(await page.locator('[data-reveal]').count(),0);}
   if(id===inventory.pending)assert.match(await page.locator('.card .chip').allTextContents().then(a=>a.join(' ')),/待核/);
   if(id===inventory.fill)assert.ok(await page.locator('input.fill, .blank-slot').count()>=1,'a fill question always offers a real answer control');
  }
  // Wrong-question, recitation and random modes are complete queues, not ten/fifty-question gates.
  const modes=await page.evaluate(()=>{const t=window.__BGB_TEST__;for(let i=0;i<120;i++)t.state.recs[t.questions[i].i][4]=0;const out={};for(const mode of ['wrong','recite','random']){t.startExtra(mode);out[mode]=t.ui.xs.queue.length;}out.expectedRecite=t.questions.filter(q=>q.k==='r'||t.referenceOnly(q)).length;return out;});
  assert.equal(modes.wrong,120);assert.equal(modes.recite,modes.expectedRecite);assert.equal(modes.random,13200);
  assert.deepEqual(errors,[]);fs.mkdirSync('test-results',{recursive:true});await page.screenshot({path:'test-results/unlimited-study-390.png'});
  console.log(JSON.stringify({passed:true,inventory,plans,modes,checks:['all original questions learnable','unlimited despite old cap and count','exam-aware advisory planning','new questions during final review and after exam','repeat all future-due questions','per-question pending and original-memory study','automatic fill focus','existing records notes and dates preserved']}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
