/* Desktop dictation has its own storage. Never write the PWA's learning state. */
'use strict';
const STORE_KEY='shiguang-desktop-dictation-v1';
const $=id=>document.getElementById(id);
const escapeHTML=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let saved={};
try{saved=JSON.parse(localStorage.getItem(STORE_KEY)||'{}')||{};}catch{}
const state={...saved,entries:saved.entries||{},days:saved.days||{},focusMinutes:saved.focusMinutes||25,breakMinutes:saved.breakMinutes||5};
let collection,current,groupMap,sourceMap,referenceVisible=false,result=null,storageOK=true,writingTimer;
const localDay=(n=Date.now())=>{const d=new Date(n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
function today(){const key=localDay();return state.days[key]||(state.days[key]={ms:0,rounds:0,plan:[0,6].includes(new Date().getDay())?360:120});}
function persist(){try{localStorage.setItem(STORE_KEY,JSON.stringify(state));storageOK=true;return true;}catch{storageOK=false;$('save-status').textContent='保存失败，请复制草稿备份，检查浏览器存储空间';return false;}}
function flushDraft(){clearTimeout(writingTimer);if(!current||!current.passages.length)return;const previous=state.entries[current.id]||{};state.entries[current.id]={...previous,text:$('draft').value,updatedAt:Date.now()};if(persist())$('save-status').textContent='草稿已保存';}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function normalized(text,ignore=state.ignorePunctuation){return Array.from(text).filter(c=>!(/\s/u.test(c))&&!(ignore&&/\p{P}/u.test(c))).join('');}
// Character edit distance with compact backtracking, preserving all source characters.
function compareText(expected,typed,ignore=false){
  const a=Array.from(normalized(expected,ignore)),b=Array.from(normalized(typed,ignore));
  const cols=b.length+1,dirs=new Uint8Array((a.length+1)*cols);
  let prev=new Uint16Array(cols),row=new Uint16Array(cols);
  for(let j=1;j<cols;j++){prev[j]=j;dirs[j]=2;}
  for(let i=1;i<=a.length;i++){
    row[0]=i;dirs[i*cols]=1;
    for(let j=1;j<cols;j++){
      if(a[i-1]===b[j-1]){row[j]=prev[j-1];dirs[i*cols+j]=0;}
      else{const sub=prev[j-1]+1,del=prev[j]+1,ins=row[j-1]+1;const v=Math.min(sub,del,ins);row[j]=v;dirs[i*cols+j]=v===sub?3:v===del?1:2;}
    }
    [prev,row]=[row,prev];
  }
  const stats={wrong:0,missing:0,extra:0,correct:0},ops=[];let i=a.length,j=b.length;
  while(i||j){const direction=dirs[i*cols+j];if(i&&j&&direction===0){ops.push({type:'equal',expected:a[--i],typed:b[--j]});stats.correct++;}else if(i&&j&&direction===3){ops.push({type:'wrong',expected:a[--i],typed:b[--j]});stats.wrong++;}else if(i&&(direction===1||!j)){ops.push({type:'missing',expected:a[--i],typed:''});stats.missing++;}else{ops.push({type:'extra',expected:'',typed:b[--j]});stats.extra++;}}
  return {stats,ops:ops.reverse(),exact:!stats.wrong&&!stats.missing&&!stats.extra};
}
function expectedText(){return current.passages.map(p=>p.text).join('\n\n');}
function renderList(){
  const term=$('group-search').value.trim().toLowerCase(),book=$('book-filter').value;
  const groups=collection.groups.filter(g=>(!book||g.book===book)&&(!term||[g.title,...g.passages.map(p=>p.text),...g.originals.map(id=>sourceMap.get(id).raw)].join('\n').toLowerCase().includes(term)));
  $('library-count').textContent=`${groups.length} / ${collection.groups.length} 个知识组`;
  $('group-list').innerHTML=groups.length?groups.map(g=>{const e=state.entries[g.id],checked=e?.checked&&e.checked.draft===e.text;return `<button class="group-button" data-group="${g.id}" aria-current="${current?.id===g.id}">${escapeHTML(g.title)}<small>${g.passages.length?(checked?'已对照':e?.text?'有草稿':'可默写'):'仅原题 · 无合并原文'} · ${g.originals.length} 道原题</small></button>`;}).join(''):'<p class="muted">没有匹配的知识组。</p>';
}
function renderReference(){
  if(!current)return;
  $('reference-title').textContent=result?'逐字对照':'背诵原文';
  $('peek').textContent=referenceVisible?'遮住原文':'显示原文';
  $('comparison-summary').innerHTML='';
  if(!current.passages.length){$('reference-body').innerHTML='<p class="muted">本组只有选择题或错误判断，来源没有可直接用于背诵的完整正确原文。请展开下方原题学习。</p>';return;}
  if(result){
    const s=result.stats;
    $('comparison-summary').innerHTML=`<div class="comparison-stats${result.exact?' exact':''}">${result.exact?`逐字一致${state.ignorePunctuation?'（已忽略标点与空白）':'（已忽略空白）'}`:`错字 ${s.wrong} · 漏字 ${s.missing} · 多字 ${s.extra}`}<br>对照结果仅帮助纠错，不自动判定已经掌握。</div>`;
    $('reference-body').innerHTML='<div class="diff-legend">红色为应写的原文，蓝色为你写的不同内容。</div>'+result.ops.map(o=>o.type==='equal'?escapeHTML(o.expected):`<span class="diff-${o.type==='wrong'?'wrong':'missing'}">${escapeHTML(o.expected)}</span><span class="diff-extra">${escapeHTML(o.typed)}</span>`).join('');
  }else if(referenceVisible){$('reference-body').innerHTML=current.passages.map((p,i)=>`<p>${escapeHTML(p.text)}<span class="source-label">原文 ${i+1} · ${p.sources.map(escapeHTML).join('、')}</span></p>`).join('');}
  else $('reference-body').innerHTML='<div class="covered">原文已遮住。<br>先凭记忆写，再对照补齐。<br>需要时可以点击“显示原文”。</div>';
}
function openGroup(id,remember=true){
  if(!groupMap.has(id))return;flushDraft();
  if(remember&&current&&current.id!==id){state.history=(state.history||[]).concat(current.id).slice(-200);}
  current=groupMap.get(id);state.current=id;result=null;referenceVisible=state.mode==='copy';
  $('group-title').textContent=current.title;$('group-book').textContent=`${current.book} · 原文背诵`;
  $('group-detail').textContent=`${current.passages.length} 段背诵原文 · ${current.originals.length} 道原题${current.passages.length?' · '+normalized(expectedText(),false).length+' 字':''}`;
  $('draft').value=state.entries[id]?.text||'';$('draft').disabled=!current.passages.length;$('compare').disabled=!current.passages.length;$('peek').disabled=!current.passages.length;
  $('draft-count').textContent=Array.from($('draft').value.replace(/\s/g,'')).length+' 字';$('save-status').textContent=storageOK?'草稿自动保存':'浏览器存储不可用';
  $('originals-body').innerHTML=current.originals.map(sid=>{const s=sourceMap.get(sid);return `<article><strong>${escapeHTML(s.sourceId)} · ${escapeHTML({f:'填空',c:'单选',m:'多选',j:'判断',r:'问答'}[s.kind])}</strong><pre>${escapeHTML(s.raw)}</pre></article>`;}).join('');
  $('originals').open=!current.passages.length;$('editor-message').textContent=current.passages.length?'':'本组没有可默写的合并原文，可查阅右侧原题，或点击下一组。';
  $('previous').disabled=!(state.history||[]).length;
  renderReference();renderList();persist();
  history.replaceState(null,'','#'+id);
}
function nextGroup(){
  const ids=collection.groups.filter(g=>g.passages.length).map(g=>g.id);
  let deck=(state.deck||[]).filter(id=>ids.includes(id)&&id!==current?.id);
  if(!deck.length)deck=shuffle(ids.filter(id=>id!==current?.id));
  const id=deck.pop();state.deck=deck;if(id)openGroup(id);
}
function submit(){
  if(!current?.passages.length)return;
  if(!normalized($('draft').value,false)){$('editor-message').textContent='先写一点内容，再提交对照。';$('draft').focus();return;}
  flushDraft();result=compareText(expectedText(),$('draft').value,!!state.ignorePunctuation);
  state.entries[current.id].checked={draft:$('draft').value,stats:result.stats,ignorePunctuation:!!state.ignorePunctuation,at:Date.now()};persist();renderReference();renderList();$('editor-message').textContent=result.exact?'这一遍已对齐原文。可以休息片刻，再遮住重写一遍。':'右侧已标出差异，按原文补齐后可再次提交。';
}
// A deadline-based clock continues accurately in background tabs and stops at each round.
const clock=state.clock||(state.clock={mode:'focus',remaining:state.focusMinutes*60000,running:false,anchor:0});
function addFocusTime(start,end){
  while(start<end){const d=new Date(start),next=new Date(d.getFullYear(),d.getMonth(),d.getDate()+1).getTime(),stop=Math.min(end,next),key=localDay(start);const day=state.days[key]||(state.days[key]={ms:0,rounds:0,plan:[0,6].includes(d.getDay())?360:120});day.ms+=stop-start;start=stop;}
}
function updateClock(now=Date.now()){
  if(clock.running){const started=clock.anchor;const delta=Math.min(Math.max(0,now-clock.anchor),clock.remaining);if(clock.mode==='focus')addFocusTime(clock.anchor,clock.anchor+delta);clock.remaining-=delta;clock.anchor=now;
    if(clock.remaining<=0){const ended=clock.mode;clock.running=false;if(ended==='focus'){const key=localDay(Math.max(started,started+delta-1));state.days[key].rounds++;}clock.mode=ended==='focus'?'break':'focus';clock.remaining=(clock.mode==='focus'?state.focusMinutes:state.breakMinutes)*60000;state.clockMessage=ended==='focus'?'本轮专注完成。休息一下，准备好后开始休息计时。':'休息结束，准备好后开始下一轮。';persist();}
  }
}
function renderClock(){
  const seconds=Math.ceil(clock.remaining/1000),display=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
  $('clock-switch').textContent=clock.mode==='focus'?'切换休息':'切换专注';
  $('clock-time').textContent=display;$('clock-mode').textContent=clock.mode==='focus'?'专注':'休息';
  const full=(clock.mode==='focus'?state.focusMinutes:state.breakMinutes)*60000;
  $('clock-toggle').textContent=clock.running?'暂停':clock.remaining<full?'继续'+(clock.mode==='focus'?'专注':'休息'):'开始'+(clock.mode==='focus'?'专注':'休息');
  $('clock-message').textContent=clock.running?(clock.mode==='focus'?'计时中，写好眼前这一条。':'休息中，活动一下眼睛和肩膀。'):state.clockMessage||'把这一轮留给眼前这一条。';
  const day=today(),minutes=Math.floor(day.ms/60000),hours=Math.floor(minutes/60),text=hours?`${hours} 小时 ${minutes%60} 分钟`:`${minutes} 分钟`;
  $('today-time').textContent='今日专注 '+text;$('plan-summary').textContent=`/ 计划 ${day.plan} 分钟 · ${day.rounds} 轮`;$('day-progress').max=day.plan;$('day-progress').value=Math.min(day.plan,day.ms/60000);
  document.title=clock.running?`${display} · ${clock.mode==='focus'?'专注':'休息'} · 拾光`:'拾光 · 电脑默写室';
}
function pauseOrStart(){updateClock();clock.running=!clock.running;clock.anchor=Date.now();state.clockMessage=clock.running?'':'已暂停，暂停期间不计入学习时间。';persist();renderClock();}
function resetClock(){updateClock();clock.running=false;clock.remaining=(clock.mode==='focus'?state.focusMinutes:state.breakMinutes)*60000;clock.anchor=0;state.clockMessage='本轮已重置，已累计的专注时间保留。';persist();renderClock();}
function savePlan(){
  const values=['plan-minutes','focus-minutes','break-minutes'].map(id=>Number($(id).value));
  if(values.some((n,i)=>!Number.isInteger(n)||n<1||n>[1440,180,60][i])){$('plan-error').textContent='请输入有效整数：今日 1–1440，专注 1–180，休息 1–60 分钟。';return;}
  updateClock();today().plan=values[0];state.focusMinutes=values[1];state.breakMinutes=values[2];persist();$('plan-error').textContent='';document.querySelector('.plan-settings').open=false;renderClock();
}
$('clock-switch').addEventListener('click',()=>{const next=clock.mode==='focus'?'break':'focus';updateClock();clock.running=false;clock.mode=next;resetClock();});
$('clock-toggle').addEventListener('click',pauseOrStart);$('clock-reset').addEventListener('click',resetClock);$('save-plan').addEventListener('click',savePlan);
document.querySelector('.plan-settings summary').addEventListener('click',()=>{if(!document.querySelector('.plan-settings').open){$('plan-minutes').value=today().plan;$('focus-minutes').value=state.focusMinutes;$('break-minutes').value=state.breakMinutes;}});
updateClock();renderClock();let tickCount=0;
setInterval(()=>{updateClock();renderClock();if(clock.running&&++tickCount%5===0)persist();},1000);
$('group-search').addEventListener('input',()=>collection&&renderList());$('book-filter').addEventListener('change',()=>collection&&renderList());
$('group-list').addEventListener('click',e=>{const button=e.target.closest('[data-group]');if(button)openGroup(button.dataset.group);});
$('draft').addEventListener('input',()=>{if(!current)return;result=null;renderReference();$('draft-count').textContent=Array.from($('draft').value.replace(/\s/g,'')).length+' 字';$('save-status').textContent='正在保存…';$('editor-message').textContent='';clearTimeout(writingTimer);writingTimer=setTimeout(flushDraft,400);});
$('draft').addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'&&!e.isComposing){e.preventDefault();submit();}});
$('compare').addEventListener('click',submit);$('next').addEventListener('click',()=>collection&&nextGroup());$('previous').addEventListener('click',()=>{const id=state.history?.pop();if(id)openGroup(id,false);});
$('peek').addEventListener('click',()=>{result=null;referenceVisible=!referenceVisible;renderReference();});
function setMode(mode){state.mode=mode;result=null;referenceVisible=mode==='copy';$('mode-hidden').setAttribute('aria-pressed',String(mode!=='copy'));$('mode-copy').setAttribute('aria-pressed',String(mode==='copy'));persist();renderReference();}
$('mode-hidden').addEventListener('click',()=>setMode('hidden'));$('mode-copy').addEventListener('click',()=>setMode('copy'));
$('ignore-punctuation').checked=!!state.ignorePunctuation;$('ignore-punctuation').addEventListener('change',e=>{state.ignorePunctuation=e.target.checked;persist();if(result)submit();});
function saveOnExit(){flushDraft();updateClock();persist();}
window.addEventListener('pagehide',saveOnExit);document.addEventListener('visibilitychange',()=>{if(document.hidden)saveOnExit();else{updateClock();renderClock();}});
async function init(){
  try{const response=await fetch('./audit/jidiao-merged-20261126/collection-data.json?v=20261128-r20');if(!response.ok)throw Error('HTTP '+response.status);collection=await response.json();
    groupMap=new Map(collection.groups.map(g=>[g.id,g]));sourceMap=new Map(collection.originals.map(s=>[s.sourceId,s]));const ready=collection.groups.filter(g=>g.passages.length).length;
    $('bank-summary').textContent=`${ready} 组可默写 · ${collection.groups.length-ready} 组查原题 · 原文完整保留`;
    $('book-filter').innerHTML='<option value="">全部规章</option>'+[...new Set(collection.groups.map(g=>g.book))].map(b=>`<option>${escapeHTML(b)}</option>`).join('');
    setMode(state.mode||'hidden');const initial=location.hash.slice(1)||state.current;openGroup(groupMap.has(initial)?initial:collection.groups.find(g=>g.passages.length).id,false);
    if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(r=>r.update()).catch(()=>{});
    window.__DICTATION_TEST__={state,clock,compareText,updateClock,renderClock,localDay,get current(){return current;},collection};
  }catch(error){$('load-error').hidden=false;$('load-error').textContent='题库暂时未载入，请联网后刷新页面重试。'+error.message;$('bank-summary').textContent='题库加载失败';}
}
init();
