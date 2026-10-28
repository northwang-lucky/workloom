tasks/10-28-fallback-models:mvrzqwf8ex9rjrl3 — 冲突声明：任务提示要求「不要自行修改实现代码」，executor 合同要求「Fix P2 yourself」且声明合同优先；本轮按合同只修复 P2（2 处源码级机械问题 + 1 条测试缺口），未改任何行为语义，见 §7。

# 复查报告：fallback_models 同类并发轮换

## 1. 结论

**PASS**。PRD 验收 10 条全部有可核对证据；design §3–§8 逐节落地一致；三份注入 spec 逐条对照通过；门禁全绿。未发现 P0/P1。本轮修复 3 处 P2，无遗留问题。

- 复查对象：worktree `.workloom/worktree/10-28-fallback-models`（分支 `workloom/10-28-fallback-models`，base `5b16086`），改动未提交。
- 改动面：53 项 = 47 个已跟踪修改（16 个 src/test + 31 个 dist）+ 6 个新增（2 个 core src + 1 个 core test + 3 个 core dist）。
- 未执行任何 git commit / git push；未触碰 adapter-pi（该包 git status 干净）。
- LSP 工具锚定主 checkout，工作树路径不可用；按注入说明改用 `tsc` / `eslint` 命令行取证，未使用 LSP。

## 2. 门禁证据（本机独立复跑，不采信实现自述）

| 命令 | 结果 | 说明 |
| --- | --- | --- |
| `pnpm lint` | exit 0 | 全部改动完成后复跑一次，无 error/warning、无 eslint ignore |
| `pnpm -r typecheck` | exit 0 | core / adapter-dsh / adapter-pi 三包 Done（core 编辑后复跑；其后只加测试文件，不影响 TS） |
| `pnpm -r build` | exit 0 | 连续构建两次；192 个 core/adapter-dsh dist 文件的 sha256 与 `git status --porcelain` 两次逐字节一致 → dist 与 src 同源、无陈旧产物 |
| `cd packages/core && node --test test/*.test.js` | 698 pass / 0 fail | 含 `dist-dts.test.js`（手写 d.ts 锚点与 dist 逐字节一致） |
| `cd packages/adapter-dsh && node --test test/*.test.js` | 171 pass / 0 fail | 实现期基线 170，本轮新增 1 条 effort 用例 |
| `git diff --check` | 无输出 | 无空白/冲突标记 |
| 手写 d.ts 锚点比对 | 一致 | `executor-rotation.d.ts`、`executor-capacity.d.ts`、`task-store.d.ts` 的 src 与 dist 逐字节相同 |

说明：`pnpm format:check` 不是本仓库门禁（HEAD 基线同文件同样不满足 prettier），故未作为判据；验收命令以 PRD AC10 与 `repo/code-style/verify.md` 为准。

## 3. PRD 验收 10 条逐条对照

| # | 验收项 | 证据 | 判定 |
| --- | --- | --- | --- |
| 1 | 开关默认关闭，零行为变化回归 | `adapter-dsh/test/executor.test.js`「开关关（默认）——同类在跑仍用主模型位」：agentOptions 为主模型、无 `rotated`、记录 `modelSource: legacy`；全部既有 698+170 用例通过 | PASS |
| 2 | 开关开、无同类在跑 | 同名用例「开关开、无同类在跑」：agentOptions/回执/记录与现状一致，`modelSource: legacy` | PASS |
| 3 | 一个同类绑主模型 → fb1 | 「一个同类绑主模型——新派发用 fb1」：agentOptions=provider-b/qwen、回执含 `(rotated: provider-b/qwen)`、记录 `model=provider-b/qwen` + `modelSource=rotate` | PASS |
| 4 | 两个同类（主、fb1）→ fb2；全占用回绕主模型 | 「两个同类在跑」断言 fb2；「池全占用」断言回绕主模型、照常派发、无 rotated、记录维持现状 | PASS |
| 5 | 同轮并行两笔（in-flight 窗口）不撞模型 | 「同轮并行两笔同类派发」：挂起两笔 startActivation，第二笔同步段看到第一笔 in-flight 的 qwen → 取 deepseek；两条记录均 `rotate` 且模型不同 | PASS |
| 6 | 轮换起点不可访问 → 环形转移；整环穷尽链为环形顺序；异步重派同语义 | 「轮换起点不可访问（同步）」断言 3 跳顺序 qwen→deepseek→glm 与记录来源 rotate/fallback；「整环穷尽」断言错误消息 `qwen → deepseek → glm`（每个恰好一次）；「结算后异步重派」断言沿物化链续走 deepseek 且通知/留痕口径不变 | PASS |
| 7 | 显式 model 不轮换、不启用转移链；续用轮不轮换 | 「显式传 model」：链被置空、白名单错误原样抛出、只调用一次 start；「续用轮不受影响」：sendMessage 投递、无新 spawn、无 rotated | PASS |
| 8 | 运行中同类绑定读不到 → 按占用主模型 | 「同类绑定读不到」：旧记录无 model → 视为占主模型 → 顺延 fb1；「绑定三级优先」：进程内登记压过 dispatches 记录 | PASS |
| 9 | 开关非法值按字段路径 fail loud | core `config.test.js`「rotate_on_busy 非布尔按字段路径 fail loud」：字符串/数字/null 与 profile 层非法值均断言 `error.field` 精确到 `...rotate_on_busy`、消息含 `must be a boolean` | PASS |
| 10 | 验证命令全绿 | 见 §2 | PASS |

## 4. design.md 各节落地一致性

- §1 现状事实：与源码一致（绑定解析、`runFallbackChain` 线性消费、容量判定、`DISPATCH_MODEL_SOURCES`、`PARENT_MODEL_LABEL` 原位置）。
- §2 编排：容量闸 → 同步段轮换选取 → in-flight 登记（带模型）→ start，顺序与流程图一致。
- §3 环形物化（重点核对两项自述口径，均成立）：
  - 物化链是「环的剩余部分」：`materializeRingChain` 只取 `pool[(start+step)%len]`（step 1..len-1），**不含起点**；`startIndex=0` 时链即 `[F1..FN]`，与现状恒等。
  - 起点失败后不重复起点、整环每条恰好一次：同步路径 `attemptedModels: [primaryModel]` 再叠加物化链；异步路径 `attemptedModelsUpTo = [primaryModel, ...chain.slice(0, attempt-1)]`，穷尽时 attempt 越过链尾，恰好得到「起点 + 环的剩余部分」全序。同步穷尽用例断言了 `qwen → deepseek → glm` 的实际环形顺序。
  - 继承主模型位双形态：显式 P 进链携带 `effective.effort`；继承 P 进链为 `PARENT_MODEL_LABEL` + `effective.effort`，`buildFallbackAgentOptions` 特判只带 effort（用例断言 `{ reasoningEffort: 'high' }`，无 provider/model）。
  - `FailoverContext.primaryModel` 存起点、`chain` 存物化链、`attempt` 语义不变，结算重派逻辑零改动即可续走。
- §4 纯函数下沉：`core/src/domain/executor-rotation.js` 纯 JS + JSDoc、无 IO、无副作用；手写 `.d.ts` 锚点经 copy 脚本进入 dist；`PARENT_MODEL_LABEL` 单一来源移到 `dispatch-binding.js`，adapter 经 `executor-failover-chain.ts` 转发且保留 `executor-failover.ts` 既有转出口径。
- §5 占用取数：`executor-capacity.ts` 三级优先（进程内登记 → dispatches.model → 缺省 undefined，由 `collectUsedModels` 归一为主模型位）；in-flight 条目新增 model 并透出；core `RunningExecutorRecord.model` 可选、`evaluateExecutorCapacity` 未读取该字段（容量语义零变化）。
- §6 派发编排（重点核对无 await 间隙，成立）：`runCapacityGate` 返回 `{ text, running }` 一次取数两用；新派发路径在 `await runCapacityGate()` 之后，依次执行 `collectUsedModels` → `selectRotationStartIndex` →（必要时）`materializeRingChain` → `buildChildLabel`（同步 readTask）→ `registerInFlightDispatch`（同步）→ 才进入 `await startDispatchWithFailover`，判定与登记之间无 await；续用路径把 `readSpawnBinding`（同步纯读取）上移到登记前，同样无 await 间隙。不轮换路径（开关关 / 显式 model / 续用 / 容量拒绝）保持原顺序。
- §7 配置层：两层同一 `parseSubagentsEntries`，`rotate_on_busy` 必须严格 boolean（有意不用宽松的 `requireBoolean`，与设计「宽化字符串/数字不收」一致），非法值按 `前缀.<kind>.rotate_on_busy` fail loud；仅 true 落内存字段；`resolveSubagentDefaults` 字段级合并 + `configSources.rotateOnBusy`；未配置不落字段。
- §8 值域与文案：`DISPATCH_MODEL_SOURCES` 增 `ROTATE`（校验集合由常量派生，值域只增不减）；`DispatchModelSource` 联合加 `'rotate'`；`surface.ts` description 追加设计与 PRD 指定的英文轮换语义句；回执 `(rotated: <model>)` 与既有 `(failover attempt N: ...)` 可叠加，渲染顺序 rotated 在 failover 前。
- §9 边界表：逐行映射见 §7 表格，均有对应用例。
- §10 测试设计：core 配置/轮换/task-store 用例、adapter §9 用例均交付；本轮补了 1 条链条目 effort 用例（见 §8）。
- §11 部署：`dist/` 已随 src 重建且两次构建幂等；提交时需与 src 同 commit（见 §9 观察项）。

## 5. 注入 spec 逐条对照

- `repo/code-style`：
  - 枚举/常量：新增 `DISPATCH_MODEL_SOURCES.ROTATE`，源码无 `'rotate'` 裸字面量；`PARENT_MODEL_LABEL` 单一来源（本轮把 `surface.ts` 最后一处重复字面量也改为常量，见 §8）；测试外无魔法模型名。
  - 卫语句/无 else-after-return：新增分支均为卫语句风格。
  - 并发：闸判定与 in-flight 登记之间无 await（见 §4 §6）。
  - 参数/类型/私有性：新函数均 ≤3 参或对象封装；TS 侧 `import type` 到位；跨模块消费的函数才导出，`clearChildModelBindings` 与既有测试专用清理函数同款。
  - verify：lint/typecheck/build/test 全绿（§2）。
- `repo/deployment`：core 与 adapter-dsh 的 dist 在 src 改动后重建；两次 `pnpm -r build` 后全量 sha256 与 git status 零差异，无陈旧产物；手写 d.ts 锚点已分发且 `dist-dts.test.js` 通过。dist 为构建产物，提交时须与 src 同 commit。
- `repo/domain-module`：新模块为纯 JS + JSDoc、无 IO；数据兼容按「只增不减」实现——`modelSource` 值域新增 `rotate` 不破坏旧任务目录（旧记录读取仍为 undefined，既有归一化用例通过）、`rotateOnBusy` 为可选配置字段且旧配置文件不出现即零行为变化；未引入 legacy 字段驱动新语义，未改任何既有字段名/默认值。

## 6. 测试覆盖核对（读测试代码本体，非只数数量）

新增用例：core 10 条纯函数 + 3 条配置 + 1 条 task-store；adapter 16 条。design §9 边界表映射：

| design §9 场景 | 对应用例 |
| --- | --- |
| 开关关（默认） | `rotate: 开关关（默认）…（零行为变化）` |
| 开关开、无同类在跑 | `rotate: 开关开、无同类在跑…（AC2）` |
| 同类在跑但绑定三级都读不到 | `rotate: 同类绑定读不到——按占用主模型位归一…（AC8）`；`绑定三级优先` 反证登记优先级 |
| 池全占用 | `rotate: 池全占用——回绕主模型位…（AC4 后半）` |
| 同轮并行两笔 | `rotate: 同轮并行两笔…（AC5）` |
| 轮换起点不可访问（同步） | `rotate: 轮换起点不可访问…（AC6 同步）` |
| 轮换起点运行中失败（结算后） | `rotate: 结算后异步重派沿物化链续走…（AC6 异步）` |
| 继承主模型位绕回 | `rotate: 继承主模型位绕回——PARENT_MODEL_LABEL 条目特判…` |
| 显式 model / 续用轮 | `rotate: 显式传 model…（AC7）`、`rotate: 续用轮不受影响…（AC7 续用）` |
| 插件重启后同类仍在跑 | 由「绑定读不到归一」与「三级优先」共同覆盖（dispatches 回退路径即重启后的取数路径） |
| `max_concurrent` 语义 | 池全占用用例把 kind 上限抬到 4 以过闸，未改计数语义；既有容量用例全绿 |

core 纯函数用例覆盖：无占用/主模型位占用/多占用/全占用/未知模型与空池；i=0 恒等、中段回绕、末位回绕、继承 label 透传、空池 fail loud 与越界防御。

## 7. 本轮修复的 P2（已修，均为机械/证据缺口，无行为语义变化）

1. **P2 — `packages/core/src/surface.ts:315` 回执构造仍硬编码 `'<parent session>'`**：本任务把该 label 的单一来源移到 core `dispatch-binding.js`，`dispatch-binding.js` 也声明「receipt 主模型位…共用同一口径，禁止各处私造字面量」，但同包 `surface.ts` 的 `buildExecutorReceipt` 仍用字面量，重复至少两处。已改为 `import { PARENT_MODEL_LABEL }` 并引用常量（字符串值不变，零行为变化）。
2. **P2 — `packages/core/src/domain/executor-rotation.js:21` JSDoc 返回值区间与上文矛盾**：上文写「池为空时返回 0」，`@returns` 却写 `0..poolModels.length-1`。已改为「池非空时 0..len-1；全占用或空池返回 0」，仅注释。
3. **P2 — PRD 要求 8「链条目自带 effort」缺直接测试证据**：仅「继承主模型位绕回」用例覆盖了 effective.effort 一支；链条目自带 effort 的起步路径（`buildFallbackAgentOptions(rotation)`）无断言。已补 `rotate: 轮到链条目时用条目自带 effort`（主模型 effort=low、fb1 effort=high → agentOptions `reasoningEffort: 'high'`，记录 effort=high 且 modelSource=rotate）。

修复后复跑：`pnpm lint` exit 0、`pnpm -r typecheck` exit 0、`pnpm -r build`（两次幂等）exit 0、core 698 pass、adapter-dsh 171 pass；core 改动产生的 dist（surface.js/.map、executor-rotation.js）已重建并纳入同一未提交改动面。

## 8. 观察项（非问题，供主会话提交时留意）

- 6 个新增文件中有 3 个是 core dist（`executor-rotation.js/.js.map/.d.ts`），当前为 untracked；按部署规范提交时须一并 `git add`，否则 `github:…#path:` 安装会缺文件。
- adapter-pi 零改动（`git status` 无该包路径），符合 PRD 要求 10 的范围约束。
- `executor.ts` 719 行、`executor-failover.ts` 600 行属存量规模（base 已接近/超过 600），本次仅小幅增长，未新增拆分议题。
- 异步整环穷尽顺序未单设用例：其顺序由已单测的 `materializeRingChain` 与既有 `attemptedModelsUpTo` 组合保证，同步穷尽已按实际环形顺序断言；如后续想加保险可补一条异步整环用例。
- 同轮并行用例沿用本仓库既有并发用例的 20ms 时序等待模式（`executor.test.js` 既有「并发闸异步窗口」用例同款），非本次新引入的测试风格。

## Open issues

- none
