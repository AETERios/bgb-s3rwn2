# -*- coding: utf-8 -*-
"""依次运行全部本地验证脚本，汇总结果。"""
import subprocess, sys, os, time, json

ROOT = os.path.dirname(os.path.abspath(__file__))
NODE = r"C:\Users\eilot\.workbuddy\binaries\node\versions\22.22.2-3\node.exe"

SCRIPTS = [
    "verify-unified.cjs",
    "verify-cloze.cjs",
    "verify-focus.cjs",
    "verify-unlimited.cjs",
    "verify-feedback.cjs",
    "verify-design-v3.cjs",
    "verify-keyboard-ime.cjs",
    "verify-exam-scope.cjs",
    "verify-scope-v2.cjs",
    "verify-upgrade-scope.cjs",
]

results = []
for name in SCRIPTS:
    path = os.path.join(ROOT, name)
    if not os.path.exists(path):
        results.append({"script": name, "status": "MISSING", "code": None, "tail": ""})
        continue
    t0 = time.time()
    try:
        p = subprocess.run(
            [NODE, path],
            cwd=ROOT,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=420,
        )
        out = (p.stdout or "") + (p.stderr or "")
        results.append({
            "script": name,
            "status": "PASS" if p.returncode == 0 else "FAIL",
            "code": p.returncode,
            "sec": round(time.time() - t0, 1),
            "tail": out.strip().splitlines()[-8:],
        })
    except subprocess.TimeoutExpired:
        results.append({"script": name, "status": "TIMEOUT", "code": None, "sec": 420, "tail": ["运行超时"]})
    print("%-28s %s" % (name, results[-1]["status"]), flush=True)

with open(os.path.join(ROOT, "test-results", "verify-all-v10.json"), "w", encoding="utf-8") as f:
    json.dump(results, f, ensure_ascii=False, indent=2)

print("\n===== SUMMARY =====")
for r in results:
    print("%-28s %-8s %ss" % (r["script"], r["status"], r.get("sec", "-")))
    if r["status"] != "PASS":
        for line in r["tail"]:
            print("    " + line)
