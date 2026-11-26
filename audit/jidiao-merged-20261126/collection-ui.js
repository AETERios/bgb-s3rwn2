/* Independent article collection; original question IDs and base bank stay intact. */
const JIDIAO = JSON.parse(document.getElementById('jidiao-merged-data').textContent);
const JM_ORIGINALS = new Map(JIDIAO.originals.map(s=>[s.sourceId,s]));
const JM_GROUPS = new Map(JIDIAO.groups.map(g=>[g.id,g]));
const JM_IDS = new Set(JIDIAO.practiceIds);
const JM_KINDS = {f:'填空',c:'单选',m:'多选',j:'判断',r:'问答'};
function jmOriginalHTML(source){
  const q=source.q;
  let options='',answer='';
  if(q.k==='c'||q.k==='m'){
    options=`<ol class="jm-options" type="A">${q.o.map(o=>`<li>${esc(o)}</li>`).join('')}</ol>`;
    const indices=q.k==='c'?[q.a]:q.a;
    answer=indices.map(i=>`${LETTERS[i]}．${q.o[i]}`).join('；');
  }else if(q.k==='j') answer=q.a?'正确':'错误';
  else if(q.k==='f') answer=q.a.join('；');
  else answer=q.x;
  const stem=q.q.replace(/\{\{blank:\d+\}\}/g,'（____）');
  return `<details class="jm-original"><summary>${JM_KINDS[q.k]} ${source.number} · ${esc(stem)}</summary><div class="jm-original-body"><p class="jm-text">${esc(stem)}</p>${options}<p class="jm-text"><b>原答案：</b>${esc(answer)}</p>${q.k==='f'?`<p class="jm-text"><b>填回原文：</b>${esc(q.x)}</p>`:''}<button class="btn" data-jm-question="${source.sourceId}">练这道原题</button></div></details>`;
}
function jmGroupHTML(group){
  const sources=group.originals.map(id=>JM_ORIGINALS.get(id));
  const passages=group.passages.map(p=>`<section class="jm-passage">${p.question?`<h3>${esc(p.question)}</h3>`:''}<div class="jm-text">${esc(p.text)}</div><p class="note">对应原题：${p.sources.map(id=>{const s=JM_ORIGINALS.get(id);return `${JM_KINDS[s.kind]} ${s.number}`;}).join('、')}</p></section>`).join('');
  return `<details class="sheet jm-group" data-jm-group="${group.id}"><summary><b>${esc(group.title)}</b><span class="note">${sources.length} 道原题 · ${group.passages.length} 段合并原文</span></summary><div class="jm-group-body">${passages?`<div class="row"><button class="btn" data-jm-hide>遮住背诵原文</button><button class="btn primary" data-jm-practice="${group.id}">练本组原题</button></div><div class="jm-passages">${passages}</div>`:`<p class="note">本组原文件只有选择或判断题，请展开原题对照答案学习。</p><button class="btn primary" data-jm-practice="${group.id}">练本组原题</button>`}<details class="jm-originals"><summary>原题与答案（${sources.length} 道，保留原题型和选项）</summary>${sources.map(jmOriginalHTML).join('')}</details></div></details>`;
}
function viewMergedBank(){
  const term=ui.search.trim().toLowerCase(),book=ui.jmBook||'';
  const hits=JIDIAO.groups.filter(g=>(!book||g.book===book)&&(!term||[g.title,...g.passages.map(p=>p.text),...g.originals.map(id=>{const s=JM_ORIGINALS.get(id);return s.raw+' '+s.sourceId+' '+s.practiceId;})].join('\n').toLowerCase().includes(term)));
  const limit=ui.jmLimit||20,books=[...new Set(JIDIAO.groups.map(g=>g.book))];
  const categoryOpts=[['key','重点题库（不含运用资料）'],['jidiao','机调合并背诵（独立题库）'],['operations','运用资料（独立题库）'],['all','全部题库（含运用资料、操规）'],['misc','操规（不考）']];
  return `<header class="board"><div class="brand">机调合并背诵<small>${JIDIAO.groups.length} 个条款知识组 · ${JIDIAO.originals.length} 道原题 · ${JIDIAO.practiceIds.length} 道去重练习</small></div></header><section class="sheet"><p class="note">同一条款集中背诵；完整问答优先，补充未覆盖的填空原文和正确判断。措辞不同的原文分别保留。选择题和错误判断保留原题及答案，展开可练。</p><div class="row"><button class="btn primary" data-jm-practice="all">打乱练原题</button><button class="btn" data-jm-export>导出合并题库</button></div></section><div class="search"><input type="search" id="q-search" placeholder="搜条款、知识点、原题或答案" value="${esc(ui.search)}" autocomplete="off"><div class="filters"><select id="q-category" aria-label="内容分类">${categoryOpts.map(([v,t])=>`<option value="${v}" ${v==='jidiao'?'selected':''}>${t}</option>`).join('')}</select><select id="jm-book" aria-label="规章"><option value="">全部规章</option>${books.map(b=>`<option value="${esc(b)}" ${b===book?'selected':''}>${esc(b)}</option>`).join('')}</select></div></div><p class="note" id="q-count">找到 ${hits.length} 个知识组，显示 ${Math.min(limit,hits.length)} 个。展开知识组即可背诵或练原题。</p><div class="jm-groups">${hits.slice(0,limit).map(jmGroupHTML).join('')||'<div class="sheet empty">没有找到，换个关键词试试。</div>'}</div>${hits.length>limit?'<button class="btn" data-jm-more>再显示 20 个知识组</button>':''}`;
}
function openMergedBank(){
  if(ui.studying)pauseStudy();
  ui.annotating=false;ui.tab='bank';ui.sBank='jidiao';ui.search='';ui.jmLimit=20;
  S.cfg.bank='jidiao';S.cfg.scope='all';prepareScope();markCfg();render();window.scrollTo(0,0);
}
function startMergedPractice(groupId,sourceId){
  S.cfg.bank='jidiao';S.cfg.scope='all';prepareScope();markCfg();
  let ids=sourceId?[JM_ORIGINALS.get(sourceId)?.practiceId]:groupId==='all'?JIDIAO.practiceIds:JM_GROUPS.get(groupId)?.originals.map(id=>JM_ORIGINALS.get(id).practiceId)||[];
  ids=[...new Set(ids)].filter(id=>practiceEligible(id,'all','jidiao'));
  if(!ids.length){toast('本组没有可练习的原题');return;}
  ids=seededShuffle(ids,hashSeed('jidiao|'+Date.now()));
  ui.xs=newSess(ids,'single');ui.mode='extra';enterStudy();
}
function mergedClick(target){
  if(target.hasAttribute('data-jm-open')){openMergedBank();return true;}
  if(target.hasAttribute('data-jm-hide')){
    const panel=target.closest('.jm-group').querySelector('.jm-passages');panel.hidden=!panel.hidden;
    target.textContent=panel.hidden?'显示背诵原文':'遮住背诵原文';return true;
  }
  if(target.dataset.jmQuestion){startMergedPractice(null,target.dataset.jmQuestion);return true;}
  if(target.dataset.jmPractice){startMergedPractice(target.dataset.jmPractice);return true;}
  if(target.hasAttribute('data-jm-more')){ui.jmLimit=(ui.jmLimit||20)+20;render();return true;}
  if(target.hasAttribute('data-jm-export')){
    const blob=new Blob([JSON.stringify(JIDIAO,null,2)],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='拾光-机调合并背诵题库.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return true;
  }
  return false;
}
