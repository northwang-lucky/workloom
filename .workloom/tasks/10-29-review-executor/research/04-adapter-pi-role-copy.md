Injection marker: tasks/10-29-review-executor:mvubzo1wowkur3nl

# review 执行器：adapter-pi 角色定义与外派参数链事实

Research report for task `tasks/10-29-review-executor`，覆盖任务清单第 11 项。

> 执行契约冲突说明：执行契约要求先读 plan.md，本任务 planning 阶段无 plan.md，
> 以 prd.md 与源码为准（声明一次）。

## `EXECUTOR_AGENT_DEFINITIONS` 是「键 = kind 值」的纯数据表，四角色文案各自自包含，加 review 只加一项数据

结构（`packages/adapter-pi/src/agent-definitions.ts`）：

| 位置 | 内容 |
| --- | --- |
| 25-28 | `interface ExecutorAgentDefinition { description; systemPrompt }` |
| 31 | `export const EXECUTOR_AGENT_DEFINITIONS: Readonly<Record<string, ExecutorAgentDefinition>>` |
| 32-41 | `research`：调查并产出可执行报告 |
| 42-51 | `implement`：按 plan 实施、最小改动、锚点不符上报 |
| 52-63 | `check`：分级 P0/P1/P2、P2 自修、`## Open issues` 结构化结尾 |
| 64-77 | `frontend`：UI 七轴、只改前端文件、缺后端接口用 mock |
| 78 | 表结束 |

四段文案的共同约束（`test/agents.test.ts` 逐条固定）：

- 键集合必须与 `EXECUTOR_KINDS` 的值集合完全相等（`agents.test.ts:18-20`：
  `assert.deepEqual(Object.keys(...).sort(), [...kinds].sort())`）。
- 每段 systemPrompt 必须含 `workloom` 字样与 `Do not dispatch subagents`（`agents.test.ts:26-28`）。
- 不得出现 `already inlined` / `degrade to index` 措辞（`agents.test.ts:47-64`）。
- 不得引用 `implement.md` / `design.md`（`agents.test.ts:78-95`）。

review 段要写清的边界（prd 第 1、3、4 条）：只写审查报告、不改 plan 不改代码、
报告文件约定（任务目录 `plan-review.md`，多轮以节追加）、与 check 的分工
（review 审计划、开工前；check 审代码、实现后）、写入范围限 `.workloom/`。

## Pi 侧对 kind 的消费点只有三处：角色表、标签表、写范围扩展条件

| 消费点 | 位置 | 加 review 的动作 |
| --- | --- | --- |
| 角色定义查表 | `packages/adapter-pi/src/pi-args.ts:68-75`（缺定义即抛错） | 加 review 段数据 |
| 子会话标题标签 | `packages/adapter-pi/src/pi-args.ts:22-27`（`KIND_LABELS`） | 加 `review: 'Review'` |
| 写范围扩展加载 | `packages/adapter-pi/src/executor.ts:471`（`kind === 'research'`） | 条件扩成 research + review |
| 参数校验 | `packages/adapter-pi/src/executor.ts:375`（`assertKind`） | 加枚举后自动通过 |

缺定义的失败形态（fail loud，不是静默）：

```ts
// packages/adapter-pi/src/pi-args.ts:68-76
  const definition = EXECUTOR_AGENT_DEFINITIONS[params.kind]
  if (definition === undefined) {
    throw new Error(`${ERR_PREFIX.executor}: no executor agent definition for kind ${params.kind}`)
  }
  // 防御：角色说明缺失会静默注入 undefined，fail loud（数据与代码同仓，缺字段即 bug）。
  if (definition.systemPrompt.trim() === '') {
    throw new Error(`${ERR_PREFIX.executor}: empty system prompt for kind ${params.kind}`)
  }
```

- 标题标签缺键时不会抛错，会退化为原 kind（`pi-args.ts:76` `?? params.kind`），
  即子会话标题变成 `[review] <title>`；功能可用但不是既有命名风格。
- `-t` 工具清单与 `-e` 扩展清单都在 `buildChildPiArgs` 组装（`pi-args.ts:87-104`），
  工具面来自 `buildPiToolAllow`（`packages/adapter-pi/src/executor.ts:452-454`），与 kind 无关。

## 固定这些文案与标签的测试清单（新增 review 时必须同步扩）

| 测试 | 位置 | 现有断言形态 |
| --- | --- | --- |
| agent 定义键集合 | `packages/adapter-pi/test/agents.test.ts:18-31` | 键集合与 `EXECUTOR_KINDS` 全等（**加枚举后不补数据即红**） |
| 角色文案完整性 | `packages/adapter-pi/test/agents.test.ts:26-28`（同一用例内遍历全部 kind） | 断言 `workloom` / `Do not dispatch subagents` |
| check 角色专项 | `packages/adapter-pi/test/agents.test.ts:32-46` 与 `65-77` | 仅取 check 断言修复导向、P0/P1/P2 分级与 Open issues 文案 |
| 标题标签 | `packages/adapter-pi/test/pi-args.test.ts:44-54` | 显式四元组数组 `[['research','Research'], …]` |
| 固定参数序列 | `packages/adapter-pi/test/pi-args.test.ts:20-37` | 下标位置断言（`args[6]` 为 `--name` 值、`args[8]` 为 systemPrompt） |
| 写范围扩展行为 | `packages/adapter-pi/test/executor.test.ts:568-613` | 直接 `import researchScope from '../assets/research-scope.ts'`，mock `registerTool` 后测域内成功/越界拒绝 |

- 注意 `pi-args.test.ts` 用**位置下标**断言参数序列（`args[6]`、`args[8]`）。若调整参数顺序，
  这些下标必须一起改；加 review 只改标签表不改变序列，下标不受影响。
- `agents.test.ts:18` 的键集合断言意味着：core 枚举加 review 的同一次改动里必须同时加 pi 角色数据，
  否则 adapter-pi 测试红。

## DSH 侧没有角色定义表，review 的角色文案只来自 core 纪律段

- DSH 注入的子代理 prompt 由 core `buildExecutorPrompt` 组装，末尾权威段取
  `EXECUTOR_CONTRACT_BY_KIND[kind]`（`packages/core/src/domain/executor-context.js:249-318`、459-469）。
- DSH 自己的 kind 文案只有标题标签 `KIND_LABELS`（`packages/adapter-dsh/src/executor-injection.ts:14-19`）
  与容量统计的反向映射（`executor-capacity.ts:149-156`）。
- 因此 review 的「职责四维、只写报告、与 check 边界」正文写在 core 纪律段一处即对两 runtime 生效；
  Pi 的角色总述是互补文案，不重复定义（`agent-definitions.ts:17-18` 注释口径）。
