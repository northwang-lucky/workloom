tasks/11-03-full-task-case-coverage:mw09en3xtwmipqov

# plan.md 审查报告（Round 3 · 最终复审）

- 审查对象：`.workloom/tasks/11-03-full-task-case-coverage/plan.md`（当前 3045 行，行号以本轮审查时文件为准）
- 审查方式：对 Round 2 的 N1–N7 与 Round 1 的 P2-3 残余项逐项回读现文本核对真实源码；按主会话补充要求检查 CASE_STRUCTURE 只读数组类型、RESULT Exclusions 一致性、not_applicable 空表约束；**独立复验手段升级**：把 plan 的 case.js / case.d.ts / case-service.ts 及全部 d.ts 与 index.ts 编辑抽取应用到 packages/core/src 的真实副本，用仓库自带 tsc（`strict + noUncheckedIndexedAccess + checkJs`）跑端到端类型检查，并对抽取的 case.js 跑了 5 场景运行时冒烟。未采信处置记录的自述结论，一切以复验输出为准
- 结论摘要：**N1–N7 与 P2-3 全部核销（7+1 项，证据见下）；三项补充检查全部通过（含运行时证据）；仍存问题 P1 × 3、P2 × 1，全部集中在步骤 2.1（alignment/git 小切片），无 P0**。case 领域主体（case.js/case.d.ts/case-service.ts/executor-context 注入/task-store.d.ts/index 导出）在真实副本上 typecheck 零诊断、运行时行为符合 PRD

---

## 一、N1–N7 与 P2-3 核销（逐项附证据）

| 项 | 状态 | 复验证据 |
| --- | --- | --- |
| N1（五处下标访问） | 已修复 | splitHeadings `match[1]?.trim() ?? ''`、parseExclusions/tablePaths/tableExclusions `match?.[1] !== undefined` 守卫、resultItems `?? ''`（plan.md:749、861、1092、1101、1128）；端到端 tsc（无 git.d.ts 的干净环境）case.js **0 诊断** |
| N2（六处 JSDoc） | 已修复 | inlineCurrentCase/inlineCaseTemplates/buildExecutorIncrementalPrompt 的 @param 齐备（plan.md:2447-2453、2475-2479、2493-2496），d.ts 声明在 2442；sectionBody（1425-1430）、recordCaseConfirmation（1572-1577）、computeTaskStage 第三参（1552）均补；端到端 tsc 这些文件 **0 诊断** |
| N3（buildExecutorIncrementalPrompt 缺 d.ts） | 已修复 | plan.md:2442 `export function buildExecutorIncrementalPrompt(params: BuildExecutorPromptParams): string`；端到端 tsc index.ts 重导出 **0 诊断** |
| N4（DispatchRecordInput Pick） | 已修复 | plan.md:1696 显式「在 DispatchRecordInput 的 Pick 键清单中单独加入 \| 'purpose'」 |
| N5（DSH fixture camelCase） | 已修复 | plan.md:2629 已改 `{ context_injection: { max_artifact_bytes: maxArtifactBytes } }`，与 config.js:416-421 的读取键一致 |
| N6（模板一致性用例消费私有常量） | 已修复 | plan.md:628-644 新增导出 `CASE_STRUCTURE`（含 caseSections/resultSections/srFields/cFields/coverageFields/resultStatuses/coverageStatuses）；d.ts 1285-1294 声明 `Readonly<{... readonly string[]}>`；index 导出 2848；case.js 内部常量改为派生（645-649） |
| N7（Pi 增量接入点） | 已修复 | plan.md:2708-2718 给出改前 `incrementalPrompt: params.prompt`（与 packages/adapter-pi/src/executor.ts:504 逐字一致）与改后 `buildExecutorIncrementalPrompt({...})`，并注明 purpose 与 loadPiCaseTemplates 落点 |
| P2-3（buildTaskRecord/startTaskInternal 锚点） | 已修复 | plan.md:1477-1492 给出两处逐字改前/改后（`check: null,` + alignment 注释行锚定 `task.status = TaskStatus.IN_PROGRESS` + writeTaskJson 行），均唯一 |

## 二、补充检查（CASE_STRUCTURE / RESULT Exclusions / not_applicable）

1. **CASE_STRUCTURE 只读数组类型**：JS 侧 `Object.freeze([...])` 推断 `readonly string[]`，消费方参数同步为 `readonly string[]`（requireFields plan.md:810、parseItems 823），d.ts 声明 `readonly string[]`（1285-1294）。端到端 tsc 对该文件 0 诊断，只读链一致 ✔
2. **RESULT Exclusions 一致性**：`tableExclusions` + `sameExclusions`（plan.md:1081-1098、1192-1196）要求 RESULT 排除表与 CASE 的 Paths/Reasons 逐项一致。运行时冒烟：RESULT 排除原因改为 `other reason` 时 `evaluateCaseOutcomeGate` 返回 `coverage_exclusions` ✔
3. **not_applicable 空表约束**：`expected.length > 0`、`actualCoverageFiles.length > 0`、Overall lines 白名单 `[null,'','none','N/A','n/a']`（plan.md:1205-1211）。运行时冒烟：空表 + N/A + 排除一致 → 通过；Changed Files 残留一行 → `coverage_files` 拒绝；`failed` 状态 → `coverage_status` 拒绝；generated 全绿 ✔（5/5 PASS）

## 三、仍然存在的问题

### D1（P1）步骤 2.1 alignment.js 改后块的四个新函数缺 JSDoc，checkJs 报 TS7006 × 4

- Plan 锚点：plan.md:540-559（改后块），`normalizeContentEol(content)`（541）、`computeContentHash(content)`（545）、`normalizePrdEol(content)`（551）、`computePrdHash(content)`（555）只有单行注释，无 `@param {string}`；被替换前的真实函数（alignment.js:44-60）本有完整多行 JSDoc
- 实证：端到端 tsc 真实副本输出 `alignment.js(44,37)/(49,36)/(54,33)/(59,32) TS7006 Parameter 'content' implicitly has an 'any' type` × 4。手写 d.ts 声明（587-588）只服务消费方，不能消除 JS 文件自身的 checkJs 诊断
- 影响：`pnpm -r typecheck`（4.1/7.1/8.1/10.1 的 Verify 链）失败
- 修复建议：改后块为四个函数补 JSDoc（与 d.ts 同型：`@param {string} content`、`@returns {string}`），保持替换后真实文件 44-60 行区域类型完备

### D2（P1）步骤 2.1 `gitChangedFilesSync` 的 options 常量致 encoding 类型拓宽，checkJs 报 TS2769 × 2

- Plan 锚点：plan.md:575 `const options = { cwd: root, encoding: 'utf8', stdio: GIT_SYNC_STDIO }`，随后两次 `execFileSync(GIT_BIN, [...ARGS], options)`
- 实证：端到端 tsc 输出 `git.js(495,71)/(496,70) TS2769 No overload matches this call`——对象字面量先赋常量，`encoding` 从字面量拓宽为 `string`，不匹配 `ExecFileSyncOptionsWithStringEncoding`。仓库现有同步函数（gitStatusSync 等）全部内联传参靠上下文类型收窄，plan 此处是先赋常量的新写法
- 影响：同 D1，`pnpm -r typecheck` 失败
- 修复建议：改成与既有函数一致的内联传参（两次调用各写一个对象字面量），或给常量加 `/** @type {import('node:child_process').ExecFileSyncOptionsWithStringEncoding} */` 注解

### D3（P1）步骤 2.1 新建 git.d.ts 与 copy-domain-dts 的子集校验冲突，构建 fail loud 且级联 49 个诊断

- Plan 锚点：plan.md:586-591「`git.d.ts` 增加同步变更文件声明」+ 只含 `gitChangedFilesSync` 一个声明的 ts 块（590）
- 真实机制：`packages/core/scripts/copy-domain-dts.mjs` 把手写 src/domain/*.d.ts 逐字节覆盖进 dist，且**强制生成版导出名 ⊆ 手写锚点导出名**，缺失即打印错误并以 exit 1 中止；脚本头注释明确「无锚点、仅 tsc 生成的 d.ts（git、breadcrumb 等）保持生成产物不动」——git 属于约定不建手写 d.ts 的模块
- 实证（真实副本双跑）：
  - 复刻脚本的 exportNames 校验：git.js 导出 23 个名字，plan 的 git.d.ts 锚点仅 1 个，缺 22 个（gitAddCommit、gitStatusSync、gitWorktreeListSync 等）→ 构建期 fail loud
  - tsc 带 git.d.ts 跑：总诊断 55 个，其中 journal/task-store/worktree/index/session-context 级联 49 个 TS2305（`Module '"./git.js"' has no exported member ...`），worktree.js 另因类型丢失派生 3 个 TS7006；去掉 git.d.ts 后级联全部消失
- 影响：`pnpm -r build`（8.1/8.2、AC13）与 `pnpm -r typecheck` 双重失败
- 修复建议（二选一，推荐前者）：**不建 git.d.ts**——tsc 会按 plan 已有的 JSDoc 自动生成含 gitChangedFilesSync 的 dist 声明，与仓库约定一致；若坚持手写，则必须声明 git.js 全部 23 个导出。plan.md:586-591 的对应 Edit 需相应改写

### D4（P2）步骤 5.2 模板一致性用例的措辞仍引用私有常量名

- Plan 锚点：plan.md:2420「逐一命中 REQUIRED_CASE_SECTIONS、REQUIRED_RESULT_SECTIONS、SR/C 字段和结果状态常量」——这两个名字在 case.js 中已是 CASE_STRUCTURE 的派生私有别名（645-649），对外公共面是 `CASE_STRUCTURE`（628、1285、2848）
- 影响：不构成执行错误（测试可 import CASE_STRUCTURE 完成同一目的），但按 prescriptive 措辞标准应指向公共导出，避免实施者误以为要改回模块内名称
- 修复建议：改为「逐一命中 `CASE_STRUCTURE.caseSections/resultSections/srFields/cFields/coverageFields/resultStatuses/coverageStatuses`」

## 四、端到端复验证据清单

1. **类型探针（决定性）**：plan 的 case.js、case.d.ts、case-service.ts（1712-1862）、task-store.d.ts 全部编辑、executor-context.js/.d.ts 编辑、index.ts 导出编辑，应用到 packages/core/src 真实副本后，仓库 tsc 在「无 git.d.ts」态仅剩 6 个诊断且全部位于步骤 2.1 的新代码（D1×4、D2×2）；case 领域与注入器、服务、导出面 **0 诊断**——N1/N2/N3/N6 的修复质量由此直接证实
2. **级联实证**：同一副本加入 plan 的 git.d.ts 后诊断升至 55（7 个文件），逐文件统计与 D3 的机理吻合
3. **构建脚本校验复刻**：按 copy-domain-dts.mjs 的 exportNames 逻辑对 git.js（23 导出）vs plan git.d.ts（1 锚点）比对，缺 22 名，脚本将 exit 1
4. **运行时冒烟**：抽取的 case.js 在 Node 24 直接运行，5 场景全 PASS（generated 通过 / failed 拒绝 / RESULT Exclusions 不一致拒绝 / not_applicable 空表+N/A 通过 / not_applicable 残留表拒绝），覆盖主会话点名的两条补充约束
5. **文本锚点抽查**：N4（1696）、N5（2629）、N7（2708-2718 对齐 executor.ts:504）、P2-3（1477-1492）与真实代码逐字比对一致

## Open issues

D1、D2、D3、D4（见第三节，均为步骤 2.1 与 5.2 措辞级修复，预估共 6-8 行改动）。除此四项外，plan 无其他 P0/P1/P2 问题；无阻塞性开放问题。
