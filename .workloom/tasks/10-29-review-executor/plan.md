# 新增 review 执行器：开工前计划审查 — plan

按 test-first 红绿推进（五接缝：core 类型面 / core 注入面 / core 配置面 / adapter 面 / assets 契约面）。需求与验收以 [prd.md](prd.md) 的 R 编号需求与 AC1–AC6（含 AC7 机制面）为准；事实基线以 [research/](research/) 七份调研为准（本文所有改前片段已对当前 main 逐点重核）。全部改动与验证命令在任务代码根执行（task.json `worktree_path` 非空时即 worktree 根）。改前片段命中数不符即停止上报；红名单按 red-green-expectations spec 完成消费者全量追踪（含跨包暂态红与直绿固定的分类标注）。

## Design decisions

1. **review 纪律段文本单一来源在 core**（EXECUTOR_CONTRACT_BY_KIND.review，两 runtime 共享）：四维职责（Conformance/Fidelity/Feasibility/Quality）+ P0/P1/P2 计划口径 + 报告文件约定（plan-review.md，多轮以节追加）+ 与 check 的边界句（审计划 vs 审代码）+ 不改文件边界句；pi 角色总述互补不重复（agent-definitions 既有分工口径）。
2. **注入组合 = check 形态减软指针**（research 02 结论）：prd 全文节内联组加入 review；Pointer list 自动含 plan.md 指针；JSONL_FILES 补 `review → implement.jsonl`（缺键会静默丢 spec 指针）；prd 软指针组不含 review（避免同一 prd 全文 + 软指针重复）。
3. **写范围句与守卫机制去 research 化**：core 的 RESEARCH_WRITE_SCOPE_DISCIPLINE 更名 WRITE_SCOPE_DISCIPLINE（research/review 两段共用，消灭同语义双字面量）；dsh executor-guard 符号族更名（research* → write-guard 语义）并引入 WRITE_GUARDED_KINDS 集合（research + review），拒绝文案改 “this workloom executor”；pi 资产文件 research-scope.ts 更名 write-scope.ts、内部文案泛化、加载条件改集合判定。否决：复制 review 专用守卫模块（code-style 抽象通用机制原则）。
4. **computeTaskStage 加 review → current 分支**（与 research 同语义：规划期动作不驱动阶段迁移），消除 stage=check 后派发 review 静默回退 implement 的污染（research 03/07）。
5. **本机片段目标注册 review**（LOCAL_FRAGMENT_TARGETS + TARGET_BY_FILE + doctor-local-prompts 两处文案）：片段机制对未知 kind 抛错是阻断级事实（research 07 实测），此项进接缝①红绿。
6. **kind 文案枚举副本全列**：core surface.ts 两处（工具描述 + kind 参数描述）、dsh executor-injection KIND_LABELS、pi pi-args KIND_LABELS、executor-context.d.ts 两处 Record 联合与注释、local-prompts 两处注释——阶段 6 清扫条款兜底。
7. **示例模板补齐 frontend + review**：config.example.json 的 subagents 段现缺 frontend（既有缺口，check 纪律下必升 P1），与 review 一并补齐；init.test.js 路径断言清单同步四条。种子 config.json 模板（无 subagents 段）不动。
8. **纯改名与行为变更分离**：dsh 阶段 3.1 与 pi 阶段 4.1 是零行为改名重构（套件保持绿），行为变更集中在 3.3/4.3——保证每个红测试的归因唯一。
9. **跨包暂态红与直绿固定**（红名单三分类）：pi agents 键集合测试在阶段 2 build 后即红（core dist 含 review、pi 角色表未补），属预期暂态红，阶段 4.3 消除；pi 片段 review 用例与 dsh 守卫 review 覆盖用例是“直绿固定”（其依赖的 core/dsh 行为已在前序阶段落地），不列入红名单但列出以防误判。
10. **workflow 1.4 review 段插入点**：Authoring bar 段之后、规模自检段之前（research 05 最佳位：紧跟“plan 写完”语境）；跳过语义写入段内（对齐轮显式跳过、记录进 prd.md）；不加步骤编号、不升协议版本（version 保持 24）。
11. **session-context 的 EXECUTOR_NORMS “Implement strictly…” 句不动**：该句是全 kind 叶子执行器通用纪律，review 的具体职责由权威段（纪律段）承载并优先；改共用句波及所有 kind，收益为负。AC6（本文档形态）由本文档自身承载，无 Covers 步骤。

## Steps

### 阶段 0：基线确认

#### 步骤 0.1 基线全绿

- Covers: (internal)
- Target: 无文件改动（验证步骤）
- Edit: 无
- Verify: 依次运行，全部预期 exit 0 / 全绿，任何一项红即停止上报：
  1. `pnpm lint && pnpm -r typecheck && pnpm -r build`
  2. `cd packages/core && node --test test/*.test.js`
  3. `cd packages/adapter-dsh && pnpm run test`
  4. `cd packages/adapter-pi && bun test test/*.test.ts`
  5. `cd packages/assets && pnpm run test`

### 阶段 1（红，接缝①②③测试面）：core 五个测试文件改到目标断言

本阶段只改测试，不改 src、不 build。新文案常量（本计划单点定义，后文引用）：

```text
REVIEW-KEY   = Audit the plan (plan.md) before implementation starts
REVIEW-TITLE = review 纪律段：四维审查、分级口径、报告约定与不改文件边界句逐字固定
```

#### 步骤 1.1 executor-context.test.js —— kind 枚举断言扩五键

- Covers: AC1
- Target: packages/core/test/executor-context.test.js —— 「常量导出」测试
- Edit 改前（唯一命中）：

```js
  assert.deepEqual(EXECUTOR_KINDS, {
    research: 'research',
    implement: 'implement',
    check: 'check',
    frontend: 'frontend',
  })
```

- Edit 改后：

```js
  assert.deepEqual(EXECUTOR_KINDS, {
    research: 'research',
    implement: 'implement',
    check: 'check',
    frontend: 'frontend',
    review: 'review',
  })
```

- Verify: `grep -c "review: 'review'," packages/core/test/executor-context.test.js` 输出 1。

#### 步骤 1.2 executor-context.test.js —— 纪律段关键字表加 review（含标题 四→五）

- Covers: AC1, AC2
- Target: 同文件「四种 kind 纪律段均并入末尾权威段」测试
- Edit 改前（标题行，唯一命中）：

```js
test('四种 kind 纪律段均并入末尾权威段（kind 子标题 + 正文硬指令）', () => {
```

- Edit 改后：

```js
test('五种 kind 纪律段均并入末尾权威段（kind 子标题 + 正文硬指令）', () => {
```

- Edit 改前（关键字表，唯一命中）：

```js
    const bodyKeywords = {
      research: 'Ground every conclusion in the real source',
      implement: 'Make the smallest change that satisfies the requirement',
      check: 'Classify every finding by severity',
      frontend: 'Touch frontend files only',
    }
```

- Edit 改后：

```js
    const bodyKeywords = {
      research: 'Ground every conclusion in the real source',
      implement: 'Make the smallest change that satisfies the requirement',
      check: 'Classify every finding by severity',
      review: 'Audit the plan (plan.md) before implementation starts',
      frontend: 'Touch frontend files only',
    }
```

- Verify: `grep -c "Audit the plan (plan.md) before implementation starts" packages/core/test/executor-context.test.js` 输出 ≥ 1。

#### 步骤 1.3 executor-context.test.js —— 四个显式 kind 数组扩 review（含标题 四→五）

- Covers: AC1, AC2
- Target: 同文件 S5 护栏、「无用户通道」、段落白名单、分层协议句四个测试的 kind 数组与标题
- Edit（四处标题行子串替换，各唯一命中）：
  1. `test('S5 护栏：四种 kind 纪律段均含强制加载协议句（逐字）；注入含唯一 marker token（两次派发不同）', () => {` → `test('S5 护栏：五种 kind 纪律段均含强制加载协议句（逐字）；注入含唯一 marker token（两次派发不同）', () => {`
  2. `test('纪律两句：四种 kind 纪律段均含「无用户通道」共用句（逐字，命令式无弱化词）', () => {` → `test('纪律两句：五种 kind 纪律段均含「无用户通道」共用句（逐字，命令式无弱化词）', () => {`
  3. `test('段落白名单与顺序：四种 kind 按 prd Requirements 1 组装，Task prompt 在 Local directives 之后、contract 恒末段', () => {` → `test('段落白名单与顺序：五种 kind 按 prd Requirements 1 组装，Task prompt 在 Local directives 之后、contract 恒末段', () => {`
  4. `test('分层加载协议句：四种 kind contract 段均含分层语义 + 回声句后半逐字保留', () => {` → `test('分层加载协议句：五种 kind contract 段均含分层语义 + 回声句后半逐字保留', () => {`
- Edit（四处循环数组，改前块各带上下文保证唯一命中）：
  1. S5（改前含 writeRootFile 行）：

```js
    writeRootFile(root, 'packages/a.js', 'const a = 1\n')
    for (const kind of ['research', 'implement', 'check', 'frontend']) {
```

改后：

```js
    writeRootFile(root, 'packages/a.js', 'const a = 1\n')
    for (const kind of ['research', 'implement', 'check', 'frontend', 'review']) {
```

  2. 「无用户通道」（改前五行块，唯一命中——后续行为「纪律段并入末尾权威段」注释）：

```js
    writeTaskFile(root, 'prd.md', '# PRD\n')
    for (const kind of ['research', 'implement', 'check', 'frontend']) {
      const [err, result] = buildExecutorPrompt(baseParams(root, kind))
      assert.equal(err, null)
      // 纪律段并入末尾权威段：从 `## Executor contract` 起提取全文逐字断言
```

改后（仅数组行加 'review'，其余原样）：

```js
    writeTaskFile(root, 'prd.md', '# PRD\n')
    for (const kind of ['research', 'implement', 'check', 'frontend', 'review']) {
      const [err, result] = buildExecutorPrompt(baseParams(root, kind))
      assert.equal(err, null)
      // 纪律段并入末尾权威段：从 `## Executor contract` 起提取全文逐字断言
```

  3. 段落白名单（改前含对象展开入参，唯一命中）：

```js
    for (const kind of ['research', 'implement', 'check', 'frontend']) {
      const [err, result] = buildExecutorPrompt({
        ...baseParams(root, kind),
        localDirectives: 'LOCAL_FRAGMENT',
      })
```

改后：

```js
    for (const kind of ['research', 'implement', 'check', 'frontend', 'review']) {
      const [err, result] = buildExecutorPrompt({
        ...baseParams(root, kind),
        localDirectives: 'LOCAL_FRAGMENT',
      })
```

  4. 分层协议句（改前五行块，唯一命中——后续行为 section 切片）：

```js
    writeTaskFile(root, 'prd.md', '# PRD\n')
    for (const kind of ['research', 'implement', 'check', 'frontend']) {
      const [err, result] = buildExecutorPrompt(baseParams(root, kind))
      assert.equal(err, null)
      const section = result.text.slice(result.text.indexOf('## Executor contract'))
```

改后（仅数组行加 'review'，其余原样）：

```js
    writeTaskFile(root, 'prd.md', '# PRD\n')
    for (const kind of ['research', 'implement', 'check', 'frontend', 'review']) {
      const [err, result] = buildExecutorPrompt(baseParams(root, kind))
      assert.equal(err, null)
      const section = result.text.slice(result.text.indexOf('## Executor contract'))
```

- Verify: `grep -c "'frontend', 'review'\]" packages/core/test/executor-context.test.js` 输出 4；`grep -c "四种 kind" packages/core/test/executor-context.test.js` 输出 1（仅存文件头注释一处，步骤 1.6 处理）。

#### 步骤 1.4 executor-context.test.js —— 段落白名单的 prd 内联分支扩 review

- Covers: AC2
- Target: 同文件段落白名单测试的 kind 分支条件
- Edit 改前（唯一命中）：

```js
      if (kind === 'check' || kind === 'research') {
        // prd 块物化（check/research），位于 pointer list（research 无此段）之前
```

- Edit 改后：

```js
      if (kind === 'check' || kind === 'research' || kind === 'review') {
        // prd 块物化（check/research/review），位于 pointer list（research 无此段）之前
```

- Verify: `grep -c "kind === 'review')" packages/core/test/executor-context.test.js` 输出 ≥ 1。
- 说明：review 落入内联组后不再进入 else 分支（else 断言软指针存在，review 无软指针）；Pointer list 断言分支（非 research）review 自动适用（plan.md + implement.jsonl 条目，夹具已具备）。

#### 步骤 1.5 executor-context.test.js —— 写范围句常量更名 + 测试改双 kind 包含组

- Covers: AC2, AC7
- Target: 同文件 RESEARCH_WRITE_SCOPE_DISCIPLINE 测试侧副本（常量 + 注释）与「research 路径句」测试整体
- Edit 改前（常量块，唯一命中）：

```js
/** research 写/编辑路径限制告知句（research 纪律段专属，逐字，机制强制前置告知）。 */
const RESEARCH_WRITE_SCOPE_DISCIPLINE =
  'Your write/edit reach is confined to the .workloom/ directory: paths ' + 'outside it are denied.'
```

- Edit 改后：

```js
/** 写/编辑路径限制告知句（research/review 纪律段共用，与实现逐字同源，机制强制前置告知）。 */
const WRITE_SCOPE_DISCIPLINE =
  'Your write/edit reach is confined to the .workloom/ directory: paths ' + 'outside it are denied.'
```

- Edit 改前（整个测试，唯一命中，从标题行到收尾）：

```js
test('research 路径句：research 纪律段含 .workloom/ 路径限制告知句（逐字），其余 kind 不含', () => {
  const root = makeProject()
  try {
    writeTaskFile(root, 'prd.md', '# PRD\n')
    const [err, result] = buildExecutorPrompt(baseParams(root, 'research'))
    assert.equal(err, null)
    const contractAt = result.text.indexOf('## Executor contract')
    const section = result.text.slice(contractAt)
    assert.ok(
      section.includes(RESEARCH_WRITE_SCOPE_DISCIPLINE),
      'research discipline must carry the write-scope sentence verbatim',
    )
    for (const kind of ['implement', 'check', 'frontend']) {
      const [kErr, kResult] = buildExecutorPrompt(baseParams(root, kind))
      assert.equal(kErr, null)
      const kContractAt = kResult.text.indexOf('## Executor contract')
      const kSection = kResult.text.slice(kContractAt)
      assert.ok(
        !kSection.includes(RESEARCH_WRITE_SCOPE_DISCIPLINE),
        `${kind} discipline must not carry the research write-scope sentence`,
      )
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
```

- Edit 改后：

```js
test('写范围句：research/review 纪律段含 .workloom/ 路径限制告知句（逐字），其余 kind 不含', () => {
  const root = makeProject()
  try {
    writeTaskFile(root, 'prd.md', '# PRD\n')
    for (const kind of ['research', 'review']) {
      const [err, result] = buildExecutorPrompt(baseParams(root, kind))
      assert.equal(err, null)
      const contractAt = result.text.indexOf('## Executor contract')
      const section = result.text.slice(contractAt)
      assert.ok(
        section.includes(WRITE_SCOPE_DISCIPLINE),
        `${kind} discipline must carry the write-scope sentence verbatim`,
      )
    }
    for (const kind of ['implement', 'check', 'frontend']) {
      const [kErr, kResult] = buildExecutorPrompt(baseParams(root, kind))
      assert.equal(kErr, null)
      const kContractAt = kResult.text.indexOf('## Executor contract')
      const kSection = kResult.text.slice(kContractAt)
      assert.ok(
        !kSection.includes(WRITE_SCOPE_DISCIPLINE),
        `${kind} discipline must not carry the write-scope sentence`,
      )
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
```

- Verify: `grep -c "RESEARCH_WRITE_SCOPE_DISCIPLINE" packages/core/test/executor-context.test.js` 输出 0；`grep -c "WRITE_SCOPE_DISCIPLINE" packages/core/test/executor-context.test.js` 输出 ≥ 3。

#### 步骤 1.6 executor-context.test.js —— 文件头注释 + 文件末尾追加 review 纪律段固定测试

- Covers: AC2
- Target: packages/core/test/executor-context.test.js —— 头注释第 4 行与文件末尾（worktree 零 diff 测试之后）
- Edit 改前（头注释行一，唯一命中）：

```js
 * 覆盖：四种 kind 段落白名单与顺序（Task prompt 在 Local directives 之后、contract 末段）；
```

- Edit 改后：

```js
 * 覆盖：五种 kind 段落白名单与顺序（Task prompt 在 Local directives 之后、contract 末段）；
```

- Edit 改前（头注释行二，唯一命中）：

```js
 * check/research 物化 prd 块、implement/frontend 物化 prd 软指针（无全文、无 H2 目录预览）；
```

- Edit 改后：

```js
 * check/research/review 物化 prd 块、implement/frontend 物化 prd 软指针（无全文、无 H2 目录预览）；
```

- Edit 改前（文件末尾锚点，唯一命中）：

```js
  } finally {
    for (const root of Object.values(roots)) {
      rmSync(root, { recursive: true, force: true })
    }
  }
})
```

- Edit 改后（原块保留，其后追加）：

```js
  } finally {
    for (const root of Object.values(roots)) {
      rmSync(root, { recursive: true, force: true })
    }
  }
})

/** review 纪律段关键句（与实现逐字同源：四维职责、分级口径、报告约定、边界句）。 */
const REVIEW_DISCIPLINE_PINS = [
  'Audit the plan (plan.md) before implementation starts',
  "code review after implementation is the check executor's job, and you never fix code",
  '- Conformance:',
  '- Fidelity:',
  '- Feasibility:',
  '- Quality:',
  'P0 = executing the plan as written must fail or violates acceptance',
  'Write the report to plan-review.md in the task directory (append a new section per round)',
  'The plan, the prd, and all code files stay untouched by you.',
]

test('review 纪律段：四维审查、分级口径、报告约定与不改文件边界句逐字固定', () => {
  const root = makeProject()
  try {
    writeTaskFile(root, 'prd.md', '# PRD\n')
    writeTaskFile(root, 'plan.md', '# Plan\n')
    const [err, result] = buildExecutorPrompt(baseParams(root, 'review'))
    assert.equal(err, null)
    const section = result.text.slice(result.text.indexOf('## Executor contract'))
    for (const pin of REVIEW_DISCIPLINE_PINS) {
      assert.ok(section.includes(pin), `review discipline must carry: ${pin}`)
    }
    // review 属 prd 内联组且带 Pointer list（plan.md 指针），无 prd 软指针
    assert.ok(result.text.includes('--- .workloom/tasks/08-24-demo/prd.md ---'))
    assert.ok(result.text.includes('- .workloom/tasks/08-24-demo/plan.md'))
    assert.ok(!result.text.includes('consult .workloom/'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
```

- Verify: `grep -c "REVIEW_DISCIPLINE_PINS" packages/core/test/executor-context.test.js` 输出 2（常量定义 + 循环引用）。

#### 步骤 1.7 task-store.test.js —— computeTaskStage 测试扩 review

- Covers: AC7
- Target: packages/core/test/task-store.test.js —— 「computeTaskStage 纯函数」测试
- Edit 改前（标题行，唯一命中）：

```js
test('computeTaskStage 纯函数：四 kind 映射、research 保持 current、非法 kind 抛错', () => {
```

- Edit 改后：

```js
test('computeTaskStage 纯函数：五 kind 映射、research/review 保持 current、非法 kind 抛错', () => {
```

- Edit 改前（唯一命中）：

```js
  // research 保持 current
  assert.equal(computeTaskStage(TaskStage.IMPLEMENT, EXECUTOR_KINDS.research), TaskStage.IMPLEMENT)
  assert.equal(computeTaskStage(TaskStage.CHECK, EXECUTOR_KINDS.research), TaskStage.CHECK)
```

- Edit 改后：

```js
  // research/review 保持 current（规划期动作，不驱动阶段迁移）
  assert.equal(computeTaskStage(TaskStage.IMPLEMENT, EXECUTOR_KINDS.research), TaskStage.IMPLEMENT)
  assert.equal(computeTaskStage(TaskStage.CHECK, EXECUTOR_KINDS.research), TaskStage.CHECK)
  assert.equal(computeTaskStage(TaskStage.IMPLEMENT, EXECUTOR_KINDS.review), TaskStage.IMPLEMENT)
  assert.equal(computeTaskStage(TaskStage.CHECK, EXECUTOR_KINDS.review), TaskStage.CHECK)
```

- Verify: `grep -c "EXECUTOR_KINDS.review" packages/core/test/task-store.test.js` 输出 2。

#### 步骤 1.8 local-prompts.test.js —— 文件末尾追加 review 片段目标测试

- Covers: AC7
- Target: packages/core/test/local-prompts.test.js —— 文件末尾（「all 目标合成」测试之后；filterAndOrderLocal 已在文件既有导入清单中）
- Edit 改前（文件末尾锚点，唯一命中）：

```js
  try {
    const [err, text] = composeLocalDirectivesText(root, 'all', home)
    assert.equal(err, null)
    assert.equal(text, 'G-ALL\n\nP-ALL\n\nL-ALL')
  } finally {
    cleanup(root, home)
  }
})
```

- Edit 改后（原块保留，其后追加）：

```js
  try {
    const [err, text] = composeLocalDirectivesText(root, 'all', home)
    assert.equal(err, null)
    assert.equal(text, 'G-ALL\n\nP-ALL\n\nL-ALL')
  } finally {
    cleanup(root, home)
  }
})

test('review 片段目标：filterAndOrderLocal 接受 review，未知 target 报错文案列出 review', () => {
  const fragments = [
    { target: 'all', text: 'ALL' },
    { target: 'review', text: 'REVIEW' },
    { target: 'check', text: 'CHECK' },
  ]
  assert.deepEqual(filterAndOrderLocal(fragments, 'review'), [
    { target: 'all', text: 'ALL' },
    { target: 'review', text: 'REVIEW' },
  ])
  assert.throws(
    () => filterAndOrderLocal(fragments, 'bogus'),
    /unknown target "bogus" \(must be one of main\/research\/implement\/check\/frontend\/review\/all\)/,
  )
})
```

- Verify: `grep -c "review 片段目标" packages/core/test/local-prompts.test.js` 输出 1。

#### 步骤 1.9 doctor.test.js —— 追加 review.md 合法目标测试

- Covers: AC7
- Target: packages/core/test/doctor.test.js —— 「unknown 文件名 warn」测试之后插入（复用文件既有 makeRoot/initWorkloom/writeLocalFragment/localPromptsCheck 辅助函数）
- Edit 改前（插入锚点，唯一命中）：

```js
    assert.deepEqual(check.info, [], 'no fragment is loaded in this scenario')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
```

- Edit 改后（原块保留，其后追加）：

```js
    assert.deepEqual(check.info, [], 'no fragment is loaded in this scenario')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('check local-prompts：review.md 是合法片段目标（loaded info，不报 unknown）', () => {
  const root = makeRoot()
  initWorkloom(root)
  writeLocalFragment(root, 'review.md', 'REVIEW-FRAGMENT')
  try {
    const [err, report] = runDoctor(root, { fix: false })
    assert.equal(err, null)
    const check = localPromptsCheck(report)
    assert.ok(
      !check.issues.some((i) => i.path.endsWith('review.md')),
      'review.md must not be reported as unknown',
    )
    assert.ok(
      check.info.some((l) => l.includes('review.md') && l.includes('[target=review]')),
      'review.md must be listed as loaded with target=review',
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
```

- Verify: `grep -c "review.md 是合法片段目标" packages/core/test/doctor.test.js` 输出 1。

#### 步骤 1.10 init.test.js —— 示例模板路径断言清单扩四条

- Covers: AC7
- Target: packages/core/test/init.test.js —— 「config.example.json 覆盖 DEFAULT_CONFIG 全部字段键」测试内的 subagents 路径清单
- Edit 改前（唯一命中）：

```js
    for (const path of [
      'subagents.research.model',
      'subagents.research.effort',
      'subagents.implement.model.dsh',
      'subagents.implement.model.pi',
      'subagents.implement.effort',
      'subagents.check.model',
      'subagents.check.effort',
    ]) {
```

- Edit 改后：

```js
    for (const path of [
      'subagents.research.model',
      'subagents.research.effort',
      'subagents.implement.model.dsh',
      'subagents.implement.model.pi',
      'subagents.implement.effort',
      'subagents.check.model',
      'subagents.check.effort',
      'subagents.frontend.model',
      'subagents.frontend.effort',
      'subagents.review.model',
      'subagents.review.effort',
    ]) {
```

- Verify: `grep -c "subagents.review.model" packages/core/test/init.test.js` 输出 1。

#### 步骤 1.11 红验证（不 build）

- Covers: AC1, AC2, AC7
- Target: 无文件改动（验证步骤）
- Edit: 无
- Verify: `cd packages/core && node --test test/executor-context.test.js test/task-store.test.js test/local-prompts.test.js test/doctor.test.js test/init.test.js`（dist 与 src 均未改）。
  预期失败名单（12 个，逐一对照记入报告）：
  1. executor-context「常量导出：effort 档位与 executor kind 枚举」（期望 5 键，dist 4 键）
  2. executor-context「五种 kind 纪律段均并入末尾权威段（kind 子标题 + 正文硬指令）」（review 派发在旧 dist 抛 invalid kind）
  3. executor-context「S5 护栏：五种 kind 纪律段均含强制加载协议句（逐字）；注入含唯一 marker token（两次派发不同）」（同因）
  4. executor-context「纪律两句：五种 kind 纪律段均含「无用户通道」共用句（逐字，命令式无弱化词）」（同因）
  5. executor-context「写范围句：research/review 纪律段含 .workloom/ 路径限制告知句（逐字），其余 kind 不含」（review 组抛错）
  6. executor-context「段落白名单与顺序：五种 kind 按 prd Requirements 1 组装，Task prompt 在 Local directives 之后、contract 恒末段」（同因）
  7. executor-context「分层加载协议句：五种 kind contract 段均含分层语义 + 回声句后半逐字保留」（同因）
  8. executor-context「review 纪律段：四维审查、分级口径、报告约定与不改文件边界句逐字固定」（新增，同因）
  9. task-store「computeTaskStage 纯函数：五 kind 映射、research/review 保持 current、非法 kind 抛错」（EXECUTOR_KINDS.review 为 undefined → invalid kind 抛错，src 直读即红）
  10. local-prompts「review 片段目标：filterAndOrderLocal 接受 review，未知 target 报错文案列出 review」（新增，dist 旧目标清单）
  11. doctor「check local-prompts：review.md 是合法片段目标（loaded info，不报 unknown）」（新增，dist 旧文件名映射）
  12. init「config.example.json 覆盖 DEFAULT_CONFIG 全部字段键（含 tools，不含 default_package 与 executor）」（模板缺 frontend/review 四条路径）
  预期保持绿（不是漏改）：executor-context 其余测试（S1/S2/预算/check 分级/词数/worktree 系列等）、task-store 其余测试、doctor 的 unknown 文件名测试（weird.md 照旧 warn）、local-prompts 其余测试、init 其余测试。失败集与预期不符：停止上报。

### 阶段 2（绿，core 源码面）：枚举、纪律段、注入分支、阶段函数、片段目标、文案与示例模板

#### 步骤 2.1 executor-context.js —— EXECUTOR_KINDS 加 review

- Covers: AC1
- Target: packages/core/src/domain/executor-context.js —— EXECUTOR_KINDS 常量
- Edit 改前（唯一命中）：

```js
/** executor 类型枚举（子代理角色）。 */
export const EXECUTOR_KINDS = Object.freeze({
  research: 'research',
  implement: 'implement',
  check: 'check',
  frontend: 'frontend',
})
```

- Edit 改后：

```js
/** executor 类型枚举（子代理角色）。 */
export const EXECUTOR_KINDS = Object.freeze({
  research: 'research',
  implement: 'implement',
  check: 'check',
  frontend: 'frontend',
  review: 'review',
})
```

- Verify: `grep -c "review: 'review'," packages/core/src/domain/executor-context.js` 输出 1。

#### 步骤 2.2 executor-context.d.ts —— 两处 Record 联合与两处注释

- Covers: AC1
- Target: packages/core/src/domain/executor-context.d.ts —— EXECUTOR_KINDS 与 EXECUTOR_CONTRACT_BY_KIND 类型面、枚举注释、ExecutorPromptStats.filesInlined 注释
- Edit 改前（唯一命中）：

```ts
/** executor 类型枚举（research/implement/check/frontend）。 */
export const EXECUTOR_KINDS: Readonly<
  Record<'research' | 'implement' | 'check' | 'frontend', string>
>

/** 按 kind 的执行器纪律段正文（硬指令，并入注入文本末尾的终极权威段）。 */
export const EXECUTOR_CONTRACT_BY_KIND: Readonly<
  Record<'research' | 'implement' | 'check' | 'frontend', string>
>
```

- Edit 改后：

```ts
/** executor 类型枚举（research/implement/check/frontend/review）。 */
export const EXECUTOR_KINDS: Readonly<
  Record<'research' | 'implement' | 'check' | 'frontend' | 'review', string>
>

/** 按 kind 的执行器纪律段正文（硬指令，并入注入文本末尾的终极权威段）。 */
export const EXECUTOR_CONTRACT_BY_KIND: Readonly<
  Record<'research' | 'implement' | 'check' | 'frontend' | 'review', string>
>
```

- Edit 改前（stats 注释，唯一命中）：

```ts
  /** 注入的 artifact 块数（现仅 check/research 物化的 prd 全文节块）。 */
```

- Edit 改后：

```ts
  /** 注入的 artifact 块数（现仅 check/research/review 物化的 prd 全文节块）。 */
```

- Verify: `grep -c "'frontend' | 'review'" packages/core/src/domain/executor-context.d.ts` 输出 2。

#### 步骤 2.3 executor-context.js —— JSONL_FILES 补 review 映射

- Covers: AC2
- Target: 同 2.1 文件 —— JSONL_FILES 常量
- Edit 改前（唯一命中）：

```js
const JSONL_FILES = Object.freeze({
  [EXECUTOR_KINDS.implement]: 'implement.jsonl',
  [EXECUTOR_KINDS.check]: 'check.jsonl',
  // frontend 上下文同 implement：plan.md 指针 + implement.jsonl。
  [EXECUTOR_KINDS.frontend]: 'implement.jsonl',
})
```

- Edit 改后：

```js
const JSONL_FILES = Object.freeze({
  [EXECUTOR_KINDS.implement]: 'implement.jsonl',
  [EXECUTOR_KINDS.check]: 'check.jsonl',
  // frontend 上下文同 implement：plan.md 指针 + implement.jsonl。
  [EXECUTOR_KINDS.frontend]: 'implement.jsonl',
  // review 审计划：与 implement 阶段消费同一批 spec（复用 implement.jsonl）。
  [EXECUTOR_KINDS.review]: 'implement.jsonl',
})
```

- Verify: `grep -c "\[EXECUTOR_KINDS.review\]: 'implement.jsonl'," packages/core/src/domain/executor-context.js` 输出 1。

#### 步骤 2.4 executor-context.js —— 写范围句常量更名（去 research 化）

- Covers: AC7
- Target: 同 2.1 文件 —— RESEARCH_WRITE_SCOPE_DISCIPLINE 常量与注释
- Edit 改前（唯一命中）：

```js
/**
 * research 写/编辑路径限制告知句（research 纪律段专属，机制强制的前置告知）：
 * DSH 守卫与 Pi 同名副本扩展（均为同名覆盖）把 research 的 write/edit 限定在
 * <cwd>/.workloom/ 内，越界拒绝。
 */
const RESEARCH_WRITE_SCOPE_DISCIPLINE =
  'Your write/edit reach is confined to the .workloom/ directory: paths ' + 'outside it are denied.'
```

- Edit 改后：

```js
/**
 * 写/编辑路径限制告知句（research/review 纪律段共用，机制强制的前置告知）：
 * DSH 守卫（WRITE_GUARDED_KINDS 集合）与 Pi write-scope 副本扩展（同名覆盖）
 * 把受限写 kind 的 write/edit 限定在 <cwd>/.workloom/ 内，越界拒绝。
 */
const WRITE_SCOPE_DISCIPLINE =
  'Your write/edit reach is confined to the .workloom/ directory: paths ' + 'outside it are denied.'
```

- Verify: `grep -c "RESEARCH_WRITE_SCOPE_DISCIPLINE" packages/core/src/domain/executor-context.js` 输出 1（仅剩 research 纪律段内引用，步骤 2.5 处理）。

#### 步骤 2.5 executor-context.js —— research 段引用更名 + 新增 review 纪律段

- Covers: AC2, AC7
- Target: 同 2.1 文件 —— EXECUTOR_CONTRACT_BY_KIND（research 段引用行；check 段与 frontend 段之间插入 review 段）
- Edit 改前（唯一命中，research 段内引用行）：

```js
${RESEARCH_WRITE_SCOPE_DISCIPLINE}
```

- Edit 改后：

```js
${WRITE_SCOPE_DISCIPLINE}
```

- Edit 改前（插入锚点：check 段结尾 + frontend 段开头，唯一命中）：

```js
${INJECTION_PROTOCOL_DISCIPLINE}`,
  [EXECUTOR_KINDS.frontend]: `Follow the PRD's '## UI Design' section as the baseline and deliver all seven UI axes it asks for.
```

- Edit 改后（在两者之间插入 review 段，文本与步骤 1.6 的 REVIEW_DISCIPLINE_PINS 逐字同源）：

```js
${INJECTION_PROTOCOL_DISCIPLINE}`,
  [EXECUTOR_KINDS.review]: `Audit the plan (plan.md) before implementation starts; code review after implementation is the check executor's job, and you never fix code.
Audit in four dimensions, item by item:
- Conformance: the plan meets the prescriptive authoring bar — every step anchored to a file, a symbol, and exact code, and every step verifiable.
- Fidelity: every prd acceptance criterion is covered by the steps' Covers lines; alignment decisions are honored; nothing drifts beyond scope; prd format gaps (missing R/AC numbers or verification methods) are findings.
- Feasibility: verify anchors against the real code — files exist, symbols resolve, before-snippets locate uniquely, after-code fits its context, and verification commands run; read the actual files (LSP first where available) before claiming a fact.
- Quality: the planned approach complies with the referenced specs, reuses existing utilities, and weighs better alternatives.
Classify every finding: P0 = executing the plan as written must fail or violates acceptance; P1 = feasibility risk or a clearly better approach not adopted; P2 = imprecise wording or incomplete references.
Write the report to plan-review.md in the task directory (append a new section per round); every finding carries its severity, the plan anchor, and a fix suggestion. The plan, the prd, and all code files stay untouched by you.
${WRITE_SCOPE_DISCIPLINE}
${LSP_BASELINE_SENTENCE}
${BATCHING_DISCIPLINE}
${COMPACT_OUTPUT_DISCIPLINE}
${CONSULT_MATERIALS_ON_DEMAND_RULE}
${INJECTION_PROTOCOL_DISCIPLINE}`,
  [EXECUTOR_KINDS.frontend]: `Follow the PRD's '## UI Design' section as the baseline and deliver all seven UI axes it asks for.
```

- Verify: `grep -c "EXECUTOR_KINDS.review\]:" packages/core/src/domain/executor-context.js` 输出 2（JSONL_FILES 映射行与纪律段键各命中一次；修订 1 更正原预期 1——漏算 JSONL 行的算术笔误）；`grep -c "RESEARCH_WRITE_SCOPE_DISCIPLINE" packages/core/src/domain/executor-context.js` 输出 0。

#### 步骤 2.6 executor-context.js —— prd 全文物化条件扩 review（含三处注释同步）

- Covers: AC2
- Target: 同 2.1 文件 —— buildInternal 的 prd 内联分支与文件头注释、inlinePrdArtifact JSDoc
- Edit 改前（分支块，唯一命中）：

```js
  // check/research 物化 prd 全文节块（验收基线/问题框架，职责必需）；implement/
  // frontend 不物化 prd（下方软指针行代替，正文按需查阅）。
  if (params.kind === EXECUTOR_KINDS.check || params.kind === EXECUTOR_KINDS.research) {
    inlinePrdArtifact(parts, params.taskRelPath, taskDir, ci, stats)
  }
```

- Edit 改后：

```js
  // check/research/review 物化 prd 全文节块（验收基线/问题框架/审查对象，职责必需）；
  // implement/frontend 不物化 prd（下方软指针行代替，正文按需查阅）。
  if (
    params.kind === EXECUTOR_KINDS.check ||
    params.kind === EXECUTOR_KINDS.research ||
    params.kind === EXECUTOR_KINDS.review
  ) {
    inlinePrdArtifact(parts, params.taskRelPath, taskDir, ci, stats)
  }
```

- Edit 改前（文件头注释第一处，唯一命中）：

```js
 *   marker → （check/research：prd 全文节块）→ Pointer list（research 无；首行为
```

- Edit 改后：

```js
 *   marker → （check/research/review：prd 全文节块）→ Pointer list（research 无；首行为
```

- Edit 改前（文件头注释第二处，唯一命中）：

```js
 *   「路径 + reason」指针行，无逐行读后判后缀；prd 仅 check/research 物化
```

- Edit 改后：

```js
 *   「路径 + reason」指针行，无逐行读后判后缀；prd 仅 check/research/review 物化
```

- Edit 改前（inlinePrdArtifact JSDoc，唯一命中）：

```js
 * 内联 prd.md 全文节块（check/research 专有；验收基线与偏差判定依据，职责必需）：
```

- Edit 改后：

```js
 * 内联 prd.md 全文节块（check/research/review 共用；验收基线/偏差判定/审查对象，职责必需）：
```

- Verify: `grep -c "EXECUTOR_KINDS.review" packages/core/src/domain/executor-context.js` 输出 3（JSONL_FILES + 内联条件 + 纪律段键）。

#### 步骤 2.7 task-store.js —— computeTaskStage 加 review 分支（含 JSDoc）

- Covers: AC7
- Target: packages/core/src/domain/task-store.js —— computeTaskStage 函数
- Edit 改前（JSDoc 首两行，唯一命中）：

```js
 * 计算派发后的任务阶段（纯函数，独立可测）：research 保持 current；
 * implement/frontend → 'implement'；check → 'check'。
```

- Edit 改后：

```js
 * 计算派发后的任务阶段（纯函数，独立可测）：research/review 保持 current
 * （调研与计划审查不驱动阶段迁移）；implement/frontend → 'implement'；check → 'check'。
```

- Edit 改前（分支块，唯一命中）：

```js
  if (kind === EXECUTOR_KINDS.research) return current
  if (kind === EXECUTOR_KINDS.check) return TaskStage.CHECK
  return TaskStage.IMPLEMENT
```

- Edit 改后：

```js
  if (kind === EXECUTOR_KINDS.research) return current
  if (kind === EXECUTOR_KINDS.review) return current
  if (kind === EXECUTOR_KINDS.check) return TaskStage.CHECK
  return TaskStage.IMPLEMENT
```

- Verify: `grep -c "EXECUTOR_KINDS.review) return current" packages/core/src/domain/task-store.js` 输出 1。

#### 步骤 2.8 local-prompts.ts —— 片段目标注册 review（四处）

- Covers: AC7
- Target: packages/core/src/service/local-prompts.ts —— LOCAL_FRAGMENT_TARGETS 注释与数组、LocalFragment.target 注释、TARGET_BY_FILE
- Edit 改前（枚举注释，唯一命中）：

```ts
/** 片段目标枚举：文件名 → 目标（main 为主 agent，research/implement/check/frontend 为 executor kind，all 通用）。 */
```

- Edit 改后：

```ts
/** 片段目标枚举：文件名 → 目标（main 为主 agent，research/implement/check/frontend/review 为 executor kind，all 通用）。 */
```

- Edit 改前（目标数组，唯一命中）：

```ts
export const LOCAL_FRAGMENT_TARGETS = Object.freeze([
  'main',
  'research',
  'implement',
  'check',
  'frontend',
  'all',
] as const)
```

- Edit 改后：

```ts
export const LOCAL_FRAGMENT_TARGETS = Object.freeze([
  'main',
  'research',
  'implement',
  'check',
  'frontend',
  'review',
  'all',
] as const)
```

- Edit 改前（LocalFragment.target 注释，唯一命中）：

```ts
  /** 片段目标（main 为主 agent，research/implement/check/frontend 为 executor kind，all 通用）。 */
```

- Edit 改后：

```ts
  /** 片段目标（main 为主 agent，research/implement/check/frontend/review 为 executor kind，all 通用）。 */
```

- Edit 改前（文件名映射，唯一命中）：

```ts
const TARGET_BY_FILE = Object.freeze({
  'main.md': 'main',
  'research.md': 'research',
  'implement.md': 'implement',
  'check.md': 'check',
  'frontend.md': 'frontend',
  'all.md': 'all',
} as const)
```

- Edit 改后：

```ts
const TARGET_BY_FILE = Object.freeze({
  'main.md': 'main',
  'research.md': 'research',
  'implement.md': 'implement',
  'check.md': 'check',
  'frontend.md': 'frontend',
  'review.md': 'review',
  'all.md': 'all',
} as const)
```

- Verify: `grep -c "'review'" packages/core/src/service/local-prompts.ts` 输出 ≥ 2；`grep -c "'review.md': 'review'," packages/core/src/service/local-prompts.ts` 输出 1。

#### 步骤 2.9 doctor-local-prompts.ts —— unknown 文件名 message/hint 补 review

- Covers: AC7
- Target: packages/core/src/service/doctor-local-prompts.ts —— makeIssue 的 message 与 hint 两行
- Edit 改前（唯一命中）：

```ts
          message: `Unknown prompt file name: ${entry.name}; only main/research/implement/check/frontend/all .md files are injected.`,
```

- Edit 改后：

```ts
          message: `Unknown prompt file name: ${entry.name}; only main/research/implement/check/frontend/review/all .md files are injected.`,
```

- Edit 改前（唯一命中）：

```ts
          hint: 'Rename the file to one of main.md, research.md, implement.md, check.md, frontend.md, all.md, or move it elsewhere.',
```

- Edit 改后：

```ts
          hint: 'Rename the file to one of main.md, research.md, implement.md, check.md, frontend.md, review.md, all.md, or move it elsewhere.',
```

- Verify: `grep -c "frontend/review/all" packages/core/src/service/doctor-local-prompts.ts` 输出 1；`grep -c "frontend.md, review.md, all.md" packages/core/src/service/doctor-local-prompts.ts` 输出 1。

#### 步骤 2.10 surface.ts —— 工具描述与 kind 参数描述两处

- Covers: AC7
- Target: packages/core/src/surface.ts —— executor 工具 description 与 kind 参数 description
- Edit 子串替换（唯一命中）：`Dispatch a workloom executor subagent (research/implement/check/frontend)` → `Dispatch a workloom executor subagent (research/implement/check/frontend/review)`
- Edit 改前（唯一命中）：

```ts
  kind: 'Executor role: research, implement, check, or frontend',
```

- Edit 改后：

```ts
  kind: 'Executor role: research, implement, check, frontend, or review',
```

- Verify: `grep -c "research/implement/check/frontend/review" packages/core/src/surface.ts` 输出 1；`grep -c "frontend, or review" packages/core/src/surface.ts` 输出 1。

#### 步骤 2.11 init.js —— 示例模板 subagents 补齐 frontend 与 review

- Covers: AC7
- Target: packages/core/src/domain/init.js —— CONFIG_EXAMPLE_JSON_TEMPLATE 的 subagents 段
- Edit 改前（唯一命中）：

```js
  '  "subagents": {',
  '    "research": { "model": "deepseek-official/deepseek-v4-flash", "effort": "high" },',
  '    "implement": {',
  '      "model": { "dsh": "deepseek-official/deepseek-v4-flash", "pi": "deepseek/deepseek-v4-flash" },',
  '      "effort": "max"',
  '    },',
  '    "check": { "model": "kimi-coding/k3", "effort": "high" }',
  '  },',
```

- Edit 改后：

```js
  '  "subagents": {',
  '    "research": { "model": "deepseek-official/deepseek-v4-flash", "effort": "high" },',
  '    "implement": {',
  '      "model": { "dsh": "deepseek-official/deepseek-v4-flash", "pi": "deepseek/deepseek-v4-flash" },',
  '      "effort": "max"',
  '    },',
  '    "check": { "model": "kimi-coding/k3", "effort": "high" },',
  '    "frontend": { "model": "deepseek-official/deepseek-v4-flash", "effort": "high" },',
  '    "review": { "model": "kimi-coding/k3", "effort": "high" }',
  '  },',
```

- Verify: `grep -c '"review": { "model"' packages/core/src/domain/init.js` 输出 1。

#### 步骤 2.12 build + core 全量绿验证

- Covers: AC1, AC2, AC6, AC7
- Target: packages/core/dist（build 产物，不手改）
- Edit: 无（构建与验证步骤）
- Verify:
  1. `cd packages/core && pnpm run build` exit 0（dist 再生，手写 d.ts 分发）。
  2. `node --test test/executor-context.test.js test/task-store.test.js test/local-prompts.test.js test/doctor.test.js test/init.test.js` 全绿（阶段 1 的 12 红全部转绿）。
  3. `node --test test/*.test.js` 全绿（含 dist-dts 字节一致性）。
  4. `grep -c "review: 'review'" packages/core/dist/domain/executor-context.js` 输出 ≥ 1。
  预期暂态（不处理，阶段 4 消除）：adapter-pi 的 agents 键集合测试自本阶段 build 后进入暂态红（core dist 含 review、pi 角色表未补），本阶段不跑 pi 套件。

#### 步骤 2.13 executor-profiles.test.js —— 画像小节五 kind 口径同步（修订 1 新增）

- Covers: AC7
- Target: packages/core/test/executor-profiles.test.js —— 6 个 strictEqual 全节断言测试的期望输出数组（renderExecutorProfilesSection 遍历 EXECUTOR_KINDS，阶段 2.1 后每节自动多出 review 行，属预期行为，research 01「会话画像每 kind 一行」条目记载）
- Edit 子串替换（预期命中 6——六个测试的期望数组末行均为 frontend 未配置行 + join 收尾）：

改前：
```js
        '  frontend: not configured (inherits parent session model)',
      ].join('\n'),
```
改后：
```js
        '  frontend: not configured (inherits parent session model)',
        '  review: not configured (inherits parent session model)',
      ].join('\n'),
```

- Edit 测试标题（唯一命中）：`test('配置文件为空时四 kind 全部 not configured（未配置回退文案）', () => {` → `test('配置文件为空时五 kind 全部 not configured（未配置回退文案）', () => {`
- Verify: `grep -c "review: not configured" packages/core/test/executor-profiles.test.js` 输出 6；`grep -c "四 kind" packages/core/test/executor-profiles.test.js` 输出 0。
- 说明：session-context.test.js 对画像行用 includes 子串断言（宽容口径），无需改动——停机时的 7 红名单不含它，已实证保持绿。

#### 步骤 2.14 local-prompts.test.js —— 未知文件名报错文案断言补 review.md（修订 1 新增）

- Covers: AC7
- Target: packages/core/test/local-prompts.test.js —— 「未知 .md 文件名 fail loud」测试的正则（该报错文案按 TARGET_BY_FILE 键自动生成，阶段 2.8 后自动含 review.md）
- Edit 改前（唯一命中）：

```js
      /main\.md, research\.md, implement\.md, check\.md, frontend\.md, all\.md/,
```

- Edit 改后：

```js
      /main\.md, research\.md, implement\.md, check\.md, frontend\.md, review\.md, all\.md/,
```

- Verify: `grep -c "frontend\\.md, review\\.md" packages/core/test/local-prompts.test.js` 输出 1。

#### 步骤 2.15 core 全量复跑绿验证（修订 1 新增）

- Covers: AC6, AC7
- Target: 无文件改动（验证步骤）
- Edit: 无
- Verify: `cd packages/core && node --test test/*.test.js` 全绿（711 通过 / 0 失败 = 基线 708 + 本任务新增 3 测试；停机时的 7 红全部转绿）。contract-asset 的 +1 属阶段 5，不计入此处。

### 阶段 3（接缝④ dsh 面）：守卫模块集合化改名（零行为）→ 红 → 绿

#### 步骤 3.1a executor-guard.ts 整文件替换（符号去 research 化 + WRITE_GUARDED_KINDS 集合）

- Covers: AC5, AC7
- Target: packages/adapter-dsh/src/executor-guard.ts（整文件替换；改名映射：ResearchExecutionLike→WriteGuardExecution、ResearchGuardState→WriteGuardState、createResearchGuardState→createWriteGuardState、rebuildResearchChildIds→rebuildWriteGuardChildIds、registerResearchChild→registerWriteGuardChild、researchWriteGuard→confinedWriteGuard、registerResearchGuard→registerWriteGuard、registerResearchChildId→registerWriteGuardChildId；重建过滤改按 WRITE_GUARDED_KINDS 集合；拒绝文案去 research 字样；顺带合并第 38-39 行叠放的双注释）
- Edit 改后全文如下（一字不改；改前 = 当前文件全文 162 行，整文件覆盖）：

```ts
/**
 * adapter-dsh 的受限写执行器 write/edit 范围守卫（机制强制面）。
 *
 * 设计意图：
 * - 受限写 kind（WRITE_GUARDED_KINDS：research/review）只允许写 `<cwd>/.workloom/`
 *   内路径：插件激活时经 ctx.tools.guard 注册一次守卫，按派发登记的子会话身份
 *   识别（executor.ts 派发成功时加入，不移除）；
 * - dsh 重启后内存身份集为空：任一触发点（守卫判定或派发登记）按项目懒
 *   重建——遍历非归档任务全部受守卫 kind 的 dispatches，不区分活跃/已结算；
 *   登记路径缺失集合时先重建再加入新 id，防止新派发先到以空集占位导致
 *   旧子会话失守（等价「插件激活时重建」的持久化语义）；
 * - write/edit 均判 execution.arguments.file_path（DSH 文件工具参数名）；
 *   越界返回英文拒绝串（含路径与允许域，ERR_PREFIX.executor 前缀），其余
 *   调用返回 undefined（放行）；bash 路径绕过记为已知边界，不根治。
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'

import type { Context } from '@deepseek-ai/cordis'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-tools'

import { ERR_PREFIX, EXECUTOR_KINDS, findWorkloomRoot } from '@workloom-ai/core'
/** 受守卫约束的工具名（DSH 文件工具；其余工具一律放行）。 */
const WRITE_TOOL = 'write'
const EDIT_TOOL = 'edit'

/** 项目资产目录名（守卫允许域：<cwd>/.workloom/）。 */
const WORKLOOM_DIR = '.workloom'

/** 任务目录名（重建时扫描项目 tasks 目录下各任务目录的 task.json）。 */
const TASKS_DIR = 'tasks'

/** 归档目录名（重建时排除 archive 目录下的任务）。 */
const ARCHIVE_DIR = 'archive'

/** 受写守卫的 kind 集合（research 写调研产物、review 写审查报告，均限 .workloom/ 内）。 */
export const WRITE_GUARDED_KINDS: readonly string[] = Object.freeze([
  EXECUTOR_KINDS.research,
  EXECUTOR_KINDS.review,
])

/** 守卫入参（官方 ToolExecution；agent 携带会话 cwd 供项目根定位）。 */
export type WriteGuardExecution = ToolExecution

/** 守卫状态：项目根 → 该项目的受限写子代理 id 集（派发登记 + 扫描重建维护）。 */
export interface WriteGuardState {
  byRoot: Map<string, Set<string>>
}
/** 创建空的守卫状态（每插件激活一份；重启后按项目懒重建）。 */
export function createWriteGuardState(): WriteGuardState {
  return { byRoot: new Map() }
}

/**
 * 从项目 task.json dispatches 重建受限写子代理 id 集（纯函数，可单测）。
 * 扫描项目 `<root>/.workloom/tasks/` 下各任务目录的 task.json（archive 目录
 * 排除），收集 dispatches 中 kind ∈ WRITE_GUARDED_KINDS 且 childId 非空的 childId。
 * @param root 项目根
 * @returns 重建的受限写子代理 id 集（可能为空集）
 */
export function rebuildWriteGuardChildIds(root: string): Set<string> {
  const ids: Set<string> = new Set()
  const tasksDir = join(root, WORKLOOM_DIR, TASKS_DIR)
  let entries
  try {
    entries = readdirSync(tasksDir, { withFileTypes: true })
  } catch {
    return ids
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === ARCHIVE_DIR) continue
    const taskJson = join(tasksDir, entry.name, 'task.json')
    let raw
    try {
      raw = readFileSync(taskJson, 'utf8')
    } catch {
      continue
    }
    let task
    try {
      task = JSON.parse(raw)
    } catch {
      continue
    }
    const dispatches = task?.dispatches
    if (!Array.isArray(dispatches)) continue
    for (const dispatch of dispatches) {
      if (
        WRITE_GUARDED_KINDS.includes(dispatch?.kind) &&
        typeof dispatch.childId === 'string' &&
        dispatch.childId !== ''
      ) {
        ids.add(dispatch.childId)
      }
    }
  }
  return ids
}

/**
 * 登记一次受限写 kind 派发成功的子代理 id（不移除）。
 * 集合缺失时先按任务记录重建再加入新 id——防止重启后新派发先到、
 * 以仅含新 id 的空集占位导致懒重建永不触发（旧子会话失守）。
 */
export function registerWriteGuardChild(
  state: WriteGuardState,
  root: string,
  childId: string,
): void {
  let ids = state.byRoot.get(root)
  if (ids === undefined) {
    ids = rebuildWriteGuardChildIds(root)
    state.byRoot.set(root, ids)
  }
  ids.add(childId)
}

/**
 * 组装受限写执行器的 write/edit 守卫（ToolGuard 形状）：仅当 execution.name ∈
 * {write, edit} 且 execution.agent.id 属于该项目受限写子代理集时判定；
 * file_path 按子会话 cwd resolve 后必须落在 `<cwd>/.workloom/` 内，否则返回
 * 英文拒绝串；其余调用返回 undefined（放行）。
 * @param state 守卫状态
 * @returns ToolGuard 形状函数
 */
export function confinedWriteGuard(
  state: WriteGuardState,
): (execution: Readonly<WriteGuardExecution>) => string | undefined {
  return (execution) => {
    if (execution.name !== WRITE_TOOL && execution.name !== EDIT_TOOL) return undefined
    const agentId = execution.agent?.id
    if (agentId === undefined || agentId === '') return undefined
    const cwd = execution.agent?.session?.header?.cwd
    if (cwd === undefined || cwd === '') return undefined
    // 按 cwd 定位项目根：取不到（非 workloom 项目）不判定（放行，非本项目场景）。
    const found = findWorkloomRoot(cwd)
    if (found === null) return undefined
    const root = found.root
    // 重启存活：项目身份集缺失时按任务记录懒重建（不区分活跃/已结算）。
    let ids = state.byRoot.get(root)
    if (ids === undefined) {
      ids = rebuildWriteGuardChildIds(root)
      state.byRoot.set(root, ids)
    }
    if (!ids.has(agentId)) return undefined
    // 越界判定：file_path 按子会话 cwd resolve，必须落在 <cwd>/.workloom/ 内。
    const filePath = (execution.arguments as { file_path?: unknown } | null | undefined)?.file_path
    if (typeof filePath !== 'string' || filePath === '') {
      return `${ERR_PREFIX.executor}: write/edit requires a file_path argument; paths outside the project .workloom/ directory are denied`
    }
    const resolved = resolve(cwd, filePath)
    const domain = join(cwd, WORKLOOM_DIR)
    if (resolved !== domain && !resolved.startsWith(domain + sep)) {
      return `${ERR_PREFIX.executor}: write/edit denied for this workloom executor: ${resolved} is outside the allowed ${domain}/ directory`
    }
    return undefined
  }
}

/* ---- 插件激活时注册一次（模块级状态；executor.ts 接线） ---- */

/** 插件级守卫状态（模块单例；重启后按项目懒重建，不移除登记）。 */
const pluginGuardState = createWriteGuardState()

/** 插件激活时注册受限写守卫（一次；卸载由 ctx.tools.guard 的 disposer 处理）。 */
export function registerWriteGuard(ctx: Context): void {
  ctx.tools.guard(confinedWriteGuard(pluginGuardState))
}

/** 受限写 kind 派发成功时登记子会话 id（executor.ts/failover 派发路径；不移除）。 */
export function registerWriteGuardChildId(root: string, childId: string): void {
  registerWriteGuardChild(pluginGuardState, root, childId)
}
```

- Verify: `grep -c "WRITE_GUARDED_KINDS" packages/adapter-dsh/src/executor-guard.ts` 输出 ≥ 3；`grep -ci "research" packages/adapter-dsh/src/executor-guard.ts` 输出 3（合法出现仅三行：头注释“WRITE_GUARDED_KINDS：research/review”、集合常量注释“research 写调研产物”、集合项 `EXECUTOR_KINDS.research,`；计数 >3 即有旧命名残留，停止上报）。

#### 步骤 3.1b executor.ts / executor-failover.ts / dsh 测试的纯改名同步

- Covers: AC5, AC7
- Target: packages/adapter-dsh/src/executor.ts、src/executor-failover.ts、test/executor.test.js（本步只改名，不改行为；接线条件仍 research-only，3.3 才集合化）
- Edit（executor.ts，三处子串替换，各唯一命中）：
  1. `import { registerResearchChildId, registerResearchGuard } from './executor-guard.js'` → `import { registerWriteGuardChildId, registerWriteGuard } from './executor-guard.js'`
  2. 头注释三行块：

改前：
```ts
 * - research 写守卫（executor-guard.ts）：插件激活时注册一次，research 子代理的
 *   write/edit 只允许落在其 cwd 的 .workloom/ 内（越界拒绝），派发成功时登记
 *   子会话身份，重启后守卫按任务记录懒重建；
```
改后：
```ts
 * - 受限写执行器守卫（executor-guard.ts，WRITE_GUARDED_KINDS = research/review）：
 *   插件激活时注册一次，受限 kind 子代理的 write/edit 只允许落在其 cwd 的
 *   .workloom/ 内（越界拒绝），派发成功时登记子会话身份，重启后守卫按任务记录懒重建；
```
  3. 注册与登记两处调用（各唯一命中）：`  // research 写守卫：插件激活时注册一次（机制强制面：research 只能写 <cwd>/.workloom/）。\n  registerResearchGuard(ctx)` → `  // 受限写执行器守卫：插件激活时注册一次（机制强制面：受限 kind 只能写 <cwd>/.workloom/）。\n  registerWriteGuard(ctx)`；`    registerResearchChildId(root, childId)` → `    registerWriteGuardChildId(root, childId)`
- Edit（executor-failover.ts，两处子串替换，各唯一命中）：
  1. `import { registerResearchChildId } from './executor-guard.js'` → `import { registerWriteGuardChildId } from './executor-guard.js'`
  2. `    registerResearchChildId(context.root, outcome.result.childId)` → `    registerWriteGuardChildId(context.root, outcome.result.childId)`
- Edit（test/executor.test.js，子串替换带预期命中数）：
  1. 导入块（唯一命中）：

改前：
```js
import {
  createResearchGuardState,
  rebuildResearchChildIds,
  registerResearchChild,
  researchWriteGuard,
} from '../dist/executor-guard.js'
```
改后：
```js
import {
  createWriteGuardState,
  rebuildWriteGuardChildIds,
  registerWriteGuardChild,
  confinedWriteGuard,
} from '../dist/executor-guard.js'
```
  2. 调用点改名（导入块已单独处理，此处计数不含导入行）：`createResearchGuardState` 2 处、`rebuildResearchChildIds` 2 处（含测试标题 1 处）、`registerResearchChild(state` 2 处、`researchWriteGuard` 3 处（测试标题 1 + 调用 2；修订 2 更正，原写 2 处漏计一个调用点，终态由「旧符号残留 0 行」门保证）→ 对应新名。
  3. 分段注释：`// ---------- research 写守卫（executor-guard.ts） ----------` → `// ---------- 受限写执行器守卫（executor-guard.ts，WRITE_GUARDED_KINDS） ----------`（1 处）。
  4. 语义注释与标题：`放行域内与非 research` → `放行域内与非受守卫 kind`（1 处）；`    // 非 research 子代理：放行。` → `    // 非受守卫 kind 子代理：放行。`（1 处）；`test('executor-guard 接线：仅 research 派发登记（implement 派发不登记，越界 write 放行）', async () => {` → `test('executor-guard 接线：仅受守卫 kind 派发登记（implement 派发不登记，越界 write 放行）', async () => {`（1 处）。
- Verify: `grep -rn "researchWriteGuard\|registerResearchGuard\|registerResearchChildId\|rebuildResearchChildIds\|createResearchGuardState\|registerResearchChild\b" packages/adapter-dsh/src packages/adapter-dsh/test | grep -v dist` 输出 0 行；`cd packages/adapter-dsh && pnpm run test` 全绿（172 通过，改名零行为变化）。

#### 步骤 3.2 红：labels 双测试扩 review + 新增 review 接线测试 + rebuild fixture 扩展

- Covers: AC4（receipt/labels 面）, AC5
- Target: packages/adapter-dsh/test/executor.test.js —— 两个 label 组装测试、守卫 rebuild 测试、接线测试区
- Edit（label 测试一，改前块唯一命中——以「title 缺省」注释行区分）：

```js
    const cases = [
      ['research', 'Research'],
      ['implement', 'Implement'],
      ['check', 'Check'],
      ['frontend', 'Frontend'],
    ]
    for (const [kind, kindLabel] of cases) {
      // title 缺省（undefined）：回退 task title「Test」
```

改后：

```js
    const cases = [
      ['research', 'Research'],
      ['implement', 'Implement'],
      ['check', 'Check'],
      ['frontend', 'Frontend'],
      ['review', 'Review'],
    ]
    for (const [kind, kindLabel] of cases) {
      // title 缺省（undefined）：回退 task title「Test」
```

- Edit（label 测试二，改前块唯一命中——以 execArgs title 行区分）：

```js
    const cases = [
      ['research', 'Research'],
      ['implement', 'Implement'],
      ['check', 'Check'],
      ['frontend', 'Frontend'],
    ]
    for (const [kind, kindLabel] of cases) {
      await execute(execArgs({ kind, title: 'fix executor label prefix' }), {
```

改后：

```js
    const cases = [
      ['research', 'Research'],
      ['implement', 'Implement'],
      ['check', 'Check'],
      ['frontend', 'Frontend'],
      ['review', 'Review'],
    ]
    for (const [kind, kindLabel] of cases) {
      await execute(execArgs({ kind, title: 'fix executor label prefix' }), {
```

- Edit（两处计数断言，子串替换预期命中 2）：`assert.equal(startCalls.length, 4)` → `assert.equal(startCalls.length, 5)`
- Edit（rebuild 测试 fixture，唯一命中）：

改前：
```js
        dispatches: [
          { kind: 'research', childId: 'res-1' },
          { kind: 'implement', childId: 'impl-1' },
          { kind: 'research' },
        ],
```
改后：
```js
        dispatches: [
          { kind: 'research', childId: 'res-1' },
          { kind: 'implement', childId: 'impl-1' },
          { kind: 'review', childId: 'rev-1' },
          { kind: 'research' },
        ],
```

- Edit（rebuild 期望，唯一命中）：`    assert.deepEqual([...ids].sort(), ['res-1', 'res-2'])` → `    assert.deepEqual([...ids].sort(), ['res-1', 'res-2', 'rev-1'])`
- Edit（新增 review 接线测试 + 后随测试标题更名，锚点唯一命中）：

改前：
```js
test('executor-guard 接线：仅受守卫 kind 派发登记（implement 派发不登记，越界 write 放行）', async () => {
```
改后（新测试插在前，原标题行保留在后）：
```js
test('executor-guard 接线：review 派发登记子会话 id，守卫拒绝越界 write、放行域内', async () => {
  const root = makeProject()
  try {
    const setup = setupExecutor()
    const parent = makeAgent(root)
    await setup.execute(
      execArgs({ kind: 'review', title: 'review guard integration test' }),
      { agent: parent, signal: new AbortController().signal },
    )
    assert.equal(setup.guardRegistrations.length, 1)
    const guard = setup.guardRegistrations[0]
    const reviewChild = { id: 'child-1', session: { header: { cwd: root } } }
    // review 子会话越界 write：拒绝（英文）。
    const denied = guard({
      name: 'write',
      arguments: { file_path: '/tmp/escape.md' },
      agent: reviewChild,
    })
    assert.ok(typeof denied === 'string', 'review child out-of-domain write must be denied')
    assert.match(denied, /denied/)
    // review 子会话域内 write（审查报告路径）：放行。
    assert.equal(
      guard({
        name: 'write',
        arguments: { file_path: '.workloom/tasks/test-task/plan-review.md' },
        agent: reviewChild,
      }),
      undefined,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('executor-guard 接线：仅受守卫 kind 派发登记（implement 派发不登记，越界 write 放行）', async () => {
```

- Verify（红验证）：`cd packages/adapter-dsh && pnpm run test`。预期失败恰 2 个（修订 2 更正，原预期 3 个；逐一对照记入报告）：
  1. 「label 组装：五种 kind 均为 [<KindLabel>] <task title>（title 缺省回退）」（review 标签回退为小写 kind，且 length 4≠5）
  2. 「label 组装：title 传入时五种 kind 均为 [<KindLabel>] <title>」（同因）
  直绿固定（非漏红，分类依据见 Design decisions 9）：①「executor-guard：rebuildWriteGuardChildIds 从任务 task.json dispatches 重建（排除 archive）」（集合化重建已在 3.1a 落地，rev-1 直接纳入）；②「executor-guard 接线：review 派发登记子会话 id，守卫拒绝越界 write、放行域内」——守卫集合有显式登记与懒重建两个入口，3.1a 后懒重建已按 WRITE_GUARDED_KINDS 过滤，review 派发记录先落 task.json，判定时懒重建收编子会话 id，拒绝真实发生；3.3 再把显式登记入口集合化，该集成固定前后两入口皆绿、不区分入口（修订 2 由红名单第 3 条移入）；其余全部测试保持绿。失败集不符：停止上报。
- 备注：两个 label 测试的标题中「四种 kind」字样在本步一并改为「五种 kind」（标题子串替换 `label 组装：四种 kind` → `label 组装：五种 kind`、`title 传入时四种 kind` → `title 传入时五种 kind`，各 1 处；上方 Verify 的红名单按改后标题对照）。

#### 步骤 3.3 绿：KIND_LABELS 与接线集合化

- Covers: AC4, AC5
- Target: packages/adapter-dsh/src/executor-injection.ts（KIND_LABELS）、src/executor.ts（import/条件/删无用导入）、src/executor-failover.ts（同）
- Edit（executor-injection.ts，唯一命中）：

改前：
```ts
export const KIND_LABELS = {
  research: 'Research',
  implement: 'Implement',
  check: 'Check',
  frontend: 'Frontend',
} as const
```
改后：
```ts
export const KIND_LABELS = {
  research: 'Research',
  implement: 'Implement',
  check: 'Check',
  frontend: 'Frontend',
  review: 'Review',
} as const
```

- Edit（executor.ts，按序三处）：
  1. import 行：`import { registerWriteGuardChildId, registerWriteGuard } from './executor-guard.js'` → `import { registerWriteGuard, registerWriteGuardChildId, WRITE_GUARDED_KINDS } from './executor-guard.js'`
  2. 接线条件（唯一命中）：

改前：
```ts
  // research 派发登记守卫身份（按项目；不移除；重启后由守卫按任务记录懒重建）。
  if (params.kind === EXECUTOR_KINDS.research) {
    registerWriteGuardChildId(root, childId)
  }
```
改后：
```ts
  // 受限写 kind 派发登记守卫身份（按项目；不移除；重启后由守卫按任务记录懒重建）。
  if (WRITE_GUARDED_KINDS.includes(params.kind)) {
    registerWriteGuardChildId(root, childId)
  }
```
  3. 删除 core 导入块中的 `  EXECUTOR_KINDS,` 单行（条件替换后该文件不再引用，预期命中 1；不删则 typecheck/lint 报未使用）。
- Edit（executor-failover.ts，按序三处）：
  1. import 行：`import { registerWriteGuardChildId } from './executor-guard.js'` → `import { registerWriteGuardChildId, WRITE_GUARDED_KINDS } from './executor-guard.js'`
  2. 条件（唯一命中）：

改前：
```ts
  if (context.kind === EXECUTOR_KINDS.research) {
    registerWriteGuardChildId(context.root, outcome.result.childId)
  }
```
改后：
```ts
  if (WRITE_GUARDED_KINDS.includes(context.kind)) {
    registerWriteGuardChildId(context.root, outcome.result.childId)
  }
```
  3. 删除 core 导入块中的 `  EXECUTOR_KINDS,` 单行（预期命中 1）。
- Verify: `grep -c "EXECUTOR_KINDS" packages/adapter-dsh/src/executor.ts packages/adapter-dsh/src/executor-failover.ts` 两文件均输出 0；`grep -c "review: 'Review'," packages/adapter-dsh/src/executor-injection.ts` 输出 1。

#### 步骤 3.4 dsh 全量绿验证

- Covers: AC4, AC5
- Target: 无文件改动（验证步骤）
- Edit: 无
- Verify: `cd packages/adapter-dsh && pnpm run test` 全绿（173 通过 = 基线 172 + 新增接线测试 1；阶段 3.2 的 3 红全部转绿）。

### 阶段 4（接缝④ pi 面）：写范围扩展改名（零行为）→ 红 → 绿

#### 步骤 4.1a assets/research-scope.ts 改名 write-scope.ts 并泛化文案

- Covers: AC5
- Target: packages/adapter-pi/assets/research-scope.ts → packages/adapter-pi/assets/write-scope.ts（先 `git mv packages/adapter-pi/assets/research-scope.ts packages/adapter-pi/assets/write-scope.ts`，再对新路径做下列替换）
- Edit（头注释块整体替换，唯一命中）：

改前：
```ts
/**
 * research executor 的 write/edit 范围限定扩展（随 adapter-pi 包发布）。
 *
 * 设计意图：
 * - 同名覆盖（实证 2026-09-03：child pi 带 `-t write,edit` 时
 *   registerTool({name: 'write'}) 完整替换内置 write，allow 未含时完全不可见）：
 *   research 派发时经 `-e` 加载本扩展，write/edit 被本扩展的路径受限副本覆盖，
 *   越界（<cwd>/.workloom/ 外）抛英文错误，域内落盘/替换行为与内置一致；
 * - 与 DSH 侧 executor-guard 的 researchWriteGuard 同语义：write/edit 只允许
 *   落在子会话 cwd 的 .workloom/ 目录内；bash 路径绕过记为已知边界，不根治；
 * - 只注册 write/edit 两个副本（同名覆盖内置），read/bash 等其余工具保持内置；
 *   -t allow 未含 write/edit 时本扩展注册的工具同样不可见（allow 清单治理）。
 */
```

改后：
```ts
/**
 * 受限写执行器（research/review）的 write/edit 范围限定扩展（随 adapter-pi 包发布）。
 *
 * 设计意图：
 * - 同名覆盖（实证 2026-09-03：child pi 带 `-t write,edit` 时
 *   registerTool({name: 'write'}) 完整替换内置 write，allow 未含时完全不可见）：
 *   受限写 kind 派发时经 `-e` 加载本扩展，write/edit 被本扩展的路径受限副本覆盖，
 *   越界（<cwd>/.workloom/ 外）抛英文错误，域内落盘/替换行为与内置一致；
 * - 与 DSH 侧 executor-guard 的 confinedWriteGuard 同语义：write/edit 只允许
 *   落在子会话 cwd 的 .workloom/ 目录内；bash 路径绕过记为已知边界，不根治；
 * - 只注册 write/edit 两个副本（同名覆盖内置），read/bash 等其余工具保持内置；
 *   -t allow 未含 write/edit 时本扩展注册的工具同样不可见（allow 清单治理）。
 */
```

- Edit（四处子串替换，各唯一命中）：
  1. `${toolName} denied for the research executor:` → `${toolName} denied for this workloom executor:`
  2. write 工具 description：`'Write content to a file. Restricted to the project .workloom/ directory for the research executor; paths outside it are denied.',` → `'Write content to a file. Restricted to the project .workloom/ directory for this executor; paths outside it are denied.',`
  3. edit 工具 description：`'Edit a file using exact text replacement. Restricted to the project .workloom/ directory for the research executor; paths outside it are denied.',` → `'Edit a file using exact text replacement. Restricted to the project .workloom/ directory for this executor; paths outside it are denied.',`
  4. 工厂函数签名与注释：`/** 扩展默认导出（pi 扩展工厂：注册受限的 write/edit 副本）。 */\nexport default function researchScope(pi: ExtensionAPI): void {` → `/** 扩展默认导出（pi 扩展工厂：注册受限的 write/edit 副本）。 */\nexport default function writeScope(pi: ExtensionAPI): void {`
- Verify: `grep -ci "research" packages/adapter-pi/assets/write-scope.ts` 输出 1（仅头注释“受限写执行器（research/review）”行）；`ls packages/adapter-pi/assets/` 不含 research-scope.ts。

#### 步骤 4.1b executor.ts 扩展常量与测试同步改名（加载条件本步不动）

- Covers: AC5
- Target: packages/adapter-pi/src/executor.ts、packages/adapter-pi/test/executor.test.ts
- Edit（executor.ts 常量块，唯一命中）：

改前：
```ts
/** research 子代理的 write/edit 范围限定扩展（随包发布，-e 显式加载用绝对路径）。 */
const RESEARCH_SCOPE_EXTENSION = fileURLToPath(
  new URL('../assets/research-scope.ts', import.meta.url),
)
```
改后：
```ts
/** 受限写 kind（research/review）的 write/edit 范围限定扩展（随包发布，-e 显式加载用绝对路径）。 */
const WRITE_SCOPE_EXTENSION = fileURLToPath(
  new URL('../assets/write-scope.ts', import.meta.url),
)
```

- Edit（executor.ts 加载行，唯一命中；条件保持 research-only，4.3 才扩）：
`  if (params.kind === 'research') loadExtensions.push(RESEARCH_SCOPE_EXTENSION)` → `  if (params.kind === 'research') loadExtensions.push(WRITE_SCOPE_EXTENSION)`
- Edit（executor.test.ts，三处子串替换）：
  1. `import researchScope from '../assets/research-scope.ts'` → `import writeScope from '../assets/write-scope.ts'`（1 处）
  2. `test('research-scope 扩展：同名 write/edit 副本，域内成功、越界拒绝（英文）', async () => {` → `test('write-scope 扩展：同名 write/edit 副本，域内成功、越界拒绝（英文）', async () => {`（1 处）
  3. `  researchScope(mockPi)` → `  writeScope(mockPi)`（1 处）；`mkdtempSync(join(tmpdir(), 'pi-research-scope-'))` → `mkdtempSync(join(tmpdir(), 'pi-write-scope-'))`（1 处）
- Verify: `grep -rn "research-scope\|researchScope\|RESEARCH_SCOPE_EXTENSION" packages/adapter-pi/src packages/adapter-pi/test packages/adapter-pi/assets` 输出 0 行；`cd packages/adapter-pi && bun test test/executor.test.ts` 全绿（改名零行为变化）。

#### 步骤 4.2 红：labels 五元组 + agents review 角色固定 + TC3 片段 review 用例（直绿）

- Covers: AC1, AC4, AC7
- Target: packages/adapter-pi/test/pi-args.test.ts、test/agents.test.ts、test/executor.test.ts
- Edit（pi-args.test.ts 标签测试，唯一命中）：

改前：
```ts
test('buildChildPiArgs: title 语义化（四种 kind 标签）', () => {
  for (const [kind, label] of [
    ['research', 'Research'],
    ['implement', 'Implement'],
    ['check', 'Check'],
    ['frontend', 'Frontend'],
  ] as const) {
```
改后：
```ts
test('buildChildPiArgs: title 语义化（五种 kind 标签）', () => {
  for (const [kind, label] of [
    ['research', 'Research'],
    ['implement', 'Implement'],
    ['check', 'Check'],
    ['frontend', 'Frontend'],
    ['review', 'Review'],
  ] as const) {
```

- Edit（agents.test.ts 文件末尾追加新测试；锚点为 A 任务交付的末测试收尾块，唯一命中）：

改前：
```ts
  const implement = EXECUTOR_AGENT_DEFINITIONS[EXECUTOR_KINDS.implement]
  assert.ok(implement !== undefined)
  assert.ok(implement.systemPrompt.includes('Read the plan (plan.md) first'))
  assert.ok(implement.systemPrompt.includes('prescriptive'))
})
```
改后（原块保留，其后追加）：
```ts
  const implement = EXECUTOR_AGENT_DEFINITIONS[EXECUTOR_KINDS.implement]
  assert.ok(implement !== undefined)
  assert.ok(implement.systemPrompt.includes('Read the plan (plan.md) first'))
  assert.ok(implement.systemPrompt.includes('prescriptive'))
})

test('agent definitions: review 角色审计划、只写报告、不碰计划与代码', () => {
  const review = EXECUTOR_AGENT_DEFINITIONS[EXECUTOR_KINDS.review]
  assert.ok(review !== undefined, 'missing definition for review')
  assert.ok(review.systemPrompt.includes('workloom review executor'))
  assert.ok(review.systemPrompt.includes('Read the plan (plan.md) first'))
  assert.ok(review.systemPrompt.includes('belongs to the check executor'))
  assert.ok(review.systemPrompt.includes('plan-review.md'))
  assert.ok(review.systemPrompt.includes('Never edit the plan, the PRD, or any code file'))
  assert.ok(review.systemPrompt.includes('P0/P1/P2'))
})
```

- Edit（executor.test.ts 片段夹具与 TC3 循环，各唯一命中）：

改前：
```ts
  writeFileSync(join(promptsDir, 'implement.md'), 'IMPLEMENT-LSP-FRAGMENT')
  writeFileSync(join(promptsDir, 'check.md'), 'CHECK-LSP-FRAGMENT')
  writeFileSync(join(promptsDir, 'frontend.md'), 'FRONTEND-LSP-FRAGMENT')
```
改后：
```ts
  writeFileSync(join(promptsDir, 'implement.md'), 'IMPLEMENT-LSP-FRAGMENT')
  writeFileSync(join(promptsDir, 'check.md'), 'CHECK-LSP-FRAGMENT')
  writeFileSync(join(promptsDir, 'frontend.md'), 'FRONTEND-LSP-FRAGMENT')
  writeFileSync(join(promptsDir, 'review.md'), 'REVIEW-LSP-FRAGMENT')
```

改前：
```ts
test('buildExecutorPromptWithPi: 命中时 check/frontend kind 各自注入对应片段（TC3）', () => {
  const root = makeLspFragmentsRoot()
  try {
    for (const [kind, mark] of [
      ['implement', 'IMPLEMENT-LSP-FRAGMENT'],
      ['check', 'CHECK-LSP-FRAGMENT'],
      ['frontend', 'FRONTEND-LSP-FRAGMENT'],
    ] as const) {
```
改后：
```ts
test('buildExecutorPromptWithPi: 命中时 check/frontend/review kind 各自注入对应片段（TC3）', () => {
  const root = makeLspFragmentsRoot()
  try {
    for (const [kind, mark] of [
      ['implement', 'IMPLEMENT-LSP-FRAGMENT'],
      ['check', 'CHECK-LSP-FRAGMENT'],
      ['frontend', 'FRONTEND-LSP-FRAGMENT'],
      ['review', 'REVIEW-LSP-FRAGMENT'],
    ] as const) {
```

- Verify（红验证）：`cd packages/adapter-pi && bun test test/agents.test.ts test/pi-args.test.ts test/executor.test.ts`。预期失败恰 5 个（逐一对照记入报告）：
  1. 「agent definitions: kinds match EXECUTOR_KINDS and carry full role copy」（键集合 4 ≠ 5，且 review 定义缺失；暂态红自阶段 2 build 起，本阶段显式取证）
  2. 「agent definitions: systemPrompt describes pointer-based context, not the retired inline mechanism」（遍历 kinds 取 review 定义失败）
  3. 「agent definitions: role copy reads the merged plan.md; stale artifact names are gone」（同因）
  4. 「agent definitions: review 角色审计划、只写报告、不碰计划与代码」（新增，定义缺失）
  5. 「buildChildPiArgs: title 语义化（五种 kind 标签）」（KIND_LABELS 缺 Review，标题退化为 `[review]`）
  直绿固定（非漏红）：TC3 片段 review 用例（core dist 的 review kind 与 local-prompts review 目标已在阶段 2 落地，片段注入即刻可用）；其余测试保持绿。失败集不符：停止上报。

#### 步骤 4.3 绿：review 角色数据 + 标签 + 扩展加载条件

- Covers: AC1, AC4, AC5
- Target: packages/adapter-pi/src/agent-definitions.ts、src/pi-args.ts、src/executor.ts
- Edit（agent-definitions.ts，在 check 段收尾与 frontend 段开头之间插入 review 段；锚点唯一命中）：

改前：
```ts
You are done when the issues are fixed and verified. Do not dispatch subagents: nested delegation is disabled for you.`,
  },
  frontend: {
```
改后：
```ts
You are done when the issues are fixed and verified. Do not dispatch subagents: nested delegation is disabled for you.`,
  },
  review: {
    description: 'Review executor: audit the task plan against the PRD and the real code before implementation',
    systemPrompt: `You are the workloom review executor. Audit the plan before implementation starts; code review after implementation belongs to the check executor.

Your prompt carries the task context: the PRD (with its acceptance criteria) inline, plus pointers to the plan and referenced files. Read the plan (plan.md) first, then verify its anchors against the actual code before judging; consult every other pointer only when the current audit step needs it. Do not rely on summaries.

Audit in four dimensions — plan conformance, PRD fidelity, feasibility against the real code, and approach quality — and classify every finding P0/P1/P2. Write the report to plan-review.md in the task directory, appending a new section per round; every finding carries its severity, the plan anchor, and a fix suggestion.

Never edit the plan, the PRD, or any code file: your only written artifact is the review report inside .workloom/.

You are done when the report is complete and every finding carries its severity, anchor, and fix suggestion. Do not dispatch subagents: nested delegation is disabled for you.`,
  },
  frontend: {
```

- Edit（pi-args.ts KIND_LABELS，唯一命中）：

改前：
```ts
const KIND_LABELS = {
  research: 'Research',
  implement: 'Implement',
  check: 'Check',
  frontend: 'Frontend',
} as const
```
改后：
```ts
const KIND_LABELS = {
  research: 'Research',
  implement: 'Implement',
  check: 'Check',
  frontend: 'Frontend',
  review: 'Review',
} as const
```

- Edit（executor.ts 扩展加载条件，唯一命中）：
`  if (params.kind === 'research') loadExtensions.push(WRITE_SCOPE_EXTENSION)` → `  if (params.kind === 'research' || params.kind === 'review') loadExtensions.push(WRITE_SCOPE_EXTENSION)`
- Edit（agents.test.ts 头注释去硬编码计数，唯一命中）：
` * agent 定义数据单测：四个 kind 与 EXECUTOR_KINDS 一致、文案完整` → ` * agent 定义数据单测：kind 键集合与 EXECUTOR_KINDS 一致、文案完整`
- Verify: `grep -c "review: {" packages/adapter-pi/src/agent-definitions.ts` 输出 1；`grep -c "review: 'Review'," packages/adapter-pi/src/pi-args.ts` 输出 1；`grep -c "四个 kind" packages/adapter-pi/test/agents.test.ts` 输出 0。

#### 步骤 4.4 pi 全量绿验证

- Covers: AC1, AC4, AC5
- Target: 无文件改动（验证步骤）
- Edit: 无
- Verify: `cd packages/adapter-pi && bun test test/*.test.ts` 全绿（199 通过 = 基线 198 + 新增 review 角色测试 1；阶段 4.2 的 5 红全部转绿）。

### 阶段 5（接缝⑤ assets 契约面）：contract 测试红 → workflow 1.4 review 段绿

#### 步骤 5.1 contract-asset.test.js 文件末尾追加 review 指引段固定测试

- Covers: AC3
- Target: packages/core/test/contract-asset.test.js —— 文件末尾（C 任务交付的末测试之后）
- Edit 改前（文件末尾锚点，唯一命中）：

```js
  assert.ok(
    planRef.includes("every AC in prd.md appears in at least one step's Covers list"),
    'plan-authoring 完成判据缺 AC 覆盖要求',
  )
})
```

- Edit 改后（原块保留，其后追加）：

```js
  assert.ok(
    planRef.includes("every AC in prd.md appears in at least one step's Covers list"),
    'plan-authoring 完成判据缺 AC 覆盖要求',
  )
})

test('契约 1.4 含 review 派发指引段（关键句逐字）', () => {
  const [err, contract] = parseContract(readFileSync(assetPath, 'utf8'))
  assert.equal(err, null)
  const reviewBody = contract.steps.find((step) => step.id === '1.4').body
  assert.ok(reviewBody.includes('Plan review dispatch (default on)'), '1.4 缺 review 派发段首句')
  assert.ok(
    reviewBody.includes('dispatch the review executor with `workloom_execute` (kind: review)'),
    '1.4 缺 review 派发指令',
  )
  assert.ok(reviewBody.includes('plan-review.md'), '1.4 缺审查报告文件约定')
  assert.ok(reviewBody.includes('may explicitly skip the review'), '1.4 缺对齐轮显式跳过语义')
  assert.ok(
    reviewBody.includes('continuing the same review child session'),
    '1.4 缺同子会话续接复审要求',
  )
  assert.ok(reviewBody.includes('three rounds are reached'), '1.4 缺三轮上限')
  assert.ok(
    reviewBody.includes('review report and the disposal of every finding are part of the review package'),
    '1.4 缺报告与处置进审阅包句',
  )
})
```

- Verify（红验证）：`cd packages/core && node --test test/contract-asset.test.js`，预期恰 1 红：「契约 1.4 含 review 派发指引段（关键句逐字）」（assets 未改），其余 39 个保持绿。

#### 步骤 5.2 workflow.md 1.4 插入 review 派发指引段

- Covers: AC3
- Target: packages/assets/workflow/workflow.md —— 1.4 正文，Authoring bar 段与规模自检段之间
- Edit 改前（跨段锚点，唯一命中）：

```md
The full standard and the plan.md document shape live in the workloom-alignment skill's references/plan-authoring.md — read it before authoring.

Run the scale self-check while assembling the package:
```

- Edit 改后（在两段之间插入独立新段）：

```md
The full standard and the plan.md document shape live in the workloom-alignment skill's references/plan-authoring.md — read it before authoring.

Plan review dispatch (default on): once plan.md is authored or revised, dispatch the review executor with `workloom_execute` (kind: review) before assembling the package — it audits the plan against prd.md and the real code and writes its findings to plan-review.md in the task directory. The final alignment round may explicitly skip the review for a task; record the skip in prd.md. Dispose of every finding before the package: P0 must be resolved (fix the plan, or take prd-level findings to the user), P1 fixed or recorded with a reason, P2 all fixed. After revising the plan, re-run the review by continuing the same review child session (`continue_executor`), looping until no P0/P1 finding remains or three rounds are reached; leftover findings then enter the package with their disposal notes for the user to decide. The review report and the disposal of every finding are part of the review package.

Run the scale self-check while assembling the package:
```

- Verify: `grep -c "Plan review dispatch (default on)" packages/assets/workflow/workflow.md` 输出 1；front-matter `version: 24` 不变（纯正文增补，不升协议版本）。

#### 步骤 5.3 契约测试绿验证

- Covers: AC3
- Target: 无文件改动（验证步骤）
- Edit: 无
- Verify: `cd packages/core && node --test test/contract-asset.test.js` 全绿（40 通过 / 0 失败，阶段 5.1 的 1 红转绿）。

### 阶段 6：清扫与全量验证

#### 步骤 6.1 旧口径清扫

- Covers: AC1, AC7
- Target: 无文件改动（清扫步骤）
- Edit: 无
- Verify: 五条命令预期均 0 命中（任何命中即漏改，回对应阶段修复后重扫）：
  1. `grep -rn "research/implement/check/frontend" packages/*/src packages/*/test --include="*.ts" --include="*.js" | grep -v dist | grep -v "frontend/review"`（旧四 kind 枚举残留即漏改；合法的五 kind 列表 frontend/review 被第二级过滤排除）
  2. `grep -rn "四种 kind\|四 kind\|四种角色\|四个 kind" packages/core/test packages/adapter-dsh/test packages/adapter-pi/test`
  3. `grep -rn "for the research executor" packages --exclude-dir=node_modules | grep -v dist`
  4. `grep -rn "research-scope\|researchScope\|RESEARCH_SCOPE_EXTENSION" packages/adapter-pi`
  5. `grep -rn "researchWriteGuard\|registerResearchGuard\|registerResearchChildId\|rebuildResearchChildIds\|createResearchGuardState\|ResearchGuardState\|ResearchExecutionLike" packages/adapter-dsh/src packages/adapter-dsh/test`

#### 步骤 6.1a 11 处旧文案注释补齐五 kind 口径（修订 3 新增）

- Covers: AC7
- Target: 9 个文件的纯注释文案（JSDoc 与文件头，无行为影响）：`research/implement/check/frontend` → `research/implement/check/frontend/review`
- Edit 按文件替换表（子串替换，命中数为预期值，命中数不符即停止上报）：

| 文件 | 预期命中 |
| --- | --- |
| packages/core/src/domain/config.js | 3 |
| packages/core/src/domain/executor-profiles.js | 1 |
| packages/core/src/domain/executor-context.d.ts | 1（第 38 行 BuildExecutorPromptParams.kind 注释） |
| packages/core/src/domain/executor-capacity.d.ts | 1 |
| packages/core/src/service/local-prompts.ts | 1（仅第 17 行文件头注释——同文件 38/53 行已是五 kind 文案，禁止全文件盲替换） |
| packages/adapter-dsh/src/executor-injection.ts | 1 |
| packages/adapter-dsh/src/executor.ts | 1（第 5 行文件头注释） |
| packages/adapter-pi/src/pi-args.ts | 1 |
| packages/adapter-pi/src/pi-child-registry.ts | 1 |

- Verify:
  1. 步骤 6.1 五条清扫全部重跑，均 0 命中。
  2. `grep -rn "frontend/review/review" packages/*/src | grep -v dist` 输出 0 行（防双重替换）。
  3. 步骤 6.2 全量重跑（lint/typecheck/build exit 0；core 712、dsh 173、pi 199、assets 27 全绿；dist 三项 grep 命中）——d.ts 注释变更随 build 分发，字节一致性由 core 套件覆盖。

#### 步骤 6.2 全量验证

- Covers: AC6
- Target: 无文件改动（验证步骤）
- Edit: 无
- Verify: 依次运行，预期全绿：
  1. `pnpm lint`（exit 0）
  2. `pnpm -r typecheck`（exit 0）
  3. `pnpm -r build`（exit 0；core/adapter-dsh dist 再生，pi sync-skills 重建）
  4. `cd packages/core && node --test test/*.test.js`（全绿）
  5. `cd packages/adapter-dsh && node --test 'test/*.test.js'`（全绿，173 通过）
  6. `cd packages/adapter-pi && bun test test/*.test.ts`（全绿，199 通过）
  7. `cd packages/assets && pnpm run test`（全绿）
  8. dist 同步三项：`grep -c "review: 'review'" packages/core/dist/domain/executor-context.js` ≥ 1；`grep -c "WRITE_GUARDED_KINDS" packages/adapter-dsh/dist/executor-guard.js` ≥ 1；`grep -c "review.md" packages/core/dist/service/local-prompts.js` ≥ 1
  9. 类型复核以命令行为准（第 2 条已覆盖）；worktree 路径的 lsp_diagnostics 存在 @types/node 解析环境性误报，不作为判据（沿 C 任务修订 2 口径）。

#### 步骤 6.3 报告

- Covers: (internal)
- Target: 无文件改动（报告步骤）
- Edit: 无
- Verify: 报告按固定格式返回：改动文件清单（预期源文件 26 个：core src 7——executor-context.js/.d.ts、task-store.js、local-prompts.ts、doctor-local-prompts.ts、surface.ts、init.js；core 测试 6——executor-context/task-store/local-prompts/doctor/init/contract-asset；assets 1——workflow.md；dsh src 4——executor-guard.ts、executor.ts、executor-failover.ts、executor-injection.ts + dsh 测试 1；pi src 3——agent-definitions.ts、pi-args.ts、executor.ts + pi assets 1（write-scope.ts 改名）+ pi 测试 3——agents/pi-args/executor；另有 core 与 dsh 的 dist 再生）、各阶段红绿证据（阶段 1 的 12 红、阶段 3 的 3 红、阶段 4 的 5 红、阶段 5 的 1 红，与预期逐一对照）、直绿固定与暂态红清单核对、清扫五条结果、全量验证输出摘要、剩余风险。dist 与源码同 commit、push、repin 与重启由主会话在交付环节处理；执行器不 commit、不 push。

## 修订记录

- 修订 1（主会话，implement 停机于 2.12 后处置）：三处更正。① executor-profiles.test.js 未列入计划——renderExecutorProfilesSection 遍历 EXECUTOR_KINDS 渲染画像小节，阶段 2.1 后 6 个测试的全节 strictEqual 期望各多一行 review（行为正确；research 01「会话画像每 kind 一行」已记载该自动行为，计划编制红绿名单时漏掉了这个消费者）——新增步骤 2.13（命中 6 的统一替换 + 标题四→五 kind）；② local-prompts.test.js「未知 .md 文件名 fail loud」的正则固定旧六文件文案——该文案按 TARGET_BY_FILE 键自动生成，2.8 后自动含 review.md，步骤 2.9 只同步了 doctor 文案、漏了这条既有断言——新增步骤 2.14；③ 步骤 2.5 Verify 计数算术笔误——`EXECUTOR_KINDS.review]:` 模式同时命中 JSONL_FILES 映射行，预期 1 更正为 2（步骤 2.6 的总数预期 3 恰好印证终态正确，执行器差异记录 1 的口径予以追认）。7 红处置 = 更新断言为五 kind 口径（采纳执行器建议），复跑承载于新增步骤 2.15（预期 711 通过 / 0 失败）。教训（B 收口时补进 red-green-expectations spec 条目）：消费者追踪必须覆盖两类隐性消费者——由枚举常量渲染或生成的输出（画像小节、自动生成的报错文案），以及固定这些输出的全节断言测试；只列常量的直接引用点不够。
- 修订 2（主会话，implement 停机于 3.2 后处置）：两处更正 + 一处追认。① 3.2 红名单由 3 条更正为 2 条，第 3 条（review 接线测试）移入直绿固定——原预判只推演了显式登记一个入口（3.3 前接线条件仍 research-only），漏了守卫懒重建入口在 3.1a 已按 WRITE_GUARDED_KINDS 集合过滤：review 派发记录先落 task.json，判定时懒重建收编子会话 id，拒绝真实发生、测试为绿。这也是 Design decisions 9（已把 dsh 守卫 review 覆盖用例归入直绿固定）与 3.2 红名单的自相矛盾，更正后以步骤清单为准；② 3.1b 的 researchWriteGuard 改名计数由 2 处更正为 3 处（标题 1 + 调用 2），与 2.5 同属算术笔误，终态由「旧符号残留 0 行」清扫门保证；③ 执行器的停机判断与机制分析予以追认（绿是真实拒绝取得的，非跳过、非弱化断言）。教训合并：红名单推演必须穷尽机制的全部入口（集合维护 = 显式登记 + 懒重建两个入口），与修订 1 的「枚举生成物也是消费者」一并写入 red-green-expectations spec 条目。
- 修订 3（主会话，implement 停机于 6.1 后处置）：清扫第 1 条命中 11 处，为 9 个文件的 JSDoc/文件头纯注释旧四 kind 文案（executor-context.d.ts 第 38 行属步骤 2.2 真实漏改——2.2 只改了两处 Record 联合与 stats 注释；其余 8 处所在文件不在计划编辑清单内），裁决采纳执行器建议全部补齐五 kind 口径，新增步骤 6.1a（按文件命中数表 + local-prompts.ts 单行定向约束防双重替换 + 重扫五条 + 6.2 全量重跑）。同步追认执行器两项口径：① 实际源文件数 27 = 计划 26 + 修订 1 新增 executor-profiles.test.js；② 步骤 2.14 的 Verify grep 因反斜杠转义在普通模式不匹配，改用 -F 固定串复核成立，取证口径有效。教训归并：Design decisions 6 的「kind 文案枚举副本清单」本身是枚举产物，会有记忆盲区；清扫门才是文案面的全集判定，注释与描述位一律以清扫结果为准补齐。
