"""Scan the complete bank; add reversible memory aids without editing questions."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent

def block(html, name):
    return re.search(r'<script\b[^>]*id="' + name + r'"[^>]*>(.*?)</script>', html, re.S)

CN = {v: i for i, v in enumerate('一二三四五六七八九十', 1)}

def number(s):
    if s.isdigit():
        return int(s)
    if s in CN:
        return CN[s]
    if s.startswith('十'):
        return 10 + CN.get(s[1:], 0)
    if '十' in s:
        a, b = s.split('十')
        return CN.get(a, 0) * 10 + CN.get(b, 0)
    return 0

def numbered(text):
    # Keep one numbering level together. Never split decimal values or nested lists.
    patterns = [r'[（(]([一二三四五六七八九十]{1,3})[）)]',
                r'[（(](\d{1,2})[）)]',
                r'(?:^|\n)\s*([一二三四五六七八九十]{1,3})、',
                r'(?:^|\n)\s*(\d{1,2})[、．.](?!\d)']
    for pattern in patterns:
        hits = list(re.finditer(pattern, text))
        if len(hits) < 2 or [number(m[1]) for m in hits] != list(range(1, len(hits)+1)):
            continue
        items = [text[m.end():hits[i+1].start() if i+1 < len(hits) else len(text)].strip()
                 for i, m in enumerate(hits)]
        if all(2 <= len(x) <= 1600 for x in items):
            return [{'items': items, 'basis': 'numbered'}]
    return []

def split_top(text, sep='、'):
    parts, start, depth = [], 0, 0
    for i, c in enumerate(text):
        if c in '（(【[': depth += 1
        elif c in '）)】]': depth = max(0, depth-1)
        elif c == sep and depth == 0:
            parts.append(text[start:i].strip()); start = i+1
    parts.append(text[start:].strip())
    return parts

def short_lists(text):
    out = []
    # Only explicit list introductions, with all items short and within a sentence.
    for clause in re.split(r'[。；;\n]', text):
        m = re.search(r'(?:分别为|主要包括|包括|主要有|分为|四类指|五型指)([^：:。；;]{3,180})$', clause)
        if not m: continue
        raw = m[1].strip('：: ，,')
        raw = re.split(r'分别为|主要包括|包括|主要有|分为|四类指|五型指', raw)[-1]
        if raw.count('(') != raw.count(')') or raw.count('（') != raw.count('）'): continue
        raw = re.sub(r'^从[^、]{1,15}划分为', '', raw)
        items = split_top(raw)
        if items:
            items[-1] = re.sub(r'(?:等)?\s*[一二三四五六七八九十\d]+[种个类项型级](?:情况|类型|等级|类别)?$', '', items[-1]).strip()
        # 和/及/与 may belong to a compound modifier, never infer a new item from them.
        if len(items) < 3 or not all(1 <= len(x) <= 22 for x in items): continue
        if any(re.search(r'[，,:：?？]|(?:呼叫人|被呼叫人|明白|好了|不得|应当|负责|进行|指从|划分为)', x) for x in items): continue
        if len(set(items)) != len(items): continue
        out.append({'items': items, 'basis': 'explicit-parallel'})
    return out

def groups(q):
    k = q['k']
    if k == 'm':
        indices = sorted(set(q.get('a', [])))
        if len(indices) >= 2 and all(isinstance(i, int) and 0 <= i < len(q.get('o', [])) for i in indices):
            return [{'items': [q['o'][i] for i in indices], 'basis': 'correct-options'}]
        return []
    if k == 'o':
        items = q.get('o', [])
        return [{'items': items, 'basis': 'original-order'}] if len(items) >= 3 else []
    if k == 'j' and q.get('a') != 1: return []
    if k == 'c':
        a = q.get('a')
        text = q.get('o', [])[a] if isinstance(a, int) and 0 <= a < len(q.get('o', [])) else ''
    else: text = q.get('x', '')
    return numbered(text) or short_lists(text)

def make_sentence(items, basis):
    # Exact clauses, not a misleading first-character pun. Long lists chunked in order.
    chunks = []
    for start in range(0, len(items), 3):
        group = [re.sub(r'[。；;，,\s]+$', '', x) for x in items[start:start+3]]
        quoted = ['“'+x+'”' for x in group]
        if len(group) == 1: line = '最后别漏掉' + quoted[0] + '。'
        elif len(group) == 2: line = '把' + quoted[0] + '与' + quoted[1] + '连在一起记。'
        else: line = '从' + quoted[0] + '，想到' + quoted[1] + '，再接上' + quoted[2] + '。'
        chunks.append(line)
    return chunks

def main():
    html = (ROOT/'index.html').read_text(encoding='utf-8')
    qs = json.loads(block(html, 'bank-data')[1])['q']
    curated_path = HERE/'memory-curated-r18.json'
    curated = json.loads(curated_path.read_text(encoding='utf-8')) if curated_path.exists() else {}
    aids, candidates, counts = {}, [], {}
    used = set()
    for q in qs:
        gs = groups(q)
        # Extra curated groups must give exact original text for every item.
        if q['i'] in curated and 'groups' in curated[q['i']]:
            gs = curated[q['i']]['groups']
            source = q.get('x', '') + '\n' + '\n'.join(q.get('o', []))
            assert all(item in source for g in gs for item in g['items']), q['i']
        if not gs: continue
        for gi, g in enumerate(gs):
            key = '|'.join(g['items'])
            spec = curated.get(key) or (curated.get(q['i'], {}).get('aids', []) + [None]*len(gs))[gi]
            if 'sentence' in g: spec = g
            if spec:
                g['sentences'] = spec['sentences'] if 'sentences' in spec else [spec['sentence']]
                g['kind'] = spec.get('kind', '串联句')
                if spec.get('cues'):
                    assert len(spec['cues']) == len(g['items'])
                    g['cues'] = spec['cues']
                g['crafted'] = True
            else:
                g['sentences'] = make_sentence(g['items'], g['basis'])
                g['kind'] = '原文串记'
                g['crafted'] = False
            counts[g['basis']] = counts.get(g['basis'], 0) + 1
            if key not in used:
                candidates.append({'id':q['i'], 'type':q['k'], 'stem':q.get('q',''), 'group':gi, 'items':g['items']})
                used.add(key)
        aids[q['i']] = {'groups': gs}
    (HERE/'memory-candidates-r18.json').write_text(json.dumps(candidates,ensure_ascii=False,indent=2),encoding='utf-8')
    data = json.dumps(aids, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
    existing = block(html, 'memory-aid-data')
    tag = '<script id="memory-aid-data" type="application/json">'+data+'</script>'
    if existing: html = html[:existing.start()] + tag + html[existing.end():]
    else: html = html.replace('<script id="bank-data"', tag+'\n<script id="bank-data"', 1)
    (ROOT/'index.html').write_text(html, encoding='utf-8', newline='\n')
    report = {'scanned':len(qs),'questionsWithAids':len(aids),'groups':sum(len(a['groups']) for a in aids.values()),
              'craftedQuestions':sum(any(g['crafted'] for g in a['groups']) for a in aids.values()),
              'basis':counts,'uniqueLists':len(candidates),'note':'原文串记保留完整条目，不冒充人工编写的谐音句。未明确识别的长列表不强拆。'}
    (HERE/'memory-aid-summary-r18.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False))

if __name__ == '__main__': main()
