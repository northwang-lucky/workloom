tasks/11-03-full-task-case-coverage:mw09en3xtwmipqov

# plan.md 审查报告（Round 2）

- 审查对象：`.workloom/tasks/11-03-full-task-case-coverage/plan.md`（当前 2942 行，行号以本轮审查时文件为准）
- 审查方式：逐项核销 Round 1 的 17 项发现；对声明已修的部分回读现文本与真实源码核验；按主会话指定的五个重点复核（2.3 正文完整性、contract-asset 消费者迁移、adapter 精确代码与测试、archive/资产测试可执行性、JSDoc 与 checkJs）；用仓库自带 tsc 对可疑类型模式做了最小探针实证
- 结论摘要：**Round 1 的 17 项发现已全部核销或大幅收敛（14 项完全修复、2 项部分修复降为残余 P2、1 项由主会话先行修复确认）；Round 2 新发现 P1 × 6、P2 × 1，无 P0**。新发现集中在 checkJs 类型完备性（core 为 `checkJs:true` + `strict` + `noUncheckedIndexedAccess`）和两处测试 fixture/类型导出的可执行性

---

## 一、Round 1 发现核销表

| # | 级别 | 发现 | 状态 | 证据 |
| --- | --- | --- | --- | --- |
| 1 | P0-1 | 步骤 1.1 从 `../src/service/case-service.js` 导入 | **已修复** | 现 plan.md:69 为 `import { executeTaskCase } from '../dist/service/case-service.js'`，与 local-prompts.test.js 等既有服务测试惯例一致 |
| 2 | P0-2 | 2.3 Check 替换文本丢失原 check 正文 | **已修复** | 现 plan.md:2326-2355（2.3 全文）含 P0/P1/P2 三条定义（2342-2344）、后台派发段（2346）、fix-and-escalate 段（2348）、派发指引段（2350）、修复窗口段（2352，逐字保留 `fix it or record why not`、`re-dispatch the check executor for a full re-review`、`Any change after the pass is recorded requires a fresh check re-dispatch`、`only after the user confirms may it amend prd.md and re-dispatch the check executor against the new baseline`）、Completion criteria 句（2355）。executor-context §2.2→§2.3 的同步也写入 2363 |
| 3 | P0-3 | contract-asset.test.js 断言无人认领 | **已修复** | 现 plan.md:2364-2369 给出五条精确迁移（步骤 id 列表加 2.4；三组 check 断言查找 id 2.2→2.3 并保留原句；principle 4 改 per 2.3/Phase 2.4；两个面包屑；新增模板一致性用例） |
| 4 | P1-1 | evaluateStartGate 改前注释位置不符 | **已修复** | 现 plan.md:1338-1344 与 task-gates.js:307-312 逐字一致（含两条注释的真实位置） |
| 5 | P1-2 | alignment.js 改前 JSDoc 不符 | **已修复** | 现 plan.md:523-534 逐字复制真实多行 JSDoc |
| 6 | P1-3 | `NO_ITEMS` 未使用导致 lint 失败 | **已修复**（主会话先行修复，已确认） | 当前 plan.md 全文 grep `NO_ITEMS` 零命中 |
| 7 | P1-4 | 6.2/6.3 无精确代码与测试 | **已修复** | 6.2 现含 schema 片段、buildFullInjection 新签名（plan.md:2464-2488）、增量分支改前/改后（2491-2512）、failover context/record 透传（2514-2522）、完整新测试文件 case-executor.test.js（2524 起）；6.3 含 EXECUTOR_PARAMS union、四处参数面下传、loadPiCaseTemplates、persona 精简与完整测试文件。残余小项见新发现 N7 |
| 8 | P1-5 | 模板一致性测试落点反向依赖 | **已修复** | 现 plan.md:2315 明确「模板与 core 常量的一致性断言放在 core 的 contract-asset.test.js，assets 不 import core」；assets 侧测试自包含（2291-2313）。残余问题见新发现 N6 |
| 9 | P1-6 | continue 路由丢失 migrate-plan 括号句 | **已修复** | 现 plan.md:2815 保留「load the workloom-migrate-plan skill (legacy artifacts of the pre-plan.md contract), migrate, then re-route」，与 adapter-dsh/test/skills.test.js:188-190 的逐字断言相容 |
| 10 | P1-7 | archive 拒绝无测试 | **已修复** | 现 plan.md:462-482 新增 archive 用例：断言 `/CASE archive gate failed/` 且 task.json 字节未变 |
| 11 | P2-1 | 工具计数注释 | **已修复** | plan.md:1835-1837 显式给出三处注释新文案（十一个工具名/八个任务工具；十一个一行速览；双 adapter「注册八个任务管理工具」） |
| 12 | P2-2 | 双 adapter 注释 | **已修复** | 同上 1836-1837 |
| 13 | P2-3 | 插入点缺唯一锚点 | **部分修复（降为残余 P2）** | normalizeTaskRecord（plan.md:1436-1448）、checkTaskInternal（1559-1564）、archiveTaskInternal（1593-1597）已给出带上下文的逐字改前锚点；buildTaskRecord「check: null 后加入」与 startTaskInternal「status 写入前加入」仍为文字定位（两处目标行在真实文件中各自唯一，可接受） |
| 14 | P2-4 | 纪律段 §2.2 引用 | **已修复** | plan.md:2363 明确「executor-context.js 的 check 纪律引用由 workflow §2.2 改 §2.3」 |
| 15 | P2-5 | 资产测试只有描述 | **已修复** | plan.md:2291-2313 给出 case-templates.test.js 完整代码 |
| 16 | P2-6 | Verify 缺 build 前置 | **已修复** | 步骤 1.1 Verify（plan.md:513）与 2.2 Verify（1307）均改为 `pnpm run build && node --test ...` |
| 17 | P2-7 | 0.2 未交代新工具部署时序 | **已修复** | plan.md:41 末句补充「源码交付前若新工具尚未部署，先保留设计 child 与草案，待步骤 8.2 构建产物经用户授权部署并重启后补跑 review/confirm，证据中注明该时间线」 |

---

## 二、Round 2 新发现

### N1（P1）case.js 五处正则捕获组/数组下标访问不满足 `noUncheckedIndexedAccess`，typecheck 必失败

- Plan 锚点（均在步骤 2.2 的 case.js 完整文件内）：
  1. `splitHeadings`：`current = { heading: match[1].trim(), lines: [] }`（plan.md:741）
  2. `parseExclusions`：`exclusions.set(match[1].trim(), match[2].trim())`（plan.md:851）
  3. `tablePaths`：`if (match !== null) paths.push(match[1])`（plan.md:1061）
  4. `tableExclusions`：`exclusions.set(match[1], match[2])`（plan.md:1075）
  5. `resultItems`：`id: section.heading.split(' ')[0]`（plan.md:1103-1104），声明返回 `{id: string, ...}[]`，推得 `id: string | undefined`
- 实证：仓库 tsconfig（`tsconfig.base.json`）为 `strict + noUncheckedIndexedAccess`，core 叠加 `checkJs:true`。用仓库自带 tsc 做最小探针：`match[1].trim()` 报 TS2532「Object is possibly 'undefined'」；`paths.push(match[1])` 报 TS2322；`id: split(' ')[0]` 映射进声明为 `string` 的返回类型报 TS2322。仓库现有代码（task-gates.js 的 `exec(body)?.[1] ?? ''` 等）均用可选链规避，plan 自己的 case.js:734 也用了 `?.[1]?.[0]`，唯独上述五处直连
- 影响：步骤 2.2 Verify（1307）含 typecheck 链路的 0.1/8.1/10.1 全会在 `pnpm -r typecheck` 失败
- 修复建议：统一改为防御写法——`match[1]?.trim() ?? ''`、`paths.push(match[1] ?? '')`、`exclusions.set(match[1] ?? '', match[2] ?? '')`、`id: section.heading.split(' ')[0] ?? ''`；或在正则命中后用局部变量加 `typeof` 收窄

### N2（P1）六个新增 JS 函数缺 JSDoc 参数类型，`checkJs` 下报 TS7006

- 实证：同配置探针确认 JS 文件中无类型参数报 TS7006「Parameter implicitly has an 'any' type」；函数有部分 JSDoc 但新增参数无 `@param` 标签同样报
- Plan 锚点：
  1. `inlineCurrentCase(parts, params, taskDir, ci, stats)`（plan.md:2382，5 个参数全无类型）
  2. `inlineCaseTemplates(parts, params, stats)`（plan.md:2403）
  3. `buildExecutorIncrementalPrompt(params)`（plan.md:2415，导出函数）
  4. `sectionBody(content, heading)`（plan.md:1404，task-gates.js）
  5. `recordCaseConfirmation(root, taskRelPath, entry)`（plan.md:1527，task-store.js；d.ts 声明已有 1632-1636，JS 侧 JSDoc 缺失）
  6. `computeTaskStage` 改后新增第三参 `purpose = CASE_PURPOSES.EXECUTION`（plan.md:1510）：现有 JSDoc（task-store.js:1267-1274）只覆盖 current/kind，缺 `@param {...CasePurpose} [purpose]`
- 影响：`pnpm -r typecheck` 失败；且步骤 10.1 明令禁止 `@ts-ignore` 类绕过
- 修复建议：为 1-5 补全 JSDoc（类型可从 d.ts 与既有函数复制，如 `parts: string[]`、`params: import('./executor-context.d.ts').BuildExecutorPromptParams`、`ci: {maxArtifactBytes: number}`、`stats: import('./executor-context.d.ts').ExecutorPromptStats`）；为 6 补一行 purpose 的 `@param`

### N3（P1）`buildExecutorIncrementalPrompt` 未在 executor-context.d.ts 声明，index 导出与 dist 类型面双双失败

- Plan 锚点：plan.md:2415 新增导出函数；plan.md:2772 在 index.ts 导出块加入它；但步骤 6.1 的 d.ts Edit 只写了 `BuildExecutorPromptParams` 的两个新字段，全 plan 无该函数的 d.ts 声明
- 真实机制：`packages/core/src/domain/executor-context.d.ts:77` 以手写声明覆盖 tsc 生成物（build 脚本 copy-domain-dts.mjs 逐字节拷贝，`dist-dts.test.js` 强制一致）；`packages/core/src/index.ts` 从 `'./domain/executor-context.js'` 重导出时按 NodeNext 解析到该 d.ts，缺失声明即 TS2305「Module has no exported member」
- 影响：步骤 6.1/7.1 的 Verify（`pnpm run typecheck`）失败；即便绕过，dist 的 .d.ts 也没有该函数类型
- 修复建议：6.1 的 Edit 增加 `export function buildExecutorIncrementalPrompt(params: BuildExecutorPromptParams): string`

### N4（P1）`DispatchRecordInput` 是 Pick 联合，光给 DispatchRecord 加 purpose 不会传导，adapter 传参会 typecheck 失败

- Plan 锚点：plan.md:1644-1645「在 DispatchRecord、DispatchRecordInput 中加入：purpose?: DispatchPurpose」
- 真实代码：`packages/core/src/domain/task-store.d.ts:137-152` 的 `DispatchRecordInput = Pick<DispatchRecord, | 'kind' | 'title' | ... | 'fallbackAttempt'> & { error?: string }`——Pick 的键清单是逐字枚举的，DispatchRecord 新增 `purpose?: DispatchPurpose` 后 DispatchRecordInput 依然不收 purpose
- 影响：DSH executor.ts:640、executor-failover.ts:518、executor-failover-chain.ts:189、Pi executor.ts/executor-dispatch.ts/executor-continuation.ts 全部计划传 `purpose`，`pnpm -r typecheck` 在 adapter 侧失败
- 修复建议：plan.md:1644 明确「在 DispatchRecord 加入 purpose?: DispatchPurpose，并把 DispatchRecordInput 的 Pick 键清单加入 'purpose'」

### N5（P1）DSH case-executor 测试的 config fixture 用 camelCase，预算不生效，超预算断言必失败

- Plan 锚点：plan.md:2512 `writeFileSync(join(root, '.workloom', 'config.json'), JSON.stringify({ contextInjection: { maxArtifactBytes } }))`；断言在 2548-2551：`assert.throws(() => buildFullInjection(root, REL, 'check', 'design', '', false, 'case-design'), /exceeding maxArtifactBytes=8/)`
- 真实代码：`packages/core/src/domain/config.js:416-421` 只读 snake_case——`doc.context_injection` 下的 `ci.max_artifact_bytes`；camelCase 键被 mergeWithDefaults 静默忽略，`maxArtifactBytes` 保持默认 65536，21 字节的 CASE 不会触发抛错，`assert.throws` 失败（且即便触发，文案也是 65536 而非 8）
- 影响：步骤 6.2 的新测试按其 Verify 跑必红，且红因不在实现而是 fixture
- 修复建议：fixture 改为 `JSON.stringify({ context_injection: { max_artifact_bytes: maxArtifactBytes } })`

### N6（P1）模板一致性用例消费不到 core 的结构常量，步骤 5.2 第 5 条按现文本不可执行

- Plan 锚点：plan.md:2369「新增模板一致性用例：core 读取 assets 两份模板，逐一命中 REQUIRED_CASE_SECTIONS、REQUIRED_RESULT_SECTIONS、SR/C 字段和结果状态常量」；但 plan.md:628-640 的这些常量是 case.js 模块私有、不导出（步骤 7.1 的导出块 2743-2762 也没有它们）
- 影响：contract-asset.test.js 无法 import 这些常量；若测试里硬编码章节名，R22「契约测试核对模板与常量一致」退化为「模板与测试副本一致」，常量侧漂移仍可能漏
- 修复建议：从 case.js 导出一个冻结的结构常量对象（如 `export const CASE_STRUCTURE = Object.freeze({ caseSections: REQUIRED_CASE_SECTIONS, resultSections: REQUIRED_RESULT_SECTIONS, srFields: SR_FIELDS, cFields: C_FIELDS, coverageFields: COVERAGE_FIELDS })`，7.1 一并导出），契约测试消费该对象逐字比对模板正文

### N7（P2）Pi 6.3 续用增量的接入点仍只有文字描述

- Plan 锚点：plan.md:2626「dispatch/continuation 的增量指令调用 buildExecutorIncrementalPrompt」；对比 DSH 6.2 给出了 executor.ts:497-501 的改前/改后，Pi 侧没有给出在哪个函数、把哪段 `params.prompt` 组装替换为 core 新函数（真实接入点在 `packages/adapter-pi/src/executor.ts` 续用分支与 `executor-continuation.ts` 的 incrementalPrompt 链路）
- 影响：不阻塞（调用点真实存在、方向正确），但按 prescriptive 编写标准属于引用不完整
- 修复建议：补一段 Pi 侧改前/改后，注明 `loadPiCaseTemplates` 落在 executor.ts（与 buildExecutorPromptWithPi 同文件）

---

## 三、重点复核结论（按主会话指定五项）

1. **2.3 正文完整性**：已恢复全部原有 check 正文（P0/P1/P2 定义、后台派发、派发指引、修复窗口、force 语义、Completion criteria 含 LSP 句），并逐字核对与 contract-asset.test.js 现有断言的相容性 ✔
2. **contract-asset 消费者迁移**：plan.md:2364-2369 五条已覆盖步骤 id 列表、三组 check 正文断言、principle 4、双面包屑、模板一致性用例 ✔（执行前提是先修 N6）
3. **adapter purpose/注入/failover 精确代码与测试**：DSH 侧已达 prescriptive 标准（含新签名、改前/改后、完整测试文件，锚点与真实代码 executor.ts:497-501/executor-failover.ts:119/executor-failover-chain.ts:188 逐一核对成立）；Pi 侧代码片段与测试齐全，续用增量接入点偏文字（N7）✔ 基本达标
4. **archive 拒绝与资产测试可执行性**：archive 用例（462-482）断言消息与零写入，与 task-store 改后抛错文案（1606-1611）一致；资产测试自包含、断言与模板正文相容（`---\nversion: 1\ntask:` 开头、结尾换行——前提是模板文件本身以换行收尾，建议 5.1 Edit 显式说明）✔（N5 的 config fixture 问题只影响 DSH 侧）
5. **JSDoc 与 checkJs**：case.js 主体 JSDoc 完备，但存在 N1（五处下标访问）、N2（六处缺类型参数/标签）、N3（一个导出缺 d.ts 声明）三类共 12 个类型错误，全部可用仓库自带 tsc 探针复现；另需给 `buildExecutorIncrementalPrompt` 的 JSDoc 与 d.ts 同步补齐 ✘ 需修复后 typecheck 方可通过

## 阻塞性开放问题

无。N1-N6 均给出明确修法；未发现需主会话/用户裁决的缺口。
