import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root='../jidiao20-app/', base=root+'source-evidence/exam-scope-20261122/';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const html=fs.readFileSync('index.html','utf8');
const embedded=id=>JSON.parse(html.match(new RegExp('<script id="'+id+'"[^>]*>([\\s\\S]*?)</script>'))[1]);
const bank=embedded('bank-data');
const baseline=execFileSync('git',['show','b7193b2:index.html'],{encoding:'utf8',maxBuffer:12*1024*1024});
const old=JSON.parse(baseline.match(/<script id="scope-data"[^>]*>([\s\S]*?)<\/script>/)[1]);
const raw=new Map(['bank.json','bank-user-20261105.json','bank-user-20261108.json','bank-party-word-20261109.json'].flatMap(n=>read(root+'dist/'+n).questions).map(q=>[q.id,q]));
const norm=t=>String(t||'').replace(/《[^》]+》(?:第[^条\n]{1,25}条)?/gu,'').replace(/\{\{blank:\d+\}\}/g,'').replace(/[^\p{L}\p{N}]/gu,'').toLowerCase();
const subject=t=>/铁路技术管理规程|(?:普速|高速|高铁)?技规/.test(t)?'technical':/铁路机车运用管理规[则程]|机运规/.test(t)?'operation':/机车调度(?:工作)?规[则程]|机调规/.test(t)?'loco-dispatch':/铁路运输调度(?:工作)?规[则程]|《调规》/.test(t)?'transport-dispatch':/铁路交通事故调查处理规则/.test(t)?'accident':/应急救援|救援列车管理|相互救援管理|故障应急处置/.test(t)?'rescue':null;
const publicRE= /计算机(?!车)|Windows|Excel|Word|Office|CPU|电子邮件|打印机|扩展名.*txt|职业道德|道德品质|关于道德|职业纪律|职业良知|职业技能的说法|社会主义|共产主义|马克思|毛泽东|邓小平|习近平|唯物|唯心|辩证|哲学|文学|诗人|诗歌|作家|小说|成语|公文|请示|批复|劳动法|宪法|民法|刑法|行政法|安全生产法|消防法|国民经济|市场经济|宏观经济|集体利益与个人利益|社会效益与企业效益/;
const safetyRE=/中暑|有限空间|安全标志分为|安全带按作业|三管三必须|灭火器|心肺复苏|人工呼吸|触电急救|止血|烧伤|烫伤|火灾逃生/;
const tech=read(base+'research-technical.json'), primary=read(base+'research-primary-corpus.json'), nos=read(base+'research-nos.json'), c=read(base+'c-source-candidates.json');
const docs={ 'technical-highspeed-2014':fs.readFileSync(base+'originals/technical-highspeed-2014.txt','utf8'), 'technical-2014':fs.readFileSync(root+'source-evidence/tech2014.txt','utf8') };
for(let n of ['accident-rule-2007','accident-rescue-regulation','technical-2006','locomotive-operation-2015','locomotive-dispatch-2017'])docs[n]=fs.readFileSync(base+'originals/'+n+'.txt','utf8');
const nd=Object.fromEntries(Object.entries(docs).map(([k,v])=>[k,norm(v.replace(/\[PDF第\d+页\]/g,''))]));
const publicIds=new Set(read('audit/public-reviewed-ids.json').ids);
let evidence=new Map();
function add(id,e){if(!evidence.has(id))evidence.set(id,[]); evidence.get(id).push(e)}
for(let e of [...tech.entries,...primary.entries]){
 const doc=e.sourceTitle.includes('高速')?'technical-highspeed-2014':e.sourceTitle.includes('2006')?'technical-2006':e.sourceTitle.includes('调查处理规则')?'accident-rule-2007':e.sourceTitle.includes('条例')?'accident-rescue-regulation':'technical-2014';
 const quote=norm(e.matchedText||e.quote); const inSource=quote.length>=20&&nd[doc]?.includes(quote);
 add(e.id,{subject:e.subjects[0],title:e.sourceTitle,url:e.url,version:e.version,page:e.page,article:e.article,quote:e.quote||e.matchedText,sourceFile:doc,sourceTextFound:!!inSource,level:'candidate'});
}
for(let e of nos.entries)for(let m of e.sourceMatches)add(e.id,{subject:e.subjects[0],title:m.title,url:m.url,version:m.version,page:m.pdfPage,article:m.article,quote:m.matchedText,sourceFile:m.sourceId,sourceTextFound:nd[m.sourceId]?.includes(norm(m.matchedText))||false,level:'reviewed-attribution',reviewNote:e.reviewNote});
for(let e of c)for(let m of e.hits||[]){if(!nd[m.doc])continue; const src=primary.sources.find(s=>s.name===m.doc)||nos.sources.find(s=>s.id===m.doc);add(e.id,{subject:m.doc.startsWith('technical')?'technical':m.doc.includes('operation')?'operation':m.doc.includes('dispatch')?'loco-dispatch':m.doc.includes('accident-rule')?'accident':'rescue',title:src?.title|| (m.doc.includes('highspeed')?'铁路技术管理规程（高速铁路部分）':tech.source.title),url:src?.url|| (m.doc.includes('highspeed')?primary.sources.find(s=>s.name==='technical-highspeed-2014')?.url:tech.source.url),version:'历史原件；未核2026现行版本和答案',page:m.page,quote:m.snippet,sourceFile:m.doc,sourceTextFound:m.length>=25&&nd[m.doc].includes(norm(m.snippet)),level:'candidate'});}

for(const [id,doc,article,quote] of [
 ['U-X-J0488','locomotive-operation-2015','第六十九条','旅客列车不应附挂回送机车'],
 ['U-X-F0358','locomotive-operation-2015','第八十五条','长期备用指备用时间30天以上的机车'],
 ['U-X-F0365','locomotive-operation-2015','第八十五条','备用时间在90天以上及由于内电转化、运输调整等原因闲置的机车，可转入封存'],
 ['U-X-F0359','locomotive-operation-2015','第八十六条','按整备完毕时刻转入备用'],
 ['U-X-S0649','technical-2014','第335条','遵守列车运行图规定的运行时刻和各项允许及限制速度']
]){const source=nos.sources.find(s=>s.id===doc)||tech.source;add(id,{subject:doc==='technical-2014'?'technical':'operation',title:source.title,url:source.url,version:'2014/2015历史原件；未核2026现行版本与答案',article,quote,sourceFile:doc,sourceTextFound:nd[doc].includes(norm(quote)),level:'reviewed-attribution',reviewNote:'逐题复审题意与实质条款；归属确认不核定全部表述及原真假答案。'});}
const entries=bank.q.map(q=>{
 const r=raw.get(q.i)||{},prev=old.entries.find(e=>e.id===q.i), text=[q.q,q.x,...(q.o||[])].join('\n');
 const matches=evidence.get(q.i)||[];
 // Content comparison is independent of old category/type decisions.
 const full=norm(q.x||r.fullAnswer||q.q);for(let m of matches){const n=norm(m.quote);m.coverage=full.length?+(n.length/full.length).toFixed(3):0;m.substantive=m.sourceTextFound&&(m.level==='reviewed-attribution'||(n.length>=28&&(m.coverage>=0.55||n.length>=40)));if(m.level!=='reviewed-attribution'&&m.substantive)m.level='substantive-text-match';}
 const citation=[r.sourceQuestion?.citation,r.sourceQuestion?.regulation,subject(r.sourceTitle||'')?r.sourceTitle:'',r.topic,/^.{0,12}(?:《|[（(]《)/.test(q.q)?q.q.slice(0,100):'', /（(?:高铁|高速|普速)?技规第/.test(q.q)?q.q:''].filter(Boolean).join('；');
 let cited=subject(citation), subjects=[], status='pending', rule='attribution-pending', reason='未取得足够的目标规章实质依据，保留待核；不因题型、来源库或专业类别排除。', evidenceLevel='unresolved';
 let publicKnowledge=q.b==='P'||publicIds.has(q.i);
 if(publicKnowledge){status='core';subjects=['party'];if(safetyRE.test(q.q))subjects.push('rescue');rule='public-content';reason=q.b==='P'?'保留旧Word党建及考试宝党建原题、原文。':'按题干、选项或原文内容归为公共知识（党口），与原库和题型无关。';evidenceLevel='content-classification';}
 if(cited){status='core';subjects.push(cited);rule=publicKnowledge?rule:'original-citation';reason=publicKnowledge?reason:'原题出处字段或题文明确标注目标规章；仅确认所附资料标注归属，未据此核定答案或现行版本。';evidenceLevel=publicKnowledge?evidenceLevel:'original-citation';}
 const supported=matches.filter(m=>m.substantive);if(supported.length){status='core';subjects.push(...supported.map(m=>m.subject));if(!publicKnowledge){rule='substantive-source-content';reason='历史原文有实质内容依据；归属与答案、现行有效性分别核对。';evidenceLevel=supported.some(m=>m.level==='reviewed-attribution')?'reviewed-attribution':'substantive-text-match';}}
 return {id:q.i,status,subjects:[...new Set(subjects)],reason,rule,evidenceLevel,previousStatus:prev?.status,originalCitation:citation,publicKnowledge,evidence:[...(citation?['原件标注：'+citation]:[]),...matches.map(m=>`${m.level}｜${m.title}｜${m.article||''}${m.page?' PDF第'+m.page+'页':''}｜${m.quote}`)],sourceMatches:matches,answerVerification:'未在本轮核实，保留原答案及既有独立订正',versionVerification:'未全面核实2026现行修订'};
});
fs.mkdirSync('audit',{recursive:true});
const manifest={revision:'exam-scope-20261122-v2',basis:'按实际内容及规章归属；公共知识全部归党口；不足证据保留待核。',note:'原题标注、实质原文匹配、已复审归属及候选分级记录；均不代表答案或2026现行版本已核。旧类别排除全部撤销。',subjects:old.subjects,entries};
fs.writeFileSync('audit/scope-v2.json',JSON.stringify(manifest));
const csv=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
function exportCsv(name,rows){fs.writeFileSync('audit/'+name,'\ufeff'+[['原编号','来源库','原题号','去留','科目','证据级别','题干','原题出处','理由','证据','答案核对','版本核对'],...rows.map(e=>{let q=bank.q.find(q=>q.i===e.id),r=raw.get(e.id);return[e.id,q.b,r?.originalNo,e.status,e.subjects.join('；'),e.evidenceLevel,q.q,e.originalCitation,e.reason,e.evidence.join('\n'),e.answerVerification,e.versionVerification]})].map(row=>row.map(csv).join(',')).join('\r\n'));}
exportCsv('逐题去留.csv',entries);exportCsv('待核.csv',entries.filter(e=>e.status==='pending'));exportCsv('公共知识.csv',entries.filter(e=>e.publicKnowledge));
fs.writeFileSync('audit/evidence-sources.json',JSON.stringify({checked:'2026-11-22',sources:[tech.source,...primary.sources,...nos.sources],localTextHashes:Object.fromEntries(Object.entries(docs).map(([k,v])=>[k,crypto.createHash('sha256').update(v).digest('hex')])),limitation:manifest.note},null,2));
console.log(JSON.stringify({summary:Object.fromEntries(['core','pending','excluded','related'].map(s=>[s,entries.filter(e=>e.status===s).length])),public:entries.filter(e=>e.publicKnowledge).length,nonP:entries.filter(e=>e.publicKnowledge&&bank.q.find(q=>q.i===e.id).b!=='P').length,levels:entries.reduce((a,e)=>(a[e.evidenceLevel]=(a[e.evidenceLevel]||0)+1,a),{})}));
