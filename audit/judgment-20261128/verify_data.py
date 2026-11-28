"""Validate immutable original datasets and provenance of judgment supplements."""
from pathlib import Path
import collections,json,re,subprocess
from audit_judgments import load,facts,norm

HERE=Path(__file__).parent
ROOT=HERE.parent.parent
BASELINE='9af948e3a1e4b34d1bcda343fed827af7b31498d'
def main():
    current=(ROOT/'index.html').read_text('utf-8')
    previous=subprocess.run(['git','show',BASELINE+':index.html'],cwd=ROOT,capture_output=True,check=True).stdout.decode('utf-8')
    names=['bank-data','scope-data','correction-data','seed-data','derived-context-data','semantic-cloze-data','memory-aid-data','jidiao-merged-data']
    for name in names:
        pattern=r'<script[^>]*id="'+name+r'"[^>]*>(.*?)</script>'
        assert re.search(pattern,current,re.S)[1]==re.search(pattern,previous,re.S)[1],name
    _,qs=load()
    entries=json.loads(re.search(r'<script[^>]*id="judgment-explanation-data"[^>]*>(.*?)</script>',current,re.S)[1])['entries']
    ids=[e['id'] for e in entries]
    assert len(ids)==len(set(ids))==1688
    assert set(ids)=={q['i'] for q in qs.values() if q['k']=='j' and q['a']==0}
    for e in entries:
        if e['status']=='bank_contrast':
            assert e['sources']
            for source in e['sources']:
                q=qs[source['questionId']]
                assert not q.get('d') and '派生练习' not in q['t']
                assert norm(e['correctedText']) in {norm(t) for t in facts(q)},e['id']
        if e['status']=='original_correction':
            assert qs[e['id']]['y'][0]=='o'
            assert e['correctedText']==qs[e['id']]['y'][1]
        if e['status']=='conflict':
            assert not e.get('correctedText')
            assert any(norm(s['quote'])==norm(qs[e['id']]['q']) for s in e['sources'])
        if e['status'] in ['pending','conflict']:
            assert e.get('search'),e['id']
        if e['status']=='verified_web':
            assert e.get('explanation') and all(s.get('url','').startswith('https://') for s in e['sources'])
    rejected={'U-N-J0096','j1-1404','j2-1776','j2-1782','dv-0075'}
    assert not any(e['id'] in rejected and e['status']=='bank_contrast' for e in entries)
    assert facts(qs['U-X-M0043'])==[], 'Do not paste the whole answer list into every blank'
    result={'baseline':BASELINE,'originalDatasetsUnchanged':len(names),'falseJudgments':len(entries),'statuses':dict(collections.Counter(e['status'] for e in entries)),'allPendingSearched':True,'sourceQuotesValidated':True}
    (HERE/'data-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n','utf-8')
    print(json.dumps(result,ensure_ascii=False))
if __name__=='__main__':main()
