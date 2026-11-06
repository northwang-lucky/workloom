# 模块去留清理

## Design decisions

1. 新模块落位：prd-structure.ts、doc-review.ts、jsonl.ts 落 core/src/task/；executor-kinds.ts 落 core/src/dispatch/；session-assemble.ts 落 core/src/injection/；纪律文本落 dsh-workloom/src/dispatch/discipline-text.ts。
2. doctor 的 --fix 能力随 doctor-fixes 删除一并退役，doctor 命令只出报告；空槽提示行文案为"检查集待状态机重建"。
3. init 模板外置落 core/resources/skeleton/ 目录，经 resources-manifest 登记读取；内嵌模板字符串清零。
4. surface 统一方向：dsh-workloom 四份副本改 import core 的 injection/surface 导出，依赖单向 dsh 到 core。
5. 旧 kind 值域保持原样，executor-kinds.ts 是过渡栖身地，子任务四成组切换。
6. 提交分组延续子任务一：步骤一至十一只验证不提交，步骤十二单一 commit 落全部代码改动与 dist 重建；簿记另走 chore commit。

## Steps

#### 步骤 1：删 failover 族、rotation、profiles

- Covers: AC1, AC5
- Target: packages/dsh-workloom/src/dispatch/executor-failover.ts、executor-failover-chain.ts、executor-failover-notify.ts；packages/core/src/dispatch/executor-rotation.js 与 executor-profiles.js（含 .d.ts）；涟漪点 dsh dispatch/executor.ts 的 rotate_on_busy 段与 buildFallbackAgentOptions import、executor-settle.ts 的 failover 钩子、executor-continuation.ts 的链引用、core injection/session-context.ts 的执行器画像节、core index.ts 导出、core workspace/config.js 的轮换配置字段、测试 executor-rotation.test.ts、executor-profiles.test.ts、executor.test.ts 与 case-executor.test.ts 的 failover 用例。
- Edit:

  ```text
  Input: 上述文件与涟漪点符号（rotate_on_busy、buildFallbackAgentOptions、EXECUTOR_PROFILES 渲染入口）。
  Output: 五文件删除；涟漪点的 import、配置字段、画像节、钩子接线清除；相关测试删除或改写。
  Preconditions: none
  Procedure: 1) git rm 五文件含 .d.ts；2) executor.ts 删 rotate_on_busy 段与链 import，容量闸保留；3) executor-settle.ts 删 failover 钩子参数与回调；4) session-context.ts 删执行器画像节；5) config.js 删轮换字段与校验；6) index.ts 删导出；7) 测试同步。
  Failure: 漏删引用时 typecheck 报未解析符号阻断。
  ```

- Verify: `grep -rn "executor-failover\|executor-rotation\|executor-profiles\|rotate_on_busy" packages/` 无命中；`pnpm -r typecheck` 退出码 0。

#### 步骤 2：删 migrate、journal、identity

- Covers: AC1, AC3, AC5
- Target: packages/core/src/workspace/migrate.js、journal.js、identity.js（含 .d.ts）；packages/dsh-workloom/src/tooling/journal-tool.ts；core workspace/command-ops.ts 的 journal 编排导出；dsh plugin.ts 的 workloom_journal 注册；core task/task-store.js 的 journal 写入钩子；core injection/session-context.ts 的 developer 读取；core index.ts 导出；测试 migrate.test.ts、journal.test.ts、journal-tool.test.ts、command-ops.test.ts 与 init.test.ts 的身份断言。
- Edit:

  ```text
  Input: 上述文件与符号（executeJournalEntry、addSession、DEVELOPER_PATTERN、readDeveloper）。
  Output: 模块与工具注册删除；task-store 钩子去除 journal 写入；session-context 不再读 .developer；index.ts 导出清理；测试删除或改写。
  Preconditions: 步骤 1 完成
  Procedure: 1) git rm 四文件含 .d.ts 与 journal-tool.ts；2) command-ops 删 journal 编排段；3) plugin.ts 删注册；4) task-store 钩子去 journal；5) session-context 删 developer 行；6) index.ts 删导出；7) 测试同步。
  Failure: 漏删读取点时 typecheck 或测试红阻断。
  ```

- Verify: `grep -rn "executeJournalEntry\|workloom_journal\|DEVELOPER_PATTERN" packages/` 无命中；`cd packages/core && pnpm test` 全绿。

#### 步骤 3：文档复核服务与 PRD 解析统一

- Covers: AC1, AC2, AC5
- Target: 新建 packages/core/src/task/prd-structure.ts 与 doc-review.ts；删除 alignment-service.ts 与 case-service.ts；收编 task-gates.js 的 inspectPrdStructure（378 行起）与 case.js 的 sectionMap、acceptanceIds、traceabilityRows；涟漪点 index.ts 导出、dsh tooling/tasks.ts 的 executeAlignTask 与 case review 调用、doctor-check-rules.ts 368 行的 inspectPrdStructure 引用、测试对齐与 case 服务用例。
- Edit:

  ```text
  Input: task-gates.js 的 inspectPrdStructure 实现、case.js 的 prd 小节解析实现、alignment-service 与 case-service 的 review/confirm 编排。
  Output: prd-structure.ts 单一解析实现（结构问题、AC 编号、追溯行）；doc-review.ts 按 target 分段的 review 与 confirm 编排；旧两服务与重复解析删除；调用方改 import 新模块。
  Preconditions: 步骤 2 完成
  Procedure: 1) 抽 prd-structure.ts；2) 合 doc-review.ts；3) task-gates 与 case.js 改 import prd-structure；4) 删旧服务文件；5)  rewiring index.ts 与 dsh tasks.ts；6) doctor-check-rules 改 import；7) 测试同步。
  Failure: 解析行为漂移时对齐与 case 复核测试红阻断。
  ```

- Verify: `grep -rn "alignment-service\|case-service" packages/` 无命中；`cd packages/core && pnpm test` 与 `cd packages/dsh-workloom && pnpm test` 全绿。

#### 步骤 4：jsonl 外移、循环 import 消除、任务枚举与归档统一

- Covers: AC1, AC2, AC5
- Target: 新建 packages/core/src/task/jsonl.ts 与 packages/core/src/dispatch/executor-kinds.ts；executor-context.js 的 parseJsonlEntries（755 行起）与 EXECUTOR_KINDS 外移；task-store.js listTasks 扩展覆盖 archive 取代 doctor-tasks.ts 的 collectTasks（26 行起）；删除 doctor-fixes.ts；doctor.ts 去 --fix 路径；涟漪点 doctor-checks.ts、task-gates.js、doctor-check-rules.ts 的 jsonl 与 collectTasks 引用、task-store 与 executor-context 循环 import、测试 doctor.test.ts 的 fix 用例。
- Edit:

  ```text
  Input: executor-context.js 的 parseJsonlEntries 与 EXECUTOR_KINDS；doctor-tasks.ts 的 collectTasks；doctor-fixes.ts 三修复；task-store.js 的 listTasks。
  Output: jsonl.ts 与 executor-kinds.ts 就位；task-store 与 executor-context 循环 import 消除（双方改 import 新模块）；listTasks 统一枚举；doctor-fixes 删除且 doctor 只出报告；引用方改线；fix 测试删除。
  Preconditions: 步骤 3 完成
  Procedure: 1) 抽 jsonl.ts 与 executor-kinds.ts；2) rewiring 全部引用；3) listTasks 加 archive 覆盖并替换 collectTasks 调用；4) git rm doctor-fixes.ts；5) doctor.ts 删 --fix 分支；6) 测试同步。
  Failure: 循环 import 残留时 typecheck 或运行期环报错阻断。
  ```

- Verify: `grep -rn "parseJsonlEntries" packages/core/src/dispatch/` 无命中；`grep -rn "collectTasks\|fixCompletedArchive" packages/` 无命中；`pnpm -r typecheck` 退出码 0。

#### 步骤 5：surface 投影统一

- Covers: AC1, AC5
- Target: packages/core/src/injection/surface.ts 为唯一投影源；删除 dsh dispatch/executor.ts 167 行 TextBlockLike interface、dispatch/executor-receipt.ts 35 行 renderOutput、tooling/skills.ts 244 行 renderOutput、tooling/tasks.ts 377 行 renderTask 的本地副本；core index.ts 补导出。
- Edit:

  ```text
  Input: surface.ts 现有投影函数；dsh 四份副本实现。
  Output: dsh 四处改 import core surface 导出；本地副本删除；index.ts 导出 TextBlockLike 与 render 族。
  Preconditions: 步骤 4 完成
  Procedure: 1) surface.ts 补 renderOutput/renderTask 与类型导出；2) index.ts 补导出；3) dsh 四站点改 import；4) 删副本。
  Failure: 行为差异时 dsh 工具投影测试红阻断。
  ```

- Verify: `grep -rn "interface TextBlockLike" packages/` 只命中 core surface；`cd packages/dsh-workloom && pnpm test` 全绿。

#### 步骤 6：case、git、worktree、config、executor-tools、local-prompts 拆分

- Covers: AC2, AC5
- Target: core task/case.js 拆 case-structure.ts、case-gates.ts、case-scope.ts；workspace/git.js 拆 git-query.ts 与 git-ops.ts；workspace/worktree.js 拆 worktree-lifecycle.ts、worktree-integrate.ts、setup-executor.ts；workspace/config.js 拆 config-load.ts、config-defaults.ts、config-subagent.ts 并删 per-runtime 分支；dispatch/executor-tools.ts 删 Pi 清单与 runtime 参数；injection/local-prompts.ts 删 front-matter 解析死代码与 requiresTools 废止分支；涟漪点 index.ts 导出与全部内部 import、测试 import 路径。
- Edit:

  ```text
  Input: 六文件现有职责边界（评估表拆分列）与调用面。
  Output: 十一个新文件就位，旧文件删除；per-runtime 分支与 Pi 清单清零；import 与导出同步；测试 import 同步。
  Preconditions: 步骤 5 完成
  Procedure: 1) 逐文件按边界拆新模块；2) rewiring 内部 import；3) index.ts 导出改线；4) config 删 runtime 维度参数；5) executor-tools 收窄 DSH 单形态；6) local-prompts 删死抽象；7) 测试 import 同步。
  Failure: 边界切错时对应模块测试红阻断。
  ```

- Verify: `tree -L 2 packages/core/src` 新文件就位；`pnpm -r typecheck` 与两包 test 全绿。

#### 步骤 7：executor-context 拆分与纪律文本迁 dsh

- Covers: AC2, AC5
- Target: core dispatch/executor-context.js 拆 injection/prompt-compose.ts（prompt 组装）与 dsh dispatch/discipline-text.ts（runtime 纪律文本，含 lsp_* 提及）；涟漪点 dsh executor-injection.ts、executor-guard.ts、core task-gates.js 的 kinds 引用（步骤 4 已外移）。
- Edit:

  ```text
  Input: executor-context.js 的 prompt 组装段与纪律文本段。
  Output: prompt-compose.ts 留 core 且 runtime 无关；discipline-text.ts 落 dsh；旧文件删除；引用改线。
  Preconditions: 步骤 6 完成
  Procedure: 1) 拆两段成新文件；2) dsh 注入链路改 import discipline-text；3) core 注入改 import prompt-compose；4) git rm executor-context；5) 测试同步。
  Failure: core 残留 runtime 提及时 grep 检查红阻断。
  ```

- Verify: `grep -rn "lsp_" packages/core/src/` 无命中；`pnpm -r typecheck` 与两包 test 全绿。

#### 步骤 8：doctor 瘦身

- Covers: AC2, AC5
- Target: core workspace/doctor-check-rules.ts 只留 worktree 与 config 两检查并改接 .runtime/worktrees 新路径；doctor-checks.ts 重建最小检查集加空槽提示行；doctor-types.ts CHECK_META 最小化；删除 doctor-local-prompts.ts；doctor.ts 保留报告编排；涟漪点 dsh tooling/commands.ts 的 doctor 转述文案、doctor.test.ts。
- Edit:

  ```text
  Input: doctor-check-rules.ts 的 worktree 与 config 检查实现；doctor-checks.ts 收集逻辑；CHECK_META 结构。
  Output: 检查集只余两类加空槽提示行"检查集待状态机重建"；doctor-local-prompts 删除；CHECK_META 与报告结构最小化；转述文案同步。
  Preconditions: 步骤 7 完成
  Procedure: 1) 删非 worktree/config 规则；2) 两检查改接新路径；3) checks 加空槽提示行；4) git rm doctor-local-prompts.ts；5) CHECK_META 最小化；6) 测试改写。
  Failure: 空槽提示缺失时 doctor 探针输出检查红阻断。
  ```

- Verify: 临时目录跑 doctor 探针输出只含 worktree、config 两检查加提示行；`cd packages/core && pnpm test` 全绿。

#### 步骤 9：init 重写与模板外置

- Covers: AC2, AC5
- Target: core workspace/init.js 重写为 init.ts；新建 core/resources/skeleton/ 模板文件（config 种子、.gitignore 种子）；resources-manifest.ts 补 skeleton 条目；涟漪点 command-ops.ts 的 init 调用、init.test.ts。
- Edit:

  ```text
  Input: init.js 现有内嵌模板字符串与写盘清单。
  Output: init.ts 无内嵌模板，经 manifest 读 skeleton 资源；写盘清单与子任务一布局一致；身份段已无；测试同步。
  Preconditions: 步骤 8 完成
  Procedure: 1) 模板字符串外置为 skeleton 资源文件；2) manifest 登记；3) init.js 重写为 init.ts 并改读 manifest；4) git rm init.js；5) 测试同步。
  Failure: 资源缺失时 init 探针报 RESOURCE 类错误阻断。
  ```

- Verify: 临时目录 init 探针 TOP 清单与子任务一一致且 INIT_OK；`grep -n "configExampleJson" packages/core/src/` 无命中。

#### 步骤 10：会话注入单一解析

- Covers: AC4, AC5
- Target: 新建 core injection/session-assemble.ts 合并 assembleSessionContext、assembleBreadcrumbSync、assembleWorkflowProjection、composeLocalDirectivesText 入口；删除 workflow-service.ts 的 async assembleBreadcrumb 死入口；涟漪点 dsh plugin.ts 149、176、180 三调用点收敛为一个、dsh dispatch/executor.ts 457 与 509 两处 composeLocalDirectivesText 收敛、测试 inject.test.ts 与 plugin.test.ts。
- Edit:

  ```text
  Input: 四个注入组装函数与 plugin.ts、executor.ts 的调用点。
  Output: session-assemble.ts 单一入口每轮只解析一次活跃任务；plugin.ts 单调用点；executor.ts 经入口参数取指令文本；async 死入口删除。
  Preconditions: 步骤 9 完成
  Procedure: 1) 合 session-assemble.ts；2) plugin.ts 三调用点改一次调用；3) executor.ts 两处改经入口；4) 删 async assembleBreadcrumb；5) 测试同步。
  Failure: 多处解析残留时 grep 检查红阻断。
  ```

- Verify: `grep -rn "resolveActiveTask\|readTask(" packages/core/src/` 只命中 session-assemble.ts；`grep -c "assembleSessionContextText" packages/dsh-workloom/src/plugin.ts` 为 1 次调用。

#### 步骤 11：.developer 临时忽略行

- Covers: AC6
- Target: .workloom/.gitignore。
- Edit:

  ```text
  Input: .workloom/.gitignore 现有规则。
  Output: 新增 ".developer" 行加注释"旧 pin 插件运行期产物，容器切换时移除本行"。
  Preconditions: 步骤 10 完成
  Procedure: 1) 追加忽略行与注释。
  Failure: none
  ```

- Verify: `grep -n ".developer" .workloom/.gitignore` 命中；`git status --porcelain` 不出现 .workloom/.developer。

#### 步骤 12：全量验证与 dist 同 commit

- Covers: AC1, AC2, AC3, AC4, AC5, AC6
- Target: 全仓库加 packages/dsh-workloom/dist/。
- Edit:

  ```text
  Input: prd AC1 至 AC6 验证方法。
  Output: 六条 AC 全绿；dist 重建并与全部代码改动同一 commit 提交。
  Preconditions: 步骤 1 至 11 完成
  Procedure: 1) 逐条跑 AC1 至 AC6 验证；2) pnpm -r build 重建 dist；3) git add 全部代码改动与 dist 单一 commit；4) 簿记另走 chore commit。
  Failure: 任一 AC 红回对应步骤修复后重跑。
  ```

- Verify: `git log --oneline -1 --stat` 同 commit 含 src 与 dist 改动；六条 AC 验证方法全过。
