# 设计：alignment review 提前暴露 PRD 结构门禁

## 1. 背景与目标

`workloom_task_create` 生成的初始 `prd.md` 总是包含 H1 与四个必备小节，但主会话在 Phase 1.1 中可能用整文件重写的方式漏掉 `## Notes`。现有 `action=review` 只返回快照、hash 与 open-node 状态，直到 `action=confirm` 才做结构校验，导致主会话把不可确认的 snapshot/hash 提前展示给用户。

本设计把 PRD 内容检查抽象为一个 runtime-independent 的结构化分类器，并让 review、confirm、start、doctor 共用它。review 仍保持只读、可查看草稿；是否可进入用户确认由新字段明确表达。

## 2. review 返回契约

`AlignReviewResult` 在保留现有字段的前提下新增三个字段：

```ts
interface PrdStructureIssue {
  code: PrdStructureCode
  message: string
  section?: string
}

interface AlignReviewResult {
  action: 'review'
  taskRelPath: string
  status: TaskStatusValue
  prd: string | null
  prdHash: string | null
  openNodeState: OpenNodeState | null
  structureIssues: PrdStructureIssue[]
  confirmBlockers: string[]
  readyToConfirm: boolean
  alignment: TaskAlignmentRecord | null
}
```

字段语义：

1. `structureIssues`：当前 PRD 内容问题的结构化列表，顺序固定。
2. `confirmBlockers`：`structureIssues.map((issue) => issue.message)`，供主会话直接展示。
3. `readyToConfirm`：严格等价于 `structureIssues.length === 0`，只代表当前 PRD 内容满足 confirm 的内容前置条件。

`readyToConfirm` 不计入以下条件：

- task status；
- 既有 alignment credential 是否 stale；
- confirm 调用是否带 `expectedPrdHash`；
- confirm 调用是否带 `summary`。

这些仍由现有状态/凭据门禁和 confirm 参数校验负责。

## 3. 稳定 issue code 与消息

`task-gates` 新增冻结 code 常量，禁止调用方散落字符串：

```ts
type PrdStructureCode =
  | 'prd_missing'
  | 'prd_title_missing'
  | 'prd_section_missing'
  | 'prd_section_placeholder'
  | 'prd_open_nodes_missing'
  | 'prd_open_nodes_not_none'
```

运行时消息使用英文：

| code | section | message |
| --- | --- | --- |
| `prd_missing` | 无 | `prd.md is missing` |
| `prd_title_missing` | 无 | `prd.md missing H1 title` |
| `prd_section_missing` | 小节名 | `prd.md section "<Heading>" is missing` |
| `prd_section_placeholder` | 小节名 | `prd.md section "<Heading>" is still a placeholder` |
| `prd_open_nodes_missing` | 无 | `prd.md open-nodes marker is missing` |
| `prd_open_nodes_not_none` | 无 | `prd.md open nodes are not converged (marker state: "<state>")` |

说明：

1. title 消息沿用现有 `findMissingPrdTitle()` 的稳定文案，避免不必要地破坏现有调用方。
2. 小节名严格来自 `PRD_SECTIONS`：`Goal`、`Requirements`、`Acceptance Criteria`、`Notes`。
3. `## Note` 单数、`## notes:` 或其他别名均按缺失处理，不做兼容归一化。
4. open-node 状态为 `null` 时产生 missing issue；状态为 `pending` 时产生 not-none issue；只有 `none` 通过。

## 4. 通用 PRD 分类器

在 `packages/core/src/legacy/task-gates.js` 新增纯函数：

```ts
function inspectPrdStructure(prdContent: string | null): readonly PrdStructureIssue[]
```

行为：

1. 输入 `null`：只返回一个 `prd_missing` issue，不继续解析其他问题。
2. 输入非空字符串：
   1. 用现有 `findMissingPrdTitle()` 检查 H1；
   2. 用现有 `splitSectionBodies()` 与 `PRD_SECTIONS` 按文档顺序检查每个必备小节；
   3. 小节不存在返回 `prd_section_missing`；
   4. 小节存在但正文 trim 后等于该小节 placeholder，返回 `prd_section_placeholder`；
   5. 用 `findOpenNodeState()` 检查 marker；
   6. 返回所有问题，而不是遇到第一个就停止。
3. 输出顺序固定为：H1 → 四个小节（按 `PRD_SECTIONS` 顺序）→ open nodes。

保留兼容包装：

```ts
function findUnfilledPrdSections(prdContent: string): string[]
```

它从 `inspectPrdStructure(prdContent)` 中过滤两类 section issue 并返回 `section`，保持旧调用方需要的字符串数组语义。

同步更新 `task-gates.d.ts`，并从 `core/src/index.ts` 导出新类型与函数。

## 5. 各消费方集成

### 5.1 alignment review

`reviewAlign()` 读取 PRD 后：

1. 对 `prd` 调用 `inspectPrdStructure()`；
2. 填入 `structureIssues`；
3. 从 issue message 生成 `confirmBlockers`；
4. 以 issue 是否为空计算 `readyToConfirm`。

PRD 缺失时 review 仍成功返回：`prd: null`、`prdHash: null`、`openNodeState: null`，同时返回 `prd_missing` 且 `readyToConfirm === false`。

### 5.2 alignment confirm

`confirmAlign()` 用分类器一次性取得当前 PRD 的全部内容问题。若存在 issue，仍只抛一个 Error，但消息聚合全部 blocker：

```txt
workloom task tool: confirm rejected: prd.md content blockers:
- prd.md section "Notes" is missing
```

通过后，后续校验顺序不变：expectedPrdHash 必填 → 当前 hash 比对 → summary 非空 → 原子写凭据。失败零写入与同 hash 幂等行为不变。

### 5.3 start gate

`evaluateStartGate()` 复用分类器：

1. PRD 缺失时加入 `prd.md is missing`；
2. PRD 存在时把分类器返回的 issue message 全部加入缺失项；
3. 再执行现有 alignment credential 与 jsonl gate。

这会让 start 的 PRD 问题也在一次调用中完整暴露，并保持工具层最终仍抛一个聚合错误。

### 5.4 doctor

`checkDocCompleteness()` 复用分类器，但只投影文档完整性相关 issue：

- `prd_missing`；
- `prd_title_missing`；
- `prd_section_missing`；
- `prd_section_placeholder`。

doctor 不把 open-nodes marker 作为普通文档完整性告警，因为该检查属于 Phase 1.1 alignment readiness；否则会对历史任务产生没有修复价值的新噪音。

每个 section issue 生成一条独立 doctor issue，hint 分别提示添加缺失小节或填充 placeholder 小节。

## 6. Adapter 与 surface

DSH 与 Pi adapter 继续直接返回 core 的 plain JSON result，不新增业务判断。

更新 `surface.ts` 中 `action` 参数描述，明确 review 返回 snapshot/hash 的同时，还返回结构问题、confirm blockers 与 ready 状态。adapter-dsh 与 adapter-pi 既有的 surface 参数描述测试需要同步更新。

## 7. Agent-facing 资产与协议版本

### 7.1 workflow

更新 `packages/assets/workflow/workflow.md` Phase 1.1：

1. review 后必须先检查 `readyToConfirm`；
2. `readyToConfirm=false` 时不得向用户请求确认 snapshot/hash；
3. 必须处理全部 `structureIssues`/`confirmBlockers`，重新 review；
4. 只有 `readyToConfirm=true` 时才展示 snapshot/hash 并等待用户明确确认。

同一规则同步到 planning norms，保证主会话注入上下文也能看到。

### 7.2 workloom-alignment skill

更新 `SKILL.md` 的 convergence protocol，并在 `evals.json` 中增加 review blocker 场景：当 review 显示缺少 `## Notes` 或仍有 placeholder 时，Agent 应先修复 PRD 并重新 review，而不是请求用户确认。

### 7.3 protocol version

`workflow.md` 的契约正文发生变化，因此：

1. `packages/assets/workflow/workflow.md` frontmatter：`21 → 22`；
2. `WORKFLOW_PROTOCOL_VERSION`：`21 → 22`；
3. 资产契约测试中的版本字面量同步更新。

## 8. 测试设计（test-first）

先写失败测试，再实现。

### 8.1 `task-gates.test.js`

新增/更新：

1. `null` 输入只返回 `prd_missing`；
2. H1 缺失返回 `prd_title_missing`；
3. 小节缺失返回 `prd_section_missing` 与正确 `section`；
4. placeholder 返回 `prd_section_placeholder` 与正确 `section`；
5. 同一 PRD 同时缺 H1、缺 Notes、Requirements placeholder、marker pending 时，一次返回全部 issue 且顺序固定；
6. marker 缺失与 pending 分别返回对应 code；
7. 完整 PRD 返回空数组；
8. `findUnfilledPrdSections()` 兼容包装仍返回缺失/占位小节标题。

### 8.2 `task-ops.test.js`

新增/更新：

1. review 缺 PRD：成功返回 snapshot 字段与 `prd_missing`、`readyToConfirm=false`；
2. review 缺 Notes：成功返回 hash，同时指出 Notes missing；
3. review Notes placeholder：指出 placeholder 而非 missing；
4. review open-node pending/missing：返回对应 blocker；
5. review 完整内容：`structureIssues=[]`、`confirmBlockers=[]`、`readyToConfirm=true`；
6. confirm 对多个内容问题只抛一个 Error，消息包含全部 blocker；
7. 既有零写入、hash mismatch、summary 必填、同 hash 幂等测试保持通过。

### 8.3 start/doctor 测试

1. start 对缺小节与 placeholder 给出不同消息；
2. start 一次暴露多个 PRD 内容问题；
3. doctor 对 missing/placeholder 分别生成 issue 与 hint；
4. doctor 不对历史任务的 open-node marker 缺失产生 doc-completeness 告警。

### 8.4 资产与 adapter 测试

1. protocol/contract 测试断言版本 22；
2. contract 测试断言 review blocker → 修复/重跑 review → ready 后才能用户确认；
3. alignment skill eval JSON 可解析并包含新 blocker 场景；
4. DSH/Pi tool schema 测试更新 surface 描述；
5. 构建后双 adapter 测试通过，确认新增字段经 opaque JSON 正常透出。

## 9. 兼容性与非目标

1. review 不因草稿不完整而失败。
2. 不自动修复 PRD。
3. 不兼容 `## Note` 单数别名。
4. 不改变 task.json alignment 数据结构，不迁移历史任务。
5. 不改变 confirm 的 hash/summary 用户确认协议。
6. 不新增 changeset；仓库当前没有该机制。
7. 不执行本机 DSH profile rsync，不重启 dshweb。

## 10. 验证矩阵

实现完成后运行：

```bash
pnpm lint
pnpm -r typecheck
pnpm -r build
cd packages/core && node --test test/*.test.js
cd packages/adapter-dsh && node --test test/*.test.js
cd packages/adapter-pi && bun test test/*.test.ts
```

若本机 Bun 环境不可用，check executor 必须记录原始失败原因；其余命令必须全绿。