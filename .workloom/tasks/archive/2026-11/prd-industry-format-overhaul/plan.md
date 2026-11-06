# 调研并升级 workloom PRD 格式实施计划

## Design decisions

1. 完整任务使用固定的十一小节模板；`UI Design` 仍按适用性出现。Goal、Requirements、Acceptance Criteria 必须有实质内容，其他不适用小节写 `none` 或 `not applicable` 并说明原因。
2. PRD 模板使用英文占位指引，开发者填写后按任务文档语言规则使用中文。R/AC 标识同时接受中英文冒号。
3. 结构检查负责标题、小节、占位内容、R/AC 编号与关联；叙述连贯性由主会话复核、评审和评测负责，不使用正则代替内容判断。
4. 删除 `open-nodes` 标记及其全部程序依赖。确认工具不再返回 `openNodeState`，启动不再读取该标记。
5. 现有 planning 任务不自动改写，归档任务不迁移。workflow 步骤集合和协议版本 25 保持不变。

## Steps

#### 步骤 1 重建 PRD 模板与结构校验

- Covers: AC1, AC3, AC5
- Target: `packages/core/src/domain/task-gates.js` 的 `PRD_SECTIONS`、`PRD_STRUCTURE_CODES`、`inspectPrdStructure`；`packages/core/src/domain/task-gates.d.ts`；`packages/core/src/domain/task-store.js` 的 `buildPrdContent`；`packages/core/src/service/doctor-check-rules.ts` 的 PRD 完整性提示与问题投影；`packages/core/test/alignment.test.js`、`task-gates.test.js`、`task-store.test.js`、`task-ops.test.js`、`case.test.js`、`doctor.test.js`、`worktree-compat.test.js`、`worktree-lifecycle.test.js`。
- Edit:
  ```text
  Input: 任务标题、PRD 全文，以及调研确定的固定小节集合。
  Output: 新任务 PRD 骨架和完整的结构化问题列表。
  Preconditions: 完整/轻量任务现有状态模型不变，PLAN 的五字段协议保持不变。
  Procedure:
    将 PRD_SECTIONS 扩为 Context、Goal、Scope、Assumptions, Constraints and Dependencies、Requirements、Acceptance Criteria、Edge Cases and Failure Paths、Risks and Open Questions、Alignment Decisions、References、Notes。
    为每节写英文占位说明，明确该节回答的问题、应建立的前后关系和反流水账要求。
    由 buildPrdContent 按同一常量生成模板，保持单一来源。
    检查 H1、必需小节和未替换占位内容；保留轻量任务只检查 H1 与 Goal 的过滤方式。
    在 Requirements 中识别 `- R<number>` 后接英文或中文冒号，要求至少一条且编号不重复。
    在 Acceptance Criteria 中识别 `- AC<number>`，要求至少一条且编号不重复。
    每条 AC 条目范围内至少引用一个已定义的 `R<number>`，并含 `验证方法`、`Verification` 或 `Verify` 之一。
    本任务 PRD 使用的 `（覆盖 R1、R6）` 与 `验证方法是…` 必须被接受，不要求额外英文格式。
    对空需求、空验收、重复编号、未知 R 引用和缺验证标识分别返回稳定问题码。
    doctor 的新模板提示指向完整十一小节；R/AC 追踪问题不投影到 doctor，保持 doctor 只查文档完整性的分工。
    轻量任务沿用同一骨架，仅启动检查的过滤规则不同。
    更新所有旧 PRD 夹具，保留容器、轻量和归档边界用例。
  Failure: 缺少小节、占位内容未替换、R/AC 为空或重复、AC 引用未知 R、缺验证方法时，review/confirm/start 共用问题列表并拒绝继续。
  ```
- Verify: 在 `packages/core` 运行 `pnpm run build && node --test 'test/*.test.js'`。预期全部通过，新模板可创建，合法新格式可确认并启动，结构和追踪缺陷均被拦截。

#### 步骤 2 删除开放节点标记及其程序依赖

- Covers: AC1, AC4, AC5
- Target: `packages/core/src/domain/alignment.js` 与 `alignment.d.ts` 的 `OPEN_NODE_MARKER`、`findOpenNodeState`；`packages/core/src/domain/task-gates.js` 与 `task-gates.d.ts` 的开放节点问题码和扫描；`packages/core/src/service/alignment-service.ts` 的 `openNodeState`；`packages/core/src/service/doctor-check-rules.ts` 的开放节点旧注释；`packages/core/src/index.ts` 的公开导出；全部引用这些符号的 core 测试。
- Edit:
  ```text
  Input: 当前开放节点标记实现、PRD review 结果和所有调用方。
  Output: 不包含开放节点标记判断的确认、启动与结果结构。
  Preconditions: 步骤 1 已提供新的 PRD 结构和 R/AC 校验。
  Procedure:
    删除标记常量、正则、扫描函数、问题码和对应文案。
    inspectPrdStructure 在固定小节与 R/AC 检查后结束，不读取 HTML 注释。
    alignment review 删除 openNodeState 字段，保留 PRD 内容、结构诊断和确认记录。
    删除 core 公开导出及手写声明，更新所有标记存在、pending 和缺失用例。
    新增无标记合法 PRD 可通过 review/confirm/start 的回归测试。
    已归档文件不修改；历史文件中的旧标记只作为普通文本保留，不参与逻辑。
  Failure: 任一运行时代码仍读取开放节点标记时，构建或缺席测试失败；无标记文档被误拒时，新增回归测试失败。
  ```
- Verify: 在 `packages/core` 运行 `pnpm run build && node --test 'test/*.test.js'`。预期全部通过，动态导入 dist 时旧扫描导出不存在。

#### 步骤 3 统一叙述规则、资产与评测

- Covers: AC1, AC2, AC4, AC5
- Target: `packages/assets/workflow/workflow.md` 的 1.1 与 norms；`packages/assets/workflow/workflow-light.md` 中两处开放节点说明；`packages/assets/skills/workloom-alignment/SKILL.md`；`packages/assets/skills/workloom-alignment/evals/evals.json`；`packages/assets/skills/workloom-migrate-plan/SKILL.md`；`packages/core/test/contract-asset.test.js`；`packages/adapter-dsh/test/skills.test.js`；`packages/adapter-pi/test/skills.test.ts`。
- Edit:
  ```text
  Input: 新 PRD 模板、调研报告、现有对齐和迁移指引。
  Output: 统一的文档结构、叙述质量规则、评审标准和评测对照。
  Preconditions: 步骤 1 和 2 已确定机器可检查边界，PLAN 与确认流程不在本次修改范围。
  Procedure:
    在 workflow 与 alignment 中列出固定小节及每节用途，说明背景到目标、目标到需求、需求到验收的主线。
    要求按能力或行为组织需求，禁止按问答时间堆叠条目。
    Alignment Decisions 只保留关键决定及理由，不写 Q/A 编号或逐轮答复。
    同一事实指定主要归属小节，其他位置引用，不重复摘要。
    Risks and Open Questions 直接记录未决内容；主会话依据内容判断能否确认，不再操作 HTML 标记。
    迁移指引要求旧 planning 内容按新结构重写，不自动搬运问答记录，归档内容不动。
    在 evals 中加入 `align-narrative-coherent` 与 `align-narrative-log` 对照场景，沿用可机检短句断言，覆盖重复、断裂和问答式决定记录。
    更新 workflow-light 中两处开放节点说明，轻量流程行为不变。
    更新所有文本断言与双 adapter 技能测试；以 contract-asset.test.js 的实际断言为准逐句对照，包括 questioning、merged-questions 与 batch-questions 等被固定文本。
  Failure: 任一资产仍要求开放节点标记、逐轮问答入文或 PRD 写完整实现时，对应文本或评测测试失败。
  ```
- Verify: 在仓库根目录运行 `pnpm -r build`，随后运行 core 的 `node --test test/contract-asset.test.js test/protocol.test.js`、adapter-dsh 的 `pnpm test` 和 adapter-pi 的 `bun test test/*.test.ts`。预期全部通过。

#### 步骤 4 全量验证与构建产物同步

- Covers: AC1, AC2, AC3, AC4, AC5
- Target: 所有修改文件；`packages/core/dist/` 与 `packages/adapter-dsh/dist/` 的生成产物。
- Edit:
  ```text
  Input: 新模板、结构校验、标记删除、资产和测试修改。
  Output: 全量验证结果、同步后的 dist 和最终变更清单。
  Preconditions: 前三个步骤已完成，没有仍在运行的实现或检查派发。
  Procedure:
    运行仓库 lint、typecheck、build 和各包完整测试。
    用本任务 PRD 作为真实新格式样本执行只读结构检查，预期零问题；其中中文冒号、`（覆盖 R…）` 和“验证方法是”必须被接受；不得为通过样本检查而改写任务 PRD。
    另用无开放节点标记样本验证 review/confirm/start。
    检查运行时代码没有开放节点扫描残留，资产没有问答式写作指引。
    通过构建命令生成 dist，不手工编辑产物，确认归档目录未改变。
  Failure: 任一命令或真实样本检查失败时，回到所属步骤修复，并重跑该步骤与本步全量验证。
  ```
- Verify: 在仓库根目录运行 `pnpm lint`、`pnpm -r typecheck`、`pnpm -r build`；随后运行 core 与 adapter-dsh 的 `node --test test/*.test.js`，以及 adapter-pi 的 `bun test test/*.test.ts`。预期所有命令退出码为 0，修改过的 TS 文件无类型错误。
