# PLAN 审查发现处置记录

## Round 1

- P0-1：已修复。CASE 服务测试从 `../dist/service/case-service.js` 导入；相关 Verify 先 build 再运行测试。
- P0-2：已修复。2.3 恢复原有 P0/P1/P2 定义、后台派发、派发指引、主会话修复窗口、P0 基线处理、frontend 条件与 Completion criteria，再叠加 CASE 执行规则。
- P0-3：已修复。步骤 5.2 明确迁移步骤 id、三组 check 正文断言、principle 4、两个 breadcrumb 和模板一致性断言。
- P1-1：已修复。`evaluateStartGate` 改前片段按真实注释位置与原文重写。
- P1-2：已修复。`computePrdHash` 改前片段使用真实多行 JSDoc。
- P1-3：已修复。删除未使用的 `NO_ITEMS`，并清理其他未使用参数。
- P1-4：已修复。6.2/6.3 增加 purpose 参数、模板转发、增量指令、failover/continuation 记录代码；新增双 adapter executor 测试。
- P1-5：已修复。assets 测试只验证 loader 与资产结构；模板和 core 常量一致性测试放 core `contract-asset.test.js`。
- P1-6：已修复。continue 保留 workloom-migrate-plan 的原括号说明，无需改变既有 DSH 断言。
- P1-7：已修复。新增 archive 拒绝用例，验证 force 仍失败、task.json 不变且目录不移动。
- P2-1：已修复。surface 工具总数与任务工具数同步更新。
- P2-2：已修复。两个 adapter 的任务工具注释同步为八个工具及完整名单。
- P2-3：已修复。normalizeTaskRecord、checkTaskInternal、archiveTaskInternal 均补充带上下文的唯一锚点。
- P2-4：已修复。executor-context 的 check 纪律引用同步改为 workflow §2.3。
- P2-5：已修复。新增完整的 `packages/assets/test/case-templates.test.js`。
- P2-6：已修复。CASE 测试 Verify 均先运行 core build。
- P2-7：已修复。0.2 增加新工具未部署时的保留草案、部署后补确认与证据时间线。

## 主会话补充发现

- 严格 `checkJs` 检查促使 `case.js` 的公开函数、内部结构、任务记录、YAML 元数据和结果条目补齐 JSDoc；alignment/git 的手写类型声明同步纳入步骤 2.1。
- RESULT 增加排除表一致性校验：Exclusions 的路径和原因必须与 CASE 相同。
- `not_applicable` 增加空 Changed Files 表与 Overall lines=N/A 校验，避免不适用结果残留覆盖率数字。
- archive 增加 `task.case.result.caseHash` 与当前确认版本的二次核对。
- 临时类型检查曾误用硬链接副本，导致 alignment.js 与 git.js 被追加两行；主会话已精确撤销并验证 `git diff --exit-code` 通过。后续检查改用真实复制，不再有源码目录副作用。

## Round 2

- Round 1 的 P2-3 残余项：已补齐 buildTaskRecord 与 startTaskInternal 的逐字改前/改后锚点，不再保留部分修复状态。
- N1：已修复。正则捕获组与数组下标均使用可选链、默认值或显式存在性收窄，包括相邻的 YAML 与 Target 路径取值。
- N2：已修复。inlineCurrentCase、inlineCaseTemplates、buildExecutorIncrementalPrompt、sectionBody、recordCaseConfirmation 和 computeTaskStage 第三参均补齐 JSDoc。
- N3：已修复。executor-context.d.ts 增加 ExecutorArtifactContent、BuildExecutorPromptParams 新字段和 buildExecutorIncrementalPrompt 声明。
- N4：已修复。明确 DispatchRecordInput 的 Pick 键清单必须单独加入 purpose。
- N5：已修复。DSH 超预算 fixture 改用 `context_injection.max_artifact_bytes`。
- N6：已修复。新增冻结的 CASE_STRUCTURE，统一提供章节、字段和状态值；case.d.ts 与 core 公共导出同步。字段参数同步声明 readonly string[]，严格类型探针无剩余诊断。
- N7：已修复。Pi 续用分支给出 incrementalPrompt 的精确改前/改后，并明确 purpose 与模板函数的落点。

补充验证：按 `checkJs + strict + noUncheckedIndexedAccess` 对 PLAN 的 case.js 运行临时真实副本检查，排除临时环境的 Node/YAML 模块解析噪声后，剩余诊断为 0。

## Round 3

- N1–N7 与 P2-3 已由同一 review 会话核销；case 领域、注入器、服务和导出面在其端到端类型检查中为 0 诊断，运行时补充场景 5/5 通过。
- D1：已修复。alignment 改后块的四个函数均补齐 `@param {string}` 与 `@returns {string}`。
- D2：已修复。git 两次 execFileSync 改为与现有一致的内联 `encoding: 'utf8'` 对象，消除编码字面量拓宽。
- D3：已修复。PLAN 明确不创建 git.d.ts，新增声明由 tsc 按 JSDoc 生成，符合 copy-domain-dts 的无锚点模块约定。
- D4：已修复。模板一致性用例改为消费公共 `CASE_STRUCTURE` 的全部字段。

## Round 3 后续验证

- 对修订后的 alignment/git 代码单独运行 `checkJs + strict + noUncheckedIndexedAccess` 探针，新增函数没有诊断；临时探针仅剩 Node 类型解析噪声与 git.js 既有位置的派生诊断。
- 当前 PLAN 不再包含新建 git.d.ts 的 Target 或 Edit，避免 copy-domain-dts 的导出名子集校验失败。
- 第三轮后的 D1–D4 均已处置，没有申请第四轮审查；本记录与第三轮报告一并纳入 1.4 审阅包。
