# 包与目录骨架重组

## Design decisions

1. core/src 子包映射：task/ 收 task-store、task-gates、task-mode、active-task、alignment、case 与 service 的 task-ops、alignment-service、case-service；dispatch/ 收 executor-capacity、executor-context、executor-profiles、executor-rotation、executor-tools、dispatch-binding、failover；injection/ 收 breadcrumb、local-prompts、protocol、spec-index、workflow-contract、workflow-contract-types、surface、session-context、workflow-service、step-lookup；workspace/ 收 config、file-atomic、git、identity、init、journal、locate、migrate、worktree 与 service 的 command-ops、doctor、doctor-checks、doctor-check-rules、doctor-fixes、doctor-local-prompts、doctor-tasks、doctor-types、spec-templates。根层只留 index.ts 作对外入口。
2. dsh-workloom/src 子包映射：dispatch/ 收 executor.ts、executor-capacity.ts、executor-continuation.ts、executor-dispatch.ts、executor-guard.ts、executor-injection.ts、executor-receipt.ts、executor-schema.ts、executor-settle.ts、executor-toolface.ts、executor-failover.ts、executor-failover-chain.ts、executor-failover-notify.ts、main-model.ts；tooling/ 收 tasks.ts、commands.ts、journal-tool.ts、skills.ts；根层留 index.ts、plugin.ts、constants.ts。
3. 插件改名：PLUGIN_NAME 与 cordis.patch.yml 插件行 id 同改 'dsh-workloom'，包名 @workloom-ai/dsh-workloom；CONTEXT_KEY_PREFIX 保持 'dsh'，避免现存会话指针失效。
4. resources 目录：packages/core/resources/{skills,templates,workflow,third-party}；skill 脚本测试留在脚本旁，core 测试命令加第二个 glob 覆盖。
5. .workloom 布局：init 停写 .developer、workspace/、config.example.*；worktree 状态目录迁 .runtime/worktrees；.gitignore 保留并覆盖 .runtime/。
6. TS 化边界：本任务把全部测试转 TS 并切 node --test 原生 type stripping；src 遗留 JS 随子任务二至五逐模块重写时转 TS；本任务起禁止新增 JS 文件。
7. 提交分组：步骤一至八只验证不提交；步骤九单一 commit 落全部代码改动与 dist 重建；任务目录簿记文件另走 chore commit。
8. 生产 pin 快照：步骤一把生产 profile lockfile 中 @workloom-ai/adapter-dsh 的钉住 commit 记入任务目录 pin-snapshot.txt；步骤十比对不变。

## Steps

#### 步骤 1：生产 pin 快照与 resources 目录搬迁

- Covers: AC2
- Target: packages/assets/{skills,templates,workflow,third-party} 整体迁 packages/core/resources/；packages/assets/test/case-templates.test.js 迁 packages/core/test/case-templates.test.ts；新建 .workloom/tasks/11-06-sop-structure/pin-snapshot.txt。
- Edit:

  ```text
  Input: packages/assets 目录树；~/.dsh/profiles/web/pnpm-lock.yaml 中 @workloom-ai/adapter-dsh 的 resolution commit；case-templates.test.js 内模板路径引用。
  Output: core/resources 下四个内容目录；case-templates 测试以 TS 形态落在 core/test 且模板引用改指 resources 路径；scan-packages 两个 .test.js 原地改 .ts；pin-snapshot.txt 记录当前 pin commit。
  Preconditions: none
  Procedure: 1) 读生产 lockfile 的 adapter-dsh resolution commit 写入 pin-snapshot.txt；2) git mv 四个内容目录到 packages/core/resources/；3) git mv case-templates.test.js 为 core/test/case-templates.test.ts，模板路径改 ../resources/...，补最小类型标注；4) scan-packages 两个测试文件改 .ts 后缀。
  Failure: lockfile 缺 adapter-dsh resolution 时停止并回报，不猜 commit。
  ```

- Verify: `ls packages/core/resources` 输出四个目录；`cd packages/core && node --test test/case-templates.test.ts` 全绿。

#### 步骤 2：撤 assets 包并重指引用点

- Covers: AC1, AC2
- Target: packages/assets/{index.js,index.d.ts,package.json,README.md} 删除；引用点 packages/adapter-dsh/src/skills.ts 的 SKILL.md 路径清单、commands.ts 的 templates 路径、plugin.ts 的 workflow 文档路径、executor-injection.ts 的 CASE 模板路径；新增 packages/core/src/resources-manifest.ts。
- Edit:

  ```text
  Input: assets 残余四文件；四个引用点中的硬编码相对路径片段（skills.ts 的 SKILL.md 清单、commands.ts 的 templates/spec-index.md、plugin.ts 的 workflow 文档读取、executor-injection.ts 的 CASE 模板读取）。
  Output: core 新增 resources-manifest.ts 集中导出 skills/templates/workflow 条目路径；四个引用点改 import 该 manifest；assets 包残余删除；lockfile 刷新。
  Preconditions: 步骤 1 完成
  Procedure: 1) 新建 resources-manifest.ts 列出全部资源条目；2) 四个引用点逐个改 import manifest 并删硬编码路径；3) 删除 assets 残余文件与空目录；4) pnpm install 刷锁。
  Failure: 任一引用点仍指 packages/assets 路径时 typecheck 报模块缺失阻断。
  ```

- Verify: `grep -rn "packages/assets" packages/` 无命中；`pnpm -r typecheck` 退出码 0。

#### 步骤 3：撤 adapter-pi 包与其 spec

- Covers: AC1
- Target: packages/adapter-pi/ 与 .workloom/spec/adapter-pi/ 删除；AGENTS.md guidelines 表中 adapter-pi/verify 行与验证命令块中 adapter-pi 行。
- Edit:

  ```text
  Input: adapter-pi 目录；spec/adapter-pi 目录；AGENTS.md 的 guidelines 表与常用验证命令块。
  Output: 两目录删除；AGENTS.md 删去 adapter-pi 相关两行；lockfile 刷新。
  Preconditions: 步骤 2 完成
  Procedure: 1) git rm -r packages/adapter-pi .workloom/spec/adapter-pi；2) 编辑 AGENTS.md 删两行；3) pnpm install。
  Failure: none
  ```

- Verify: `ls packages` 只余 core 与 adapter-dsh；`grep -n "adapter-pi" AGENTS.md` 无命中；`pnpm install` 退出码 0。

#### 步骤 4：adapter-dsh 改名 dsh-workloom

- Covers: AC1, AC3
- Target: packages/adapter-dsh/ 目录；其 package.json name 字段；src/constants.ts 的 `export const PLUGIN_NAME = 'workloom-dsh'`；cordis.patch.yml 插件行 `id: workloom-dsh` 与 `name: '@workloom-ai/adapter-dsh'`。
- Edit:

  ```text
  Input: constants.ts 的 PLUGIN_NAME 行；cordis.patch.yml 插件行；package.json name 行。
  Output: 目录 packages/dsh-workloom；包名 @workloom-ai/dsh-workloom；PLUGIN_NAME 与 cordis id 同改 'dsh-workloom'；SOURCE_PLUGIN 继续等于 PLUGIN_NAME；CONTEXT_KEY_PREFIX 不变。
  Preconditions: 步骤 3 完成
  Procedure: 1) git mv packages/adapter-dsh packages/dsh-workloom；2) 改 package.json name；3) 改 constants.ts PLUGIN_NAME；4) 改 cordis.patch.yml id 与 name；5) pnpm install。
  Failure: 宿主侧仍引旧插件名时 plugin 注册测试红暴露。
  ```

- Verify: `grep -rn "adapter-dsh" packages/ .workloom/config.json` 无命中；`cd packages/dsh-workloom && pnpm test` 全绿。

#### 步骤 5：core/src 功能子包划分

- Covers: AC3
- Target: packages/core/src/domain 与 service 下全部文件按 Design decisions 1 映射迁入 task/、dispatch/、injection/、workspace/；packages/core/src/index.ts 导出路径；packages/core/test/ 全部测试 import 路径；packages/core/scripts/copy-domain-dts.mjs 扫描路径。
- Edit:

  ```text
  Input: Design decisions 1 映射表；index.ts 各 export 块的 './domain/x.js' 路径；测试文件 import 行；copy-domain-dts.mjs 的 domain 目录扫描逻辑。
  Output: 四个子目录就位，domain 与 service 空目录删除；根层只留 index.ts；index.ts、测试、脚本内路径同步更新。
  Preconditions: 步骤 4 完成
  Procedure: 1) mkdir 四个子目录；2) 按映射 git mv 每个文件；3) 修 src 内部相对 import；4) 修 index.ts 导出路径；5) 修测试 import 路径；6) 删空目录；7) copy-domain-dts.mjs 改扫四个子目录的 .js 文件。
  Failure: 漏改 import 时 typecheck 或测试红阻断。
  ```

- Verify: `tree -L 2 packages/core/src` 只现四子目录与 index.ts；`cd packages/core && pnpm test` 全绿。

#### 步骤 6：dsh-workloom/src 功能子包划分

- Covers: AC3
- Target: packages/dsh-workloom/src 下文件按 Design decisions 2 映射迁入 dispatch/ 与 tooling/；其 test/ 九个测试文件 import 路径。
- Edit:

  ```text
  Input: Design decisions 2 映射表；包内 import 行；测试 import 行。
  Output: dispatch/ 与 tooling/ 就位；根层留 index.ts、plugin.ts、constants.ts；包内与测试 import 同步更新。
  Preconditions: 步骤 5 完成
  Procedure: 1) mkdir dispatch tooling；2) 按映射 git mv；3) 修包内 import；4) 修测试 import。
  Failure: 漏改 import 时 typecheck 红阻断。
  ```

- Verify: `tree -L 2 packages/dsh-workloom/src` 现 dispatch、tooling 与三个根文件；`cd packages/dsh-workloom && pnpm test` 全绿。

#### 步骤 7：.workloom 布局定版

- Covers: AC4
- Target: 仓库 .workloom/.developer、workspace/、worktree/、config.example.js、config.example.json；packages/core/src/workspace/init.js 的骨架常量 `configExampleJson: 'config.example.json',` 与 .developer、workspace 写盘段；packages/core/src/workspace/worktree.js 的 worktree 根目录常量；.workloom/spec/repo/worktree-setup/index.md 目录描述；init 与 worktree 相关测试期望路径。
- Edit:

  ```text
  Input: init.js 骨架写盘常量与写盘段；worktree.js 根目录常量；.gitignore 内容；worktree-setup spec 的目录描述段。
  Output: 仓库 .workloom 只余 tasks、spec、.runtime、config.json 加 .gitignore；worktree 状态落在 .runtime/worktrees；init 停写 .developer、workspace/、config.example.*，改保 .runtime/worktrees；spec 描述同步。
  Preconditions: 步骤 6 完成
  Procedure: 1) git rm .developer、workspace/、config.example.*；git mv worktree 到 .runtime/worktrees；2) 改 init.js 骨架清单与写盘段；3) 改 worktree.js 根目录常量；4) 改 worktree-setup spec 描述；5) 修 init 与 worktree 测试期望路径；6) 补 .gitignore 覆盖 .runtime/。
  Failure: worktree 路径漏改时 worktree 生命周期测试红阻断。
  ```

- Verify: `ls -a .workloom` 只现四件加 .gitignore；`cd packages/core && pnpm test` 全绿。

#### 步骤 8：测试 TS 化与 runner 切换

- Covers: AC5
- Target: packages/core/test/ 三十八个 .test.js；packages/dsh-workloom/test/ 九个 .test.js；packages/core/resources/skills/workloom-packages-scan/scripts/ 两个 .test.js；core 与 dsh-workloom 的 package.json test 脚本行 `"pnpm run build && node --test 'test/*.test.js'"`。
- Edit:

  ```text
  Input: 各 .test.js 文件；两包 package.json 的 test 脚本行。
  Output: 全部测试文件 .ts 且仅用可擦除语法；core test 脚本改 node --test 'test/*.test.ts' 加 resources 脚本 glob；dsh-workloom test 脚本改 node --test 'test/*.test.ts'；去掉 build 前缀。
  Preconditions: 步骤 7 完成
  Procedure: 1) 逐文件改 .ts 后缀并补最小类型标注；2) 改两包 test 脚本；3) 全仓确认无 bun test 残留。
  Failure: 测试含不可擦除语法时 node strip-types 运行报错暴露。
  ```

- Verify: `cd packages/core && pnpm test` 全绿；`cd packages/dsh-workloom && pnpm test` 全绿；`grep -rn "bun test" packages/ AGENTS.md` 无命中。

#### 步骤 9：配置与文档同步、dist 同 commit 重建

- Covers: AC1, AC6
- Target: .workloom/config.json 的 packages 映射；AGENTS.md 常用验证命令块；packages/dsh-workloom/dist/。
- Edit:

  ```text
  Input: config.json 现四包条目；AGENTS.md 验证命令块现六行；dist 构建产物。
  Output: config.json 只余 core、dsh-workloom、repo 三条目；AGENTS.md 验证命令改新包名与 TS glob；dist 重建并与本任务全部代码改动同一 commit 提交。
  Preconditions: 步骤 5 至 8 完成
  Procedure: 1) 重写 config.json packages；2) 重写 AGENTS.md 验证命令块；3) pnpm -r build 重建 dist；4) git add 全部代码改动与 dist，单一 commit 提交。
  Failure: dist 与 src 不同 commit 时 AC6 验证失败，amend 重做。
  ```

- Verify: `git log --oneline -1 --stat` 同 commit 含 dist/ 与 src/ 改动；`cat .workloom/config.json` 三条目。

#### 步骤 10：全量验收

- Covers: AC1, AC2, AC3, AC4, AC5, AC6, AC7
- Target: 全仓库加生产 profile lockfile。
- Edit:

  ```text
  Input: prd AC1 至 AC7 的验证方法；pin-snapshot.txt。
  Output: 验收报告七项全绿。
  Preconditions: 步骤 9 完成
  Procedure: 1) 逐条跑 AC1 至 AC6 验证方法；2) 读生产 lockfile adapter-dsh pin commit 与 pin-snapshot.txt 比对；3) 观测现有生产实例行为确认宿主加载正常；4) 汇总报告。
  Failure: 任一 AC 红则回对应步骤修复后重跑本步骤。
  ```

- Verify: 七条 AC 验证方法全部通过。
