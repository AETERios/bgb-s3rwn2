const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const root=path.resolve(__dirname,'../..');
const server=http.createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 const file=path.resolve(root,pathname==='/'?'index.html':'.'+pathname);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return;}
 let body=fs.readFileSync(file);
 if(file.endsWith('index.html'))body=body.toString().replace('scopeFor:questionScope,poolIds,','studyQuestion,questionContext,pickShown,grade,answer,today,blankCard,dayNum,scopeFor:questionScope,poolIds,');
 res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.png')?'image/png':file.endsWith('.webmanifest')?'application/manifest+json':'text/html;charset=utf-8');
 res.end(body);
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  const context=await browser.newContext({serviceWorkers:'block',hasTouch:true,isMobile:true,viewport:{width:390,height:844},timezoneId:'Asia/Shanghai'});
  await context.addInitScript(()=>{
   const RealDate=Date;window.__testClock=RealDate.parse('2026-11-24T10:00:00+08:00');
   window.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[window.__testClock]));}static now(){return window.__testClock;}};
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const origin='http://127.0.0.1:'+server.address().port;
  await page.goto(origin);await page.waitForFunction(()=>window.__BGB_TEST__);
  const planning=await page.evaluate(()=>{
   const t=window.__BGB_TEST__,s=t.state,day=t.today();
   if(s.cfg.bank!=='all'||t.poolIds().length<13300)throw Error('All-bank default missing');
   Object.assign(s.cfg,{start:'2026-11-08',exam:'2027-01-27',rev:4,cap:6,reviewCap:4,scope:'all',bank:'key',unlimitedV5:1});
   s.recs={};s.log={[day]:[2,1,3,0]};s.sess=null;
   const ids=t.poolIds();ids.slice(0,64).forEach((id,i)=>s.recs[id]=[day-i,4,3,0,2,111+i]);
   const preserved=JSON.stringify(s.recs);t.prepareScope();const p=t.plan();t.startDay();
   const queue=s.sess.queue.slice();
   if(s.cfg.cap!==6||p.newLeft!==p.unseen||p.reviewLeft!==64||queue.length!==p.unseen+64)throw Error('Unexpected daily limit');
   const expected=Math.ceil((p.unseen+p.introduced)/(p.lastNew-p.t+1));if(p.perDay!==expected)throw Error('Deadline suggestion incorrect');
   if(queue.filter(e=>s.recs[e.split('|')[0]]).length!==64)throw Error('All due reviews must be retained');
   if(JSON.stringify(s.recs)!==preserved)throw Error('Planning changed records');
   // Old unlimited sessions keep their answered prefix and pending retries.
   const prefix=queue.slice(0,2),retry=ids[0]+'|1';
   s.sess={...s.sess,queue:[...prefix,retry,...ids.slice(10,5010).map(id=>id+'|0')],pos:2,planVersion:1};
   t.startDay();
   if(JSON.stringify(s.sess.queue.slice(0,2))!==JSON.stringify(prefix)||!s.sess.queue.includes(retry)||s.sess.queue.length<5000)throw Error('Unlimited queue restoration failed');
   t.saveLocal();return {newLeft:p.newLeft,reviewLeft:p.reviewLeft,oldQueueAfter:s.sess.queue.length,preserved:JSON.parse(preserved)};
  });
  await page.reload();await page.waitForFunction(()=>window.__BGB_TEST__);
  assert.deepEqual(await page.evaluate(()=>window.__BGB_TEST__.state.recs),planning.preserved);
  assert.equal(await page.evaluate(()=>window.__BGB_TEST__.state.cfg.cap),6);
  const intervals=await page.evaluate(()=>{
   const t=window.__BGB_TEST__,s=t.state,id=t.poolIds().find(i=>!s.recs[i]);s.log={};
   const out=[];
   for(let n=0;n<6;n++){t.grade(id,2);const r=s.recs[id];out.push(r[1]);if(r[0]!==t.today()+r[1])throw Error('Wrong due date');window.__testClock+=r[1]*86400000;}
   t.grade(id,1);if(s.recs[id][1]!==15)throw Error('Hard answer must shorten interval');
   t.grade(id,0);if(s.recs[id][0]!==t.today()+1||s.recs[id][1]!==0)throw Error('Forgotten answer must return tomorrow');
   return out;
  });
  assert.deepEqual(intervals,[1,2,4,7,15,30]);
  const crossDay=await page.evaluate(()=>{
   const t=window.__BGB_TEST__,s=t.state;window.__testClock=Date.parse('2026-11-24T10:00:00+08:00');
   s.recs={};s.log={};s.sess=null;const id=t.poolIds()[0];t.grade(id,2);
   if(t.plan().due.includes(id))throw Error('Premature review');
   window.__testClock+=86400000;if(!t.plan().due.includes(id))throw Error('Missing next-day review');
   t.startDay();if(!s.sess.queue.some(e=>e===id+'|0'))throw Error('Next-day queue missing review');
   s.log[t.today()]=[6,4,10,0];s.sess=null;t.ui.studying=false;t.render();
   return {dueIncluded:true,plannedNew:t.plan().newLeft,plannedReview:t.plan().reviewLeft};
  });
  assert.ok(crossDay.plannedNew>10000);assert.equal(crossDay.plannedReview,1);
  const startBox=await page.locator('[data-start="today"]').boundingBox();assert.ok(startBox&&startBox.y+startBox.height<844,'Start button must be above fold');
  await page.locator('[data-start="today"]').click();
  assert.ok(await page.evaluate(()=>window.__BGB_TEST__.state.sess.queue.length)>10000,'Daily target must not stop learning');
  // Every marked span is an input, even with a legacy fun preference.
  const id=await page.evaluate(()=>{
   const t=window.__BGB_TEST__;t.state.cfg.fun=1;
   return t.questions.find(q=>t.practiceEligible(q.i)&&q.k==='f'&&t.clozeData(q).spans.length>=4).i;
  });
  async function setup(){
   await page.evaluate(id=>{const t=window.__BGB_TEST__;t.ui.xs=t.newSess([id,id],'one');t.ui.mode='extra';t.enterStudy();},id);
  }
  await setup();
  const expected=await page.evaluate(()=>window.__BGB_TEST__.ui.card.data.spans.length);
  assert.equal(await page.locator('input.fill').count(),expected);
  assert.equal(await page.locator('[data-reshow],[data-fun-mode],[data-word],[data-tile],[data-pair-word]').count(),0);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'fill-0');
  assert.deepEqual(await page.evaluate(()=>window.__BGB_TEST__.pickShown(8)),[0,1,2,3,4,5,6,7]);
  const answers=await page.evaluate(()=>window.__BGB_TEST__.ui.card.data.spans.map(sp=>sp.a));
  for(let k=0;k<answers.length;k++)await page.locator('[data-fi="'+k+'"]').fill(answers[k]);
  await page.locator('[data-check]').click();assert.equal(await page.evaluate(()=>window.__BGB_TEST__.ui.card.allOk),true);
  await page.locator('[data-next="2"]').tap();
  assert.equal(await page.evaluate(()=>document.activeElement.id),'fill-0','Next fill must focus first input');
  const random=await page.evaluate(()=>{
   const t=window.__BGB_TEST__;t.state.sess=null;t.startDay();
   const a=t.state.sess.queue.slice();t.startDay();const stable=JSON.stringify(a)===JSON.stringify(t.state.sess.queue);
   const ids=a.filter(e=>e.endsWith('|0')&&!t.state.recs[e.split('|')[0]]).map(e=>e.split('|')[0]);
   const source=t.poolIds().filter(id=>!t.state.recs[id]);
   return {stable,random:ids.slice(0,30).join()!==source.slice(0,30).join(),n:ids.length};
  });
  assert.ok(random.stable&&random.random&&random.n>10000,'Randomize new questions and preserve resume order');
  assert.equal(await page.evaluate(()=>{const t=window.__BGB_TEST__;return t.questions.every(q=>t.asAnswerable(q).k===q.k);}),true,'Keep original question kinds');
  const contexts=await page.evaluate(()=>{
   const t=window.__BGB_TEST__,fills=t.questions.filter(q=>q.d&&q.k==='f');
   return {n:fills.length,all:fills.every(q=>t.studyQuestion(q)._ask===t.questionContext(q)&&!!t.questionContext(q)),native:t.questions.filter(q=>!q.d).every(q=>!t.questionContext(q))};
  });
  assert.equal(contexts.n,241);assert.ok(contexts.all&&contexts.native);
  await page.evaluate(()=>{const t=window.__BGB_TEST__;t.ui.mode='extra';t.ui.xs=t.newSess(['sg-0321-d1'],'one');t.enterStudy();});
  assert.equal(await page.locator('.qa-ask').innerText(),'请写出客运列车运行途中开门的定义');
  assert.equal(await page.locator('input.fill').count(),3);
  await page.locator('[data-edit-cloze]').tap();
  assert.equal(await page.locator('.qa-ask').innerText(),'请写出客运列车运行途中开门的定义');
  await page.screenshot({path:path.join(__dirname,'sg-0321-context-r15.png'),fullPage:true});
  await page.locator('[data-cloze-cancel]').tap();
  // The revealed-answer page and the correct-answer page both allow editing.
  await page.evaluate(()=>{const t=window.__BGB_TEST__;t.ui.mode='extra';t.ui.xs=t.newSess(['d-0916'],'one');t.enterStudy();});
  const beforeEdit=await page.evaluate(()=>{const t=window.__BGB_TEST__;return JSON.stringify({recs:t.state.recs,log:t.state.log,queue:t.ui.xs.queue,pos:t.ui.xs.pos,exam:t.state.cfg.exam,start:t.state.cfg.start,q:t.QMAP.get('d-0916')});});
  await page.locator('[data-giveup]').tap();
  assert.equal(await page.locator('[data-edit-cloze]').count(),1);
  await page.locator('[data-edit-cloze]').tap();await page.locator('[data-cloze-cancel]').tap();
  assert.equal(await page.evaluate(()=>window.__BGB_TEST__.ui.card.checked),true,'Cancel must preserve revealed answers');
  await page.locator('[data-edit-cloze]').tap();await page.locator('[data-cloze-clear]').tap();
  const chosen=await page.evaluate(()=>{const text=window.__BGB_TEST__.ui.card.edit.text,term='铁路局集团公司',start=text.indexOf(term);if(start<0)throw Error('Screenshot question missing');return {start,end:start+term.length-1};});
  await page.locator('[data-ci="'+chosen.start+'"]').tap();await page.locator('[data-ci="'+chosen.end+'"]').tap();
  await page.locator('[data-cloze-save]').tap();
  assert.equal(await page.locator('input.fill').count(),1);
  assert.deepEqual(await page.evaluate(()=>window.__BGB_TEST__.ui.card.data.spans.map(sp=>sp.a)),['铁路局集团公司']);
  assert.equal(await page.evaluate(()=>{const t=window.__BGB_TEST__;return JSON.stringify({recs:t.state.recs,log:t.state.log,queue:t.ui.xs.queue,pos:t.ui.xs.pos,exam:t.state.cfg.exam,start:t.state.cfg.start,q:t.QMAP.get('d-0916')});}),beforeEdit);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('jidiao-bgb-app-v1')).cfg.clozes['d-0916'].v),2);
  await page.locator('input.fill').fill('铁路局集团公司');await page.locator('[data-check]').tap();
  await page.locator('[data-edit-cloze]').tap();await page.locator('[data-cloze-cancel]').tap();
  assert.equal(await page.evaluate(()=>window.__BGB_TEST__.ui.card.allOk),true,'Cancel must preserve correct result');
  const coverage=await page.evaluate(()=>{
   const t=window.__BGB_TEST__,data=JSON.parse(document.getElementById('semantic-cloze-data').textContent);
   const qa=t.questions.filter(q=>q._r&&q._ask&&data[q.i]);
   const intact=t.questions.filter(q=>!q.auto&&!(q._r&&q._ask)).every(q=>!data[q.i]);
   return {count:Object.keys(data).length,qa:qa.length,intact,complete:qa.every(q=>t.clozeData(q).spans.length>1)};
  });
  assert.deepEqual(coverage,{count:3049,qa:175,intact:true,complete:true});
  const mixed=await page.evaluate(()=>{
   const t=window.__BGB_TEST__,s=t.state;s.sess=null;t.startDay();
   const banks=s.sess.queue.slice(0,300).map(e=>t.QMAP.get(e.split('|')[0]).b);
   s.cfg.exam="2026-11-27";s.cfg.rev=4;const before=t.plan(),id=s.sess.queue.find(e=>!s.recs[e.split('|')[0]]).split('|')[0];
   t.grade(id,2);const after=t.plan();t.ui.studying=false;t.render();
   return {banks:new Set(banks).size,adjacent:banks.some((b,i)=>i&&b===banks[i-1]),remaining:before.unseen-after.unseen,introduced:after.introduced-before.introduced,leftDrop:before.suggestedLeft-after.suggestedLeft,total:t.questions.length};
  });
  assert.ok(mixed.banks>=4&&!mixed.adjacent);assert.equal(mixed.remaining,1);assert.equal(mixed.introduced,1);assert.equal(mixed.leftDrop,1);assert.equal(mixed.total,13391);
  await page.evaluate(()=>{const t=window.__BGB_TEST__;t.ui.mode='extra';t.ui.xs=t.newSess(['U-B-R0007'],'one');t.enterStudy();});
  assert.ok(await page.locator('input.fill').count()>5,'Back regulations must use complete multiple knowledge points');
  assert.ok(await page.locator('.qa-ask').innerText());
  const spans=await page.evaluate(()=>window.__BGB_TEST__.ui.card.data.spans.map(s=>s.a));
  assert.ok(spans.includes('运行揭示调度命令')&&spans.includes('施工负责人'));
  await page.screenshot({path:path.join(__dirname,'back-regulations-r16.png'),fullPage:true});
  const early=await page.evaluate(()=>{
   const t=window.__BGB_TEST__,s=t.state;s.cfg.exam='2026-11-27';s.cfg.rev=4;s.sess=null;
   const id=t.poolIds()[0],record=[t.today()+9,15,6,1,2,1234];s.recs[id]=record.slice();t.startDay();
   const pos=s.sess.queue.indexOf(id+'|2');if(pos<0)throw Error('Missing pre-exam rehearsal');
   s.sess.pos=pos;t.enterStudy();t.answer(2,true);if(JSON.stringify(s.recs[id])!==JSON.stringify(record))throw Error('Early success changed a future due date');
   s.sess.queue.push(id+'|2');s.sess.pos=s.sess.queue.length-1;t.enterStudy();t.answer(0,false);
   if(s.recs[id][0]!==t.today()+1||s.recs[id][3]!==record[3]+1)throw Error('Forgotten rehearsal must return tomorrow');
   return true;
  });
  assert.equal(early,true);
  // Ten answers lead to a short station and keep the next question intact.
  const station=await page.evaluate(()=>{
   const t=window.__BGB_TEST__;t.ui.mode='extra';t.ui.xs=t.newSess(t.poolIds().slice(0,15),'random');t.enterStudy();
   for(let n=0;n<10;n++)t.answer(2,true);
   return {entry:t.ui.xs.queue[t.ui.xs.pos],ans:t.ui.xs.ans};
  });
  assert.match(station.entry,/^@station\|10\|/);assert.equal(station.ans,10);
  await page.evaluate(()=>{const t=window.__BGB_TEST__;t.ui.studying=false;t.ui.tab='today';t.render();});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Mobile overflow');
  const deadline=await page.evaluate(()=>{const t=window.__BGB_TEST__,s=t.state;s.cfg.exam='2026-11-27';s.cfg.rev=4;const before=JSON.stringify(s.recs);const p=t.plan();t.render();if(p.suggestedLeft!==p.unseen||!p.sprint)throw Error('Missed new-learning deadline must show catch-up');if(JSON.stringify(s.recs)!==before)throw Error('Planning changed due dates');return p.perDay;});
  assert.ok(deadline>10000);assert.equal(await page.locator('.home-details[open]').count(),0);
  const homeStart=await page.locator('[data-start="today"]').boundingBox();assert.ok(homeStart.y+homeStart.height<844);
  await page.locator('#s-bank-plan').selectOption('all');
  assert.equal(await page.evaluate(()=>window.__BGB_TEST__.state.cfg.bank),'all');
  assert.ok(await page.evaluate(()=>window.__BGB_TEST__.plan().pool.some(id=>window.__BGB_TEST__.QMAP.get(id).g==='misc')));
  await page.screenshot({path:path.join(__dirname,'simple-home-r14.png'),fullPage:true});
  await setup();await page.screenshot({path:path.join(__dirname,'all-blanks-r14.png'),fullPage:true});
  const partition=await page.evaluate(()=>{
   const t=window.__BGB_TEST__,s=t.state,day=t.today(),ops=t.questions.filter(q=>q.b==='S'&&q.t.startsWith('运用资料·')),supp=t.questions.filter(q=>q.b==='S'&&q.t.startsWith('公开补充·'));
   const all=t.poolIds('all'),key=t.poolIds('key'),separate=t.poolIds('operations');
   if(ops.length!==809||supp.length!==202||separate.length!==809)throw Error('Operations source boundary mismatch');
   if(!ops.every(q=>separate.includes(q.i)&&all.includes(q.i)&&!key.includes(q.i)))throw Error('Operations source not separated');
   if(!supp.every(q=>key.includes(q.i)&&!separate.includes(q.i)))throw Error('Public supplements incorrectly extracted');
   s.recs[ops[0].i]=[day+7,7,3,1,2,98765];s.sess=null;
   t.ui.studying=false;t.ui.tab='today';t.render();
   return {id:ops[0].i,records:JSON.stringify(s.recs),log:JSON.stringify(s.log),dates:[s.cfg.start,s.cfg.exam],count:ops.length};
  });
  await page.locator('#s-bank-plan').selectOption('operations');
  await page.evaluate(()=>window.__BGB_TEST__.saveLocal());await page.reload();await page.waitForFunction(()=>window.__BGB_TEST__);
  assert.equal(await page.locator('#s-bank-plan').inputValue(),'operations');
  const splitState=await page.evaluate(()=>{const t=window.__BGB_TEST__;return {records:JSON.stringify(t.state.recs),log:JSON.stringify(t.state.log),dates:[t.state.cfg.start,t.state.cfg.exam],unseen:t.plan().unseen};});
  assert.equal(splitState.records,partition.records);assert.equal(splitState.log,partition.log);assert.deepEqual(splitState.dates,partition.dates);
  assert.equal(await page.evaluate(()=>{const t=window.__BGB_TEST__;t.startDay();return t.state.sess.queue.every(e=>t.QMAP.get(e.split('|')[0]).t.startsWith('运用资料·'));}),true);
  await page.evaluate(()=>{const t=window.__BGB_TEST__;t.ui.studying=false;t.ui.tab='bank';t.render();});
  await page.locator('#q-category').selectOption('operations');
  assert.equal(await page.locator('#q-category').inputValue(),'operations');
  await page.evaluate(()=>{const t=window.__BGB_TEST__;t.ui.studying=false;t.ui.tab='today';t.render();});
  await page.locator('#s-bank-plan').selectOption('key');
  assert.equal(await page.evaluate(()=>{const t=window.__BGB_TEST__;return t.poolIds().some(id=>t.QMAP.get(id).b==='S'&&t.QMAP.get(id).t.startsWith('运用资料·'));}),false);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({unlimitedQueueAnd64Due:'pass',deadlineTargets:'pass',homeStartAboveFold:'pass',unlimitedSessionUpgrade:'pass',recordsAndCapAfterReload:'pass',intervals,crossDayReview:'pass',continuePastSuggestedTarget:'pass',allBlanksAndTyping:'pass',randomAndStableResume:'pass',originalQuestionKinds:'pass',firstInputFocus:'pass',resultPageClozeEditor:'pass',operationsPartitionAndRecords:'pass',mixedSourcesAndLiveCounters:'pass',backRegulationsMultiBlank:'pass',all241DerivedContexts:'pass',sg0321StudyAndEditor:'pass',tenQuestionStation:'pass',preExamRehearsalKeepsFutureDue:'pass',mobileLayout:'pass',pageErrors:0}));
  await context.close();
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e.stack);server.close();process.exitCode=1;});
