const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const root=path.resolve(__dirname,'../..');
const server=http.createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 const file=path.resolve(root,pathname==='/'?'index.html':'.'+pathname);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return;}
 let body=fs.readFileSync(file);
 if(file.endsWith('index.html'))body=body.toString().replace('scopeFor:questionScope,poolIds,','answerPieces,grade,answer,today,setFunMode,funModes,blankCard,dayNum,scopeFor:questionScope,poolIds,');
 res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.png')?'image/png':file.endsWith('.webmanifest')?'application/manifest+json':'text/html;charset=utf-8');
 res.end(body);
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844},timezoneId:'Asia/Shanghai'});
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
   if(queue.slice(0,3).some(e=>!s.recs[e.split('|')[0]]))throw Error('Reviews must be first');
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
  // Play each form using actual rendered buttons, with distinct source answers.
  const id=await page.evaluate(()=>{
   const t=window.__BGB_TEST__,s=t.state;s.cfg.fun=1;
   const q=t.questions.find(q=>t.practiceEligible(q.i)&&q.k==='f'&&new Set(t.clozeData(q).spans.filter(sp=>sp.a.length>1).map(sp=>sp.a)).size>=3);
   t.ui.mode='extra';t.ui.xs=t.newSess([q.i],'one');t.enterStudy();return q.i;
  });
  async function setup(mode){
   await page.evaluate(({id,mode})=>{
    const t=window.__BGB_TEST__;t.ui.xs=t.newSess([id],'one');t.ui.mode='extra';t.enterStudy();
    const c=t.ui.card,seen=new Set();c.shown=c.data.spans.map((sp,i)=>({sp,i})).filter(({sp})=>sp.a.length>1&&!seen.has(sp.a)&&seen.add(sp.a)).slice(0,3).map(x=>x.i);
    t.setFunMode(c,mode);t.render();
   },{id,mode});
  }
  await setup('word');
  for(let k=0;k<3;k++){
   const bi=await page.evaluate(k=>{const t=window.__BGB_TEST__,c=t.ui.card;return t.wordBankFor(t.QMAP.get(c.forId),c).indexOf(c.data.spans[c.shown[k]].a);},k);
   await page.locator('[data-word="'+bi+'"]').click();
  }
  await page.locator('[data-check]').click();assert.equal(await page.evaluate(()=>window.__BGB_TEST__.ui.card.allOk),true);
  await setup('build');
  for(let k=0;k<3;k++){
   await page.locator('[data-build-target="'+k+'"]').click();
   const indices=await page.evaluate(k=>{
    const c=window.__BGB_TEST__.ui.card,used=new Set(c.picks.flat()),a=c.data.spans[c.shown[k]].a;
    const parts=window.__BGB_TEST__.answerPieces(a);
    return parts.map(part=>{const i=c.tiles.findIndex((v,i)=>!used.has(i)&&v===part);used.add(i);return i;});
   },k);
   for(const i of indices)await page.locator('[data-tile="'+i+'"]').click();
  }
  await page.locator('[data-check]').click();
  assert.equal(await page.evaluate(()=>window.__BGB_TEST__.ui.card.allOk),true,'Word pieces must pass via UI');
  await setup('build');await page.locator('[data-tile="0"]').click();
  await page.locator('[data-tile-remove="0:0"]').click();
  assert.equal(await page.evaluate(()=>window.__BGB_TEST__.ui.card.vals[0]),'');
  await setup('pair');
  for(let k=0;k<3;k++){
   await page.locator('[data-slot="'+k+'"]').click();
   const bi=await page.evaluate(k=>{const c=window.__BGB_TEST__.ui.card;return c.pairBank.indexOf(c.data.spans[c.shown[k]].a);},k);
   await page.locator('[data-pair-word="'+bi+'"]').click();
  }
  await page.locator('[data-check]').click();assert.equal(await page.evaluate(()=>window.__BGB_TEST__.ui.card.allOk),true);
  await setup('pair');
  await page.evaluate(()=>{const t=window.__BGB_TEST__,c=t.ui.card;c.vals=c.shown.map(i=>c.data.spans[i].a);c.vals.push(c.vals.shift());t.checkCloze(t.QMAP.get(c.forId),c);});
  assert.equal(await page.evaluate(()=>window.__BGB_TEST__.ui.card.allOk),false,'Wrong pairing accepted');
  await setup('type');
  const answers=await page.evaluate(()=>{const c=window.__BGB_TEST__.ui.card;return c.shown.map(i=>c.data.spans[i].a);});
  for(let k=0;k<answers.length;k++)await page.locator('[data-fi="'+k+'"]').fill(answers[k]);
  await page.locator('[data-check]').click();assert.equal(await page.evaluate(()=>window.__BGB_TEST__.ui.card.allOk),true);
  // Group changes rebuild tiles/pair banks and never retain stale answers.
  await setup('build');await page.locator('[data-reshow]').click();
  assert.equal(await page.evaluate(()=>{const c=window.__BGB_TEST__.ui.card;return c.tiles.join('').split('').sort().join('')===c.shown.map(i=>c.data.spans[i].a).join('').split('').sort().join('');}),true);
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
  await page.screenshot({path:path.join(__dirname,'simple-home-r13.png'),fullPage:true});
  await setup('build');await page.screenshot({path:path.join(__dirname,'fun-build-r13.png'),fullPage:true});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({unlimitedQueueAnd64Due:'pass',deadlineTargets:'pass',homeStartAboveFold:'pass',unlimitedSessionUpgrade:'pass',recordsAndCapAfterReload:'pass',intervals,crossDayReview:'pass',continuePastSuggestedTarget:'pass',wordBuildPairType:'pass',wrongPairRejected:'pass',groupReset:'pass',tenQuestionStation:'pass',preExamRehearsalKeepsFutureDue:'pass',mobileLayout:'pass',pageErrors:0}));
  await context.close();
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e.stack);server.close();process.exitCode=1;});
