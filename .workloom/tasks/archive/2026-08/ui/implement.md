# implement：核心工作流新增前端 UI 设计对齐流程

按步骤顺序执行，每步完成判据通过后再进下一步。全部文件路径相对仓库根。

## Step 1 契约：workflow.md

- `packages/assets/workflow/workflow.md`：front-matter `version: 8` → `9`。
- 1.1 段落（"For tasks with design decisions, load the grilling skill…" 之后、test-first 固定问题之后）新增：

  ```md
  **The fixed UI-design question:** does the task involve frontend UI presentation?
  Options:
  - A. yes: UI design alignment joins the alignment scope (Phase 1.1b).
  - B. no.

  For A, after brainstorming, run Phase 1.1b UI design alignment with the
  `workloom-ui-design` skill: explore the UI axes (pages/components and
  information architecture, layout and navigation, visual style and design
  source, interactions and states, responsiveness, accessibility, observable
  acceptance points), record decidable UI requirements in a `## UI Design`
  section of prd.md, and require a UI design chapter in design.md when the
  task is complex. UI decisions then join grilling (Phase 1.1c) for the
  design-tree pressure test; all UI requirements face the same no-grey-areas
  gate.
  ```

- 若 1.1 正文现无 "1.1b" 字样则不改；grilling 定位如需编号，明确为 "Phase 1.1c"。
- 完成判据：parseContract 可解析，version=9，1.1 正文含固定问题与 1.1b/1.1c 措辞，既有句子未删改。

## Step 2 新增 skill：workloom-ui-design

- 新建 `packages/assets/skills/workloom-ui-design/SKILL.md`（英文正文）。
- front-matter 仅 `name`/`description`（必填）/`whenToUse`。
- 正文按 design.md 第 4 节结构：定位、七轴讨论（每轴问题样例）、提问四则、产物（prd.md「UI Design」小节 + 复杂任务 design.md 章节）、grilling 交接、完成判据。
- 完成判据：front-matter 三键齐全；正文含"Phase 1.1b"定位与七轴每个轴名。

## Step 3 联动改动

- `packages/assets/skills/workloom-brainstorm/SKILL.md`：正文加一句交接（"Tasks with frontend presentation requirements continue into Phase 1.1b UI design alignment (workloom-ui-design skill) before grilling."）置于 division-of-labor 段；description 不动。
- `packages/assets/third-party/mattpocock-skills/grilling/SKILL.md`：注记行 `Phase 1.1b` → `Phase 1.1c`。
- `packages/assets/third-party/mattpocock-skills/tdd/SKILL.md`：注记中两处 `Phase 1.1b` → `Phase 1.1c`。
- `.workloom/spec/repo/terminology/index.md`：grilling 词条 `Phase 1.1b` → `Phase 1.1c`。
- 完成判据：grep 全库无残留 "1.1b" 指代 grilling 的注记/词条（brainstorm 的 1.1a 除外）。

## Step 4 adapter 注册

- `packages/adapter-dsh/src/skills.ts`：SKILL_ASSETS 数组加 `'skills/workloom-ui-design/SKILL.md'`；注释 "5 个 SKILL.md" → "6 个"。
- `packages/adapter-pi/scripts/sync-skills.mjs`：SKILL_SOURCES 加 `'../assets/skills/workloom-ui-design'`；注释 "5 个 skill 目录" → "6 个"。
- 完成判据：两处清单各新增一行，数量说明同步。

## Step 5 测试更新

- `packages/core/test/contract-asset.test.js`：
  - `assert.equal(contract.version, 8)` → `9`；测试名 "契约 v8…" → "v9"。
  - 新增测试：1.1 正文包含 `Does this task involve frontend UI presentation?`、`Phase 1.1b`、`Phase 1.1c`。
- 完成判据：新断言通过，旧断言（norms 一致性、步骤 id 列表、1.0/1.4 措辞）仍绿。

## Step 6 验证

```bash
cd packages/core && node --test test/*.test.js
pnpm lint
pnpm -r typecheck
pnpm -r build
```

- 完成判据：全部通过；`packages/adapter-pi/skills/workloom-ui-design/SKILL.md` 由 build 生成存在。

## Step 7 提交拆分（由主会话 2.3 执行，implement 不提交）

1. `feat(workflow): 契约新增前端 UI 设计对齐固定问题与 1.1b 阶段`（workflow.md + contract-asset.test.js）
2. `feat(assets): 新增 workloom-ui-design skill 并登记双 adapter`（SKILL.md + skills.ts + sync-skills.mjs + brainstorm 交接句 + vendored 注记）
3. `docs(spec): terminology 同步 grilling 编号至 1.1c`（.workloom/spec/repo/terminology/index.md）
