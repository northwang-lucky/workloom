#!/usr/bin/env python3
"""容器最终验收 C1：逐项解析三个已归档子任务的 task.json 与 case-result.md 并断言。

只读执行：不修改任何归档记录；证据写入容器任务目录 case-evidence/。
断言覆盖 CASE 的 SR1–SR3 静态项与 C1 全部步骤。
"""

import hashlib
import json
import subprocess
from pathlib import Path

MAIN = Path("/data00/home/wangyubo.1219/workbench/code-src/github/workloom")
ARCHIVE = MAIN / ".workloom/tasks/archive/2026-11"
EVIDENCE = MAIN / ".workloom/tasks/11-06-document-confirmation-and-prd-overhaul/case-evidence"

# task.children 顺序与各子任务的期望交付常量（设计期已核验的真实值）
CHILDREN = [
    {
        "declared": "tasks/11-06-simplify-document-confirmations",
        "slug": "simplify-document-confirmations",
        "completedAt": "2026-11-06T02:41:49.872Z",
        "sr": "23/23",
        "c": "7/7; blocked: 0",
        "summaryKeyword": None,
        "planKeyword": None,
    },
    {
        "declared": "tasks/11-06-plan-pseudocode-standard",
        "slug": "plan-pseudocode-standard",
        "completedAt": "2026-11-06T04:36:00.822Z",
        "sr": "13/13",
        "c": "6/6; blocked: 0",
        "summaryKeyword": "伪代码",
        "planKeyword": "前置条件",
    },
    {
        "declared": "tasks/11-06-prd-industry-format-overhaul",
        "slug": "prd-industry-format-overhaul",
        "completedAt": "2026-11-06T07:26:22.858Z",
        "sr": "17/17",
        "c": "9/9; blocked: 0",
        "summaryKeyword": "PRD",
        "planKeyword": "结构",
    },
]


def normalized_sha256(data: bytes) -> str:
    """规范化 CRLF/CR 为 LF 后计算 SHA-256，与 core computeCaseHash 同规则。"""
    return hashlib.sha256(data.replace(b"\r\n", b"\n").replace(b"\r", b"\n")).hexdigest()


def sha256sum(path: Path) -> str:
    out = subprocess.run(["sha256sum", str(path)], capture_output=True, text=True, check=True)
    return out.stdout.strip()


def parse_front_matter(text: str) -> dict:
    """解析 case-result.md 的 YAML front-matter 键值。"""
    meta = {}
    if not text.startswith("---"):
        return meta
    end = text.find("\n---", 3)
    for line in text[3:end].strip().splitlines():
        if ":" in line:
            key, _, value = line.partition(":")
            meta[key.strip()] = value.strip()
    return meta


def section(text: str, heading: str) -> str:
    """截取二级标题小节正文。"""
    marker = f"## {heading}"
    start = text.find(marker)
    if start < 0:
        return ""
    rest = text[start + len(marker):]
    nxt = rest.find("\n## ")
    return rest[:nxt] if nxt >= 0 else rest


def summary_field(summary_text: str, field: str) -> str:
    prefix = f"- {field}: "
    for line in summary_text.splitlines():
        if line.startswith(prefix):
            return line[len(prefix):].strip().strip("`")
    return ""


def assert_field(cond: bool, message: str, failures: list) -> None:
    if not cond:
        failures.append(message)


def verify_child(child: dict, failures: list) -> dict:
    """逐项断言单个子任务的归档记录，返回结构化核对结果。"""
    d = ARCHIVE / child["slug"]
    tj = json.loads((d / "task.json").read_text(encoding="utf-8"))
    result_text = (d / "case-result.md").read_text(encoding="utf-8")
    case_bytes = (d / "case.md").read_bytes()
    result_bytes = (d / "case-result.md").read_bytes()

    # SR1–SR3 / C1 步骤 1：task.json 状态、检查与 CASE 结果记录
    assert_field(tj["status"] == "completed", f"{child['slug']}: status != completed", failures)
    assert_field(tj["completedAt"] == child["completedAt"], f"{child['slug']}: completedAt 不符", failures)
    check = tj.get("check") or {}
    assert_field(bool(check.get("passedAt")), f"{child['slug']}: check.passedAt 缺失", failures)
    assert_field(bool(str(check.get("summary") or "").strip()), f"{child['slug']}: check.summary 缺失", failures)
    case = tj.get("case") or {}
    assert_field(case.get("required") is True, f"{child['slug']}: case.required != true", failures)
    result = case.get("result") or {}
    assert_field(bool(result), f"{child['slug']}: case.result 缺失", failures)
    assert_field(
        result.get("passedAt") == check.get("passedAt"),
        f"{child['slug']}: case.result.passedAt 与 check.passedAt 不一致",
        failures,
    )
    assert_field(
        case.get("caseHash") == result.get("caseHash") and bool(case.get("caseHash")),
        f"{child['slug']}: caseHash 与 result.caseHash 不一致",
        failures,
    )
    # SR2/SR3 检查 5：交付内容在 check.summary 与归档 plan.md 可定位（SR1 无此检查项）
    if child.get("summaryKeyword"):
        assert_field(
            child["summaryKeyword"] in str(check.get("summary") or ""),
            f"{child['slug']}: check.summary 缺少交付关键词",
            failures,
        )
    if child.get("planKeyword"):
        plan_text = (d / "plan.md").read_text(encoding="utf-8")
        assert_field(child["planKeyword"] in plan_text, f"{child['slug']}: 归档 plan.md 缺少交付关键词", failures)

    # C1 步骤 2：case-result front-matter 与 Summary 计数
    meta = parse_front_matter(result_text)
    assert_field(meta.get("status") == "passed", f"{child['slug']}: result status != passed", failures)
    assert_field(
        meta.get("caseHash") == case.get("caseHash"),
        f"{child['slug']}: result front-matter caseHash 与 task.json 不一致",
        failures,
    )
    summary = section(result_text, "Summary")
    assert_field(summary_field(summary, "Static review") == child["sr"], f"{child['slug']}: SR 计数不符", failures)
    assert_field(summary_field(summary, "Runtime cases") == child["c"], f"{child['slug']}: C 计数不符", failures)
    assert_field(summary_field(summary, "Coverage") == "generated", f"{child['slug']}: Coverage 非 generated", failures)
    assert_field(
        summary_field(summary, "Standard verification") == "passed",
        f"{child['slug']}: Standard verification 非 passed",
        failures,
    )

    # C1 步骤 3：Open issues 仅含 - none
    open_issues = section(result_text, "Open issues").strip()
    assert_field(open_issues == "- none", f"{child['slug']}: Open issues 非 - none", failures)

    # C1 步骤 4：sha256sum 与规范化摘要复核
    raw = {"case.md": sha256sum(d / "case.md"), "case-result.md": sha256sum(d / "case-result.md")}
    norm_case = normalized_sha256(case_bytes)
    norm_result = normalized_sha256(result_bytes)
    assert_field(norm_case == case.get("caseHash"), f"{child['slug']}: case.md 规范化摘要 != case.caseHash", failures)
    assert_field(
        norm_result == result.get("resultHash"),
        f"{child['slug']}: case-result.md 规范化摘要 != result.resultHash",
        failures,
    )

    # 旧宿主兼容字段仅记录，不作为失败依据（PRD Edge Cases）
    return {
        "declared": child["declared"],
        "slug": child["slug"],
        "status": tj["status"],
        "completedAt": tj["completedAt"],
        "checkPassedAt": check.get("passedAt"),
        "checkSummary": check.get("summary"),
        "caseRequired": case.get("required"),
        "caseConfirmedAt": case.get("confirmedAt"),
        "legacyCompatFields": {
            "caseHash": case.get("caseHash"),
            "confirmedAtPresent": case.get("confirmedAt") is not None,
            "overridesCount": len(tj.get("overrides") or []),
        },
        "resultStatus": meta.get("status"),
        "resultCaseHash": meta.get("caseHash"),
        "summaryCounts": {
            "staticReview": summary_field(summary, "Static review"),
            "runtimeCases": summary_field(summary, "Runtime cases"),
            "coverage": summary_field(summary, "Coverage"),
            "standardVerification": summary_field(summary, "Standard verification"),
        },
        "openIssues": open_issues,
        "sha256sum": raw,
        "normalized": {"case.md": norm_case, "case-result.md": norm_result},
        "hashMatch": {"caseHash": norm_case == case.get("caseHash"), "resultHash": norm_result == result.get("resultHash")},
    }


def main() -> int:
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    failures: list = []
    records = [verify_child(child, failures) for child in CHILDREN]

    # SR4 时间顺序：completedAt 与 task.children 顺序一致
    times = [r["completedAt"] for r in records]
    assert_field(times == sorted(times), "completedAt 顺序与 task.children 不一致", failures)

    (EVIDENCE / "c1-child-records.json").write_text(
        json.dumps({"children": records, "failures": failures}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    hash_lines = ["# C1 步骤 4：sha256sum 与规范化 SHA-256 复核"]
    for r in records:
        hash_lines.append(f"## {r['slug']}")
        hash_lines.append(f"sha256sum case.md       = {r['sha256sum']['case.md']}")
        hash_lines.append(f"sha256sum case-result   = {r['sha256sum']['case-result.md']}")
        hash_lines.append(f"normalized case.md      = {r['normalized']['case.md']}（== task.case.caseHash: {r['hashMatch']['caseHash']}）")
        hash_lines.append(
            f"normalized case-result  = {r['normalized']['case-result.md']}（== task.case.result.resultHash: {r['hashMatch']['resultHash']}）"
        )
    (EVIDENCE / "c1-hash-check.txt").write_text("\n".join(hash_lines) + "\n", encoding="utf-8")

    lines = [
        "# C1 汇总",
        f"- 核对子任务数: {len(records)}",
    ]
    for r in records:
        lines.append(
            f"- {r['slug']}: status={r['status']} check={r['checkPassedAt']} result={r['resultStatus']} "
            f"SR={r['summaryCounts']['staticReview']} C={r['summaryCounts']['runtimeCases']} "
            f"coverage={r['summaryCounts']['coverage']} verification={r['summaryCounts']['standardVerification']} "
            f"openIssues={'none' if r['openIssues'] == '- none' else r['openIssues']} "
            f"hashMatch={r['hashMatch']['caseHash'] and r['hashMatch']['resultHash']}"
        )
    lines.append(f"- 断言失败数: {len(failures)}")
    lines.append("- 结论: " + ("PASS — 三个子任务归档记录、检查、CASE 结果与摘要值全部一致" if not failures else "FAIL"))
    (EVIDENCE / "c1-summary.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")

    print("\n".join(lines))
    return 0 if not failures else 1


if __name__ == "__main__":
    sys_exit = main()
    raise SystemExit(sys_exit)
