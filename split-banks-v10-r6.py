# -*- coding: utf-8 -*-
"""v10-r6: 两题库划分（重点题库 / 未归类），给每题打 g 字段。"""
import re, json

PATH = 'index.html'
html = open(PATH, encoding='utf-8').read()

bank = json.loads(re.search(r'<script id="bank-data"[^>]*>(.*?)</script>', html, re.S).group(1))
scope = json.loads(re.search(r'<script id="scope-data"[^>]*>(.*?)</script>', html, re.S).group(1))
qs = bank['q']

IN_SCOPE_SUBJ = {'technical', 'operation', 'transport-dispatch', 'loco-dispatch', 'accident', 'rescue'}
PARTY_KW = ['党', '党建', '党史', '时事', '政治', '纪律与监督', '哲学', '公文', '文化与综合常识']
# 全文兜底关键词：图片范围内规章名
KW = ['技规', '技术管理规程', '机车运用管理规程', '运用管理规程', '铁路运输调度规则',
      '运输调度规则', '机车调度工作规则', '机车调度规则', '铁路交通事故调查处理规则',
      '事故调查处理规则', '应急救援', '救援列车']

def qtext(q):
    a = q.get('a')
    if not isinstance(a, list): a = [a]
    return str(q.get('q', '')) + ' ' + str(q.get('_ask', '')) + ' ' + \
           ' '.join(map(str, a)) + ' ' + str(q.get('x', ''))

in_scope = set()
for e in scope['entries']:
    subs = set(e.get('subjects') or [])
    oc = e.get('originalCitation') or ''
    if (subs & IN_SCOPE_SUBJ) or 'party' in subs or e.get('publicKnowledge') \
       or any(k in oc for k in PARTY_KW):
        in_scope.add(e['id'])

kw_added = set()
for q in qs:
    if q['i'] in in_scope:
        continue
    t = qtext(q)
    if any(k in t for k in KW):
        kw_added.add(q['i'])

in_scope |= kw_added

n_key = sum(1 for q in qs if q['i'] in in_scope)
print('重点题库:', n_key, '（scope归属:', len(in_scope) - len(kw_added), '，关键词兜底:', len(kw_added), '）')
print('未归类:', len(qs) - n_key)

for q in qs:
    q['g'] = 'key' if q['i'] in in_scope else 'misc'

# 移除题库派生字段可能存在的旧 bank 标记影响：无（b 保留为来源库）
new_bank_json = json.dumps(bank, ensure_ascii=False, separators=(',', ':'))

def repl(m):
    return m.group(1) + new_bank_json + m.group(3)
html2, n = re.subn(r'(<script id="bank-data" type="application/json">)(.*?)(</script>)',
                   lambda m: m.group(1) + new_bank_json + m.group(3), html, flags=re.S)
assert n == 1, 'bank-data 替换失败'

# 版本号
html2 = html2.replace('shiguang-unified-20261124-v10-r5', 'shiguang-unified-20261124-v10-r6')
open(PATH, 'w', encoding='utf-8').write(html2)

# 校验
html3 = open(PATH, encoding='utf-8').read()
b2 = json.loads(re.search(r'<script id="bank-data"[^>]*>(.*?)</script>', html3, re.S).group(1))
from collections import Counter
print('g 分布:', Counter(q['g'] for q in b2['q']))
print('题量:', len(b2['q']), 'APP_VERSION:', re.search(r'const APP_VERSION = "([^"]+)"', html3).group(1))
