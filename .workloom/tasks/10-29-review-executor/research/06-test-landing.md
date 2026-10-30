Injection marker: tasks/10-29-review-executor:mvubzo1wowkur3nl

# review 执行器：测试组织方式与新增 kind 的测试落点事实

Research report for task `tasks/10-29-review-executor`，覆盖任务清单第 9 项。

> 执行契约冲突说明：执行契约要求先读 plan.md，本任务 planning 阶段无 plan.md，
> 以 prd.md 与源码为准（声明一次）。

## core 测试跑的是构建产物 dist，不是 src：先 build 再测是硬前提

```js
// packages/core/test/executor-context.test.js:20-23
import {
  EFFORT_LEVELS,
  EXECUTOR_KINDS,
  assertEffort,
  assertKind,
  buildExecutorPrompt,
} from '../dist/domain/executor-context.js'
```

- core 的 test 脚本本身先 build：`packages/core/package.json` 的
  `"test": "pnpm run build && node --test 'test/*.test.js'"`；adapter-dsh 同形
  （`packages/adapter-dsh/package.json`）。adapter-pi 用 bun 直接跑 `.ts`（无 build 步骤，
  `"test": "bun test test/*.test.ts"`）。
- 手写 `.d.ts` 必须与 dist 逐字一致（`packages/core/test/dist-dts.test.js:20-32`），
  改 `executor-context.d.ts` 后必须重新 build 并提交 dist（AC6 的同 commit 重建要求）。

## executor-context.test.js 用「显式 kind 数组 + 遍历断言」组织，几处循环是最容易漏改的点

组织结构（`packages/core/test/executor-context.test.js`）：

| 用例 | 行 | 组织方式 | 加 review 的影响 |
| --- | --- | --- | --- |
| 常量导出 | 59-68 | `assert.deepEqual(EXECUTOR_KINDS, {research, implement, check, frontend})` | **加枚举即红**（接缝①的红灯） |
| 纪律段并入权威段 | 395-425 | 局部对象 `bodyKeywords` 四个键，遍历其 `Object.keys` | 需加 review 关键字 |
| check 分级语义 | 427-464 | 单独取 check 断言 P 级文案 | 无 |
| S5 marker 回声 | 1022-1058 | 显式数组 `['research','implement','check','frontend']` | 需扩数组 |
| 无用户通道句 | 1060-1078 | 同上显式数组 | 需扩数组 |
| research 写范围句（逐字）且其余 kind 不含 | 1080-1105 | 先断言 research 含，再遍历 `['implement','check','frontend']` 断言不含 | **必须把 review 从「不含」名单挪走**（review 也要含） |
| 全 kind 段落白名单与顺序 | 1132-1200 | 显式数组 + 按 kind 分支断言（check/research 内联 prd；其他不内联 + 有软指针） | review 属于「内联 prd 且无软指针」，分支条件需扩 |
| 分层协议句 | 1216-1243 | 显式数组 + 逐字句 | 需扩数组 |
| implement 词数上限 | 1245-1273 | 仅 implement | 无 |
| worktree 注入 | 1275-1340 | 单 kind | 无 |

- 夹具函数：`makeProject`（`executor-context.test.js:29-34`）、`writeTaskFile`（36-41）、
  `baseParams(root, kind)`（55-57）、`writeConfig`（50-52）。新增 review 用例可直接复用。
- 断言风格是「整段切片 + `includes` 逐字」：先 `const contractAt = text.indexOf('## Executor contract')`
  再切片断言（如 1064-1078）。review 纪律段建议照同一风格逐字固定四维职责、只写报告、
  报告文件约定、与 check 边界、`.workloom/` 范围句。
- prd 内联断言用文件块分隔符 `--- .workloom/tasks/08-24-demo/prd.md ---`
  （`executor-context.test.js:1132-1200` 内的 `prdBlockAt`），review 属内联组。

## adapter-dsh executor.test.js 按「kind 作为参数」参数化，kind 相关断言集中在少数几个用例

| 用例 | 行 | 形态 |
| --- | --- | --- |
| label 组装（title 缺省） | 780-803 | `cases = [['research','Research'], …]` 四元组数组 |
| label 组装（title 传入） | 841-867 | 同样的四元组数组 |
| 派发记录 kinds | 520-538 | 单个 frontend 用例 |
| 工具白名单 = 原生 ∩ 可见 | 1188-1229 | 与 kind 无关 |
| receipt K tools allowed | 1272-1291 | `execArgs()` 默认 implement |
| research 写守卫 | 1869-2040 | 直接调 `rebuildResearchChildIds` / `researchWriteGuard` / `createResearchGuardState`，另有两支接线用例（research 派发登记、implement 不登记） |

- 共用执行参数 `execArgs(extra)`（`adapter-dsh/test/executor.test.js:282-292`，默认 `kind: 'implement'`），
  改 kind 只传 `{ kind: 'review' }`。
- mock 上下文工厂 `makeCtx`（约 100-250 行）捕获 `guardRegistrations`、`restrictCalls`、
  `startCalls` 等，加 review 的守卫用例可直接复用（`setup.guardRegistrations[0]`）。
- 新增 review 守卫用例的最小覆盖：review 派发后越界 write 被拒；implement 派发不登记
  （现有 implement 用例已覆盖「不登记」语义，需要保持）。
- 文件已 4034 行，超过 600 行软限；现有拆法是按关注点分段注释
  （如第 1869 行 `// ---------- research 写守卫（executor-guard.ts） ----------`）。
  建议 review 用例沿用分段注释，不新开测试文件（避免重复搭 mock）。

## config.test.js 用「文档对象 → 断言解析结果」模式，review 不需要新用例即可被覆盖

- 合法解析用例：`packages/core/test/config.test.js:592-616`，含
  `future_kind` / `typo_kind` 两个未知 kind key，断言原样保留 → **review 条目天然合法**。
- 错误用例统一走表驱动：`{ doc, field }` 数组 +
  `assert.throws`（如 `config.test.js:618+`、481-535 的 tools 字段用例）。
- 若接缝③要求「配置解析出 review 的模型与 effort（含 fallback 条目）」，落点可以是：
  `resolveSubagentDefaults` 专项用例（现有测试在 `executor-profiles.test.js` /
  `config.test.js` 的 L4 段），断言 `resolveSubagentDefaults(config, 'review', …)`
  返回 model/effort/modelSource 与 fallbackModels。无需改解析代码。

## doctor.test.js 的 kind 相关用例只有阶段一致性与 local-prompts 文件名两类

- 阶段一致性：`packages/core/test/doctor.test.js:224-278`，构造 dispatches 数组断言 issue；
  kind 只用 `implement` / `check`。
- local-prompts：`doctor.test.js:725-745` 写 `weird.md` 断言 unknown 文件名 warn。
  该用例断言的是 `severity === 'warn'` 与 `path`，**不逐字断言 message/hint 文本**，
  所以补 review 到文案不会让现有用例红；但按接缝③应新增/扩展断言确认 `review.md`
  不再被报 unknown（改 `doctor-local-prompts.ts:123,126` 后，`review.md` 应走 loaded info 分支）。
- 正向状态用例：`doctor.test.js:665-687` 断言 `info` 行含 `[target=…][source=…]`，
  可作为 `review.md` 的正向断言模板。

## init 测试逐条固定 config.example.json 的字段路径，加 review 条目要同步扩这份清单

```js
// packages/core/test/init.test.js:157-167（节选）
    for (const path of [
      'subagents.research.model',
      'subagents.research.effort',
      'subagents.implement.model.dsh',
      'subagents.implement.model.pi',
      'subagents.implement.effort',
      'subagents.check.model',
      'subagents.check.effort',
    ]) {
      assert.ok(examplePaths.has(path), `missing ${path} in config.example.json`)
    }
```

- 该用例（`init.test.js:141-197`）还断言 `config.example.json` 必须覆盖 `DEFAULT_CONFIG`
  的全部字段路径（排除 executor 段），以及 profile 里 check 的 tools 内容。
- 结论：在 `init.js` 的 `CONFIG_EXAMPLE_JSON_TEMPLATE` 加 `review` 条目后，
  必须把 `subagents.review.model` / `subagents.review.effort` 加进上面这份清单，
  否则接缝③没有测试固定（现有断言不会因为多出字段而红，属于「漏测」而非「红灯」）。
- `config.example.js` 的断言在 `init.test.js:199-230`，目前只查注释性文案与工厂形态，
  加 review 示例不会破坏它。

## adapter-pi 测试：角色表用「键集合全等」、参数用位置下标，两者都需同步

- `packages/adapter-pi/test/agents.test.ts:18-20`：`Object.keys(EXECUTOR_AGENT_DEFINITIONS).sort()`
  必须等于 `EXECUTOR_KINDS` 值集合 → core 加 review 后**立即红**，补数据即绿。
- `packages/adapter-pi/test/pi-args.test.ts:44-54`：标题标签四元组数组需加 `['review','Review']`。
- `packages/adapter-pi/test/executor.test.ts:568-613`：写范围扩展用例直接 import
  `../assets/research-scope.ts`；若扩成 review 也加载，需要为 review 侧补一条同样形状的用例
  （域内成功 + 越界拒绝英文）。
- `packages/adapter-pi/test/executor.test.ts:427-453`：本机片段按 kind 注入（check/frontend），
  review 的片段目标登记后建议补一条同形用例。

## 各包测试命令与全链顺序（AC6 口径）

```bash
pnpm lint
pnpm -r typecheck
pnpm -r build
cd packages/core && node --test test/*.test.js
cd packages/adapter-dsh && node --test test/*.test.js
cd packages/adapter-pi && bun test test/*.test.ts
```

- 顺序不能颠倒：core/adapter-dsh 的 test 依赖各自 build 产物（package.json 的 test 脚本已内置
  build，但手跑 `node --test` 前必须先 build）。
- 新增/修改 `.d.ts`（`executor-context.d.ts`）后必须重跑 build，否则
  `dist-dts.test.js` 会因 dist 未同步而红。
