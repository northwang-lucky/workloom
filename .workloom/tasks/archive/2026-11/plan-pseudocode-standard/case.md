---
version: 1
task: tasks/11-06-plan-pseudocode-standard
---

# CASE: 改造 PLAN 伪代码编写规范

## References

- PRD: `prd.md`
- Implementation: `plan.md`
- Code target: `workloom/11-06-plan-pseudocode-standard @ .workloom/worktree/11-06-plan-pseudocode-standard（base main）`
- Source task: `none`

## Scope

- Requirements: `R1–R8`
- Acceptance criteria: `AC1–AC4`
- Out of scope:
  - workflow 的步骤集合、状态机与协议版本：只改 1.4 Authoring bar 与 planning 面包屑括注，不新增步骤，`version: 25` 不变。
  - 已归档任务目录（含归档 PLAN）：本任务不读取、不修改、不迁移任何归档内容。
  - 第一个子任务 tasks/11-06-simplify-document-confirmations 已落地的 PRD/PLAN 两次内容确认顺序：只验证在新协议下保持有效，不重构确认机制。
  - 前端 UI 与浏览器验证：本任务不改前端，不产生 UI Design 要求。
  - 双 adapter 源码的协议判断逻辑：adapter 只同步技能与文本测试预期，不复制核心校验实现。
  - dist 与 Pi skills 构建副本的手工编辑：一律由构建命令生成并核对。

## Static Review

### SR1 PLAN 协议字段结构校验

- Covers: `AC1, AC4`
- Target: `packages/core/src/domain/task-gates.js#inspectPlanStructure`
- Checks:
  1. 五个协议字段定义为单一有序常量（`Input`、`Output`、`Preconditions`、`Procedure`、`Failure`），判断逻辑不重复书写字段名；外层 `Covers`/`Target`/`Edit`/`Verify` 检查与既有问题码（`plan_missing`/`plan_title_missing`/`plan_steps_missing`/`plan_steps_empty`/`plan_step_field`/`plan_ac_missing`）保留。
  2. 只解析当前步骤 `- Edit:` 行到该步骤 `Verify:` 行之间的正文；步骤缺 `Edit` 时只报外层字段问题，不产生协议字段问题，也不把 `Verify` 或后续步骤里的同名文本当作协议内容。
  3. 字段识别只认 Edit 区域公共缩进剥离后行首的 `字段名:`；bullet（`- Input:`）、额外缩进和无冒号形式均不识别。
  4. 字段值允许位于冒号后或后续缩进行；空值与纯空白按缺失内容报告，`none` 是合法值；缺失与空值按常量顺序逐一报告。
  5. 五字段齐全时比较出现位置：乱序与重复（含 Procedure 续行内再次行首出现字段名）返回区别于缺失的问题码。
  6. PRD 的 AC 覆盖聚合保留；协议问题与 AC 问题在同一次 `inspectPlanStructure` 调用中一并返回。
- Expected: 合法五字段伪代码（含 `none` 值）零问题；任一字段缺失、为空、乱序或重复时返回可区分诊断（C2 矩阵钉死）。

### SR2 协议校验测试矩阵与夹具清扫

- Covers: `AC1`
- Target: `packages/core/test/task-gates.test.js#inspectPlanStructure`；`task-ops.test.js`、`task-store.test.js`、`case.test.js`、`worktree-compat.test.js`、`worktree-lifecycle.test.js` 的 `- Edit:` 夹具
- Checks:
  1. 新增用例覆盖：合法五字段通过、五字段逐一缺失被拒、空字段被拒、乱序被拒、重复字段被拒、字段名出现在 Verify 区域/后续步骤/Procedure 续行时不被误识别、`Edit` 缺失只报外层问题、`Preconditions: none` 与 `Failure: none` 合法。
  2. 六个测试文件中的全部 `- Edit:` 夹具统一升级为合法五字段伪代码，不含完整修改后代码或新文件完整实现。
  3. 负面断言检查具体问题码或字段名消息，不用"有任何问题"的宽松判断代替字段级断言。
  4. AC 覆盖回归用例保留（Covers 漏掉某 AC 时仍报 `plan_ac_missing`）；测试无网络与全局副作用。
- Expected: `node --test test/task-gates.test.js` 通过；任一夹具回退旧四字段或缺协议字段样本时测试转红（C1/C2 验证）。

### SR3 confirm 复用同一结构分类器

- Covers: `AC4`
- Target: `packages/core/src/service/alignment-service.ts#executeAlignTask`
- Checks:
  1. `executeAlignTask` 的 target=plan review（结构诊断，`structureIssues`）与 confirm（blockers 聚合）仍调用同一个 `inspectPlanStructure`，服务层不复刻字段判断逻辑。
  2. 结构不合格时 confirm 被 blockers 聚合拒绝、`readyToConfirm=false`，失败零写入；其余参数与错误透传不变。
- Expected: 缺任一协议字段时，review 的 `structureIssues` 与 confirm 的 blockers 同源同文（C3 端到端验证）。

### SR4 start 门禁保持结构归类与顺序

- Covers: `AC4`
- Target: `packages/core/src/domain/task-gates.js#evaluateStartGate`
- Checks:
  1. 检查顺序保持 PRD 结构 → PLAN 结构 → PLAN 内容确认 → PRD 内容确认；协议问题归入 PLAN 结构阶段，结构不合格时不追加 `PLAN_NOT_CONFIRMED`。
  2. 容器任务（children 非空）与轻量任务豁免语义不变；协议问题与 AC 问题一并进入 start 缺失项。
  3. `packages/core/src/service/task-ops.ts` 的启动硬阻断注释与实际门禁顺序一致，维持"PLAN 结构/确认缺失"措辞，无哈希或逐字代码语义；该文件本任务不预计改动。
- Expected: 缺协议字段时 start 的缺失项含对应结构问题且不叠加确认缺失（C3 端到端验证）。

### SR5 workflow 写作门槛与面包屑括注

- Covers: `AC2, AC4`
- Target: `packages/assets/workflow/workflow.md#1.4-authoring-bar--planning-state`
- Checks:
  1. 1.4 Authoring bar 改为：每步绑定文件路径与符号；`Edit` 按序含五字段，无前置条件或失败路径写 `none`；少量现状代码仅作唯一定位锚点，禁止完整修改后代码与新文件完整实现；每步以验证命令与预期收尾；无锚点指令仍是缺陷。
  2. 删除 `every edit carries the exact before/after code`、`every new file carries its full content` 两处旧要求；planning 面包屑括注不再出现 `exact code change`。
  3. `version: 25`、states、`####` 步骤集合与顺序不变；Loading protocol 纪律句与 2.1 末尾集中提问处置句逐字保留（以 main 基线文本为对照）。
  4. PLAN 内容确认与启动条件表述保持：结构合格才进入内容确认，缺协议字段时不确认、不启动。
- Expected: 正文可定位五字段要求与锚点边界；`protocol.test.js` 与 `contract-asset.test.js` 通过（C4 验证）。

### SR6 alignment 技能主文件

- Covers: `AC2, AC3`
- Target: `packages/assets/skills/workloom-alignment/SKILL.md#plan-authoring-pointer`
- Checks:
  1. Phase 1.3/1.4 写作指针改为读取 plan-authoring reference 并满足伪代码门槛（五字段协议 + 真实锚点 + 验证命令），删除 `exact code change` 措辞。
  2. 收敛协议、`readyToConfirm` 门禁、两次内容确认与变更重入表述不变。
  3. 正文保持英文，无 CJK。
- Expected: 新门槛关键句可定位；DSH 技能测试的 alignment 断言通过（C6 验证）。

### SR7 PLAN 编写参考

- Covers: `AC2`
- Target: `packages/assets/skills/workloom-alignment/references/plan-authoring.md#Edit-field-template`
- Checks:
  1. `Edit` 字段模板按序给出五部分：输入与定位锚点（Input）、行为结果（Output）、前置条件（Preconditions，无则 `none`）、处理过程（Procedure）、失败路径（Failure，无则 `none`）。
  2. 删除 before/after 终稿代码与新文件完整内容要求；modify/new-file 两形态改写为"少量现状代码仅作唯一定位锚点 + 结构化伪代码描述行为"。
  3. 写作规则改为锚点真实性与行为完整性要求；保留 `Covers`/`Target`/`Edit`/`Verify` 外层结构与 AC 覆盖完成判据。
  4. 正文保持英文，无 CJK。
- Expected: 参考文档不再含 `before-snippet`/`after-snippet`/`Before/after code is final content` 类终稿要求（C1 扫描与 C4 断言共同钉死）。

### SR8 alignment 评测

- Covers: `AC3`
- Target: `packages/assets/skills/workloom-alignment/evals/evals.json#evals`
- Checks:
  1. JSON 可解析；与 PLAN 编写相关场景的 `expected_output`/`assertions` 明确接受合法五字段伪代码。
  2. 缺输入输出、缺异常路径或缺验证的场景被列为问题，断言含对应关键词（协议字段/异常路径/验证命令）。
  3. 无场景要求逐字终稿代码或完整新文件内容；断言文本保持英文，无 CJK。
- Expected: 评测预期与新标准一致（C4 验证）。

### SR9 迁移技能

- Covers: `AC2`
- Target: `packages/assets/skills/workloom-migrate-plan/SKILL.md#plan-rewrite-step`
- Checks:
  1. 重写 plan 的步骤要求迁移产物同样使用五字段协议，不再生成旧四字段格式；锚点核对步骤与"少量现状代码仅定位"边界一致。
  2. `## Step 1: Scan` 至 `## Step 4: Confirm, then remove the originals` 标题与 DSH 测试锚定的关键句（`Covers`、`[executed <commit/date> — <verification state>]`）保持或与测试同步更新。
  3. 正文保持英文，无 CJK。
- Expected: 迁移后的 PLAN 满足新结构校验的文档要求可定位（C4 验证）。

### SR10 执行器纪律与评审指引

- Covers: `AC3`
- Target: `packages/core/src/domain/executor-context.js#PRESCRIPTIVE_PLAN_DISCIPLINE--review-directives`
- Checks:
  1. implement/frontend 共用的规定式纪律句改为：跟随协议字段、真实锚点与验证命令执行；锚点与现场不符时作为阻塞项上报；不再要求逐字执行代码块。
  2. review 的 Conformance 改为检查真实锚点、行为完整性、协议字段、异常路径、AC 覆盖与可验证性；Feasibility 改为核对锚点唯一可定位、伪代码契合现场、验证命令可运行，删除 `before-snippets locate uniquely, after-code fits its context` 寻码要求。
  3. Fidelity/Quality 两段、其余 kind 纪律段与中文注释/英文纪律句的语言分工不变。
- Expected: `EXECUTOR_CONTRACT_BY_KIND` 的 implement/frontend/review 文本可定位新纪律，旧逐字句清零（C5 验证）。

### SR11 资产与纪律文本测试

- Covers: `AC2, AC3`
- Target: `packages/core/test/contract-asset.test.js#authoring-bar--plan-ref-assertions`
- Checks:
  1. Authoring bar 逐字断言改为五字段伪代码关键句（删除"缺精确前后代码要求"类旧断言）；plan-authoring reference 的固定文案断言（`- **Covers** —`、`` `(internal)` ``、AC 覆盖）保留并补充协议字段断言。
  2. `packages/core/test/executor-context.test.js` 的纪律句逐字断言更新为新句子，不通过删除断言规避。
  3. `protocol.test.js` 无需修改即通过（版本 25 与步骤集合不变）。
- Expected: 三个测试文件全部通过；旧关键句回潮或新句缺失时断言转红（C1/C4/C5 验证）。

### SR12 DSH 技能测试同步

- Covers: `AC3`
- Target: `packages/adapter-dsh/test/skills.test.js#migrate-plan--alignment-assertions`
- Checks:
  1. migrate-plan 的 Step 标题与边界短语断言、alignment 资产断言与最终资产一致；失配处更新测试预期而非删除断言。
  2. 测试只断言资产文本与解析行为，不复制五字段判断逻辑。
- Expected: `pnpm test` 全套通过（C6 验证）。

### SR13 Pi 技能构建副本与测试同步

- Covers: `AC3`
- Target: `packages/adapter-pi/test/skills.test.ts#skills-manifest`；`packages/adapter-pi/skills/`（sync-skills 构建副本）
- Checks:
  1. skills 产物清单断言保持既有目录集合；构建后副本与 `packages/assets/skills/` 源文件一致。
  2. 测试预期按需同步，不复制协议判断逻辑；不手工编辑构建副本。
- Expected: `pnpm build && bun test test/*.test.ts` 通过（C6 验证）。

## Runtime Cases

固定变量（路径与 task.json 的 worktree 一致）：

```bash
REPO=/data00/home/wangyubo.1219/workbench/code-src/github/workloom
WT="$REPO/.workloom/worktree/11-06-plan-pseudocode-standard"
TASK="$REPO/.workloom/tasks/11-06-plan-pseudocode-standard"
```

所有源码、构建与测试命令在 `$WT` 执行；CASE 证据与覆盖率写入 `$TASK`。运行时机：实施完成且主会话确认没有未完成的实现或检查派发之后。

### C1 全量验证、旧要求清空扫描与覆盖率

- Covers: `AC1, AC2, AC3, AC4`
- Preconditions:
  1. 实施完成、无并行构建或测试进程；`$WT` 依赖已按 worktree 配方准备，`$TASK/coverage` 与 `$TASK/case-evidence` 可写。
  2. `node --version` 为 v24（内置 `--experimental-test-coverage` 与 lcov reporter），`pnpm` 与 `bun` 可用。
- Steps:
  1. 运行 `cd "$WT" && pnpm lint && pnpm -r typecheck && pnpm -r build`，保存完整输出与退出码。
  2. 运行 `cd "$WT/packages/core" && node --test 'test/*.test.js'`，保存通过/失败统计，确认没有跳过协议相关用例。
  3. 运行内联 Node 扫描脚本（JS 先剥离 `//` 与 `/* */` 注释再匹配）：扫描 `packages/assets/workflow/workflow.md`、`packages/assets/skills/workloom-alignment/SKILL.md`、`packages/assets/skills/workloom-alignment/references/plan-authoring.md`、`packages/assets/skills/workloom-alignment/evals/evals.json`、`packages/assets/skills/workloom-migrate-plan/SKILL.md`、`packages/core/src/domain/executor-context.js`；断言 `exact before/after code|carries its full content|Before/after code is final content|before-snippet|after-snippet|after-code|exact code change` 命中数为 0。
  4. 同一脚本断言存在性：五个协议字段名（`Input`、`Output`、`Preconditions`、`Procedure`、`Failure`）在 workflow.md、plan-authoring.md、migrate-plan SKILL.md 三处全部出现，且 workflow.md 与 plan-authoring.md 含 `pseudocode`（不区分大小写）。
  5. 运行 Coverage 中的聚合命令，生成 `coverage/lcov-core.info`、`coverage/summary.txt`、`coverage/coverage-test.log`，按实际 changed 文件计算 Overall lines。
  6. `git -C "$WT" status --short` 确认 `packages/core/dist` 与 `packages/adapter-dsh/dist` 由第 1 步构建生成，无手工编辑痕迹。
- Expected:
  1. lint、typecheck、build 退出码均为 0；core 全套测试通过。
  2. 五个资产/源码文件中旧终稿代码要求命中数为 0；五字段要求在三个编写类资产中全部可定位。
  3. 覆盖率成功生成；变更的 core 可执行文件都在 lcov 中有记录，Overall lines 可复算。
- Evidence:
  - `case-evidence/c1-gates.txt`
  - `case-evidence/c1-absence-scan.txt`
  - `coverage/lcov-core.info`
  - `coverage/summary.txt`
  - `coverage/coverage-test.log`
- Cleanup: `none`

### C2 PLAN 协议结构校验矩阵与本任务自证

- Covers: `AC1`
- Preconditions:
  1. C1 已通过，`$WT/packages/core/dist` 为最新构建（校验器从 dist 导入）。
  2. 内联 Node 脚本自建全部 PLAN 样本文本，不读写真实任务目录（自证样本只读）。
- Steps:
  1. `node --input-type=module` 脚本从 `file://$WT/packages/core/dist/domain/task-gates.js` 动态导入 `inspectPlanStructure`，准备含 `AC1` 的最小 PRD 文本。
  2. 构造合法样本 VALID：H1 + `## Steps` + `#### 步骤 1 探针`，`Covers: AC1`，`Edit` 内按序含五字段且 `Preconditions: none`、`Failure: none`；断言 `inspectPlanStructure(VALID, PRD)` 返回 `[]`。
  3. 缺字段矩阵：对五个字段各生成删除该字段的变体，断言每个变体问题非空、消息指向被删字段，且五个变体的诊断互不相同。
  4. 空字段：`Input:`（冒号后无内容且无缩进续行）被拒；`Preconditions: none` 与 `Failure: none` 保持合法。
  5. 乱序：五字段齐全但 `Failure` 位于 `Input` 之前，断言返回乱序类问题码且区别于缺失类。
  6. 重复：`Edit` 内出现两行行首 `Input:`（第二处位于 Procedure 续行），断言被拒并返回重复/乱序类问题。
  7. 跨区域：在 `Verify` 行之后与下一步骤正文放行首 `Input: ...`，当前步骤 Edit 缺 `Input` 时仍报缺 `Input`；后续步骤的 `Failure:` 行不污染当前步骤判定。
  8. `Edit` 缺失：步骤只有 `Covers`/`Target`/`Verify`，断言只报外层字段问题、无协议字段问题。
  9. AC 覆盖：PRD 含 `AC1`/`AC2` 而 Covers 只写 `AC1`，断言返回 `plan_ac_missing`。
  10. 自证：读取 `$TASK/prd.md` 与 `$TASK/plan.md`，断言 `inspectPlanStructure(plan, prd)` 返回 `[]`（本任务 PLAN 本身是不含完整实现代码的伪代码 PLAN，构造性证明 R1/R4）。
- Expected:
  1. 合法五字段与 `none` 值通过；缺字段、空字段、乱序、重复、跨区域误识别各自被拒且诊断可区分。
  2. 本任务真实 PLAN 在新校验器下零问题。
- Evidence:
  - `case-evidence/c2-protocol-matrix.txt`
- Cleanup: `none`（脚本只读真实文件，样本常驻内存）

### C3 confirm/start 共用校验端到端

- Covers: `AC4`
- Preconditions:
  1. C1 已通过；临时项目根由脚本 `mkdtempSync` 创建并在 finally 删除。
  2. 不需要用户输入；不读取真实任务记录。
- Steps:
  1. 内联 Node 脚本创建临时根，`initWorkloom(root)` 后写 `config.local.json` 关闭 worktree；`executeCreateTask(root, 'probe', { title: 'Pseudocode Gate Probe', package: 'repo' })` 建完整任务。
  2. 先写破坏样本：合法 prd.md（H1、Goal、Requirements、Acceptance Criteria 含 AC1、Notes、`<!-- workloom:open-nodes=none -->`）与缺 `Failure` 字段的 plan.md，另写两个各含一条真实记录的 jsonl。
  3. 调用 `executeAlignTask(root, 'probe', { target: 'prd', action: 'confirm', summary: 'PRD 内容确认' })` 成功；随后 target=plan review，断言 `readyToConfirm === false` 且 `structureIssues` 指向 `Failure` 缺失；target=plan confirm 被拒（blockers 非空）；`executeStartTask(root, 'probe', {})` 被拒且消息含同一结构问题。
  4. 把 plan.md 换成乱序样本（字段齐全但顺序颠倒），重复第 3 步三类断言，确认乱序同样拦截 confirm 与 start。
  5. 再换成 Covers 漏掉 PRD 某个 AC 的样本，断言 review 报 `plan_ac_missing`、confirm 与 start 均被拒。
  6. 写入合法五字段伪代码 plan.md（Covers 覆盖 PRD 全部 AC）：target=plan review 断言 `readyToConfirm === true` 且 `structureIssues` 为空；target=plan confirm 成功；读 task.json 断言 `planConfirmation` 键集合恰为 `['passedAt','summary']`；`executeStartTask` 成功且 status 为 `in_progress`。
  7. 清理临时根并断言无残留。
- Expected:
  1. 缺字段、乱序、AC 覆盖缺失三类缺陷下，align review/confirm 与 task start 返回同源问题，三类入口全部拒绝。
  2. 合法伪代码 PLAN 一次通过 review → confirm → start，确认记录与既有两次内容确认机制兼容。
- Evidence:
  - `case-evidence/c3-confirm-start.txt`
- Cleanup: 脚本 finally 删除临时根，`/tmp` 无残留探针目录。

### C4 workflow 与编写/迁移资产伪代码标准一致

- Covers: `AC2, AC3`
- Preconditions:
  1. C1 已通过，资产为最终版本。
  2. 以 main 基线（`git -C "$WT" show main:packages/assets/workflow/workflow.md`）作为逐字保留句的对照。
- Steps:
  1. Node 脚本读 `$WT/packages/assets/workflow/workflow.md`：断言 1.4 Authoring bar 含五字段要求与锚点边界表述、不含 `exact before/after code` 与 `carries its full content`；planning 面包屑不含 `exact code change`；从基线文本断言 Loading protocol 纪律句、2.1 末尾集中提问处置句逐字保留，`version: 25` 与 `####` 步骤 id 集合不变。
  2. 读 plan-authoring.md：断言五字段模板按序齐全、`none` 语义、现状代码仅定位边界，且无 `before-snippet`/`after-snippet`/`final content`；`- **Covers** —`、`` `(internal)` `` 与 AC 覆盖完成判据保留。
  3. 读 alignment SKILL.md 与 migrate-plan SKILL.md：断言写作指针改为伪代码门槛、migrate-plan 含五字段要求且 Step 1–4 标题保留。
  4. 解析 evals.json：断言含伪代码计划场景（合法通过）、含缺行为协议/异常路径/验证被列为问题的断言关键词；无要求完整代码的场景。
  5. 语言扫描：上述四个资产文件与 evals.json 均无 CJK 字符。
  6. 运行 `cd "$WT/packages/core" && node --test test/contract-asset.test.js test/protocol.test.js`。
- Expected: 四个资产与评测采用同一套五字段伪代码标准；workflow 步骤集合、版本与保留句不变；契约与协议测试通过。
- Evidence:
  - `case-evidence/c4-assets.txt`
- Cleanup: `none`

### C5 执行器纪律与评审指引注入

- Covers: `AC3`
- Preconditions:
  1. C1 已通过，core dist 为最新构建。
  2. 只读 `EXECUTOR_CONTRACT_BY_KIND` 导出与源码文本，不需要任务夹具。
- Steps:
  1. Node 脚本从 `file://$WT/packages/core/dist/index.js` 导入 `EXECUTOR_CONTRACT_BY_KIND`：断言 implement 与 frontend 纪律段含新的伪代码执行纪律（协议字段、真实锚点、验证命令、锚点失配阻塞上报关键词），不含旧句 `follow its file, symbol, and snippet anchors and its code blocks exactly`。
  2. 断言 review 纪律段 Conformance 含协议字段/行为完整性/异常路径/AC 覆盖/可验证性关键词，Feasibility 含锚点定位与验证命令可运行关键词；`before-snippets`/`after-code` 逐字句清零。
  3. 断言 Fidelity/Quality 两段与 check/research 等其余 kind 纪律段未被本任务改动语义（与 main 基线对照仅 implement/frontend/review 三段变化）。
  4. 运行 `cd "$WT/packages/core" && node --test test/executor-context.test.js`。
- Expected: 实施纪律跟随伪代码协议，评审纪律把缺失协议字段、异常路径、验证列为问题；注入文本与 SR10 一致。
- Evidence:
  - `case-evidence/c5-discipline.txt`
- Cleanup: `none`

### C6 双 adapter 技能测试一致

- Covers: `AC3`
- Preconditions:
  1. C1 已通过；两个 adapter 依赖就绪。
  2. 允许重建 dist 与 Pi skills 构建副本，不手工编辑产物。
- Steps:
  1. 运行 `cd "$WT/packages/adapter-dsh" && pnpm test`（build + 全套 node --test，含 skills.test.js）。
  2. 运行 `cd "$WT/packages/adapter-pi" && pnpm build && bun test test/*.test.ts`。
  3. Node 脚本断言：`packages/adapter-pi/skills/workloom-alignment/SKILL.md`、`.../references/plan-authoring.md`、`.../workloom-migrate-plan/SKILL.md` 构建副本与 `packages/assets/skills/` 对应源文件字节一致；两个 adapter 的 `src/` 目录 grep `inspectPlanStructure|Preconditions|Procedure` 命中数为 0（协议判断不进 adapter）。
  4. 记录 `git -C "$WT" status --short` 与 `git -C "$WT" diff --stat`，确认 dist 与 Pi skills 副本均由命令生成。
- Expected: 双 adapter 全套测试通过；技能资产经构建副本保持一致；adapter 源码无协议判断逻辑残留。
- Evidence:
  - `case-evidence/c6-adapters.txt`
- Cleanup: `none`（Pi 构建副本由构建命令重建）

## Coverage

- Tool: `Node v24 内置 --experimental-test-coverage（lcov reporter + --enable-source-maps，dist 经 source map 归因到 src）`
- Instrumentation: `在 packages/core 跑全量 node:test 套件生成 lcov；按 Exclusions 之外的变更可执行文件聚合逐文件 LH/LF 与 Overall lines。测试、assets、adapter 与 dist 由运行时用例和各自包测试覆盖，不混入 core 行覆盖统计。`
- Aggregate command:
  ```bash
  set -euo pipefail
  REPO=/data00/home/wangyubo.1219/workbench/code-src/github/workloom
  WT="$REPO/.workloom/worktree/11-06-plan-pseudocode-standard"
  TASK="$REPO/.workloom/tasks/11-06-plan-pseudocode-standard"
  mkdir -p "$TASK/coverage" "$TASK/case-evidence"
  cat > "$TASK/coverage/collect-core.mjs" <<'NODE'
  import { execFileSync } from 'node:child_process'
  import { readFileSync, writeFileSync } from 'node:fs'

  const [root, lcovPath, outPath, fallbackList] = process.argv.slice(2)
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' })
  const changed = [
    ...git('diff', '--name-only', 'HEAD', '--', 'packages/core/src').split('\n'),
    ...git('ls-files', '--others', '--exclude-standard', '--', 'packages/core/src').split('\n'),
  ]
    .filter(Boolean)
    .map((path) => path.replace(/^packages\/core\//, ''))
    .filter((path) => /^src\/.+\.(js|ts)$/.test(path) && !path.endsWith('.d.ts'))
  // 实现已提交时 git 变更集合为空，回退到 SR 声明的 core 文件清单。
  const fallback = (fallbackList ?? '').split(',').filter(Boolean)
  const wanted = new Set(changed.length > 0 ? changed : fallback)
  const rows = []
  for (const block of readFileSync(lcovPath, 'utf8').split('end_of_record')) {
    const file = /^SF:(.+)$/m.exec(block)?.[1]
    if (file === undefined) continue
    if (wanted.size > 0 && !wanted.has(file)) continue
    if (wanted.size === 0 && !/^src\/.+\.(js|ts)$/.test(file)) continue
    const lf = Number(/^LF:(\d+)$/m.exec(block)?.[1] ?? 0)
    const lh = Number(/^LH:(\d+)$/m.exec(block)?.[1] ?? 0)
    rows.push({ file, lf, lh })
  }
  rows.sort((left, right) => left.file.localeCompare(right.file))
  const covered = rows.reduce((sum, row) => sum + row.lh, 0)
  const total = rows.reduce((sum, row) => sum + row.lf, 0)
  const percent = total === 0 ? 0 : (covered / total) * 100
  const body = rows
    .map((row) => `${row.file}\t${row.lh}/${row.lf}\t${row.lf === 0 ? 0 : ((row.lh / row.lf) * 100).toFixed(2)}%`)
    .join('\n')
  writeFileSync(outPath, `${body}\nOverall lines: ${covered}/${total} (${percent.toFixed(2)}%)\n`)
  console.log(`Overall lines: ${covered}/${total} (${percent.toFixed(2)}%)`)
  NODE
  (cd "$WT/packages/core" && node --enable-source-maps --experimental-test-coverage \
    --test-reporter=lcov --test 'test/*.test.js') \
    > "$TASK/coverage/lcov-core.info" 2> "$TASK/coverage/coverage-test.log"
  node "$TASK/coverage/collect-core.mjs" "$WT" "$TASK/coverage/lcov-core.info" "$TASK/coverage/summary.txt" \
    'src/domain/task-gates.js,src/domain/executor-context.js' \
    | tee "$TASK/case-evidence/c1-coverage.txt"
  ```
- Scope: `变更的 core 可执行源码（domain 与 service/surface/index 的 .js/.ts，d.ts 除外）；执行时以 git 变更为准，提交后回退到 SR Target 声明的 core 文件，并在 RESULT 的 Changed Files 表逐项列出。`
- Exclusions:
  - `packages/core/src/**/*.d.ts`: 手写类型锚点无运行语句，由 typecheck 与 dist-dts 测试强制与实现一致。
  - `packages/core/test/**`: 测试代码，由 C1–C6 的真实运行覆盖。
  - `packages/core/dist/**`: tsc 构建产物，经 source map 归因到 src，不重复统计。
  - `packages/assets/**`: Markdown/JSON 契约与评测夹具，无可执行生产行，由 C4 文本断言与契约测试覆盖。
  - `packages/adapter-dsh/src/**`: 薄适配层，本任务不修改协议逻辑，由 C6 与 SR12 覆盖。
  - `packages/adapter-dsh/test/**`: 测试代码，由 C6 运行覆盖。
  - `packages/adapter-dsh/dist/**`: 构建产物，由 C1/C6 重建并核对。
  - `packages/adapter-pi/src/**`: 薄适配层，本任务不修改协议逻辑，由 C6 与 SR13 覆盖。
  - `packages/adapter-pi/test/**`: 测试代码，由 C6 运行覆盖。
  - `packages/adapter-pi/skills/**`: gitignored 构建副本，由 C6 校验与 assets 源文件字节一致。
- Raw outputs:
  - `coverage/lcov-core.info`
  - `coverage/summary.txt`
  - `coverage/coverage-test.log`
  - `coverage/collect-core.mjs`

## Traceability

| AC | Static review | Runtime cases |
| --- | --- | --- |
| AC1 | SR1, SR2 | C1, C2 |
| AC2 | SR5, SR6, SR7, SR9, SR11 | C1, C4 |
| AC3 | SR6, SR8, SR10, SR11, SR12, SR13 | C4, C5, C6 |
| AC4 | SR1, SR3, SR4, SR5 | C3 |
