# prd 格式规范与 R/AC 编号溯源链 — plan

按 test-first 红绿推进（两接缝：core 骨架面 / assets 契约面）。需求与验收以 [prd.md](prd.md) 的 R1–R6 / AC1–AC5 为准；实现前读 prd.md + implement.jsonl 列出的 spec 条目。全部改动与验证命令在任务代码根执行（task.json `worktree_path` 非空时即 worktree 根，注入纪律已指向）。改前片段均已对当前文件核对唯一命中；子串替换类编辑给出预期命中数，命中数不符即停止上报。

## Design decisions

1. **占位文本只承载短指引，细则放文本落点**：骨架占位文本是每个新任务 prd 的初始状态，塞长细则会膨胀骨架；占位只保留“编号 + 可判定 + 验证方法”提示，完整规则在 workflow 1.1（按需取用）、SKILL Recording 节（对齐时加载）、plan-authoring reference（authoring 时加载）。
2. **单一来源常量，判定逻辑零改动**：PRD_SECTIONS（task-gates.js）是占位文案唯一来源，骨架生成与占位判定共用；判定为“正文 trim 后与 placeholder 全等”，文案变更自动两侧同步（prd 已定第 4 条）。
3. **常量与 fixture 构成逐字同源链**：PRD_SECTIONS（task-gates.js）是占位文案唯一来源，4 个测试文件里有手写字面量副本（task-gates.test.js 的 SKELETON_PRD 刻意独立复制防同义反复）。全仓穷尽扫描（含 assets/spec/docs，无截断）确认分布：旧 R 文案 src 1 处 + 测试 8 处（task-gates 4：行 31/96/219/371，task-store 2，task-ops 1，doctor 1）；旧 AC 文案 src 1 处 + 测试 4 处（task-gates 3：行 35/100/375，task-store 1）。改文案必须全链同步。
4. **测试双消费模式决定红绿编排**：task-gates.test.js、task-store.test.js 直接 import src（红绿不经 build）；task-ops.test.js、doctor.test.js import dist（红在 build 前成立，绿需 build 后复验）。阶段 1 红证据一次性跑四个文件；阶段 2 先绿 src 侧、再 build 绿 dist 侧。
5. **规范文本四处落点与固定方式**：workflow 1.1 完整句 + planning 面包屑短括注（每轮注入必须短）、SKILL Recording 完整句、plan-authoring 的 Covers bullet + 完成判据句。contract-asset.test.js 新增两个测试：一个走 parseContract 固定 workflow 两处，一个直接读 SKILL/reference 文件固定关键句（与 A 任务同模式）。
6. **轻量任务口径不变**：light 门禁只查 H1 + Goal（task-mode 链），workflow-light.md 零改动；R/AC 格式只约束完整任务。
7. **AC5 由本文档自身承载**：本 plan.md 即单文档规定式形态的示范实例（每步含 Covers/Target/Edit/Verify 四要素），无对应实现步骤，步骤 Covers 不出现 AC5——review 维度二核对时以本条为据，不判“未覆盖”。

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

### 阶段 1（红，接缝①）：四个测试文件的占位字面量同步到新文案

本阶段定义两条新文案，为全计划唯一事实源（下称 NEW-R / NEW-AC）：

```text
NEW-R  = (placeholder: list the functional requirements as numbered items R1, R2, ...; each item is a single decidable statement)
NEW-AC = (placeholder: list the acceptance criteria as numbered items AC1, AC2, ...; each item carries its verification method and the R items it covers)
```

旧文案（子串替换的改前值，下称 OLD-R / OLD-AC）：

```text
OLD-R  = (placeholder: list the functional requirements)
OLD-AC = (placeholder: list the verifiable acceptance criteria)
```

替换规则统一为：对目标文件做 OLD 子串 → NEW 子串的全量替换，替换前后用 `grep -cF` 核对命中数；OLD 带右括号收尾，不是 NEW 的子串，替换后旧文案计数必为 0。步骤 1.2 的 `writeLightPrd` fixture 与步骤 1.3、1.4 的部分 fixture 在旧常量下本就不参与红断言，同步它们是为保持“fixture 模拟未填骨架”的语义与常量同源（绿→绿，不进红名单）。

#### 步骤 1.1 task-gates.test.js 字面量同步

- Covers: AC1, AC3
- Target: packages/core/test/task-gates.test.js —— SKELETON_PRD 常量（R、AC 两行）、「逐小节判定」fixture（R 行、带首尾各两空格的 AC 行）、「多问题一次返回且顺序固定」fixture（R 行）与 LIGHT_MIN_PRD 常量（R、AC 两行）
- Edit: OLD-R → NEW-R，预期命中 4 处；OLD-AC → NEW-AC，预期命中 3 处。注意两点：①「逐小节判定」fixture 的 AC 行带前导两空格与尾随两空格（该用例的 trim 判定点），子串替换只动括号内文案、必须保留行首尾空格原样；② LIGHT_MIN_PRD 的更新属语义同步（轻量 start 门禁只消费 H1 + Goal，该常量相关测试在红绿两阶段均保持绿，不进红名单）。
- Verify: `grep -cF "(placeholder: list the functional requirements)" packages/core/test/task-gates.test.js` 输出 0；`grep -cF "(placeholder: list the verifiable acceptance criteria)" packages/core/test/task-gates.test.js` 输出 0；`grep -cF "numbered items R1" packages/core/test/task-gates.test.js` 输出 4；`grep -cF "numbered items AC1" packages/core/test/task-gates.test.js` 输出 3；`grep -n "  (placeholder: list the acceptance criteria" packages/core/test/task-gates.test.js` 能看到带前导空格的那一行仍在。

#### 步骤 1.2 task-store.test.js 字面量同步

- Covers: AC1, AC3
- Target: packages/core/test/task-store.test.js —— writeLightPrd 函数 fixture（R、AC 各 1 处）与「start 门禁：缺小节与 placeholder 小节文案不同」测试 fixture（R 1 处）
- Edit: OLD-R → NEW-R，预期命中 2 处；OLD-AC → NEW-AC，预期命中 1 处。
- Verify: `grep -cF "(placeholder: list the functional requirements)" packages/core/test/task-store.test.js` 输出 0；`grep -cF "numbered items R1" packages/core/test/task-store.test.js` 输出 2；`grep -cF "numbered items AC1" packages/core/test/task-store.test.js` 输出 1。

#### 步骤 1.3 task-ops.test.js 字面量同步

- Covers: AC1, AC3
- Target: packages/core/test/task-ops.test.js —— 「align confirm：多个内容问题只抛一个 Error」测试的 broken fixture（R 1 处；该 fixture 的 AC 节为实填 `- ac`，无 OLD-AC）
- Edit: OLD-R → NEW-R，预期命中 1 处。
- Verify: `grep -cF "(placeholder: list the functional requirements)" packages/core/test/task-ops.test.js` 输出 0；`grep -cF "numbered items R1" packages/core/test/task-ops.test.js` 输出 1。

#### 步骤 1.4 doctor.test.js 字面量同步

- Covers: AC1, AC3
- Target: packages/core/test/doctor.test.js —— 「check doc-completeness：缺小节与 placeholder 小节分别生成独立 issue 与 hint」测试 fixture（R 1 处；另一测试的 Goal 占位与本任务无关，不动）
- Edit: OLD-R → NEW-R，预期命中 1 处。
- Verify: `grep -cF "(placeholder: list the functional requirements)" packages/core/test/doctor.test.js` 输出 0；`grep -cF "numbered items R1" packages/core/test/doctor.test.js` 输出 1。

#### 步骤 1.5 红验证（不 build）

- Covers: AC3
- Target: 无文件改动（验证步骤）
- Edit: 无
- Verify: `cd packages/core && node --test test/task-gates.test.js test/task-store.test.js test/task-ops.test.js test/doctor.test.js`（dist 未重建，src 常量仍旧文案）。
  预期失败名单（6 个，逐一对照记入报告）：
  1. task-gates.test.js「骨架 prd 四小节全部判定为未填」（新字面量不等于旧常量，R/AC 被判已填，deepEqual 失败）
  2. task-gates.test.js「逐小节判定：只有正文 trim 后与 placeholder 完全一致才算未填」
  3. task-gates.test.js「inspectPrdStructure：多问题一次返回且顺序固定（H1 → 骨架小节 → open nodes）」（期望清单含 Requirements placeholder 项，新字面量下该项消失，deepEqual 失败）
  4. task-store.test.js「start 门禁：缺小节与 placeholder 小节文案不同，且一次列出全部 prd 内容问题」（assert.match Requirements placeholder 失败）
  5. task-ops.test.js「align confirm：多个内容问题只抛一个 Error，消息按固定顺序聚合全部 blocker」（聚合清单 deepEqual 缺 Requirements placeholder 行）
  6. doctor.test.js「check doc-completeness：缺小节与 placeholder 小节分别生成独立 issue 与 hint」（placeholderIssue 不存在）
  预期保持绿（不是漏改）：task-gates 的 findMissingPrdTitle 两测试（只消费标题逻辑）、task-gates 的轻量 start 门禁系列（LIGHT_MIN_PRD 只触发 H1 + Goal 判定）、task-store 轻量任务系列（writeLightPrd 同理）、doctor「prd 缺 H1/占位符」测试（Goal 占位未变）、task-ops 的 Notes fixture 测试。
  失败集与预期不符（多红或少红）：停止，把实际失败清单写进报告阻塞项。

### 阶段 2（绿，接缝①）：PRD_SECTIONS 常量

#### 步骤 2.1 task-gates.js 常量与注释

- Covers: AC1
- Target: packages/core/src/domain/task-gates.js —— PRD_SECTIONS 常量（含 JSDoc 注释块）
- Edit 改前（唯一命中，已按当前文件逐字核对）：

```js
/**
 * prd.md 骨架：各小节标题与占位说明（顺序即文档顺序）。
 * task-store 生成骨架与本模块 placeholder 判定共用此常量。
 * @type {readonly import('./task-gates.d.ts').PrdSection[]}
 */
export const PRD_SECTIONS = Object.freeze([
  { heading: 'Goal', placeholder: '(placeholder: describe the goal this task aims to achieve)' },
  { heading: 'Requirements', placeholder: '(placeholder: list the functional requirements)' },
  {
    heading: 'Acceptance Criteria',
    placeholder: '(placeholder: list the verifiable acceptance criteria)',
  },
  { heading: 'Notes', placeholder: '(placeholder: add notes and constraints)' },
])
```

- Edit 改后（长字符串按 prettier printWidth 100 折行为多行属性形态）：

```js
/**
 * prd.md 骨架：各小节标题与占位说明（顺序即文档顺序）。
 * task-store 生成骨架与本模块 placeholder 判定共用此常量。
 * Requirements/Acceptance Criteria 的占位文本承载 R/AC 编号溯源格式指引；
 * 细则在契约 1.1、alignment 技能 Recording 节与 plan-authoring reference。
 * @type {readonly import('./task-gates.d.ts').PrdSection[]}
 */
export const PRD_SECTIONS = Object.freeze([
  { heading: 'Goal', placeholder: '(placeholder: describe the goal this task aims to achieve)' },
  {
    heading: 'Requirements',
    placeholder:
      '(placeholder: list the functional requirements as numbered items R1, R2, ...; each item is a single decidable statement)',
  },
  {
    heading: 'Acceptance Criteria',
    placeholder:
      '(placeholder: list the acceptance criteria as numbered items AC1, AC2, ...; each item carries its verification method and the R items it covers)',
  },
  { heading: 'Notes', placeholder: '(placeholder: add notes and constraints)' },
])
```

- Verify: `grep -c "numbered items R1" packages/core/src/domain/task-gates.js` 输出 1；`grep -c "numbered items AC1" packages/core/src/domain/task-gates.js` 输出 1。

#### 步骤 2.2 src 侧绿验证

- Covers: AC1, AC3
- Target: 无文件改动（验证步骤；task-gates/task-store 测试直接 import src，不经 build）
- Edit: 无
- Verify: `cd packages/core && node --test test/task-gates.test.js test/task-store.test.js`，预期全绿（阶段 1 红名单第 1、2、3 项转绿）。

#### 步骤 2.3 build + dist 侧绿验证

- Covers: AC1, AC3, AC4
- Target: packages/core/dist（build 产物，不手改）
- Edit: 无（构建步骤）
- Verify: `cd packages/core && pnpm run build` exit 0；`node --test test/task-ops.test.js test/doctor.test.js` 全绿（阶段 1 红名单第 4、5 项转绿）；`grep -c "numbered items R1" packages/core/dist/domain/task-gates.js` 输出 ≥ 1。

### 阶段 3（红，接缝②）：contract-asset.test.js 追加两个溯源文案测试

#### 步骤 3.1 文件末尾追加新测试

- Covers: AC2
- Target: packages/core/test/contract-asset.test.js —— 文件末尾（最后一个测试「契约 1.1 与 planning 面包屑：authoring 问题改单文档 plan.md 口径」之后）
- Edit 改前（文件末尾锚点，唯一命中）：

```js
  const crumb = contract.breadcrumbs.get('planning')
  assert.ok(crumb.includes('author plan.md'), 'planning 面包屑缺 author plan.md 指令')
  assert.ok(
    crumb.includes('prescriptive authoring bar'),
    'planning 面包屑缺规定式写作硬性要求引用',
  )
})
```

- Edit 改后（原块保留，其后追加两个测试；fileURLToPath/readFileSync/parseContract 均为文件既有导入，不新增 import）：

```js
  const crumb = contract.breadcrumbs.get('planning')
  assert.ok(crumb.includes('author plan.md'), 'planning 面包屑缺 author plan.md 指令')
  assert.ok(
    crumb.includes('prescriptive authoring bar'),
    'planning 面包屑缺规定式写作硬性要求引用',
  )
})

test('契约 1.1 与 planning 面包屑含 R/AC 编号溯源格式要求', () => {
  const [err, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  assert.equal(err, null)
  const alignBody = contract.steps.find((step) => step.id === '1.1').body
  assert.ok(alignBody.includes('Number Requirements as R1, R2, ...'), '1.1 缺 R 编号要求句')
  assert.ok(
    alignBody.includes('number Acceptance Criteria as AC1, AC2, ...'),
    '1.1 缺 AC 编号要求句',
  )
  assert.ok(alignBody.includes('its verification method'), '1.1 缺 AC 验证方法要求')
  assert.ok(alignBody.includes('trace coverage by number'), '1.1 缺编号溯源目的句')
  const crumb = contract.breadcrumbs.get('planning')
  assert.ok(crumb.includes('Requirements numbered R1, R2, ...'), 'planning 面包屑缺 R 编号短括注')
  assert.ok(
    crumb.includes('Acceptance Criteria numbered AC1, AC2, ...'),
    'planning 面包屑缺 AC 编号短括注',
  )
})

test('alignment 技能与 plan-authoring reference 含编号溯源文案（逐字固定）', () => {
  const skillPath = fileURLToPath(
    new URL('../../assets/skills/workloom-alignment/SKILL.md', import.meta.url),
  )
  const skill = readFileSync(skillPath, 'utf8')
  assert.ok(skill.includes('Number Requirements as R1, R2, ...'), 'Recording 节缺 R 编号要求')
  assert.ok(skill.includes('Acceptance Criteria as AC1, AC2, ...'), 'Recording 节缺 AC 编号要求')
  const planRefPath = fileURLToPath(
    new URL('../../assets/skills/workloom-alignment/references/plan-authoring.md', import.meta.url),
  )
  const planRef = readFileSync(planRefPath, 'utf8')
  assert.ok(planRef.includes('- **Covers** —'), 'plan-authoring 步骤模板缺 Covers bullet')
  assert.ok(planRef.includes('`(internal)`'), 'plan-authoring 缺内部步骤 Covers 约定')
  assert.ok(
    planRef.includes("every AC in prd.md appears in at least one step's Covers list"),
    'plan-authoring 完成判据缺 AC 覆盖要求',
  )
})
```

- Verify: `grep -c "R/AC 编号溯源" packages/core/test/contract-asset.test.js` 输出 ≥ 1（新测试已追加）。

#### 步骤 3.2 红验证

- Covers: AC2
- Target: 无文件改动（验证步骤；该测试直接读 assets 与 src，不经 dist）
- Edit: 无
- Verify: `cd packages/core && node --test test/contract-asset.test.js`，预期 39 个测试中恰好 2 红：「契约 1.1 与 planning 面包屑含 R/AC 编号溯源格式要求」「alignment 技能与 plan-authoring reference 含编号溯源文案（逐字固定）」（assets 尚未改），既有 37 个保持绿。失败集不符：停止上报。

### 阶段 4（绿，接缝②）：assets 四处文案

#### 步骤 4.1 workflow.md 1.1 正文句

- Covers: AC2
- Target: packages/assets/workflow/workflow.md —— 1.1 正文「Write settled conclusions」段
- Edit 子串替换（唯一命中）：改前 `Write settled conclusions into prd.md incrementally as you go. Keep a \`## Alignment Decisions\` section` 改后 `Write settled conclusions into prd.md incrementally as you go. Number Requirements as R1, R2, ... — each a single decidable statement, a vague verb always bound to an object and a decidable outcome — and number Acceptance Criteria as AC1, AC2, ... — each carrying its verification method (a runnable command, or an observable action plus expected result) and the R items it covers, so plan steps and later review/check can trace coverage by number. Keep a \`## Alignment Decisions\` section`
- Verify: `grep -c "trace coverage by number" packages/assets/workflow/workflow.md` 输出 1。

#### 步骤 4.2 workflow.md planning 面包屑短括注

- Covers: AC2
- Target: packages/assets/workflow/workflow.md —— [workflow-state:planning] 块
- Edit 子串替换（唯一命中）：改前 `write conclusions into prd.md as you go; do not finalize prd.md before alignment converges.` 改后 `write conclusions into prd.md as you go (Requirements numbered R1, R2, ...; Acceptance Criteria numbered AC1, AC2, ... each with its verification method); do not finalize prd.md before alignment converges.`
- Verify: `grep -c "Requirements numbered R1" packages/assets/workflow/workflow.md` 输出 1。

#### 步骤 4.3 alignment SKILL.md Recording 节

- Covers: AC2
- Target: packages/assets/skills/workloom-alignment/SKILL.md —— ## Recording 节首行
- Edit 子串替换（唯一命中）：改前 `Write every settled conclusion into the task's \`prd.md\` incrementally. Maintain a \`## Alignment Decisions\` section that records:` 改后 `Write every settled conclusion into the task's \`prd.md\` incrementally. Number Requirements as R1, R2, ... (each a single decidable statement) and Acceptance Criteria as AC1, AC2, ... (each with its verification method — a runnable command or an observable action plus expected result — and the R items it covers); the plan's steps later declare the AC numbers they cover, keeping the prd → plan → review → check chain traceable by number. Maintain a \`## Alignment Decisions\` section that records:`
- Verify: `grep -c "traceable by number" packages/assets/skills/workloom-alignment/SKILL.md` 输出 1。

#### 步骤 4.4 plan-authoring.md 步骤模板加 Covers bullet

- Covers: AC2
- Target: packages/assets/skills/workloom-alignment/references/plan-authoring.md —— ## Step template 节
- Edit 改前（唯一命中）：

```md
Each step carries, in this order:

- **Target** — repo-relative file path plus the symbol (function / class / constant) being changed; for a new file, its full path.
```

- Edit 改后：

```md
Each step carries, in this order:

- **Covers** — the prd Acceptance Criteria numbers this step delivers (for example `AC1, AC3`); a step serving only other steps writes `(internal)`.
- **Target** — repo-relative file path plus the symbol (function / class / constant) being changed; for a new file, its full path.
```

- Verify: `grep -c '\- \*\*Covers\*\*' packages/assets/skills/workloom-alignment/references/plan-authoring.md` 输出 1。

#### 步骤 4.5 plan-authoring.md 完成判据句

- Covers: AC2
- Target: packages/assets/skills/workloom-alignment/references/plan-authoring.md —— ## Completion criteria 节
- Edit 子串替换（唯一命中）：改前 `design decision of their own. A decision the executor would still have to make is a gap` 改后 `design decision of their own, and every AC in prd.md appears in at least one step's Covers list. A decision the executor would still have to make is a gap`
- Verify: `grep -c "Covers list" packages/assets/skills/workloom-alignment/references/plan-authoring.md` 输出 1。

#### 步骤 4.6 绿验证

- Covers: AC2
- Target: 无文件改动（验证步骤）
- Edit: 无
- Verify: `cd packages/core && node --test test/contract-asset.test.js`，预期 39 通过 / 0 失败（阶段 3 的 2 红转绿）。

### 阶段 5：清扫与全量验证

#### 步骤 5.1 旧文案清扫

- Covers: AC3, AC4
- Target: 无文件改动（清扫步骤）
- Edit: 无
- Verify: 三条命令预期均 0 命中（目标串以括号开头，用 -F 固定字符串模式）：
  1. `grep -rF "(placeholder: list the functional requirements)" packages --exclude-dir=node_modules --exclude-dir=dist`
  2. `grep -rF "(placeholder: list the verifiable acceptance criteria)" packages --exclude-dir=node_modules --exclude-dir=dist`
  3. `grep -rn "list the verifiable acceptance" packages --exclude-dir=node_modules --exclude-dir=dist`
  任何命中即漏改：回到阶段 1/2 修复后重扫。

#### 步骤 5.2 全量验证

- Covers: AC4
- Target: 无文件改动（验证步骤）
- Edit: 无
- Verify: 依次运行，预期全绿：
  1. `pnpm lint`（exit 0）
  2. `pnpm -r typecheck`（exit 0）
  3. `pnpm -r build`（exit 0；core dist 再生，adapter-pi sync-skills 重建）
  4. `cd packages/core && node --test test/*.test.js`（全绿）
  5. `cd packages/adapter-dsh && node --test 'test/*.test.js'`（全绿）
  6. `cd packages/adapter-pi && bun test test/*.test.ts`（全绿）
  7. `cd packages/assets && pnpm run test`（全绿）
  8. `grep -c "numbered items R1" packages/core/dist/domain/task-gates.js` 输出 ≥ 1（dist 同步）
  9. `grep -c '\*\*Covers\*\*' packages/adapter-pi/skills/workloom-alignment/references/plan-authoring.md` 输出 1（pi 同步产物含新 bullet）
  10. LSP 可用时对 packages/core/src/domain/task-gates.js 跑 lsp_diagnostics，预期无 Error

#### 步骤 5.3 报告

- Covers: (internal)
- Target: 无文件改动（报告步骤）
- Edit: 无
- Verify: 报告按固定格式返回：改动文件清单（预期 9 个源文件：4 个 core 测试 + task-gates.js + contract-asset.test.js + workflow.md + SKILL.md + plan-authoring.md，另 dist 再生文件）、阶段 1/3 红证据（实际失败名单与预期逐一对照）、阶段 2/4 绿证据、清扫结果、阶段 5 全量验证各命令输出摘要、剩余风险。dist 与源码同 commit 入库、push、profile repin 与实例重启由主会话在交付环节处理；执行器不 commit、不 push。
