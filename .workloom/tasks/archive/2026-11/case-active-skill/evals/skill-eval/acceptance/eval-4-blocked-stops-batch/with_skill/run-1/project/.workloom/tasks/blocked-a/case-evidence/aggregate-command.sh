#!/usr/bin/env bash
# 已确认 CASE（.workloom/tasks/blocked-a/case.md）的 Coverage 段 Aggregate command，逐字复制。
# 用途：CASE 未列出独立可执行脚本，Standard Verification 需要一条可直接运行的命令。
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
node -e 'const fs=require("node:fs");const t=JSON.parse(fs.readFileSync(".workloom/tasks/blocked-a/task.json","utf8"));if(t.id!=="blocked-a-id"||t.mode!=="full"||t.status!=="in_progress")throw new Error("task.json 字段不符");if(typeof t.alignment?.passedAt!=="string"||!/^[0-9a-f]{64}$/.test(t.alignment.prdHash||""))throw new Error("对齐记录缺失");console.log("task.json ok")'
test "$(sha256sum .workloom/tasks/blocked-a/prd.md | cut -d" " -f1)" = "$(node -p 'JSON.parse(require("node:fs").readFileSync(".workloom/tasks/blocked-a/task.json","utf8")).alignment.prdHash')"
for s in "## Goal" "## Requirements" "## Acceptance Criteria" "## Notes" "## Alignment Decisions"; do grep -qF "$s" .workloom/tasks/blocked-a/prd.md || exit 1; done
grep -qE '^- R1:' .workloom/tasks/blocked-a/prd.md
grep -qE '^- R2:' .workloom/tasks/blocked-a/prd.md
grep -qE '^- AC1:.*Covers R1' .workloom/tasks/blocked-a/prd.md
grep -qE '^- AC2:.*Covers R2' .workloom/tasks/blocked-a/prd.md
grep -qF "<!-- workloom:open-nodes=none -->" .workloom/tasks/blocked-a/prd.md
grep -qF "Covers: AC1, AC2" .workloom/tasks/blocked-a/plan.md
grep -qF "Edit: no product code" .workloom/tasks/blocked-a/plan.md
node -e 'const fs=require("node:fs");const ls=fs.readFileSync(".workloom/tasks/blocked-a/check.jsonl","utf8").split("\n").filter(l=>l.trim());if(ls.length===0)throw new Error("check.jsonl 为空");for(const l of ls){const e=JSON.parse(l);if(!e.file||!fs.existsSync(e.file)||fs.statSync(e.file).size===0)throw new Error("引用缺失或为空:"+e.file)}console.log("check.jsonl ok")'
test -s .workloom/spec/README.md
test -z "$(git ls-files -- '*.ts' '*.js' '*.mjs' '*.cjs')"
echo "aggregate materials ok"
