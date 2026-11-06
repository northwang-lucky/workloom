# 改造 PLAN 伪代码编写规范实施计划

## Design decisions

1. 保留 `Covers`、`Target`、`Edit`、`Verify` 四个外层字段。`Edit` 内使用 `Input`、`Output`、`Preconditions`、`Procedure`、`Failure` 五个协议字段。
2. 协议字段单独成行，允许后续缩进行补充内容。字段值不能为空；无前置条件或失败路径时写 `none`。
3. 结构检查只读取当前步骤的 `Edit` 区域，避免把 `Verify` 或后续步骤中的同名文本误判为协议内容。
4. 五个字段必须按规定顺序出现。缺字段与顺序错误分别返回不同问题码，便于一次修正。
5. 少量现状代码可以放在 `Target` 或 `Procedure` 中用于定位，但不得提供完整修改后实现。
6. 不改变 workflow 步骤集合和协议版本，不修改归档 PLAN，不要求双 adapter 增加业务逻辑。
7. `workloom-migrate-plan` 同步产出五字段伪代码，避免迁移后的 PLAN 被新启动条件拦截。

## Steps

#### 步骤 1 实现 PLAN 伪代码协议结构校验

- Covers: AC1, AC4
- Target: `packages/core/src/domain/task-gates.js` 的 `PLAN_REQUIRED_FIELDS`、`inspectPlanStructure`；`packages/core/test/task-gates.test.js`、`task-ops.test.js`、`task-store.test.js`、`case.test.js`、`worktree-compat.test.js`、`worktree-lifecycle.test.js` 中的 PLAN 夹具与确认/启动用例。
- Edit:
  ```text
  Input: plan.md 全文、prd.md 全文，以及每个步骤的 Covers/Target/Edit/Verify 外层结构。
  Output: 结构化问题列表；新增协议字段缺失、字段内容为空和字段顺序错误的诊断。
  Preconditions: 现有 PRD 结构、PLAN 标题、Steps、AC 覆盖和 PLAN 内容确认规则保持不变。
  Procedure:
    定义五个协议字段及其顺序常量，避免在判断逻辑中重复书写字段名。
    对每个步骤提取 Edit 起点到 Verify 起点之间的正文；Edit 缺失时只报告外层字段问题，跳过协议检查。
    移除 Edit 区域的 Markdown 公共缩进后，只把行首为 `字段名:` 的行识别为协议字段；bullet、额外缩进和无冒号形式均不算。
    只在 Edit 区域内识别 Input/Output/Preconditions/Procedure/Failure，Procedure 中重复出现的字段名按乱序或重复处理。
    允许字段值位于冒号后或后续缩进行；空值与纯空白视为缺失内容，none 是合法值。
    按字段常量依次报告缺失或空值；全部存在时比较出现位置，顺序不符则报告顺序问题。
    保留原有 AC 覆盖聚合，协议问题与 AC 问题在同一次检查中返回。
    全仓清扫所有含 `- Edit:` 的 core 测试夹具，统一升级为合法五字段伪代码。
    增加缺字段、空字段、乱序、重复字段、跨区域误识别、Edit 缺失和合法 none 用例。
  Failure: 任一协议字段缺失、为空或乱序时，PLAN review 返回结构问题，confirm 与 start 均拒绝；读取失败沿用现有错误透传。
  ```
- Verify: 在 `packages/core` 运行 `pnpm run build && node --test 'test/*.test.js'`。预期 core 全量测试通过，合法伪代码可确认并启动，协议缺陷会被阻止，所有修改过的夹具都包含在本次验证中。

#### 步骤 2 统一 PLAN 编写、评审和评测规则

- Covers: AC1, AC2, AC3, AC4
- Target: `packages/assets/workflow/workflow.md` 的 1.4 Authoring bar 与 planning state 面包屑括注；`packages/assets/skills/workloom-alignment/SKILL.md`；`packages/assets/skills/workloom-alignment/references/plan-authoring.md`；`packages/assets/skills/workloom-alignment/evals/evals.json`；`packages/assets/skills/workloom-migrate-plan/SKILL.md`；`packages/core/src/domain/executor-context.js` 的 `PRESCRIPTIVE_PLAN_DISCIPLINE`、review Conformance 与 Feasibility 指引；`packages/core/test/contract-asset.test.js`、`executor-context.test.js`；`packages/adapter-dsh/test/skills.test.js`；`packages/adapter-pi/test/skills.test.ts`。
- Edit:
  ```text
  Input: 已确认的 PRD、真实源码锚点，以及当前 PLAN 编写和评审文本。
  Output: 统一的伪代码编写标准、评审标准和评测预期。
  Preconditions: 步骤 1 的协议校验已生效；workflow 的两次内容确认和 CASE 规则保持不变。
  Procedure:
    将 workflow 的 exact before/after 与 full-file-content 要求替换为五部分伪代码要求。
    在 plan-authoring reference 给出完整字段模板，说明定位锚点、输入输出、前置条件、处理过程、失败路径和验证方式。
    明确允许少量现状代码定位，禁止完整修改后代码与新文件完整实现。
    将评审 Conformance 改为检查真实锚点、行为完整性、协议字段、异常路径、AC 覆盖和可验证性。
    将 Feasibility 改为核对现状锚点是否唯一可定位、伪代码是否契合现场、验证命令是否可运行，不再寻找 after-code。
    将 PRESCRIPTIVE_PLAN_DISCIPLINE 改为跟随协议字段、真实锚点和验证命令；锚点与现场不符时作为阻塞项上报，不要求逐字执行代码块。
    更新 alignment evals，使合法伪代码可通过，缺输入输出或异常定义的场景得到明确问题。
    更新 migrate-plan 技能，使迁移后的 PLAN 同样使用五字段协议，不再生成旧四字段格式。
    改写后核对 adapter-dsh skills.test.js 的 Step 标题与边界短语断言，失配时同步更新测试预期。
    更新所有逐字文本断言，保留 Loading protocol 句、阻塞集中提问句、步骤 id 和版本 25。
    同步双 adapter 的技能测试预期，不在 adapter 源码中复制协议判断逻辑。
  Failure: 任一资产仍要求完整实现代码，或评审仍把伪代码视为缺陷时，相关文本测试和评测预期必须失败并指向对应文件。
  ```
- Verify: 在仓库根目录运行 `pnpm -r build`，随后在 `packages/core` 运行 `node --test test/contract-asset.test.js test/executor-context.test.js test/protocol.test.js`，在 `packages/adapter-dsh` 运行 `pnpm test`，在 `packages/adapter-pi` 运行 `bun test test/*.test.ts`。预期全部通过。

#### 步骤 3 全量验证并同步构建产物

- Covers: AC1, AC2, AC3, AC4
- Target: 所有修改文件；`packages/core/dist/` 与 `packages/adapter-dsh/dist/` 的生成产物。
- Edit:
  ```text
  Input: 完整的结构校验、资产、评审指引和测试修改。
  Output: 全量验证结果、与源码一致的 dist，以及最终文件清单。
  Preconditions: 步骤 1 和步骤 2 已完成，没有仍在运行的实现或检查派发。
  Procedure:
    运行仓库 lint、typecheck、build 和各包完整测试。
    用合法伪代码与缺陷样本各执行一次 PLAN 结构检查。
    检查核心源码、workflow、技能和评审指引中不再存在完整实现代码要求。
    通过构建命令生成 dist，不手工编辑构建产物。
    检查归档任务目录没有改动。
  Failure: 任一命令或样本检查失败时，返回所属步骤修复，并重跑该步骤和本步全量验证。
  ```
- Verify: 在仓库根目录运行 `pnpm lint`、`pnpm -r typecheck`、`pnpm -r build`；随后运行 core 与 adapter-dsh 的完整 `node --test test/*.test.js`，adapter-pi 的 `bun test test/*.test.ts`。预期所有命令退出码为 0，修改过的 TS 文件无类型错误。
