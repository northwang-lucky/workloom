---
version: 1
task: tasks/11-08-rotate-on-busy
---

# CASE: rotate_on_busy 轮换恢复

## References

- PRD: `prd.md`
- Implementation: `plan.md`（9 条设计决定 / 6 个实施步骤；行号锚点以 main HEAD `4409d82` 为准，终态以步骤 6 的单一 work commit 为准）
- Code target: worktree `.workloom/worktree/11-08-rotate-on-busy`（分支 `workloom/11-08-rotate-on-busy`，代码基线 `main`@`4409d82`；HEAD `07c7624` 仅承载任务工件）。下文相对路径以该 worktree 为根；`<task>` 指主检出侧任务目录 `.workloom/tasks/11-08-rotate-on-busy`（本文件所在，不是 worktree 副本），可用 `$(cd "$(git rev-parse --git-common-dir)/.." && pwd)/.workloom/tasks/11-08-rotate-on-busy` 解析。
- Facts: 旧实现事实源 git `62332be^`（`packages/core/src/dispatch/executor-rotation.js` 与 `packages/core/test/executor-rotation.test.ts`、`packages/dsh-workloom/src/dispatch/executor.ts` 轮换段、`packages/core/src/workspace/config.js` 解析口径）；全程只读 git 历史，不修改历史对象。
- Source task: none（容器任务 workloom-sop 重构的子任务八）

## Scope

- Requirements: R1、R2、R3、R4、R5、R6、R7
- Acceptance criteria: AC1、AC2、AC3、AC4、AC5
- Out of scope:
  - 容量闸语义（max_concurrent 判定不变）、单次重试语义（settle 钩子逻辑不变）、画像节形态、spec 与 workflow 文档更新、生产 pin 切换与全局配置迁移执行（PRD 非目标）。
  - 生产 DSH 实例操作：端口 3088 的 `dsh web` 不重启、不执行 `dsh-stop`/`dsh-start`、不改 profile 与 pnpm-lock；全部探针在 worktree 内经 node 直跑，生产目录只读。
  - 代码提交：CASE 执行轮零 commit/push；步骤 6 的单一 work commit 由主会话执行，本 CASE 只观察变更集与 dist 新鲜度（见 C5 与结果纪律的容忍条款）。
  - 测试先行不作强制交付模式（PRD Notes：行为恢复类），验证以既有全量套件加新增钉住测试为准。
  - 探针夹具只建在隔离 HOME 与 TMPDIR 下并自清理；CASE 产物只写主检出 `<task>`（case-result.md、case-evidence/、coverage/），worktree 保持只有代码变更。

## Static Review

### SR1 配置解析：白名单、严格 boolean、仅 true 落字段与透出

- Covers: AC1
- Target: `packages/core/src/workspace/config-subagent.ts#parseProfileEntries`
- Checks:
  1. 条目字段白名单加 `rotate_on_busy`：允许键集合为 model、effort、fallback_models、rotate_on_busy、max_concurrent、tools；unknown field 报错文案的 allowed 清单同步含 `rotate_on_busy`；报错字段路径仍为 `${prefix}.${name}.${key}`。
  2. 严格 boolean：`spec.rotate_on_busy !== undefined` 时 `typeof spec.rotate_on_busy !== 'boolean'` 立即抛 `WorkloomConfigError`；`field` 逐字为 `${prefix}.${name}.rotate_on_busy`，reason 为 `must be a boolean`；字符串 `"true"`、数字 `1` 与 null 一律抛错，不做隐式转换或宽化收受。
  3. 仅显式 true 落字段：解析分支只在值为 `true` 时写 `parsed.rotateOnBusy = true`；`false` 与缺省不写该属性（结果对象以 `'rotateOnBusy' in entry` 判定为 false，不写 false 占位）。
  4. 类型面：`packages/core/src/workspace/config.d.ts` 的 `SubagentConfigEntry` 增 `rotateOnBusy?: boolean`，`ResolveSubagentDefaultsResult` 增 `rotateOnBusy?: boolean`；手写 d.ts 与 build 后 dist 同名文件字节相等（dist-dts 守卫）。
  5. 透出链：`resolveSubagentDefaults` 从命中条目透出该字段（仅 true 时属性出现，false/缺省/未命中不定义属性），与 model、effort、fallbackModels 的字段级合并口径一致；`sources`、`configSources` 形状不变。
  6. 单点：`grep -rn "rotateOnBusy" packages/core/src` 的代码命中仅解析模块与类型声明（注释与测试除外）；`grep -rn "rotate_on_busy" packages/core/src` 的字段字面仅解析模块；其他模块不重定义或缓存该开关。
- Expected: 五种形态可判定（true 落字段、false 与缺省不落、字符串与数字抛错且文案含字段路径），解析、类型与透出均为单点。

### SR2 轮换纯函数：选取与环形物化

- Covers: AC2
- Target: `packages/dsh-workloom/src/dispatch/executor-rotation.ts#whole-file`
- Checks:
  1. 落位：新文件 `packages/dsh-workloom/src/dispatch/executor-rotation.ts` 存在；`selectRotationStartIndex` 与 `materializeRingChain` 具名导出，池条目类型为 `{ model: string; effort?: string }`；`grep -rn "selectRotationStartIndex\|materializeRingChain" packages/core/src` 零命中（core 不再承载实现）。
  2. `selectRotationStartIndex`：按 `poolModels` 顺序扫描，返回首个 `!usedModels.has(model)` 的下标；全占用或空池返回 0；占用集合含池外 label 不影响选取；不修改入参。
  3. `materializeRingChain`：空池抛可判定错误且 message 含 `pool must not be empty`；`start = Math.max(0, Math.min(startIndex, pool.length - 1))`（负值与超大值都夹回池内）；`startEntry` 为 `pool[start]`；`chain[i]` 为 `pool[(start + i + 1) % pool.length]`，长度 length-1、不含起点、绕回段含下标 0 的主模型位条目。
  4. 纯同步：无 IO、无副作用、无 await/Promise；头注释写明环形物化协议（起始条目加环序剩余线性链）与全占用回绕主模型位的设计意图；TS 重写文件不含 JS/JSDoc-only 形态。
  5. 使用面：executor.ts 经 import 使用两函数，全仓无第二份实现；`packages/dsh-workloom/test/executor-rotation.test.ts` 存在并覆盖池序、全占用、空池、越界、物化链序（通过性由 C2 验证）。
- Expected: 两纯函数语义与旧实现逐条一致，落位 dsh 派发链路，空池与越界行为可判定。

### SR3 容量面：model 承载与占用取数三级

- Covers: AC2
- Target: `packages/dsh-workloom/src/dispatch/executor-capacity.ts#collectUsedModels`
- Checks:
  1. `InFlightEntry` 增 `model?: string`；`registerInFlightDispatch(seq, role, model?)` 第三参可选（旧两参调用零改动编译与运行）；`getInFlightDispatches` 把 model 带入 `RunningExecutorRecord`（有值才落属性），role 归一逻辑保留。
  2. `collectRunningExecutors` 填充 model：in-flight 条目直接携带；dispatches 记录取归一后视图的 `d.model`；listDescendants 无记录项不落 model；合并顺序与续用 `excludeChildId` 语义不变。
  3. `collectUsedModels(running, role, primaryModelLabel)` 导出：仅统计 `record.role === role`（空角色不计同类）；`used.add(record.model ?? primaryModelLabel)`；返回 `Set<string>`；纯函数无 IO、不修改入参。
  4. 容量判定零变化：`evaluateCapacityGate` 签名与 core `evaluateExecutorCapacity` 入参不变，判定不读 model；in-flight 合并与续用排除目标 child 的语义保持。
  5. 角色归一：dispatches 记录的角色来源仍是 `readTaskView` 归一后的 `d.kind`（历史旧 kind 值经兼容读计入对应角色）；容量模块自身对 rawRole 的 `tryNormalizeExecutorRole` 分支保留（未知值只占全局槽并加 WARNING）。
- Expected: 一、二、三级取数各有明确来源与保守归一，容量语义零变化。

### SR4 派发绑定留痕：buildNewDispatchBinding 的 rotation 分支

- Covers: AC4
- Target: `packages/dsh-workloom/src/dispatch/dispatch-binding.ts#buildNewDispatchBinding`
- Checks:
  1. 第四可选参数 `rotation?: { model: string; effort?: string }`；传入时返回 `{ model: rotation.model, ...(rotation.effort !== undefined ? { effort } : {}), modelSource: 'rotate' }`；`'rotate'` 取值来自 core 既有值域（`DISPATCH_MODEL_SOURCES.ROTATE` 或既有单点常量），不新增类型成员。
  2. 不传 rotation 时逐字保持现状：param > whenMain/fallback > inherit；inherit 取主模型快照；effort 未解析不落字段；modelSource 恒有值。
  3. 与续派面正交：executor.ts 的 reused 分支仍走 `buildSpawnEntryBinding`，不传 rotation；binding 模块不感知续用。
  4. `'rotate'` 从惰性历史值转活：dsh src 存在实际写入路径（executor.ts 把 rotation 传入 `buildNewDispatchBinding`）；`grep -rn "modelSource.*rotate" packages/dsh-workloom/src` 命中 binding 单点（与 SR7 调用点互验）。
- Expected: 轮换起步的绑定写 modelSource=rotate 与实际选定值，未轮换路径零变化。

### SR5 回执标注：TurnMeta.rotation 与 (rotated: <model>)

- Covers: AC4
- Target: `packages/dsh-workloom/src/dispatch/executor-continuation.ts#buildTurnReceiptText`
- Checks:
  1. `TurnMeta` 增可选 `rotation?: { model: string }`；`buildTurnReceiptText` 在 reused 后缀之后追加 `rotation !== undefined ? ` (rotated: ${rotation.model})` : ''`。
  2. 逐字形态：前导一个空格、`rotated` 小写、冒号后一个空格、无尾随句点；标注顺序 forced → reused → rotated。
  3. 无 rotation 时输出与现状逐字一致（仅 forced/reused 两段）；续用轮（reused）不注入 rotation（调用点不组合），回执无 rotated。
  4. 主模型位起步（startIndex=0）不置 meta.rotation、无标注；开关关、显式 model、容量拒绝路径同样无 rotation（与 SR7、C3 互验）。
- Expected: 轮换起步回执尾逐字 ` (rotated: <实际选定模型>)`，未轮换路径零标注。

### SR6 重试衔接：RespawnContext.failoverChain 与链取值优先

- Covers: AC4
- Target: `packages/dsh-workloom/src/dispatch/executor-settle.ts#runModelFailoverRetry`
- Checks:
  1. `RespawnContext` 增可选 `failoverChain?: { model: string; effort?: string }[]`；注释说明链来自派发组装（轮换起步为物化环序链）。
  2. 链取值优先：`const chain = respawn.failoverChain ?? 配置重算链`；有 `failoverChain` 时不执行 `loadConfig` 与 `resolveSubagentDefaults`（惰性可见），无该字段时回落现行配置重算，旧登记路径零行为变化。
  3. next 判定不变：`chain.find(entry => entry.model !== deadModel)`；对物化链即环序后继（链首元素），对配置链与现状语义恒等。
  4. 一跳与结算逻辑不变：fallbackOf 非空硬挡、无链或链耗尽走 `finishWithoutRetry`、重派记录写 fallbackOf/fallbackAttempt=2/modelSource='fallback'、prompt 保留原文加尾部 note、独立 AbortController。
  5. 登记透传：`trackDispatchSettle` 的 respawn 参数透传可选 failoverChain；executor.ts 轮换起步传物化链、非轮换不传（字段缺省不改变旧登记语义）。
- Expected: 轮换起步的一跳重试消费物化链首元素，非轮换路径回落到现行配置重算。

### SR7 executor.ts 同步段接线与无 await 纪律（AC2 静态承载项）

- Covers: AC2、AC3、AC4
- Target: `packages/dsh-workloom/src/dispatch/executor.ts#executeTool`
- Checks:
  1. `runCapacityGate` 返回 `Promise<{ text: string | null; running: RunningExecutorRecord[] }>`（一次取数两用）；续用与新派两个调用点都读 `text`，新派点保留 `dispatchGate.running` 供轮换选取；executor.ts 内 `collectRunningExecutors` 只调用一次，无第二次 listDescendants 取数。
  2. 进入条件与次序：`effective.rotateOnBusy === true && params.model === undefined && effective.fallbackModels 非空`，且轮换段只在新派发分支（续用分支结构上不可达）；容量闸拒绝的 return 位于轮换段之前，次序不可颠倒。
  3. 池与选取：`primaryEntry = { model: effective.model ?? PARENT_MODEL_LABEL, ...(effort) }`；`pool = [primaryEntry, ...effective.fallbackModels]`；`usedModels = collectUsedModels(dispatchGate.running, params.role, primaryEntry.model)`；`startIndex = selectRotationStartIndex({ poolModels: pool.map(e => e.model), usedModels })`；`startIndex > 0` 时 `materializeRingChain` 并置 rotation 状态（选定条目、链、回执标注、绑定留痕四点联动），`startIndex = 0`（含全占用回绕）不置 rotation、零留痕。
  4. 无 await 纪律（AC2 明确由静态观察承载）：读取新派发分支，自 `await runCapacityGate()` 返回到 `registerInFlightDispatch(dispatchSeq, ...)` 之前的代码段不得出现 `await`（字符串与注释中的字样排除）；轮换若抽为私有函数，该函数必须同步（非 async、不返回 Promise）且调用点不 await；判定、池构建、选取、物化、序号生成与登记之间无 IO 回调。
  5. 选定模型贯通：新派登记 `registerInFlightDispatch(dispatchSeq, params.role, selectedModel)`（轮换为选中条目模型，非轮换为 `effective.model ?? PARENT_MODEL_LABEL`）；续用登记 `registerInFlightDispatch(continueSeq, params.role, spawnBinding?.model ?? effective.model ?? PARENT_MODEL_LABEL)` 且读绑定先于登记；spawn 的 model/effort 用选定条目（轮换覆盖 effective，effort 缺省不传）；记录用 `buildNewDispatchBinding(params, effective, mainModel, rotation)`；`trackDispatchSettle` 的 binding 用选定条目并增传 failoverChain（仅轮换）；receipt 组传入 rotation。
  6. 四路径零变化代码面：开关缺省或 false、显式 `params.model !== undefined`、续用轮、容量拒绝四场景均在轮换段之前分流，不置 rotation，故 modelSource 不为 'rotate'、receipt 无 rotated；容量拒绝路径不写 dispatches、不 spawn。
  7. 规模与注释：`wc -l packages/dsh-workloom/src/dispatch/executor.ts` 低于 600（按需抽同步私有模块，抽取后接线检查按新落位复核）；头注释补轮换编排说明，模块边界句的 receipt 渲染指向改为 executor-continuation.ts（修正过期指向）；无 Magic String（PARENT_MODEL_LABEL 从 core 导入，不本地拼 `<parent session>`）。
- Expected: 同步段接线完整且无 await 间隙，四路径在结构上不可能进入轮换，选定模型在全链一致。

### SR8 PARENT_MODEL_LABEL 导出恢复与单源

- Covers: AC2
- Target: `packages/core/src/injection/surface.ts#PARENT_MODEL_LABEL`
- Checks:
  1. `surface.ts` 的 `PARENT_MODEL_LABEL` 从模块内私有恢复具名导出：`export const PARENT_MODEL_LABEL = '<parent session>'`，值逐字不变；注释从「模块内单源不再对外导出」改为「导出单源，dsh 轮换池与 receipt 共用」。
  2. core `index.ts` 的 surface 导出块补 `PARENT_MODEL_LABEL` 具名重导出（沿现有具名清单风格，无 `export *`）。
  3. dsh 侧从 `@workloom-ai/core` 导入该常量用于池主模型位；`grep -rn "<parent session>" packages/dsh-workloom/src` 零命中（禁 Magic String）。
  4. 单源无第二定义：`grep -rn "PARENT_MODEL_LABEL" packages/core/src` 仅 surface.ts（定义与 receipt 使用）与 index.ts（重导出）；build 后 core dist 可解析该导出（C5 的 build/typecheck 与 dsh 测试验证）。
- Expected: 主模型位 label 在 core 单源导出，dsh 经包接口使用，无重复字面量。

## Runtime Cases

### C1 配置解析五形态与透出

- Covers: AC1
- Preconditions:
  1. worktree 依赖就位（pnpm install 已执行，node v24 原生 TS type stripping）。
  2. 探针在隔离 HOME 与 TMPDIR 下运行，导入 `packages/core/src/index.ts`（不经 dist），不写生产目录。
- Steps:
  1. `cd packages/core && node --test test/config.test.ts`，在输出中定位五形态用例与 resolve 透出用例并记录用例名。
  2. 探针（`<task>/case-evidence/probes/c1-config-probe.mjs`）：五个独立临时项目分别构造 `subagent_profiles: [{ roles: { developer: { rotate_on_busy: <形态> } } }]`——true、false、字符串 `"true"`、数字 `1`、缺失；对合法形态调用 `loadConfig(root, { homeDir })` 并检查条目字段，对非法形态检查抛错。
  3. 同一探针续：true 形态 `resolveSubagentDefaults(config, 'developer', {}, 'p/main').rotateOnBusy === true`；false 与缺省形态结果以 `'rotateOnBusy' in result === false` 判定；非法形态检查 `error instanceof WorkloomConfigError`、`error.field === 'subagent_profiles[0].roles.developer.rotate_on_busy'`、`error.message` 含 `must be a boolean`。
  4. 同一探针续：全局层形态——true 形态写入隔离 `home/.workloom/config.json`、项目层留空，`loadConfig(projectRoot, { homeDir: home })` 通过且条目含 true（复现用户全局四角色配置的加载场景）。
  5. 同一探针续：白名单联动——同条目追加未知字段 `foo: 1`，检查报错 `field` 为 `subagent_profiles[0].roles.developer.foo` 且文案 allowed 清单含 `rotate_on_busy`。
- Expected:
  1. 五种形态行为与 R1 逐条一致：true 落 rotateOnBusy，false 与缺省不落，字符串与数字抛错且文案含字段路径，无隐式转换。
  2. 全局层与项目层同口径；未知字段文案的 allowed 清单同步。
  3. config.test 全绿，新增用例可在输出中定位。
- Evidence:
  - `case-evidence/c1-config-tests.log`
  - `case-evidence/c1-config-probe.log`
- Cleanup: 探针在 finally 删除临时项目与隔离 HOME/TMPDIR。

### C2 轮换选取、环序物化与占用取数三级

- Covers: AC2
- Preconditions:
  1. C1 通过。
  2. C2 步骤 1 先执行 `pnpm -r build`：dsh src 经 `@workloom-ai/core` 解析 core 的 dist，探针需要 core dist 含 PARENT_MODEL_LABEL 导出。
  3. 探针在隔离 HOME 与 TMPDIR 下运行，结束前清空 in-flight 状态并删除临时目录。
- Steps:
  1. `pnpm -r build`，记录退出码。
  2. `cd packages/dsh-workloom && node --test test/executor-rotation.test.ts`，确认全绿。
  3. 探针（`case-evidence/probes/c2-rotation-probe.mjs`）直接导入 `packages/dsh-workloom/src/dispatch/executor-rotation.ts`：
     1. 池 `[primary, fb1, fb2]` 在占用空集、`{primary}`、`{primary, fb1}` 下分别返回 0、1、2；全占用 `{primary, fb1, fb2}` 返回 0；空池返回 0；池外占用 `{unrelated}` 返回 0。
     2. 池 `[primary, fb1, fb2, fb3]` 起点 2 → startEntry `{model:'fb2'}`、chain `[fb3, primary, fb1]`；起点 0 → chain `[fb1, fb2, fb3]`；池 `[primary, fb1]` 起点 1 → chain `[primary]`；起点 9 → startEntry 池末项；起点 -1 → startEntry 池首项；空池抛错且 message 含 `pool must not be empty`；条目 effort 原样透传。
  4. 探针（`case-evidence/probes/c2-occupancy-probe.mjs`）导入 `executor-capacity.ts`：临时项目 task.json 预置 running dispatches——child-a 为旧值 `kind: 'implement'` 且 `model: 'provider-b/fb1'`，child-b `kind: 'developer'` 无 model；`listDescendants` mock 返回 child-a、child-b 两条 running 直子级与一条 completed 记录。检查：
     1. `collectRunningExecutors` 结果中 child-a 角色归一为 `developer` 且 `model === 'provider-b/fb1'`（二级 dispatches 记录含旧值归一）；child-b 的 model 为 undefined（三级取数入口）。
     2. `collectUsedModels(records, 'developer', '<parent session>')` 同时含 `provider-b/fb1` 与 `<parent session>`，不含其他角色或其他模型的条目。
     3. `registerInFlightDispatch('seq-1', 'developer', 'provider-a/fb2')` 后 `getInFlightDispatches()` 对应条目 `model === 'provider-a/fb2'`；重新收集后 `collectUsedModels` 含 `provider-a/fb2`（一级进程内登记）；`clearInFlightDispatches()` 后不再含。
  5. 编排级三级取数定位：`cd packages/dsh-workloom && node --test test/executor.test.ts`，在输出中定位三组轮换占用用例并记录用例名（新增或扩展均可）：①in-flight 登记占用（第一笔挂起时第二笔同角色顺延到下一模型）；②dispatches 记录占用且 kind 为旧值（归一后计入并顺延）；③dispatches 记录无 model 的保守归一（按主模型位计入并顺延到首个 fallback）。逐组记录选定模型、modelSource 与 receipt 判定的实际输出。
- Expected:
  1. 纯函数五类检查全过：池序首个未占用、全占用返回 0、空池物化抛错、越界夹回、环序链。
  2. 占用取数三级在函数级探针与编排级测试中都可见且一致。
  3. 同步段无 await 间隙不以此处的行为测试替代，由 SR7 的静态观察承载（AC2 分工）。
- Evidence:
  - `case-evidence/c2-build.log`
  - `case-evidence/c2-rotation-tests.log`
  - `case-evidence/c2-rotation-probe.log`
  - `case-evidence/c2-occupancy-probe.log`
  - `case-evidence/c2-executor-tests.log`
  - `case-evidence/c2-orchestration-checklist.log`
- Cleanup: 探针在 finally 清空 in-flight 状态并删除临时项目与隔离 HOME/TMPDIR。

### C3 四路径零变化：记录与回执无轮换痕迹

- Covers: AC3
- Preconditions:
  1. C2 通过；`pnpm -r build` 已执行且 dist 与 src 同代（C2 步骤 1）。
- Steps:
  1. 读 `packages/dsh-workloom/test/executor.test.ts`，定位四组零变化用例（新增或对既有夹具追加校验均可），把实际用例名记入证据：开关缺省或 false、显式 model、续用轮、容量拒绝。
  2. 定向复跑四组（以实际用例名为准）：`cd packages/dsh-workloom && node --test --test-name-pattern='<实际模式>' test/executor.test.ts`；或在全量输出中逐组定位。逐组检查：
     1. 开关缺省或 false：派发记录 `modelSource !== 'rotate'`、receipt 不含 `(rotated:`、绑定来源与现行夹具一致（param、whenMain、fallback、inherit 或 spawn）。
     2. 显式 model：记录 `model` 为显式值、`modelSource === 'param'`、receipt 无 rotated。
     3. 续用轮：记录 `modelSource === 'spawn'`、`sendMessage` 目标会话不变、receipt 无 rotated。
     4. 容量拒绝：返回 at capacity 文案、`startCalls` 不增、dispatches 不追加、无 rotated。
  3. 代码面复核：读 executor.ts，记录四路径相对轮换段的行号锚点——续用分支独立、`params.model !== undefined` 与 `effective.rotateOnBusy !== true` 使进入条件为假、容量拒绝 return 先于轮换段；四者均不可能置 rotation 状态。
  4. 交叉检索：`grep -n "rotated" packages/dsh-workloom/src` 仅 receipt 模板命中；`grep -n "rotate" packages/dsh-workloom/src/dispatch/executor.ts` 仅轮换段、绑定与 receipt 传参、注释命中，四路径分支内无 rotation 赋值。
- Expected:
  1. 四路径派发记录与回执均无轮换痕迹，与现行夹具一致。
  2. 代码面次序与进入条件可判定，四组用例全绿。
- Evidence:
  - `case-evidence/c3-four-paths-tests.log`
  - `case-evidence/c3-code-anchors.md`
- Cleanup: none。

### C4 轮换留痕、物化链衔接与一跳后继

- Covers: AC4
- Preconditions:
  1. C2 通过；`pnpm -r build` 已执行且 dist 与 src 同代。
- Steps:
  1. 纯函数探针（`case-evidence/probes/c4-trace-probe.mjs`）导入 dsh src 的 `dispatch-binding.ts` 与 `executor-continuation.ts`：
     1. `buildNewDispatchBinding({}, eff, 'main/m', { model: 'provider-b/fb1', effort: 'high' })` 返回的 model、effort、modelSource 恰为 `provider-b/fb1`、`high`、`rotate`；不传第四参的 param 与 inherit 两向与现状一致。
     2. `buildTurnReceiptText({ forced: false, reused: false, injection: { bytes: 0, inlined: 0, truncated: 0, indexed: 0, toolsAllowed: 0 }, rotation: { model: 'provider-b/fb1' } }, eff)` 末尾逐字 ` (rotated: provider-b/fb1)`；无 rotation 时不含 `(rotated:`；forced、reused、rotation 同时出现时后缀顺序为 ` (forced) (reused) (rotated: provider-b/fb1)`。
  2. 编排留痕定位：运行 `test/executor.test.ts`，定位轮换起步用例：记录 `modelSource === 'rotate'`、`model` 与 `effort` 等于选中链条目、spawn spec 的 provider/model/effort 等于该条目（provider 拆分口径）、receipt 含 `(rotated: <实际选定模型>)`；同时定位全占用回绕用例：`modelSource !== 'rotate'`、receipt 不含 rotated、spawn 仍为主模型位。
  3. 链衔接定位：定位 settle 衔接用例（`trackDispatchSettle` 手工登记携带 `failoverChain` 的 respawn 上下文加 `subagent/end` 失败夹具）：环序链夹具 `[F3, main, F1]`、起点 F2、deadModel F2，触发命中白名单的模型不可访问 code 后，重派 spawn spec 的 model 为 F3（链首即环序后继），重派记录 `modelSource === 'fallback'`；另定位无 failoverChain 的主模型位起步用例：回落配置重算链、重派取 F1（现状语义恒等）。
  4. 代码面互验：读 executor.ts 的 `buildNewDispatchBinding` 与 `trackDispatchSettle` 调用点，确认轮换时传 rotation 与物化链、非轮换不传；读 executor-settle.ts 确认 `respawn.failoverChain ?? 配置重算` 优先级（与 SR6 互验）。
  5. 标注一致性：rotated 标注中的模型为实际选定模型（provider 前缀原样，不是拆分后的裸 id），与派发记录 model 同值。
- Expected:
  1. `'rotate'` 留痕与 `(rotated: <model>)` 标注逐字可判定。
  2. 轮换起点后继位于物化链首并被一跳重试取用；主模型位起步无标注且链与现状恒等。
- Evidence:
  - `case-evidence/c4-trace-probe.log`
  - `case-evidence/c4-executor-tests.log`
  - `case-evidence/c4-chain-tests.log`
  - `case-evidence/c4-code-anchors.md`
- Cleanup: 探针在 finally 删除临时目录与隔离 HOME/TMPDIR。

### C5 标准验证全表与 dist 守卫

- Covers: AC5
- Preconditions:
  1. C1 至 C4 完成；实施步骤 1 至 5 完成（步骤 6 的 work commit 可以未落——2.3 CASE 先于 2.4 提交）。
  2. 命令在 worktree 根执行，build 先行（dsh 经 `file:../core` 与 core 包 exports 解析 dist，tsconfig 无 paths 映射）。
- Steps:
  1. `pnpm -r build`
  2. `pnpm -r typecheck`
  3. `pnpm lint`
  4. `cd packages/core && pnpm test`
  5. `cd packages/dsh-workloom && pnpm test`
  6. `git status --porcelain packages/core/dist packages/dsh-workloom/dist` 与 `git status --porcelain`
  7. `git diff --stat` 与 `git diff --name-only`（相对 HEAD 的变更集，供 Changed Files 判定）
- Expected:
  1. 步骤 1 至 3 退出码 0，lint 无 error 与 warning。
  2. 步骤 4 与 5 退出码 0、0 fail；两包 dist 镜像守卫（dist-mirror）与 core dist-dts 守卫在同一输出中通过。
  3. 步骤 6：build 后 dist 与 src 镜像一致（守卫全绿即证）；work commit 未落时 dist 出现 staged 或 unstaged 变更属预期状态，照实记录并注明「待主会话 2.4 单一 work commit 落地」，不得据此判失败；“dist 与 src 同 commit”结论由主会话提交时复核。
  4. 步骤 7：变更集记录完整，非豁免现存可执行文件与 Coverage 的 Changed Files 一一对应。
- Evidence:
  - `case-evidence/c5-build.log`
  - `case-evidence/c5-typecheck.log`
  - `case-evidence/c5-lint.log`
  - `case-evidence/c5-core-tests.log`
  - `case-evidence/c5-dsh-tests.log`
  - `case-evidence/c5-dist-status.log`
  - `case-evidence/c5-change-set.log`
- Cleanup: none。

## Coverage

- Tool: Node.js v24 内置测试覆盖率（`node --test --experimental-test-coverage`）与原生 lcov reporter
- Instrumentation: 两包先经 C5 步骤 1 的 `pnpm -r build`；测试以 coverage 模式各跑一遍，`--test-coverage-include` 同时含 `src/**` 与 `dist/**`（测试直接 import src 的 TS 模块，dsh 测试另经 `@workloom-ai/core` 加载 core 的 dist，一并纳入防漏），lcov 原始报告写入 `<task>`/coverage/。聚合时把 `SF:dist/...` 映射回 `SF:src/...`，同名源文件取 src 记录，避免同一模块重复计数；未覆盖行取 lcov 中 hits=0 的 DA 行号区间。
- Aggregate command:
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
- Scope: 本轮变更的现存可执行模块，即 `packages/core/src/workspace/config-subagent.ts`、`packages/core/src/injection/surface.ts`、`packages/dsh-workloom/src/dispatch/executor.ts`、`packages/dsh-workloom/src/dispatch/executor-capacity.ts`、`packages/dsh-workloom/src/dispatch/executor-continuation.ts`、`packages/dsh-workloom/src/dispatch/executor-rotation.ts`、`packages/dsh-workloom/src/dispatch/executor-settle.ts`、`packages/dsh-workloom/src/dispatch/dispatch-binding.ts`；若实施按 600 行规模线另抽轮换编排私有模块，以 C5 的实际 `git diff --name-only` 为准补入本清单并在结果注明。
- Exclusions:
  - packages/core/dist/: 构建产物，C5 验 build 后与 src 镜像一致（dist-mirror），同 commit 由主会话提交时复核
  - packages/dsh-workloom/dist/: 构建产物，C5 验 build 后与 src 镜像一致（dist-mirror），同 commit 由主会话提交时复核
  - packages/core/test/: 测试探针自身（含 config 五形态与透出用例），C1 与 C5 验全绿
  - packages/dsh-workloom/test/: 测试探针自身（含 executor-rotation 新单测与轮换编排、四路径、链衔接用例），C2 至 C5 验全绿
  - **/*.d.ts: 类型声明面（config.d.ts 的 rotateOnBusy 字段与手写锚点），无运行时行；字节一致由 dist-dts 守卫与 C5 验证
  - **/*.js.map: 构建映射产物，无运行时行
  - packages/core/src/index.ts: 导出面改线（PARENT_MODEL_LABEL 具名重导出），无独立运行时逻辑；由 build、typecheck 与 SR8 验证
- Raw outputs:
  - `coverage/core.lcov.info`
  - `coverage/dsh-workloom.lcov.info`

## Standard Verification

时序纪律：build 先行，`pnpm -r typecheck` 与两包测试排在 `pnpm -r build` 之后（dsh 经 core 的 dist 解析）；core 测试直跑 src TS，仍统一按 build 先行执行。退出码单元格只写裸 `0`，补充说明放 Evidence 列。

| Command | Exit code | Evidence |
| --- | --- | --- |
| `pnpm -r build` | `0` | `case-evidence/c5-build.log` |
| `pnpm -r typecheck` | `0` | `case-evidence/c5-typecheck.log` |
| `pnpm lint` | `0` | `case-evidence/c5-lint.log`（无 error 与 warning） |
| `cd packages/core && pnpm test` | `0` | `case-evidence/c5-core-tests.log`（0 fail，含 dist-mirror 与 dist-dts 守卫） |
| `cd packages/dsh-workloom && pnpm test` | `0` | `case-evidence/c5-dsh-tests.log`（0 fail，含 dist-mirror 守卫） |

## Result Discipline

1. Standard Verification 表：列为 Command、Exit code、Evidence；退出码单元格只写裸 `0`，任何附注（0 fail、守卫、lint 清洁度、commit 状态）一律放 Evidence 列，不写入退出码单元格。
2. Exclusions 格式统一为 `- <模式>: <原因>`：目录以尾斜杠结尾（如 `packages/core/dist/`）、精确文件路径不带星号、跨层声明用独立段（`**/*.d.ts`、`**/*.js.map`）；case-result 的 Exclusions 表两列均带反引号，且与本节逐条同路径同原因（不多不少、不改写）。
3. Changed Files 只列非豁免的现存变更文件（新建文件在执行轮存在且非豁免则列入；豁免路径不入表）；以 C5 步骤 7 的实际 `git diff --name-only` 为准，若实际变更超出 Coverage Scope，按实际补入并在结果注明。
4. Coverage 的 Overall lines 只写 `covered/total (百分比)` 形态（如 `123/456 (27.0%)`），不附加其他文字；Uncovered lines 取 lcov 中 hits=0 的 DA 行号区间。
5. 执行轮 work commit 尚未落地（2.3 CASE 先于 2.4 提交）：C5 步骤 6 观察到 dist 的 staged 或 unstaged 变更属预期状态，照实记录并注明「待主会话 2.4 单一 work commit 落地」，不得据此判失败；“dist 与 src 同 commit”由主会话提交时复核。
6. 证据完整性：每条 SR 的 Evidence 写实际读取的文件与观察（含行号锚点），不复述本 CASE 的预期文案；每条 C 的 Evidence 必须实际生成且内容非空，探针源码存 `<task>/case-evidence/probes/`，探针在隔离 HOME 与 TMPDIR 下运行并自清理，不写生产目录。

## Traceability

| AC | Static review | Runtime cases |
| --- | --- | --- |
| AC1 | SR1 | C1 |
| AC2 | SR2、SR3、SR7、SR8 | C2 |
| AC3 | SR7 | C3 |
| AC4 | SR4、SR5、SR6、SR7 | C4 |
| AC5 | - | C5 |
