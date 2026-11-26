const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const root=path.resolve(__dirname,'../..');
const server=http.createServer((req,res)=>{
 const f=path.join(root,new URL(req.url,'http://localhost').pathname==='/'?'index.html':new URL(req.url,'http://localhost').pathname);
 if(!f.startsWith(root+path.sep)||!fs.existsSync(f)){res.writeHead(404).end();return;}
 let body=fs.readFileSync(f);
 if(f.endsWith('index.html'))body=body.toString().replace('scopeFor:questionScope,poolIds,','blankCard,today,scopeFor:questionScope,poolIds,');
 res.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':'text/html;charset=utf-8');res.end(body);
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  const ctx=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.__BGB_TEST__);
  assert.equal(await page.evaluate(()=>window.__BGB_TEST__.state.cfg.learnFirst),1);
  const ids=await page.evaluate(()=>{
   const t=window.__BGB_TEST__;t.state.cfg.bank='all';t.state.cfg.scope='all';
   return {fill:'d-0916',multi:t.questions.find(q=>q.k==='m'&&q.a.length>=3).i,choice:t.questions.find(q=>q.k==='c').i,
    wrong:t.questions.find(q=>q.k==='j'&&q.a===0&&t.corrections.get(q.i)?.correctedText).i,
    right:t.questions.find(q=>q.k==='j'&&q.a===1).i,order:t.questions.find(q=>q.k==='o').i};
  });
  async function one(id,flag=0,known=false){
   return page.evaluate(({id,flag,known})=>{
    const t=window.__BGB_TEST__,s=t.state;s.cfg.bank='all';s.cfg.scope='all';
    if(known)s.recs[id]=[t.today()+9,9,4,1,2,88];else delete s.recs[id];
    t.ui.xs=t.newSess([id],'one');t.ui.xs.queue=[id+'|'+flag];t.ui.mode='extra';t.enterStudy();
    return JSON.stringify({recs:s.recs,log:s.log,exam:s.cfg.exam,start:s.cfg.start,clozes:s.cfg.clozes,stats:{pos:t.ui.xs.pos,ans:t.ui.xs.ans,ok:t.ui.xs.ok}});
   },{id,flag,known});
  }
  async function learningUnchanged(before){
   const after=await page.evaluate(()=>{const t=window.__BGB_TEST__,s=t.state;return JSON.stringify({recs:s.recs,log:s.log,exam:s.cfg.exam,start:s.cfg.start,clozes:s.cfg.clozes,stats:{pos:t.ui.xs.pos,ans:t.ui.xs.ans,ok:t.ui.xs.ok}});});
   assert.equal(after,before,'Reading and hiding answers must not grade, move session, alter records or dates');
  }
  const before=await one(ids.fill);
  assert.equal(await page.locator('[data-learn-test]').count(),1);
  assert.equal(await page.locator('input.fill').count(),0);
  await page.locator('[data-learn-test]').tap();await learningUnchanged(before);
  const fills=await page.locator('input.fill').count();assert.ok(fills>=3);
  assert.ok(await page.evaluate(()=>document.activeElement?.matches('input.fill')));
  assert.equal(await page.locator('[data-memory-aid]').count(),0,'Blind recall must hide memory answers');
  await page.locator('[data-giveup]').tap();assert.equal(await page.locator('[data-edit-cloze]').count(),1);
  assert.equal(await page.locator('[data-memory-aid]').count(),1);await learningUnchanged(before);
  await page.locator('[data-edit-cloze]').tap();await page.locator('[data-cloze-cancel]').tap();
  assert.equal(await page.evaluate(()=>window.__BGB_TEST__.ui.card.checked),true);
  await page.locator('[data-memory-edit]').tap();
  const own='我的记忆句 <img src=x onerror=alert(1)>：一条接一条';
  await page.locator('#memory-text').fill(own);await page.locator('[data-memory-save]').tap();
  assert.equal(await page.locator('.memory-aid img').count(),0);await learningUnchanged(before);
  assert.equal(await page.evaluate(id=>window.__BGB_TEST__.state.cfg.mnemonics[id].text,ids.fill),own);
  await page.evaluate(()=>window.__BGB_TEST__.saveLocal());await page.reload();await page.waitForFunction(()=>window.__BGB_TEST__);
  assert.equal(await page.evaluate(id=>window.__BGB_TEST__.state.cfg.mnemonics[id].text,ids.fill),own);
  // Config-level timestamps do not discard newer per-question memory edits/reset tombstones.
  await page.evaluate(id=>{
   const t=window.__BGB_TEST__,s=t.state,m=s.cfg.mnemonics[id],at=m.at;
   s.cfg.u=at+100;t.mergeState({cfg:{u:at-100,mnemonics:{[id]:{text:'older',at:at-1},other:{text:'incoming',at:at+1}}}});
   if(s.cfg.mnemonics[id].text!==m.text||s.cfg.mnemonics.other.text!=='incoming')throw Error('Mnemonic merge lost data');
   t.mergeState({cfg:{u:at+200,mnemonics:{[id]:{text:'',at:at+2}}}});
   if(s.cfg.mnemonics[id].text!=='')throw Error('Reset tombstone lost');
  },ids.fill);
  const typeResults={};
  for(const type of ['multi','choice','wrong','right','order']){
   const snapshot=await one(ids[type]);assert.equal(await page.locator('[data-learn-test]').count(),1);
   if(type==='multi'||type==='choice'){
    const expected=await page.evaluate(id=>window.__BGB_TEST__.QMAP.get(id).o.length,ids[type]);
    assert.equal(await page.locator('.learn-option').count(),expected);
    const rights=await page.evaluate(id=>{const q=window.__BGB_TEST__.QMAP.get(id);return q.k==='m'?q.a.length:1;},ids[type]);
    assert.equal(await page.locator('.learn-option.right').count(),rights);
   }
   if(type==='wrong')assert.match(await page.locator('article .verdict').textContent(),/错误/);
   await page.locator('[data-learn-test]').tap();await learningUnchanged(snapshot);
   typeResults[type]=await page.evaluate(id=>window.__BGB_TEST__.QMAP.get(id).k,ids[type]);
   if(type==='multi'||type==='choice')assert.ok(await page.locator('[data-opt]').count());
   if(type==='wrong'||type==='right')assert.equal(await page.locator('[data-judge]').count(),2);
   if(type==='order')assert.ok(await page.locator('[data-order-add]').count());
  }
  // Known questions and in-session retries must start with retrieval, not re-reading.
  await one(ids.fill,0,true);assert.equal(await page.locator('[data-learn-test]').count(),0);
  await one(ids.fill,1);assert.equal(await page.locator('[data-learn-test]').count(),0);
  await page.evaluate(()=>window.__BGB_TEST__.state.cfg.learnFirst=0);
  await one(ids.fill);assert.equal(await page.locator('[data-learn-test]').count(),0);
  await page.locator('[data-learn-open]').tap();assert.equal(await page.locator('[data-learn-test]').count(),1);
  // Crafted examples cover every item and keep independent parallel groups apart.
  const coverage=await page.evaluate(()=>{
   const t=window.__BGB_TEST__;let count=0,crafted=0;
   for(const q of t.questions){
    const a=t.memoryAid(q);if(!a)continue;count++;
    for(const g of a.groups){
     if(!g.items.length||!g.sentences.length)throw Error('Empty memory group '+q.i);
     if(g.cues&&g.cues.length!==g.items.length)throw Error('Missing cue '+q.i);
     if(g.basis==='correct-options'&&JSON.stringify(g.items)!==JSON.stringify([...q.a].sort((a,b)=>a-b).map(i=>q.o[i])))throw Error('Distractor leaked '+q.i);
     if(q.k==='j'&&q.a===0)throw Error('False assertion included '+q.i);
     if(g.crafted)crafted++;
    }
   }
   const five=t.memoryAid(t.QMAP.get('p-0039')).groups[0],signs=t.memoryAid(t.QMAP.get('p-0066')).groups;
   if(five.items.length!==5||five.sentences[0]!=='听完就画，算清再对，最后定措施。')throw Error('Five-word mapping broken');
   if(signs.length!==2||signs[0].items.length!==4||signs[1].items.length!==5)throw Error('Independent lists combined');
   const time=t.memoryAid(t.QMAP.get('U-W-F0036')).groups[0],system=t.memoryAid(t.QMAP.get('d-0543')).groups[0];
   if(time.items.length!==4||time.items[3]!=='本段和折返段所在站停留时间')throw Error('Compound time modifier split');
   if(system.items.length!==2||system.items[1]!=='党和国家监督体系')throw Error('Compound supervision term split');
   return {count,craftedGroups:crafted};
  });
  await page.evaluate(()=>window.__BGB_TEST__.state.cfg.learnFirst=1);
  await one('p-0039');assert.equal(await page.locator('[data-learn-test]').count(),1);await page.screenshot({path:path.join(__dirname,'learning-memory-r18.png'),fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Mobile page overflows');
  await page.locator('[data-end]').first().tap();await page.locator('[data-tab="settings"]').tap();
  await page.locator('#s-learning').selectOption('0');await page.evaluate(()=>window.__BGB_TEST__.saveLocal());
  await page.reload();await page.waitForFunction(()=>window.__BGB_TEST__);assert.equal(await page.evaluate(()=>window.__BGB_TEST__.state.cfg.learnFirst),0);
  await page.evaluate(()=>{const t=window.__BGB_TEST__;t.ui.studying=false;t.ui.tab='bank';t.ui.sBank='all';t.ui.search='p-0039';t.ui.openId='p-0039';t.render();});
  assert.equal(await page.locator('[data-memory-aid]').count(),1);assert.equal(await page.locator('[data-memory-edit]').count(),0);
  await page.locator('.memory-map summary').tap();assert.equal(await page.locator('.memory-map[open]').count(),1);
  assert.deepEqual(errors,[]);
  const result={unseenLearning:true,readingNeverGrades:true,allBlanks:fills,originalTypes:typeResults,knownAndRetriesRecall:true,customMemoryPersistenceAndMerge:true,coverage,mobileNoOverflow:true,pageErrors:errors};
  fs.writeFileSync(path.join(__dirname,'learning-memory-verification-r18.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
