# 存量任务迁移技能 workloom-migrate-plan — plan

按 test-first 红绿推进（三接缝：dsh 注册面 / pi 同步面 / assets 文本面）。需求与验收以 [prd.md](prd.md) 的 R1–R6 / AC1–AC6 为准；实现前读 prd.md + implement.jsonl 列出的 spec 条目。全部改动与验证命令在任务代码根执行（task.json `worktree_path` 非空时即 worktree 根，注入纪律已指向）。改前片段均已对当前文件核对唯一命中；子串/块替换命中数不符即停止上报。

## 修订记录

- 修订 1（实现交付后主会话复核落账；两处均为计划 Verify 预期的文案误差，非实现缺陷，执行器“实质门槛达标、记录后继续”的判定予以追认）：
  1. 步骤 2.1 的 Verify `grep -c "workloom-migrate-plan"` 预期由 ≥ 2 更正为 1：规定文案中仅清单项一行含完整字面串，头注释与测试名为斜杠连接形式 `packages-scan/migrate-plan`（无 workloom- 前缀），原预期在计划自身文案下不可达成；实质门槛（阶段 2 恰 1 红、绿后产物 9 目录）均达标。
  2. 步骤 3.1 的 Verify `grep -c "## Step"` 预期由 4 更正为「行首锚定 `grep -c "^## Step"` 输出 4」：未锚定模式会多命中 SKILL.md 正文 Step 3 内联的 `## Steps` 字样（合计 5）；行首锚定计数 4 为正确口径，结构实质达标。
  教训（与 A/C 修订同根因类）：计划的 Verify grep 模式与预期计数必须从计划自身的改后文案推导并自查相容（子串误命中、字面前缀形态），不能凭记忆书写。

## Design decisions

1. **技能命名 workloom-migrate-plan**（prd 已定 8）：动宾结构与 update-spec / packages-scan 家族一致；frontmatter 只含 name/description/whenToUse 三键（dsh 解析器只认这三键）。
2. **注释去硬编码计数**（prd 已定 13）：skills.ts / plugin.ts / sync-skills.mjs 的注释不再写“N 个”，改为“清单为单一来源”表述；registerSkills 的重复 JSDoc 块（既有瑕疵，两段同文案叠放）合并为一段——本次编辑面内必须处理，否则 check 阶段按“非本次引入问题”报 P1。
3. **技能文档结构**：Boundaries（范围/执行主体/语义冻结）→ 四步流程（Scan → Rewrite prd + 凭据重确认 → Rewrite plan → Confirm + remove）→ Completion criteria；关键句由 dsh 新测试逐字固定（接缝③）。技能文本英文（assets 运行时文案语言规范）；迁移注记模板给英文句式，消费项目按自身语言规范本地化。
4. **continue legacy 分支的位置**：必须插在「`planning` with prd.md but no plan.md → 1.4 await review」行之前——否则带旧制品的任务先被该行截走误路由到 1.4；分支条件覆盖 planning 与 in_progress 两种状态。
5. **红集合推导（按 red-green-expectations spec 完成消费者追踪）**：技能名单的消费点共四处（skills.ts 与 sync-skills.mjs 两个清单源、dsh skills.test.js 与 pi skills.test.ts 两个清单契约测试）；plugin.test.js 仅 mock `skills.register` 无名单断言，其余 dsh/pi 测试无技能计数断言，core 中的 workloom-packages-scan 命中均为无关错误文案。预期红：阶段 1 dsh 恰 2 红（清单契约 8≠9、新测试读缺失资产文件 ENOENT），阶段 2 pi 恰 1 红（产物清单 8≠9）；其余全绿。
6. **AC4 演练用 core dist 纯函数模拟凭据链**：computePrdHash 对比即 stale 判定机制本体（evaluateStaleAlignmentGate 的内核），叶子执行器不可调用编排工具，故演练以纯函数脚本走通「旧凭据匹配 → 重写后 stale → 更新 hash 后清除」三态；演练目录在 /tmp，产物不入库。
7. **AC6（本文档形态）由本文档自身承载**：无对应实现步骤，步骤 Covers 不出现 AC6，核对时以本条为据。

## Steps

### 阶段 0：基线确认

#### 步骤 0.1 基线全绿

- Covers: (internal)
- Target: 无文件改动（验证步骤）
- Edit: 无
- Verify: 依次运行，全部预期 exit 0 / 全绿，任何一项红即停止上报阻塞项：
  1. `pnpm lint && pnpm -r typecheck && pnpm -r build`
  2. `cd packages/core && node --test test/*.test.js`
  3. `cd packages/adapter-dsh && pnpm run test`
  4. `cd packages/adapter-pi && bun test test/*.test.ts`
  5. `cd packages/assets && pnpm run test`

### 阶段 1（红，接缝①③）：packages/adapter-dsh/test/skills.test.js

#### 步骤 1.1 清单契约测试改 9 名单

- Covers: AC1
- Target: packages/adapter-dsh/test/skills.test.js —— 「skill 清单契约」测试（标题 + deepEqual 名单）
- Edit 改前（标题行，唯一命中）：

```js
test('skill 清单契约：注册 continue/finish/alignment/update-spec/packages-scan + generic tdd/grilling/writing-for-agents，不含旧两个 workloom skill', () => {
```

- Edit 改后：

```js
test('skill 清单契约：注册 continue/finish/alignment/update-spec/packages-scan/migrate-plan + generic tdd/grilling/writing-for-agents，不含旧两个 workloom skill', () => {
```

- Edit 改前（名单块，唯一命中）：

```js
  assert.deepEqual(names.sort(), [
    'grilling',
    'tdd',
    'workloom-alignment',
    'workloom-continue',
    'workloom-finish',
    'workloom-packages-scan',
    'workloom-update-spec',
    'writing-for-agents',
  ])
```

- Edit 改后（按字母序插入 workloom-migrate-plan）：

```js
  assert.deepEqual(names.sort(), [
    'grilling',
    'tdd',
    'workloom-alignment',
    'workloom-continue',
    'workloom-finish',
    'workloom-migrate-plan',
    'workloom-packages-scan',
    'workloom-update-spec',
    'writing-for-agents',
  ])
```

- Verify: `grep -c "workloom-migrate-plan" packages/adapter-dsh/test/skills.test.js` 输出 ≥ 1。

#### 步骤 1.2 追加新技能资产可解析测试（接缝③固定）

- Covers: AC2, AC3
- Target: packages/adapter-dsh/test/skills.test.js —— 「skill 清单契约」测试结尾之后插入新测试
- Edit 改前（插入锚点，唯一命中）：

```js
  assert.ok(!names.includes('workloom-brainstorm'), '旧 brainstorm 不再注册')
  assert.ok(!names.includes('workloom-ui-design'), '旧 ui-design 不再注册')
})
```

- Edit 改后（原块保留，其后追加；readFileSync/parseSkillFrontmatter 为文件既有导入，不新增 import）：

```js
  assert.ok(!names.includes('workloom-brainstorm'), '旧 brainstorm 不再注册')
  assert.ok(!names.includes('workloom-ui-design'), '旧 ui-design 不再注册')
})

test('workloom-migrate-plan 资产可解析：迁移流程与边界关键句 + continue legacy 路由指针', () => {
  const doc = readFileSync(
    new URL('../../assets/skills/workloom-migrate-plan/SKILL.md', import.meta.url),
    'utf8',
  )
  const [err, parsed] = parseSkillFrontmatter(doc)
  assert.equal(err, null)
  assert.equal(parsed.name, 'workloom-migrate-plan')
  assert.ok(parsed.description !== '', 'description must be non-empty')
  // 迁移四步流程标题齐全（扫描 → 重写 prd → 重写 plan → 确认删原件）
  assert.match(parsed.body, /## Step 1: Scan/)
  assert.match(parsed.body, /## Step 2: Rewrite prd\.md/)
  assert.match(parsed.body, /## Step 3: Rewrite the plan as plan\.md/)
  assert.match(parsed.body, /## Step 4: Confirm, then remove the originals/)
  // 凭据重确认路径、research 辅助、归档不扫边界、Covers 标注、in_progress 执行标注
  assert.match(parsed.body, /workloom_task_align/)
  assert.match(parsed.body, /action=confirm/)
  assert.match(parsed.body, /dispatch `research`/)
  assert.match(parsed.body, /never scan, never migrate/)
  assert.match(parsed.body, /Covers/)
  assert.match(parsed.body, /\[executed <commit\/date> — <verification state>\]/)
  // continue 路由表含 legacy 分支指针句
  const cont = readFileSync(
    new URL('../../assets/skills/workloom-continue/SKILL.md', import.meta.url),
    'utf8',
  )
  assert.match(cont, /workloom-migrate-plan skill \(legacy artifacts/)
})
```

- Verify: `grep -c "workloom-migrate-plan 资产可解析" packages/adapter-dsh/test/skills.test.js` 输出 1。

#### 步骤 1.3 红验证（接缝①③）

- Covers: AC1, AC2, AC3
- Target: 无文件改动（验证步骤）
- Edit: 无
- Verify: `cd packages/adapter-dsh && pnpm run test`（含 build；src 清单未改，新技能资产尚不存在）。
  预期失败名单（恰 2 个，逐一对照记入报告）：
  1. 「skill 清单契约：注册 continue/finish/alignment/update-spec/packages-scan/migrate-plan + generic tdd/grilling/writing-for-agents，不含旧两个 workloom skill」（注册名单 8 项 ≠ 期望 9 项）
  2. 「workloom-migrate-plan 资产可解析：迁移流程与边界关键句 + continue legacy 路由指针」（readFileSync ENOENT：资产文件尚未创建）
  其余测试（含 plugin.test.js 的 mock 注册路径）保持绿。多红少红都停止上报。

### 阶段 2（红，接缝②）：packages/adapter-pi/test/skills.test.ts

#### 步骤 2.1 产物清单契约改 9 目录（含头注释与测试名同步）

- Covers: AC1
- Target: packages/adapter-pi/test/skills.test.ts —— 文件头注释、「skills 产物清单」测试名与 deepEqual 名单
- Edit 改前（头注释，唯一命中）：

```ts
 * adapter-pi skills 分发契约：build（sync-skills.mjs）产物目录只含
 * workloom-continue/finish/alignment/update-spec/packages-scan + 三个 vendored
 * generic skills，不再有旧 brainstorm/ui-design。测试依赖 build（test 前先 pnpm build）。
```

- Edit 改后：

```ts
 * adapter-pi skills 分发契约：build（sync-skills.mjs）产物目录只含
 * workloom-continue/finish/alignment/update-spec/packages-scan/migrate-plan + 三个
 * vendored generic skills，不再有旧 brainstorm/ui-design。测试依赖 build（test 前先 pnpm build）。
```

- Edit 改前（测试名，唯一命中）：

```ts
test('skills 产物清单：只含 continue/finish/alignment/update-spec/packages-scan + 三个 vendored generic skills', () => {
```

- Edit 改后：

```ts
test('skills 产物清单：只含 continue/finish/alignment/update-spec/packages-scan/migrate-plan + 三个 vendored generic skills', () => {
```

- Edit 改前（名单块，唯一命中）：

```ts
  assert.deepEqual(entries, [
    'grilling',
    'tdd',
    'workloom-alignment',
    'workloom-continue',
    'workloom-finish',
    'workloom-packages-scan',
    'workloom-update-spec',
    'writing-for-agents',
  ])
```

- Edit 改后：

```ts
  assert.deepEqual(entries, [
    'grilling',
    'tdd',
    'workloom-alignment',
    'workloom-continue',
    'workloom-finish',
    'workloom-migrate-plan',
    'workloom-packages-scan',
    'workloom-update-spec',
    'writing-for-agents',
  ])
```

- Verify: `grep -c "workloom-migrate-plan" packages/adapter-pi/test/skills.test.ts` 输出 ≥ 2。

#### 步骤 2.2 红验证（接缝②）

- Covers: AC1
- Target: 无文件改动（验证步骤）
- Edit: 无
- Verify: `cd packages/adapter-pi && pnpm run build && bun test test/skills.test.ts`（sync-skills 清单未改，产物仍 8 目录）。
  预期失败名单（恰 1 个）：「skills 产物清单：只含 …/migrate-plan + 三个 vendored generic skills」（产物目录 8 ≠ 期望 9）。
  预期保持绿：「package manifest 显式注册 skills 目录」「skills 产物不再含旧两个 workloom skill」。多红少红都停止上报。

### 阶段 3（绿，assets）：新建技能文档 + continue legacy 分支

#### 步骤 3.1 新建 packages/assets/skills/workloom-migrate-plan/SKILL.md

- Covers: AC1, AC3
- Target: packages/assets/skills/workloom-migrate-plan/SKILL.md（新文件）
- Edit: 新建，全文如下（一字不改；frontmatter 只含 name/description/whenToUse 三键）：

````markdown
---
name: workloom-migrate-plan
description: Migrate a workloom task's legacy plan artifacts (design.md + implement.md) into a single prescriptive plan.md and rewrite its prd.md into the R/AC numbered-traceability format. Use whenever a planning or in_progress task directory holds design.md/implement.md without plan.md — including when workloom-continue routes here on resume — or when the user asks to scan a project for legacy task documents and migrate them. Archived tasks are never touched.
whenToUse: Use on any workloom task in planning or in_progress whose directory still carries the pre-plan.md artifacts (design.md / implement.md), or when the user asks for a project-wide legacy-artifact scan and migration.
---

# Workloom Migrate Plan

Legacy tasks authored before the plan.md contract carry `design.md` + `implement.md` and a free-format `prd.md`. Under the current contract these files are invisible to executor injection — the task effectively has no plan. Migration is a rewrite, not a merge: the migrated plan meets the prescriptive Authoring bar against the CURRENT code, and the migrated prd meets the R/AC numbered-traceability format with semantics preserved item by item.

## Boundaries

- Scope: `planning` and `in_progress` tasks only. Archived tasks (under `tasks/archive/`) are historical records — never scan, never migrate them.
- The main session performs the migration (plan-authoring authority stays with the main session). The only executor involvement is an optional `research` dispatch to gather anchor facts for a large plan.
- Semantics are frozen: the prd rewrite is a format upgrade plus verification-method completion; every original requirement survives as exactly one R/AC item.

## Step 1: Scan

List candidate tasks: every `planning` / `in_progress` task directory that contains `design.md` or `implement.md` and has no `plan.md`. Present the list — task, status, legacy files present, prd/credential state — and let the user pick the order. Migrate one task per pass; each pass ends with its own user confirmation before the next task starts.

## Step 2: Rewrite prd.md (numbered traceability)

1. Read the current prd.md fully. Rewrite Requirements as numbered R items (each a single decidable statement) and Acceptance Criteria as numbered AC items (each with its verification method and the R items it covers), keeping `## Alignment Decisions` and the open-nodes marker intact.
2. Put the migration note on the first line under the H1: `> Migrated <date> from the pre-R/AC prd format; semantics preserved item by item.`
3. Show the user the item-by-item mapping (original statement → new R/AC number) and get confirmation.
4. The rewrite makes any recorded alignment credential stale. Re-run `workloom_task_align` action=review, re-confirm with the user focused on the changed area, then run action=confirm with the new hash. For an in_progress task, the stale gate blocks further dispatches until this re-confirm lands.

## Step 3: Rewrite the plan as plan.md (prescriptive)

1. Read design.md and implement.md fully, plus the rewritten prd.md and any research materials.
2. Verify every anchor against the current code: open each referenced file, confirm the symbol exists and each before-snippet locates uniquely — the code may have moved since the legacy plan was written. For a large plan, dispatch `research` to gather the anchor facts first.
3. Write `plan.md` following the workloom-alignment skill's references/plan-authoring.md: `## Design decisions` (from design.md) + `## Steps`, each step carrying Covers (the new AC numbers) / Target / Edit / Verify.
4. For an `in_progress` task, rewrite the FULL plan: completed steps stay, each annotated `[executed <commit/date> — <verification state>]`; remaining steps are re-anchored against current code.
5. Put the migration note on the first line under the H1: `> Migrated <date> from design.md + implement.md (pre-plan.md contract), rewritten to the prescriptive bar.`

## Step 4: Confirm, then remove the originals

Present the migrated plan.md with the anchor-verification results to the user. Only after the user confirms: delete `design.md` and `implement.md`. The task is migrated — re-route it by workloom-continue (planning → 1.4 review package; in_progress → resume at its current phase), then return to Step 1 for the next task.

## Completion criteria

The task directory holds a prescriptive `plan.md` (every step with Covers/Target/Edit/Verify) and an R/AC-format `prd.md` with a fresh alignment credential; both carry migration notes; `design.md` and `implement.md` are gone.
````

- Verify: `ls packages/assets/skills/workloom-migrate-plan/` 输出 SKILL.md；`grep -c "## Step" packages/assets/skills/workloom-migrate-plan/SKILL.md` 输出 4。

#### 步骤 3.2 continue 路由表插入 legacy 分支

- Covers: AC2
- Target: packages/assets/skills/workloom-continue/SKILL.md —— 路由表「`planning` with prd.md but no plan.md」行之前
- Edit 改前（唯一命中，注意行首三空格缩进）：

```md
   - `planning` with prd.md but no plan.md → 1.4 await review (lightweight task, PRD artifacts ready).
```

- Edit 改后（新行插入在前，原行保留）：

```md
   - `planning` or `in_progress` with design.md/implement.md but no plan.md → load the workloom-migrate-plan skill (legacy artifacts of the pre-plan.md contract), migrate, then re-route.
   - `planning` with prd.md but no plan.md → 1.4 await review (lightweight task, PRD artifacts ready).
```

- Verify: `grep -c "workloom-migrate-plan skill (legacy artifacts" packages/assets/skills/workloom-continue/SKILL.md` 输出 1；`grep -n "with prd.md but no plan.md" packages/assets/skills/workloom-continue/SKILL.md` 的行号大于 legacy 分支行号（顺序正确）。

### 阶段 4（绿，adapters）：注册清单与注释

#### 步骤 4.1 adapter-dsh skills.ts —— 头注释去计数

- Covers: AC1
- Target: packages/adapter-dsh/src/skills.ts —— 文件头 JSDoc 的 registerSkills 条目
- Edit 改前（唯一命中）：

```ts
 * - registerSkills：把 assets 包内的 8 个 SKILL.md（自有 continue/finish/
 *   alignment/update-spec/packages-scan + 三个 vendored mattpocock skills）
 *   注册进 ctx.skills；任一 skill 缺失/解析失败/注册抛错都只 console.warn 跳过，
 *   skill 注册失败不阻塞插件；
```

- Edit 改后：

```ts
 * - registerSkills：把 assets 包内 SKILL_ASSETS 清单列出的 SKILL.md 注册进
 *   ctx.skills（清单为计数单一来源；自有 workloom skills + vendored mattpocock
 *   skills）；任一 skill 缺失/解析失败/注册抛错都只 console.warn 跳过，
 *   skill 注册失败不阻塞插件；
```

#### 步骤 4.2 skills.ts —— SKILL_ASSETS 注释与清单第 9 项

- Covers: AC1
- Target: packages/adapter-dsh/src/skills.ts —— SKILL_ASSETS 常量（JSDoc + 清单）
- Edit 改前（唯一命中）：

```ts
/** 注册的 skill 资源（相对 assets 包根；resourceBase 取其所在目录）。
 * 自有 workloom 侧注册 continue/finish（原 slash 命令改造的路由与收尾指引）、
 * alignment（统一 Phase 1.1）、update-spec 与 packages-scan；
 * 旧 brainstorm/ui-design 不再注册，generic tdd/grilling/writing-for-agents 独立分发。 */
const SKILL_ASSETS = [
  'skills/workloom-continue/SKILL.md',
  'skills/workloom-finish/SKILL.md',
  'skills/workloom-alignment/SKILL.md',
  'skills/workloom-update-spec/SKILL.md',
  'skills/workloom-packages-scan/SKILL.md',
```

- Edit 改后：

```ts
/** 注册的 skill 资源（相对 assets 包根；resourceBase 取其所在目录）。
 * 自有 workloom 侧注册 continue/finish（原 slash 命令改造的路由与收尾指引）、
 * alignment（统一 Phase 1.1）、update-spec、packages-scan 与 migrate-plan
 * （存量计划迁移）；旧 brainstorm/ui-design 不再注册，generic
 * tdd/grilling/writing-for-agents 独立分发。 */
const SKILL_ASSETS = [
  'skills/workloom-continue/SKILL.md',
  'skills/workloom-finish/SKILL.md',
  'skills/workloom-alignment/SKILL.md',
  'skills/workloom-update-spec/SKILL.md',
  'skills/workloom-packages-scan/SKILL.md',
  'skills/workloom-migrate-plan/SKILL.md',
```

#### 步骤 4.3 skills.ts —— registerSkills 重复 JSDoc 合并去重 + 去计数

- Covers: AC1
- Target: packages/adapter-dsh/src/skills.ts —— registerSkills 函数前两段重复 JSDoc
- Edit 改前（唯一命中，两段叠放的完整块）：

```ts
/**
 * 注册 assets 包内的 8 个 SKILL.md 到 ctx.skills（register 自绑定 fiber 生命周期，
 * 插件卸载自动注销）。任一 skill 缺失/解析失败/注册抛错都只告警跳过，不阻塞插件。
 * @param ctx 插件上下文（skills 由宿主注入）
 */
/**
 * 注册 assets 包内的 8 个 SKILL.md 到 ctx.skills（register 自绑定 fiber 生命周期，
 * 插件卸载自动注销）。任一 skill 缺失/解析失败/注册抛错都只告警跳过，不阻塞插件。
 * @param ctx 插件上下文（skills 由宿主注入，官方 Context 增强类型）
 */
export function registerSkills(ctx: Context): void {
```

- Edit 改后（合并为一段，计数改为清单口径，保留信息更全的第二段 @param 文案）：

```ts
/**
 * 注册 SKILL_ASSETS 清单列出的 SKILL.md 到 ctx.skills（register 自绑定 fiber
 * 生命周期，插件卸载自动注销）。任一 skill 缺失/解析失败/注册抛错都只告警跳过，
 * 不阻塞插件。
 * @param ctx 插件上下文（skills 由宿主注入，官方 Context 增强类型）
 */
export function registerSkills(ctx: Context): void {
```

#### 步骤 4.4 adapter-dsh plugin.ts —— apply JSDoc 去计数

- Covers: AC1
- Target: packages/adapter-dsh/src/plugin.ts —— apply 函数 JSDoc
- Edit 改前（唯一命中）：

```ts
/**
 * 插件入口：注册 session-context 与 breadcrumb 两个注入、三个 workloom slash
 * 命令、executor 工具、6 个 runtime skills（含统一 alignment 与 packages-scan）
 * 与步骤详情工具。
 * @param ctx 插件作用域上下文
 */
```

- Edit 改后：

```ts
/**
 * 插件入口：注册 session-context 与 breadcrumb 两个注入、三个 workloom slash
 * 命令、executor 工具、runtime skills（skills.ts 的 SKILL_ASSETS 清单为单一来源）
 * 与步骤详情工具。
 * @param ctx 插件作用域上下文
 */
```

#### 步骤 4.5 adapter-pi sync-skills.mjs —— 头注释与清单第 9 项

- Covers: AC1
- Target: packages/adapter-pi/scripts/sync-skills.mjs —— 文件头 JSDoc、SKILL_SOURCES 注释与清单
- Edit 改前（头注释，唯一命中）：

```js
/**
 * 清空并重建本包 skills/ 目录：从 ../assets 递归拷贝 8 个 skill 目录
 * （自有 continue/finish/alignment/update-spec/packages-scan + 三个 vendored
 * mattpocock skills），连同目录内所有文件（SKILL.md / references / agents /
 * 子文档 / scripts 脚本资产）与 mattpocock 的 LICENSE。
```

- Edit 改后：

```js
/**
 * 清空并重建本包 skills/ 目录：从 ../assets 递归拷贝 SKILL_SOURCES 清单列出的
 * skill 目录（清单为计数单一来源），连同目录内所有文件（SKILL.md / references /
 * agents / 子文档 / scripts 脚本资产）与 mattpocock 的 LICENSE。
```

- Edit 改前（清单注释 + 清单，唯一命中）：

```js
/** 相对本包根的资源源目录（整目录递归拷贝）。
 * 自有 workloom 侧同步 continue/finish（原 slash 命令改造的路由与收尾指引）、
 * alignment（统一 Phase 1.1）、update-spec 与 packages-scan；
 * 旧 brainstorm/ui-design 目录不再同步，generic tdd/grilling/writing-for-agents 保留。 */
const SKILL_SOURCES = [
  '../assets/skills/workloom-continue',
  '../assets/skills/workloom-finish',
  '../assets/skills/workloom-alignment',
  '../assets/skills/workloom-update-spec',
  '../assets/skills/workloom-packages-scan',
```

- Edit 改后：

```js
/** 相对本包根的资源源目录（整目录递归拷贝）。
 * 自有 workloom 侧同步 continue/finish（原 slash 命令改造的路由与收尾指引）、
 * alignment（统一 Phase 1.1）、update-spec、packages-scan 与 migrate-plan
 * （存量计划迁移）；旧 brainstorm/ui-design 目录不再同步，generic
 * tdd/grilling/writing-for-agents 保留。 */
const SKILL_SOURCES = [
  '../assets/skills/workloom-continue',
  '../assets/skills/workloom-finish',
  '../assets/skills/workloom-alignment',
  '../assets/skills/workloom-update-spec',
  '../assets/skills/workloom-packages-scan',
  '../assets/skills/workloom-migrate-plan',
```

#### 步骤 4.6 绿验证（三接缝）

- Covers: AC1, AC2, AC3
- Target: 无文件改动（验证步骤）
- Edit: 无
- Verify:
  1. `cd packages/adapter-dsh && pnpm run test` 全绿（阶段 1 的 2 红转绿：注册名单 9 项、新技能资产可解析 + continue 指针句命中）。
  2. `cd packages/adapter-pi && pnpm run build && bun test test/skills.test.ts` 全绿（阶段 2 的 1 红转绿：产物 9 目录；build 输出 `Synced 9 skill directories …`）。
  3. `ls packages/adapter-pi/skills/workloom-migrate-plan/` 输出 SKILL.md。

### 阶段 5：清扫、端到端演练与全量验证

#### 步骤 5.1 计数注释清扫

- Covers: AC1
- Target: 无文件改动（清扫步骤）
- Edit: 无
- Verify:
  1. `grep -rn "8 个\|6 个 runtime\|9 个" packages/adapter-dsh/src/skills.ts packages/adapter-dsh/src/plugin.ts packages/adapter-pi/scripts/sync-skills.mjs` 预期 0 命中（硬编码计数全部移除，杜绝再漂移）。
  2. `grep -c "单一来源" packages/adapter-dsh/src/skills.ts packages/adapter-dsh/src/plugin.ts packages/adapter-pi/scripts/sync-skills.mjs` 每文件输出 ≥ 1（新口径就位）。
  3. `grep -c "注册 assets 包内的 8 个" packages/adapter-dsh/src/skills.ts` 输出 0（重复 JSDoc 已合并）。

#### 步骤 5.2 AC4 端到端演练（临时目录，产物不入库）

- Covers: AC4
- Target: /tmp/migrate-plan-drill（演练场；不向仓库或 worktree 写任何文件；core 纯函数从任务代码根的 packages/core/dist 导入）
- Edit: 按下列子步骤执行（模拟主会话按 SKILL.md 迁移一个 in_progress 存量任务）：
  1. 构造样例：`mkdir -p /tmp/migrate-plan-drill/.workloom/tasks/demo` 与 `/tmp/migrate-plan-drill/.workloom/tasks/archive/2026-01/demo-old`；demo 写旧格式 prd.md（H1 + 叙事式 Requirements 两条 + Acceptance 一条 + Notes）、design.md（CSV 导出决策一段）、implement.md（宽松阶段一条）、task.json（status in_progress、mode full、alignment.prdHash = 用 core dist `computePrdHash` 对原 prd 文本计算的 OLD_HASH）；archive/2026-01/demo-old 只写 design.md（扫描边界对照组）。
  2. 扫描逻辑核验：按 SKILL.md Step 1 口径人工枚举（planning/in_progress 且含 design.md 或 implement.md 且无 plan.md；archive 路径跳过），预期清单恰为 tasks/demo 一项、对照组不在内。
  3. 重写 prd.md：R1（支持导出报表）、R2（导出失败必须报错）、AC1（覆盖 R1、R2，验证方法为运行导出命令观察输出/报错），保留 Goal/Notes 语义，H1 下首行加注记 `> Migrated 2026-01-02 from the pre-R/AC prd format; semantics preserved item by item.`
  4. 凭据三态核验（computePrdHash 对比即 stale 机制本体）：态一 OLD_HASH 与原文 hash 相等（不 stale）；态二 OLD_HASH 与重写后 hash 不等（stale 成立）；态三 把 task.json 的 alignment.prdHash 更新为新 hash 后重新对比相等（模拟 action=confirm 重确认完成）。
  5. 写 plan.md：H1 下首行注记 `> Migrated 2026-01-02 from design.md + implement.md (pre-plan.md contract), rewritten to the prescriptive bar.`；`## Design decisions`（CSV 决策 + 理由）；`## Steps` 两步——步骤一为已完成步骤，标注 `[executed abc1234/2026-01-01 — tests green]`；步骤二为剩余步骤，含 Covers: AC1 / Target / Edit / Verify 四要素。
  6. 删除 demo 下 design.md 与 implement.md。
- Verify（逐项预期，输出摘录记入报告）:
  1. `ls /tmp/migrate-plan-drill/.workloom/tasks/demo` 恰为 task.json、prd.md、plan.md 三个文件。
  2. `grep -c "Migrated" …/demo/prd.md` 与 `…/demo/plan.md` 各输出 1。
  3. `grep -c "Covers" …/demo/plan.md` ≥ 1；`grep -c "\[executed" …/demo/plan.md` = 1。
  4. 凭据三态输出依次为：相等、不等、相等。
  5. `ls /tmp/migrate-plan-drill/.workloom/tasks/archive/2026-01/demo-old` 仍含 design.md（对照组未被触碰）。
  6. 演练结束 `rm -rf /tmp/migrate-plan-drill`，并确认仓库 `git status` 无演练泄漏文件。

#### 步骤 5.3 全量验证

- Covers: AC5
- Target: 无文件改动（验证步骤）
- Edit: 无
- Verify: 依次运行，预期全绿：
  1. `pnpm lint`（exit 0）
  2. `pnpm -r typecheck`（exit 0）
  3. `pnpm -r build`（exit 0；adapter-dsh dist 再生，pi 输出 `Synced 9 skill directories …`）
  4. `cd packages/core && node --test test/*.test.js`（全绿，core 零改动回归确认）
  5. `cd packages/adapter-dsh && node --test 'test/*.test.js'`（全绿）
  6. `cd packages/adapter-pi && bun test test/*.test.ts`（全绿）
  7. `cd packages/assets && pnpm run test`（全绿）
  8. `grep -c "workloom-migrate-plan" packages/adapter-dsh/dist/skills.js` 输出 ≥ 1（dist 同步）
  9. 类型复核以命令行为准（第 2 条已覆盖）；worktree 路径的 lsp_diagnostics 存在环境性误报，不作为判据（沿 C 任务修订 2 口径）。

#### 步骤 5.4 报告

- Covers: (internal)
- Target: 无文件改动（报告步骤）
- Edit: 无
- Verify: 报告按固定格式返回：改动文件清单（预期 7 个源文件：新建 workloom-migrate-plan/SKILL.md、workloom-continue/SKILL.md、dsh skills.ts、dsh plugin.ts、dsh skills.test.js、pi sync-skills.mjs、pi skills.test.ts，另 dsh dist 再生文件）、阶段 1/2 红证据（2 红 + 1 红与预期逐一对照）、阶段 4 绿证据、清扫结果、演练产物对照表、全量验证摘要、剩余风险。dist 与源码同 commit、push、repin 与重启由主会话在交付环节处理；执行器不 commit、不 push。
