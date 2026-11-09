---
version: 1
task: tasks/11-08-rotate-on-busy
codeBaseline: worktree `.workloom/worktree/11-08-rotate-on-busy`（分支 `workloom/11-08-rotate-on-busy`，HEAD `07c7624`；41 文件 staged 未 commit，worktree 零未跟踪文件）; codeFingerprint=25dd75be01f06a1d083d4a146e41a9aade2d905f1504468af32abd48bbc9c103
checkSession: f9e31de9-c9a8-43b8-9cf3-c0bd187469ca
status: passed
startedAt: 2026-11-09T12:47:15+08:00
completedAt: 2026-11-09T12:53:30+08:00
---

# CASE Result: rotate_on_busy 轮换恢复

## Summary

- Static review: `8/8`
- Runtime cases: `5/5; blocked: 0`
- Coverage: `generated`
- Standard verification: `passed`

## Static Review Results

### SR1 配置解析：白名单、严格 boolean、仅 true 落字段与透出

- Status: `passed`
- Evidence: 实读 `packages/core/src/workspace/config-subagent.ts`——白名单加 `rotate_on_busy`（64-72，allowed 清单逐字含该键）；严格校验 `typeof !== 'boolean'` 抛 `WorkloomConfigError`（100-104，field 为 `${prefix}.${name}.rotate_on_busy`，reason `must be a boolean`）；仅 true 落 `parsed.rotateOnBusy = true`（107）；`resolveSubagentDefaults` 命中条目透出（351-352、380）；`config.d.ts:117` 与 `config.d.ts:159` 两处 `rotateOnBusy?: boolean`；`grep rotateOnBusy packages/core/src` 除解析与类型面零命中；`sources/configSources` 形状未扩展（现场裁定 3 的最小实现，SR1 检查 5 只验 result 透出口径）。证据：`case-evidence/sr-static-review.log`、`case-evidence/c1-config-probe.log`、`case-evidence/c1-config-tests.log`。
- Findings: none

### SR2 轮换纯函数：选取与环形物化

- Status: `passed`
- Evidence: 实读 `packages/dsh-workloom/src/dispatch/executor-rotation.ts`（130 行）——`RotationPoolEntry`（25）、组合纯函数 `decideRotationStart`（46，非 async、无 Promise/await）、`selectRotationStartIndex`（87，池序返回首个未占用、全占用或空池 0）、`materializeRingChain`（110，空池 `pool must not be empty`、`Math.max(0, Math.min(...))` 夹回、`startEntry` + 环序后继链）；`grep selectRotationStartIndex|materializeRingChain packages/core/src` 零命中。现场裁定 1：轮换判定抽为 `decideRotationStart`，SR7 检查 3/4 在该落位核验。证据：`case-evidence/sr-static-review.log`、`case-evidence/c2-rotation-tests.log`（10/10）、`case-evidence/c2-rotation-probe.log`（含 decide 组合纯函数的开关关/显式 model/空链/全占用空决策）。
- Findings: none

### SR3 容量面：model 承载与占用取数三级

- Status: `passed`
- Evidence: 实读 `executor-capacity.ts`——`InFlightEntry.model?`（38/45）、`registerInFlightDispatch(seq, role, model?)`（73）、`getInFlightDispatches` 带 model（90 起）、`collectRunningExecutors` 从 dispatches 取 `modelByChildId`（186）、`collectUsedModels` 同角色过滤与 `record.model ?? primaryModelLabel` 保守归一（208-217）；`evaluateCapacityGate` 签名与 core 判定未变（不读 model）；未知角色只占全局槽 + WARNING 分支保留。证据：`case-evidence/sr-static-review.log`、`case-evidence/c2-occupancy-probe.log`、`case-evidence/c2-executor-tests.log`、`case-evidence/c2-orchestration-checklist.log`。
- Findings: none

### SR4 派发绑定留痕：buildNewDispatchBinding 的 rotation 分支

- Status: `passed`
- Evidence: 实读 `dispatch-binding.ts`——第四可选参数 `rotation`（55），传入时直接返回选中条目且 `modelSource: 'rotate'`（60-63），不传时走 `resolveDispatchModelSource` 原逻辑（65 起）；`grep modelSource.*rotate` 的代码写入单点在该模块（executor.ts 仅调用与注释）。证据：`case-evidence/sr-static-review.log`、`case-evidence/c4-trace-probe.log`、`case-evidence/c5-dsh-tests.log`（dispatch-binding.test 的 rotation 用例）。
- Findings: none

### SR5 回执标注：TurnMeta.rotation 与 (rotated: <model>)

- Status: `passed`
- Evidence: 实读 `executor-continuation.ts`——`TurnMeta.rotation?: { model: string }`（44）；`buildTurnReceiptText` 在 reused 后逐字追加 ` (rotated: ${meta.rotation.model})`（83-87），forced→reused→rotated 顺序；无 rotation 时输出不含 rotated。证据：`case-evidence/sr-static-review.log`、`case-evidence/c4-trace-probe.log`、`case-evidence/c4-chain-tests.log`（receipt 用例逐字尾部校验）。
- Findings: none

### SR6 重试衔接：RespawnContext.failoverChain 与链取值优先

- Status: `passed`
- Evidence: 实读 `executor-settle.ts`——`failoverChain?: SubagentFallbackModel[]`（113，现场裁定 2：复用 core 既有类型，与 plan 结构同构）；链取值 `respawn.failoverChain ?? (惰性 loadConfig/resolveSubagentDefaults 重算)`（420-425，有链时不执行配置重算）；next 判定 `fallbackChain.find(entry => entry.model !== deadModel)`（426）不变；一跳/结算逻辑未动（fallbackOf 硬挡、fallbackAttempt=2、modelSource='fallback'）。证据：`case-evidence/sr-static-review.log`、`case-evidence/c4-chain-tests.log`（链优先与链耗尽用例）、`case-evidence/c4-code-anchors.md`。
- Findings: none

### SR7 executor.ts 同步段接线与无 await 纪律

- Status: `passed`
- Evidence: 实读 `executor.ts`——`runCapacityGate` 返回 `{ text, running }`（355-373），续用与新派两个调用点均读 `.text`（394/395、471/472），`collectRunningExecutors` 全文件仅 1 次调用；轮换段只在新派发 `else` 分支（480），容量拒绝 return 在 472 先于轮换；`decideRotationStart` 调用（480-489）到 `generateDispatchSeq`（494）与 `registerInFlightDispatch`（495）之间实读无 await（排除注释行后零命中），`decideRotationStart` 本身同步；登记携选定模型（续用 407-411、新派 495）；spawn 用 `selected`（490/499）；记录传 `decision.rotation`（535）；`trackDispatchSettle` 传选定绑定与 `failoverChain`（552-557）；receipt 传 rotation（592）；`wc -l executor.ts` = 599（低于 600）；头注释轮换描述与模块边界指向已同步（55-74）。证据：`case-evidence/sr-static-review.log`、`case-evidence/c3-code-anchors.md`、`case-evidence/c4-code-anchors.md`。
- Findings: none

### SR8 PARENT_MODEL_LABEL 导出恢复与单源

- Status: `passed`
- Evidence: 实读 `surface.ts:182` `export const PARENT_MODEL_LABEL = '<parent session>'`（注释同步为导出单源）；`index.ts:345` 具名重导出；`grep PARENT_MODEL_LABEL packages/core/src` 仅 surface.ts（定义与 receipt 使用）与 index.ts（重导出）；`grep '<parent session>' packages/dsh-workloom/src` 零命中（无 Magic String）。证据：`case-evidence/sr-static-review.log`、`case-evidence/c5-build.log`、`case-evidence/c5-typecheck.log`。
- Findings: none

## Runtime Results

### C1 配置解析五形态与透出

- Status: `passed`
- Executed at: `2026-11-09T12:49:41+08:00`
- Actions:
  1. `cd packages/core && node --test test/config.test.ts`（80 用例）。
  2. `node <task>/case-evidence/probes/c1-config-probe.mjs`：true/false/字符串 `"true"`/数字 1/缺省五形态、全局层、白名单联动。
- Observed: config.test 80/80 通过（含新增五形态段 1059-1136）；探针全部 PASS——true 落 `rotateOnBusy` 且 resolve 透出 true；false 与缺省条目与 result 均不含该属性；`"true"`、`1`、`null` 均抛 `WorkloomConfigError`，`field` 逐字 `subagent_profiles[0].roles.developer.rotate_on_busy`，文案含 `must be a boolean`；全局层 true 解析通过；未知字段 `foo` 的报错 allowed 清单含 `rotate_on_busy`。`configSources` 无 rotateOnBusy 细分（现场裁定 3）。
- Evidence:
  - `case-evidence/c1-config-tests.log`
  - `case-evidence/c1-config-probe.log`
- Findings: none

### C2 轮换选取、环序物化与占用取数三级

- Status: `passed`
- Executed at: `2026-11-09T12:49:49+08:00`
- Actions:
  1. `pnpm -r build`。
  2. `cd packages/dsh-workloom && node --test test/executor-rotation.test.ts`。
  3. `node <task>/case-evidence/probes/c2-rotation-probe.mjs`。
  4. `node <task>/case-evidence/probes/c2-occupancy-probe.mjs`。
  5. `cd packages/dsh-workloom && node --test test/executor.test.ts`（122 用例，含执行轮新增的旧 kind 占用用例）并定位三组编排级取数用例。
- Observed: build 退出码 0；rotation 测试 10/10；rotation 探针 ALL PASS（池序 0/1/2、全占用 0、空池 0、池外占用不影响、起点 2 链 `[fb3, primary, fb1]`、起点 0 恒等链、末位回绕、越界 9 与 -1 夹回、空池抛 `pool must not be empty`、effort 透传、decide 组合函数四类空决策与继承形态归一）；occupancy 探针 ALL PASS（旧 kind `implement` 记录归一为 developer 且取 `provider-b/fb1`；无记录 child 的 model 字段不出现；`collectUsedModels` 含旧值模型、in-flight 模型与保守归一的 `<parent session>`；异角色不参与；释放后消失）；executor.test 122/122，三组编排用例定位——in-flight 登记携带、dispatches 记录（含旧值归一）、保守归一，清单见证据文件。
- Evidence:
  - `case-evidence/c2-build.log`
  - `case-evidence/c2-rotation-tests.log`
  - `case-evidence/c2-rotation-probe.log`
  - `case-evidence/c2-occupancy-probe.log`
  - `case-evidence/c2-executor-tests.log`
  - `case-evidence/c2-orchestration-checklist.log`
- Findings: `packages/dsh-workloom/test/executor.test.ts:3675` [P2] AC2 要求的“dispatches 记录含旧值归一”编排级用例缺失（原三级取数用例仅用新 kind 值）— 已自修，见 Resolved Findings。

### C3 四路径零变化：记录与回执无轮换痕迹

- Status: `passed`
- Executed at: `2026-11-09T12:50:26+08:00`
- Actions:
  1. `cd packages/dsh-workloom && node --test --test-name-pattern='轮换编排：四路径零变化' test/executor.test.ts`。
  2. 读 `executor.ts` 与 `executor-rotation.ts` 记录四路径相对轮换段的分流行号，并检索 `rotated`/`rotate` 字样。
- Observed: 定向用例 1/1 通过（同一用例内 a 开关关、b 显式 model、c 续用轮、d 容量拒绝四分支；断言分别覆盖 spawn 现状绑定与 `modelSource='fallback'`、显式 model 的 `modelSource='param'`、续用 `modelSource='spawn'`、容量拒绝不 spawn/不追加记录且 `at capacity (3/3)`，四者 receipt 均不含 `rotated`）。代码面：续用分支独立于 375、容量拒绝 472 先于轮换 480、进入条件在 `executor-rotation.ts:55`、回绕零留痕在 `executor-rotation.ts:75`；`rotated` 字样仅存在于 receipt 模板与 executor 注释。
- Evidence:
  - `case-evidence/c3-four-paths-tests.log`
  - `case-evidence/c3-code-anchors.md`
- Findings: none

### C4 轮换留痕、物化链衔接与一跳后继

- Status: `passed`
- Executed at: `2026-11-09T12:50:31+08:00`
- Actions:
  1. `node <task>/case-evidence/probes/c4-trace-probe.mjs`（binding 与 receipt 纯函数）。
  2. `node --test --test-name-pattern='轮换编排：主模型位与 F1 被占用|轮换编排：全占用回绕' test/executor.test.ts`。
  3. `node --test --test-name-pattern='failover: respawn|receipt: rotation' test/executor.test.ts`。
  4. 读 executor.ts / executor-settle.ts / executor-rotation.ts / executor.test.ts 记录代码与用例锚点。
- Observed: trace 探针 ALL PASS（rotation 分支 `{model, effort, modelSource:'rotate'}`、无 rotation 的 param/inherit 现状不变、receipt 尾部逐字 ` (rotated: provider-b/fb1)`、无 rotation 不含 rotated、forced→reused→rotated 顺序）；轮换编排 2/2 通过——主模型位与 F1 占用时起步 F2，记录 `modelSource='rotate'`、receipt 尾部标注、`deadModel=f2` 一跳重派回环序后继 `main`（记录 `modelSource='fallback'`、`fallbackOf='child-1'`），全占用回绕用例 spawn 主模型位、记录无 rotate、receipt 无标注、结算回落配置链；链衔接 3/3 通过——`respawn.failoverChain` 优先取起点后继（不读配置链）、链耗尽不重派附穷尽文案、receipt 逐字标注。
- Evidence:
  - `case-evidence/c4-trace-probe.log`
  - `case-evidence/c4-executor-tests.log`
  - `case-evidence/c4-chain-tests.log`
  - `case-evidence/c4-code-anchors.md`
- Findings: none

### C5 标准验证全表与 dist 守卫

- Status: `passed`
- Executed at: `2026-11-09T12:50:55+08:00`
- Actions:
  1. `pnpm -r build`
  2. `pnpm -r typecheck`
  3. `pnpm lint`
  4. `cd packages/core && pnpm test`
  5. `cd packages/dsh-workloom && pnpm test`
  6. `git status --porcelain packages/core/dist packages/dsh-workloom/dist` 与 `git status --porcelain`
  7. `git diff HEAD --stat` 与 `git diff HEAD --name-only`
- Observed: 前三条退出码 0（lint 无 error/warning）；core 713/713（0 fail），含“手写 src/<子包>/*.d.ts 与 dist/<子包>/ 同名文件内容一致”与“src 源文件集合与 dist 的 .js 集合镜像相等（排除 .d.ts）”；dsh 212/212（0 fail），含同款 dist 镜像守卫（211 为实施侧基数，+1 为执行轮 P2 新增用例）；变更集 41 文件全部 staged，0 unstaged、0 untracked；build 后 dist 与 src 镜像一致。work commit 未落（2.3 先于 2.4）：41 文件 staged 为预期状态，照实记录并注明待主会话 2.4 单一 work commit 落地，同 commit 结论由主会话提交时复核。
- Evidence:
  - `case-evidence/c5-build.log`
  - `case-evidence/c5-typecheck.log`
  - `case-evidence/c5-lint.log`
  - `case-evidence/c5-core-tests.log`
  - `case-evidence/c5-dsh-tests.log`
  - `case-evidence/c5-dist-status.log`
  - `case-evidence/c5-change-set.log`
- Findings: none

## Coverage

- Status: `generated`
- Tool: Node.js v24 内置测试覆盖率（`node --test --experimental-test-coverage`）与原生 lcov reporter
- Command:
  ```bash
  MAIN=$(cd "$(git rev-parse --git-common-dir)/.." && pwd)
  TASK="$MAIN/.workloom/tasks/11-08-rotate-on-busy"
  mkdir -p "$TASK/coverage"
  cd packages/core
  node --test --experimental-test-coverage \
    --test-coverage-include='src/**' --test-coverage-include='dist/**' \
    --test-reporter=spec --test-reporter-destination=stdout \
    --test-reporter=lcov --test-reporter-destination="$TASK/coverage/core.lcov.info" \
    'test/*.test.ts' 'resources/skills/workloom-packages-scan/scripts/*.test.ts'
  cd ../dsh-workloom
  node --test --experimental-test-coverage \
    --test-coverage-include='src/**' --test-coverage-include='dist/**' \
    --test-reporter=spec --test-reporter-destination=stdout \
    --test-reporter=lcov --test-reporter-destination="$TASK/coverage/dsh-workloom.lcov.info" \
    'test/*.test.ts'
  ```
- Overall lines: `2711/2807 (96.6%)`
- Raw reports:
  - `coverage/core.lcov.info`
  - `coverage/dsh-workloom.lcov.info`

### Changed Files

| File | Covered/Total | Line coverage | Uncovered lines | Details |
| --- | --- | --- | --- | --- |
| `packages/core/src/workspace/config-subagent.ts` | `535/536` | `99.8%` | `239` | `coverage/core.lcov.info` |
| `packages/core/src/injection/surface.ts` | `463/485` | `95.5%` | `407-408,449-460,470-474,483-485` | `coverage/core.lcov.info` |
| `packages/dsh-workloom/src/dispatch/dispatch-binding.ts` | `74/74` | `100.0%` | `-` | `coverage/dsh-workloom.lcov.info` |
| `packages/dsh-workloom/src/dispatch/executor-capacity.ts` | `230/238` | `96.6%` | `176-183` | `coverage/dsh-workloom.lcov.info` |
| `packages/dsh-workloom/src/dispatch/executor-continuation.ts` | `163/172` | `94.8%` | `117,138-143,150-151` | `coverage/dsh-workloom.lcov.info` |
| `packages/dsh-workloom/src/dispatch/executor-rotation.ts` | `128/130` | `98.5%` | `122-123` | `coverage/dsh-workloom.lcov.info` |
| `packages/dsh-workloom/src/dispatch/executor-settle.ts` | `540/573` | `94.2%` | `203-205,213-214,217-219,319,323,327,387,456-469,485-486,495-496,539-540,572` | `coverage/dsh-workloom.lcov.info` |
| `packages/dsh-workloom/src/dispatch/executor.ts` | `578/599` | `96.5%` | `226-227,230-233,236-239,277-278,310-311,510-514,575-576` | `coverage/dsh-workloom.lcov.info` |

### Exclusions

| Path | Reason |
| --- | --- |
| `packages/core/dist/` | `构建产物，C5 验 build 后与 src 镜像一致（dist-mirror），同 commit 由主会话提交时复核` |
| `packages/dsh-workloom/dist/` | `构建产物，C5 验 build 后与 src 镜像一致（dist-mirror），同 commit 由主会话提交时复核` |
| `packages/core/test/` | `测试探针自身（含 config 五形态与透出用例），C1 与 C5 验全绿` |
| `packages/dsh-workloom/test/` | `测试探针自身（含 executor-rotation 新单测与轮换编排、四路径、链衔接用例），C2 至 C5 验全绿` |
| `**/*.d.ts` | `类型声明面（config.d.ts 的 rotateOnBusy 字段与手写锚点），无运行时行；字节一致由 dist-dts 守卫与 C5 验证` |
| `**/*.js.map` | `构建映射产物，无运行时行` |
| `packages/core/src/index.ts` | `导出面改线（PARENT_MODEL_LABEL 具名重导出），无独立运行时逻辑；由 build、typecheck 与 SR8 验证` |

### Collection Failure

none

## Standard Verification

| Command | Exit code | Evidence |
| --- | --- | --- |
| `pnpm -r build` | `0` | `case-evidence/c5-build.log` |
| `pnpm -r typecheck` | `0` | `case-evidence/c5-typecheck.log` |
| `pnpm lint` | `0` | `case-evidence/c5-lint.log`（无 error 与 warning） |
| `cd packages/core && pnpm test` | `0` | `case-evidence/c5-core-tests.log`（713/713，0 fail，含 dist-mirror 与 dist-dts 守卫） |
| `cd packages/dsh-workloom && pnpm test` | `0` | `case-evidence/c5-dsh-tests.log`（212/212，0 fail，含 dist-mirror 守卫） |

## Resolved Findings

- `packages/dsh-workloom/test/executor.test.ts:3675` [P2] AC2 要求“dispatches 记录含旧值归一”的编排级用例缺失（原三级取数用例仅用新 kind 值；行为本身已在视图归一与容量模块双重承载）— fixed: 新增“轮换编排：dispatches 记录旧 kind 值经归一后计入占用（顺延到首个 fallback）”用例，fixture 为 `kind: 'implement'` + `model: provider-a/main` 的 running 记录，断言旧值归一为 developer 后主模型位计入占用、起步顺延 F1、记录 `modelSource='rotate'`、receipt 尾部 `(rotated: provider-a/f1)`；dsh 套件 211→212 全绿，受影响项（executor.test、两包全量、lint、build/typecheck）已复跑。

## Open issues

- none
