"""Evidence-only supplement: IDs, question types, answer keys and original text stay immutable."""
from pathlib import Path
import json,re,sys,collections,difflib
sys.path.insert(0,str(Path(__file__).parent))
from audit_judgments import load,norm,refs,facts
HERE=Path(__file__).parent
def source(q,quote):
    return {'kind':'bank','questionId':q['i'],'title':q['t'],'quote':quote,'version':'所附题库口径；未认定为现行规章或本次考试审定版本'}
def main():
    data,qmap=load();audit=json.loads((HERE/'cross-reference.json').read_text('utf-8'));entries=[]
    for row in audit['rows']:
        q=qmap[row['id']];existing=row['existing'];y=row['y'];cs=row['candidates']
        entry={'id':q['i'],'status':'pending','note':'已检索题库，尚未找到足以解释完整错误点的可靠原文。保留原答案，不能凭相似句猜订正。','sources':[]}
        if existing and existing.get('correctedText'):
            entry.update(status='existing_verified',correctedText=existing['correctedText'],explanation=existing.get('explanation',''),sources=existing.get('sources',[]))
        elif y and y[0]=='o' and y[1]:
            entry.update(status='original_correction',correctedText=y[1],sources=[source(q,y[1])],note='原题资料已给出订正，下面保留原文并突出与判断句的差异。')
        elif existing and existing.get('status')=='pending':
            entry['note']=existing['note']
        elif cs and cs[0]['exact']:
            c=cs[0];entry.update(status='conflict',note='题库答案冲突：本题原答案为“错误”，但另有已给答案的题目支持同一句话。暂不修改原答案，也不编造错误原因，请核对指定版本。',sources=[source(qmap[i],c['text']) for i in c['sources'][:3]])
        elif y and y[0]=='b' and len(y)>2 and y[2] in qmap and any(norm(y[1])==norm(t) for t in facts(qmap[y[2]])):
            entry.update(status='bank_contrast',correctedText=y[1],sources=[source(qmap[y[2]],y[1])],note='原有订正所指题号已核对：该题有正确答案的原文与订正一致。')
        elif cs:
            c=cs[0];delta=sum(max(len(v['wrong']),len(v['right'])) for v in c['changes']);n=len(norm(q['q']))
            ambiguous=any(t['text']!=c['text'] and t['similarity']>=c['similarity']-.012 and norm(t['text'])!=norm(c['text']) for t in cs[1:])
            sources=[qmap[i] for i in c['sources'] if not qmap[i].get('d') and '派生练习' not in qmap[i]['t']]
            if q['i'] not in {'U-N-J0096','j1-1404','j2-1776','j2-1782','dv-0075'} and sources and not ambiguous and c['similarity']>=.80 and n>=12 and 0<delta<=max(4,min(20,n*.28)) and len(c['changes'])<=6:
                entry.update(status='bank_contrast',correctedText=c['text'],sources=[source(s,c['text']) for s in sorted(sources,key=lambda q:q['k']=='j')[:3]],note='自动匹配题库中有正确答案的完整原文，供错误点对照，尚未逐题人工审定；以指定考试版本为准。原题和原答案保留。')
            elif c['similarity']>=.65:
                entry['related']=[source(qmap[i],c['text']) for i in c['sources'][:2]]
                entry['note']+=' 下方只作相关原文参考，未确认它能完整说明本题为什么错。'
        # Attach related evidence to explicit unresolved historical corrections, never silently promote them.
        if entry['status']=='pending' and 'related' not in entry and cs and cs[0]['similarity']>=.65:
            entry['related']=[source(qmap[i],cs[0]['text']) for i in cs[0]['sources'][:2]]
        entries.append(entry)
    web=HERE/'web-verified.json'
    if web.exists():
        added={e['id']:e for e in json.loads(web.read_text('utf-8'))}
        for entry in entries:
            if entry['id'] in added:entry.update(added[entry['id']])
    searches={}
    for f in (HERE/'web-search-batches').glob('*.json'):
        for batch in json.loads(f.read_text('utf-8')).get('batches',[]):
            for item in batch.get('queries',[]):
                for qid in item.get('ids',[]):searches[qid]=batch['status']
    for entry in entries:
        if entry['status'] in ['pending','conflict'] and searches.get(entry['id'])=='searched':
            entry['search']='2026-11-28 已联网查找；尚未核实与本题版本、适用范围一致且能解释完整错误点的公开原文。搜索结果不作为已核实答案。'
    payload={'revision':'judgment-explanations-20261128-r24','basis':'先核对题库中完整、已给答案的原文；网络资料仅在版本和错误点均核实后采用。相似度不是事实核验，冲突和证据不足保留待核。','entries':entries}
    (HERE/'explanations.json').write_text(json.dumps(payload,ensure_ascii=False,separators=(',',':'))+'\n','utf-8')
    summary=dict(collections.Counter(e['status'] for e in entries));(HERE/'summary.json').write_text(json.dumps({'falseJudgments':len(entries),'statuses':summary},ensure_ascii=False,indent=2)+'\n','utf-8')
    queries={}
    for e in entries:
        if e['status'] not in ['pending','conflict']:continue
        q=qmap[e['id']];r=refs(q['q']);topic=' '.join(f'"{b}" "第{a}条"' for b,a in sorted(r))
        query=topic or re.sub(r'[（(][^）)]*[)）]','',q['q'])[:65]
        if query not in queries:queries[query]={'query':query,'ids':[],'questions':[]}
        queries[query]['ids'].append(q['i']);queries[query]['questions'].append(q['q'])
    (HERE/'web-queries.json').write_text(json.dumps(list(queries.values()),ensure_ascii=False,indent=2)+'\n','utf-8')
    print(json.dumps({'statuses':summary,'webQueries':len(queries)},ensure_ascii=False))
if __name__=='__main__':main()
