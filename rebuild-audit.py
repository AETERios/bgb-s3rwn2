# -*- coding: utf-8 -*-
"""用 index.html 的 bank-data + scope-data 重建 audit/ 的索引与 CSV，保持列结构不变。"""
import json, re, csv, os

ROOT = r"C:/Users/eilot/Documents/Codex/2026-11-02/wo/work/bgb-s3rwn2"
html = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()


def block(tag):
    m = re.search(r'<script id="%s"[^>]*>([\s\S]*?)</script>' % tag, html)
    return json.loads(m.group(1))


bank = block("bank-data")
scope = block("scope-data")
qs = bank["q"]
qmap = {q["i"]: q for q in qs}
entries = scope["entries"]
emap = {e["id"]: e for e in entries}
print("questions", len(qs), "entries", len(entries))

LABELS = {
    "core": "已纳入", "pending": "归属待核",
    "content-classification": "公共知识归类",
    "original-citation": "原件标注，原文待核",
    "substantive-text-match": "历史原文实质匹配",
    "reviewed-attribution": "已复审归属",
    "unresolved": "待核",
}


def orig_no(qid):
    m = re.search(r"(\d+)$", qid)
    return str(int(m.group(1))) if m else ""


def citation_of(e):
    return e.get("originalCitation") or ""


rows = []
for q in qs:
    e = emap.get(q["i"], {})
    rows.append({
        "id": q["i"],
        "status": e.get("status", "pending"),
        "subjects": e.get("subjects") or [],
        "level": e.get("evidenceLevel") or e.get("rule") or "unresolved",
        "reason": e.get("reason", ""),
        "q": q.get("q", ""),
        "citation": citation_of(e),
        "bank": q.get("b", ""),
        "no": orig_no(q["i"]),
    })

# review-index.json：核对页原样消费这些字段
index = [{"id": r["id"], "status": r["status"], "subjects": r["subjects"], "level": r["level"],
          "reason": r["reason"], "q": r["q"], "citation": r["citation"]} for r in rows]
with open(os.path.join(ROOT, "audit", "review-index.json"), "w", encoding="utf-8") as f:
    json.dump(index, f, ensure_ascii=False, separators=(",", ":"))

HEAD = ["原编号", "来源库", "原题号", "去留", "科目", "证据级别", "题干", "原题出处", "理由", "证据", "答案核对", "版本核对"]
ANS = "未在本轮核实，保留原答案及既有独立订正"
VER = "未全面核实2026现行修订"


def write_csv(name, subset):
    p = os.path.join(ROOT, "audit", name)
    with open(p, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(HEAD)
        for r in subset:
            w.writerow([
                r["id"], r["bank"], r["no"], r["status"], "；".join(r["subjects"]), r["level"],
                r["q"], r["citation"], r["reason"],
                ("原件标注：" + r["citation"]) if r["citation"] else "",
                ANS, VER,
            ])
    print(name, len(subset))


write_csv("逐题去留.csv", rows)
write_csv("待核.csv", [r for r in rows if r["status"] == "pending"])
write_csv("公共知识.csv", [r for r in rows if "party" in r["subjects"]])

summary = {}
for r in rows:
    summary[r["status"]] = summary.get(r["status"], 0) + 1
print("status summary", summary)
print("total", len(rows))
