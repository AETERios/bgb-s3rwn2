#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""2026-11 新题库导入：技规题库.docx / (技规)题库.docx / （事规题库）.xlsx

只读取原文件，不修改源文件；输出 import-2026-11.json 供 merge-import-v9.py 合并。
题型映射：单选 c / 多选 m / 判断 j / 填空 f / 问答 r / 排序 o（由问答派生）。
"""
import json, os, re, sys, zipfile, collections
from xml.etree import ElementTree as ET

SRC_DIR = r"C:\Users\eilot\Documents\xwechat_files\wxid_7vight14tejx22_e0e7\msg\file\2026-11"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "import-2026-11.json")

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
S = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"

CLEAN = [
    ("\u3000", " "), ("\xa0", " "), ("\t", " "), ("\r", ""), ("\u200b", ""),
    ("（", "("), ("）", ")"), ("％", "%"),
]


def clean(s):
    s = str(s or "")
    for a, b in CLEAN:
        s = s.replace(a, b)
    s = re.sub(r"[ ]{2,}", " ", s)
    s = re.sub(r"\(\s*\)", "()", s)          # “( )”“（  ）”统一成空位
    s = re.sub(r"\{\{\s*blank\s*:(\d+)\s*\}\}", r"{{blank://1}}", s)
    return s.strip()


def docx_texts(path):
    z = zipfile.ZipFile(path)
    root = ET.fromstring(z.read("word/document.xml"))
    body = root.find(W + "body")
    out = []
    for el in body:
        if el.tag == W + "p":
            t = clean("".join(n.text or "" for n in el.iter(W + "t")))
            if t:
                out.append(t)
        elif el.tag == W + "tbl":
            for tr in el.findall(W + "tr"):
                cells = [clean("".join(n.text or "" for n in tc.iter(W + "t"))) for tc in tr.findall(W + "tc")]
                cells = [c for c in cells if c]
                if cells:
                    out.append("\t".join(cells))
    return out


NUM = re.compile(r"^(\d{1,4})\s*[．.、]\s*")
OPT = re.compile(r"^([A-H])\s*[．.、]\s*(.*)$")
ANS = re.compile(r"^答案\s*[：:]\s*(.+)$")
EXP = re.compile(r"^解析\s*[：:]\s*(.*)$")
YES = {"对", "正确", "√", "是", "T", "true"}
NO = {"错", "错误", "×", "否", "F", "false"}


def split_opts(text):
    """把可能写在一行的 A．xx B．xx 拆开"""
    parts = re.split(r"(?=(?:^|[\s])[A-H]\s*[．.、])", text)
    return [p.strip() for p in parts if p.strip()]


def parse_docx(path, src, start_seq=1):
    lines = docx_texts(path)
    items, cur = [], None

    def flush():
        nonlocal cur
        if cur:
            items.append(cur)
        cur = None

    last_n = 0
    for raw in lines:
        line = raw
        m = NUM.match(line)
        if m:
            n = int(m.group(1))
            # 只有序号连续才是新题；解析里的 “1.” “2.” 属于上一题的说明
            fresh = cur is None or n == last_n + 1
            if fresh:
                flush()
                cur = {"src": src, "n": n, "stem": line[m.end():].strip(), "opts": [], "ans": "", "exp": ""}
                last_n = n
                continue
            if not cur["ans"]:
                cur["stem"] = (cur["stem"] + " " + line).strip()
            else:
                cur["exp"] = (cur["exp"] + " " + line).strip()
            continue
        if cur is None:
            continue
        o = OPT.match(line)
        if o and not cur["ans"]:
            cur["opts"].append(o.group(2).strip())
            continue
        a = ANS.match(line)
        if a:
            cur["ans"] = a.group(1).strip()
            continue
        e = EXP.match(line)
        if e:
            cur["exp"] = (cur["exp"] + " " + e.group(1)).strip()
            continue
        if not cur["ans"] and not cur["opts"]:
            cur["stem"] = (cur["stem"] + line).strip()
        elif cur["ans"]:
            cur["exp"] = (cur["exp"] + " " + line).strip()
        else:
            cur["opts"][-1] = (cur["opts"][-1] + " " + line).strip() if cur["opts"] else cur["stem"]
    flush()
    return items


def xlsx_rows(path, sheet="xl/worksheets/sheet1.xml"):
    z = zipfile.ZipFile(path)
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        r = ET.fromstring(z.read("xl/sharedStrings.xml"))
        for si in r.findall(S + "si"):
            shared.append(clean("".join(t.text or "" for t in si.iter(S + "t"))))
    root = ET.fromstring(z.read(sheet))
    rows = []
    for row in root.iter(S + "row"):
        vals = [""] * 20
        for c in row.findall(S + "c"):
            ref = c.get("r") or ""
            col = re.match(r"([A-Z]+)", ref)
            if not col:
                continue
            idx = 0
            for ch in col.group(1):
                idx = idx * 26 + (ord(ch) - 64)
            idx -= 1
            v = c.find(S + "v")
            if v is None:
                continue
            if c.get("t") == "s":
                vals[idx] = shared[int(v.text)] if v.text and int(v.text) < len(shared) else ""
            else:
                vals[idx] = clean(v.text or "")
        while vals and not vals[-1]:
            vals.pop()
        rows.append(vals)
    return rows


def parse_xlsx(path):
    rows = xlsx_rows(path)
    out = []
    for idx, r in enumerate(rows[2:], start=1):
        r = (r + [""] * 14)[:14]
        stem, kind = clean(r[0]), clean(r[1])
        if not stem or not kind:
            continue
        opts = [clean(x) for x in r[2:10] if clean(x)]
        ans = clean(r[10]) if kind != "简答题" else ""
        exp = clean(r[11])
        if kind == "简答题":
            body = " ".join(x for x in r[2:12] if clean(x) and clean(x) not in ("事规题库",))
            out.append({"src": "SG", "n": idx, "stem": stem, "opts": [], "ans": body, "exp": "", "kind": kind})
        else:
            out.append({"src": "SG", "n": idx, "stem": stem, "opts": opts, "ans": ans, "exp": exp, "kind": kind})
    return out


def norm_key(text):
    t = re.sub(r"\{\{blank:\d+\}\}", "", text or "")
    t = re.sub(r"[\s\u3000（）()【】\[\]、，。；：:,.?？!！\"'“”‘’·\-—_/\\|]+", "", t)
    return t.lower()


def to_question(raw):
    """把解析行转成题库对象；无法判断的返回 (None, 原因)"""
    stem = clean(raw["stem"])
    opts = [clean(o) for o in raw["opts"] if clean(o)]
    ans_raw = clean(raw["ans"])
    exp = clean(raw["exp"])
    if not stem:
        return None, "无题干"

    # 判断：只有对/错两个选项
    if len(opts) == 2 and opts[0] in YES | {"对"} and opts[1] in NO | {"错"}:
        val = 1 if ans_raw in YES or ans_raw.upper() == "A" else 0 if ans_raw in NO or ans_raw.upper() == "B" else None
        if val is None:
            return None, "判断题答案无法识别:" + ans_raw
        return {"k": "j", "q": stem, "a": val, "x": exp or ("正确。" if val else "错误。")}, ""

    # 选择题：有选项且答案像字母
    if opts:
        letters = re.sub(r"[^A-H]", "", ans_raw.upper())
        if letters:
            idx = sorted({ord(ch) - 65 for ch in letters})
            idx = [i for i in idx if i < len(opts)]
            if not idx:
                return None, "答案字母超出选项:" + ans_raw
            if len(idx) == 1:
                return {"k": "c", "q": stem, "o": opts, "a": idx[0], "x": exp}, ""
            return {"k": "m", "q": stem, "o": opts, "a": idx, "x": exp}, ""
        # 答案不是字母：按填空处理
        blanks = stem.count("()")
        if blanks == 1:
            q = stem.replace("()", "{{blank:1}}", 1)
            return {"k": "f", "q": q, "a": [ans_raw], "x": stem.replace("()", ans_raw), "auto": 1}, ""
        return None, "选择题答案既非字母也非单空"

    # 无选项
    if "()" in stem:
        blanks = stem.count("()")
        parts = [p.strip() for p in re.split(r"[、;；,]", ans_raw) if p.strip()] if ans_raw else []
        if blanks == 1 and parts:
            q = stem.replace("()", "{{blank:1}}", 1)
            return {"k": "f", "q": q, "a": [parts[0]], "x": stem.replace("()", parts[0]), "auto": 1}, ""
        if blanks > 1 and len(parts) == blanks:
            q, x = stem, stem
            for i, p in enumerate(parts, 1):
                q = q.replace("()", "{{blank:%d}}" % i, 1)
                x = x.replace("()", p, 1)
            return {"k": "f", "q": q, "a": parts, "x": x, "auto": 1}, ""
        if ans_raw:
            return {"k": "r", "q": stem, "x": ans_raw.replace("()", " ").strip()}, ""
        return None, "多空个数与答案不一致"

    if ans_raw:
        return {"k": "r", "q": stem, "x": ans_raw}, ""
    return None, "无答案"


def split_sentences(text):
    return [s for s in re.split(r"(?<=[。；！？])", text) if s.strip()]


NUM_UNIT = re.compile(r"\d+(?:\.\d+)?\s*(?:%|人|辆|台|组|米|m|公里|km|小时|分钟|分|秒|天|日|个月|年|次|条|处|个|倍|级|等|‰|万元|亿元|元)")
LEAD = re.compile(r"^\s*(?:\d{1,2}\s*[.、)）]|[（(]\d{1,2}[)）])\s*")


def strip_lead(t):
    return LEAD.sub("", clean(t))


def trim_tail(t):
    return strip_lead(t).rstrip("；;，,、 ")


def split_sentences(text):
    return [x for x in re.split(r"(?<=[。；！？])", text) if x.strip()]


def good_sentence(t, lo=12, hi=60):
    t = trim_tail(t)
    if not (lo <= len(t) <= hi):
        return ""
    if re.match(r"^[）)、，。；:：]", t):
        return ""
    if NUM_UNIT.match(t):
        return ""
    return t


def key_spans(text, limit=2):
    """优先数字+单位；没有数字时取“是指/为/包括”后的短语，遇到“的”就收"""
    spans = []
    for m in NUM_UNIT.finditer(text):
        spans.append((m.start(), m.end(), m.group(0).strip()))
        if len(spans) >= limit:
            break
    if not spans:
        m = re.search(r"(?:是指|系指|是|为|包括|分为|即)([^，。；、（）()]{4,10})", text)
        if m:
            phrase = m.group(1)
            cut = len(phrase)
            for ch in "的地得":
                i = phrase.find(ch)
                if i >= 4:
                    cut = min(cut, i + 1)
            phrase = phrase[:cut]
            if 5 <= len(phrase) <= 12 and not re.search(r"[0-9A-Za-z]", phrase[-1:]):
                spans.append((m.start(1), m.start(1) + len(phrase), phrase))
    return spans


def numbered_items(text):
    items = []
    for m in re.finditer(r"(?:^|[\s；;])(\d{1,2})\s*[.、)）]\s*([^0-9]{4,80}?)(?=(?:\s*\d{1,2}\s*[.、)）])|$)", text):
        t = trim_tail(m.group(2))
        if 6 <= len(t) <= 70:
            items.append((int(m.group(1)), t))
    items.sort()
    return [t for _, t in items]


def derive_from_answer(qid, q, sentences, wrong_num):
    """把问答/简答派生为填空、判断、多选、排序、选择；全部带 d=1 与 p=父题号。
    规则只使用原文真实句子和真实编号清单，不凭空编造选项。"""
    text = clean(q.get("x") or "")
    stem = clean(q.get("q") or "")
    out = []
    if len(text) < 12:
        return out
    body = text if len(text) <= 200 else "".join(split_sentences(text)[:2])

    # 1) 填空：原文挖 1-2 个关键空
    spans = key_spans(body)
    if spans:
        qtext, a, cursor = "", [], 0
        for i, (st, en, val) in enumerate(spans, 1):
            qtext += body[cursor:st] + "{{blank:%d}}" % i
            a.append(val)
            cursor = en
        qtext += body[cursor:]
        out.append({"k": "f", "q": qtext, "a": a, "x": text, "auto": 1, "d": 1, "p": qid, "t2": "派生填空"})

    sents = split_sentences(text)
    first = trim_tail(sents[0]) if sents else ""
    mnum = NUM_UNIT.search(first)

    # 2) 判断：原文首句含数字 → 真句 + 换数字的假句
    if mnum and 10 <= len(first) <= 120 and not LEAD.match(sents[0]):
        out.append({"k": "j", "q": first, "a": 1, "x": "正确。原文：" + text, "d": 1, "p": qid, "t2": "派生判断"})
        alt = wrong_num(mnum.group(0))
        if alt and alt != mnum.group(0):
            out.append({"k": "j", "q": first[:mnum.start()] + alt + first[mnum.end():], "a": 0,
                        "x": "错误。原文：" + text, "d": 1, "p": qid, "t2": "派生判断"})

    items = numbered_items(text)
    short = re.sub(r"^(请)?(写出|列出|简述|说明|叙述|回答)[:：]?\s*", "", stem)

    # 3) 排序：原文自带 1）2）3） 的清单
    if len(items) >= 3:
        steps = items[:5]
        out.append({"k": "o", "q": short + "（把顺序排对）", "o": steps, "a": list(range(len(steps))),
                    "x": text, "d": 1, "p": qid, "t2": "派生排序"})

    # 4) 多选：编号清单 ≥4 条，取 3 条真题 + 2 条他题同型条目
    if len(items) >= 4:
        right = items[:3]
        seen = {trim_tail(x) for x in right}
        wrong = [x for x in sentences if x not in seen][:2]
        if len(wrong) == 2:
            opts = right + wrong
            out.append({"k": "m", "q": short + "（选出原文包含的内容）", "o": opts,
                        "a": [0, 1, 2], "x": text, "d": 1, "p": qid, "t2": "派生多选"})

    # 5) 选择：定义类问答，首句以“系指/指/是/为/包括”开头，干扰项用同库同类首句
    if re.search(r"什么|哪些|定义|是指|含义|包括", stem) and re.match(r"^(系指|指|是|为|即|包括)", first):
        cand = [x for x in sentences if x != first]
        if len(cand) >= 3:
            opts = [first] + cand[:3]
            k = sum(ord(ch) for ch in qid) % 4
            opts[0], opts[k] = opts[k], opts[0]
            out.append({"k": "c", "q": stem + "（选出正确说法）", "o": opts, "a": k, "x": text,
                        "d": 1, "p": qid, "t2": "派生选择"})
    return out


def main():
    src_a = parse_docx(os.path.join(SRC_DIR, "技规题库.docx"), "J1")
    src_b = parse_docx(os.path.join(SRC_DIR, "(技规)题库.docx"), "J2")
    src_c = parse_xlsx(os.path.join(SRC_DIR, "（事规题库）.xlsx"))
    print("原始条数", len(src_a), len(src_b), len(src_c))

    buckets = collections.Counter()
    bad = []
    kept = []
    for src, raws, prefix in (("J1", src_a, "j1"), ("J2", src_b, "j2"), ("SG", src_c, "sg")):
        seq = 0
        for raw in raws:
            obj, why = to_question(raw)
            if not obj:
                bad.append((src, raw["n"], why, raw["stem"][:60]))
                continue
            seq += 1
            qid = "%s-%04d" % (prefix, seq)
            obj["i"] = qid
            obj["b"] = "J" if src != "SG" else "G"
            obj["src"] = src
            obj["srcNo"] = raw["n"]
            kept.append(obj)
            buckets[(src, obj["k"])] += 1

    print("解析成功", len(kept), "失败", len(bad))
    for k, v in sorted(buckets.items()):
        print("  ", k, v)
    print("失败样例：")
    for b in bad[:12]:
        print("   ", b)

    # 与现有题库去重
    import re as _re
    here = os.path.dirname(os.path.abspath(__file__))
    html = open(os.path.join(here, "index.html"), encoding="utf-8").read()
    m = _re.search(r'<script id="bank-data" type="application/json">(.*?)</script>', html, _re.S)
    old = json.loads(m.group(1))
    old_keys = {norm_key(q.get("q")) for q in old["q"]}
    old_keys |= {norm_key(q.get("x")) for q in old["q"] if q.get("x")}
    uniq, dup = [], 0
    local = set()
    for q in kept:
        k = norm_key(q.get("q"))
        if k in old_keys or k in local:
            dup += 1
            continue
        local.add(k)
        uniq.append(q)
    print("与现有题库/彼此去重后", len(uniq), "重复", dup)

    # 问答派生
    r_items = [q for q in uniq if q["k"] == "r"]
    pool_b = collections.defaultdict(list)
    for q in uniq:
        if q["k"] == "r":
            pool_b[q["b"]].append(clean(q.get("x")))
    all_clauses = [c for v in pool_b.values() for x in v for c in re.split(r"[；;]", x) if 8 <= len(c) <= 60]

    def wrong_num(s):
        mm = re.match(r"(\d+(?:\.\d+)?)(.*)", s)
        if not mm:
            return None
        v, unit = float(mm.group(1)), mm.group(2)
        for factor in (0.6, 1.5, 2, 0.5):
            nv = v * factor
            if nv != v and nv >= 1:
                nv = round(nv) if nv >= 10 else round(nv, 1)
                return "%s%s" % (("%g" % nv), unit)
        return None

    sent_by_bank = collections.defaultdict(list)
    for q in uniq:
        if q["k"] == "r" and clean(q.get("x")):
            ss = split_sentences(clean(q["x"]))
            t = good_sentence(ss[0]) if ss else ""
            if t:
                sent_by_bank[q["b"]].append(t)
    old_r = [q for q in old["q"] if q.get("k") == "r" and clean(q.get("x"))]
    for q in old_r:
        ss = split_sentences(clean(q["x"]))
        t = good_sentence(ss[0]) if ss else ""
        if t:
            sent_by_bank[q.get("b", "S")].append(t)
    for b in sent_by_bank:
        sent_by_bank[b] = list(dict.fromkeys(sent_by_bank[b]))

    derived = []
    for q in r_items:
        items = derive_from_answer(q["i"], q, sent_by_bank[q["b"]], wrong_num)
        for n, it in enumerate(items, 1):
            it["i"] = "%s-d%d" % (q["i"], n)
            it["b"] = q["b"]
            it["src"] = "DERIVED"
            it["srcNo"] = 0
            it["t2"] = "派生" + {"f": "填空", "j": "判断", "m": "多选", "o": "排序", "c": "选择"}[it["k"]]
            derived.append(it)
        buckets[("DERIVED", q["b"])] += 1

    # 现有题库里的问答也派生，编号 dv-xxxx，p 指向原题
    dv = 0
    for q in old_r:
        items = derive_from_answer(q["i"], q, sent_by_bank[q.get("b", "S")], wrong_num)
        for it in items:
            dv += 1
            it["i"] = "dv-%04d" % dv
            it["b"] = q.get("b", "S")
            it["src"] = "DERIVED"
            it["srcNo"] = 0
            it["p"] = q["i"]
            it["t2"] = "派生" + {"f": "填空", "j": "判断", "m": "多选", "o": "排序", "c": "选择"}[it["k"]]
            derived.append(it)
    print("老问答派生", dv)
    print("新导入问答派生", len(derived) - dv, "来自", len(r_items), "道问答；合计派生", len(derived))
    print("派生题型", collections.Counter(d["k"] for d in derived))

    data = {"source": "2026-11 微信文件：技规题库.docx / (技规)题库.docx / （事规题库）.xlsx",
            "parsed": len(kept), "deduped": len(uniq), "derived": len(derived),
            "questions": uniq, "derivedQuestions": derived,
            "failed": [{"src": s, "no": n, "why": w, "stem": t} for s, n, w, t in bad]}
    json.dump(data, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("写出", OUT)


if __name__ == "__main__":
    main()
