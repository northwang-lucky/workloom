tasks/11-03-case-archived-skill:mw354dmkdiymuo4n

冲突说明（只陈述一次）：任务提示要求写入 `research/archived-evals.md`，执行器约定把写入范围限定在 `.workloom/` 内，因此本报告落在 `.workloom/tasks/11-03-case-archived-skill/research/archived-evals.md`。另：任务目录当前没有 `plan.md`，`task.json` 仍是 `planning`（`.workloom/tasks/11-03-case-archived-skill/task.json:6`），本报告属 1.2 research，按执行契约以 `prd.md` 与当前源码为据推进。

研究范围：`workloom-case-active` 的评测机器（runner、夹具、计时、聚合、静态页）、归档任务的真实结构、`workloom-case-archived` 三类场景的夹具与断言设计。全程只读，未修改实现代码；唯一写入是本文件。文中“已验证”指我实际读了源码或实际跑过命令；推测与建议会显式标注。

# workloom-case-archived 三类带技能真实验收：执行环境事实与落地配方

## 结论：三类真实验收可以复用 case-active 的整套评测机器，但归档夹具、零变化清单和 ref 基准校验是必须新增的部分

| 关注点 | 可复用的事实 | 必须新增的部分 |
| --- | --- | --- |
| 场景定义 | `evals/evals.json` 的 `skill_name` + `evals[]`（`id/name/prompt/expected_output/assertions/files`）形状已经稳定，DSH 测试也按这个形状消费（`packages/assets/skills/workloom-case-active/evals/evals.json:1-78`、`packages/adapter-dsh/test/skills.test.js:184-201`） | 三个归档场景的英文 prompt 与断言 |
| 夹具生成 | `build-fixtures.mjs` 的“参数校验 → 写项目骨架 → 写任务目录 → git init + 初始提交”骨架（`packages/assets/skills/workloom-case-active/evals/build-fixtures.mjs:6-10`、`:29-89`、`:91-125`） | 归档任务目录、`completedAt`、历史 CODE 基准、第二段 git 历史/分支 |
| 顶层运行 | `run-scenario.sh` 的 tmux + Pi TUI + 稳定截屏 + 二次用户消息模式（`packages/assets/skills/workloom-case-active/evals/run-scenario.sh:40-54`、`:71-101`） | `TASK_ROOT`、场景映射、无基线组的 `--skill` 运行 |
| 计时 | `finalize-run.mjs` 从 Pi JSONL 汇总 `total_duration_seconds` 与 `total_tokens`（`.workloom/tasks/archive/2026-11/case-active-skill/evals/skill-eval/finalize-run.mjs:19-40`） | 归档场景每次 run 的前置快照（manifest、期望 sha） |
| 评分 | `grading.json` 的 `expectations[{text,passed,evidence}]` + `summary`（`~/.agents/skills/skill-creator/references/schemas.md:86-97`） | 归档场景的确定性检查脚本（manifest、baseline、tag/ref、原件不变） |
| 聚合 | `aggregate_benchmark.py` 读 `eval-*/<config>/run-*/grading.json` 与 `timing.json`（`~/.agents/skills/skill-creator/scripts/aggregate_benchmark.py:79-160`） | 三个（或五个）场景的 `eval_metadata.json` 与 benchmark notes |
| 静态页 | `generate_review.py` 以 `outputs/` 目录发现 run，`--static` 写独立 HTML（`~/.agents/skills/skill-creator/eval-viewer/generate_review.py:60-83`、`:431-435`） | 归档场景的 `outputs/` 内容、反馈回填 |

关键可行性事实：这套机器在 case-active 任务中已经真实跑通五个场景，27 条检查项均判通过（其中 1 条带已披露的保留项），耗时 606.699s–2224.573s（`.workloom/tasks/archive/2026-11/case-active-skill/evals/skill-eval/acceptance/benchmark.json:1-16`、`:244-258`）。归档技能的三次完整生命周期与它同量级，不是纸面设计。

## case-active 的评测机器是“技能内四个文件 + 任务内一份运行目录”，每个消费者读的位置不同

- 技能内评测资产：`packages/assets/skills/workloom-case-active/evals/evals.json`（场景定义）、`build-fixtures.mjs`（夹具）、`run-scenario.sh`（顶层运行器）；指纹脚本在 `packages/assets/skills/workloom-case-active/scripts/task-fingerprint.mjs`（`packages/assets/skills/workloom-case-active/SKILL.md:23`、`:27`）。
- 任务内运行目录（case-active 归档前）：`.workloom/tasks/archive/2026-11/case-active-skill/evals/skill-eval/`，其下有 `iteration-N/`、每个场景的 `eval-N-<scenario>/`、每个配置的 `with_skill/run-1/`、以及 `benchmark.json`、`benchmark.md`、`reviewer.html`、`feedback.json`（归档样本：`.workloom/tasks/archive/2026-11/case-active-skill/evals/skill-eval/acceptance/` 目录清单）。

必须为新任务改掉的是 `TASK_ROOT` 默认值与场景映射；Pi 启动参数可以原样复用：

```bash
# packages/assets/skills/workloom-case-active/evals/run-scenario.sh:12-27
EVAL_DIR=$(cd "$(dirname "$0")" && pwd)
SKILL_DIR=$(dirname "$EVAL_DIR")
REPO_ROOT=$(git -C "$SKILL_DIR" rev-parse --show-toplevel)
WORKTREE_ROOT=${WORKTREE_ROOT:-$REPO_ROOT}
TASK_ROOT=${TASK_ROOT:-"$REPO_ROOT/.workloom/tasks/11-03-case-active-skill"}
case "$SCENARIO" in
  planning-defers-execution) EVAL_INDEX=0 ;;
  ...
  *) echo "unknown scenario: $SCENARIO" >&2; exit 2 ;;
esac
EVAL_NAME="eval-${EVAL_INDEX}-${SCENARIO}"
RUN_DIR="$TASK_ROOT/evals/skill-eval/iteration-$ITERATION/$EVAL_NAME/$CONFIG/run-1"
```

```bash
# packages/assets/skills/workloom-case-active/evals/run-scenario.sh:40-54
ARGS=(
  --session-id "$SESSION_ID"
  --session-dir "$PROJECT/.pi/sessions"
  --no-context-files
  -e "$WORKTREE_ROOT/packages/adapter-pi/src/index.ts"
  --model minimax-cn/MiniMax-M3.1-Flash
)
if [[ "$CONFIG" == 'with_skill' ]]; then
  ARGS+=(--skill "$SKILL_DIR")
else
  ARGS+=(--no-skills)
fi
tmux new-session -d -s "$SESSION_ID" -c "$PROJECT" "PI_BIN=$PI_PATH pi $PI_ARGS"
```

推论（建议）：归档技能自己的 `evals/run-scenario.sh` 应保留同一结构，只改 `TASK_ROOT` 默认值与场景映射；R13 明确“不带技能组不参与验收”（`.workloom/tasks/11-03-case-archived-skill/prd.md:21`），所以只需 `with_skill` 分支，`CONFIG` 可以固定为 `with_skill`，避免误跑基线。

夹具生成器的可复用骨架（已验证）：

```js
// packages/assets/skills/workloom-case-active/evals/build-fixtures.mjs:29-45（节选）
function addTask(root, options) {
  const rel = options.archive === true ? `tasks/archive/${options.slug}` : `tasks/${options.slug}`
  const dir = `.workloom/${rel}`
  ...
  if (options.legacy === true) {
    write(root, `${dir}/design.md`, '# Legacy design\n\n...')
    write(root, `${dir}/implement.md`, '# Legacy implementation\n\n...')
  } else if (options.omitPlan !== true) {
    write(root, `${dir}/plan.md`, plan())
  }
  ...
}
```

```js
// packages/assets/skills/workloom-case-active/evals/build-fixtures.mjs:91-125（节选）
mkdirSync(target)
write(target, '.workloom/config.json', '{"packages":{"repo":{"path":"."}},"worktree":{"enabled":false},...}')
write(target, '.workloom/spec/README.md', '# Fixture spec\n\n...')
write(target, '.gitignore', '.pi/\n.workloom/.runtime/\n')
...
if (active !== null) {
  write(target, `.workloom/.runtime/sessions/pi_${sessionId}.json`, ...)
}
for (const args of [['init'], ['add', '.'], ['-c', 'user.name=Eval', ..., 'commit', '-m', 'fixture']]) {
  execFileSync('git', args, { cwd: target, stdio: 'ignore' })
}
```

三个容易踩的消费端约定（已验证，直接照做）：

1. `outputs/` 是 viewer 的 run 发现锚点；没有它，`find_runs` 找不到这个 run（`~/.agents/skills/skill-creator/eval-viewer/generate_review.py:60-83`）。
2. `eval_metadata.json` 要放两处：eval 场景目录一份给 aggregate 读 `eval_id`，配置目录（`with_skill/`）一份给 viewer 读 prompt（`~/.agents/skills/skill-creator/eval-viewer/generate_review.py:88-100`、`~/.agents/skills/skill-creator/scripts/aggregate_benchmark.py:84-104`）。
3. `grading.json` 的期望项必须是 `text/passed/evidence` 三个字段，否则 viewer 与聚合都会警告或丢分（`~/.agents/skills/skill-creator/scripts/aggregate_benchmark.py:156-160`、`references/schemas.md:86-97`）。

运行期的多次批准要由主会话在同一个 tmux 会话里追加消息，runner 只负责首次提示，不能把批准写进初始 prompt：

```bash
# 归档场景至少三次停等：1.1 对齐、1.4 包、CASE hash；每次都用同一 session
tmux send-keys -t "$SESSION_ID" "I confirm the current alignment review package." Enter
tmux send-keys -t "$SESSION_ID" "I confirm the 1.4 review package and approve starting the task." Enter
tmux send-keys -t "$SESSION_ID" "I approve the exact reviewed CASE hash <64-hex>." Enter
```

这一点沿用 case-active 的做法：初始 prompt 只声明“本次请求不是批准”，主会话在稳定截屏确认模型已停住后再发下一句（`packages/assets/skills/workloom-case-active/evals/evals.json:23`、`:31`；运行器稳定截屏逻辑在 `packages/assets/skills/workloom-case-active/evals/run-scenario.sh:71-87`）。归档场景的批准次数更多，建议在 `run.json` 旁边另存 `outputs/approvals.txt`，逐条记录发送时间与原文，评分脚本据此核对“批准消息早于对应 confirm/start”的时序。

## 归档对象与活跃对象有三处硬差异，照搬 case-active 会漏掉 R1/R2/R3

| 差异 | 事实 | 锚点 |
| --- | --- | --- |
| 任务列表拿不到归档任务 | `listTasks` 直接跳过 `archive` 目录，且 `TaskSummary` 没有 `mode` 字段 | `packages/core/src/domain/task-store.js:1593`、`packages/core/src/domain/task-store.d.ts:241-250` |
| 归档才写入归档时间 | 归档时 `status=completed`、`completedAt=now`，目录为 `tasks/archive/YYYY-MM/<name>` | `packages/core/src/domain/task-store.js:1504-1524` |
| 归档原件没有任何核心门禁保护 | 归档后 skill 只读；核心没有“禁止改写 archive”的写入门禁，零变化只能靠外部清单证明 | 归档实现只写移动后的 task.json（`packages/core/src/domain/task-store.js:1521-1526`），没有反向保护 |

因此 R2 的“列出归档 full 任务的标题、路径和归档时间”不能调用 `workloom_task_list`，必须自己扫 `.workloom/tasks/archive/**/task.json`：标题取 `title`，路径取目录相对路径，归档时间取 `completedAt`。R1 的 light 过滤也必须读原始 `task.json.mode`；缺失时按 full 处理，这与核心归一化一致（`packages/core/src/domain/task-store.js:257-300` 的 `mode` 缺省 full 逻辑）。

归档材料的优先级在模板里已有落点：CASE 的 `References` 固定要求 `PRD / Implementation / Code target / Source task` 四个字段（`packages/core/src/domain/case.js:404`），模板正文也是这四个（`packages/assets/templates/case.md:10-13`）。这正好承载 R4 的 `sourceTask` 与 R6 的代码基准，不需要改核心模板。

```markdown
## References

- PRD: `prd.md`
- Implementation: `plan.md`
- Code target: `<branch/worktree-or-selected-ref>`
- Source task: `<archived-task-path-or-none>`
```

代码基准在 RESULT 侧同样已有字段：`codeBaseline` 必填（`packages/assets/templates/case-result.md:1-10`、`packages/core/src/domain/case.js:632`）。所以 R6 的记录位置可以是：CASE 的 `Code target` 写“ref + 完整 commit + 来源 + 原因”，RESULT 的 `codeBaseline` 写同一组信息并附 `codeFingerprint=<64-hex>`。

## 场景 A：已有 PLAN、默认当前 HEAD，验证“PLAN 优先”和“不冒充历史执行”

夹具设计（建议）：

- 归档源任务 `.workloom/tasks/archive/2026-11/<slug-a>/`：`prd.md`、`plan.md`（带唯一标记，例如 `HISTORICAL-PLAN-MARKER`）、`task.json`（`status=completed`、`completedAt`、`check` 有值、`case.result` 记录历史 `caseHash`/`resultHash`/`passedAt`）、可选的旧 `case.md` + `case-result.md`（`case-result.md` front matter 的 `codeBaseline` 指向历史提交 A）。
- 为了测 R5 的“PLAN 优先”，额外放一对过时的 `design.md` + `implement.md`（带 `STALE-LEGACY-MARKER`）；期望新任务采用 PLAN，不采用旧材料。
- 项目 git 历史：`main` 上先有提交 A（历史提交），再有提交 B（当前 HEAD）。归档 `case-result.md` 的 `codeBaseline` 指向 A，当前 HEAD 是 B。
- 干扰项：一个活跃 full 任务（`tasks/11-05-active`，planning）、一个归档 light 任务（`mode=light`）。两者不得进入选择，也不得被改写。
- `.workloom/config.json`：`worktree.enabled=false`，`subagents.check/implement` 固定模型与 `effort`，`rotate_on_busy=false`（与 case-active 夹具一致，`packages/assets/skills/workloom-case-active/evals/build-fixtures.mjs:92`）。

- 公共源骨架：每个夹具都放一份最小但真实的可执行源码（例如 `src/math.mjs` 与 `scripts/verify.mjs`），让新任务的 CASE 有真实运行用例、覆盖率可以 `generated`，而不是像 case-active 的 legacy 夹具那样因为“没有产品源码”只能记 `not_applicable`（`.workloom/tasks/archive/2026-11/case-active-skill/evals/skill-eval/acceptance/eval-2-legacy-migrates-and-executes/with_skill/run-1/grading.json:19-23`）。R8/R9 要的是当前基准下的真实证据，跳过这个骨架会让 AC6 失去判定对象。

Prompt（英文，建议）：

```text
Work in <fixture-project>. Use workloom-case-archived to re-verify the archived full task at
.workloom/tasks/archive/2026-11/<slug-a> against the current target branch. Do not modify
anything under the archived task directory. The initial request is not an approval: stop at
each required confirmation and wait for a new user message. After approval, run the full
lifecycle through independent archive. Report the source task, the resolved baseline commit,
the new task path, and the before/after archive manifest digest.
```

断言（建议，全部可脚本判定，除 transcript 项）：

| 检查 | 期望 | 判定方式 |
| --- | --- | --- |
| 新任务独立存在 | `.workloom/tasks/` 下出现恰好一个新任务，`mode=full`，`parent=null`，最终独立归档 | 运行前后目录 diff + 新 task.json |
| sourceTask | 新任务 CASE 的 `Source task` 与 task.json `meta.sourceTask`（或 `description`）都指向归档路径 | 读新 CASE + task.json |
| 默认基准 | CASE `Code target` 与 RESULT `codeBaseline` 含 B 的完整 40 位 sha，且不等于 A | `git rev-parse HEAD` 预存 + 字符串比对 |
| 基线来源与原因 | 记录“当前目标分支”这一来源和“默认”原因 | 文本字段包含 ref 名与原因关键词 |
| 指纹 | RESULT `codeFingerprint` 等于在 B 上独立跑 `task-fingerprint.mjs` 的结果 | 运行结束后重算 |
| 历史结果不复用 | 新 RESULT 的 `caseHash`/`checkSession` 与归档旧 `case-result.md` 不同 | 哈希与会话 id 比对 |
| PLAN 优先 | 新 plan.md 含 `HISTORICAL-PLAN-MARKER`，不含 `STALE-LEGACY-MARKER`；新任务目录没有遗留 design/implement | 文本搜索 |
| 原件零变化 | 归档源目录前后 SHA-256 清单逐字节一致，`children` 不变 | 清单 diff |
| 确认时序 | 1.1、1.4、CASE confirm 都发生在对应 review 之后，且各有独立用户消息；初始请求未被当作批准 | 解析 Pi JSONL 的 user/toolCall 时序 |

场景 A 的价值在于同时覆盖 R5 的优先级、R6 的默认基准、R7 的“历史 CASE/RESULT 只作参考”与 R9 的当前指纹记录；如果只放 PLAN 而没有历史 RESULT，R9 的“不冒充历史执行”就没有可判定的对照。

## 场景 B：旧 design/implement、指定 ref，验证迁移与指定基准

夹具设计（建议）：

- 归档源任务：只有 `prd.md`（旧自由格式，无 R/AC 编号）、`design.md`（带 `LEGACY-DESIGN-MARKER`）、`implement.md`（带 `LEGACY-IMPLEMENT-MARKER`），没有 `plan.md`。
- 项目 git 历史：`main` 在 B；分支 `verify-base` 指向 A。A 与 B 的 `src/answer.txt` 内容不同（A=`alpha`，B=`beta`），用于证明验证真的跑在 A 上，而不是只把 sha 抄进文档。
- 归档 task.json：`status=completed`、`completedAt`、无 `case` 或只有历史记录；历史提交以 A 表示。
- 同场景 A 的活跃/light 干扰项。

Prompt（英文，建议）：

```text
Work in <fixture-project>. Use workloom-case-archived to re-verify the archived full task at
.workloom/tasks/archive/2026-11/<slug-b> against branch verify-base. The archived task only has
design.md and implement.md, no plan.md. Do not modify anything under the archived task
directory. The initial request is not an approval: stop at each required confirmation and wait
for a new user message. After approval, run the full lifecycle through independent archive.
Report the migrated plan, the resolved baseline commit, and which ref the verification used.
```

断言（建议）：

1. 新任务先处于 planning；`workloom-migrate-plan` 只作用于新任务，不作用于归档目录（技能边界见 `packages/assets/skills/workloom-migrate-plan/SKILL.md:11-15`）。
2. 新任务生成 `plan.md`，首行有迁移说明（`Migrated ... from design.md + implement.md ...`），且新任务里的 `design.md`/`implement.md` 在迁移确认后被删除；归档源目录里的两份原件字节不变。
3. 新 PRD 被改写为 R/AC 编号格式并带迁移说明，旧 PRD 语义保留（migrate-plan 的 Step 2，`packages/assets/skills/workloom-migrate-plan/SKILL.md:21-29`）。
4. CASE `Code target` 与 RESULT `codeBaseline` 记录 `verify-base` 的完整 40 位 sha（= `git rev-parse verify-base^{commit}`），并记录“用户指定”的来源与原因。
5. 证据中出现 A 的独有内容 `alpha`（或等价的 A 基线命令输出），而不是 B 的 `beta`；这比只看文档字段更能证明“真的按指定基准验证”。
6. RESULT 的 `codeFingerprint` 等于在 A 的检出上跑 `task-fingerprint.mjs` 的结果；如果只在 B 的项目根算指纹，会被这条断言抓住。
7. 原件零变化、独立归档、确认时序同场景 A。

设计风险（必须让实现者拍板）：`workloom_task_start` 的 worktree 基分支取“当前分支或父任务分支”，不支持任意 commit；detached HEAD 还会被直接拒绝（`packages/core/src/domain/worktree.js:296-312`）。因此“指定提交号”不能靠 start 自动完成。可行的实现路径有两条，均未被真实验证：

- A. 指定分支：在创建新任务前把项目检出到 `verify-base`，让“当前分支 HEAD”就是 A；记录里仍写明来源是用户指定的 ref。
- B. 指定 commit：用 `git worktree add --detach <临时目录> <sha>` 建一个验证检出，在它里面跑 CASE 与指纹；新任务本身仍记录该 sha。

建议在 PLAN 里明确选一条并写进 skill 文本；不要两者混用，否则场景 B 的“基准来源”断言会含糊。

## 场景 C：仅 PRD，验证“显式标记后重建”而不是伪造已有 PLAN

夹具设计（建议）：

- 归档源任务：只有 `prd.md` + `implement.jsonl`/`check.jsonl` + `task.json`；没有 `plan.md`、`design.md`、`implement.md`。PRD 用 R/AC 编号格式，便于新任务直接继承需求。
- 项目 HEAD 为 B，无额外历史分支。
- 归档 task.json 可带一个历史 `case-result.md`，其中 `codeBaseline` 指向 A，用于验证不复用历史结论。

断言（建议）：

1. 新任务创建成功，没有触发 migrate-plan（没有 design/implement 可迁移），也没有凭空复刻历史 PLAN。
2. 新 `plan.md` 存在，且明确写出“历史任务没有实施计划，本 PLAN 依据 PRD 与当前代码重建”这一事实（R5 的“显式标记后重建”）。
3. 新 CASE 的 `References` 明确标注历史实施文档缺失（父任务 AC12 的原文要求：`只有 PRD 的 CASE 明确标注实施文档缺失`，`.workloom/tasks/11-03-check-case-coverage/prd.md:45`）。
4. 默认基准 = B 的完整 sha；`codeFingerprint` 在 B 上重算一致。
5. 新 RESULT 的 `caseHash`/`checkSession` 与归档历史结果不同；历史 blocked/failed 不被复制为当前结论。
6. 原件零变化、独立归档、确认时序同场景 A。

## 两个补充场景把 R1/R2/R10 的公开行为也变成真实运行

R13 的下限是三个场景（`.workloom/tasks/11-03-case-archived-skill/prd.md:21`），但 AC1 覆盖 R2、AC7 覆盖 R10（`:28`、`:34`）。建议补两个便宜的场景，仍只跑 `with_skill`：

### 场景 D：无路径时列出并等待选择（覆盖 R2）

- 夹具：两个归档 full 任务（不同 `completedAt`，一个 2026-10、一个 2026-11）、一个归档 light、一个活跃任务。Prompt 只说“Use workloom-case-archived to re-verify an archived task”，不提供路径。
- 断言：回复列出恰好两个 full 任务的标题、路径、归档时间；light 与活跃任务不出现；不创建任何新任务；停在等待用户选择的状态。场景结束后由主会话发一条“选择 <path>”的消息再继续，或者直接终止并记为选择行为通过。
- 这个场景很快（不需要走完整生命周期），但能把 AC1 的“未提供路径时按确认方式处理”变成可审阅的 transcript。

### 场景 E：无效输入快速失败（覆盖 R10）

- 夹具：正常项目 + 一个缺 `prd.md` 的归档任务 + 一个无效 ref。依次发四条请求：不存在的归档路径、不可解析的 ref、缺材料的归档任务、不可用工作区（例如 `git init` 但无首个 commit，HEAD 不可解析）。
- 断言：四次都给出明确失败原因并停止；`.workloom/tasks/` 没有新增任务目录；归档源目录清单前后一致；没有 `purpose=execution`/`case-design` 派发；没有降低验收要求的“force”记录。
- 场景 E 不参与 AC10 的“三个场景”计数，但应进入 benchmark 与审阅页，作为 AC7 的真实证据。

## 原件零变化、独立新任务和无效 ref 检查都应做成确定性脚本，不靠模型自述

### 原件零变化

`task-fingerprint.mjs` 不能拿来证明 R3：它算的是“HEAD + tracked diff + untracked 内容”，并且排除了 `.workloom/**`（`packages/assets/skills/workloom-case-active/scripts/task-fingerprint.mjs:9-28`）。归档原件全部文件的清单要用独立命令：

```bash
SOURCE=".workloom/tasks/archive/2026-11/<slug>"
find "$SOURCE" -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum
```

运行前后各存一份到 `outputs/archive-manifest.before.txt` / `.after.txt`，用 `diff -u` 判定；同时记录文件数，防止“少一个文件但哈希行也少一行”的漏判。清单范围只限归档源任务目录，不要扫整个 `archive/`——新任务的归档会落在同一棵 archive 树下，扫全树会把新任务误判成原件变化。

### 独立新任务

运行前记录 `.workloom/tasks/` 的目录集合，运行后取差集；新任务必须满足：目录不在 `archive/<原 slug>` 下、`task.json.parent` 为空、`mode=full`、CASE 的 `Source task` 指向归档源、task.json `meta.sourceTask`（或 description）记录同一路径。最终归档后，原归档任务 `task.json` 的 `children` 仍为空数组。

### 无效 ref 与基准解析

统一用 `git rev-parse --verify --quiet '<ref>^{commit}'` 解析；失败即停止，不创建任务。成功时保存 40 位完整 sha，再与 CASE/RESULT 文本比对。当前分支用 `git rev-parse --abbrev-ref HEAD` 取，不要硬编码 `main`（`packages/core/src/domain/worktree.js:288-312` 也是按当前分支取 base）。

### 建议的检查脚本

在任务目录（不是技能资产）放 `evals/skill-eval/check-run.mjs`：读取 run 目录、`fixture.json`（由夹具生成器写出期望 HEAD、指定 ref sha、源任务路径、manifest before 摘要）与 Pi JSONL，逐条产出 `grading.json` 的 `text/passed/evidence`。case-active 的评分是主会话人工审查后写 `grading.json`（`.workloom/tasks/archive/2026-11/case-active-skill/evals/skill-eval/acceptance/grading-review.md:1-40`），归档场景的确定性检查更多，值得脚本化；这是建议，不是既有实现。

## 代码基准与指纹：默认和指定要分别断言，记录位置用 CASE + RESULT + task.json.meta 三处

记录位置（已验证字段存在，写入方式是实现选择）：

| 位置 | 内容 | 依据 |
| --- | --- | --- |
| CASE `## References` 的 `Code target` | `<ref> @ <40-hex>`、来源（默认当前分支 / 用户指定）、原因 | 模板字段与核心必需字段：`packages/assets/templates/case.md:10-13`、`packages/core/src/domain/case.js:404` |
| CASE `## References` 的 `Source task` | 归档路径 | 同上 |
| RESULT front matter `codeBaseline` | 同一组基准信息 + `codeFingerprint=<64-hex>` | `packages/assets/templates/case-result.md:5`、`packages/core/src/domain/case.js:632` |
| 新 task.json `meta.sourceTask` | `{path, archivedAt, historicalBaseline}` | `meta` 是自由对象且归一化时 `...parsed` 原样保留（`packages/core/src/domain/task-store.js:257-300`）；但没有工具参数写 meta，需要直接编辑 task.json 或改核心 |

指纹的独立复核：在基准检出上运行同一个脚本，而不是在文档里抄一个值。

```js
// packages/assets/skills/workloom-case-active/scripts/task-fingerprint.mjs:17-28
export function computeTaskFingerprint(root) {
  const head = git(root, ['rev-parse', 'HEAD'])
  const diff = git(root, [...DIFF_ARGS])
  const untracked = git(root, ['ls-files', '--others', '--exclude-standard', '--', '.', ':(exclude).workloom/**', ':(exclude).pi/**']).split('\n').filter(Boolean).sort()
  const hash = createHash('sha256')
  hash.update(`HEAD\0${head}\0DIFF\0${diff}\0UNTRACKED\0`)
  for (const file of untracked) { hash.update(`${file}\0`); hash.update(readFileSync(join(root, file))); hash.update('\0') }
  return hash.digest('hex')
}
```

场景 A 的期望指纹 = 在 B 的干净项目根运行脚本的结果；场景 B 的期望指纹 = 在 A 的检出上运行脚本的结果；场景 C 同 A。跑完后在 run 目录外独立重算一次，断言逐字符一致。

## 评分、计时、聚合与静态页可以按 case-active 的命令复现，但有四个值必须人工修正

命令（已验证可复现 case-active 的归档 reviewer.html，见其 `packaging.md` 与 acceptance 目录）：

```bash
python3 ~/.agents/skills/skill-creator/scripts/aggregate_benchmark.py \
  <task>/evals/skill-eval/iteration-1 \
  --skill-name workloom-case-archived \
  --skill-path packages/assets/skills/workloom-case-archived

python3 ~/.agents/skills/skill-creator/eval-viewer/generate_review.py \
  <task>/evals/skill-eval/iteration-1 \
  --skill-name workloom-case-archived \
  --benchmark <task>/evals/skill-eval/iteration-1/benchmark.json \
  --static <task>/evals/skill-eval/iteration-1/reviewer.html
```

聚合脚本的读取规则与修正点（已验证）：

- 计时先看 `grading.json.timing.total_duration_seconds`，为 0 才读 `timing.json`（`~/.agents/skills/skill-creator/scripts/aggregate_benchmark.py:136-146`）。
- token 为 0 时会把 `execution_metrics.output_chars` 当 token（`:148-151`），这是字符数不是 token；建议 `grading.json` 不写 `timing` 块，统一让 `timing.json` 供数。
- 单配置（只有 `with_skill`）时 baseline 为空，delta 等于 primary 本身（`:206-222`）；benchmark notes 必须写明“delta 不是对照证据”。
- 脚本生成后人工修正：`skill_path`、`executor_model`、`analyzer_model`、`runs_per_configuration`（硬编码 3），再补 `notes`（`:263-275`）。

`finalize-run.mjs` 的计时来自 Pi JSONL 的最后时间戳减 `run.startedAt`，token 是每条 assistant `usage.totalTokens` 的求和（`.workloom/tasks/archive/2026-11/case-active-skill/evals/skill-eval/finalize-run.mjs:19-40`）。`total_duration_seconds` 可用；`total_tokens` 在 case-active 的实测里达到 5546981–23046055，明显是累计值重复求和（其 acceptance 的 `grading-review.md` 已把 F2 标为失真），不要把它当通过门槛。

静态页与反馈：

- `--static` 写出独立 HTML，页面上的 “Submit All Reviews” 在静态模式下载 `feedback.json`（`~/.agents/skills/skill-creator/eval-viewer/viewer.html:1051-1056`、`generate_review.py:431-435`）。
- 若像 case-active 一样起本地服务，服务端会把反馈写回 workspace 的 `feedback.json`，并留下 `server.json`（归档样本 `.workloom/tasks/archive/2026-11/case-active-skill/evals/skill-eval/acceptance/server.json`）。
- 归档场景建议两种都留：`reviewer.html` 作为可入库的静态证据，`feedback.json` 原样保存用户下载的文件；再写一份 `feedback-summary.md` 记录“已处理/记录不改”的处置。不要把用户反馈改写成无法被 viewer 读取的自定义结构。

一次迭代的执行顺序（建议，按顺序做，前一步未过不进下一步）：

1. 模型预检：在真实 runner shell 里确认 `pi --list-models` 能看到目标模型，并跑一条最小提示拿到真实回复；失败即停止。
2. 生成夹具：`node packages/assets/skills/workloom-case-archived/evals/build-fixtures.mjs <scenario> <run-dir>/project <session-id>`，同时把期望 HEAD、指定 ref 的 40 位 sha、源任务路径、manifest before 摘要写入 `fixture.json`。
3. 启动 run：`bash packages/assets/skills/workloom-case-archived/evals/run-scenario.sh <scenario> with_skill 1`；等待 TUI 就绪并保存 `outputs/initial.txt`。
4. 分批批准：主会话在模型每次停住后发对应批准消息，逐条记录到 `outputs/approvals.txt`；不要一次性预授权。
5. 收尾：稳定截屏保存 `outputs/final.txt`，把新任务目录、CASE、RESULT、证据、覆盖率复制到 `outputs/task/`，再跑 `node finalize-run.mjs <run-dir>` 写 `timing.json`。
6. 评分：跑 `check-run.mjs` 写 `grading.json`；每个场景的 `eval_metadata.json` 同时放 eval 目录与 `with_skill/` 目录。
7. 汇总：跑 aggregate 与 `generate_review.py --static`，修正 benchmark 四个占位值并补 notes，把 `reviewer.html` 交给用户，收到反馈后原样保存 `feedback.json` 并写处置摘要。

## 推荐的目录布局：技能资产只放场景定义和运行器，任务目录放真实运行与证据

```text
packages/assets/skills/workloom-case-archived/
  SKILL.md
  evals/
    evals.json                 # 3 个主场景 + 2 个补充场景，英文
    build-fixtures.mjs         # 归档夹具：completed task.json、历史基准、第二段 git 历史
    run-scenario.sh            # TASK_ROOT 指向 11-03-case-archived-skill，仅 with_skill
  scripts/                     # 复用 case-active 的 task-fingerprint.mjs，不复制第二份

.workloom/tasks/11-03-case-archived-skill/evals/skill-eval/
  finalize-run.mjs             # 从 case-active 任务复制
  check-run.mjs                # 建议新增：确定性断言 → grading.json
  iteration-1/
    eval-0-existing-plan-default-head/
      eval_metadata.json
      with_skill/
        eval_metadata.json
        run-1/{project,outputs,run.json,timing.json,grading.json}
    eval-1-legacy-specified-ref/...
    eval-2-prd-only-rebuild/...
    eval-3-selection-lists-and-waits/...
    eval-4-invalid-inputs-fail-fast/...
    benchmark.json
    benchmark.md
    reviewer.html
    feedback.json
```

指纹脚本的复用边界要说明：`task-fingerprint.mjs` 目前只在 `workloom-case-active/scripts/` 下（`packages/assets/skills/workloom-case-active/scripts/task-fingerprint.mjs:1`）。归档技能如果通过 `<skill-resource>/../workloom-case-active/scripts/task-fingerprint.mjs` 引用，在仓库与 Pi 构建副本里都能解析（两个 skill 目录同级）；但单独分发归档技能时会失效。R11 要求复用现有指纹脚本（`.workloom/tasks/11-03-case-archived-skill/prd.md:19`），建议保留同级引用并在 SKILL.md 写明“与 case-active 同仓安装”；如果要求单技能可移植，则需要把脚本提升到共享资产目录，这是更大的改动，需要实现者确认。

## 与 test-first 的衔接：评测定义先红，注册清单后绿

AC11 要求“先观察缺少技能或注册的红测试”（`.workloom/tasks/11-03-case-archived-skill/prd.md:38`）。现成的消费者有两处：

- DSH：`packages/adapter-dsh/test/skills.test.js:142-158` 把注册名单写死；不加入 `workloom-case-archived` 时该测试红。评测定义可以仿照 `:160-214` 的模式，读 `evals/evals.json` 并断言场景 id、英文 prompt/断言。注意该测试已经断言“提示词与断言不含中文”（`:196-201`），归档场景必须用英文。
- Pi：`packages/adapter-pi/test/skills.test.ts:20-36` 断言构建产物目录清单；`packages/adapter-pi/scripts/sync-skills.mjs:21-42` 是唯一同步来源。先改测试会红，加入 `SKILL_SOURCES` 后 `pnpm --filter @workloom-ai/adapter-pi build` 转绿。

建议的红阶段顺序：先加 DSH 名单与 eval 读取测试（因技能目录不存在而红）→ 加技能资产与 `evals/evals.json` → 加 Pi 清单/同步 → 构建转绿。真实场景不放进 `node --test`，它们需要模型和运行时，证据放 `evals/skill-eval/`。

语言边界（R12）：`evals.json` 的 prompt 与 assertions 用英文，这是 DSH 测试硬断言（`packages/adapter-dsh/test/skills.test.js:196-201`）；夹具里的 PRD/PLAN 也建议用英文，避免“项目语言”与“资产语言”混在一起难以判定。断言应检查“新任务文档语言与夹具项目一致”，而不是硬编码中文或英文：三个主场景都用英文夹具时，断言生成文档以英文为主；如果以后补一个中文夹具，则改断言为“与夹具 PRD 语言一致”。当前仓库的 PRD 是中文、技能资产是英文，这个分层已经在 `workloom-case-active/SKILL.md:17` 写明，归档技能应沿用同一句约定。

## 未验证项与必须先拍板的问题

未验证（没有实际跑过，或当前环境不具备）：

1. 当前 subagent shell 里 `pi --list-models` 返回 `No models available`，所有 provider 都提示没有匹配模型；Pi 的 provider 定义用环境变量取 key（本机 `~/.pi/agent/models.json`，`minimax-cn` 用 `MINIMAX_CN_API_KEY`）。case-active 在 2026-11-04 确实用 `minimax-cn/MiniMax-M3.1-Flash` 跑通过（其 acceptance benchmark），但**开跑前必须在真实 runner shell 重新做一次模型预检**；预检失败就停止，不要用失败 run 充数。
2. 场景 B 的“指定 commit”验证机制（detached worktree 或先 checkout 分支）没有在真实 run 上验证；`workloom_task_start` 不支持任意 ref 是已证事实（`packages/core/src/domain/worktree.js:296-312`），但哪条绕行路径最稳需要实现者定。
3. `meta.sourceTask` 直接编辑 task.json 后能否在所有后续工具写入中保留，我只按 `...parsed` 的归一化代码推断（`packages/core/src/domain/task-store.js:257-300`），没有实跑。
4. 三个完整生命周期场景的真实耗时/ token 量级未知；case-active 的 606–2224 秒只能作参考。
5. 静态页在用户浏览器里下载 `feedback.json` 的行为，我只读了 viewer 源码（`viewer.html:1051-1056`），没有在浏览器实测。

需要实现者/主会话拍板：

1. 评测场景取三个还是五个：三个满足 R13 的下限，两个补充场景覆盖 R2/R10；多两个会增加运行与审阅成本。
2. 场景 B 的指定基准选“分支 + 临时 checkout”还是“commit + detached worktree”；两者对启动流程和 worktree 配置的要求不同。
3. `sourceTask` 是否接受 `task.json.meta` + CASE 的组合；如果要一等字段，就涉及核心 schema 改动，超出“复用现有工具”的范围。
4. 只跑 1 次/场景（与 case-active 先例一致）还是多次取方差；R13 没有规定次数，1 次是既有惯例。
5. 静态页交付方式：`--static` 入库 + 用户下载反馈，还是起本地服务（case-active 用了服务并留 `server.json`）；前者更适合归档复核，后者反馈写入更顺。

上述第 1、2 条会直接决定 PLAN 的步骤拆分，属于研究阶段无法替实现者拍板的设计选择；请主会话在 1.4 或实现前收敛。
