# -*- coding: utf-8 -*-
"""v10-r7: 精确归属（严谨版）。只把「操规类」留未归类，其余全归重点题库。

操规类精确判定：originalCitation 或题面/原文里出现明确的操作规程名。
"""
import re, json
from collections import Counter

PATH = 'index.html'
html = open(PATH, encoding='utf-8').read()
bank = json.loads(re.search(r'<script id="bank-data"[^>]*>(.*?)</script>', html, re.S).group(1))
scope = json.loads(re.search(r'<script id="scope-data"[^>]*>(.*?)</script>', html, re.S).group(1))
SM = {e['id']: e for e in scope['entries']}
qs = bank['q']

# 精确的操规类规章名（出现即归未归类）
CZG_REGS = [
    '铁路机车操作规则', '机车操规', '机车操作规则', 'CRH操规', 'CRH系列动车组操作规则',
    'CRH动车组操作规则', '动车组操作规则', 'LKJ操作使用手册', '操作使用手册', '操作规则', '操规',
]
# 但"操作"单独出现不排除（避免误伤）；只在《…》书名号里精确匹配

def qtext(q):
    a = q.get('a')
    if not isinstance(a, list): a = [a]
    return str(q.get('q', '')) + ' ' + str(q.get('_ask', '')) + ' ' + \
           ' '.join(map(str, a)) + ' ' + str(q.get('x', ''))

def is_caozuo(eid, q):
    """判定是否为操规类（要排除的）。"""
    e = SM.get(eid, {})
    oc = e.get('originalCitation') or ''
    # 书名号里的规章名精确匹配
    for m in re.findall(r'《([^》]+)》', oc):
        for reg in CZG_REGS:
            if reg in m:
                return True
    # 题面/原文里出现《操规》《…操作规则》书名号
    t = qtext(q)
    for m in re.findall(r'《([^》]+)》', t):
        for reg in CZG_REGS:
            if reg in m:
                return True
    return False

n_key = n_misc = 0
for q in qs:
    if is_caozuo(q['i'], q):
        q['g'] = 'misc'
        n_misc += 1
    else:
        q['g'] = 'key'
        n_key += 1

print('重点题库(key):', n_key)
print('未归类(misc):', n_misc)
print('合计:', len(qs))

new_bank_json = json.dumps(bank, ensure_ascii=False, separators=(',', ':'))
html2 = re.sub(r'(<script id="bank-data" type="application/json">)(.*?)(</script>)',
               lambda m: m.group(1) + new_bank_json + m.group(3), html, flags=re.S)
html2 = html2.replace('shiguang-unified-20261124-v10-r6', 'shiguang-unified-20261124-v10-r7')
open(PATH, 'w', encoding='utf-8').write(html2)

html3 = open(PATH, encoding='utf-8').read()
b2 = json.loads(re.search(r'<script id="bank-data"[^>]*>(.*?)</script>', html3, re.S).group(1))
print('g 分布:', Counter(q['g'] for q in b2['q']))
print('APP_VERSION:', re.search(r'const APP_VERSION = "([^"]+)"', html3).group(1))
