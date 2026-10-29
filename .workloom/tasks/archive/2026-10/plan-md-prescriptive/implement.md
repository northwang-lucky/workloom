# 合并 design/implement 为 plan.md 并落地完全规定式写作标准 — implement

按 test-first 红绿推进（三接缝：core 注入面 / assets 契约面 / pi 角色面）。设计理由以 [design.md](design.md) 为准；实现前读本任务 prd.md + design.md + implement.jsonl 列出的 spec 条目。全部改动与验证命令在任务代码根执行（task.json `worktree_path` 非空时即 worktree 根，注入纪律已指向）。本文档中的文案为逐字唯一事实源：改前片段均已在当前文件中核对唯一命中，按块整体替换；禁止改写块内文案。

## 修订记录

- 修订 1（开工后，阶段 2.11 阻塞项处置，主会话裁决）：
  1. 步骤 1.4 第二块的改后断言由 `assert.ok(!text.includes('plan.md'))` 收窄为 `assert.ok(!text.includes('.workloom/tasks/08-24-demo/plan.md'))`。原因：INJECTION_PROTOCOL_DISCIPLINE 是四种 kind 共用纪律句，阶段 2 之后含 "(plan.md)" 字样并注入 research，裸子串缺席断言与共用句互斥（旧断言查 'design.md'，与纪律句中的 '(implement.md)' 不冲突，改名后冲突才暴露）。收窄到任务路径口径语义等价：research 不物化 plan 制品，注入中不会出现其任务路径；新旧 dist 下均成立，阶段 1 红集合不变。否决方案 B（截取 `## Executor contract` 之前再断言）：改变测试结构，改动面大于收益。
  2. 步骤 1.12 第 3 条的预期依据同步更新（见该步）。
  3. 步骤 7.1 白名单新增两条合法自引用：contract-asset.test.js 与 agents.test.ts 的新增清扫测试，其缺席断言与失败消息必须写出被禁字符串（design.md/implement.md 字面量），清扫输出中出现为预期。
- 修订 2（实现交付后主会话独立复核，白名单裁决；复核证据：worktree git status 22 文件与报告清单逐一吻合、五条门禁复跑 exit 0、pi 198/0、关键载荷抽查通过）：
  1. 步骤 7.1 白名单补录两条合法残留：`packages/core/test/task-gates.test.js:104` 的 `- see design.md`（prd fixture 模板 Notes 节示例文本，本任务之前已存在，与制品引用无关，不改动）；`packages/assets/skills/workloom-alignment/SKILL.md:11`（合法引用文件名 ui-design.md 含子串 design.md，属清扫 grep 模式固有误报，改动前后均命中）。
  2. dsh executor.test.js 三条 prompts 片段白名单行号同步为改动后实际值 1483/1517/1541（阶段 6.1 删除一行 fixture 后其后行号整体减一）。
  3. 备注：`docs/` 目录经主仓 `.git/info/exclude` 本地排除（研究文档不入库），worktree 基线不含 docs/，清扫对 docs 无输出属正确结果；白名单中 docs/research/zcode-plugin-support.md 条目仅在主仓工作区有意义。

## 阶段 0：基线确认

1. 运行：`pnpm lint && pnpm -r typecheck && pnpm -r build`，预期全绿（改动前基线）。
2. 运行：`cd packages/core && node --test test/executor-context.test.js test/contract-asset.test.js test/session-context.test.js`，预期全绿。
3. 运行：`cd packages/adapter-pi && bun test test/agents.test.ts`，预期全绿。
4. 运行：`cd packages/adapter-dsh && pnpm run test`，预期全绿。
5. 任一基线红：停止，把失败输出原样写进报告阻塞项。

## 阶段 1（红，接缝①）：packages/core/test/executor-context.test.js 改到目标文案

目标文件：`packages/core/test/executor-context.test.js`。本阶段只改测试，不改 src、不 build（测试 import `../dist/`，旧 dist 未变即红）。

### 步骤 1.1：S1 测试（'S1 jsonl 纯指针：…'）fixture 与期望统计

改前（唯一命中：末行 `const entries = [` 区别于 S5 同形片段）：

```js
    writeTaskFile(root, 'prd.md', '# PRD\n')
    writeTaskFile(root, 'design.md', '# Design\n')
    writeTaskFile(root, 'implement.md', '# Implement\n')
    const entries = [
```

改后：

```js
    writeTaskFile(root, 'prd.md', '# PRD\n')
    writeTaskFile(root, 'plan.md', '# Plan\n')
    const entries = [
```

改前（expected 统计块，唯一命中）：

```js
    const expected = {
      // implement：不内联任何 artifact（prd 走软指针），指针 = prd 软指针 + design + implement + jsonl×2
      implement: { filesInlined: 0, filesPointed: 5, truncated: 0 },
      // check：内联 prd 块，指针 = design + implement + jsonl×2
      check: { filesInlined: 1, filesPointed: 4, truncated: 0 },
    }
```

改后：

```js
    const expected = {
      // implement：不内联任何 artifact（prd 走软指针），指针 = prd 软指针 + plan + jsonl×2
      implement: { filesInlined: 0, filesPointed: 4, truncated: 0 },
      // check：内联 prd 块，指针 = plan + jsonl×2
      check: { filesInlined: 1, filesPointed: 3, truncated: 0 },
    }
```

改前（指针行断言，唯一命中）：

```js
      // 指针清单段带标题（前两行固定为 design/implement 纯指针行，后接 jsonl 条目）
      assert.ok(text.includes(POINTER_LIST_HEADING))
      assert.ok(text.includes('- .workloom/tasks/08-24-demo/design.md\n'))
      assert.ok(text.includes('- .workloom/tasks/08-24-demo/implement.md\n'))
```

改后：

```js
      // 指针清单段带标题（首行固定为 plan.md 纯指针行，后接 jsonl 条目）
      assert.ok(text.includes(POINTER_LIST_HEADING))
      assert.ok(text.includes('- .workloom/tasks/08-24-demo/plan.md\n'))
```

### 步骤 1.2：S2 测试标题与 fixture

改前（测试标题行，唯一命中）：

```js
test('S2 artifacts 提取：check/research 物化 prd 全文节块；design/implement 仅纯指针行（无 H2 目录预览）；implement 软指针不进 prd 全文', () => {
```

改后：

```js
test('S2 artifacts 提取：check/research 物化 prd 全文节块；plan.md 仅纯指针行（无 H2 目录预览）；implement 软指针不进 prd 全文', () => {
```

改前（S2 的 design.md 多行 fixture + implement.md 行，唯一命中）：

```js
    writeTaskFile(
      root,
      'design.md',
      [
        '# Design',
        '',
        '## 1. 决策一',
        '设计正文 DESIGN_BODY_MARKER',
        '',
        '## 2. 决策二',
        '设计正文二 BODY2_MARKER',
        '',
      ].join('\n'),
    )
    writeTaskFile(root, 'implement.md', '# Implement\n')
```

改后：

```js
    writeTaskFile(
      root,
      'plan.md',
      [
        '# Plan',
        '',
        '## 1. 决策一',
        '设计正文 DESIGN_BODY_MARKER',
        '',
        '## 2. 决策二',
        '设计正文二 BODY2_MARKER',
        '',
      ].join('\n'),
    )
```

改前（S2 内两行注释，各自唯一命中）：

```js
    // design/implement：纯指针行，无 H2 目录预览、无正文、无目录尾注指针
```

改后：

```js
    // plan.md：纯指针行，无 H2 目录预览、无正文、无目录尾注指针
```

改前：

```js
    // implement：prd 不再全文内联（软指针独立一行），design/implement 同为纯指针行
```

改后：

```js
    // implement：prd 不再全文内联（软指针独立一行），plan.md 同为纯指针行
```

### 步骤 1.3：预算测试（'jsonl 纯指针：指针行不受文件/总量预算影响…'）

改前（唯一命中：`'# D\n'` 仅此一处）：

```js
    writeTaskFile(root, 'prd.md', '# PRD\n')
    writeTaskFile(root, 'design.md', '# D\n')
    writeTaskFile(root, 'implement.md', '# I\n')
```

改后：

```js
    writeTaskFile(root, 'prd.md', '# PRD\n')
    writeTaskFile(root, 'plan.md', '# P\n')
```

改前（唯一命中：filesPointed: 5 且注释含“共 5 条”）：

```js
    // 指针行不受预算影响：prd 软指针 + design + implement + jsonl×2 共 5 条
    assert.deepEqual(result.stats, { filesInlined: 0, filesPointed: 5, truncated: 0 })
```

改后：

```js
    // 指针行不受预算影响：prd 软指针 + plan + jsonl×2 共 4 条
    assert.deepEqual(result.stats, { filesInlined: 0, filesPointed: 4, truncated: 0 })
```

### 步骤 1.4：research-only 测试（'research 只内联 prd，无 jsonl 引用行'）

改前（唯一命中）：

```js
    // 不建 design/implement 与 jsonl，验证 research 不读 jsonl、缺失 artifact 跳过
```

改后：

```js
    // 不建 plan.md 与 jsonl，验证 research 不读 jsonl、缺失 artifact 跳过
```

改前（唯一命中：紧随 `--- .workloom/tasks/08-24-demo/prd.md ---` 断言之后）：

```js
    assert.ok(!text.includes('design.md'))
```

改后（修订 1：收窄为任务路径口径，避免与共用纪律句中的 "(plan.md)" 字样互斥）：

```js
    assert.ok(!text.includes('.workloom/tasks/08-24-demo/plan.md'))
```

### 步骤 1.5：纪律句常量区（INJECTION_PROTOCOL_DISCIPLINE 改口径 + 新增 PRESCRIPTIVE 常量与新测试）

改前（常量定义，唯一命中）：

```js
const INJECTION_PROTOCOL_DISCIPLINE =
  'Load in layers: read the plan artifact (implement.md) before acting; consult every other pointer only when the current step needs it, in targeted ranges; never bulk-read the whole list upfront. ' +
  'Echo the injection marker token in the first line of your report as proof the protocol was read.'
```

改后：

```js
const INJECTION_PROTOCOL_DISCIPLINE =
  'Load in layers: read the plan artifact (plan.md) before acting; consult every other pointer only when the current step needs it, in targeted ranges; never bulk-read the whole list upfront. ' +
  'Echo the injection marker token in the first line of your report as proof the protocol was read.'
```

改前（插入锚点：RESEARCH_WRITE_SCOPE_DISCIPLINE 常量块与其后测试之间，唯一命中）：

```js
/** research 写/编辑路径限制告知句（research 纪律段专属，逐字，机制强制前置告知）。 */
const RESEARCH_WRITE_SCOPE_DISCIPLINE =
  'Your write/edit reach is confined to the .workloom/ directory: paths ' + 'outside it are denied.'

test('implement/check 纪律段各含批处理与工具输出紧凑两句纪律（逐字），research/frontend 不含', () => {
```

改后（在常量块与测试之间插入新常量与新测试）：

```js
/** research 写/编辑路径限制告知句（research 纪律段专属，逐字，机制强制前置告知）。 */
const RESEARCH_WRITE_SCOPE_DISCIPLINE =
  'Your write/edit reach is confined to the .workloom/ directory: paths ' + 'outside it are denied.'

/** 规定式计划执行纪律句（implement/frontend 纪律段共用，与实现逐字同源）。 */
const PRESCRIPTIVE_PLAN_DISCIPLINE =
  'The plan is prescriptive: follow its file, symbol, and snippet anchors and its code blocks exactly. ' +
  'When reality diverges from an anchor, stop and report the divergence as a blocking item; never improvise.'

test('implement/frontend 纪律段各含规定式计划执行句（逐字），research/check 不含', () => {
  const root = makeProject()
  try {
    writeTaskFile(root, 'prd.md', '# PRD\n')
    for (const kind of ['implement', 'frontend']) {
      const [err, result] = buildExecutorPrompt(baseParams(root, kind))
      assert.equal(err, null)
      const contractAt = result.text.indexOf('## Executor contract')
      const section = result.text.slice(contractAt)
      assert.ok(
        section.includes(PRESCRIPTIVE_PLAN_DISCIPLINE),
        `${kind} discipline must carry the prescriptive-plan sentence verbatim`,
      )
    }
    for (const kind of ['research', 'check']) {
      const [err, result] = buildExecutorPrompt(baseParams(root, kind))
      assert.equal(err, null)
      const contractAt = result.text.indexOf('## Executor contract')
      const section = result.text.slice(contractAt)
      assert.ok(
        !section.includes(PRESCRIPTIVE_PLAN_DISCIPLINE),
        `${kind} discipline must not carry the prescriptive-plan sentence`,
      )
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('implement/check 纪律段各含批处理与工具输出紧凑两句纪律（逐字），research/frontend 不含', () => {
```

### 步骤 1.6：S5 测试 fixture

改前（唯一命中：末行 implement.jsonl 区别于 S1 同形片段）：

```js
    writeTaskFile(root, 'prd.md', '# PRD\n')
    writeTaskFile(root, 'design.md', '# Design\n')
    writeTaskFile(root, 'implement.md', '# Implement\n')
    writeTaskFile(root, 'implement.jsonl', '{"file": "packages/a.js", "reason": "spec"}\n')
```

改后：

```js
    writeTaskFile(root, 'prd.md', '# PRD\n')
    writeTaskFile(root, 'plan.md', '# Plan\n')
    writeTaskFile(root, 'implement.jsonl', '{"file": "packages/a.js", "reason": "spec"}\n')
```

### 步骤 1.7：writeFullFixture 函数

改前（唯一命中）：

```js
  writeTaskFile(root, 'design.md', ['# Design', '', '## 决策', 'DESIGN_BODY_MARKER'].join('\n'))
  writeTaskFile(root, 'implement.md', ['# Implement', '', '## 步骤', 'IMPL_BODY_MARKER'].join('\n'))
```

改后：

```js
  writeTaskFile(
    root,
    'plan.md',
    ['# Plan', '', '## 决策', 'DESIGN_BODY_MARKER', '', '## 步骤', 'IMPL_BODY_MARKER'].join('\n'),
  )
```

### 步骤 1.8：段落白名单测试（'段落白名单与顺序：…'）指针清单断言

改前（唯一命中）：

```js
        // Pointer list：前两行固定 design.md / implement.md 纯指针行，后接 jsonl 条目
        assert.ok(pointerAt !== -1 && pointerAt > prdBlockAt && pointerAt < materialsAt, kind)
        const pointerBlock = text.slice(pointerAt, materialsAt)
        const lines = pointerBlock.split('\n').filter((line) => line.startsWith('- '))
        assert.deepEqual(
          lines.slice(0, 3),
          [
            '- .workloom/tasks/08-24-demo/design.md',
            '- .workloom/tasks/08-24-demo/implement.md',
            '- packages/a.js (spec)',
          ],
          `${kind} pointer list must lead with design/implement then jsonl entries`,
        )
```

改后：

```js
        // Pointer list：首行固定 plan.md 纯指针行，后接 jsonl 条目
        assert.ok(pointerAt !== -1 && pointerAt > prdBlockAt && pointerAt < materialsAt, kind)
        const pointerBlock = text.slice(pointerAt, materialsAt)
        const lines = pointerBlock.split('\n').filter((line) => line.startsWith('- '))
        assert.deepEqual(
          lines.slice(0, 2),
          ['- .workloom/tasks/08-24-demo/plan.md', '- packages/a.js (spec)'],
          `${kind} pointer list must lead with plan.md then jsonl entries`,
        )
```

改前（同测试内注释，唯一命中）：

```js
      // H2 目录预览全灭：design/implement 正文与标题均不进注入
```

改后：

```js
      // H2 目录预览全灭：plan.md 正文与标题均不进注入
```

### 步骤 1.9：软指针缺失保护测试（'prd 软指针行缺失保护：…'）

改前（唯一命中：末行 for 循环区别于其他同形 fixture）：

```js
    writeTaskFile(root, 'design.md', '# Design\n')
    writeTaskFile(root, 'implement.md', '# Implement\n')
    for (const kind of ['implement', 'frontend']) {
```

改后：

```js
    writeTaskFile(root, 'plan.md', '# Plan\n')
    for (const kind of ['implement', 'frontend']) {
```

改前（唯一命中：与上一改动同测试内，前一行是 soft pointer 断言）：

```js
      assert.ok(!result.text.includes('consult .workloom/'), `${kind} must omit the soft pointer`)
      assert.deepEqual(result.stats, { filesInlined: 0, filesPointed: 2, truncated: 0 })
```

改后：

```js
      assert.ok(!result.text.includes('consult .workloom/'), `${kind} must omit the soft pointer`)
      assert.deepEqual(result.stats, { filesInlined: 0, filesPointed: 1, truncated: 0 })
```

### 步骤 1.10：分层协议句测试（'分层加载协议句：…'）

改前（唯一命中）：

```js
        section.includes('read the plan artifact (implement.md) before acting'),
```

改后：

```js
        section.includes('read the plan artifact (plan.md) before acting'),
```

### 步骤 1.11：词数预算测试（'implement 版 contract 段词数 ≤ 260…'）

改前（标题行，唯一命中）：

```js
test('implement 版 contract 段词数 ≤ 260（定稿压缩，空白分隔的英文词元口径）', () => {
```

改后：

```js
test('implement 版 contract 段词数 ≤ 300（定稿压缩 + 规定式执行句 33 词，空白分隔的英文词元口径）', () => {
```

改前（断言块，唯一命中）：

```js
    assert.ok(
      words.length <= 260,
      `implement contract section is ${words.length} words, must be <= 260`,
    )
```

改后：

```js
    assert.ok(
      words.length <= 300,
      `implement contract section is ${words.length} words, must be <= 300`,
    )
```

### 步骤 1.12：红验证

1. 运行：`cd packages/core && node --test test/executor-context.test.js`（不 build，dist 仍为旧文案）。
2. 预期失败（红证据，记入报告）：`S1 jsonl 纯指针…`、`jsonl 纯指针：指针行不受文件/总量预算影响…`、`implement/frontend 纪律段各含规定式计划执行句…`、`S5 护栏…`、`段落白名单与顺序…`、`prd 软指针行缺失保护…`、`分层加载协议句…` 共 7 个测试红。
3. 预期保持绿（属正常，不是漏改）：`S2 artifacts 提取…` 与 `research 只内联 prd…`（两测试对 artifact 只有缺席断言；research-only 的路径口径断言在新旧 dist 下均成立，见修订记录 1）；`implement 版 contract 段词数 ≤ 300`（旧纪律段 260 词 ≤ 300）。
4. 失败集与预期不符（多红或少红）：停止，把实际失败清单写进报告阻塞项。

## 阶段 2（绿，接缝①）：core 源码改到目标文案

### 步骤 2.1：packages/core/src/domain/executor-context.js —— 头注释两处

改前（唯一命中）：

```js
 *   marker → （check/research：prd 全文节块）→ Pointer list（research 无；前两行为
 *   design/implement 纯指针行，后接 jsonl 条目）→ Research materials → （implement/
```

改后：

```js
 *   marker → （check/research：prd 全文节块）→ Pointer list（research 无；首行为
 *   plan.md 纯指针行，后接 jsonl 条目）→ Research materials → （implement/
```

改前（唯一命中）：

```js
 * - 指针化（体积压到指针级）：jsonl 条目、research/*.md、design/implement 均只给
```

改后：

```js
 * - 指针化（体积压到指针级）：jsonl 条目、research/*.md、plan.md 均只给
```

### 步骤 2.2：executor-context.js —— ARTIFACT_POINTER_FILES 常量

改前（唯一命中）：

```js
/** Pointer list 前两行的 artifact 指针文件名（按顺序；文件缺失不出行）。 */
const ARTIFACT_POINTER_FILES = Object.freeze(['design.md', 'implement.md'])
```

改后：

```js
/** Pointer list 首部的 artifact 指针文件名（按顺序；文件缺失不出行）。 */
const ARTIFACT_POINTER_FILES = Object.freeze(['plan.md'])
```

### 步骤 2.3：executor-context.js —— JSONL_FILES 内注释

改前（唯一命中）：

```js
  // frontend 上下文同 implement：design/implement 指针 + implement.jsonl。
```

改后：

```js
  // frontend 上下文同 implement：plan.md 指针 + implement.jsonl。
```

### 步骤 2.4：executor-context.js —— INJECTION_PROTOCOL_DISCIPLINE 常量

改前（唯一命中）：

```js
const INJECTION_PROTOCOL_DISCIPLINE =
  'Load in layers: read the plan artifact (implement.md) before acting; consult every other pointer ' +
```

改后：

```js
const INJECTION_PROTOCOL_DISCIPLINE =
  'Load in layers: read the plan artifact (plan.md) before acting; consult every other pointer ' +
```

### 步骤 2.5：executor-context.js —— 新增 PRESCRIPTIVE_PLAN_DISCIPLINE 常量

改前（插入锚点：协议句常量结尾与无用户通道常量注释之间，唯一命中）：

```js
  'Echo the injection marker token in the first line of your report as proof the protocol was read.'

/**
 * 无用户通道纪律句（终极权威段共用部分，全 kind 生效，命令式、无弱化词）：
```

改后（在两行之间插入新常量，注释说明设计意图）：

```js
  'Echo the injection marker token in the first line of your report as proof the protocol was read.'

/**
 * 规定式计划执行纪律句（implement/frontend 纪律段共用，命令式、无弱化词）：
 * 计划是指令性的——严格按其文件/符号/片段锚点与代码块执行；现实与锚点不符
 * （锚点落空、上下文不成立）时禁止即兴发挥，停下并把偏差作为阻塞项写进最终
 * 报告（主会话按契约 2.1 处置句成批交用户决断）。
 */
const PRESCRIPTIVE_PLAN_DISCIPLINE =
  'The plan is prescriptive: follow its file, symbol, and snippet anchors and its code blocks exactly. ' +
  'When reality diverges from an anchor, stop and report the divergence as a blocking item; never improvise.'

/**
 * 无用户通道纪律句（终极权威段共用部分，全 kind 生效，命令式、无弱化词）：
```

### 步骤 2.6：executor-context.js —— implement 纪律段

改前（唯一命中）：

```js
  [EXECUTOR_KINDS.implement]: `Implement the plan step by step, following the task artifacts (prd/design/implement) in order.
Make the smallest change that satisfies the requirement; do not touch unrelated code.
```

改后：

```js
  [EXECUTOR_KINDS.implement]: `Implement the plan step by step, following the task artifacts (prd/plan) in order.
${PRESCRIPTIVE_PLAN_DISCIPLINE}
Make the smallest change that satisfies the requirement; do not touch unrelated code.
```

### 步骤 2.7：executor-context.js —— frontend 纪律段

改前（唯一命中）：

```js
  [EXECUTOR_KINDS.frontend]: `Follow the PRD's '## UI Design' section as the baseline and deliver all seven UI axes it asks for.
Touch frontend files only; verify with the project's frontend checks (lint / typecheck / build / relevant tests).
```

改后：

```js
  [EXECUTOR_KINDS.frontend]: `Follow the PRD's '## UI Design' section as the baseline and deliver all seven UI axes it asks for.
${PRESCRIPTIVE_PLAN_DISCIPLINE}
Touch frontend files only; verify with the project's frontend checks (lint / typecheck / build / relevant tests).
```

### 步骤 2.8：executor-context.js —— buildInternal 内 Pointer list 注释

改前（唯一命中）：

```js
  // Pointer list（research 无此段）：前两行固定 design/implement 纯指针行（文件
  // 缺失不出行），后接当前 kind 的 jsonl 条目指针行；文件不存在不指向空。
```

改后：

```js
  // Pointer list（research 无此段）：首行固定 plan.md 纯指针行（文件缺失
  // 不出行），后接当前 kind 的 jsonl 条目指针行；文件不存在不指向空。
```

### 步骤 2.9：packages/core/src/domain/executor-context.d.ts —— stats 注释

在文件中把唯一命中的子串 `指针引用条数（design/implement 纯指针行` 替换为 `指针引用条数（plan.md 纯指针行`（该行其余字符与缩进不动）。

### 步骤 2.10：packages/core/src/service/session-context.ts —— EXECUTOR_NORMS 纪律行

改前（唯一命中）：

```ts
  '- Implement strictly per the task artifacts (prd/design/implement) and the files referenced by the task jsonl.',
```

改后：

```ts
  '- Implement strictly per the task artifacts (prd/plan) and the files referenced by the task jsonl.',
```

### 步骤 2.11：绿验证

1. 运行：`cd packages/core && pnpm run build`（tsc + copy-domain-dts，dist 再生），预期退出码 0。
2. 运行：`cd packages/core && node --test test/executor-context.test.js test/session-context.test.js`，预期全绿（阶段 1 的 7 个红测试转绿；词数测试实测 293 ≤ 300）。
3. 此时 `node --test test/contract-asset.test.js` 仍全绿（assets 与该测试常量都还是旧口径，一致）——阶段 3 才把它改红。

## 阶段 3（红，接缝②）：packages/core/test/contract-asset.test.js 改到目标文案

目标文件：`packages/core/test/contract-asset.test.js`。该测试直接读 assets 文件与 core src，不经 dist，无需 build。

### 步骤 3.1：INJECTION_PROTOCOL_DISCIPLINE 常量改口径

改前（唯一命中）：

```js
const INJECTION_PROTOCOL_DISCIPLINE =
  'Load in layers: read the plan artifact (implement.md) before acting; consult every other pointer only when the current step needs it, in targeted ranges; never bulk-read the whole list upfront. ' +
  'Echo the injection marker token in the first line of your report as proof the protocol was read.'
```

改后：

```js
const INJECTION_PROTOCOL_DISCIPLINE =
  'Load in layers: read the plan artifact (plan.md) before acting; consult every other pointer only when the current step needs it, in targeted ranges; never bulk-read the whole list upfront. ' +
  'Echo the injection marker token in the first line of your report as proof the protocol was read.'
```

### 步骤 3.2：norms Dispatch「不复述」句 pin 改口径

改前（唯一命中）：

```js
      'Dispatch and continuation prompts must not restate the context the subagent already holds (spec, research, prd/design/implement, and the session history); send only the new work for this round',
```

改后：

```js
      'Dispatch and continuation prompts must not restate the context the subagent already holds (spec, research, prd/plan, and the session history); send only the new work for this round',
```

### 步骤 3.3：文件末尾追加三个新测试

改前（文件末尾锚点，唯一命中）：

```js
  // 派发硬约束本身仍在（full 轨零变化）。
  assert.ok(
    contract.norms.includes('Hard constraint (stage `implement`)'),
    '完整任务的派发硬约束不得删除',
  )
})
```

改后（原块保留，其后追加）：

```js
  // 派发硬约束本身仍在（full 轨零变化）。
  assert.ok(
    contract.norms.includes('Hard constraint (stage `implement`)'),
    '完整任务的派发硬约束不得删除',
  )
})

test('契约 plan.md 口径：制品引用合并为 plan.md，无 design.md/implement.md 残留', () => {
  const raw = readFileSync(assetPath, 'utf8')
  const [err, contract] = parseContract(raw)
  assert.equal(err, null)
  // 加载协议句与 executor-context 同源（plan.md 口径，norms 段逐字）
  assert.ok(contract.norms.includes('read the plan artifact (plan.md) before acting'))
  // 制品引用统一为 plan.md；旧文件名全文不再出现（implement.jsonl 不含 implement.md 子串，不受影响）
  assert.ok(!raw.includes('design.md'), '契约不得再引用 design.md')
  assert.ok(!raw.includes('implement.md'), '契约不得再引用 implement.md')
  assert.ok(raw.includes('plan.md'), '契约必须引用 plan.md')
})

test('契约 1.4 含 plan.md 规定式写作硬性要求段（Authoring bar 关键句逐字）', () => {
  const [err, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  assert.equal(err, null)
  const reviewBody = contract.steps.find((step) => step.id === '1.4').body
  assert.ok(reviewBody.includes('Authoring bar for plan.md'), '1.4 缺 Authoring bar 段首句')
  assert.ok(
    reviewBody.includes('every step names its target file path and symbol'),
    '1.4 Authoring bar 缺文件 + 符号锚点要求',
  )
  assert.ok(
    reviewBody.includes('every edit carries the exact before/after code'),
    '1.4 Authoring bar 缺精确前后代码要求',
  )
  assert.ok(
    reviewBody.includes('every step ends with its verification command and expected result'),
    '1.4 Authoring bar 缺每步验证命令要求',
  )
  assert.ok(
    reviewBody.includes('references/plan-authoring.md'),
    '1.4 Authoring bar 缺 plan-authoring reference 指针',
  )
})

test('契约 1.1 与 planning 面包屑：authoring 问题改单文档 plan.md 口径', () => {
  const [err, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  assert.equal(err, null)
  const alignBody = contract.steps.find((step) => step.id === '1.1').body
  assert.ok(alignBody.includes('plan.md authoring question'), '1.1 缺 plan.md authoring question 口径')
  assert.ok(
    alignBody.includes('A. author the plan / B. author neither'),
    '1.1 缺单文档选项文案',
  )
  assert.ok(!alignBody.includes('author both'), '1.1 不得保留双文档 author both 文案')
  const crumb = contract.breadcrumbs.get('planning')
  assert.ok(crumb.includes('author plan.md'), 'planning 面包屑缺 author plan.md 指令')
  assert.ok(
    crumb.includes('prescriptive authoring bar'),
    'planning 面包屑缺规定式写作硬性要求引用',
  )
})
```

### 步骤 3.4：红验证

1. 运行：`cd packages/core && node --test test/contract-asset.test.js`。
2. 预期失败（红证据，记入报告）共 5 个：`契约 v19 含分层加载协议句与 marker 回声要求…`（常量已改 plan.md，assets 仍旧口径）、`契约 v17 norms Dispatch 段含后台默认说明与「不复述」句…`（同理）、以及步骤 3.3 新增的 3 个测试。
3. 其余既有测试保持绿。失败集与预期不符：停止，把实际失败清单写进报告阻塞项。

## 阶段 4（绿，接缝②）：assets 六个文件改到目标文案 + 新建 plan-authoring reference

### 步骤 4.1：packages/assets/workflow/workflow.md —— 1.1 收敛顺序句（authoring 问题单文档口径）

改前（唯一命中，1.1 正文内）：

```md
2) for implementation work, fold the design/implement authoring question into the final alignment round as a plain numbered question (A. author both / B. author neither, with a recommendation and its reasoning), 3) finalize prd.md,
```

改后：

```md
2) for implementation work, fold the plan.md authoring question into the final alignment round as a plain numbered question (A. author the plan / B. author neither, with a recommendation and its reasoning), 3) finalize prd.md,
```

### 步骤 4.2：workflow.md —— 1.4 首段（审阅包制品名）

改前（唯一命中，1.4 正文首段后半）：

```md
the jsonl context lists, and design.md/implement.md when the final alignment round chose to author them. Present the package in one message — prd snapshot with its hash, the design/implement documents when present, and the context lists.
```

改后：

```md
the jsonl context lists, and plan.md when the final alignment round chose to author it. Present the package in one message — prd snapshot with its hash, the plan document when present, and the context lists.
```

### 步骤 4.3：workflow.md —— 1.4 插入 Authoring bar 段

在 1.4 正文中，以 `Run the scale self-check while assembling the package:` 开头的段落之前，插入以下独立新段（前后各留一个空行；此句是全文件唯一命中锚点）：

```md
Authoring bar for plan.md (applies whenever the plan is authored or revised): every step names its target file path and symbol; every edit carries the exact before/after code, with the before snippet locating uniquely in the file and line numbers only as aids; every new file carries its full content; every step ends with its verification command and expected result; a directive without an anchor ("optimize", "adjust accordingly") is a defect. The full standard and the plan.md document shape live in the workloom-alignment skill's references/plan-authoring.md — read it before authoring.
```

### 步骤 4.4：workflow.md —— 1.4 规模自检句

改前（唯一命中）：

```md
Run the scale self-check while assembling the package: judge precisely by the actual number of phases in prd.md/design.md/implement.md.
```

改后：

```md
Run the scale self-check while assembling the package: judge precisely by the actual number of phases in prd.md/plan.md.
```

### 步骤 4.5：workflow.md —— 1.4 分段审阅例外句

改前（唯一命中）：

```md
and review design.md/implement.md in a second pass before start.
```

改后：

```md
and review plan.md in a second pass before start.
```

### 步骤 4.6：workflow.md —— 2.1 派发注入句

改前（唯一命中，2.1 正文；norms 中同形短语由步骤 4.9 单独处理）：

```md
the dispatcher injects context (spec, research, prd/design/implement).
```

改后：

```md
the dispatcher injects context (spec, research, prd/plan).
```

### 步骤 4.7：workflow.md —— 2.2 审查对象句

改前（唯一命中）：

```md
and the task artifacts (prd/design/implement), checking structure, naming, types, and potential bugs item by item
```

改后：

```md
and the task artifacts (prd/plan), checking structure, naming, types, and potential bugs item by item
```

### 步骤 4.8：workflow.md —— planning 面包屑两处

改前（唯一命中，面包屑内）：

```md
For implementation work, fold the design/implement authoring question into the final alignment round.
```

改后：

```md
For implementation work, fold the plan.md authoring question into the final alignment round.
```

改前（唯一命中）：

```md
Then follow Phase 1: optional research → configure context → author design/implement when the final round chose to.
```

改后：

```md
Then follow Phase 1: optional research → configure context → author plan.md when the final round chose to, meeting the prescriptive authoring bar in 1.4 (every step anchored to a concrete file, symbol, and exact code change; read the alignment skill's plan-authoring reference first).
```

### 步骤 4.9：workflow.md —— norms Dispatch「不复述」行

改前（唯一命中，norms 块内，与步骤 4.6 的 2.1 句不同行）：

```md
- Dispatch and continuation prompts must not restate the context the subagent already holds (spec, research, prd/design/implement, and the session history); send only the new work for this round, and use `reinject` only when compaction lost context.
```

改后：

```md
- Dispatch and continuation prompts must not restate the context the subagent already holds (spec, research, prd/plan, and the session history); send only the new work for this round, and use `reinject` only when compaction lost context.
```

### 步骤 4.10：workflow.md —— norms Loading protocol 行

改前（唯一命中；本句与 executor-context.js 的 INJECTION_PROTOCOL_DISCIPLINE 逐字同源，阶段 2 已同步）：

```md
- Loading protocol: Load in layers: read the plan artifact (implement.md) before acting; consult every other pointer only when the current step needs it, in targeted ranges; never bulk-read the whole list upfront. Echo the injection marker token in the first line of your report as proof the protocol was read.
```

改后：

```md
- Loading protocol: Load in layers: read the plan artifact (plan.md) before acting; consult every other pointer only when the current step needs it, in targeted ranges; never bulk-read the whole list upfront. Echo the injection marker token in the first line of your report as proof the protocol was read.
```

### 步骤 4.11：packages/assets/skills/workloom-alignment/SKILL.md —— reference 按需读取句

改前（唯一命中）：

```md
This skill is the workloom-owned orchestration. Read `references/ui-design.md` only when the UI node applies and `references/test-first.md` only when the test-first node applies; keep the body lean and disclose branch knowledge on demand.
```

改后：

```md
This skill is the workloom-owned orchestration. Read `references/ui-design.md` only when the UI node applies, `references/test-first.md` only when the test-first node applies, and `references/plan-authoring.md` before authoring plan.md; keep the body lean and disclose branch knowledge on demand.
```

### 步骤 4.12：SKILL.md —— authoring 问题句（单文档口径 + 动笔前必读挂钩）

改前（唯一命中）：

```md
For implementation work, the final round also carries the design/implement authoring question as a plain numbered question (A. author both / B. author neither, with a recommendation and its reasoning), so 1.4 needs no separate question round.
```

改后：

```md
For implementation work, the final round also carries the plan.md authoring question as a plain numbered question (A. author the plan / B. author neither, with a recommendation and its reasoning), so 1.4 needs no separate question round. When the answer is author, read `references/plan-authoring.md` before writing: the plan meets the prescriptive bar — every step anchored to a concrete file, symbol, and exact code change — before 1.4 presents it.
```

### 步骤 4.13：SKILL.md —— 收敛协议第 5 条（审阅包制品名）

改前（唯一命中）：

```md
the one and only user confirmation happens at 1.4 over the full review package (prd snapshot and hash, design/implement when authored, context lists)
```

改后：

```md
the one and only user confirmation happens at 1.4 over the full review package (prd snapshot and hash, plan.md when authored, context lists)
```

### 步骤 4.14：SKILL.md —— Boundaries 节（审阅包制品名）

改前（唯一命中）：

```md
it rides the single 1.4 review package (research/context/design/implement included) that authorizes the start.
```

改后：

```md
it rides the single 1.4 review package (research/context/plan included) that authorizes the start.
```

### 步骤 4.15：新建 packages/assets/skills/workloom-alignment/references/plan-authoring.md

新建文件，全文如下（一字不改）：

```markdown
# Plan-authoring reference (workloom-alignment)

Read this reference before authoring plan.md — the final alignment round chose to author, or an approved plan is being revised. Workflow 1.4's Authoring bar summarizes this standard; this file is the full version.

Why prescriptive: the implement executor treats the plan as its script. Every degree of freedom the plan leaves open becomes a silent, unreviewed decision made during implementation — the exact drift the alignment and the 1.4 review exist to prevent.

## Document shape

`plan.md` lives in the task directory; its prose follows the repo/language spec, identifiers stay English. Two parts, in order:

1. `## Design decisions` — the why behind the approach, rejected alternatives, and boundaries the steps must respect. Optional for small tasks; keep it whenever a decision would otherwise be invisible.
2. `## Steps` — the ordered execution plan. Every step follows the template below.

## Step template

Each step carries, in this order:

- **Target** — repo-relative file path plus the symbol (function / class / constant) being changed; for a new file, its full path.
- **Edit** — the exact change, in one of two forms:
  - modify: a fenced before-snippet copied from the current file, locating uniquely in it, and a fenced after-snippet replacing it. Line numbers may accompany as aids; the snippet is the anchor.
  - create: the full file content in one fenced block.
- **Verify** — the command proving this step done, and its expected result.

Order the steps so each one is independently verifiable when it completes, and later steps depend only on earlier ones.

## Authoring rules

1. Write against the real code: open every target file and copy the before-snippet from it. A snippet from memory is a defect waiting to surface mid-implementation.
2. Before/after code is final content: imports, types, comments, and call-site updates included. When a change ripples (callers, tests, pinned strings, build output), every ripple site appears — as its own step or as an explicit line inside the step.
3. Bind every directive to an anchor: a verb like "optimize", "adjust", or "update related code" enters the plan only attached to a concrete file, symbol, and edit.
4. Group cross-file invariants: a sentence pinned verbatim in several files gets one step naming every site, so all copies change together.
5. Keep one source of truth: the Design decisions part records why; the step code blocks own the exact wording — quote a sentence in one place only.

## Completion criteria

The plan is 1.4-ready when, for every step, a reader can name the file, the symbol, the exact code, and the verification — without making a single design decision of their own. A decision the executor would still have to make is a gap: close it in the plan, or take it back to the alignment round.
```

### 步骤 4.16：packages/assets/skills/workloom-continue/SKILL.md —— 路由判定两行

改前（唯一命中，两行整体替换）：

```md
   - `planning` with prd.md but no design.md → 1.4 await review (lightweight task, PRD artifacts ready).
   - `planning` with prd.md and design.md → 1.4 await review (complex task, PRD/design/implement artifacts ready).
```

改后：

```md
   - `planning` with prd.md but no plan.md → 1.4 await review (lightweight task, PRD artifacts ready).
   - `planning` with prd.md and plan.md → 1.4 await review (complex task, PRD/plan artifacts ready).
```

### 步骤 4.17：packages/assets/skills/workloom-alignment/references/ui-design.md —— 复杂任务注记句

改前（唯一命中）：

```md
note in the alignment that design.md needs a UI design chapter.
```

改后：

```md
note in the alignment that the plan's design-decisions part needs a UI design chapter.
```

### 步骤 4.18：packages/assets/skills/workloom-alignment/evals/evals.json —— 两处 eval 文案

改前（唯一命中）：

```json
      "prompt": "While in an active workloom planning task the user says: 'grill this requirement set before we write design.md'.",
```

改后：

```json
      "prompt": "While in an active workloom planning task the user says: 'grill this requirement set before we write plan.md'.",
```

改前（唯一命中）：

```json
    { "query": "pressure-test the acceptance criteria of this planning task before design.md", "should_trigger": true, "rationale": "design-tree pressure test in workloom planning" },
```

改后：

```json
    { "query": "pressure-test the acceptance criteria of this planning task before plan.md", "should_trigger": true, "rationale": "design-tree pressure test in workloom planning" },
```

### 步骤 4.19：packages/assets/third-party/mattpocock-skills/writing-for-agents/SKILL.md —— description 制品列举

改前（唯一命中）：

```md
description: Writing documents for agents. Use when creating or editing skills, or modifying AGENTS.md or CLAUDE.md; all agent-facing documents in a workloom task (prd/design/implement/spec/journal).
```

改后：

```md
description: Writing documents for agents. Use when creating or editing skills, or modifying AGENTS.md or CLAUDE.md; all agent-facing documents in a workloom task (prd/plan/spec/journal).
```

### 步骤 4.20：绿验证

1. 运行：`cd packages/core && node --test test/contract-asset.test.js`，预期全绿（阶段 3 的 5 个红测试转绿）。
2. 运行：`cd packages/assets && pnpm run test`，预期全绿（evals.json 改动不破坏 JSON 结构；该测试只覆盖 packages-scan 脚本，属回归确认）。
3. 运行：`node -e "JSON.parse(require('fs').readFileSync('packages/assets/skills/workloom-alignment/evals/evals.json','utf8')); console.log('evals.json OK')"`，预期输出 `evals.json OK`。

## 阶段 5（红→绿，接缝③）：adapter-pi 角色文案

### 步骤 5.1（红）：packages/adapter-pi/test/agents.test.ts 末尾追加新测试

改前（文件末尾锚点，唯一命中）：

```ts
  // Open issues 行格式与 core 纪律段一致：[P0|P1|P2] 占位，不再用 [<severity>]。
  assert.ok(check.systemPrompt.includes('[P0|P1|P2]'))
  assert.ok(!check.systemPrompt.includes('[<severity>]'))
})
```

改后（原块保留，其后追加）：

```ts
  // Open issues 行格式与 core 纪律段一致：[P0|P1|P2] 占位，不再用 [<severity>]。
  assert.ok(check.systemPrompt.includes('[P0|P1|P2]'))
  assert.ok(!check.systemPrompt.includes('[<severity>]'))
})

test('agent definitions: role copy reads the merged plan.md; stale artifact names are gone', () => {
  for (const kind of Object.values(EXECUTOR_KINDS)) {
    const definition: ExecutorAgentDefinition | undefined = EXECUTOR_AGENT_DEFINITIONS[kind]
    assert.ok(definition !== undefined, `missing definition for ${kind}`)
    assert.ok(
      !definition.systemPrompt.includes('implement.md'),
      `stale implement.md reference in ${kind}`,
    )
    assert.ok(
      !definition.systemPrompt.includes('design.md'),
      `stale design.md reference in ${kind}`,
    )
  }
  const implement = EXECUTOR_AGENT_DEFINITIONS[EXECUTOR_KINDS.implement]
  assert.ok(implement !== undefined)
  assert.ok(implement.systemPrompt.includes('Read the plan (plan.md) first'))
  assert.ok(implement.systemPrompt.includes('prescriptive'))
})
```

红验证：运行 `cd packages/adapter-pi && bun test test/agents.test.ts`，预期新测试红（旧文案含 implement.md/design.md），既有 4 个测试绿。

### 步骤 5.2（绿）：packages/adapter-pi/src/agent-definitions.ts —— implement 角色两段

改前（唯一命中）：

```ts
Your prompt carries the task context as pointers. Read the plan (implement.md) first; consult design.md, the PRD, and referenced files only when the current step needs them, in targeted ranges; never bulk-read the list upfront.

Follow the plan step by step, keep changes minimal and consistent with the design, and verify your work with the project's checks (lint, typecheck, tests) before finishing.
```

改后：

```ts
Your prompt carries the task context as pointers. Read the plan (plan.md) first; consult the PRD and referenced files only when the current step needs them, in targeted ranges; never bulk-read the list upfront.

Follow the plan step by step, keep changes minimal, and treat the plan as prescriptive: match its file, symbol, and snippet anchors exactly, and report any divergence as a blocking item instead of improvising. Verify your work with the project's checks (lint, typecheck, tests) before finishing.
```

### 步骤 5.3（绿）：agent-definitions.ts —— check 角色一段

改前（唯一命中）：

```ts
Your prompt carries the task context: the PRD (with its acceptance criteria) inline, plus pointers to the plan and referenced files. Read the plan (implement.md) first, then the actual code before judging; consult every other pointer only when the current check step needs it. Do not rely on summaries.
```

改后：

```ts
Your prompt carries the task context: the PRD (with its acceptance criteria) inline, plus pointers to the plan and referenced files. Read the plan (plan.md) first, then the actual code before judging; consult every other pointer only when the current check step needs it. Do not rely on summaries.
```

### 步骤 5.4（绿）：agent-definitions.ts —— frontend 角色三处

改前（唯一命中）：

```ts
following the PRD's UI Design section and the design document's UI chapter as the delivery baseline.
```

改后：

```ts
following the PRD's UI Design section and the plan's UI design chapter as the delivery baseline.
```

改前（唯一命中）：

```ts
Your prompt carries the task context as pointers. Read the plan (implement.md) first; the PRD's UI Design section is your delivery baseline (follow its pointer); consult every other pointer only when the current step needs it, in targeted ranges; never bulk-read upfront.
```

改后：

```ts
Your prompt carries the task context as pointers. Read the plan (plan.md) first; the PRD's UI Design section is your delivery baseline (follow its pointer); consult every other pointer only when the current step needs it, in targeted ranges; never bulk-read upfront.
```

改前（唯一命中）：

```ts
Keep changes minimal and consistent with the design.
```

改后：

```ts
Keep changes minimal and consistent with the plan's design decisions.
```

### 步骤 5.5：绿验证

1. 运行：`cd packages/adapter-pi && bun test test/agents.test.ts test/pi-args.test.ts`，预期全绿。
2. 运行：`cd packages/adapter-pi && pnpm run build`（sync-skills 重建 skills/），预期输出 `Synced 8 skill directories …`。

## 阶段 6（配套面）：adapter-dsh 测试 fixture 与两个 spec 文件

### 步骤 6.1：packages/adapter-dsh/test/executor.test.js —— makeProject fixture

改前（唯一命中）：

```js
  writeFileSync(join(taskDir, 'prd.md'), '# PRD\n')
  writeFileSync(join(taskDir, 'design.md'), '# Design\n')
  writeFileSync(join(taskDir, 'implement.md'), '# Implement\n')
```

改后：

```js
  writeFileSync(join(taskDir, 'prd.md'), '# PRD\n')
  writeFileSync(join(taskDir, 'plan.md'), '# Plan\n')
```

### 步骤 6.2：executor.test.js —— receipt 统计测试内注释

改前（唯一命中）：

```js
    // makeProject 只写 prd/design/implement 三个 artifact（无 jsonl）：implement 不内联
    // artifact（内联 0），三个文件均走指针行（pointed 3）、截断 0、索引 0。
```

改后：

```js
    // makeProject 只写 prd/plan 两个 artifact（无 jsonl）：implement 不内联
    // artifact（内联 0），两个文件均走指针行（pointed 2）、截断 0、索引 0。
```

### 步骤 6.3：.workloom/spec/repo/terminology/index.md —— task 词条

改前（唯一命中）：

```md
- task: one task directory (task.json, prd/design/implement, research/, jsonl lists) — avoid "issue", "ticket"
```

改后：

```md
- task: one task directory (task.json, prd/plan, research/, jsonl lists) — avoid "issue", "ticket"
```

### 步骤 6.4：.workloom/spec/repo/language/index.md —— chinese 条目制品列举

改前（唯一命中）：

```md
- chinese: project development documents (`AGENTS.md`), commit messages, in-source comments (JSDoc and line comments), and developer-authored task documents under `.workloom/tasks/<task>/` (`prd.md`, `design.md`, `implement.md`, and sibling notes)
```

改后：

```md
- chinese: project development documents (`AGENTS.md`), commit messages, in-source comments (JSDoc and line comments), and developer-authored task documents under `.workloom/tasks/<task>/` (`prd.md`, `plan.md`, and sibling notes)
```

### 步骤 6.5：验证

运行：`cd packages/adapter-dsh && pnpm run test`（含 build），预期全绿（receipt 四元组断言只含 inlined/truncated/indexed，不受指针行数影响；fixture 与注释已与 plan.md 口径一致）。

## 阶段 7：全仓清扫与全量验证

### 步骤 7.1：残留清扫

1. 运行：`grep -rn "design\.md\|implement\.md" packages/*/src packages/*/test packages/assets .workloom/spec docs 2>/dev/null | grep -v node_modules | grep -v "/dist/"`
2. 预期输出只剩白名单条目（prompts 片段命名为另一概念 + 历史来源注记）：
   - `packages/core/src/service/local-prompts.ts:63`（'implement.md': 'implement' 片段映射）
   - `packages/core/src/service/doctor-local-prompts.ts:126`（片段命名 hint 列表）
   - `packages/core/test/local-prompts.test.js`（227/230/233/249 片段 fixture）
   - `packages/core/test/doctor.test.js`（692/700/767 片段 fixture）
   - `packages/adapter-dsh/test/executor.test.js`（1483/1517/1541 片段 fixture；行号为阶段 6.1 删行后的实际值，修订 2）
   - `packages/adapter-pi/test/executor.test.ts:397`（片段 fixture）
   - `packages/core/test/subtask-contract.test.js:6`、`packages/core/test/worktree-compat.test.js:5`、`packages/core/test/fixtures/research-cardx-sample.md:3`（指向归档任务的历史来源注记）
   - `docs/research/zcode-plugin-support.md:170`（历史调研文档，agents/implement.md 指 Pi agent 文件命名；注意 docs/ 经主仓 .git/info/exclude 本地排除，worktree 基线不含该目录，清扫对其无输出属正确结果，修订 2）
   - `packages/core/test/contract-asset.test.js`（阶段 3 新增清扫测试自身的断言与失败消息含 design.md/implement.md 字面量——缺席断言必须写出被禁字符串，合法自引用，修订 1）
   - `packages/adapter-pi/test/agents.test.ts`（阶段 5 新增清扫测试同理，合法自引用，修订 1）
   - `packages/core/test/task-gates.test.js:104`（prd fixture 模板 Notes 节示例文本 `- see design.md`，本任务之前已存在，与制品引用无关，修订 2）
   - `packages/assets/skills/workloom-alignment/SKILL.md:11`（合法引用文件名 ui-design.md 含子串 design.md，清扫 grep 模式固有误报，修订 2）
3. 白名单外出现任何条目即漏改：回到对应阶段修复后重扫。

### 步骤 7.2：全量验证

1. `pnpm lint`，预期全绿。
2. `pnpm -r typecheck`，预期全绿。
3. `pnpm -r build`，预期全绿（core dist 再生：`grep -c "plan.md" packages/core/dist/domain/executor-context.js` 预期 ≥ 3，确认 dist 已含新口径）。
4. `cd packages/core && node --test test/*.test.js`，预期全绿。
5. `cd packages/adapter-dsh && node --test 'test/*.test.js'`，预期全绿。
6. `cd packages/adapter-pi && bun test test/*.test.ts`，预期全绿。
7. `ls packages/adapter-pi/skills/workloom-alignment/references/`，预期含 `plan-authoring.md`（sync-skills 递归拷贝验证）。
8. LSP 可用时对改过的 TS 文件跑 lsp_diagnostics 复核（session-context.ts、agent-definitions.ts、agents.test.ts），预期无 Error。

### 步骤 7.3：报告

按固定格式返回：改动文件清单（17 个源文件 + 1 个新建 reference + dist 再生文件）、各阶段红绿证据（红阶段失败测试名单 + 绿阶段全量输出摘要）、清扫结果对照白名单。dist 与源码同 commit 入库、push 后 profile repin 与实例重启由主会话在 2.3/交付环节处理，执行器不 commit、不 push。



