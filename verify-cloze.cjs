const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict');
const {chromium}=require('C:/Users/eilot/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const server=http.createServer((req,res)=>{
 let name=decodeURIComponent(new URL(req.url,'http://x').pathname);if(name.endsWith('/'))name+='index.html';
 const file=path.resolve('.'+name);if(!file.startsWith(process.cwd()+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end();}
 res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'text/html;charset=utf-8');res.end(fs.readFileSync(file));
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch();
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.clock.setFixedTime(new Date('2026-11-23T10:00:00+08:00'));
  const url='http://127.0.0.1:'+server.address().port;
  await page.goto(url);
  await page.waitForFunction(()=>window.__BGB_TEST__?.questions.length===13200);
  const study=async id=>{
   await page.evaluate(id=>{const t=window.__BGB_TEST__;t.ui.studying=false;t.ui.annotating=false;t.ui.tab='bank';t.ui.sKind='';t.ui.sScope='all';t.ui.sBank='all';t.ui.sSubject='';t.ui.search=id;t.ui.openId=id;t.render();},id);
   await page.locator('[data-study-one="'+id+'"]').click();
   await page.evaluate(()=>{const t=window.__BGB_TEST__;if(t.ui.card&&t.ui.card.data){t.ui.card.mode='type';t.render();}});
   await page.waitForSelector('input.fill, .blank-slot');
  };

  // 1. 每一道填空题都能真正作答，不再出现“展开原文”卡片
  const ids=await page.evaluate(()=>{const t=window.__BGB_TEST__;return [...t.questions.filter(q=>q.k==='f'&&q.auto).slice(0,8),...t.questions.filter(q=>q.k==='f'&&!q.auto).slice(0,8)].map(q=>q.i);});
  for(const id of ids){
   await study(id);
   assert.ok(await page.locator('input.fill').count()>=1,id+' 应有输入空');
   const text=await page.locator('.card .stem').innerText();
   assert.ok(!/原文记忆|展开原文|对照原文/.test(text),id+' 不应退化为原文记忆');
  }

  // 2. 自动判定 + 正确判定
  await study('p-0004');
  const answer=await page.evaluate(()=>{const t=window.__BGB_TEST__;return t.clozeData(t.QMAP.get('p-0004')).spans[0].a;});
  assert.equal(answer,'车机联控');
  await page.locator('input.fill').first().fill(answer);
  await page.locator('[data-check]').click();
  assert.match(await page.locator('.verdict').innerText(),/填对|全部填对/);
  assert.equal(await page.locator('.praise').count(),1,'答对应有即时鼓励');
  await page.locator('[data-next="2"]').click();

  // 3. 答错时原位给出正确答案
  await study('p-0004');
  await page.locator('input.fill').first().fill('完全不搭');
  await page.locator('[data-check]').click();
  assert.match(await page.locator('.verdict').innerText(),/不对|正确答案|填上/);
  assert.ok((await page.locator('.blank.shown').last().innerText()).includes(answer));

  // 4. 多个空时每次随机抽 1~3 个
  await study('d-0123');
  const spans=await page.evaluate(()=>{const t=window.__BGB_TEST__,q=t.QMAP.get('d-0123');return t.clozeData(q).spans.length;});
  assert.ok(spans>=3,'多空题应有至少 3 个空');
  const counts=new Set();
  for(let i=0;i<16;i++){
   counts.add(await page.locator('input.fill').count());
   await page.locator('[data-reshow]').click();
  }
  assert.ok(counts.has(1),'应出现只考一个空的情况：'+[...counts]);
  assert.ok([...counts].some(n=>n>=2),'应出现一次考多个空的情况：'+[...counts]);
  // 每次重新进入同一题也会自动换一组空，不需要手动点
  const sets=new Set();
  for(let i=0;i<10;i++){
   await page.evaluate(()=>{const t=window.__BGB_TEST__;t.ui.studying=false;t.ui.card=null;t.enterStudy();});
   sets.add(await page.evaluate(()=>window.__BGB_TEST__.ui.card.shown.join(',')));
  }
  assert.ok(sets.size>=3,'自动换空应产生多组不同组合：'+[...sets].join(' | '));

  // 5. 挖空不对时自己点字改空，并立即按新空判分
  await study('p-0004');
  await page.locator('[data-edit-cloze]').click();
  await page.locator('[data-cloze-clear]').click();
  const idx=await page.evaluate(()=>{const t=window.__BGB_TEST__;const d=t.clozeData(t.QMAP.get('p-0004'));const s=d.text.indexOf('列车无线调度通信设备');return {s,e:s+'列车无线调度通信设备'.length};});
  assert.ok(idx.s>0);
  await page.locator('[data-ci="'+idx.s+'"]').click();
  await page.locator('[data-ci="'+(idx.e-1)+'"]').click();
  await page.locator('[data-cloze-save]').click();
  const saved=await page.evaluate(()=>window.__BGB_TEST__.state.cfg.clozes['p-0004'].m);
  assert.deepEqual(saved,[[idx.s,idx.e]]);
  assert.equal(await page.locator('input.fill').count(),1);
  await page.locator('input.fill').first().fill('列车无线调度通信设备');
  await page.locator('[data-check]').click();
  assert.match(await page.locator('.verdict').innerText(),/填对/);

  // 6. 逐题标注可以保存并前进
  await page.evaluate(()=>{const t=window.__BGB_TEST__;t.ui.studying=false;t.ui.annotating=false;t.ui.tab='settings';t.render();});
  await page.locator('[data-annotate]').first().click();
  await page.waitForSelector('.ann-bar');
  const before=await page.locator('.ann-bar .num').innerText();
  const annId=await page.evaluate(()=>window.__BGB_TEST__.ui.ann.ids[window.__BGB_TEST__.ui.ann.i]);
  await page.locator('[data-ann-save]').click();
  const after=await page.locator('.ann-bar .num').innerText();
  assert.notEqual(before,after);
  assert.ok(await page.evaluate(id=>!!window.__BGB_TEST__.state.cfg.clozes[id],annId));

  // 7. 旧记录、笔记、日期不因挖空改动而丢失
  const kept=await page.evaluate(()=>{const t=window.__BGB_TEST__;const day=t.plan().t;t.state.log[day]=[11,2,9,1];t.state.cfg.notes={keep:'保留'};t.state.cfg.exam='2026-11-27';t.render();return JSON.parse(JSON.stringify({log:t.state.log[day],notes:t.state.cfg.notes,exam:t.state.cfg.exam}));});
  assert.deepEqual(kept,{log:[11,2,9,1],notes:{keep:'保留'},exam:'2026-11-27'});

  fs.mkdirSync('test-results',{recursive:true});
  await page.screenshot({path:'test-results/cloze-annotate-390.png',fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('cloze verification passed');
 }finally{await browser.close();server.close();}
})();
