/**
 * workflow-contract 模块单测：front-matter、tag 块、步骤节、warnings。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { parseContract, WorkflowContractError } from '../src/legacy/workflow-contract.js'

/** 构造一份全部 states 都有对应 tag 块的合法文档。 */
function makeFullDoc() {
  return `---
version: 1
states:
  - planning
  - in_progress
  - completed
---

# 工作流

## 总览

#### 1.0 创建任务
第一行正文
第二行正文

[workflow-state:planning]
规划阶段指引：先评审再动手
[/workflow-state:planning]

#### 2.3 实现任务
实现阶段正文

[workflow-state:in_progress]
执行阶段指引
[/workflow-state:in_progress]

#### 3.0 收尾
收尾正文

[workflow-state:completed]
收尾阶段指引
[/workflow-state:completed]
`
}

/** 构造含 norms 块（置于步骤之间，验证不混入）的合法文档。 */
function makeDocWithNorms() {
  return `---
version: 1
states:
  - planning
  - in_progress
  - completed
---

# 工作流

#### 1.0 创建任务
第一行正文
第二行正文

[workflow-norms]
规范第一行
规范第二行
[/workflow-norms]

[workflow-state:planning]
规划阶段指引
[/workflow-state:planning]

#### 2.3 实现任务
实现阶段正文

[workflow-state:in_progress]
执行阶段指引
[/workflow-state:in_progress]
`
}

test('正常解析：version/states/块/步骤 齐全', () => {
  const [err, contract] = parseContract(makeFullDoc())
  assert.equal(err, null)
  assert.equal(contract.version, 1)
  assert.deepEqual(contract.states, ['planning', 'in_progress', 'completed'])
  assert.equal(contract.breadcrumbs.get('planning'), '规划阶段指引：先评审再动手')
  assert.equal(contract.breadcrumbs.get('in_progress'), '执行阶段指引')
  assert.equal(contract.breadcrumbs.get('completed'), '收尾阶段指引')
  assert.deepEqual(contract.warnings, [])
})

test('步骤提取：多节、标题带编号、正文到 tag 块前截断', () => {
  const [err, contract] = parseContract(makeFullDoc())
  assert.equal(err, null)
  assert.equal(contract.steps.length, 3)
  assert.deepEqual(contract.steps[0], {
    id: '1.0',
    title: '创建任务',
    body: '第一行正文\n第二行正文',
  })
  assert.deepEqual(contract.steps[1], {
    id: '2.3',
    title: '实现任务',
    body: '实现阶段正文',
  })
  assert.deepEqual(contract.steps[2], {
    id: '3.0',
    title: '收尾',
    body: '收尾正文',
  })
})

test('front-matter 缺失报错', () => {
  const [err, contract] = parseContract('# 工作流\n')
  assert.ok(err instanceof WorkflowContractError)
  assert.equal(contract, null)
})

test('front-matter 非法报错（version/states）', () => {
  assert.ok(
    parseContract('---\nversion: 0\nstates: [planning]\n---\n')[0] instanceof WorkflowContractError,
  )
  assert.ok(
    parseContract('---\nversion: "1"\nstates: [planning]\n---\n')[0] instanceof
      WorkflowContractError,
  )
  assert.ok(parseContract('---\nversion: 1\nstates: 3\n---\n')[0] instanceof WorkflowContractError)
  assert.ok(
    parseContract('---\nversion: 1\nstates: [planning, 3]\n---\n')[0] instanceof
      WorkflowContractError,
  )
})

test('tag 不闭合报错', () => {
  const doc = `---
version: 1
states: [planning]
---

[workflow-state:planning]
没有闭合的块
`
  const [err, contract] = parseContract(doc)
  assert.ok(err instanceof WorkflowContractError)
  assert.equal(contract, null)
})

test('重复 status 报错（不允许歧义）', () => {
  const doc = `---
version: 1
states: [planning]
---

[workflow-state:planning]
第一块
[/workflow-state:planning]

[workflow-state:planning]
第二块
[/workflow-state:planning]
`
  const [err, contract] = parseContract(doc)
  assert.ok(err instanceof WorkflowContractError)
  assert.equal(contract, null)
})

test('开闭 tag 状态不一致报错', () => {
  const doc = `---
version: 1
states: [planning]
---

[workflow-state:planning]
指引
[/workflow-state:in_progress]
`
  const [err, contract] = parseContract(doc)
  assert.ok(err instanceof WorkflowContractError)
  assert.equal(contract, null)
})

test('步骤 id 重复报错', () => {
  const doc = `---
version: 1
states: []
---

#### 1.0 第一步
正文一

#### 1.0 重复步骤
正文二
`
  const [err, contract] = parseContract(doc)
  assert.ok(err instanceof WorkflowContractError)
  assert.equal(contract, null)
})

test('states 声明但缺块的 warnings（允许指引后补）', () => {
  const doc = `---
version: 1
states:
  - planning
  - completed
---

[workflow-state:planning]
规划指引
[/workflow-state:planning]
`
  const [err, contract] = parseContract(doc)
  assert.equal(err, null)
  assert.deepEqual(contract.warnings, [
    'status completed is declared but has no corresponding tag block',
  ])
})

test('tag 块状态未在 states 声明报错（状态机对称封闭）', () => {
  const doc = `---
version: 1
states:
  - planning
---

[workflow-state:archived]
未声明状态
[/workflow-state:archived]
`
  const [err, contract] = parseContract(doc)
  assert.ok(err instanceof WorkflowContractError)
  assert.match(err.message, /not declared in states/)
  assert.equal(contract, null)
})

test('tag 嵌套与多余闭合 tag 报错', () => {
  const nested = `---
version: 1
states:
  - planning
---

[workflow-state:planning]
[workflow-state:planning]
[/workflow-state:planning]
[/workflow-state:planning]
`
  const [err1] = parseContract(nested)
  assert.ok(err1)
  assert.match(err1.message, /must not be nested/)

  const strayClose = `---
version: 1
states:
  - planning
---

[/workflow-state:planning]
`
  const [err2] = parseContract(strayClose)
  assert.ok(err2)
  assert.match(err2.message, /stray closing tag/)
})

test('norms 块解析：多行内容保留、首尾空白清理', () => {
  const [err, contract] = parseContract(makeDocWithNorms())
  assert.equal(err, null)
  assert.equal(contract.norms, '规范第一行\n规范第二行')
})

test('无 norms 块的旧契约：norms 为 null 且既有字段不受影响', () => {
  const [err, contract] = parseContract(makeFullDoc())
  assert.equal(err, null)
  assert.equal(contract.norms, null)
  assert.deepEqual(contract.warnings, [])
  assert.equal(contract.steps.length, 3)
  assert.equal(contract.breadcrumbs.get('planning'), '规划阶段指引：先评审再动手')
})

test('norms 块内容不混入步骤正文与 state 块', () => {
  const [err, contract] = parseContract(makeDocWithNorms())
  assert.equal(err, null)
  assert.equal(contract.steps[0].body, '第一行正文\n第二行正文')
  assert.equal(contract.steps[1].body, '实现阶段正文')
  assert.equal(contract.breadcrumbs.get('planning'), '规划阶段指引')
})

test('norms 块未闭合报错', () => {
  const doc = `---
version: 1
states: []
---

[workflow-norms]
没有闭合的规范
`
  const [err, contract] = parseContract(doc)
  assert.ok(err instanceof WorkflowContractError)
  assert.equal(contract, null)
})

test('重复 norms 块报错（不允许歧义）', () => {
  const doc = `---
version: 1
states: []
---

[workflow-norms]
第一块
[/workflow-norms]

[workflow-norms]
第二块
[/workflow-norms]
`
  const [err, contract] = parseContract(doc)
  assert.ok(err instanceof WorkflowContractError)
  assert.equal(contract, null)
})

test('norms 块与 state 块不允许嵌套', () => {
  const doc = `---
version: 1
states:
  - planning
---

[workflow-norms]
规范
[workflow-state:planning]
[/workflow-state:planning]
[/workflow-norms]
`
  const [err, contract] = parseContract(doc)
  assert.ok(err instanceof WorkflowContractError)
  assert.equal(contract, null)
})

test('norms 块自嵌套报错（未闭合的重复开 tag 不得静默吞掉首块内容）', () => {
  const doc = `---
version: 1
states: []
---

[workflow-norms]
第一块内容
[workflow-norms]
第二块内容
[/workflow-norms]
`
  const [err, contract] = parseContract(doc)
  assert.ok(err instanceof WorkflowContractError)
  assert.match(err.message, /must not be nested/)
  assert.equal(contract, null)
})
