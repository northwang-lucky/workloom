---
version: 1
task: tasks/11-06-prd-industry-format-overhaul
---

# CASE: 调研并升级 workloom PRD 格式

## References

- PRD: `prd.md`
- Implementation: `plan.md`
- Code target: `workloom/11-06-prd-industry-format-overhaul @ .workloom/worktree/11-06-prd-industry-format-overhaul（base main）`
- Source task: `none`

## Scope

- Requirements: `R1–R10`
- Acceptance criteria: `AC1–AC5`
- Out of scope:
  - `workflow 步骤集合与 WORKFLOW_PROTOCOL_VERSION 的变更（保持 25）；PLAN 五字段协议与 CASE 契约本身的修改。`
  - `旧 planning 任务文档的自动改写与归档任务迁移；改写只由主会话在下次确认前人工执行，工具链只负责拒绝旧格式而不是代写。`
  - `DSH/Pi profile 的依赖锁更新、用户授权后的宿主重启与线上部署；本任务只核对源码、dist 与 Pi 构建副本同步。`
  - `叙述连贯性的内容判断自动化：结构检查只做机器可判定项，内容质量由评审与评测承担，不用正则替代内容判断。`

## Static Review

每个实际变更文件单独占据一个 SR 的 Target（校验器按 Target 首文件归属，一行多文件不生效）。执行前按实际 changedFiles 复核本节覆盖。

### SR1 PRD 骨架常量与结构检查

- Covers: `AC1, AC3`
- Target: `packages/core/src/domain/task-gates.js#PRD_SECTIONS,PRD_STRUCTURE_CODES,inspectPrdStructure`
- Checks:
  1. `PRD_SECTIONS` 恰为 11 项，顺序与 PLAN 一致：Context、Goal、Scope、Assumptions, Constraints and Dependencies、Requirements、Acceptance Criteria、Edge Cases and Failure Paths、Risks and Open Questions、Alignment Decisions、References、Notes；每节 placeholder 为英文占位指引，说明该节回答的问题、应建立的前后关系与反流水账要求。
  2. `inspectPrdStructure` 检查 H1、11 个必需小节的存在性与 placeholder 未替换；沿用 `prd_section_missing`/`prd_section_placeholder` 问题码，值域仍为冻结常量，无散落字面量。
  3. Requirements 中识别 `- R<number>` 后接英文或中文冒号：至少一条、编号不重复；空需求返回稳定问题码。
  4. Acceptance Criteria 中识别 `- AC<number>`：至少一条、编号不重复；每条 AC 条目范围内至少引用一个已定义的 `R<number>`，且含 `验证方法`、`Verification` 或 `Verify` 之一；引用未知 R、缺验证标识、重复编号分别有稳定问题码。
  5. 中文形态被接受：`R1：单一可判定陈述`、`AC1（覆盖 R1、R6）：……验证方法是运行 core 模板与结构测试` 不产生任何问题；英文形态 `R1:`、`Covers R1`、`Verification:` 同样接受。
  6. 开放节点扫描删除：`PRD_STRUCTURE_CODES` 不含 `prd_open_nodes_missing`/`prd_open_nodes_not_none`；`inspectPrdStructure` 在固定小节与 R/AC 检查后结束，不读取 HTML 注释，含标记文本的输入不产生 open-node 问题。
- Expected: 上述结构与问题码断言全部成立，问题码常量保持单一来源。

### SR2 task-gates 手写类型声明同步

- Covers: `AC1`
- Target: `packages/core/src/domain/task-gates.d.ts#whole-file`
- Checks:
  1. `PrdSection` 类型与 11 项小节集合一致；`PRD_STRUCTURE_CODES` 的类型值域含全部新增 R/AC 问题码，不含 `prd_open_nodes_missing`/`prd_open_nodes_not_none`。
  2. `inspectPrdStructure` 等函数签名与 JS 实现一致；无 open-node 相关成员残留。
- Expected: `pnpm --filter @workloom-ai/core typecheck` 通过；声明文件与实现无漂移。

### SR3 PRD 骨架单一来源生成

- Covers: `AC1, AC5`
- Target: `packages/core/src/domain/task-store.js#buildPrdContent`
- Checks:
  1. `buildPrdContent` 按同一 `PRD_SECTIONS` 常量生成 H1 与 11 个小节及各自 placeholder，模块内无第二份小节标题字面量。
  2. `createTask` 对 full 与 light 写出同一骨架；轻量任务的差异只体现在启动检查过滤，不在骨架本身。
- Expected: 新建完整任务与轻量任务的 prd.md 均为十一小节骨架，内容与 task-gates 常量逐项一致。

### SR4 开放节点 domain 实现删除

- Covers: `AC1, AC4`
- Target: `packages/core/src/domain/alignment.js#whole-file`
- Checks:
  1. `OPEN_NODE_MARKER`、`OPEN_NODE_MARKER_RE`、`findOpenNodeState` 全部删除；review/confirm 相关纯函数只保留结构诊断与确认记录语义。
  2. 模块内无对 HTML 注释标记的任何读取或正则匹配残留。
- Expected: 该文件全文无 `open-nodes`、`findOpenNodeState`、`OpenNodeState` 字样。

### SR5 alignment 手写类型声明删除

- Covers: `AC1, AC4`
- Target: `packages/core/src/domain/alignment.d.ts#whole-file`
- Checks:
  1. `OpenNodeState` 类型与 `findOpenNodeState` 函数声明删除；其余导出声明与 JS 实现一致。
- Expected: typecheck 通过；声明文件无 open-node 成员。

### SR6 对齐服务结果结构收敛

- Covers: `AC1, AC4`
- Target: `packages/core/src/service/alignment-service.ts#executeAlignInternal`
- Checks:
  1. review 结果不再含 `openNodeState` 字段；保留 PRD 内容、结构诊断与确认记录字段。
  2. confirm 分支对 target=prd 与 target=plan 均写确认记录；顺序前置（PLAN 确认要求 PRD 已确认）保留。
- Expected: review/confirm 返回结构无 open-node 键；双目标确认行为与现状一致。

### SR7 公开导出面收敛

- Covers: `AC1, AC4`
- Target: `packages/core/src/index.ts#whole-file`
- Checks:
  1. 公开导出删除 `findOpenNodeState` 与 `OPEN_NODE_MARKER`；命令面与 surface 导出无新增。
- Expected: dist 动态导入拿不到两个旧导出；其余导出不变。

### SR8 doctor 文档完整性投影

- Covers: `AC1`
- Target: `packages/core/src/service/doctor-check-rules.ts#toDocIssue,checkDocumentationIntegrity`
- Checks:
  1. 检查⑦的缺 prd.md 提示与 `toDocIssue` 文案指向十一小节新模板；缺 H1、缺小节、placeholder 三类投影保留。
  2. R/AC 追踪问题不投影到 doctor；open-nodes 相关注释、分支与文案删除，doctor 保持只查文档完整性的分工。
- Expected: doctor 输出的 PRD 类 issue 与 task-gates 分类器的文档子集一致；正文无 open-node 字样。

### SR9 workflow 契约叙述规则

- Covers: `AC1, AC2, AC4, AC5`
- Target: `packages/assets/workflow/workflow.md#Phase-1.1,norms`
- Checks:
  1. 1.1 列出固定小节及每节用途；说明背景到目标、目标到需求、需求到验收的主线；要求按能力或行为组织需求，禁止按问答时间堆叠条目。
  2. Alignment Decisions 只记录关键决定及理由，不写 Q/A 编号、逐轮答复或重复摘要；同一事实指定主要归属小节，其他位置引用。
  3. Risks and Open Questions 承载未决内容；删除 `<!-- workloom:open-nodes=pending|none -->` 标记要求，收敛判据改为前沿为空、未决内容有归属、review `readyToConfirm` 为 true；norms 中两处标记说明删除或改写为内容判据。
  4. 契约版本仍为 25、步骤集合与 id 不变；PRD 不承载完整技术实现的要求保留。
- Expected: workflow.md 可被 `parseContract` 解析；正文无 open-nodes 标记引用；无逐轮问答入文或 PRD 写完整实现的指引。

### SR10 轻量流程文本收敛

- Covers: `AC4, AC5`
- Target: `packages/assets/workflow/workflow-light.md#whole-file`
- Checks:
  1. 两处 open-nodes 说明删除；轻量流程行为（跳过对齐、H1 与 Goal 最低要求、无 jsonl 与无 CASE 流程）不变。
- Expected: 正文无 open-nodes 引用；轻量步骤 id 与顺序不变，可被 `parseContract` 解析。

### SR11 alignment 技能正文重写

- Covers: `AC2, AC4`
- Target: `packages/assets/skills/workloom-alignment/SKILL.md#Recording,Convergence`
- Checks:
  1. Recording 与 Convergence 节删除标记模板与 `<!-- workloom:open-nodes=none -->` 判据；改为十一小节结构与反流水账写作规则；确认条件改为内容判据（前沿为空、Risks and Open Questions 无未决项、review ready）。
  2. 逐轮答复、重复摘要不再作为记录要求；Alignment Decisions 的写法与 SR9 一致。
- Expected: SKILL.md 无标记引用；写作规则与 workflow.md 口径一致。

### SR12 叙述质量对照评测定义

- Covers: `AC2, AC4`
- Target: `packages/assets/skills/workloom-alignment/evals/evals.json#whole-file`
- Checks:
  1. 新增 `align-narrative-coherent` 与 `align-narrative-log` 对照场景；既有场景 id 与断言保持，新增不破坏既有顺序断言（以测试实际期望为准）。
  2. log 场景断言至少覆盖三类问题：按问答时间顺序堆叠条目、重复摘要同一事实、Alignment Decisions 含 Q/A 编号或逐轮答复；并要求被判为内容质量问题或要求整改。
  3. coherent 场景断言按能力组织需求、主线连贯的 PRD 被接受；两场景的 prompt 与断言均为英文可机检短句，只引用可观察文件与文本，不把模型自述当通过依据。
- Expected: evals.json 可解析；两个对照场景方向正确（log 判问题、coherent 通过）。

### SR13 迁移技能重写指引

- Covers: `AC4, AC5`
- Target: `packages/assets/skills/workloom-migrate-plan/SKILL.md#Step-2`
- Checks:
  1. Step 2 改为按新十一小节结构重写 prd.md，保留 R/AC 逐条语义的改写要求；删除"保留 Alignment Decisions 与 open-nodes 标记"的要求。
  2. 明确不自动搬运问答记录、旧 planning 内容按新结构重写、归档任务不迁移不触碰。
- Expected: 技能正文无 open-nodes 标记引用；重写语义与新模板及 R9 边界一致。

### SR14 资产契约测试更新

- Covers: `AC2, AC4`
- Target: `packages/core/test/contract-asset.test.js#whole-file`
- Checks:
  1. open-nodes 标记断言删除或改写为反流水账文本断言；不保留对标记的任何存在性要求。
  2. questioning、merged-questions、batch-questions 等固定文本断言按 workflow.md 实际新文本逐句对照更新，不整段删除既有语义。
  3. 新增或更新对固定小节集合、主线连贯与反流水账规则的文本断言，断言强度不低于 PLAN 文本。
- Expected: contract-asset 测试在新资产上全绿，在实施前基线上失败（见 C1）。

### SR15 DSH 技能测试更新

- Covers: `AC4`
- Target: `packages/adapter-dsh/test/skills.test.js#whole-file`
- Checks:
  1. 对 alignment SKILL.md 的标记相关断言改为新结构断言：十一小节用途、反流水账规则、无标记要求。
  2. evals 断言更新为含 `align-narrative-coherent` 与 `align-narrative-log` 的 id 集合，并校验 prompt/assertions 无 CJK、断言非空。
- Expected: 新资产上 `node --test test/skills.test.js` 全绿；资产缺失或回退旧格式时该测试失败。

### SR16 Pi 技能测试与构建副本

- Covers: `AC4`
- Target: `packages/adapter-pi/test/skills.test.ts#whole-file`
- Checks:
  1. 与 SR15 同口径更新断言；测试仍运行在真实构建产物 `skills/` 目录，不从 assets 直接读取绕过构建。
  2. 构建副本由 sync-skills 重建，含新 SKILL.md 与 evals.json；不手改构建副本。
- Expected: `pnpm --filter @workloom-ai/adapter-pi build` 后 `bun test test/skills.test.ts` 通过；副本与 assets 内容一致。

### SR17 ESLint 全局忽略与归档不可变边界

- Covers: `AC5`
- Target: `eslint.config.js#ignores`
- Checks:
  1. 根配置为 `defineConfig` 平面配置，全局 `ignores` 统一新增 `'.workloom/**'`：任务文档、归档证据、case-evidence 与 coverage 临时脚本整体退出 lint 面，不按单个样本逐一路径排除。
  2. 既有忽略项（`**/dist/**`、`node_modules/**`、`.agents/**`、`.claude/**`、`docs/**`、`pnpm-lock.yaml`、`skills-lock.json`）全部保留，无删除或收窄。
  3. 配置只声明忽略，不含读取或改写 `.workloom/tasks/archive/` 的逻辑；归档文件不会被 lint 进程读取或修改（R9 归档不可变边界）。
  4. 运行验证由 C8 步骤 1 的根目录 `pnpm lint` 承担：exit 0 且运行前后归档目录字节不变。
- Expected: `pnpm lint` 通过；`.workloom/**` 在 ignores 中统一生效；既有忽略与 lint 规则面无收窄；归档目录零变化。

## Runtime Cases

以下命令在实施完成、代码进入最终态后执行。执行前先运行 `git -C "$WT" status --short` 取实际变更清单，逐一核对每个生产代码与手写声明文件都有 SR Target、其余文件有排除理由；出现清单外变更时先补 SR 或补排除再继续。固定变量：

```bash
REPO=/data00/home/wangyubo.1219/workbench/code-src/github/workloom
WT="$REPO/.workloom/worktree/11-06-prd-industry-format-overhaul"
TASK="$REPO/.workloom/tasks/11-06-prd-industry-format-overhaul"
```

### C1 红阶段：实施前基线上新测试先失败

- Covers: `AC1, AC3, AC4, AC5`
- Preconditions:
  1. 实施已完成并落在 `$WT` 分支；`git -C "$WT" merge-base HEAD main` 可取得实施前基线；`/tmp/wl-prd-red` 不存在；worktree 依赖已按配方准备。
  2. 本用例只在 detached worktree 中操作，不修改 `$WT` 的工作树内容。
- Steps:
  1. 运行 `BASELINE=$(git -C "$WT" merge-base HEAD main)` 与 `git -C "$WT" worktree add --detach /tmp/wl-prd-red "$BASELINE"`。
  2. 为基线树链接依赖：对根目录与 `packages/core`、`packages/adapter-dsh`、`packages/adapter-pi` 分别执行 `ln -s "$WT/<相对路径>/node_modules" "/tmp/wl-prd-red/<相对路径>/node_modules"`。
  3. 运行 `cd /tmp/wl-prd-red/packages/core && pnpm run build`，用旧源码生成旧 dist。
  4. 把本任务修改的 core 测试（task-gates、task-store、task-ops、case、alignment、doctor、contract-asset、worktree-compat、worktree-lifecycle、protocol）从 `$WT` 复制进基线树 `packages/core/test/`，并复制 `packages/adapter-dsh/test/skills.test.js` 与 `packages/adapter-pi/test/skills.test.ts`。
  5. 运行 `cd /tmp/wl-prd-red/packages/core && node --test test/task-gates.test.js test/task-store.test.js test/task-ops.test.js test/case.test.js test/alignment.test.js test/doctor.test.js test/contract-asset.test.js test/worktree-compat.test.js test/worktree-lifecycle.test.js test/protocol.test.js`，保存退出码与失败摘要。
  6. 运行 `cd /tmp/wl-prd-red/packages/adapter-dsh && node --test test/skills.test.js`；运行 `cd /tmp/wl-prd-red/packages/adapter-pi && node scripts/sync-skills.mjs && bun test test/skills.test.ts`。
- Expected:
  1. 三条命令均非 0；失败原因分别是：缺十一小节、缺 R/AC 问题码、不接受中文冒号、测试仍要求 open-nodes 标记、evals 缺叙述对照场景——全部指向缺失能力，不是依赖、网络或语法错误。
  2. 基线树上没有任何本任务实现文件可用；每条失败都能在证据中定位到具体缺失断言。
- Evidence:
  - `case-evidence/c1-red.txt`
- Cleanup: `git -C "$WT" worktree remove --force /tmp/wl-prd-red`

### C2 十一小节模板真实创建与占位判定

- Covers: `AC1, AC5`
- Preconditions:
  1. 实施完成，`$WT/packages/core` 的 dist 已按最终源码构建；临时目录 `/tmp/wl-prd-c2` 不存在。
- Steps:
  1. 在 `$WT/packages/core` 运行内联 Node 脚本：按测试夹具同款准备临时项目根（含 `.workloom/config.json` 与 spec 初始化，`worktree.enabled=false`），从 `dist/index.js` 调用 `createTask` 创建 full 任务。
  2. 读取生成的 prd.md：断言首行为 H1 任务标题；二级标题恰为 11 个且顺序与 PLAN 完全一致；每节正文为对应英文 placeholder 指引。
  3. 调用 `inspectPrdStructure(骨架原文)`：断言返回恰 11 条 `prd_section_placeholder` 问题，且不含任何 R/AC 追踪或 open-node 类问题码。
  4. 同一项目根再创建 light 任务：断言其 prd.md 除 H1 标题外与 full 骨架逐字节一致。
- Expected:
  1. full 与 light 均产出十一小节骨架，骨架与 `PRD_SECTIONS` 常量逐项一致。
  2. 骨架的结构问题只有 placeholder 一类，说明 R/AC 检查只针对已填写内容。
- Evidence:
  - `case-evidence/c2-template.txt`
- Cleanup: 删除 `/tmp/wl-prd-c2`

### C3 R/AC 编号、引用与验证方法格式

- Covers: `AC3`
- Preconditions:
  1. C2 的临时环境可复用；`inspectPrdStructure`、`evaluateStartGate`、`inspectPlanStructure` 可从 dist 导入。
- Steps:
  1. 构造 6 份最小 PRD 变体（十一小节骨架、Goal 已填、Requirements 与 Acceptance Criteria 各按变体填写）：空 Requirements、空 AC、R 编号重复、AC 编号重复、AC 引用未定义 R、AC 缺验证方法标识；逐一调用 `inspectPrdStructure`，记录问题码集合。
  2. 构造合法样本 A（英文冒号：`R1: ...`、`AC1: ... Covers R1. Verification: run the documented command.`）与样本 B（中文冒号：`R1：……`、`AC1（覆盖 R1、R6）：……验证方法是运行 core 模板与结构测试`），两者其余小节填写完整；断言两者问题数组均为空。
  3. 对样本 B 调用 `evaluateStartGate`（full 任务夹具）：断言通过；对 6 份变体分别调用：断言各被对应问题码拦截。
  4. 构造最小 plan.md 夹具（五字段协议）：步骤 Covers 覆盖样本 B 全部 AC 时 `inspectPlanStructure` 零问题；去掉一个 AC 的 Covers 后断言返回 `plan_ac_missing`。
- Expected:
  1. 每个缺陷变体命中恰一个目标问题码，两种冒号与三种验证方法标识均被接受，合法样本零问题。
  2. AC 与 plan 步骤 Covers 的双向追踪由机器检查保证。
- Evidence:
  - `case-evidence/c3-tracing.txt`
- Cleanup: 删除 C2/C3 共用的临时项目根

### C4 无开放节点标记的 review/confirm/start 全链路

- Covers: `AC1, AC4`
- Preconditions:
  1. `$WT/packages/core` 的 dist 已按最终源码构建；`executeAlignTask`、`startTask`、`inspectPrdStructure` 可导入；临时目录 `/tmp/wl-prd-c4` 不存在。
  2. 临时项目根按测试夹具同款配置：`worktree.enabled=false`，任务 `package` 已声明，`createTask` 时传入 contextKey 建立活跃指针。
- Steps:
  1. 内联 Node 脚本准备临时项目根，创建 full 任务，把 prd.md 覆写为完整新格式内容（Requirements 与 Acceptance Criteria 采用本任务 PRD 的真实条目文本），全文不含任何 HTML 注释。
  2. 写入合法 plan.md：H1 加 `## Steps`，至少一个步骤含 Covers/Target/Edit/Verify，Edit 内含五字段伪代码，Covers 覆盖该 PRD 的全部 AC 编号；向 implement.jsonl 与 check.jsonl 各追加一条有效记录（含 `file` 字段的 JSON 行）。
  3. 调用 `executeAlignTask`（action=review）：断言 `readyToConfirm` 为 true、结构问题为空；对结果对象做 `JSON.stringify` 后断言不含 `openNodeState` 字样。
  4. 调用 `executeAlignTask`（target=prd，action=confirm，非空 summary）：断言 PRD 确认记录写入 task.json；随后调用 `executeAlignTask`（target=plan，action=confirm，非空 summary）：断言 `task.planConfirmation` 非空。
  5. 调用 `startTask`：断言启动成功、任务状态转为 in_progress，且门禁不因缺少开放节点标记被拒。
  6. 对分别含 `<!-- workloom:open-nodes=none -->` 与 `<!-- workloom:open-nodes=pending -->` 文本的历史格式 PRD 调用 `inspectPrdStructure`：断言问题码集合均不含 `prd_open_nodes_missing`/`prd_open_nodes_not_none`；对输入文件计算 sha256 前后比对，断言字节未变。
  7. 动态导入 `dist/domain/alignment.js`：断言命名空间无 `findOpenNodeState` 与 `OPEN_NODE_MARKER`。
  8. 运行 `grep -rn "open-nodes\|findOpenNodeState\|OpenNodeState" "$WT/packages/core/src" "$WT/packages/assets"`：断言无命中；对 `packages/core/test` 的命中逐条核对为历史普通文本夹具，无程序化读取。
- Expected:
  1. 在 PRD 结构、PLAN 结构、PRD 与 PLAN 双确认、双 jsonl 记录齐备后，无标记的新格式任务全链路（review → prd confirm → plan confirm → start）可用，结果结构不再携带开放节点状态。
  2. 历史标记文本完全惰性：不产生问题码、不改变文件、运行时代码零残留。
- Evidence:
  - `case-evidence/c4-no-marker.txt`
- Cleanup: 删除 `/tmp/wl-prd-c4`

### C5 叙述质量对照评测

- Covers: `AC2`
- Preconditions:
  1. `workloom-alignment` 的 SKILL.md 与 evals.json 已按最终态更新。
- Steps:
  1. 解析 `$WT/packages/assets/skills/workloom-alignment/evals/evals.json`：断言 `skill_name` 为 `workloom-alignment`，id 集合含 `align-narrative-coherent` 与 `align-narrative-log`，且两个场景的 `assertions` 非空、prompt 与断言为英文。
  2. 断言 log 场景断言覆盖三类问题：按问答顺序堆叠条目、重复摘要同一事实、Alignment Decisions 含 Q/A 编号或逐轮答复；断言方向为判为内容质量问题或要求整改。
  3. 断言 coherent 场景断言方向为按能力组织、主线连贯被接受；两场景 prompt 均指向各自夹具 PRD，断言不引用模型自述。
  4. 运行 `cd "$WT/packages/core" && node --test test/contract-asset.test.js` 与 `cd "$WT/packages/adapter-dsh" && node --test test/skills.test.js`：两条命令的资产断言即评测定义的机检面。
- Expected:
  1. 两个对照场景齐全且方向正确：流水账样本被判为内容质量问题，连贯样本被接受。
  2. 两条测试命令 exit 0，资产测试与评测定义一致。
- Evidence:
  - `case-evidence/c5-narrative-evals.txt`
- Cleanup: `none`

### C6 轻量、旧 planning 与归档边界

- Covers: `AC5`
- Preconditions:
  1. `$WT/packages/core` 的 dist 已按最终源码构建；临时目录 `/tmp/wl-prd-c6` 不存在。
  2. 归档样本直接构造，不调用 `archiveTask`，不触碰真实仓库的 `tasks/archive/`。
- Steps:
  1. 内联 Node 脚本准备临时项目根：创建 light 任务，仅填 H1 与 Goal，其余小节留骨架；调用 `evaluateStartGate` 断言通过；把 Goal 换回 placeholder 再调用：断言被拒。R/AC 为空不参与轻量拦截。
  2. 同根创建 full 任务后，把 prd.md 覆写为旧四小节格式（含 `<!-- workloom:open-nodes=none -->`）模拟旧 planning 任务：记录文件 sha256；调用 `executeAlignTask`（action=review）：断言 `readyToConfirm` 为 false、结构问题列出缺失小节、问题码集合不含 `prd_open_nodes_*`；再次计算 sha256：断言文件未被改写。
  3. 直接在临时根写入已归档任务夹具 `.workloom/tasks/archive/2026-11/prd-legacy-archive/`：含旧格式 task.json 与带 `<!-- workloom:open-nodes=pending -->` 的旧四小节 prd.md；对整个夹具目录建立 sha256 清单。
  4. 对归档 prd 文本调用 `inspectPrdStructure`：断言问题码集合不含 `prd_open_nodes_*`（缺节类问题允许存在，归档不受门禁约束）；对临时项目根运行 doctor 后重建夹具目录清单：断言逐字节零变化，归档任务未被任何工具链操作改写。
- Expected:
  1. 轻量边界成立：只查 H1 与 Goal，骨架其余小节与 R/AC 不拦截。
  2. 旧 planning 任务不被自动改写：门禁拒绝旧格式而非静默通过，文件字节保持不变，改写责任留给主会话。
  3. 归档任务不可变：只读检查前后夹具目录零字节变化，历史标记文本无害。
- Evidence:
  - `case-evidence/c6-boundaries.txt`
- Cleanup: 删除 `/tmp/wl-prd-c6`

### C7 双 adapter 一致

- Covers: `AC4`
- Preconditions:
  1. 资产与测试已按最终态更新；没有并行构建进程。
- Steps:
  1. 运行 `cd "$WT" && pnpm --filter @workloom-ai/adapter-dsh --filter @workloom-ai/adapter-pi build`。
  2. 运行 `cd "$WT/packages/adapter-dsh" && node --test test/skills.test.js` 与 `cd "$WT/packages/adapter-pi" && bun test test/skills.test.ts`。
  3. 检查 Pi 构建副本：`test -f "$WT/packages/adapter-pi/skills/workloom-alignment/SKILL.md"` 与 `test -f "$WT/packages/adapter-pi/skills/workloom-alignment/evals/evals.json"`；对副本运行 `grep -rn "open-nodes" ...` 断言无命中。
  4. 对比 `packages/adapter-dsh/dist/skills.js` 内的资产清单与 `packages/adapter-dsh/src/skills.ts`：逐项一致。
- Expected:
  1. 两套技能测试 exit 0，断言均为新格式口径。
  2. Pi 构建副本与 assets 一致，DSH dist 与 src 一致，无手工编辑产物。
- Evidence:
  - `case-evidence/c7-adapters.txt`
- Cleanup: `none`

### C8 标准验证与真实新格式样本

- Covers: `AC1, AC2, AC3, AC4, AC5`
- Preconditions:
  1. 全部 SR 与 C1–C7 已完成；代码进入最终状态，不再修改源码。
- Steps:
  1. 对 `$WT/.workloom/tasks/archive/` 建立 sha256 清单；运行 `cd "$WT" && pnpm lint && pnpm -r typecheck && pnpm -r build`，记录各命令退出码；lint 运行后重建归档清单并比对：断言逐字节零变化。
  2. 运行 `cd "$WT/packages/core" && node --test 'test/*.test.js'`、`cd "$WT/packages/adapter-dsh" && node --test 'test/*.test.js'`、`cd "$WT/packages/adapter-pi" && bun test 'test/*.test.ts'`。
  3. 只读结构检查真实样本：内联脚本对 `$TASK/prd.md` 调用 `inspectPrdStructure`，断言零问题（中文冒号、`（覆盖 R…）` 与 `验证方法是` 被接受）；对 `$TASK/plan.md` 与 prd 调用 `inspectPlanStructure`，断言零问题；对两文件前后计算 sha256，断言检查过程未改写样本，也不得为通过检查改写任务 PRD。
  4. 用实际变更复核 CASE 覆盖：收集 `git -C "$WT" status --short` 与 `git -C "$WT" diff --name-only main` 的并集作为 changedFiles，调用 `inspectCaseStructure(case, prd, { changedFiles })`，断言零 `changed_file_unreviewed` 问题（生产代码与手写声明逐文件有 SR Target，其余有排除理由）。
  5. 运行 `grep -rn "open-nodes" "$WT/packages/core/src" "$WT/packages/assets"`：断言无命中；对资产中"逐轮答复、问答记录"字样的命中逐条核对均为禁止性规则表述，不是操作指引。
  6. 记录 `packages/core/dist` 与 `packages/adapter-dsh/dist` 的文件 sha256 清单；再次运行 `pnpm -r build` 后重新计算并比对：断言一致。
- Expected:
  1. 全部命令 exit 0；修改过的 TS 文件无类型错误；lint 运行前后归档目录逐字节零变化。
  2. 本任务 PRD 作为真实新格式样本零问题且未被改写；实际变更全部有 SR Target 或排除理由；构建产物可复现。
- Evidence:
  - `case-evidence/c8-verification.txt`
- Cleanup: `none`

### C9 覆盖率采集与适用文件集合

- Covers: `AC1, AC3`
- Preconditions:
  1. C8 已通过；Node 24 可用；`$WT/packages/core` 已按最终源码构建；`$TASK/coverage` 不含旧报告。
- Steps:
  1. 按 Coverage 小节的 Aggregate command 运行 core 全量测试的 LCOV 采集与合并脚本。
  2. 断言合并后的 `coverage/lcov.info` 恰含 5 条 SF 记录：`packages/core/src/domain/task-gates.js`、`task-store.js`、`alignment.js`、`packages/core/src/service/alignment-service.ts`、`doctor-check-rules.ts`。
  3. 读取 `coverage/summary.txt`：断言含每个文件的 `covered/total percentage` 与一行 `TOTAL covered/total (percentage%)`，每个文件的覆盖率大于 0，总行数大于 0。
  4. 断言 `coverage/lcov-core.info` 与 `coverage/core-test.log` 存在且非空；报告中没有 dist、测试文件或资产文本的 SF 记录混入。
- Expected:
  1. 5 个变更可执行文件都有真实行覆盖数据，Overall 可从 summary 的 TOTAL 行直接取得。
  2. 覆盖率来自真实测试运行，不是手写数字或空报告；排除项与 Coverage 小节一致。
- Evidence:
  - `case-evidence/c9-coverage.txt`
  - `coverage/lcov.info`
  - `coverage/summary.txt`
- Cleanup: `none`

## Coverage

- Tool: `Node v24 内置覆盖率（--experimental-test-coverage --test-reporter=lcov --enable-source-maps）`
- Instrumentation: `只对 core 全量真实测试覆盖到的 5 个变更可执行文件生成 LCOV：domain JS（task-gates.js、task-store.js、alignment.js）由测试直接 import src 归因；service TS（alignment-service.ts、doctor-check-rules.ts）经 dist 加载并用 source map 归因到 src/*.ts。合并脚本按仓库相对路径只保留 Scope 列出的文件，同一行命中取最大值；测试、dist、资产文本与 .workloom 元数据均不混入。本任务存在可真实覆盖的可执行文件，因此不使用 not_applicable；只有可覆盖文件集合为空时才允许 not_applicable，并在排除项中逐条写明理由。`
- Aggregate command:
```bash
set -euo pipefail
REPO=/data00/home/wangyubo.1219/workbench/code-src/github/workloom
WT="$REPO/.workloom/worktree/11-06-prd-industry-format-overhaul"
TASK="$REPO/.workloom/tasks/11-06-prd-industry-format-overhaul"
mkdir -p "$TASK/coverage"
(cd "$WT/packages/core" && node --enable-source-maps --experimental-test-coverage --test-reporter=lcov --test 'test/*.test.js') \
  > "$TASK/coverage/lcov-core.info" 2> "$TASK/coverage/core-test.log"
cat > "$TASK/coverage/merge-lcov.mjs" <<'MERGE'
import { readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'

const [dir, repo] = process.argv.slice(2)
if (dir === undefined || repo === undefined) throw new Error('usage: node merge-lcov.mjs <coverage-dir> <repo-root>')
const scoped = new Set([
  'packages/core/src/domain/task-gates.js',
  'packages/core/src/domain/task-store.js',
  'packages/core/src/domain/alignment.js',
  'packages/core/src/service/alignment-service.ts',
  'packages/core/src/service/doctor-check-rules.ts',
])
const files = new Map()
let current = null
for (const line of readFileSync(join(dir, 'lcov-core.info'), 'utf8').split('\n')) {
  if (line.startsWith('SF:')) {
    const source = line.slice(3).trim()
    const rel = relative(repo, isAbsolute(source) ? source : resolve(repo, 'packages/core', source))
    current = scoped.has(rel) ? rel : null
    if (current !== null && !files.has(current)) files.set(current, new Map())
    continue
  }
  if (line.startsWith('DA:') && current !== null) {
    const [lineNo, hits] = line.slice(3).split(',')
    const bucket = files.get(current)
    const key = Number(lineNo)
    bucket.set(key, Math.max(Number(hits), bucket.get(key) ?? 0))
  }
}
const paths = [...files.keys()].sort()
let total = 0
let covered = 0
const out = ['TN:']
const summary = []
for (const path of paths) {
  const bucket = files.get(path)
  const lines = [...bucket.keys()].sort((a, b) => a - b)
  let hit = 0
  out.push(`SF:${path}`)
  for (const line of lines) {
    const count = bucket.get(line)
    hit += count > 0 ? 1 : 0
    out.push(`DA:${line},${count}`)
  }
  out.push(`LF:${lines.length}`, `LH:${hit}`, 'end_of_record')
  total += lines.length
  covered += hit
  summary.push(`${path} ${hit}/${lines.length} ${((hit / lines.length) * 100).toFixed(1)}%`)
}
summary.push(`TOTAL ${covered}/${total} (${((covered / total) * 100).toFixed(1)}%)`)
writeFileSync(join(dir, 'lcov.info'), `${out.join('\n')}\n`)
writeFileSync(join(dir, 'summary.txt'), `${summary.join('\n')}\n`)
console.log(summary.at(-1))
MERGE
node "$TASK/coverage/merge-lcov.mjs" "$TASK/coverage" "$REPO"
```
- Scope:
  - `packages/core/src/domain/task-gates.js`
  - `packages/core/src/domain/task-store.js`
  - `packages/core/src/domain/alignment.js`
  - `packages/core/src/service/alignment-service.ts`
  - `packages/core/src/service/doctor-check-rules.ts`
- Exclusions:
  - `eslint.config.js`: 根 ESLint 平面配置，无独立测试可注入；由 SR17 与 C8 的 pnpm lint 运行验证覆盖
  - `packages/core/src/domain/task-gates.d.ts`: 手写类型声明，无运行时行为；由 SR2 与 typecheck 覆盖
  - `packages/core/src/domain/alignment.d.ts`: 手写类型声明，无运行时行为；由 SR5 与 typecheck 覆盖
  - `packages/core/src/index.ts`: 仅删除公开导出，无分支逻辑；由 SR7 与 C4 的动态导入断言覆盖
  - `packages/core/test/`: 测试代码，由 C1 红阶段与 C8 全量运行覆盖；contract-asset.test.js 另有 SR14 直接审查
  - `packages/core/dist/`: tsc 构建产物，由 C8 两次构建比对校验
  - `packages/assets/workflow/`: Markdown 运行指引，由 SR9/SR10 与 C4/C5 文本断言覆盖
  - `packages/assets/skills/workloom-alignment/`: 技能正文与评测定义，由 SR11/SR12、C5 与资产测试覆盖
  - `packages/assets/skills/workloom-migrate-plan/SKILL.md`: Markdown 运行指引，由 SR13 与资产测试覆盖
  - `packages/adapter-dsh/test/`: 测试代码，由 C1/C7/C8 覆盖；skills.test.js 另有 SR15 直接审查
  - `packages/adapter-pi/test/`: 测试代码，由 C1/C7/C8 覆盖；skills.test.ts 另有 SR16 直接审查
  - `packages/adapter-dsh/dist/`: 构建产物，由 C7/C8 校验
  - `packages/adapter-pi/skills/`: gitignore 的构建副本，由 C7 校验
- Raw outputs:
  - `coverage/lcov-core.info`
  - `coverage/lcov.info`
  - `coverage/summary.txt`
  - `coverage/core-test.log`

## Traceability

| AC | Static review | Runtime cases |
| --- | --- | --- |
| AC1 | SR1, SR2, SR3, SR4, SR5, SR6, SR7, SR8, SR9 | C1, C2, C4, C6, C8, C9 |
| AC2 | SR9, SR11, SR12, SR14 | C5, C8 |
| AC3 | SR1 | C1, C3, C8, C9 |
| AC4 | SR4, SR5, SR6, SR7, SR9, SR10, SR11, SR12, SR13, SR14, SR15, SR16 | C1, C4, C5, C7, C8 |
| AC5 | SR3, SR9, SR10, SR13, SR17 | C1, C2, C6, C8 |
