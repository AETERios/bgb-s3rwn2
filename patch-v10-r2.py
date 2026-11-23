# -*- coding: utf-8 -*-
"""v10-r2：去掉点词填空、修搜索输入法、指标计算题恢复自评、版本升 r2。"""
import json, re, io, sys

ROOT = r"C:/Users/eilot/Documents/Codex/2026-11-02/wo/work/bgb-s3rwn2/"
P = ROOT + "index.html"
s = open(P, encoding="utf-8").read()
orig_len = len(s)
def rep(old, new, cnt=1):
    global s
    assert s.count(old) >= 1, "MISS: " + old[:80]
    s = s.replace(old, new, cnt)

# ---- 1. 点词填空全部改为键盘填空 ----
rep('c.mode = !numeric && ans.length <= 2 && ans.every(a => a.length <= 8) && ans.join("").length <= 14 ? "word" : "type";',
    'c.mode = "type";')
rep('mode: "word", bank: null', 'mode: "type", bank: null')
rep('<button class="cloze-link" data-wb-toggle>${c.mode === "word" ? "改用键盘输入" : "改回点词"}</button>', '')
rep('if(t.hasAttribute("data-wb-toggle")){ c.mode = c.mode === "word" ? "type" : "word"; c.bank = null; render(); if(c.mode === "type") focusFirstFill(); return; }\n    ', '')
rep('if(!c.checked && c.mode === "word") body += wordBankHTML(q, c);\n      ', '')
rep('多个空的题每次随机考一部分，短答案可以点词入空，空挖得不对可以点“自己选”。',
    '多个空的题每次随机考一部分，空挖得不对可以点“自己选”。')

# ---- 2. 搜索框：输入法组词期间不重渲染，组词结束后再搜 ----
old_search = ('if(e.target.id === "q-search"){ ui.search = e.target.value; '
              'clearTimeout(app._st); app._st = setTimeout(render, 250); }\n});')
new_search = ('if(e.target.id === "q-search"){ ui.search = e.target.value; '
              'if(e.isComposing || app._ime) return; '
              'clearTimeout(app._st); app._st = setTimeout(render, 350); }\n});\n'
              'app.addEventListener("compositionstart", e => { if(e.target.id === "q-search") app._ime = true; });\n'
              'app.addEventListener("compositionend", e => { if(e.target.id === "q-search"){ app._ime = false; ui.search = e.target.value; clearTimeout(app._st); app._st = setTimeout(render, 120); } });')
rep(old_search, new_search)

# ---- 3. 指标计算题（U-C*）恢复为看答案自评：原始数据在周转图图片里，填空无意义 ----
m = re.search(r'(<script id="bank-data"[^>]*>)([\s\S]*?)(</script>)', s)
d = json.loads(m.group(2))
n_fix = 0
for q in d["q"]:
    if not q["i"].startswith("U-C"):
        continue
    stem = re.sub(r"\{\{blank:\d+\}\}", "", str(q.get("q", ""))).strip()
    if not stem.endswith(("。", "？", "！")):
        stem += "。"
    stem += "（本题需要按机车周转图原件的数据计算，原始图纸不在网页里；先按原件算出结果，再对照答案自评。）"
    q["k"] = "r"
    q["q"] = stem
    q["x"] = str(q.get("a", [""])[0] if q.get("a") else q.get("x", ""))
    q["_ask"] = stem.split("（本题需要")[0]
    q["nf"] = 1
    q.pop("_r", None)
    n_fix += 1
txt = json.dumps(d, ensure_ascii=False, separators=(",", ":"))
s = s[:m.start(2)] + txt + s[m.end(2):]

# ---- 4. asAnswerable 跳过 nf 标记的题 ----
rep('if(!q || q.k !== "r" || !rFillOn()) return q;',
    'if(!q || q.k !== "r" || !rFillOn() || q.nf) return q;')

# ---- 5. 版本 v10-r2 ----
rep('const APP_VERSION = "shiguang-unified-20261123-v10";',
    'const APP_VERSION = "shiguang-unified-20261123-v10-r2";')

open(P, "w", encoding="utf-8", newline="\n").write(s)
print("index.html ok; metric fixed:", n_fix, "; len", orig_len, "->", len(s))

# ---- sw.js ----
sw = ROOT + "sw.js"
t = open(sw, encoding="utf-8").read()
t = t.replace("jdbg-app-shiguang-unified-20261123-v10", "jdbg-app-shiguang-unified-20261123-v10-r2")
t = t.replace("shiguang-unified-20261123-v10\"", "shiguang-unified-20261123-v10-r2\"")
open(sw, "w", encoding="utf-8", newline="\n").write(t)
print("sw.js ok")
