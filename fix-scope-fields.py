# -*- coding: utf-8 -*-
"""为 v9 新导入的范围条目补齐 sourceMatches 等字段，保持结构一致。"""
import json, re, os

p = r"C:/Users/eilot/Documents/Codex/2026-11-02/wo/work/bgb-s3rwn2/index.html"
s = open(p, encoding="utf-8").read()

m = re.search(r'(<script id="scope-data"[^>]*>)([\s\S]*?)(</script>)', s)
data = json.loads(m.group(2))
entries = data["entries"]
print("entries", len(entries))

# 参考一个已有条目的字段集合
sample = next(e for e in entries if e.get("sourceMatches") is not None)
print("sample keys", sorted(sample.keys()))

fixed = 0
for e in entries:
    if not isinstance(e.get("sourceMatches"), list):
        e["sourceMatches"] = []
        fixed += 1
    e.setdefault("subjects", [])
    e.setdefault("notes", [])

print("filled sourceMatches:", fixed)
new_json = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
s2 = s[:m.start(2)] + new_json + s[m.end(2):]
open(p, "w", encoding="utf-8").write(s2)
print("written", len(s2))
