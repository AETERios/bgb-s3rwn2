"""Build a source-faithful, article-grouped collection without changing legacy questions."""
from pathlib import Path
from collections import Counter, defaultdict
import hashlib, json, re, unicodedata, zipfile
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
SOURCE = Path.home() / 'Desktop/杂项/1_机调题库.docx'
NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
KINDS = ['f', 'c', 'm', 'j', 'r']
LABELS = dict(zip(KINDS, ['填空', '单选', '多选', '判断', '问答']))
CITE = re.compile(r'《([^》]+)》\s*第\s*([\d一二三四五六七八九十百]+)\s*条')
START = re.compile(r'^\s*\d+(?:[、．.]|(?=[（(]《))')
QASTART = re.compile(r'^\s*(?:\d+[、．.]\s*)?[（(]《')

def norm(text):
    text=unicodedata.normalize('NFKC', str(text))
    text=re.sub(r'(?<=\d)[.:/+-](?=\d)',lambda m:{'.':'小数点',':':'时分','/':'斜线','+':'加','-':'减'}[m[0]],text)
    return re.sub(r'[^\w\u4e00-\u9fff]', '', text.replace('%','百分号')).replace('_', '')

def bare(text):
    return re.sub(r'^\s*[（(]?\s*《[^》]+》\s*第[^条]+条\s*[）)]?\s*', '', text).strip()

def stemkey(text):
    text = re.sub(r'\{\{blank:\d+\}\}|_+|[（(]\s*[）)]', '空位', text)
    return norm(bare(text))

def signature(q):
    k = q['k']
    key = [k, stemkey(q['q'])]
    if k in ('c', 'm'):
        key += [[norm(x) for x in q['o']], q['a']]
    elif k == 'j':
        key += [q['a']]
    elif k == 'f':
        key += [[norm(x) for x in q['a']]]
    elif k == 'r':
        key += [norm(q['x'])]
    return json.dumps(key, ensure_ascii=False)

def read_rows():
    with zipfile.ZipFile(SOURCE) as z:
        root = ET.fromstring(z.read('word/document.xml'))
    rows = []
    for p in root.findall('.//w:body/w:p', NS):
        parts = []
        for node in p.iter():
            tag = node.tag.rsplit('}', 1)[-1]
            if tag == 't': parts.append(node.text or '')
            elif tag == 'tab': parts.append('\t')
            elif tag in ('br', 'cr'): parts.append('\n')
        text = ''.join(parts).strip()
        if text: rows.append({'p': len(rows) + 1, 'text': text})
    return rows

def split_answers(answer, count):
    # Delimiters occur inconsistently in the source; keep compound answers whole.
    candidates = [[answer.strip()]]
    for sep in [r'[；;]', r'[；;，,]', r'[；;，,、]']:
        candidates.append([x.strip() for x in re.split(sep, answer) if x.strip()])
    for parts in candidates:
        if len(parts) == count: return parts
    return None

def parse(rows, bank):
    sections = [(i, KINDS[n]) for n, i in enumerate(i for i,r in enumerate(rows) if re.match(r'^[一二三四五]、.{1,8}$',r['text']))]
    result, issues = [], []
    existing_f = defaultdict(list)
    for q in bank['q']:
        if q['k'] == 'f': existing_f[stemkey(q['q'])].append(q)
    for si, (start, kind) in enumerate(sections):
        end = sections[si+1][0] if si+1<len(sections) else len(rows)
        chunks = []
        for row in rows[start+1:end]:
            begins = bool((QASTART if kind == 'r' else START).match(row['text']))
            if begins: chunks.append([row])
            elif chunks: chunks[-1].append(row)
            else: raise ValueError(('orphan paragraph', row))
        for seq, chunk in enumerate(chunks, 1):
            text = '\n'.join(r['text'] for r in chunk)
            text = re.sub(r'^\s*\d+[、．.]?\s*', '', text)
            q = {'i': f'JM-{kind.upper()}{seq:04d}', 'b':'W', 'k':kind,
                 't':f'机调合并·原题{LABELS[kind]}', 'g':'key', 'sourceOnly':1}
            if kind in ('c','m'):
                fields = [s.strip() for s in re.split(r'[\t\n]',text) if s.strip()]
                ai = next((i for i,s in enumerate(fields) if re.fullmatch('[A-H]+',s)), None)
                assert ai is not None, ('missing option key', seq, kind)
                q['q'] = '\n'.join(fields[:ai]).strip()
                q['o'] = [s for s in fields[ai+1:] if s]
                ids = [ord(c)-65 for c in fields[ai]]
                assert len(q['o'])>=2 and all(i<len(q['o']) for i in ids), (kind,seq,fields)
                assert kind=='m' or len(ids)==1, (kind,seq)
                q['a'] = ids[0] if kind=='c' else ids
            elif kind=='j':
                match = re.search(r'[\t\n]\s*([01])\s*$',text)
                assert match, ('judgment key',seq,text)
                q.update(q=text[:match.start()].strip(),a=int(match[1]))
            elif kind=='f':
                # The answer follows the last paragraph containing a printed blank.
                fields = [s.strip() for s in re.split(r'[\t\n]',text) if s.strip()]
                last_blank = max(i for i,s in enumerate(fields) if re.search(r'_{2,}',s))
                stem = '\n'.join(fields[:last_blank+1]); answer='\n'.join(fields[last_blank+1:])
                if not answer and seq in (132,238):
                    # These two source paragraphs have no delimiter before the key.
                    boundary = list(re.finditer(r'_{2,}',stem))[-1].end() if seq==132 else stem.index('办理。')+3
                    stem, answer = stem[:boundary], stem[boundary:]
                if seq==10:
                    assert answer=='有动力；跨牵引区段' and '不得跨牵引区段' in stem
                    # Second key repeats text already printed, not a second blank.
                    answer='有动力'
                count = len(re.findall(r'_{2,}',stem)); answers=split_answers(answer,count)
                if answers is None:
                    candidates = existing_f[stemkey(stem)]
                    compatible = [c['a'] for c in candidates if len(c['a'])==count and norm(''.join(c['a']))==norm(answer)]
                    if compatible: answers=compatible[0]
                if answers is None:
                    issues.append({'kind':kind,'seq':seq,'p':chunk[0]['p'],'count':count,'answer':answer,'stem':stem})
                    continue
                n=iter(range(1,count+1)); q['q']=re.sub(r'_{2,}',lambda m:'{{blank:'+str(next(n))+'}}',stem)
                q['a']=answers; n=iter(answers);q['x']=re.sub(r'_{2,}',lambda m:next(n),stem)
            else:
                head, *tail = text.split('\n')
                inline=re.split(r'答[：:]',head,maxsplit=1)
                q['q']=inline[0].strip()
                answer='\n'.join(([inline[1]] if len(inline)>1 else [])+tail).strip()
                q['x']=re.sub(r'^答[：:]\s*','',answer).strip()
                assert q['x'],('empty QA',seq)
            cite = CITE.search(q['q'])
            assert cite, ('no citation',kind,seq,q['q'])
            result.append({'sourceId':q['i'],'kind':kind,'number':seq,'paragraphs':[r['p'] for r in chunk],
                           'raw': '\n'.join(r['text'] for r in chunk), 'book':cite[1],'article':cite[2], 'q':q})
    (OUT/'parse-issues.json').write_text(json.dumps(issues,ensure_ascii=False,indent=2),encoding='utf-8')
    return result,issues

def main():
    html=(ROOT/'index.html').read_text(encoding='utf-8')
    bank=json.loads(re.search(r'<script id="bank-data"[^>]*>(.*?)</script>',html,re.S)[1])
    rows=read_rows(); originals,issues=parse(rows,bank)
    (OUT/'parsed-originals.json').write_text(json.dumps(originals,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'parsed':dict(Counter(x['kind'] for x in originals)), 'issues':len(issues)},ensure_ascii=False))
    if issues: return
    lookup=defaultdict(list)
    for q in bank['q']:lookup[signature(q)].append(q)
    groups={}; reused=0; extra={}
    for source in originals:
        q=source['q'];matches=lookup[signature(q)]
        matches.sort(key=lambda c:(bool(c.get('d')),c['b']!='W',c['i']))
        practice_id=matches[0]['i'] if matches else q['i']
        if matches:reused+=1
        else:
            extra[q['i']]=q
            lookup[signature(q)].append(q)
        source['practiceId']=practice_id
        key=(source['book'],source['article'])
        if key not in groups:
            groups[key]={'id':'JM-G'+str(len(groups)+1).zfill(4),'book':key[0],'article':key[1],
                         'title':f'《{key[0]}》第{key[1]}条','passages':[],'originals':[]}
        g=groups[key];g['originals'].append(source['sourceId'])
        if q['k']=='r':
            g['passages'].append({'kind':'r','question':q['q'],'text':q['x'],'sources':[source['sourceId']]})
        elif q['k']=='f' or q['k']=='j' and q['a']==1:
            g['passages'].append({'kind':q['k'],'text':bare(q.get('x',q['q'])),'sources':[source['sourceId']]})
    for g in groups.values():
        passages=sorted(g['passages'],key=lambda p:(p['kind']!='r',-len(p['text'])))
        kept=[]
        for passage in passages:
            match=next((p for p in kept if norm(passage['text']) in norm(p['text'])),None)
            if match: match['sources']+=passage['sources']
            else:kept.append(passage)
        g['passages']=kept
    # Source text is kept independently of existing rendering/semantic cloze data.
    data={'version':1,'source':SOURCE.name,'sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
          'groups':list(groups.values()),'originals':originals,'extra':list(extra.values()),
          'practiceIds':list(dict.fromkeys(s['practiceId'] for s in originals))}
    (OUT/'collection-data.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    legacy_ids={q['i'] for q in bank['q']}
    summary={'sourceQuestions':len(originals),'types':dict(Counter(s['kind'] for s in originals)),
             'knowledgeGroups':len(groups),'sourceQuestionsUsingLegacyIds':sum(s['practiceId'] in legacy_ids for s in originals),
             'repeatedSourceQuestionsSharingNewIds':sum(s['practiceId'] not in legacy_ids for s in originals)-len(extra),'sourceOnlyQuestions':len(extra),
             'practiceQuestions':len(data['practiceIds']),'legacyTotalUnchanged':len(bank['q']),
             'groupsWithoutNarrative':sum(not g['passages'] for g in groups.values()),'sourceSha256':data['sha256']}
    (OUT/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
    md=['# 机调合并背诵题库', '',f'来源：{SOURCE.name}。按原文条款归为 {len(groups)} 个知识组，保留 {len(originals)} 道原题及答案，对应 {len(data["practiceIds"])} 道去重练习。',
        '', '完整问答优先保留，补充未覆盖的填空原文和正确判断；不同措辞分别保留。仅凭错误判断不补写正确条文。以下内容沿用来源文件，不代表对规章现行效力的重新确认。',
        '', '原文件第10道填空的答案栏多写了题干中已有的“跨牵引区段”，该题实际只有一个空，使用“有动力”；原始题目与答案栏仍完整保存在 JSON 的 raw 字段。', '']
    source_map={s['sourceId']:s for s in originals}
    for g in groups.values():
        md.extend([f'## {g["title"]}', ''])
        if not g['passages']:md.extend(['本组原文件只有选择或判断题，请结合原题答案学习。', ''])
        for p in g['passages']:
            if p.get('question'):md.extend([f'### {p["question"]}', ''])
            md.extend([p['text'], '', '对应原题：'+ '、'.join(LABELS[source_map[i]['kind']]+str(source_map[i]['number']) for i in p['sources']), ''])
        md.extend(['<details>', f'<summary>原题与答案（{len(g["originals"])}道）</summary>', ''])
        for sid in g['originals']:
            s=source_map[sid];q=s['q'];md.extend([f'### {LABELS[q["k"]]} {s["number"]} · {sid}', '',q['q'], ''])
            if q['k'] in ('c','m'):
                md.extend(f'{chr(65+i)}. {o}' for i,o in enumerate(q['o']))
                ids=[q['a']] if q['k']=='c' else q['a'];answer='；'.join(chr(65+i)+'．'+q['o'][i] for i in ids)
            elif q['k']=='j':answer='正确' if q['a'] else '错误'
            elif q['k']=='f':answer='；'.join(q['a'])
            else:answer=q['x']
            md.extend(['', '答案：'+answer, ''])
        md.extend(['</details>', ''])
    (OUT/'机调合并背诵题库.md').write_text('\n'.join(md),encoding='utf-8')
    print(json.dumps(summary,ensure_ascii=False))

if __name__=='__main__':main()
