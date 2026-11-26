from pathlib import Path
import hashlib,importlib.util,json,re,subprocess
ROOT=Path(__file__).resolve().parents[2];OUT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('builder',OUT/'build_collection.py');b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
h=(ROOT/'index.html').read_text(encoding='utf-8')
def block(name):return re.search(r'<script id="'+name+r'"[^>]*>(.*?)</script>',h,re.S)[1]
d=json.loads(block('jidiao-merged-data'));bank=json.loads(block('bank-data'))
source=b.read_rows();covered=[p for s in d['originals'] for p in s['paragraphs']]
expected=[r['p'] for r in source if r['text']!='机务题库' and not re.match(r'^[一二三四五]、.{1,8}$',r['text'])]
assert sorted(covered)==expected and len(covered)==len(set(covered))
assert len(d['originals'])==804 and len(d['groups'])==181
qmap={q['i']:q for q in bank['q']+d['extra']};by_source={s['sourceId']:s for s in d['originals']}
assert len(qmap)==len(bank['q'])+len(d['extra'])
assert all(b.signature(s['q'])==b.signature(qmap[s['practiceId']]) for s in d['originals'])
for s in d['originals']:
 q=s['q']
 if q['k']=='f':
  assert len(re.findall(r'\{\{blank:\d+\}\}',q['q']))==len(q['a'])
  assert re.sub(r'\{\{blank:(\d+)\}\}',lambda m:q['a'][int(m[1])-1],q['q'])==q['x']
  assert all(b.norm(a) in b.norm(s['raw']) for a in q['a'])
 if q['k'] in ('c','m'):
  assert all(o in s['raw'] for o in q['o'])
  indices=[q['a']] if q['k']=='c' else q['a']
  assert all(0<=i<len(q['o']) for i in indices)
 if q['k']=='r':assert all(line in s['raw'] for line in q['x'].splitlines())
for g in d['groups']:
 for p in g['passages']:
  origins=[by_source[i]['q'] for i in p['sources']]
  assert not any(q['k']=='j' and q['a']==0 for q in origins)
  assert any(p['text']==(q['x'] if q['k']=='r' else b.bare(q.get('x',q['q']))) for q in origins)
assert by_source['JM-F0010']['q']['a']==['有动力']
cross=next(s for s in d['originals'] if s['kind']=='r' and '跨局交路机车工作计划编制和执行' in s['q']['q'])
assert '指图定机车折返局' in cross['q']['x'] and '（四）' in cross['q']['x']
old=subprocess.check_output(['git','show','766c85df88d7836a3cb8758df5ce4ddee98fe4bb:index.html'],cwd=ROOT).decode('utf-8')
hashes={}
for name in ['bank-data','scope-data','correction-data','seed-data','derived-context-data','semantic-cloze-data','memory-aid-data']:
 before=re.search(r'<script id="'+name+r'"[^>]*>(.*?)</script>',old,re.S)[1]
 assert before==block(name),name
 hashes[name]=hashlib.sha256(block(name).encode()).hexdigest()
inline=[s for attrs,s in re.findall(r'<script([^>]*)>(.*?)</script>',h,re.S) if 'application/json' not in attrs and 'src=' not in attrs]
(OUT/'check-inline.js').write_text('\n'.join(inline),encoding='utf-8')
report={'sourceParagraphsCovered':len(covered),'sourceOriginals':len(d['originals']),'knowledgeGroups':len(d['groups']),
        'uniquePracticeQuestions':len(d['practiceIds']),'legacyBankQuestions':len(bank['q']),
        'legacyBlocksUnchanged':hashes,'sourceSha256':d['sha256'],'allSourceTypeOptionAnswerChecks':True}
(OUT/'data-verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in report.items() if k!='legacyBlocksUnchanged'},ensure_ascii=False))
