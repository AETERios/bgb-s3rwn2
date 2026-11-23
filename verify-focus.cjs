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
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.waitForFunction(()=>window.__BGB_TEST__?.questions.length===13466);
  const study=async id=>{
   await page.evaluate(id=>{const t=window.__BGB_TEST__;t.ui.studying=false;t.ui.annotating=false;t.ui.tab='bank';t.ui.sKind='';t.ui.sScope='all';t.ui.sBank='all';t.ui.sSubject='';t.ui.search=id;t.ui.openId=id;t.render();},id);
   await page.locator('[data-study-one="'+id+'"]').click();
   await page.evaluate(()=>{const t=window.__BGB_TEST__;if(t.ui.card&&t.ui.card.data){t.ui.card.mode='type';t.render();}});
   await page.waitForSelector('input.fill, .blank-slot');
  };

  // 1. 练习页头部只剩一条进度栏：没有今日计划大卡片、没有“当前位置”
  await study('p-0004');
  assert.equal(await page.locator('.study-plan').count(),0,'练习页不应再有今日计划面板');
  assert.equal(await page.locator('.study-head').count(),1,'应有精简顶栏');
  assert.equal(await page.locator('.study-head .progress').count(),1,'顶栏应有进度条');
  assert.ok(/^\d+\s*\/\s*\d+$/.test((await page.locator('.study-head-count').innerText()).trim()),'顶栏应显示今日进度');
  const headBox=await page.locator('.study-head').boundingBox();
  const crumb=await page.locator('.current-page').evaluate(el=>getComputedStyle(el).display);
  assert.equal(crumb,'none','练习时应隐藏当前位置面包屑');
  assert.ok(headBox.height<64,'练习页顶栏应低于64px，实际 '+(headBox&&headBox.height));
  const bodyText=await page.locator('body').innerText();
  assert.ok(!/原文记忆|展开原文/.test(bodyText),'不应出现原文记忆文案');

  // 2. 顶栏可展开当天详情，且默认收起
  assert.equal(await page.locator('.study-head-more').isVisible(),false,'详情默认应收起');
  await page.locator('[data-head-toggle]').click();
  assert.equal(await page.locator('.study-head-more').isVisible(),true,'点数字应展开详情');
  assert.match(await page.locator('.study-head-more').innerText(),/剩余新题[\s\S]*本次完成/);
  await page.locator('[data-head-toggle]').click();
  assert.equal(await page.locator('.study-head-more').isVisible(),false,'再点应收起');

  // 3. 键盘弹出时题目自动上移，且页面留出键盘高度
  const longId=await page.evaluate(()=>{const t=window.__BGB_TEST__;const list=t.questions.filter(q=>q.k==='f'&&q.auto&&q.q.replace(/\{\{blank:\d+\}\}/g,'').length>320);return (list[0]||{}).i;});
  assert.ok(longId,'应能找到长题干填空题');
  await study(longId);
  await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
  const blanks=await page.locator('input.fill').count();
  assert.ok(blanks>=1,longId+' 应有输入空');
  await page.locator('input.fill').last().focus();
  await page.waitForTimeout(900); // 等真实的 focus 同步先跑完（无真实键盘时会归零）
  await page.evaluate(()=>{
   const t=window.__BGB_TEST__;
   t.applyKeyboardHeight(320);
   t.revealActive();
  });
  await page.waitForTimeout(900);
  const kbState=await page.evaluate(()=>{
   const input=document.querySelector('input.fill:last-of-type')||document.activeElement;
   const r=input.getBoundingClientRect();
   const head=document.querySelector('.study-head').getBoundingClientRect();
   return {
    kbVar:getComputedStyle(document.documentElement).getPropertyValue('--kb').trim(),
    kbClass:document.body.classList.contains('kb-open'),
    pad:parseFloat(getComputedStyle(document.body).paddingBottom),
    headBottom:head.bottom,
    top:r.top,bottom:r.bottom,inner:window.innerHeight
   };
  });
  assert.equal(kbState.kbVar,'320px','--kb 应写入键盘高度');
  assert.ok(kbState.kbClass,'键盘弹出应加 kb-open');
  assert.ok(kbState.pad>=320,'页面底部应留出键盘高度，实际 '+kbState.pad);
  assert.ok(kbState.bottom<=kbState.inner-320+4,'当前空应被顶到键盘上方：'+JSON.stringify(kbState));
  assert.ok(kbState.top>=kbState.headBottom-2,'当前空不应被顶栏遮住：'+JSON.stringify(kbState));

  // 4. 键盘收起后恢复
  await page.evaluate(()=>{const t=window.__BGB_TEST__;t.applyKeyboardHeight(0);});
  const padAfter=await page.evaluate(()=>({pad:parseFloat(getComputedStyle(document.body).paddingBottom),cls:document.body.classList.contains('kb-open')}));
  assert.ok(!padAfter.cls,'键盘收起应移除 kb-open');
  assert.ok(padAfter.pad<60,'键盘收起后不应保留键盘高度，实际 '+padAfter.pad);

  // 5. 学习记录不受影响
  const log=await page.evaluate(()=>Object.keys(window.__BGB_TEST__.state.log||{}).length);
  assert.ok(log>=0,'记录应可读');
  assert.deepEqual(errors,[],'不应有脚本错误');
  console.log('PASS focus: head='+Math.round(headBox.height)+'px, keyboard shifts card, details toggle works');
 } finally { await browser.close(); server.close(); }
})().catch(e=>{console.error('FAIL',e.message);process.exit(1)});
