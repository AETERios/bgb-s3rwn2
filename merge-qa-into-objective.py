# -*- coding: utf-8 -*-
"""把问答题并入客观题：有派生题的删掉问答本身，没有的就地转成原文填空。

只改 index.html 里的 bank-data / scope-data 两个 JSON 块，不动其它代码。
"""
import json
import re
import shutil
import sys
import time

P = r"C:/Users/eilot/Documents/Codex/2026-11-02/wo/work/bgb-s3rwn2/index.html"


def read_block(html, name):
    m = re.search(r"(<script id=\"%s\"[^>]*>)([\s\S]*?)(</script>)" % name, html)
    if not m:
        raise SystemExit("block not found: " + name)
    return m, json.loads(m.group(2))


def write_block(html, m, obj):
    txt = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    return html[:m.start(2)] + txt + html[m.end(2):]


def key_span(text):
    """复现前端 rKeySpan：取 6-20 字的完整分句，取最长的一个。"""
    if not text or len(text) < 12:
        return None
    start = 0
    for _ in range(4):
        if start >= len(text):
            break
        end = len(text)
        for i in range(start, len(text)):
            if text[i] in "。；;！!？?\n":
                end = i + 1
                break
        sent = text[start:end]
        cands = []
        off = 0
        for part in re.split(r"([，,、：:])", sent):
            if not re.fullmatch(r"[，,、：:]", part):
                lead = len(part) - len(part.lstrip())
                tail = len(part.rstrip())
                core = re.sub(r"[。；;！!？?\s]", "", part)
                if 6 <= len(core) <= 20:
                    cands.append((start + off + lead, start + off + tail))
            off += len(part)
        if cands:
            cands.sort(key=lambda x: -(x[1] - x[0]))
            return cands[0]
        start = end
    s0 = len(text) - len(text.lstrip())
    body = text.strip()
    return (s0, s0 + len(body)) if body else None


def main():
    html = open(P, encoding="utf-8").read()
    bm, bank = read_block(html, "bank-data")
    sm, scope = read_block(html, "scope-data")

    qs = bank["q"]
    order = bank["order"]
    dup = bank.get("dup") or {}

    derived = [q for q in qs if q.get("d") and q.get("p")]
    parents = {}
    for d in derived:
        parents.setdefault(d["p"], []).append(d)

    rs = [q for q in qs if q.get("k") == "r"]
    drop = [q for q in rs if q["i"] in parents]
    conv = [q for q in rs if q["i"] not in parents]

    drop_ids = {q["i"] for q in drop}
    converted = 0
    skipped = []
    for q in conv:
        text = str(q.get("x") or "").strip()
        sp = key_span(text)
        if sp:
            s, e = sp
            answer = text[s:e]
            if answer:
                q["_ask"] = q.get("q", "")
                q["q"] = text[:s] + "{{blank:1}}" + text[e:]
                q["a"] = [answer]
                q["k"] = "f"
                q["_r"] = 1
                converted += 1
                continue
        # 没有成段原文：从题干或短答案里就地造一个空
        stem = str(q.get("q") or "")
        short = text
        if not short:
            skipped.append(q["i"])
            continue
        hit = stem.find(short)
        if hit >= 0:
            q["q"] = stem[:hit] + "{{blank:1}}" + stem[hit + len(short):]
        else:
            m = re.search(r"[(（]\s*[)）]", stem)
            if m:
                q["q"] = stem[:m.start()] + "{{blank:1}}" + stem[m.end():]
            else:
                q["q"] = stem + "{{blank:1}}"
        q["a"] = [short]
        q["k"] = "f"
        q["_r"] = 1
        converted += 1

    keep = [q for q in qs if q["i"] not in drop_ids]
    new_order = [i for i in order if i not in drop_ids]
    new_dup = {k: v for k, v in dup.items() if k not in drop_ids and v not in drop_ids}

    bank["q"] = keep
    bank["order"] = new_order
    bank["dup"] = new_dup

    entries = scope["entries"]
    before = len(entries)
    scope["entries"] = [e for e in entries if e.get("id") not in drop_ids]
    scope["revision"] = "shiguang-unified-20261123-v10"

    html = write_block(html, bm, bank)
    sm2 = re.search(r"(<script id=\"scope-data\"[^>]*>)([\s\S]*?)(</script>)", html)
    html = write_block(html, sm2, scope)

    bak = P + ".v9.bak"
    if not __import__("os").path.exists(bak):
        shutil.copy2(P, bak)
    open(P, "w", encoding="utf-8", newline="\n").write(html)

    print(json.dumps({
        "r_before": len(rs),
        "dropped_with_derived": len(drop),
        "converted_in_place": converted,
        "skipped_no_text": skipped,
        "questions_before": len(qs),
        "questions_after": len(keep),
        "order_after": len(new_order),
        "scope_entries_before": before,
        "scope_entries_after": len(scope["entries"]),
        "r_kind_left": sum(1 for q in keep if q.get("k") == "r"),
        "derived_left": sum(1 for q in keep if q.get("d")),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
