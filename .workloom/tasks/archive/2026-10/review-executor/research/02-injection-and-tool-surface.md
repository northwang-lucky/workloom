Injection marker: tasks/10-29-review-executor:mvubzo1wowkur3nl

# review 执行器：注入面、工具面、本机片段面事实

Research report for task `tasks/10-29-review-executor`，覆盖任务清单第 5 项（注入面）、
第 6 项（工具面）、第 7 项（local-prompts）。

> 执行契约冲突说明：执行契约要求先读 plan.md，本任务 planning 阶段无 plan.md，
> 以 prd.md 与源码为准（声明一次）。

## 注入组装是单一函数里的四组 kind 分支，review 要「按 check 的形态、砍掉软指针」

段落顺序（`packages/core/src/domain/executor-context.js:384-470`，`parts.push` 逐点）：

| 序号 | 段落 | 代码位置 | kind 条件 |
| --- | --- | --- | --- |
| 1 | 任务标注 + 注入 marker | `executor-context.js:400-402` | 全 kind |
| 2 | prd 全文节块 | `executor-context.js:406-408` | `check` 或 `research` |
| 3 | Pointer list（plan.md 指针 + jsonl 条目） | `executor-context.js:411-422` | 非 `research` |
| 4 | Research materials | `executor-context.js:425` | 全 kind |
| 5 | prd 软指针行 | `executor-context.js:429-436` | `implement` 或 `frontend` |
| 6 | Worktree 段 | `executor-context.js:439-442` | 有 worktree_path 即注入 |
| 7 | Local directives | `executor-context.js:447-454` | 传参且未重复 |
| 8 | Task prompt | `executor-context.js:455-457` | 非空即注入 |
| 9 | Executor contract（纪律段 + 无用户通道 + leaf + 权威声明） | `executor-context.js:459-469` | 全 kind |

关键分支原文：

```js
// packages/core/src/domain/executor-context.js:404-412
  // check/research 物化 prd 全文节块（验收基线/问题框架，职责必需）；implement/
  // frontend 不物化 prd（下方软指针行代替，正文按需查阅）。
  if (params.kind === EXECUTOR_KINDS.check || params.kind === EXECUTOR_KINDS.research) {
    inlinePrdArtifact(parts, params.taskRelPath, taskDir, ci, stats)
  }
  // Pointer list（research 无此段）：首行固定 plan.md 纯指针行（文件缺失
  // 不出行），后接当前 kind 的 jsonl 条目指针行；文件不存在不指向空。
  if (params.kind !== EXECUTOR_KINDS.research) {
```

```js
// packages/core/src/domain/executor-context.js:428-435
  if (
    (params.kind === EXECUTOR_KINDS.implement || params.kind === EXECUTOR_KINDS.frontend) &&
    existsSync(join(taskDir, PRD_ARTIFACT))
  ) {
    parts.push(prdSoftPointerLine(join(WORKLOOM_DIR, params.taskRelPath, PRD_ARTIFACT)))
    stats.filesPointed += 1
  }
```

jsonl 映射（决定 review 的 spec 上下文来源）：

```js
// packages/core/src/domain/executor-context.js:54-59
const JSONL_FILES = Object.freeze({
  [EXECUTOR_KINDS.implement]: 'implement.jsonl',
  [EXECUTOR_KINDS.check]: 'check.jsonl',
  // frontend 上下文同 implement：plan.md 指针 + implement.jsonl。
  [EXECUTOR_KINDS.frontend]: 'implement.jsonl',
})
```

- 缺键时 `JSONL_FILES[params.kind]` 为 `undefined`，`executor-context.js:416-419` 跳过 jsonl 指针，
  **不报错**：review 若不补键，会静默没有 spec 指针（违反 prd 第 9 条「复用 implement.jsonl」）。
- prd 全文物化只保留 Requirements / Acceptance Criteria 两节全文，其余节只给标题指针：
  `PRD_FULL_SECTIONS`（`executor-context.js:135`）、`extractPrdContent`（`executor-context.js:526-545`）。
- Research materials 段是全 kind 自动注入（`executor-context.js:620-634`），review 无需改。

### 与 check 最接近的组合（可直接照抄的两处 + 明确不加的一处）

- 加进 prd 全文物化条件：`review` 与 `check`/`research` 同组（`executor-context.js:406`）。
- 保持非 research，因此有 Pointer list → 首行必有 plan.md 纯指针（`ARTIFACT_POINTER_FILES`，
  `executor-context.js:50`），这正是 review 要审的对象；jsonl 补 `implement.jsonl`。
- 不加 prd 软指针（`executor-context.js:430`），否则同一份 prd 既有全文又有软指针，重复且语义冲突。
- 纪律段写 new 段：`EXECUTOR_CONTRACT_BY_KIND`（`executor-context.js:249-318`）现有四键，
  研究/实现/检查/前端各一段（250/261/270/284 行起）。

### 写入范围告知句现在是 research 专用常量，review 需要复用同一文案

```js
// packages/core/src/domain/executor-context.js:221-224
const RESEARCH_WRITE_SCOPE_DISCIPLINE =
  'Your write/edit reach is confined to the .workloom/ directory: paths ' + 'outside it are denied.'
```

- 该句只拼进 research 纪律段（`executor-context.js:250-259` 段落末尾），其余 kind 不含。
- review 需要同一句（prd 第 3 条：写入范围限 `.workloom/`）。建议把常量改成中性名
  （如 `WRITE_SCOPE_DISCIPLINE`）并被 research + review 两个纪律段共用——沿用原有文案，
  避免同一语义出现两份字面量（符合仓库 code-style 的 Magic String 禁令）。
- 现有测试明确固定了「其它 kind 不得含此句」（`packages/core/test/executor-context.test.js:1080-1105`），
  加 review 后该用例必须把 review 从「不得含」名单里挪出去。

### 会话快照画像自动跟随枚举

`renderExecutorProfilesSection` 按 `Object.values(EXECUTOR_KINDS)` 逐行输出
（`packages/core/src/domain/executor-profiles.js:52`），session-context 在
`packages/core/src/service/session-context.ts:216-232` 调它。加 review 后快照会多一行
`review: … | source: …`，无代码改动。

## 工具面完全由「原生候选 ∩ 可见集 ± 配置 tools」决定，与 kind 无关，review 零代码改动

```js
// packages/core/src/domain/executor-tools.js:20-36（原生候选，节选）
export const NATIVE_TOOLS_DSH = Object.freeze([
  'read', 'write', 'edit', 'bash', 'glob', 'grep', 'read_image', 'view_image',
  'todo_write', 'job_output', 'job_list', 'job_kill', 'web_search', 'web_fetch', 'skill',
])
```

- 组装函数 `buildAllowList({ runtime, toolsConfig, visibleNames })` 在
  `executor-tools.js:54-107`；`toolsConfig` 来自该 kind 的 `tools.includes/excludes`
  （`resolveSubagentDefaults` 的 `tools` 字段），`visibleNames` 来自父代理作用域视图。
- DSH 接线：`packages/adapter-dsh/src/executor.ts:367-374`
  （`buildAllowFilter(visibleNames, effective.tools)` → `assertAllowListNonEmpty` → `hasLspTooling`），
  `buildAllowFilter` 在 `packages/adapter-dsh/src/executor-dispatch.ts:40-50` 调 core。
- 回执里的「K tools allowed」来源：`injectionStats(built, allowFilter.allow.length)`
  （`adapter-dsh/src/executor.ts:497,506,541`）→ `injection.toolsAllowed` →
  `packages/core/src/surface.ts:369-384` 的 `renderInjectionSegment` 拼 `, ${toolsAllowed} tools allowed`。
  所以「22 tools allowed」= 该 kind 配置与可见集求交后的条数，**不是按 kind 硬编码**。
- Pi 接线：`packages/adapter-pi/src/executor.ts:455`（`buildPiToolAllow`，定义在 329 行）→
  `pi-args.ts:96-103` 的 `-t` 逗号清单；空集 fail loud（`pi-args.ts:97-102`）。
- LSP 工具面由 `tools.includes: ["lsp_*"]` 决定，纪律段 LSP 句按 `hasLspTooling` 过滤
  （`adapter-dsh/src/executor-dispatch.ts:30-32`、`executor.ts:374`）。
- 结论：review 的「读取 + LSP + 受限写入」不需要新增工具逻辑；本机全局配置里
  review 条目已带 `tools.includes: ["lsp_*"]`，写入受守卫约束（见 03）。
- 注意：若某环境只授 `read` 类工具而不同时授 `write`/`edit`，review 就无法写报告；
  守卫只做范围收窄、不负责授予。派发前 `assertAllowListNonEmpty` 只保证非空，不保证含 write/edit。

## 本机片段机制对未知 kind 是 fail loud：review 不登记会让 review 派发直接失败

合法目标清单与文件名映射：

```ts
// packages/core/src/service/local-prompts.ts:38-46
export const LOCAL_FRAGMENT_TARGETS = Object.freeze([
  'main', 'research', 'implement', 'check', 'frontend', 'all',
] as const)
```

```ts
// packages/core/src/service/local-prompts.ts:59-68
const TARGET_BY_FILE = Object.freeze({
  'main.md': 'main',
  'research.md': 'research',
  'implement.md': 'implement',
  'check.md': 'check',
  'frontend.md': 'frontend',
  'all.md': 'all',
} as const)
```

两条失败路径（都是抛错，不降级）：

1. **target 不在枚举**：`filterAndOrderLocal` 在 `local-prompts.ts:158-176` 对未知 target 抛
   `WorkloomLocalPromptError('target', 'unknown target ...')`。
2. **目录里出现未知文件名**：`readAllFragments` 对每个 `.md` 调 `targetFromFileName`
   （`local-prompts.ts:247`），未知文件名在 `local-prompts.ts:272-282` 抛
   `unknown prompt file (allowed: main.md, …)`。

派发链路确实把 kind 当 target 传：

```ts
// packages/adapter-pi/src/executor.ts:310
const [localErr, localDirectives] = composeLocalDirectivesText(params.root, params.kind)
```

DSH 侧同一调用在 `packages/adapter-dsh/src/executor.ts:483-486`（续用 reinject 路径）与
`packages/adapter-dsh/src/executor.ts:527-530`（新派发路径），失败即 `throw localErr`。

**实测证据**（当前代码、仓库根目录）：

```txt
$ node --input-type=module -e "import {composeLocalDirectivesText} from './packages/core/dist/index.js'; console.log(composeLocalDirectivesText(process.cwd(),'review'))"
[ WorkloomLocalPromptError: workloom local prompts: target: unknown target "review" (must be one of main/research/implement/check/frontend/all), '' ]
```

- 也就是说：只加 `EXECUTOR_KINDS.review` 而不加 `LOCAL_FRAGMENT_TARGETS`/`TARGET_BY_FILE`，
  任何 review 派发都会在组装注入时**直接抛错**，整个派发失败。
- 反向风险同样存在：如果用户先建了 `.workloom/prompts/review.md` 而代码还没支持，
  `readLocalFragments` 会因未知文件名抛错，**所有** kind 的派发一起失败（不是只影响 review）。
- doctor 侧同步面：`packages/core/src/service/doctor-local-prompts.ts:123,126` 的 message/hint
  仍列旧五类文件名，必须补 review（见 01 文件）。
- 相关测试：`packages/core/test/local-prompts.test.js`（target 过滤、未知文件名）、
  `packages/adapter-pi/test/executor.test.ts:427-453`（check/frontend 各自注入对应片段）。
