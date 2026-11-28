"""Read-only bank cross-reference audit. Never edit questions or learning storage."""
from pathlib import Path
import re, json, collections, difflib, hashlib
ROOT=Path(__file__).resolve().parents[2]
OUT=Path(__file__).parent
def load():
    html=(ROOT/'index.html').read_text('utf-8')
    data={m.group(1):json.loads(m.group(2)) for m in re.finditer(r'<script[^>]*id="([^"]+)"[^>]*>(.*?)</script>',html,re.S)}
    qs=data['bank-data']['q']+data['jidiao-merged-data']['extra']
    return data, {q['i']:q for q in qs}
def norm(s):
    s=re.sub(r'《[^》]+》\s*第[\d一二三四五六七八九十百零]+条(?:规定)?','',s)
    s=re.sub(r'\{\{blank(?::[^}]*)?\}\}','',s)
    return re.sub(r'[^\w\u3400-\u9fff]','',s).lower()
def refs(s): return set(re.findall(r'《([^》]+)》\s*第([\d一二三四五六七八九十百零]+)条',s))
def grams(s): return {s[i:i+4] for i in range(max(0,len(s)-3))}
def facts(q):
    if q.get('d') or '派生练习' in q.get('t',''):return []
    k=q['k'];text=''
    if k=='j' and q.get('a')==1:text=q['q']
    elif k in ['f','r','v']:text=q.get('x','')
    elif k in ['c','m']:
        stem=q['q']
        if re.search(r'不正确|不属于|错误|不包括|不符合|不应|不能|不得|不准|禁止|严禁|不是|除外|不需要|不适用',stem):return []
        selected=q.get('a');selected=selected if isinstance(selected,list) else [selected]
        options=[q.get('o',[])[i] for i in selected if isinstance(i,int) and 0<=i<len(q.get('o',[]))]
        blank=r'\{\{blank(?::[^}]*)?\}\}|[（(]\s*[)）]'
        if options and len(re.findall(blank,stem))==1:
            text=re.sub(blank,lambda m:'、'.join(options),stem)
        elif options and re.search(r'下列.*(?:正确|说法|规定)',stem):
            return [o for o in options if len(norm(o))>=18]
    if not text:return []
    text=re.sub(r'^(?:正确[。．.：:]\s*)','',text).strip()
    if len(norm(text))<12:return []
    result=[text]
    # Keep complete sentence contexts from longer narrative answers.
    if len(text)>150:
        result.extend(x.strip() for x in re.split(r'(?<=[。！？\n])',text) if len(norm(x))>=18)
    return result
def difference(wrong,right):
    a,b=norm(wrong),norm(right);matcher=difflib.SequenceMatcher(None,a,b,autojunk=False)
    changes=[{'wrong':a[i:j],'right':b[k:l]} for op,i,j,k,l in matcher.get_opcodes() if op!='equal']
    return matcher.ratio(),changes
def main():
    data,qmap=load();facts_by_norm={}
    for q in qmap.values():
        for text in facts(q):
            n=norm(text)
            if n not in facts_by_norm:facts_by_norm[n]={'text':text,'sources':[],'refs':list(refs(q['q']))}
            facts_by_norm[n]['sources'].append(q['i'])
    corpus=list(facts_by_norm.items());index=collections.defaultdict(list)
    for i,(n,f) in enumerate(corpus):
        for g in grams(n):index[g].append(i)
    old={e['id']:e for e in data['correction-data']['verifiedEntries']+data['correction-data']['entries']}
    rows=[]
    for q in qmap.values():
        if q['k']!='j' or q.get('a')!=0:continue
        n=norm(q['q']);counts=collections.Counter(i for g in grams(n) for i in index.get(g,[]));candidates=[]
        qr=refs(q['q'])
        for i,overlap in counts.most_common(35):
            cn,f=corpus[i]
            # The supplied incident bank includes an operator's internal event grades;
            # do not substitute national railway accident grades for that organisation.
            if q['b']=='G' and not any(qmap[s]['b']=='G' for s in f['sources']):continue
            if abs(len(cn)-len(n))>max(50,len(n)*.6):continue
            if qr and f['refs'] and not qr.intersection(map(tuple,f['refs'])):continue
            ratio,changes=difference(q['q'],f['text'])
            if ratio<.52:continue
            candidates.append({'similarity':round(ratio,5),'text':f['text'],'sources':f['sources'],'changes':changes,'exact':n==cn})
        candidates.sort(key=lambda c:c['similarity'],reverse=True)
        y=q.get('y');existing=old.get(q['i'])
        rows.append({'id':q['i'],'subject':q['t'],'bank':q['b'],'question':q['q'],'y':y,'existing':existing,'candidates':candidates[:5]})
    report={'questions':len(qmap),'falseJudgments':len(rows),'truthFacts':len(corpus),'rows':rows}
    (OUT/'cross-reference.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n','utf-8')
    summary=collections.Counter('existing_verified' if r['existing'] and r['existing'].get('correctedText') else 'source_correction' if r['y'] and r['y'][0]=='o' else 'exact_conflict' if r['candidates'] and r['candidates'][0]['exact'] else 'near_90' if r['candidates'] and r['candidates'][0]['similarity']>=.9 else 'near_80' if r['candidates'] and r['candidates'][0]['similarity']>=.8 else 'other' for r in rows)
    print(json.dumps({'questions':len(qmap),'falseJudgments':len(rows),'truthFacts':len(corpus),'groups':summary},ensure_ascii=False))
if __name__=='__main__':main()
