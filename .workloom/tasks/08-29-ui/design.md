# design：核心工作流新增前端 UI 设计对齐流程

## 1. 背景与目标

现状：工作流契约 1.1 只对齐代码逻辑需求（brainstorm 三轴 + test-first 固定问题 + grilling），模型对涉及前端页面展示的任务不会主动发起 UI 讨论。

目标：契约 1.1 新增固定问题（是否涉及前端 UI 展示），回答 yes 则强制进入 Phase 1.1b UI 设计对齐子阶段（新 skill 承载），之后仍由 grilling（顺延为 1.1c）收口全部设计决策。

## 2. 改动总览

| 文件 | 改动 |
| --- | --- |
| `packages/assets/workflow/workflow.md` | version 8→9；1.1 正文新增 UI 固定问题与 1.1b 条件流程段落 |
| `packages/assets/skills/workloom-ui-design/SKILL.md` | 新增（Phase 1.1b 流程 skill） |
| `packages/adapter-dsh/src/skills.ts` | SKILL_ASSETS 登记新 skill；注释中 skill 数量 5→6 |
| `packages/adapter-pi/scripts/sync-skills.mjs` | SKILL_SOURCES 登记 '../assets/skills/workloom-ui-design'；注释同步 |
| `packages/core/test/contract-asset.test.js` | version 断言 8→9（含测试名）；新增 UI 固定问题措辞锁定断言 |
| `packages/assets/third-party/mattpocock-skills/grilling/SKILL.md` | 注记 "Phase 1.1b" → "1.1c"（一行） |
| `packages/assets/third-party/mattpocock-skills/tdd/SKILL.md` | 注记两处 "1.1b" → "1.1c" |
| `packages/assets/skills/workloom-brainstorm/SKILL.md` | 正文新增一句与 workloom-ui-design 的交接说明（description 不变） |
| `.workloom/spec/repo/terminology/index.md` | grilling 词条 "Phase 1.1b" → "1.1c" |

注：`packages/adapter-pi/skills/` 与各 `dist/` 是构建产物（gitignore），由 `pnpm -r build` 重建，不手工改、不提交。

## 3. 契约 1.1 正文改写设计

### 3.1 新增固定问题（置于 test-first 固定问题之后）

原文风格参照既有段落，措辞锁定如下（英文，入选项列表不入问题正文）：

> **The fixed UI-design question:** Does this task involve frontend UI presentation?
> Options:
> - A. yes: UI design alignment joins the alignment scope (Phase 1.1b).
> - B. no.

### 3.2 条件流程段落（紧随固定问题之后）

要求表述三条：A 则加载 workloom-ui-design skill 执行 1.1b；七轴讨论结论写入 prd.md「UI Design」小节（不进骨架门禁）；涉及前端展示且 author both 的任务，design.md 须含 UI 设计章节；UI 决策纳入 grilling（1.1c）收口。

### 3.3 子阶段编号与既有措辞的顺延

- 1.1 正文中 grilling 的定位改为 "Phase 1.1c"（若正文出现 1.1b 字样需同步）。
- brainstorm skill 自述 "Phase 1.1a" 不变；grilling/tdd vendored 注记改 1.1c。
- 顶层步骤 id（1.0/1.1/…/3.1）、tag 块、norms 块、PRD_SECTIONS 均不变。

## 4. workloom-ui-design skill 结构

front-matter：`name: workloom-ui-design`；`description` 说明职责为 Phase 1.1b UI 设计对齐（触发分支：契约固定问题 A、涉及前端展示、页面/组件/视觉/交互讨论）；`whenToUse` 可写触发条件。正文（英文，imperative）结构：

1. 定位：1.1 固定问题 A 之后执行，先于 grilling。
2. 讨论七轴（每轴列问题样例）：页面/组件清单与信息架构、布局与导航、视觉风格与设计稿来源（Figma/设计系统/组件库）、交互细节与状态（loading/empty/error/success、表单校验）、响应式与多端适配、无障碍、可观测验收点。
3. 提问规范：复用契约提问四则（用户语言、选项不入问题文本、禁用交互式提问工具、一次列全批次）。
4. 产物：prd.md 增加「UI Design」小节，内容按七轴收敛为可判定需求；任务复杂（多页面/多状态/设计系统要求）时在 design.md 出 UI 设计章节。
5. 与 grilling 关系：UI 决策进 grilling 设计树收口，prd 中 UI 需求同受 no-grey-areas 门禁。
6. 完成判据：七轴均覆盖或显式声明不适用；UI 需求可判定、无开放假设。

## 5. 测试与验证

- contract-asset.test.js：`contract.version` 断言 8→9；测试名 "契约 v8…" → "v9"；新增断言 1.1 正文含 "Does this task involve frontend UI presentation?"、含 "Phase 1.1b" 与 "Phase 1.1c" 定位。其余断言（norms 措辞一致性、步骤 id 列表）应保持通过。
- verify 命令：`cd packages/core && node --test test/*.test.js`、`pnpm lint`、`pnpm -r typecheck`、`pnpm -r build`（build 会重建 adapter-pi/skills 与 dist，验证注册清单正确性）。

## 6. 关键边界与不做的事

- PRD_SECTIONS 不变：UI 小节按需写入 prd.md，但骨架与 placeholder 门禁不感知它。
- 9 步顶层契约步骤 id 不变；不新增顶层步骤（1.5 之类），不新增 tag 块/状态。
- overlay 机制（workflow.override.md）不动。
- 发布动作（build 产物 sync 到 DSH profile、dshweb 重启）不在任务内，收尾时给用户提醒。
- terminology 中 brainstorm（1.1a）词条不变，仅 grilling 词条顺延。

## 7. 风险与对策

- 风险 1：1.1 正文与 norms 的提问四则措辞一致性断言（contract-asset.test.js 校验 norms 与 1.1 正文逐字包含）——新增段落不删除、不改写既有四则句子即可。
- 风险 2：vendored skill 注记改动违反 vendoring 约定——仅改 workloom 注记行（`> workloom: ...`）中的编号，不动上游正文；README 注明 vendored 改写约定为注记行。
- 风险 3：DSH skill 注册对 front-matter 键严格（只认 name/description/whenToUse）——新 skill front-matter 只放这三个键，必填 name/description。

