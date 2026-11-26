from pathlib import Path
import hashlib,json,re
ROOT=Path(__file__).resolve().parents[2]
OUT=Path(__file__).resolve().parent
html=(ROOT/'index.html').read_text(encoding='utf-8')
assert 'jidiao-merged-data' not in html
blocks=['bank-data','scope-data','correction-data','seed-data','derived-context-data','semantic-cloze-data','memory-aid-data']
def digest(h,name):
    raw=re.search(r'<script id="'+name+r'"[^>]*>(.*?)</script>',h,re.S)[1]
    return hashlib.sha256(raw.encode()).hexdigest()
before={n:digest(html,n) for n in blocks}
def replace(old,new):
    global html
    assert html.count(old)==1,(old[:90],html.count(old))
    html=html.replace(old,new)
data=(OUT/'collection-data.json').read_text(encoding='utf-8').replace('</','<\\/')
html=html.replace('<script id="bank-data"',f'<script id="jidiao-merged-data" type="application/json">{data}</script>\n<script id="bank-data"',1)
ui=(OUT/'collection-ui.js').read_text(encoding='utf-8')
replace('function viewBank(){',ui+'\nfunction viewBank(){\n  if(ui.sBank === "jidiao")return viewMergedBank();')
replace('const BANK_LABEL = {operations:', 'const BANK_LABEL = {jidiao:"机调合并背诵（独立题库）",operations:')
replace('if(bankKey === "operations")return operationsMaterial(q);','if(bankKey === "jidiao")return JM_IDS.has(id); if(q.sourceOnly)return false; if(bankKey === "operations")return operationsMaterial(q);')
replace('if(!["all","key","misc","operations"].includes(S.cfg.bank))','if(!["all","key","misc","operations","jidiao"].includes(S.cfg.bank))')
replace('POOL_CACHE[key] = ORDER.filter(id => {','POOL_CACHE[key] = (bankKey === "jidiao" ? JIDIAO.practiceIds : ORDER).filter(id => {')
replace('total=QS.filter(q=>sourceMatches(q.i)', 'total=(S.cfg.bank==="jidiao"?JIDIAO.practiceIds.map(id=>QMAP.get(id)):QS).filter(q=>sourceMatches(q.i)')
replace('["operations","运用资料（独立题库）"],["misc","操规"]','["operations","运用资料（独立题库）"],["jidiao","机调合并背诵（181个知识组）"],["misc","操规"]')
replace('<div class="row home-shortcuts"><button','<div class="row home-shortcuts"><button class="btn" data-jm-open>机调合并背诵 · 新题库</button><button')
replace('[["key","重点题库（不含运用资料）"],["operations","运用资料（独立题库）"],["all",','[["key","重点题库（不含运用资料）"],["jidiao","机调合并背诵（独立题库）"],["operations","运用资料（独立题库）"],["all",')
replace('const d = t.dataset;','const d = t.dataset;\n  if(mergedClick(t))return;')
replace('if(d.studyOne){ S.cfg.scope="all";S.cfg.bank=operationsMaterial','if(d.studyOne){ S.cfg.scope="all";S.cfg.bank=QMAP.get(d.studyOne)?.sourceOnly?"jidiao":operationsMaterial')
replace('if(id === "q-category"){ ui.sBank = v; ui.openId = null; render(); }','if(id === "q-category"){ ui.sBank = v; ui.openId = null; ui.jmLimit=20; render(); }\n  else if(id === "jm-book"){ui.jmBook=v;ui.jmLimit=20;render();}')
replace('S.cfg.bank=["key","misc","operations"].includes(v)?v:"all"','S.cfg.bank=["key","misc","operations","jidiao"].includes(v)?v:"all"')
replace('QS.forEach(q => QMAP.set(q.i, q));','QS.forEach(q => QMAP.set(q.i, q));\n    JIDIAO.extra.forEach(q=>QMAP.set(q.i,q));')
replace('applyHot(); transferDup(); prepareScope(); saveLocal();', 'applyHot(); transferDup(); prepareScope();\n    if(new URLSearchParams(location.search).get("collection")==="jidiao"){S.cfg.bank="jidiao";S.cfg.scope="all";ui.tab="bank";ui.sBank="jidiao";markCfg();}\n    saveLocal();')
replace('memoryAid,shouldLearn,mergeMnemonics,scopeFor:', 'JIDIAO,JM_ORIGINALS,JM_GROUPS,openMergedBank,startMergedPractice,memoryAid,shouldLearn,mergeMnemonics,scopeFor:')
css='''\n/* Article-grouped source collection */\n.jm-group{margin:14px 0}.jm-group>summary{cursor:pointer;display:flex;flex-wrap:wrap;gap:8px;align-items:baseline}.jm-group>summary .note{margin:0}.jm-group-body{padding-top:18px}.jm-text{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.85}.jm-passage{padding:16px 0;border-bottom:1px solid var(--line)}.jm-passage h3{font-size:1em;line-height:1.65}.jm-originals{margin-top:20px}.jm-original{padding:14px 0;border-bottom:1px solid var(--line)}.jm-original>summary{cursor:pointer;overflow-wrap:anywhere;line-height:1.65}.jm-original-body{padding-top:10px}.jm-options{padding-left:2em;line-height:1.85}.jm-options li{padding-left:4px;overflow-wrap:anywhere}.jm-passages[hidden]{display:none}\n'''
css=css.replace('.jm-group{margin:14px 0}', '.jm-group{margin:14px 0;padding:16px}.jm-group>summary::before{content:"▸"}.jm-group[open]>summary::before{content:"▾"}')
html=html.replace('</style>',css+'</style>',1)
html=html.replace('shiguang-unified-20261126-v10-r18','shiguang-unified-20261127-v10-r19')
assert before=={n:digest(html,n) for n in blocks}
(ROOT/'index.html').write_text(html,encoding='utf-8')
sw=ROOT/'sw.js';sw.write_text(sw.read_text(encoding='utf-8').replace('shiguang-unified-20261126-v10-r18','shiguang-unified-20261127-v10-r19'),encoding='utf-8')
(OUT/'legacy-block-hashes.json').write_text(json.dumps(before,indent=2),encoding='utf-8')
print('Installed r19; all seven legacy data blocks unchanged.')
