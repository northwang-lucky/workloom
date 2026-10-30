Injection marker: tasks/10-29-review-executor:mvubzo1wowkur3nl

# review 执行器：kind 注册链、配置面、doctor 面事实

Research report for task `tasks/10-29-review-executor`（子任务 B 前置调研）。本文件只覆盖
kind 注册链（任务清单第 1 项）、配置面（第 2 项）、doctor 面（第 3 项）。

> 执行契约冲突说明：执行契约要求「先读 plan.md 再动手」，本任务处于 planning 阶段，
> 任务目录里没有 plan.md（只有 prd.md 与两个种子 jsonl），因此以 prd.md 与真实源码为准推进，
> 冲突在此声明一次。

> Scope: `packages/core`（domain/executor-context.js、task-store.js、config.js、init.js、
> executor-profiles.js、surface.ts）、`packages/adapter-dsh/src`、`packages/adapter-pi/src`。
> 只读调研，未改任何源码。

## kind 是单点枚举，消费方全部从 `EXECUTOR_KINDS` 取值，新增 review 只需在枚举里加一项并补语义分支

枚举定义与结构：

```js
// packages/core/src/domain/executor-context.js:36-41
export const EXECUTOR_KINDS = Object.freeze({
  research: 'research',
  implement: 'implement',
  check: 'check',
  frontend: 'frontend',
})
```

- 该枚举由 `packages/core/src/index.ts:55-57` 重新导出（`EXECUTOR_KINDS`、`assertKind`）。
- 手写类型面同步声明为四个字面量联合，新增 kind 必须一起改，否则 typecheck 报错或类型面漏字面量：
  `packages/core/src/domain/executor-context.d.ts:7-14` 的 `Record<'research' | 'implement' | 'check' | 'frontend', string>`
  （`EXECUTOR_KINDS` 与 `EXECUTOR_CONTRACT_BY_KIND` 各一处）。

### 校验实现：`assertKind` 按枚举值判定，加枚举即自动接受 review

```js
// packages/core/src/domain/executor-context.js:351-360
export function assertKind(kind) {
  if (kind === undefined) return
  if (typeof kind !== 'string' || !Object.values(EXECUTOR_KINDS).some((value) => value === kind)) {
    throw new Error(
      `${ERR_PREFIX}: invalid kind: ${String(kind)} (must be one of ${Object.values(
        EXECUTOR_KINDS,
      ).join('/')})`,
    )
  }
}
```

**实测证据**（当前代码下跑 dist）：

```txt
$ node --input-type=module -e "import {assertKind} from './packages/core/dist/index.js'; assertKind('review')"
workloom executor context: invalid kind: review (must be one of research/implement/check/frontend)
```

### 派发记录校验：另一处独立枚举校验，但同样引用 `EXECUTOR_KINDS`，加枚举即放行

```js
// packages/core/src/domain/task-store.js:1131-1136
if (!Object.values(EXECUTOR_KINDS).includes(entry.kind)) {
  throw new Error(
    `${ERR_PREFIX}: invalid dispatch kind: ${String(entry.kind)} (must be one of ${Object.values(
      EXECUTOR_KINDS,
    ).join('/')})`,
  )
}
```

- 调用链：`recordExecutorDispatch`（`task-store.js:948-967`）→ `buildDispatchRecord`
  （校验 kind，`task-store.js:1120+`）→ `task.dispatches.push` → `computeTaskStage`。
- 同一文件还有一处 kind 校验在 `computeTaskStage`（`task-store.js:1226-1237`），语义分支见
  `03-write-scope-and-dispatch-records.md`。

### 其余 core 侧消费点（逐条锚点）

| 消费点 | 位置 | 加 review 的影响 |
| --- | --- | --- |
| prd 全文物化 kind 集合 | `executor-context.js:406` | 需把 review 并入 check/research 组 |
| Pointer list 非 research 分支 | `executor-context.js:411` | review 走该分支（要 plan.md 指针） |
| prd 软指针 kind 集合 | `executor-context.js:430` | review 不得加入（prd 已内联） |
| jsonl 文件名映射 | `executor-context.js:54-59` | 缺 review 键 → 无 spec 指针，必须补 `implement.jsonl` |
| 纪律段正文按 kind 组装 | `executor-context.js:249-318` | 必须新增 review 段 |
| 会话画像每 kind 一行 | `executor-profiles.js:52` 遍历 `Object.values(EXECUTOR_KINDS)` | 自动多出 review 行 |
| 前端派发门禁 | `task-gates.js:381`（`entry.kind === EXECUTOR_KINDS.frontend`） | 与 review 无关 |
| doctor 阶段一致性 | `doctor-check-rules.ts:245` | 与 review 无关（但见第 10 项陷阱） |
| 工具描述文案 | `surface.ts:55`（`research/implement/check/frontend`） | 纯文案，建议同步 |
| kind 参数描述 | `surface.ts:130` `kind: 'Executor role: research, implement, check, or frontend'` | 纯文案，建议同步 |

### 两 adapter 的消费点（逐一列出）

adapter-dsh：

- `src/executor-injection.ts:14-19` 独立 `KIND_LABELS`（research/implement/check/frontend → Research/…），
  用于子会话标题；`executor-injection.ts:89` 缺键时回退原 kind。
- `src/executor-capacity.ts:149-156` 由 `KIND_LABELS` 反转派生 `LABEL_TO_KIND`，缺 review 会让
  容量统计的 label 回退解析认不出 review（仍能靠 dispatches 记录识别，降级可用）。
- `src/executor-guard.ts:85` 重建 research 子会话 id 集时按 `kind === EXECUTOR_KINDS.research` 过滤，
  review 需要同一套写范围守卫（详见 03）。
- `src/executor.ts:695-696` 派发成功后按 `params.kind === EXECUTOR_KINDS.research` 登记守卫身份。
- `src/executor-failover.ts:534-535` 失败转移新跳按同一条件登记守卫身份。
- `src/executor.ts:5` 文件头注释里的 `kind（research/implement/check/frontend）` 为文案。

adapter-pi：

- `src/pi-args.ts:22-27` 又一份 `KIND_LABELS`；`buildChildPiArgs` 先查
  `EXECUTOR_AGENT_DEFINITIONS[params.kind]`，缺定义直接 fail loud（`pi-args.ts:58-64`）。
- `src/agent-definitions.ts:30-31` `EXECUTOR_AGENT_DEFINITIONS` 四角色数据，键必须与
  `EXECUTOR_KINDS` 值一一对应（`test/agents.test.ts:18-20` 逐字断言）。
- `src/executor.ts:375` 收参后调用 `assertKind(params.kind)`；`src/executor.ts:471`
  按 `params.kind === 'research'` 追加 research 写范围扩展。

## `workloom_execute` 的 kind 没有枚举约束，只是一段自由文本描述，唯一定义点在 core `surface.ts`

```ts
// packages/core/src/surface.ts:130
kind: 'Executor role: research, implement, check, or frontend',
```

- DSH 侧工具 schema 只给 `{ type: 'string', description: desc.kind }`，没有 `enum`：
  `packages/adapter-dsh/src/executor-schema.ts:22-25`；必填约束在 `executor-schema.ts:64`。
- Pi 侧同形：`packages/adapter-pi/src/executor.ts:96`（`kind: Type.String({ description: ... })`）。
- DSH 侧**没有** `assertKind` 调用；非法 kind 会一路走到 `buildExecutorPrompt` 的
  `assertKind`（core）才抛错（`executor-context.js:385`）。Pi 侧提前在
  `adapter-pi/src/executor.ts:375` 抛。
- 结论：kind 的「枚举」只存在于 `EXECUTOR_KINDS` 与这段描述文本里；schema 不做白名单，
  所以新增 review 不需要改 schema 结构，只需改描述文案。

## `dispatch-binding.js` 完全不碰 kind，review 无需改动

`packages/core/src/domain/dispatch-binding.js:1-58` 全篇只处理 model/effort 与
`modelSource`（`resolveDispatchModelSource` 在 32-39 行，`buildNewDispatchBinding` 在 47-57 行），
没有 `kind` 字样。复现：`grep -n kind packages/core/src/domain/dispatch-binding.js` 无输出。

## 配置层对 kind 不设白名单，review 条目开箱即被解析

```js
// packages/core/src/domain/config.js:552-553
/**
 * 校验 subagents 映射：每个值是含可选 model/effort 的对象，key 不限集合
 * （不对 executor kind 白名单校验，可容纳未来新增 kind / 拼写错误）。
 */
```

- 条目解析核心 `parseSubagentsEntries`（`config.js:571-648`）只校验字段名
  （model/effort/tools/max_concurrent/fallback_models/rotate_on_busy），不看 kind 名。
- 单测已把「未知 kind key 保留」固定成契约：`packages/core/test/config.test.js:592-613`
  （`future_kind` / `typo_kind` 解析后原样保留）。
- 解析链：`resolveSubagentDefaults(config, kind, …)`（`config.js:911-1000`），
  `legacyLayer = config.subagents[kind]`（`config.js:932`），profile 层
  `matched?.subagents[kind]`（`config.js:931`）。review 走同一条链，零改动。
- fallback 条目机制：`subagent_profiles` 顺序匹配，无 `whenMain` 的条目无条件命中
  （`config.js:915-929`），`fallback_models` 字段级合并（`config.js:963-975`）。
- 每 kind 并发上限缺省 3（`config.js:71`、`config.js:988-990`），review 自动获得独立 kind 槽位。

### 但「默认配置条目」只存在于 init 的示例模板，且模板现在只有三个 kind

`DEFAULT_CONFIG.subagents` 是空对象，没有任何内置 kind 模型：

```js
// packages/core/src/domain/config.js:67
  subagents: {},
```

init 写出的 `config.json` 模板同样不含 subagents（只有 packages）：

```js
// packages/core/src/domain/init.js:73-81
const CONFIG_TEMPLATE = [
  '{',
  '  "packages": {',
  '    "repo": {',
  '      "path": "."',
  '    }',
  '  }',
  '}',
].join('\n')
```

真正的「默认条目」示范在 `config.example.json` / `config.example.js`，且**只有 research /
implement / check 三条，没有 frontend**：

```json
// packages/core/src/domain/init.js:111-119（CONFIG_EXAMPLE_JSON_TEMPLATE 片段）
  "subagents": {
    "research": { "model": "deepseek-official/deepseek-v4-flash", "effort": "high" },
    "implement": {
      "model": { "dsh": "deepseek-official/deepseek-v4-flash", "pi": "deepseek/deepseek-v4-flash" },
      "effort": "max"
    },
    "check": { "model": "kimi-coding/k3", "effort": "high" }
  },
```

`config.example.js` 工厂模板同样只有 research/check 的 profile 示例（`init.js:186-200`），
其 `subagents` 段甚至不出现（只在 profile 内出现）。

- 因此 prd 里「init 配置模板 seeding 出 subagents.review 默认条目」的落点是
  `init.js` 的 `CONFIG_EXAMPLE_JSON_TEMPLATE`（111-119）与 `CONFIG_EXAMPLE_JS_TEMPLATE`
  （189-196 附近），**不是** `CONFIG_TEMPLATE`（73-81）。
- 同时要补 `packages/core/test/init.test.js:157-167` 的路径断言清单（现在逐条固定
  `subagents.research.*` / `subagents.implement.*` / `subagents.check.*`）。

### 本机全局配置已经存在 review 条目（外部事实，说明配置侧零改动即可生效）

`~/.workloom/config.json` 的兜底 profile 里已有 `review`，字段与 `check` 同形
（deepseek-flash + effort max + `rotate_on_busy` + `fallback_models` + `tools.includes: ["lsp_*"]`）。
这是本机机器层配置，不属于仓库产物；它说明 review 只要枚举一加，模型/effort/工具面即按配置生效。

## doctor 没有 kind 白名单检查，也没有执行器画像展示：「认识 review」实际只剩两处文案

doctor 全部 12 类检查里与 executor kind 相关的只有两处：

| 位置 | 内容 | 加 review 的影响 |
| --- | --- | --- |
| `packages/core/src/service/doctor-check-rules.ts:245` | `last.kind !== EXECUTOR_KINDS.check`（stage=check 时最近派发必须为 check） | 无需改；review 派发不会命中该分支 |
| `packages/core/src/service/doctor-local-prompts.ts:123,126` | 提示词片段文件名的 message 与 hint：`only main/research/implement/check/frontend/all .md files are injected` | **必须补 review**，否则用户放 `review.md` 会被 doctor 报 unknown |

- `checkConfig`（`doctor-check-rules.ts:466-530`）只做「有没有 config 文件 / packages 是否为空 /
  config 是否可解析」，不枚举 subagents 的 kind，所以 review 不需要新增配置检查。
- `checkDispatchAudit`（`doctor-check-rules.ts:184-206`）只要求非 planning 任务 dispatches 非空。
- doctor 侧**不存在**「Executor profiles」展示：该段由
  `packages/core/src/service/session-context.ts:216-232` 调
  `renderExecutorProfilesSection` 渲染（`executor-profiles.js:52` 遍历枚举），
  加 review 后会话快照自动多一行，doctor 不参与。
- doctor 的 kinds 文案还散落在 hint 里（`doctor-check-rules.ts:242,255` 的
  `workloom_execute kind=check`），与 review 无关。
