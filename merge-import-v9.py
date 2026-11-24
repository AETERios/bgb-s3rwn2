#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 import-2026-11.json 合并进 index.html 的题库与范围数据。

- 只追加题与范围条目，不改动任何既有题目的题干、选项、答案、原文
- 新题统一标为 pending（待核），保留提示，不假装已核对归属
- 可重复执行：已存在的 id 会跳过
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
INDEX = os.path.join(HERE, "index.html")
DATA = os.path.join(HERE, "import-2026-11.json")

BANK_OF_SRC = {"J1": "J", "J2": "J", "SG": "G"}
KIND_LABEL = {"c": "选择", "m": "多选", "j": "判断", "f": "填空", "r": "问答", "o": "排序"}
SRC_LABEL = {"J1": "技规题库", "J2": "技规原文", "SG": "事规题库", "DERIVED": "派生练习"}


def js_json(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def main():
    data = json.load(open(DATA, encoding="utf-8"))
    html = open(INDEX, encoding="utf-8").read()

    m = re.search(r'(<script id="bank-data" type="application/json">)(.*?)(</script>)', html, re.S)
    bank = json.loads(m.group(2))
    m2 = re.search(r'(<script id="scope-data" type="application/json">)(.*?)(</script>)', html, re.S)
    scope = json.loads(m2.group(2))

    have = {q["i"] for q in bank["q"]}
    have_scope = {e["id"] for e in scope["entries"]}

    # 按父题把派生的题插到原题后面，练习时先读原文再练变体
    derived_by_parent = {}
    for q in data["derivedQuestions"]:
        derived_by_parent.setdefault(q.get("p"), []).append(q)

    def shape(q):
        out = {"i": q["i"], "b": q["b"], "k": q["k"], "t": q.get("t") or "", "q": q["q"]}
        if q.get("o"):
            out["o"] = q["o"]
        if q.get("a") != "" and q.get("a") is not None:
            out["a"] = q["a"]
        if q.get("x"):
            out["x"] = q["x"]
        if q["k"] == "f":
            if q.get("clozeOrigin") == "source":
                out["clozeOrigin"] = "source"
            elif q.get("auto"):
                out["auto"] = 1
        if q.get("answerPending"):
            out["answerPending"] = True
            out["a"] = None
        if q.get("d"):
            out["d"] = 1
            out["p"] = q["p"]
        return out

    added, skipped = [], 0
    new_qs, new_order = [], []

    for q in data["questions"]:
        t = "%s·%s" % (SRC_LABEL.get(q["src"], q["src"]), KIND_LABEL.get(q["k"], q["k"]))
        q["t"] = t
        if q["i"] in have:
            skipped += 1
            continue
        obj = shape(q)
        new_qs.append(obj)
        new_order.append(obj["i"])
        added.append(obj)
        for dv in derived_by_parent.get(q["i"], []):
            if dv["i"] in have:
                continue
            dv["t"] = "%s·%s" % (SRC_LABEL["DERIVED"], KIND_LABEL.get(dv["k"], dv["k"]))
            obj2 = shape(dv)
            obj2["p"] = q["i"]
            new_qs.append(obj2)
            new_order.append(obj2["i"])
            added.append(obj2)

    # 父题不在本批（老题库问答）的派生题，排在本批末尾
    for dv in data["derivedQuestions"]:
        if dv["i"] in have or dv.get("p") in {q["i"] for q in data["questions"]}:
            continue
        dv["t"] = "%s·%s" % (SRC_LABEL["DERIVED"], KIND_LABEL.get(dv["k"], dv["k"]))
        obj = shape(dv)
        new_qs.append(obj)
        new_order.append(obj["i"])
        added.append(obj)

    # 范围条目：统一待核，写明来源
    import collections
    pending_before = scope["summary"].get("pending", 0)
    srcs = collections.Counter()
    for q in added:
        srcs[q["b"]] += 1
        if q["i"] not in have_scope:
            scope["entries"].append({
                "id": q["i"], "status": "pending", "subjects": [], "rule": "import-pending",
                "reason": "2026-11 由微信文件新导入（技规/事规），尚未逐条核对归属；可学并保留提示。",
                "evidenceLevel": "unresolved", "previousStatus": None,
                "answerVerification": "未核；沿用原文件答案",
                "versionVerification": "未核；未对照 2026 现行版本",
            })
            have_scope.add(q["i"])

    bank["q"].extend(new_qs)
    bank["order"].extend(new_order)
    scope["summary"]["pending"] = pending_before + len(added)
    scope["revision"] = "shiguang-import-20261123-v9"

    html = html[:m.start(2)] + js_json(bank) + html[m.end(2):]
    m2 = re.search(r'(<script id="scope-data" type="application/json">)(.*?)(</script>)', html, re.S)
    html = html[:m2.start(2)] + js_json(scope) + html[m2.end(2):]

    # 新增两个来源库
    old = 'const BANK_NAMES = {W:"新Word（机调）", N:"新增：背规100＋补充1＋技能认定", B:"2023背规（铁路技术管理规程）", P:"党建（含公共知识）", C:"2023竞赛（客观题、其他背规、指标计算）", O:"考试宝运用机考", S:"运用专业资料＋公开补充"};'
    new = 'const BANK_NAMES = {W:"新Word（机调）", N:"新增：背规100＋补充1＋技能认定", B:"2023背规（铁路技术管理规程）", P:"党建（含公共知识）", C:"2023竞赛（客观题、其他背规、指标计算）", O:"考试宝运用机考", S:"运用专业资料＋公开补充", J:"技规题库（2026-11）", G:"事规题库（2026-11）"};'
    assert old in html, "BANK_NAMES 未匹配"
    html = html.replace(old, new, 1)

    old = 'const BANK_SETS = {focus:["W","N","B","P"], all:["W","N","B","P","C","O","S"], W:["W"], N:["N"], B:["B"], P:["P"], C:["C"], O:["O"], S:["S"]};'
    new = 'const BANK_SETS = {focus:["W","N","B","P"], all:["W","N","B","P","C","O","S","J","G"], W:["W"], N:["N"], B:["B"], P:["P"], C:["C"], O:["O"], S:["S"], J:["J"], G:["G"]};'
    assert old in html, "BANK_SETS 未匹配"
    html = html.replace(old, new, 1)

    old = 'const BANK_LABEL = {professional:"专业规章", party:"党口与公共知识", all:"全部资料来源", focus:"资料组合：新Word＋新增＋背规＋党建", W:BANK_NAMES.W, N:BANK_NAMES.N, B:BANK_NAMES.B, P:BANK_NAMES.P, C:BANK_NAMES.C, O:BANK_NAMES.O, S:BANK_NAMES.S};'
    new = 'const BANK_LABEL = {professional:"专业规章", party:"党口与公共知识", all:"全部资料来源", focus:"资料组合：新Word＋新增＋背规＋党建", W:BANK_NAMES.W, N:BANK_NAMES.N, B:BANK_NAMES.B, P:BANK_NAMES.P, C:BANK_NAMES.C, O:BANK_NAMES.O, S:BANK_NAMES.S, J:BANK_NAMES.J, G:BANK_NAMES.G};'
    assert old in html, "BANK_LABEL 未匹配"
    html = html.replace(old, new, 1)

    open(INDEX, "w", encoding="utf-8").write(html)
    print("新增题目", len(added), "跳过", skipped)
    print("来源分布", dict(srcs))
    print("题库总数", len(bank["q"]), "顺序", len(bank["order"]))
    print("范围条目", len(scope["entries"]), "待核", scope["summary"]["pending"])
    print("题型", collections.Counter(q["k"] for q in added))


if __name__ == "__main__":
    main()
