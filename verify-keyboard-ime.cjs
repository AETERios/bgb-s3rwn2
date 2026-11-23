const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/eilot/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=__dirname;
const server=http.createServer((req,res)=>{
 const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html',file=path.resolve(root,name);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end();}
 res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'text/javascript; charset=utf-8':'application/octet-stream');
 fs.createReadStream(file).pipe(res);
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch();
 try{
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/?v=exam-scope-20261121');
  await page.waitForFunction(()=>window.__BGB_TEST__?.questions.length===13200);
  const sample=await page.evaluate(()=>{
   const t=window.__BGB_TEST__,q=t.questions.find(q=>q.k==='f'&&!q.auto&&q.a.length>1&&t.practiceEligible(q.i));
   if(!q)throw Error('Need a real eligible multiple-blank question');
   t.startExtra('random');t.ui.xs=t.newSess([q.i],'keyboard-ime');t.ui.studying=true;t.render();
   const c=t.ui.card;c.mode='type';if(c.data.spans.length>1){c.shown=[0,1];c.vals=[];c.res={};c.checked=false;c.allOk=false;}t.render();
   return {id:q.i,answers:q.a};
  });
  const first=page.locator('#fill-0');await first.focus();await first.fill('中文选词草稿');
  const active=()=>page.evaluate(()=>document.activeElement?.id);
  const send=init=>page.evaluate(init=>document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,cancelable:true,key:'Enter',...init})),init);
  await send({isComposing:true});assert.equal(await active(),'fill-0','isComposing must not advance');
  await send({keyCode:229,which:229});assert.equal(await active(),'fill-0','IME keyCode 229 must not advance');
  await page.evaluate(()=>document.activeElement.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:'中'})));
  await send({});assert.equal(await active(),'fill-0','compositionstart must guard Enter even if keyboard flag is missing');
  const duringCommit=await page.evaluate(()=>{
   const el=document.activeElement;el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'中文'}));
   el.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,cancelable:true,key:'Enter'}));
   return {active:document.activeElement?.id,checked:window.__BGB_TEST__.ui.card.checked,value:el.value};
  });
  assert.equal(duringCommit.active,'fill-0','the commit Enter must not advance');assert.equal(duringCommit.checked,false);assert.equal(duringCommit.value,'中文选词草稿');
  await page.waitForTimeout(115);
  await send({repeat:true});assert.equal(await active(),'fill-0','a held Enter must not skip blanks');
  await first.press('Enter');assert.equal(await active(),'fill-1','a fresh Enter after IME commit must advance normally');
  assert.equal(await page.locator('.scope-evidence').count(),0,'guarded Enter must not reveal answers or evidence');
 const want=await page.evaluate(()=>{const c=window.__BGB_TEST__.ui.card;return c.shown.map(i=>c.data.spans[i].a);});
 for(let i=0;i<want.length;i++)await page.locator('#fill-'+i).fill(want[i]);
 await page.locator('#fill-'+(want.length-1)).press('Enter');
  assert.ok(await page.evaluate(()=>window.__BGB_TEST__.ui.card.checked&&window.__BGB_TEST__.ui.card.allOk),'last blank Enter must still check the real answer');
  await page.evaluate(()=>{const el=document.createElement('textarea');el.id='ime-textarea-probe';document.getElementById('app').append(el);});
  const textarea=page.locator('#ime-textarea-probe');await textarea.fill('问答笔记');await textarea.press('End');await textarea.press('Space');await textarea.press('Enter');
  assert.equal(await textarea.inputValue(),'问答笔记 \n','textarea spaces and newlines must remain normal');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,question:sample.id,checks:['isComposing','keyCode229','compositionstart/end','100ms commit guard','repeat guard','draft retained','normal Enter advance/check','textarea space and newline','no premature evidence']}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
