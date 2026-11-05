tasks/11-03-case-active-skill:mw0q7sphs7spkx2i

冲突说明（只陈述一次）：任务提示要求写入 `research/skill-active-evals.md`，执行器约定把写入范围限定在 `.workloom/`，因此本报告落在 `.workloom/tasks/11-03-case-active-skill/research/skill-active-evals.md`；另，任务当前处于 planning 且没有 `plan.md`（研究期尚未产出），本报告以 `prd.md` 与 `## Alignment Decisions` 为准。

# workloom-case-active 四场景对比验收：执行环境事实与落地配方

研究范围：本仓库的 CASE 主流程、双 adapter 与技能资产；本机的 skill-creator 工具链、Pi 与 DSH 运行入口；已归档的 alignment skill eval。全程只读，未修改实现代码；唯一写入是本文件与临时探针（已清理）。文中“已验证”指我实际读了源码或实际执行过命令；“未验证”会显式标注。

## 四场景能真实跑，但只能跑在顶层会话；当前机器上 Pi 与 DSH headless 都缺模型凭据

| 结论 | 依据 |
| --- | --- |
| `workloom_task_case` 是主会话专用工具，任何 delegation depth > 0 的子会话调用都会被硬拒绝 | `packages/adapter-dsh/src/tasks.ts:316-326` |
| `workloom_execute` 派发的 executor 子会话被限制为深度 1，且禁止再派发；因此 executor 子会话既不能确认 CASE，也不能再开 check 子会话 | `packages/adapter-dsh/src/executor.ts:392-397`、`packages/adapter-dsh/src/executor.ts:393-395` |
| 结论：四场景的每组 run 必须是一个顶层会话（depth 0），不能复用 `workloom_execute` 或普通 subagent 作为评测执行器（顶层派发的子代理深度为 1） | 由上两条直接推出；深度语义见 `packages/adapter-dsh/src/executor.ts:393-397` |

```ts
// packages/adapter-dsh/src/tasks.ts:320-325
if (agent !== undefined && delegationDepthOf(agent) > 0) {
  throw new Error(
    `${ERR_PREFIX.taskTool}: workloom_task_case can only be called from the main session ` +
      '(CASE confirm is a user decision)',
  )
}
```

当前两条 CLI 入口都不可用的实测结果：

1. Pi 没有可用模型。`pi --list-models` 输出 `No models available. Use /login...`；实际跑一次 `pi --no-session --no-skills --skill packages/assets/skills/workloom-alignment -e packages/adapter-pi/src/index.ts --mode json "Reply with exactly: OK"` 时，session header 正常产出，扩展加载阶段 stderr 没有报错，随后停在模型调用并报 `No API key found for the selected model.`（本机命令，未留仓内证据）。
2. DSH headless 没有凭据。`dsh --profile headless --json "Reply with exactly: OK"` 返回 `MISSING_CREDENTIAL: llm-deepseek: no API key for provider route "deepseek-official"`（本机命令）。headless profile 自身也只有 base/headless bundle，没有 workloom adapter：`~/.dsh/profiles/headless/package.json`（本机文件，未入库）。

因此本任务要交付 AC8 的真实对比，必须先解决“用哪个带凭据的顶层运行入口”，这是本报告的首要开放问题（见文末）。可选路线（建议，不是已验证事实）：

- A. Pi 顶层进程：`--no-skills` + `--skill <skill dir>` 可精确控制带技能/不带技能，且 `--session-id` 可做两阶段确认（详见后文命令）。
- B. DSH 自定义 profile：能保留主会话语义与原生派发，但需要用户安装 adapter 到新 profile、配置模型凭据并重启实例；部署规范明确 adapter-dsh 是宿主启动时读取的 bundle，改动需用户重启（`.workloom/spec/repo/deployment/index.md:8-10`）。
- C. 仅由当前 Web 主会话人工逐个跑：无法做到干净的“不带技能”对照，且一组场景就要占用主会话，只应作为兜底，不能当作 AC8 证据。

## evals.json 放技能目录，运行产物放任务目录：这是已归档 alignment eval 的真实约定

| 资产 | 路径 | 事实锚点 |
| --- | --- | --- |
| 技能自带的 eval 定义 | `packages/assets/skills/workloom-alignment/evals/evals.json`（新技能对应 `.../workloom-case-active/evals/evals.json`） | `packages/assets/skills/workloom-alignment/evals/evals.json:1-12` |
| 运行产物 | `.workloom/tasks/archive/2026-09/unify-workloom-alignment/evals/skill-eval/iteration-1/` | 该目录实存 `benchmark.json`、`benchmark.md`、六个 `eval-*/<config>/run-1/`、`reviewer.html` |
| Pi 构建副本 | `packages/adapter-pi/skills/<skill>/evals/evals.json` | `packages/adapter-pi/scripts/sync-skills.mjs:21-42` 整目录 `cpSync`；该目录被 gitignore（`packages/adapter-pi/.gitignore:1`） |
| DSH 注册清单 | `packages/adapter-dsh/src/skills.ts:50-59` 的 `SKILL_ASSETS` | 注册器只读 `SKILL.md`，不读 evals |
| evals.json 的测试消费者 | `packages/adapter-dsh/test/skills.test.js:239-252` | 该测试读取 alignment 的 `evals.json` 并断言 blocker 场景存在 |

仓库内 `evals.json` 的字段形状（字符串 `id` + `assertions`）与 skill-creator 的 `references/schemas.md` 略有出入：仓库实际用的是 `assertions`，`schemas.md:7-30` 写的是 `expectations`。按本仓库既有资产与 `packages/adapter-dsh/test/skills.test.js:239-252` 的消费方式，**以 `assertions` 为准**；`grading.json` 才是 viewer 强制 `text/passed/evidence` 的地方（`references/schemas.md:86-97`）。

新技能建议的目录形状：

```text
packages/assets/skills/workloom-case-active/
  SKILL.md
  evals/evals.json                      # 四个（建议五个）场景定义，英文
.workloom/tasks/11-03-case-active-skill/
  evals/skill-eval/
    fixtures/<scenario>/project/        # 可重复的夹具模板
    iteration-1/
      eval-0-planning-delayed/
        eval_metadata.json              # aggregate 读这一份
        with_skill/
          eval_metadata.json            # viewer 读 run 目录的父目录
          run-1/
            outputs/{transcript.md,task/...}
            grading.json
            timing.json
        without_skill/（同构）
      benchmark.json
      benchmark.md
      reviewer.html
      feedback.json                     # 用户评审后回填
```

## 运行目录必须同时满足两个消费者：eval 目录要 eval_metadata，配置目录也要一份

两个脚本的读取位置不同，这是最容易踩的布局坑：

- `scripts/aggregate_benchmark.py:79-104` 只在 `<iteration>/eval-*/eval_metadata.json` 找 `eval_id`，找不到就退回解析目录名第二段整数（`eval-0-...` 可解析，`eval-planning-...` 会退化成序号）。
- `eval-viewer/generate_review.py:85-107` 找 prompt 时读 `run_dir/eval_metadata.json` 或 `run_dir.parent/eval_metadata.json`，也就是 `with_skill/` 这一层；只放 eval 目录一层会导致 viewer 显示 `(No prompt found)`。
- `grading.json` 同理：`eval-viewer/generate_review.py:131-136` 读 run 目录或其父目录。

因此 `eval_metadata.json` 要放三处（内容相同）：eval 目录 + 每个配置目录。`eval_id` 用数字（viewer 排序会拿它和 `float("inf")` 比较），`eval_name` 用场景名：

```json
{
  "eval_id": 0,
  "eval_name": "planning-delayed-execution",
  "prompt": "Take this planning task through CASE design, then stop at its current stage.",
  "assertions": ["..."]
}
```

`grading.json` 的必备字段（viewer 依赖）：

```json
{
  "expectations": [
    { "text": "after confirmation the task stays in planning", "passed": true, "evidence": "task.json status=planning, stage=implement; no purpose=execution dispatch" }
  ],
  "summary": { "passed": 4, "failed": 0, "total": 4, "pass_rate": 1.0 },
  "observations": "..."
}
```

## 计时与 token 不要等子代理通知：Pi 的 JSONL 事件流里已有 usage 和时间戳

skill-creator 的流程假设“子会话完成任务时通知里带 `total_tokens` 与 `duration_ms`”（`SKILL.md:207-215`、`references/schemas.md:197-207`）。本仓库的 `workloom_execute` 回执只拼 childId、model/effort 与注入统计，不含 token 与耗时（`packages/adapter-dsh/src/executor-receipt.ts:56-61`）；DSH 的 session 记录我只解压检查了那份失败试跑会话，事件类型里没有 usage 字段，不能当作通用结论，需在真实 run 上复核。

1. Pi 用 `--mode json` 跑，stdout 是严格 JSONL（本机 Pi 安装目录的 `docs/json.md:1-30`）。
2. 每条 assistant `message_end` 都带 `usage`（本机 Pi 安装目录的 `docs/message-types.md:69-83`），`Usage.totalTokens` 是累计值；时间戳是毫秒。
3. 一次 run 结束后脚本汇总：`duration_ms = 最后 message_end.timestamp - session header.timestamp`，`total_tokens = 所有 assistant message 的 usage.totalTokens 之和`，写入 `run-1/timing.json`。

```json
{
  "total_tokens": 48211,
  "duration_ms": 183402,
  "total_duration_seconds": 183.4
}
```

聚合脚本的读取规则（`scripts/aggregate_benchmark.py:136-151`）：

- 先看 `grading.json` 的 `timing.total_duration_seconds`；
- 为 0 时才读同目录 `timing.json` 的 `total_duration_seconds` 和 `total_tokens`；
- token 为 0 时会把 `execution_metrics.output_chars` 当 token 填进去（`scripts/aggregate_benchmark.py:148-150`），这是字符数，不是 token。

建议：`grading.json` 里不要写 `timing` 块，统一让 `timing.json` 供数，避免 token 被 `output_chars` 冒名顶替。

## 聚合与静态页命令已验证可复现归档 reviewer.html，但脚本有四个占位值必须人工修正

已验证：用下列命令对归档 `iteration-1` 重新生成静态页，产物与仓库内 `reviewer.html` 字节完全相同（sha256 `e2d0a62e...7094`，153140 字节）：

```bash
python3 /data00/home/wangyubo.1219/.agents/skills/skill-creator/scripts/aggregate_benchmark.py \
  <task>/evals/skill-eval/iteration-1 \
  --skill-name workloom-case-active \
  --skill-path packages/assets/skills/workloom-case-active

python3 /data00/home/wangyubo.1219/.agents/skills/skill-creator/eval-viewer/generate_review.py \
  <task>/evals/skill-eval/iteration-1 \
  --skill-name workloom-case-active \
  --benchmark <task>/evals/skill-eval/iteration-1/benchmark.json \
  --static <task>/evals/skill-eval/iteration-1/reviewer.html
```

命令依据：`SKILL.md:229`、`SKILL.md:238-249`；`--static` 的语义是写出独立 HTML 而不是起服务，反馈由页面下载 `feedback.json`（`SKILL.md:247`、`eval-viewer/generate_review.py:387-420`）。

聚合脚本输出里必须人工修正的四个值（`scripts/aggregate_benchmark.py:264-275`）：

1. `metadata.skill_path` 缺省是 `<path/to/skill>`；
2. `metadata.executor_model` 与 `analyzer_model` 缺省是 `<model-name>`；
3. `metadata.runs_per_configuration` 硬编码为 `3`，与真实 run 数无关；
4. `notes` 为空，需要分析者写观察。

归档 `benchmark.json` 正是“脚本生成后人工修正”的样本：`skill_path` 写真实路径、模型写 `not recorded (read-only simulation runs)`、`runs_per_configuration` 改成 1、`notes` 五条（`.workloom/tasks/archive/2026-09/unify-workloom-alignment/evals/skill-eval/iteration-1/benchmark.json:3-16` 与 `:513-520`）。另外注意 aggregate 会直接覆写迭代目录里的 `benchmark.json/markdown`；不要对归档目录执行，除非确实要重生成。

## 既有 alignment eval 是只读模拟且 baseline 被判无效，四场景不能沿用它的证据强度

| 事实 | 锚点 |
| --- | --- |
| 六个行为场景的 run 是“只读行为模拟”，输出是计划动作而非真实任务改写 | `.workloom/tasks/archive/2026-09/unify-workloom-alignment/evals/skill-eval/iteration-1/benchmark.md:17` |
| 计时与 token 没有采集，0 不能当测量值 | 同文件 `:19` |
| 带技能与不带技能都 100%，该 eval 没有区分度；作者列出的改进方向是更具体的工具调用顺序与交互问题 | 同文件 `:21` |
| 归档任务的 check 结论明确写“行为 eval baseline 受 workloom 全局规则污染，判定为无效对照” | `.workloom/tasks/archive/2026-09/unify-workloom-alignment/task.json:27` |

这对新场景的直接约束：baseline 也会收到 workloom 工作流文本与全局规范（Pi 的注入在 `packages/adapter-pi/src/inject.ts:75-95`、`packages/adapter-pi/src/inject.ts:133-158`；CASE 主流程本身写在 `packages/assets/workflow/workflow.md:88-98`）。所以“会写 case.md、会调 workloom_task_case”这类通用步骤无法区分技能有无；断言必须落在技能新增的判断上：活跃任务与候选扫描、整批一次确认、按就绪状态延迟/立即执行、legacy 从 `case=null` 补写、blocked 暂停后续。

归档里另有一套 20 条 trigger 分类评测（`trigger-evals.json`、`trigger-runs/`、`trigger-results.json`，同目录），但它是逐条模型分类的产物，不是四个行为场景；skill-creator 的 `scripts/run_eval.py` 走 `claude -p`（本机 skill-creator 的 `scripts/run_eval.py:9-60`），本仓库目前没有对应的 worker。R12 只要求四个行为场景，trigger 集可以后补；若补，需要另建分类运行器并标注不同运行时（未验证）。

## 夹具来源：以 core 的 CASE 最小材料为模板，旧任务参照 2026-10 归档，已通过结果参照 2026-11 归档

最小可用材料已在 core 测试里成型，直接复用比改造真实归档任务更稳：

- PRD 最小形状：`packages/core/test/case.test.js:11-27`（H1 + Goal + Requirements + Acceptance Criteria + Notes）。
- CASE 最小形状（含 SR/C/Coverage/Traceability 与两组 AC）：`packages/core/test/case.test.js:29-120`。
- 夹具工程与任务目录：`packages/core/test/case.test.js:240-265`（`src/a.js`、`docs/guide.md`、`case-evidence/c1.txt`、`coverage/lcov.info`）。
- 最小合法 PLAN：`packages/core/test/case.test.js:288`；结构规则是 H1 + `## Steps` + `#### 步骤 X` 且每个步骤带 `Covers/Target/Edit/Verify`、覆盖 PRD 全部 AC（`packages/core/src/domain/task-gates.js:332-375`）。
- “已有通过结果”的真实样本：`.workloom/tasks/archive/2026-11/full-task-case-coverage/case.md`、`case-result.md` 与 `task.json:715-726` 的 `case.result` 记录（`caseHash` + `resultHash` + `passedAt`）。复制时要改写 front matter 的 `task:` 为新路径，并把 30+ 个 SR/C 项裁剪到 1-2 项，否则一次执行轮会非常长。
- “旧任务”的真实样本：`.workloom/tasks/archive/2026-10/review-executor/task.json` 没有 `case` 键（`grep '"case"'` 为 0），但 `worktree_path` 非空、`check` 已有值；复制后要清空 `worktree_path`、删除 `completedAt` 与 `check`，再把 `status` 改成 `in_progress`。

夹具工程配方（每个场景一份，复制到 gitignored 的 `.workloom/.runtime/eval/<run-id>/project` 再跑；`.workloom/.gitignore:2` 已忽略 `.runtime/`）：

1. `git init` + 一次初始提交（空骨架），让“实施改动”保持未提交；CASE 的文件范围取 `git diff HEAD` + `git ls-files --others`（`packages/core/src/domain/git.js:59-61`、`:152-165`）。
2. `.workloom/config.json` 固定 subagents 的 model/effort 与 `rotate_on_busy: false`（并清空或固定 `subagent_profiles`）；否则本机全局层 `~/.workloom/config.json`（本机文件，未入库）会参与模型选择，把 check 派发切到 deepseek/kimi/glm 等不同模型（全局层合并见 `packages/core/src/domain/config.js:176-198`），两组对照就不可比。
3. 任务目录 `.workloom/tasks/<MM-DD-slug>/` 放 `prd.md`、`plan.md`、`check.jsonl`、`task.json`；task.json 缺字段会被读取归一化补默认（`packages/core/src/domain/task-store.js:257-300`），但 `status`、`mode`、`title`、`name` 必须显式给出。
4. 需要“活跃任务”时，预置会话指针 `.workloom/.runtime/sessions/pi_<session-id>.json`（路径拼接见 `packages/core/src/domain/active-task.js:205-212`；contextKey 规则见 `packages/adapter-pi/src/constants.ts:9-24`）。Pi 用 `--session-id <id>` 可让这个 id 确定下来（本机 Pi docs/cli.md:92-93）。
5. `task.json.worktree_path` 必须为空串。归档任务的 worktree 已删除，直接用会让 CASE 校验走 `gitChangedFilesSync` 得到 `spawnSync git ENOENT`（我实测 `evaluateCaseOutcomeGate` 返回该错误；相关读取在 `packages/core/src/domain/case.js:459-467`）。可对照的真实空值样例：`.workloom/tasks/archive/2026-09/unify-workloom-alignment/task.json:21`；2026-10 的归档任务普遍仍记录 worktree 路径（如 `.workloom/tasks/archive/2026-10/review-executor/task.json:22`），复制后要清空。
6. CASE 的 front matter `task:` 必须等于夹具任务相对路径，否则 review 返回 `task_mismatch`（`packages/core/src/domain/case.js:393-398`）；我实测把归档 CASE 按原路径校验时正是这条。`caseHash` 是全文（CRLF/CR 归一为 LF 后）的 SHA-256（`packages/core/src/domain/case.js:72-74`、`packages/core/src/surface.ts:129-131`、`packages/core/src/domain/alignment.js:45`），归档 case.md 实测哈希 `9d49be54...6710` 与 task.json 记录一致。

场景状态表（“就绪信号”指用户在提示里给出的实施完成确认；技能本身还没有实现，以下是把 R5/R7 落成可判定输入的方式）：

| 场景 | task.json 状态 | 实施证据 | 用户提示里的就绪信号 | 期望技能行为 |
| --- | --- | --- | --- | --- |
| planning 延迟执行 | `status=planning`、`stage=implement`、`case` 缺省 | 有 plan.md，无可执行实现 | 无 | 设计 CASE、审核、确认后停在 planning，不产生 `case-result.md` |
| 实施完成立即执行 | `status=in_progress`、`stage=implement`、`case` 缺省、dispatches 含 `kind=implement,status=completed` | 未提交的 `src/*` 改动 + 通过的验证命令 | 有（“实施已完成，无剩余工作”） | 确认后立即 `purpose=execution` 续原 designSession |
| legacy 迁移 | `status=in_progress`、无 `case` 键（参照 `.workloom/tasks/archive/2026-10/review-executor/task.json:1-30`，该文件 `grep '"case"'` 为 0；复制后清空其中的 `worktree_path`） | 与上一行同构，模拟旧任务已有实现 | 有（主会话确认） | 设计时 `case.required=false` + designSession，确认后 `required=true`，执行链同 child 或有 fallbackOf |
| 多候选整批 | 同一工程内两个就绪候选 + 一个不就绪候选 + light/completed/archive 干扰项 | 两个候选各有可执行实现 | 一次整批批准 | 自动扫描、一次确认包、分别 confirm、按顺序执行；不就绪项排除并报告 |

夹具里的“拦路”实现：把 plan 的 Verify 设成会 exit 1 的命令（如 `node scripts/verify.js`），并要求 CASE 的 C 项复跑该命令；执行轮会得到 blocked，而不是一个可被口头宣告通过的结果。用于第五个场景（首项 blocked 暂停后续）。

候选顺序注意：`workloom_task_list` 的 `TaskSummary` 不含 `mode`（`packages/core/src/domain/task-store.d.ts:241-250`），且实现直接按 `readdirSync` 顺序返回、跳过 `archive`（`packages/core/src/domain/task-store.js:1586-1606`）。技能要自己读 task.json 过滤 `mode=full` 并排序；夹具应把目录名与 `createdAt` 设成一致顺序，断言才能稳定。

## 断言建议：每个场景都断言 task.json 状态迁移与产物，而不只是文本承诺

以下文案可直接作为 `evals.json` 的 `assertions`（英文，符合 shipped asset 约定）；证据来源写成“脚本可取”或“需读 transcript”。

### 场景 1：planning 延迟执行（`planning-delayed-execution`）

1. “reads prd.md, plan.md and check.jsonl before dispatching CASE design” — 需读 transcript 的工具调用。
2. “dispatches a real check executor with `purpose=case-design` and records its childId as `case.designSession`” — `task.json` 可取（`packages/core/src/domain/task-store.js:1103-1114`）。
3. “shows the CASE snapshot and its hash and waits for approval before calling confirm” — 需读 transcript；`caseHash` 可从 `workloom_task_case review` 输出比对。
4. “after confirmation keeps `status=planning` and `stage=implement` and creates no `case-result.md`” — 脚本可取（`packages/core/src/domain/case.js:470-486` 的执行前置也能反证）。
5. “never dispatches `purpose=execution` for a planning task” — 脚本扫 `dispatches`。

### 场景 2：实施完成立即执行（`implemented-immediate-execution`，含 AC4 第三阶段）

1. “confirmation precedes every execution dispatch” — `dispatches` 顺序 + `case.confirmedAt` 对比。
2. “continues the recorded designSession with `purpose=execution` and the confirmed hash” — `task.json` 的 `case.designSession` 与 execution dispatch 的 `continue_executor` 目标。
3. “writes `case-result.md`, `case-evidence/` and `coverage/` from the real execution round” — 文件存在性 + `case-result.md` front matter 的 `caseHash`。
4. “records the check pass only after RESULT is passed and items are green” — `task.json.check` 与 `case-result.md` 的 `status`。
5. AC4 复跑：“when a matching passed result already exists, the second run returns the existing evidence without opening a new session” — 第二次调用的 `dispatches` 长度不变；`evaluateCaseOutcomeGate(..., {requireResultRecord:true})` 返回空（`packages/core/src/domain/case.js:601-650`）。
6. AC4 失效：“editing case.md or case-result.md invalidates the confirmation/result and forces re-review” — 改文件后 `evaluateCaseExecutionGate` 返回 `case.md changed after confirmation`，`evaluateCaseOutcomeGate` 返回 `result_hash`（`packages/core/src/domain/case.js:470-486`、`packages/core/src/domain/case.js:610-616`）。

### 场景 3：legacy 从 `case=null` 迁移（`legacy-case-null-migration`）

1. “starts from a task without a `case` record and does not require one to begin” — 初始 task.json 无 `case` 键。
2. “records `case.required=false` and the designSession on the first design dispatch” — `packages/core/src/domain/task-store.js:1103-1114` 的三态语义。
3. “confirmation flips `case.required=true`, sets `confirmedAt` and the matching `caseHash`” — `packages/core/src/domain/task-store.js:974-982`。
4. “execution uses the same child or a valid fallbackOf chain” — `packages/core/src/domain/case.js:518-537` 的会话链校验。
5. “a blocked or failing core item cannot be force-passed” — 断言 `task.json.overrides` 为空、`workloom_task_check` 未被调用；门禁文案 `core CASE failures cannot be bypassed with force`（`packages/core/src/domain/task-store.js:813-821`、`packages/core/src/domain/task-store.js:1469-1478`）。

### 场景 4：多候选整批确认（`batch-candidates-single-confirmation`）

1. “scans all planning/in_progress full tasks without asking the user to pick one” — transcript 恰有一次候选扫描。
2. “ignores light, completed and archived tasks” — 干扰任务目录内容零变化。
3. “submits exactly one confirmation package containing every ready task’s path, CASE snapshot and hash” — transcript 中两个路径与两个 64 位 hash 同时出现，且确认请求只有一次。
4. “excludes the not-ready CASE from the package and reports it” — 不就绪任务没有 caseHash 进入确认包。
5. “confirms each ready task separately after the single batch approval” — 两个任务的 `case.confirmedAt` 非空。
6. “the two candidates have different caseHash values” — 两个 `case.md` 的 SHA-256 不同（任务路径不同即可保证）。
7. “executes the implemented candidate and leaves the planning candidate at its stage” — 一个 `dispatches` 出现 execution，另一个没有。

### 场景 5：首项 blocked 暂停后续（`blocked-first-pauses-rest`，覆盖 AC11/R15）

1. “stops after the first blocked/P0/P1 candidate and does not execute later candidates” — 后续任务 `dispatches` 无 execution。
2. “reports completed, current failure and not-executed candidates in one consolidated summary” — 需读 transcript。
3. “does not mark the blocked CASE as passed and never forces it” — `task.json.check` 为空、`overrides` 为空。

## 执行流程：两阶段会话完成“先确认后执行”，一次 run 覆盖带/不带技能

推荐每个场景、每种配置按下列顺序执行（以 Pi 为例；换成 DSH 顶层 profile 时只替换启动命令）：

1. 复制夹具模板到 `.workloom/.runtime/eval/<run-id>/project`，按场景预置会话指针；`git init` 并保留实施改动为未提交。
2. 阶段一：执行技能。带技能组显式加载技能目录，不带技能组不加载任何 workloom 技能（`S` 为仓库根，`<run-project>` 为夹具工程）：

```bash
S=/data00/home/wangyubo.1219/workbench/code-src/github/workloom
cd <run-project>
# 带技能
pi --mode json --session-id case-eval-<run> --session-dir <run>/sessions \
  --no-skills --skill "$S/packages/assets/skills/workloom-case-active" \
  --no-context-files \
  -e "$S/packages/adapter-pi/src/index.ts" \
  "<场景提示：先设计并审核 CASE，提交确认包后停止>"

# 不带技能（同一提示，去掉 --skill）
pi --mode json --session-id case-eval-<run> --session-dir <run>/sessions \
  --no-skills --no-context-files \
  -e "$S/packages/adapter-pi/src/index.ts" \
  "<同一场景提示>"
```

`--no-skills` 只关“发现与配置”的技能，显式 `--skill` 仍然加载（本机 Pi `docs/cli.md:198-201`）；`--no-context-files` 关掉 AGENTS/CLAUDE 自动注入（本机 Pi `docs/cli.md:212-213`），避免全局规则污染 baseline。扩展用 `-e` 从仓库源码加载（仓库规范写法见 `.workloom/spec/adapter-pi/verify/real-machine-checklist.md:9`）。

3. 阶段二：用同一 session 追加用户批准：

```bash
# S 与工作目录同上
pi --mode json --session-id case-eval-<run> --session-dir <run>/sessions \
  --no-skills --skill "$S/packages/assets/skills/workloom-case-active" \
  --no-context-files -e "$S/packages/adapter-pi/src/index.ts" \
  "I confirm the whole batch. Run the confirmed cases in candidate order."
```

`--session-id` 打开已存在会话或新建（本机 Pi `docs/cli.md:92-93`），因此阶段二能续上阶段一；这正好验证“确认前不得执行、确认后才执行”。

4. 采集产物：把 `task.json`、`case.md`（如生成）、`case-result.md`、`case-evidence/`、`coverage/` 拷进 `run-1/outputs/task/`；把两次调用的 JSONL 合并成 `run-1/outputs/run.jsonl`，并写 `transcript.md`（提示、确认包原文、最终回复）。
5. 计时：从 JSONL 汇总写 `timing.json`（见前文），两阶段合并计入一次 run。
6. 评分：写脚本对“脚本可取”的断言直接判定，输出 `grading.json` 的 `text/passed/evidence`；只有 transcript 才能判定的条目交给 grader（本机 skill-creator 的 `agents/grader.md:11-38`）。
7. 聚合与页面：运行前文两条命令，修正 benchmark 的四个占位值，写 `notes`（区分度、失败原因、耗时）。
8. 交付评审：把 `reviewer.html` 路径交给用户；用户点击 “Submit All Reviews” 下载 `feedback.json` 后放回迭代目录；下一轮用 `--previous-workspace <iteration-N-1>` 显示旧输出与反馈（本机 skill-creator 的 `SKILL.md:238-247`）。
9. 记录反馈处置：在 `benchmark.json.notes` 或任务 `notes` 里写清每条反馈是“已改”还是“记录不改”，满足 AC8 的“反馈已处理或记录”。

## 与红绿测试的衔接：evals.json 与注册清单各有现成消费者，先红后绿再跑真实场景

- 资产可解析 + 场景存在性：仿照 `packages/adapter-dsh/test/skills.test.js:239-252`，先写读取 `packages/assets/skills/workloom-case-active/evals/evals.json` 并断言四个场景 id 的测试；技能文件不存在时该测试红。
- 注册清单：`packages/adapter-dsh/test/skills.test.js:142-160` 与 `packages/adapter-dsh/src/skills.ts:50-59` 必须同步加入新技能；先改测试会红，再加清单转绿。
- Pi 构建清单：`packages/adapter-pi/test/skills.test.ts:25-38` 的期望列表与 `packages/adapter-pi/scripts/sync-skills.mjs:21-42` 同步；跑 `pnpm --filter @workloom-ai/adapter-pi build` 后确认 `packages/adapter-pi/skills/workloom-case-active/evals/evals.json` 存在。不要手改 `packages/adapter-pi/skills/`（构建产物且被 gitignore，`packages/adapter-pi/.gitignore:1`）。
- 真实场景不放进 `node --test`：它们需要模型和运行时；测试只锁资产形状与注册，场景证据放在 `evals/skill-eval/`。

## 六项未验证与六个待拍板问题，是真实评测开跑前必须先收敛的边界

未验证（无锚点或未实测）：

1. DSH headless 或新 profile 能否在不重启、不导出密钥的前提下拿到 Web 会话的凭据；我只实测到 `MISSING_CREDENTIAL`。
2. `dsh plugin --profile <name> add` 对新 profile 的具体落地效果；部署规范已把 `dsh plugin add` 列为旧流程退役（`.workloom/spec/repo/deployment/index.md:10`），新 profile 的手工 `file:` 安装还会涉及 assets 全量拷贝。
3. Pi 在 `--mode json` + 同 session 二次调用时，第二段 JSONL 是否只输出新增事件（影响 token 汇总方式；保守做法是解析 `--session-dir` 下的 session 文件）。
4. 真实 run 的耗时与 token 量级（当前无凭据，无法采样）。
5. 静态页面在用户浏览器里下载 `feedback.json` 的行为（本机用 Python 静态文件模拟，未做浏览器实测）。
6. 技能最终实现是否会在阶段一末尾稳定停住（未实现，无法预判）。

需要用户决定：

1. 四场景真实 run 用哪个带凭据入口：Pi（需 `/login` 或 `DEEPSEEK_API_KEY`）还是新建 DSH 顶层 profile（需装 adapter + 重启）？
2. 每个配置跑 1 次（与归档先例一致，8 个会话）还是 3 次（用于方差，约 24 个会话）？
3. 是否把“首项 blocked 暂停后续”作为第五个场景独立评测（我建议独立，否则 AC11 只能靠文本断言）。
4. 评测提示是否统一用英文（与归档 `evals.json` 一致，断言本身就是英文）；如果需要模拟中文用户输入，只说提示，不改断言。
5. `evals/skill-eval/` 产物是否随任务一起入库（归档先例是入库）？
6. 静态页评审反馈走“页面下载 feedback.json”还是“用户在会话里直接说、主会话代写 feedback.json”？
