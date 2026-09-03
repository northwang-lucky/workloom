tasks/09-03-unify-workloom-alignment:mtl781v2ny0lcuvn

# 01 alignment 重构影响面研究：grilling → workloom-alignment

> 研究结论全部基于实读源码；每条结论锚定 `path:line`（相对本仓库根）。
> 「建议」标注的条目为实施建议（待 design 确认），其余为已验证事实。

## 结论速览：需要替换/删除/新增的入口清单

| 入口 | 现状态 | 动作 |
| --- | --- | --- |
| `packages/assets/workflow/workflow.md` | v19，Phase 1.1 含 brainstorm + 三个固定问题 + 1.1b/1.1c | 改写为单一 Alignment + design tree（版本 bump） |
| `packages/assets/skills/workloom-brainstorm/SKILL.md` | 独立 skill，描述引用 Phase 1.1a | 删除或并入 workloom-alignment（按 R1 移除注册） |
| `packages/assets/skills/workloom-ui-design/SKILL.md` | 独立 skill，描述引用 Phase 1.1b | 同上；七轴内容改为 alignment 的按需参考（R6） |
| `packages/adapter-dsh/src/skills.ts:45-52` | `SKILL_ASSETS` 注册 6 个 skill | 换成 `skills/workloom-alignment/SKILL.md`；generic grilling/tdd 保留 |
| `packages/adapter-pi/scripts/sync-skills.mjs:18-25` | 同步 6 个 skill 目录到包内 `skills/` | 换成 workloom-alignment（+update-spec + 3 vendored） |
| `packages/core/src/legacy/task-gates.js:146-160` | `evaluateGrillingGate` | 替换为 `evaluateAlignmentGate` + stale 门禁 |
| `packages/core/src/legacy/task-store.js` 全文 | grilling 字段写路径（checkTask phase=grilling / grillingPending） | 替换 alignment 字段写路径 |
| `packages/core/src/surface.ts` | `TASK_CREATE_NOTE`(213)/`GRILLING_PENDING_NOTE`(220)/`taskCheck` 描述(47,101-107) | 改写；新增 `workloom_task_align` 工具文案 |
| `packages/adapter-dsh/src/tasks.ts` / `packages/adapter-pi/src/tasks.ts` | 6 个任务工具 | 新增 `workloom_task_align` 注册 |
| `packages/adapter-dsh/src/executor.ts:393` / `packages/adapter-pi/src/executor.ts:398` | `resolveTaskRelPath` 之后 | 插入 stale 阻断（R13） |
| `packages/core/src/service/doctor-types.ts:13-23` 等 | 10 类检查 | 新增 overlay 旧引用检查（R18） |

## 已核实：Phase 1.1 编排、固定问题与 skill 加载点全在文案层，无代码引用 skill 名

- `packages/assets/workflow/workflow.md:2` 契约 front-matter `version: 19`（contract-asset.test.js:39 断言 `contract.version === 19`，bump 必须同步改测试）。
- `packages/assets/workflow/workflow.md:28-63` 是 Phase 1.1 全部编排原文：先加载 `workloom-brainstorm`（:30）、brainstorm → grilling 顺序、三个固定问题（test-first → UI → grilling，:39）、1.1b/1.1c 子阶段与 `phase=grilling, required=true` 记录指引（:54-61）。这些全是散文，解析器不消费 skill 名。
- planning 面包屑把「load brainstorm + 固定问题 + grilling」整套指令写死：`packages/assets/workflow/workflow.md:129-131`；norms 另有一组 Grilling always-on 句：`packages/assets/workflow/workflow.md:161-164`。
- 契约只做结构解析（`#### X.X` 步骤 + `[workflow-state]` 块 + norms），skill 名不在解析面：`packages/core/src/legacy/workflow-contract.js:37-38,257-290`。
- 契约资产测试用逐字断言锁死 grilling 措辞：`packages/core/test/contract-asset.test.js:154-211`（grilling 固定问题、1.1b/1.1c、planning 面包屑、norms Grilling 句）、`:89-98`（UI 问题与 Phase 1.1b/1.1c 定位）、`:213-222`（步骤 id 列表 `['1.0','1.1',...]` 与 `no grey areas`）。R1/R2 后这些断言全部需要重写为新 alignment 语义。

**Design-tree 方法体** 目前只存在于 vendored grilling 的通用正文（frontier 轮次、推荐答案、事实调查）：`packages/assets/third-party/mattpocock-skills/grilling/SKILL.md:10-32`；workloom 侧只加了一行 Phase 1.1c 块引用（:8）。R3/R4 要求把固定根节点族、frontier 批次、推荐答案、事实调查、技术节点边界、最终确认规则变成自有资产并做契约测试——即新 `workloom-alignment/SKILL.md` 或独立 design-tree 资产 + 资产契约测试（AC3）。

## 已核实：grilling/tdd 两个 vendored skill 里嵌有 workloom 阶段引用

- `packages/assets/third-party/mattpocock-skills/grilling/SKILL.md:8`：`> workloom: in workloom this skill is driven by Phase 1.1c ...`。R19 要求 generic grilling 的触发描述明确排除「active workloom planning task」场景，此块引用需改写（保留 generic 方法体）。
- `packages/assets/third-party/mattpocock-skills/tdd/SKILL.md:22,30-31`：seam 确认挂在「Phase 1.1c grilling alignment」上；R6 要求改为 `workloom-alignment` 的按需参考，tdd 继续独立分发。

## 已核实：task.json grilling 凭据全链路（替换对象）

- 类型：`packages/core/src/legacy/task-store.d.ts:49-56` `TaskGrillingRecord{required,passedAt,summary}`；`TaskRecord.grilling`(:125)；`StartedTaskRecord.grillingPending/grillingNote`(:137-143)。
- 归一化：`packages/core/src/legacy/task-store.js:219-221` `grilling: parsed.grilling ?? null`（旧任务补 null 的门禁安全策，alignment 照抄）；新建任务写 null：`:342-343`。
- 写路径（R9 整体替换）：`checkTask phase=grilling` 分支 `packages/core/src/legacy/task-store.js:666-674` → `recordGrillingCredential`(:722-777)，两次调用分离（判定 required / 收敛 summary）。
- 软提醒：`startTaskInternal` 返回 `grillingPending = task.grilling === null`（:634-637）；`task-ops.ts:196-199` 据此附 `GRILLING_PENDING_NOTE`（`packages/core/src/surface.ts:219-220`）。R9 之后 grillingPending 语义整体消失。

## 已核实：门禁函数与生命周期工具的现有形状（start/check/archive 改造基底）

- 门禁枚举 `GATES = {START, CHECK, ARCHIVE, EXECUTOR_MODEL_EFFORT}`：`packages/core/src/legacy/task-gates.js:33-39`；force 豁免统一 `makeOverride(gate, reason)`（:246-253）写 `task.json.overrides`。R14 的 start/stale force 绕过应复用此机制，且**绝不**写 alignment 凭据（凭据只能由 `workloom_task_align confirm` 写，R10/R14）。
- `evaluateStartGate`：`packages/core/src/legacy/task-gates.js:172-195`，prd 缺失/H1/placeholder + 两个 jsonl + grilling 门禁（:193）。grilling 分支替换为 alignment 门禁（planning 必须有 `alignment` 且 hash 与当前 prd 一致）。
- `evaluateGrillingGate`（替换对象）：`packages/core/src/legacy/task-gates.js:146-160`，读 `splitSectionBodies(prd)`（私有，:275-290）判 `UI_DESIGN_SECTION`（:78-79）。文案常量 `GRILLING_UI_MISSING/GRILLING_REQUIRED_MISSING`（:84-90）在 task-gates.test.js:169-203 被逐字断言。
- prd 校验可复用：`findMissingPrdTitle`(:98-104)、`findUnfilledPrdSections`(:112-122)、`countEffectiveJsonlRecords`(:131-133)——R11「PRD 结构错误/含占位符不得落凭据」直接复用这三个 + 新增开放节点扫描。
- start 消费点：`startTaskInternal` `packages/core/src/legacy/task-store.js:604-638`，force → `makeOverride(GATES.START, reason)`（:612-614），非 force → `evaluateStartGate`（:617）。
- check 消费点：`checkTaskInternal` `packages/core/src/legacy/task-store.js:666-708`；在写 `task.check` 前（:705）插入 stale 阻断（R13：in_progress 且 stale 时 check 被拒）。
- archive 消费点：`archiveTaskInternal` `packages/core/src/legacy/task-store.js:1033-1072`；check===null 拒绝（:1040-1046）。R13 stale 阻断加在 :1038 门禁区。
- 前端派发门禁（保留参照）：`evaluateFrontendDispatchGate` `packages/core/src/legacy/task-gates.js:219-226`——「prd 小节 × 记录」的纯函数模式与 alignment stale 门禁同构，可作为新门禁函数的样板。UI Design 小节判定与 frontend 派发门禁本身**保留不动**（R6 只是 UI 七轴改由 alignment 按需参考；prd `## UI Design` 小节仍是 frontend 门禁依据）。

## 已核实：executor 派发链路上的 stale 拦截点（R13）

- DSH：`executeTool` `packages/adapter-dsh/src/executor.ts:336-565`。`resolveTaskRelPath`( :393) → 冲突门/force 覆盖记录(:390-399) → allow 清单( :405-411) → 组装/派发(:498-533) → `recordExecutorDispatch`(:536)。stale 阻断应插在 :393 之后、派发之前；force 绕过走 `recordExecutorOverride`(:396) 同款路径，仅加 override 不写 alignment。
- Pi：`executeTool` `packages/adapter-pi/src/executor.ts:352-468`。`resolveTaskRelPath`(:398) → 冲突门(:391-407) → 组装(:416-427) → `dispatchChildPi`(:431) → `recordExecutorDispatchEntry`(:445)。拦截点同位置（:407 之后）。
- 续用（continue_executor）同样要过拦截：DSH `:440-497` 的 followup 分支也在 `resolveTaskRelPath` 之后，应一并受 stale 门禁约束（R13「阻止新的 executor 派发」含续接派发，design 需确认口径）。

## 已核实：doctor 检查面与 overlay 读取现状（R18 落点）

- 10 类检查枚举 `DoctorIssueCode`：`packages/core/src/service/doctor-types.ts:13-23`；`CHECK_META`（:100-115）顺序即输出顺序，新增一类检查需两处同步。
- 收集器 `collectChecks`：`packages/core/src/service/doctor-checks.ts:43-89`，每类检查一个纯函数（`doctor-check-rules.ts`），新检查照此加函数 + pushIssues 一行。
- 全部检查只读、不写盘（`packages/core/src/service/doctor-checks.ts:3-6`），修复在 `doctor-fixes.ts`。R18 要求「检出 overlay 中旧 skill 名和 Phase 1.1 子阶段引用，给出人工迁移提示，不自动改写」→ 新检查 `fixable: false`，只发 issue + hint，不进 --fix 修复器。
- overlay 路径与读取：`.workloom/workflow.override.md`，当前唯一消费者是 `workflow-service.ts:127-134`（`readOverlay`，文件缺失返回 null）。检查函数可复用该路径常量与读取方式（建议把 `OVERLAY_REL_PATH` 提升为共享常量）。
- 现有 doctor 测试结构：`packages/core/test/doctor.test.js:100-483`（每类检查一组用例 + fix 用例 + 报告 schema 断言 :487）。新增检查需补：有旧引用 → issue；无 overlay / 无旧引用 → 通过；--fix 不修改 overlay。

## 已核实：双 adapter 注册面与版本一致性现状（R2/R20）

- DSH skill 注册是显式清单 + 循环：`packages/adapter-dsh/src/skills.ts:45-52`（`SKILL_ASSETS` 6 项）与 `registerSkills`(:206-233)。**现状无任何测试断言这个清单内容**（grep 确认 registerSkills/SKILL_ASSETS 无测试引用；`packages/adapter-dsh/test/skills.test.js:10-96` 只测 `parseSkillFrontmatter` 与 workloom_step）。R2 后清单一换即可，但 AC2「只注册新 skill」建议补一条清单契约测试。
- Pi skill 分发走构建同步：`packages/adapter-pi/scripts/sync-skills.mjs:18-25`（`SKILL_SOURCES` 6 项），产物 `skills/` 目录（gitignore：`packages/adapter-pi/.gitignore:1`），`package.json:11-15` 把 `skills` 打进发布。Pi runtime 把包内资源按 package resources 加载（已验证 pi-coding-agent dist `package-manager.js:67` `RESOURCE_TYPES=["extensions","skills","prompts","themes"]`；本仓库无代码消费 Pi 的 skills，属于 Pi CLI 行为）。
- 工具注册样板：DSH `packages/adapter-dsh/src/tasks.ts:60-80`（`tools.register` + schema），Pi `packages/adapter-pi/src/tasks.ts:95-156`（`pi.registerTool` + TypeBox）。新工具 `workloom_task_align` 在两处各加一条，schema 文案引 core surface 常量（`packages/adapter-pi/src/tasks.ts:15-28` 的导入模式）。
- 版本一致性（R20）：四个 package.json 版本全为 `0.1.0`（已验证）；workflow.md 另有内部 `version: 19`。**当前代码没有任何版本一致性校验机制**——R20 的「同版本发布、不一致明确报错」是全新机制，建议落点：core surface 暴露一个共享版本常量（或读包 version），DSH `plugin.ts:101 apply()` 与 Pi `index.ts:21` 工厂入口做一次启动校验并抛清晰错误；契约 test 断言新机制存在。design 需定版本号粒度（包版本 vs 契约版本）。
- **部署事实（影响 smoke test）**：当前 DSH web profile（GUI :3080）绑定的 adapter 指向**另一个 checkout**：`~/.dsh/profiles/web/package.json:7` `"@workloom-ai/adapter-dsh": "file:/data00/home/wangyubo.1219/workbench/code-src/github/trellis-hotplug/packages/adapter-dsh"`，与本仓库并非同源同版本（`trellis-hotplug/.../skills.ts` 与 `workloom/.../skills.ts` diff 不同）。因此 GUI 冒烟**不能**验证本仓库改动，必须另起 headless/独立 profile 或先改绑定向。

## 已核实：存量任务数据与迁移边界（R17）

- 已归档任务：`.workloom/tasks/archive/2026-{08,09}/*/task.json` 全部带 `grilling: {required:true, passedAt, summary}` 记录（抽查 8 个全为 required:true）。R17「已归档旧任务保持原样」→ 迁移后 grilling 字段只是不再被消费的惰性数据，不落盘改写。
- 存量 active：`.workloom/tasks/08-26-adapter-opencode/task.json` 与 `08-31-workloom/task.json` 均 `status=planning` 且无 grilling 字段（归一化后为 null）——正是「旧 planning 任务须重新 alignment」的样本：start 门禁将对 alignment===null 的 planning 硬拦，指引走 `workloom_task_align`。
- 本任务自身 `09-03-unify-workloom-alignment/task.json:26-30`：planning + 已有 grilling 凭据（required:true/passedAt）——实现完成后本任务自身 start 时需先完成 alignment confirm（也可作验收样例）。
- 归一化兜底样板：`packages/core/src/legacy/task-store.js:219-221`（`grilling: parsed.grilling ?? null`）——新字段对齐补 `alignment: parsed.alignment ?? null`；「不追溯阻断」的判定口径建议：alignment===null 的 in_progress（旧任务）不阻断，alignment 存在且 stale 才阻断（与 R17「旧 in_progress 任务不追溯阻断」一致）。
- `packages/core/test/task-store.test.js:1206-1460` 现有 grilling 归一化/判定/收敛/start 门禁一组用例，全部随语义替换改写（grep 已列出逐条：:1223-1460）。

## 建议：PRD hash review/confirm 与 stale 门禁的 core 公共接口落点

（以下为建议方案，待 design 确认；依据是与现有 legacy/service 分层的一致性：纯函数进 legacy，编排进 service，投影进 adapter。）

1. **新 legacy 模块或并入 task-gates**（纯函数）：
   - `computePrdHash(prdContent: string): string`——canonical 哈希（建议 sha256，输入为 prd.md 全文字节；注意 prd 含 `## Alignment Decisions` 小节，该小节在收敛过程中被增量写入，故哈希必须对**最终确认版**全文计算，design 需确认是否归一化行尾）。
   - `evaluateAlignmentGate(status, alignment, prdContent?)`——planning 无凭据/凭据 stale → 缺失项；in_progress stale → 缺失项（供 executor/check/archive 复用）。
   - `findOpenAlignmentNodes(prdContent): string[]`——扫描 `## Alignment Decisions` 中的开放节点标记（需与 alignment skill 约定书写格式，见阻塞项 2）。
2. **新 service 模块 `service/alignment-service.ts`**（编排，仿 task-ops.ts：cwd 校验 → resolveTaskRelPath → 纯函数求值 → 写盘）：
   - `reviewAlignment(root, taskRelPath)` → `{prd, prdHash, alignment}`（只读，不落盘，R10 review 语义）；
   - `confirmAlignment(root, taskRelPath, {expectedPrdHash, summary})` → 校验结构（H1/占位符/开放节点）→ 重算 hash 比对 → `writeTaskJson` 原子写 `alignment={passedAt, summary, prdHash}`（R11：hash 不一致/结构非法/占位符/开放节点 → 抛错不落盘；相同 hash 重复 confirm 幂等返回成功）。
   - 凭据字段类型加在 `task-store.d.ts`：`TaskAlignmentRecord {passedAt: string; summary: string; prdHash: string}`；`TaskRecord.alignment: TaskAlignmentRecord | null` 替换 `grilling`。
3. **surface.ts 新增工具面**：`TOOL_NAMES.taskAlign = 'workloom_task_align'`、`TOOL_DESCRIPTIONS`、`TOOL_SNIPPETS`（Pi promptSnippet，`packages/core/test/surface.test.js:47-53` 强制 key 对齐）、`PARAM_DESCRIPTIONS`（action/expectedPrdHash/summary/taskPath）。`TASK_CREATE_NOTE`(:213) 与 `GRILLING_PENDING_NOTE`(:220) 改/删（R2「不再询问是否需要 grilling」、R9 替换语义）。
4. **adapter 投影**：DSH `tasks.ts` 与 Pi `tasks.ts` 各注册 `workloom_task_align`（action=review/confirm 两个分支投影 core 服务）；executor.ts 两处 stale 拦截调用同一 core 门禁纯函数（详见拦截点清单）。

## 建议：实施中的拦截点清单（R13/R14 全量落点）

| 拦截点 | 位置 | 阻断行为 | force 绕过 |
| --- | --- | --- | --- |
| start（planning 无凭据 or stale） | `task-store.js:617` `evaluateStartGate` 分支 | 缺失项含「需先 workloom_task_align confirm」指引 | 既有 `GATES.START` override（:612-614） |
| executor 新派发/续用 | DSH `executor.ts:393` 后、Pi `executor.ts:407` 后 | in_progress + stale → 抛错/返回提示不派发 | 新增 stale override（建议 `GATES.STALE_ALIGN` 或复用 `START`，design 定） |
| check | `task-store.js:705` 写 `task.check` 前 | in_progress + stale → 拒绝 | 既有 `GATES.CHECK` force 分支（:686-688） |
| archive | `task-store.js:1038` 门禁区 | in_progress + stale → 拒绝 | 既有 `GATES.ARCHIVE` force 分支（:1038-1039） |
| 状态回退 | 无 | 不生效：stale 只阻止动作，不改 status（R13） | — |

- force 绕过统一「只留 override、不写 alignment 凭据」：现成样板是 executor 冲突 force（DSH `executor.ts:395-399` 只调 `recordExecutorOverride` 不写凭据）；`workloom_task_align confirm` 是唯一写 alignment 的入口（R10/R14）。
- 门禁文案应给「下一步动作」指引（现 grilling 文案同款风格）：参考 `packages/core/src/legacy/task-gates.js:84-90`。

## 建议：doctor overlay 旧引用检查（R18）

- 新增 `DoctorIssueCode` 如 `'workflow-overlay'`（`doctor-types.ts:13-23` 与 `CHECK_META` :100-115 两处）；检查函数放 `doctor-check-rules.ts`：
  - 读 `.workloom/workflow.override.md`（复用 `workflow-service.ts:127-134` 的路径与 ENOENT→null 语义）；
  - 匹配旧 skill 名 `workloom-brainstorm` / `workloom-ui-design` 与子阶段引用 `1.1a` / `1.1b` / `1.1c`（以及 workloom 语境下的 `grilling` 阶段词）；
  - issue 一律 `fixable: false`，hint 给出人工迁移建议（如「把 Phase 1.1b 小节改写为 alignment design tree 语义；skill 名改为 workloom-alignment」）；
  - 不注册 fixer 到 `doctor-fixes.ts`（R18 禁止自动改写）。
- 顺带可选：新增 `task-alignment` 检查提示 legacy planning 任务缺 alignment（warn、不可修），与 start 门禁形成 doctor 侧可观测面。

## 建议：真实 DSH/Pi smoke test 的可执行方式（AC10/11）

1. **DSH**：本机已装 `dsh` CLI（全局 bin）与 headless profile `~/.dsh/profiles/headless`（bundles 含 `@deepseek-ai/dsh-headless`，用法 `dsh --profile headless "task text"` 答一问即退）。步骤：
   - 在 headless profile 安装本仓库 adapter：`dsh plugin --profile headless add 文件路径/packages/adapter-dsh`（或手改 profile package.json bundles + reconcile）；
   - 驱动 planning 会话，如 `dsh --profile headless "用 workloom_task_create 建一个任务并进入 Phase 1.1 对齐"`；
   - 断言：planning 面包屑指引加载 `workloom-alignment`、不再出现 brainstorm/UI/grilling 固定问题；会话工具清单含 `workloom_task_align`；generic grilling/tdd 不自动加载。
   - 注意：现有 Web GUI（:3080）绑定 trellis-hotplug checkout（`~/.dsh/profiles/web/package.json:7`），**不能**验证本仓库；GUI 若要用需先把该指向改到本仓库并 pnpm install。
2. **Pi**：本机 `/home/wangyubo.1219/.bun/bin/pi`（0.84.2）。步骤：
   - `cd packages/adapter-pi && pnpm build`（生成 `skills/`）；
   - 沙箱目录 `pi install <repo>/packages/adapter-pi -l`（本地 scope）或放进 Pi settings 的 packages；再 `pi -p <非交互 planning prompt>`，或经 adapter 自身的 spawn child 机制派发；
   - 断言同上：planning 进入统一 alignment、`workloom-alignment` 出现在可用 skill 列表、无旧两个 workloom skill、不重复加载 generic grilling/tdd。
   - 冒烟前置：adapter-dsh 需 `pnpm build`（dist），adapter-pi 需 sync skills；两个 runtime 各跑一次（AC10/11）。
3. **可观测性**：两 runtime 的 skill 加载差异——DSH 由 `registerSkills`（`skills.ts:206`）显式注册，可直接在冒烟日志断言；Pi 由 Pi CLI 按 package resources 加载，断言靠运行时工具/skill 清单输出（`pi list` / session 内 skill 查询）。

## 建议：变更顺序（test-first，按行为切片，单任务原子交付不拆分）

1. core 纯函数：`computePrdHash` / 开放节点扫描 / `evaluateAlignmentGate`（先写失败测试：task-gates.test.js 新增 alignment 用例组）。
2. core 类型与存储：`TaskAlignmentRecord`、`normalizeTaskRecord`/`buildTaskRecord` 加 `alignment`、删除 grilling 写路径（`checkTask phase=grilling`、`recordGrillingCredential`、`grillingPending`）。
3. core service：`alignment-service.ts`（review/confirm/原子写/幂等），task-ops 接 `workloom_task_align` 编排；surface 工具面文案。
4. start/check/archive 门禁切换 + executor 拦截：task-gates → task-store → DSH/Pi executor.ts。
5. 资产：workflow.md v20（重点 1.1/planning breadcrumb/norms）+ 新建 `workloom-alignment/SKILL.md`（design tree 资产）+ 删除两个旧 skill + grilling/tdd 块引用改写。
6. adapter 注册：DSH `skills.ts` 清单、Pi `sync-skills.mjs` + build；两 adapter tasks.ts 注册新工具。
7. doctor：新增 overlay 检查（+可选 task-alignment 检查）。
8. 测试全面刷新：contract-asset（v20 + alignment 措辞）、task-gates/task-store/task-ops/surface（grilling 用例替换）、doctor、DSH/Pi schema 测试（`tasks.test.ts:82-104` 的 phase 枚举断言改为新工具参数）、subtask-contract（grilling 多轮护栏句）。
9. 全量 `pnpm lint` / `pnpm -r typecheck` / `pnpm -r build` / core+双 adapter 测试；随后 DSH、Pi 各一次真实 smoke。

## 风险清单

- **测试面大且分散**：grilling 措辞被逐字断言在 contract-asset（:154-211）、surface（:212-240）、task-store（:1223-1460）、task-ops（:236-288）、task-gates（:164-203）、subtask-contract（:42）；任何遗漏都会红。建议切 1 后立即跑一次全量测试确认红面。
- **vendored skills 改写边界**：grilling/tdd 的上游正文原则上不动，只改 workloom 块引用（:8 / :22,30-31）；改错会污染第三方来源标注（license/source）。
- **PRD hash 自引用**：prd 含 `## Alignment Decisions`，alignment 本身会改写该节——确认时必须对「最终版全文」计算 hash，且确认后任何小节改动都使 stale（含用户后补需求，R12 预期行为）。
- **存量任务迁移误伤**：archive 与旧 in_progress 不得阻断（R17）；判定口径（alignment===null vs stale）必须区分，否则旧任务全部变红。
- **双 adapter 文本漂移**：surface 常量是两 adapter 唯一文案源（`packages/adapter-dsh/src/tasks.ts:14-26` 与 Pi 同名导入），新工具文案只改 surface 一处；`TOOL_SNIPPETS` 键对齐测试（surface.test.js:47-53）是漏改探测器。
- **smoke 环境错绑**：Web GUI 指向 trellis-hotplug，误用 GUI 冒烟会得出「改动无效」的假结论；headless profile 需要先装 adapter（涉及 pnpm reconcile）。
- **版本一致性机制全新**：无先例可抄，R20 的校验粒度（包版本 vs 契约版本 vs 新常量）与报错文案需 design 定稿，避免做成一次性补丁。

## 阻塞项（需主会话转用户决策）

1. PRD hash 输入与算法：是否全文 sha256、是否归一化行尾、`## Alignment Decisions` 参与 hash 的确认（推荐参与——它是用户审阅内容的一部分）。
2. 开放节点书写约定：`workloom-alignment` 在 `## Alignment Decisions` 用什么可机检格式声明「无开放节点」（建议：末行 `- 开放节点：无` 或 `- Open nodes: none`，校验按关键词＋在收敛确认时要求该行）。
3. 幂等 confirm 语义：同 hash 重复 confirm 是刷新 passedAt 覆盖记录，还是保留原记录仅返回成功（建议前者，语义简单且审计时间戳连续）。
4. stale 阻断的 force 覆盖枚举：新增 `GATES.STALE_ALIGN`（'stale_align'）还是复用 `GATES.START`；以及继续派发是否受同样约束（建议都约束，R13 口径）。
5. R20 版本一致性实现位置与粒度：core 常量 vs 读各包 package.json；DSH apply 与 Pi 工厂启动校验是否够（还是每次工具调用校验）。
6. smoke test 是否允许临时改动 `~/.dsh/profiles/web/package.json` 的 adapter 绑定（运行中的 GUI 会受影响）；若不允许，仅用 headless profile + pi 沙箱。
7. `workloom_task_align` 工具是否在 executor 子代理可用工具内（默认不在——allow 清单默认不含任务工具，见 executor-dispatch.ts 的 allow 求交逻辑）；R15 的 Phase 1.4 授权 start 仍走主会话。