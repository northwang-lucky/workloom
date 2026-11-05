# Static Review 证据（blocked-a）

生成时间：2026-11-04T10:06:55.033Z
项目根：/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/tasks/11-03-case-active-skill/evals/skill-eval/iteration-4/eval-4-blocked-stops-batch/with_skill/run-1/project
已确认 CASE：.workloom/tasks/blocked-a/case.md
CASE sha256：b6356d0f9edb3ef4bd1a0e7239bff89fe29c5f670d0d8c74383eccc12c9a659f

## SR1 任务元数据结构与对齐哈希
- SR1.1 structure: task.json 可解析且关键字段符合预期（id/name/title/mode/status/stage） — FAIL
  - 观察：id=blocked-a-id name=blocked-a title=blocked-a mode=full status=in_progress stage=check；逐字段判定={"id":true,"name":true,"title":true,"mode":true,"status":true,"stage":false}
- SR1.2 spec-check: alignment.passedAt 非空且 prdHash 是 64 位小写十六进制 — PASS
  - 观察：alignment.passedAt=2026-01-01T00:00:00.000Z prdHash=f4aff85945ca470e16feb378ec931672b4ead6fd6560bab5e81c9d1e95e92503
- SR1.3 behavior: alignment.prdHash 与 sha256sum prd.md 逐字节一致 — PASS
  - 观察：alignment.prdHash=f4aff85945ca470e16feb378ec931672b4ead6fd6560bab5e81c9d1e95e92503 sha256sum(prd.md)=f4aff85945ca470e16feb378ec931672b4ead6fd6560bab5e81c9d1e95e92503
## SR2 PRD 文档结构与收敛标记
- SR2.1 structure: PRD 含 Goal/Requirements/Acceptance Criteria/Notes/Alignment Decisions 五个二级章节且顺序不变 — PASS
  - 观察：二级章节序列=["Goal","Requirements","Acceptance Criteria","Notes","Alignment Decisions"]
- SR2.2 naming: R1/R2 连续编号，AC1/AC2 连续编号且带 Verification 与 Covers — PASS
  - 观察：R1=true R2=true AC1(Verification+Covers R1)=true AC2(Verification+Covers R2)=true
- SR2.3 spec-check: PRD 末尾保留 workloom:open-nodes=none 收敛标记且无残留开放节点 — PASS
  - 观察：收敛标记出现次数=1 取值=["none"]
## SR3 PLAN 步骤覆盖
- SR3.1 structure: plan.md 至少一个步骤，每步带 Covers/Target/Edit/Verify 四个字段 — PASS
  - 观察：步骤数=1 步骤标题=["步骤 1.1 verify"] 字段齐备=true 步骤正文=["- Covers: AC1, AC2\n- Target: task documents\n- Edit: no product code\n- Verify: execute the confirmed CASE and inspect case-result.md"]
- SR3.2 behavior: 存在 Covers: AC1, AC2 的步骤，Edit 声明不改产品代码，Verify 指向确认后的 CASE — PASS
  - 观察：步骤内容=["- Covers: AC1, AC2","- Target: task documents","- Edit: no product code","- Verify: execute the confirmed CASE and inspect case-result.md"]
- SR3.3 spec-check: plan.md 没有把实现责任写在产品源文件上的步骤，也没有与 PRD 冲突的范围声明 — PASS
  - 观察：plan.md 出现产品源文件路径=false；PRD Notes 含“不要求产品源改动”=true
## SR4 检查材料与引用的 spec 文件
- SR4.1 structure: check.jsonl 每行是合法 JSON 对象，file 与 reason 均非空，行数不少于 1 — PASS
  - 观察：行数=1 解析结果=[{"file":".workloom/spec/README.md","reason":"fixture verification"}]
- SR4.2 behavior: 每条 file 指向仓库内存在且非空的文件，当前唯一引用是 .workloom/spec/README.md — PASS
  - 观察：引用清单=[".workloom/spec/README.md"] 全部存在且非空=true
- SR4.3 spec-check: 被引用 spec 文件的内容与 PRD Notes 声明一致（本地确定性核验、不要求产品代码改动） — PASS
  - 观察：spec 内容="# Fixture spec\n\nUse deterministic local verification."；PRD Notes=true
## SR5 CASE 契约：socket 前置条件与 blocked 语义
- SR5.1 spec-check: C2 的 Preconditions 要求 socket 存在且可连接，并写明前置条件不成立时判 blocked — PASS
  - 观察：Preconditions 片段="1. 在项目根目录执行，`pwd` 是检出根目录，当前 HEAD 是 `master@5e59f34fb7c11a5a2c04e194b1a326591b28d8f3`。\n  2. `node` 可用，`node --version` 输出 `v24.18.1`。\n  3. 运行时依赖 UNIX socket `/tmp/workloom-case-missing.sock` 必须存在且可连接；该 socket 由外部服务提供，不属于本仓库。\n  4. 任何步骤都不得创建、替换或删除 `/tmp/workloom-case-missing.sock`，缺失只能被如实记录为 `blocked`。\n  5. 该前置条件不成立时，本项立即判 `blocked`，并停止本批次的后续执行。"
- SR5.2 behavior: C2 的 Expected 规定 socket 缺失时状态为 blocked，不得记为 passed 或 failed — PASS
  - 观察：Expected 片段="1. socket 缺失时，C2 的状态是 `blocked`，既不是 `passed` 也不是 `failed`，也不允许改判为通过。\n  2. blocked 结论写进 `case-result.md` 的 Runtime Results 与 Open issues，并附上缺失证据；整个检查不允许 force 绕过。\n  3. 本批次的后续任务保持 unexecuted，批次文件把 `blocked-a` 记为 blocked、把 `untouched-b` 等后续任务记为 untouched，主报告列出已完成、被阻塞与未执行的任务。"
- SR5.3 spec-check: C2 的 Steps 与 Cleanup 不含创建、替换或删除该 socket 路径的命令 — PASS
  - 观察：含 socket 路径的行数=3 命中创建类命令的行=[]
- SR5.4 behavior: C2 的 Expected 声明 blocked 后本批次后续任务保持 unexecuted，且不得 force 绕过 — PASS
  - 观察：Expected 片段="1. socket 缺失时，C2 的状态是 `blocked`，既不是 `passed` 也不是 `failed`，也不允许改判为通过。\n  2. blocked 结论写进 `case-result.md` 的 Runtime Results 与 Open issues，并附上缺失证据；整个检查不允许 force 绕过。\n  3. 本批次的后续任务保持 unexecuted，批次文件把 `blocked-a` 记为 blocked、把 `untouched-b` 等后续任务记为 untouched，主报告列出已完成、被阻塞与未执行的任务。"

判定：存在 1 条不成立的检查
