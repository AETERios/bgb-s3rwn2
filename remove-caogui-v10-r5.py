# -*- coding: utf-8 -*-
"""从题库中移除明显标注《操规》的 37 道题（v10-r5）。
删除范围：题面直接标注《操规》第xx条 的 18 道 + 问答投影题 _ask 含《操规》第xx条 的 19 道。
同步：bank-data(q/order)、scope-data(entries/summary/revision)、HOT 常量、APP_VERSION。
"""
import re, json

PATH = 'index.html'
html = open(PATH, encoding='utf-8').read()

TARGETS = [
    'U-W-S0009','U-W-S0010','U-W-S0018','U-W-S0019','U-W-S0020',
    'U-W-S0038','U-W-S0039','U-W-S0040','U-W-S0041',
    'U-W-M0020','U-W-M0040','U-W-M0078','U-W-M0079',
    'U-N-K0003','U-N-K0005','U-N-K0021','U-N-K0022','U-N-K0023',
    'U-N-K0032','U-N-K0038','U-N-K0039','U-N-K0057','U-N-K0058',
    'U-N-K0063','U-N-K0064','U-N-K0066','U-N-K0067','U-N-K0070',
    'U-N-K0073','U-N-K0088','U-N-K0094','U-N-K0100',
    'dv-0205','dv-0206','dv-0207','dv-0220','dv-0221',
]
TARGETS = set(TARGETS)
assert len(TARGETS) == 37, f"目标数不对：{len(TARGETS)}"

# 1) bank-data
m = re.search(r'(<script id="bank-data" type="application/json">)(.*?)(</script>)', html, re.S)
data = json.loads(m.group(2))
old_q = len(data['q'])
old_order = len(data['order'])
data['q'] = [q for q in data['q'] if q['i'] not in TARGETS]
data['order'] = [i for i in data['order'] if i not in TARGETS]
new_q = len(data['q']); new_order = len(data['order'])
assert old_q - new_q == 37, f"q 删除数不对：{old_q}->{new_q}"
assert old_order - new_order == 37, f"order 删除数不对：{old_order}->{new_order}"
new_bank_json = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
html = html[:m.start()] + m.group(1) + new_bank_json + m.group(3) + html[m.end():]
print(f"bank-data: q {old_q}->{new_q}, order {old_order}->{new_order}")

# 2) scope-data
m2 = re.search(r'(<script id="scope-data" type="application/json">)(.*?)(</script>)', html, re.S)
scope = json.loads(m2.group(2))
old_entries = len(scope['entries'])
scope['entries'] = [e for e in scope['entries'] if e['id'] not in TARGETS]
new_entries = len(scope['entries'])
assert old_entries - new_entries == 37, f"entries 删除数不对：{old_entries}->{new_entries}"
# 重算 summary（按 status 统计）
from collections import Counter
sc = Counter(e['status'] for e in scope['entries'])
scope['summary'] = {'core': sc.get('core', 0), 'related': sc.get('related', 0),
                    'excluded': sc.get('excluded', 0), 'pending': sc.get('pending', 0)}
scope['revision'] = 'shiguang-unified-20261124-v10-r5'
new_scope_json = json.dumps(scope, ensure_ascii=False, separators=(',', ':'))
html = html[:m2.start()] + m2.group(1) + new_scope_json + m2.group(3) + html[m2.end():]
print(f"scope-data: entries {old_entries}->{new_entries}, summary={scope['summary']}")

# 3) HOT 常量：删除 19 个 U-N-K* 条目
hot_targets = [t for t in TARGETS if t.startswith('U-N-K')]
print(f"HOT 要删 {len(hot_targets)} 条")
for tid in hot_targets:
    # 匹配 "U-N-K0003":[1,1] 这类条目（值可能是 [x,y] 或 [x]）
    pat = re.compile(r'"' + re.escape(tid) + r'":\[\d+(?:,\d+)?\],?')
    m3 = pat.search(html)
    assert m3, f"HOT 未找到 {tid}"
    html = html[:m3.start()] + html[m3.end():]

# 4) APP_VERSION 升 v10-r5
html = html.replace('const APP_VERSION = "shiguang-unified-20261124-v10-r4";',
                    'const APP_VERSION = "shiguang-unified-20261124-v10-r5";')

open(PATH, 'w', encoding='utf-8').write(html)
print("已写入 index.html")

# 校验：重读确认无残留
html2 = open(PATH, encoding='utf-8').read()
m = re.search(r'<script id="bank-data" type="application/json">(.*?)</script>', html2, re.S)
d2 = json.loads(m.group(1))
assert len(d2['q']) == 13200 - 37, "q 总数不对"
assert len(d2['order']) == 13200 - 37, "order 总数不对"
residual = [q['i'] for q in d2['q'] if q['i'] in TARGETS]
assert not residual, f"仍残留：{residual}"
# 题面不应再含《操规》标注（dv/U-W 系列已删；U-N-K 系列 _ask 含操规的也删了）
cg_in_q = [q['i'] for q in d2['q'] if '操规' in str(q.get('q','')) or '操规' in str(q.get('_ask',''))]
print("删除后题面/问题文本仍含「操规」的题:", cg_in_q)
print("最终题量:", len(d2['q']))
print("校验通过 ✓")
