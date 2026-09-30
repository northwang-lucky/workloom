# S0 core 目录重构：legacy/ → domain/（引用方与文档指针全量更新）

## Goal

容器任务 `tasks/09-29-worktree-native` 的前置纯机械重构（需求 11，容器 R5-Q4/Q5/Q6）：把 `packages/core/src/legacy/` 整体更名为 `packages/core/src/domain/`，代码引用方与文档指针全量同步，零行为变化，为 S1/S2 提供稳定的新目录基座（S1 的新模块 `worktree.js` 直接落 `domain/`）。命名依据：目录内 21 个模块是 runtime 无关的领域行为模块（任务/配置/executor/git 域），与 `service/` TS 编排层形成标准分层对照，去除 "legacy" 历史包袱色彩。

## Requirements

1. **目录重命名**：`git mv packages/core/src/legacy packages/core/src/domain`（21 个 .js + 配套 .d.ts，保留历史追踪）；`dist/` 重建后 `dist/legacy/*` → `dist/domain/*`（core dist 为 git 跟踪产物，同 commit 重建提交，部署纪律）。
2. **代码引用方全量更新**：core 内全部 `./legacy/`、`../legacy/` import 与 JSDoc/注释中的目录概念表述——`src/index.ts`（导出面 ~30 处）、`src/surface.ts`、`src/workflow-contract-types.ts`、`src/service/*.ts`（12 文件）、`src/legacy/` 内部互引与注释；测试文件深引用核查（多数经 `../dist/index.js` 导入，路径常量如 `'legacy'` 字面量需逐一确认）。
3. **语义保留（防误改白名单）**：标识符/文案含 "legacy" 但语义非本目录者一律不改——`migrateLegacyTrellis`/`detectLegacyTrellis`/`MigrateLegacyTrellis*`（.trellis 历史迁移）、`LEGACY_YAML_BY_LAYER` 与遗留 YAML fail-loud 文案（config.js）、配置来源枚举 `'legacy'`（旧 subagents 层：core config.js/executor-profiles.js + 两端 adapter 类型与注释）、`workflow.md` 的 "no new/legacy distinction"（任务记录语义）、"subagents is deprecated" 文案。重命名对象仅限路径引用（`src/legacy`/`dist/legacy`/`legacy-module`）与"legacy 模块/目录"概念性表述。
4. **文档指针全量更新**：`.workloom/spec/repo/legacy-module/` 目录更名 `repo/domain-module/`（内容术语 "legacy 模块"→"domain 模块" 同步）；`.workloom/spec/repo/architecture/layering.md`、`executor-voice.md` 中的 legacy 表述；`.workloom/spec/repo/terminology/index.md` 词条（收录 domain 层术语、移除/更新 legacy 词条）；`AGENTS.md`（仓库结构图与 "legacy 纯 JS 移植模块" 表述）；`docs/`、`README.md` 引用核查；本容器三个活跃任务（容器/S1/S2 + 本任务）jsonl 与 prd 中的活指针。**历史归档任务文档（`.workloom/tasks/archive/`）不动**。
5. **零行为变化**：`index.ts` 对外导出面（符号名、类型名）不变；`packages/core/package.json` exports 仅 `.`（无深路径导出），两端 adapter 经包根导入，对内部路径重命名透明——adapter 源码与 adapter-dsh `dist/` 均不需改动；pnpm-lock / 已安装 profile 不受影响（包名未变）。

## Acceptance Criteria

1. 验证命令全绿：`pnpm lint`、`pnpm -r typecheck`、`pnpm -r build`、core 与 adapter-dsh `node --test`、adapter-pi `bun test`。
2. 全仓 grep 无活引用残留：`src/legacy`、`dist/legacy`、`legacy-module`、`legacy/` 路径式引用为零命中（排除 `.workloom/tasks/archive/` 历史归档与需求 3 白名单语义项）。
3. `packages/core/dist/domain/` 与 `src/domain/` 同 commit 入库，`dist/legacy/` 无残留文件。
4. `index.ts` 公开导出面 diff 为零（导出符号清单重命名前后一致）；core `package.json` 不变。
5. spec/AGENTS.md/terminology 更新后，session-context guidelines 清单正确列出 `repo/domain-module`（spec-index 扫描目录自动跟随，无硬编码残留）。

## Notes

- 执行顺序：S0 → S1 → S2 严格串行（容器 R5）；S0 提交为独立 refactor commit（提交规范 `.workloom/spec/repo/commits`），不与后续特性改动混合。
- 本任务无 design.md（无设计决策面），以 implement.md 机械清单驱动；test-first 不适用（零行为变化，回归由既有测试全量背书）。
- 风险面：测试/源码中 `'legacy'` 字符串字面量若参与路径拼接（如 dist 路径断言），grep 逐一判别归属（路径 → 改；语义 → 留）。
- 容器凭据：R5 轮更新后以最新 review hash 为准；本 PRD 继承 R5-Q4（位置=S0 前置）、R5-Q5（文档范围=全量、历史归档不动）、R5-Q6（名称=domain，候选池 domain/engine/kernel/modules/lib）。

## Alignment Decisions

### 继承（容器 PRD R5 轮，用户已裁决）

R5-Q4：重命名作为容器前置子任务 S0 交付（纯机械重构与特性开发分离）；R5-Q5：文档指针全量（代码 + spec 目录更名 + AGENTS.md + terminology + 活跃任务活指针，历史归档不动）；R5-Q6：目录新名 `domain`（用户从候选池中选定，依据为目录内模块用途——领域行为模块 vs service 编排层）。

### 开放节点

无——名称、位置、文档范围、语义保留白名单、验证面均已定，前沿一轮即空。

### 收敛摘要

范围为纯机械重构：重命名 + 5 类引用面（core imports / dist / spec / AGENTS+terminology / 活跃任务活指针）+ 语义保留白名单；验收 5 条（验证命令全绿、grep 零活引用、dist 同 commit、导出面零 diff、guidelines 清单正确）；非目标：不改行为、不动 adapter 源码与 dist、不动历史归档、不动 pnpm-lock/profile。无灰区。

<!-- workloom:open-nodes=none -->
