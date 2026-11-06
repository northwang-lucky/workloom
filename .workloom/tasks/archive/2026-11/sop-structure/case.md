---
version: 1
task: tasks/11-06-sop-structure
---

# CASE: 包与目录骨架重组

## References

- PRD: `prd.md`
- Implementation: `plan.md`
- Code target: worktree `.workloom/worktree/11-06-sop-structure`（分支 `workloom/11-06-sop-structure`，基线 `main`@`0ccbd30`）。下文相对路径以该 worktree 为根；`<task>` 指主仓库任务目录（本文件所在 `.workloom/tasks/11-06-sop-structure`），可用 `$(cd "$(git rev-parse --git-common-dir)/.." && pwd)/.workloom/tasks/11-06-sop-structure` 解析。
- Source task: none（容器任务 workloom-sop 重构的子任务，无归档来源）

## Scope

- Requirements: R1、R2、R3、R4、R5、R6、R7、R8、R9、R10、R11
- Acceptance criteria: AC1、AC2、AC3、AC4、AC5、AC6、AC7
- Out of scope:
  - 子任务二至七的范围：模块去留清理、任务模式状态机、角色派发、父子编排、迁移 skill、workflow 与 skill 内容改写（PRD non-goals）。
  - core/src 遗留 JS 领域模块的 TypeScript 转换：PRD Scope 7 限定“新代码与迁移代码 TS”，plan 决策 6 把遗留 JS 的重写放到子任务二至五；本任务只要求测试全量 TS 化与 node --test 直跑。
  - `.workloom/spec/**` 的叙述更新（含 `repo/code-style/verify.md` 里旧的 adapter-pi/bun 说法）：无 R/AC 明文要求，留给后续文档任务；本 CASE 的测试口径以 plan 步骤 8 为准。
  - 生产 profile 的重钉、重装与实例重启：容器决定 10，任务期间 pin 不动，agent 不重启实例。
  - 资源内 skill 的说明文本与 eval 夹具改写（如 `run-scenario.sh` 里的 adapter-pi 启动参数）：属子任务七；本任务只搬迁内容并更新资源指向。

## Static Review

### SR1 dsh-workloom 包名与依赖

- Covers: AC1（R1、R3）
- Target: `packages/dsh-workloom/package.json#name`
- Checks:
  1. 包名 `@workloom-ai/dsh-workloom`；`exports` 只暴露包入口；`files` 含 `dist` 与 `cordis.patch.yml`。
  2. 依赖只含 `@workloom-ai/core`（`file:../core`）与 host 侧 peer deps；无 `@workloom-ai/assets`、`@workloom-ai/adapter-pi`、`file:../assets`、`file:../adapter-pi`。
  3. `scripts.test` 为 `node --test` 直跑 `test/*.test.ts`，无 `pnpm run build &&` 前缀、无 bun；`build`/`typecheck` 由 tsc 负责。
  4. 仓库包集合：`packages/` 下只有 `core` 与 `dsh-workloom`；根 `pnpm-workspace.yaml` 仍以 `packages/*` 覆盖。
  5. 旧包身份在包清单与代码面清零：`grep -rnE "@workloom-ai/(assets|adapter-pi|adapter-dsh)|packages/(assets|adapter-pi|adapter-dsh)" packages/*/package.json packages/*/src packages/*/cordis.patch.yml .workloom/config.json pnpm-lock.yaml` 无命中。
- Expected: 包名、依赖、脚本、包集合四项成立；旧包身份在包清单与代码面零命中。

### SR2 resources 清单

- Covers: AC2（R2；R1 的路径残留）
- Target: `packages/core/src/resources-manifest.ts#RESOURCES_ROOT`
- Checks:
  1. 清单集中登记 skills/templates/workflow 三类资源的条目路径与读取函数；工作流文档、CASE 两模板、spec 两模板、skill 注册清单的读取都经该清单，不再散落硬编码路径；文件缺失返回 null 的既有语义不变。
  2. 目录内容：`packages/core/resources` 顶层恰为 `skills`、`templates`、`workflow`、`third-party` 四个目录；`third-party/mattpocock-skills/LICENSE` 存在；四个目录的文件数与 `main` 上 `packages/assets/<同名目录>` 相同（内容无丢失）。
  3. 路径残留：`grep -rn "packages/assets\|packages/adapter-pi" --include='*.ts' --include='*.js' --include='*.json' packages/ .workloom/config.json pnpm-lock.yaml` 无命中；`@workloom-ai/assets` 在 `packages/**/package.json` 与 `pnpm-lock.yaml` 无命中；`.workloom/spec/adapter-pi` 目录不存在。
  4. dsh-workloom 的四个消费点（工作流、CASE 模板、spec 模板、skill 注册）改从 core 包入口取清单导出，不再 import `@workloom-ai/assets`；注入展示路径改为 `packages/core/resources/...`。
- Expected: 四目录与 LICENSE 齐全、文件数不减少；清单是唯一资源入口；源码与配置不再引用旧包路径。

### SR3 core 包入口与功能子包结构

- Covers: AC3（R4、R5）
- Target: `packages/core/src/index.ts#exports`
- Checks:
  1. core 根层只留包外入口：`packages/core/src` 顶层只余 `index.ts`（资源清单若放在根层则为 `index.ts` 与 `resources-manifest.ts`），目录恰为 `task/`、`dispatch/`、`injection/`、`workspace/`；`domain/`、`service/`、`surface.ts`、`workflow-contract-types.ts` 不再位于根层。
  2. dsh-workloom 根层：顶层文件恰为 `index.ts`、`plugin.ts`、`constants.ts`，目录恰为 `dispatch/`、`tooling/`；插件注册入口仍在根层。
  3. 入口导出：`index.ts` 是包外唯一入口（core `exports` 仅 `.`），资源清单等公共符号由入口具名导出；文件落位与 plan 决策 1、决策 2 的映射表一致，测试不在 src 内。
  4. 跨包引用：对另一个 workspace 包的引用只用裸包名（dsh 到 `@workloom-ai/core`）；无逃出本包根的相对 import，无 `@workloom-ai/core/src/...` 或 `@workloom-ai/core/dist/...` 深引。AC3 的“跨子包引用”按包边界判定：包内子目录之间的相对 import 是同一包的模块图（核心模块互引不可避免），不算跨包引用；跨包引用必须走包入口。
  5. 入口边界：功能子包内不 import 包根入口 `index.ts`/`index.js`，避免入口环；根层共享文件（如 dsh 的 `constants.ts`）不在此限。
- Expected: 两个 src 的顶层形状与映射表一致；跨包引用全部走包入口；子包互引只指向具名模块，不绕行包根入口。

### SR4 init 骨架

- Covers: AC4（R6）
- Target: `packages/core/src/workspace/init.js#SUB_DIRS`
- Checks:
  1. 分支布局：任务分支 checkout 的 `.workloom` 顶层只有 `tasks`、`spec`、`config.json`、`.gitignore`（`.runtime` 为每机运行时目录，可缺席，由 init 探针验证）；无 `workspace/`、`.developer`、`config.example.js`、`config.example.json`、`spec/adapter-pi/`、`worktree/`。
  2. init 骨架：`SUB_DIRS` 与写盘清单只保留 `tasks`、`spec`、`.runtime` 下的目录、`config.json`、`.gitignore`；删除 `workspace`、`.developer`、`config.example.json/js` 的创建段与文件名字段；返回值不再读 `.developer`。
  3. 忽略规则：仓库 `.workloom/.gitignore` 覆盖 `.runtime/`；主仓库运行目录里的 `workspace/`、`.developer` 是旧 pin 插件的运行期产物（R11 期间仍会写 journal），不作为布局失败项。
- Expected: 布局定义（分支 tracked 文件加 init 骨架）只含四件加 `.gitignore`；init 不再创建或读取已撤目录；旧运行时残留与布局判定分离。

### SR5 core 包发布面与测试配置

- Covers: AC5（R7、R8）
- Target: `packages/core/package.json#files`
- Checks:
  1. 发布面：`files` 同时包含 `dist` 与 `resources`（git 子目录安装按 files 打包，缺 resources 会让宿主读不到资源）；`exports` 仅 `.`；依赖不含 `@workloom-ai/assets`。
  2. core 脚本：`build` = tsc + copy-domain-dts，`typecheck` = tsc --noEmit，`test` = `node --test` 直跑 `'test/*.test.ts'` 与 resources 脚本 glob；无 build 前缀、无 bun；`tsc` 只出现在 build/typecheck。
  3. 测试文件：core/dsh `test/` 与 resources 脚本测试全 `.ts`，无 `.test.js`；与 `main` 的 `.test.js` 一一对应（重命名不删减），assets 的 `case-templates.test.js` 以 `core/test/case-templates.test.ts` 落位。
  4. 可擦除语法：`packages` 下 `.ts` 文件（排除 node_modules、dist）无 `enum`、`namespace`、构造函数参数属性等不可擦除语法；测试只加最小类型标注，Node v24.18.1 类型擦除可直接执行。
- Expected: 发布包含 resources；core 测试脚本是 node --test TS glob；测试全 TS 且可被 type stripping 执行；`pnpm -r typecheck` 仍只由 tsc 负责。

### SR6 dsh-workloom dist 产物

- Covers: AC6（R9）
- Target: `packages/dsh-workloom/dist/index.js`
- Checks:
  1. 同 commit：任务分支上每个改动 `packages/dsh-workloom/src/**` 的 commit 同时改动 `packages/dsh-workloom/dist/**`。
  2. 产物新鲜：C1 的 `pnpm -r build` 之后 `git status --porcelain packages/dsh-workloom/dist packages/core/dist` 为空。
  3. 布局一致：`dist` 根层只余 `index.js`、`plugin.js`、`constants.js`，旧布局产物（executor-*.js、tasks.js 等）已清理；core `dist` 不再保留旧 `domain/`、`service/` 目录。
  4. 提交规范：commit message 符合 `repo/commits`（中文、`<type>(<scope>): <描述>`），代码改动与任务簿记 commit 分离。
- Expected: 每个 src 改动 commit 都带同包 dist 改动；构建可复现；dist 与 src 同形状。

### SR7 lockfile 与生产 pin

- Covers: AC7（R11；R3 的 lockfile 面）
- Target: `pnpm-lock.yaml#importers`
- Checks:
  1. 仓库 lockfile 与新布局一致：importers 只含根、`packages/core`、`packages/dsh-workloom`，无 `assets`、`adapter-pi`、`adapter-dsh` 条目；依赖不再引用 `@workloom-ai/assets`。
  2. 生产 pin 未变：profile lockfile 里 `@workloom-ai/adapter-dsh` 的 tarball commit 等于 `pin-snapshot.txt` 的 `pin_commit`，设计基线为 `1dc46f7ce515afb0e9b907aae809ca9d11dc8e9d`；specifier 仍为 `github:northwang-lucky/workloom#path:packages/adapter-dsh`。
  3. 旧 pin 可用：该 commit 在远端仓库仍可达（`git ls-remote` 命中），或 tarball URL 可取（HTTP 200）。
  4. 宿主加载：运行中的 `dsh web` 进程存在且早于本任务创建；profile `dsh.profile.bundles` 仍含 `@workloom-ai/adapter-dsh`；`node_modules/@workloom-ai/adapter-dsh/dist` 就位；`web.log` 有 workloom adapter 的运行期输出。
  5. 任务期间未重钉或重装：profile package.json 与 lockfile 的 pin 与快照一致，未因改名解析到新包。
- Expected: 仓库 lockfile 无旧包条目；生产四处证据指向同一旧 commit；宿主进程与插件产物可用；生产环境零改动。

### SR8 插件名常量

- Covers: AC1（R3）
- Target: `packages/dsh-workloom/src/constants.ts#PLUGIN_NAME`
- Checks:
  1. `PLUGIN_NAME` 为 `'dsh-workloom'`；`SOURCE_PLUGIN` 仍由 `PLUGIN_NAME` 赋值，不另写字面量；`CONTEXT_KEY_PREFIX` 仍为 `'dsh'`，现存会话指针不失效。
  2. 注入源名与插件名同源，插件注册与注入用例（C5 的 plugin、inject 测试）通过。
- Expected: 三处常量取值正确，注入源名不另写字面量。

### SR9 cordis 补丁

- Covers: AC1（R3）
- Target: `packages/dsh-workloom/cordis.patch.yml#insert[0]`
- Checks:
  1. 插件行 `id: dsh-workloom` 与 `name: '@workloom-ai/dsh-workloom'` 成对出现。
  2. 包 `dsh.bundle.patch` 仍指向 `./cordis.patch.yml`，`files` 仍包含该文件。
- Expected: 补丁行与新包名一致，安装入口不变。

### SR10 AGENTS.md 与配置同步

- Covers: AC1（R1、R10）
- Target: `AGENTS.md#常用验证命令`
- Checks:
  1. 常用验证命令块为新布局（`pnpm lint`、`pnpm -r typecheck`、`pnpm -r build`，core 与 dsh-workloom 的 `node --test ... '*.test.ts'`），无 `bun test`、无 adapter-pi。
  2. 仓库结构树只列 core 与 dsh-workloom，不把 assets、adapter-pi 写成现存包。
  3. `.workloom/config.json` 的 `packages` 键恰为 `core`、`dsh-workloom`、`repo`，path 分别为 `packages/core`、`packages/dsh-workloom`、`.`；无旧包条目。
  4. 插件变更流程段允许保留 `#path:packages/adapter-dsh`（当前生产 pin 的安装路径，R11 要求不变），不计残留。
- Expected: 验证命令、结构树、配置映射三处与新布局一致；旧 pin 说明保留。

### SR11 README.md 结构树

- Covers: AC2（R1、R2）
- Target: `README.md#仓库结构`
- Checks:
  1. 仓库结构树只列 core 与 dsh-workloom，不把 assets、adapter-pi 写成现存包。
  2. 两包职责描述与新布局一致（core 内含 resources 资源目录；dsh-workloom 为 DSH 插件）。
- Expected: README 不再把已删包写成现存。

### SR12 worktree 运行目录

- Covers: AC4（R6）
- Target: `packages/core/src/workspace/worktree.js#WORKTREE_DIR`
- Checks:
  1. `WORKTREE_DIR` 指向 `.runtime/worktrees`，创建路径拼接一致，不再向 `.workloom/worktree` 写。
  2. `.workloom/spec/repo/worktree-setup/index.md` 的描述同步（若该文更新）。
- Expected: 新 worktree 落在 `.workloom/.runtime/worktrees`，旧路径不再产生。

## Runtime Cases

### C1 门禁与 workspace 包清单

- Covers: AC1
- Preconditions:
  1. worktree 依赖已准备，`pnpm install` 可执行。
  2. 任务分支已有实现改动且可构建；本 case 不读写生产 profile。
- Steps:
  1. `pnpm install --frozen-lockfile`
  2. `pnpm -r build`
  3. `pnpm -r typecheck`
  4. `pnpm lint`
  5. `pnpm -r ls --depth -1`
  6. `ls packages`
  7. `grep -rnE "@workloom-ai/(assets|adapter-pi|adapter-dsh)|packages/(assets|adapter-pi|adapter-dsh)" packages/*/package.json packages/*/src packages/*/cordis.patch.yml .workloom/config.json pnpm-lock.yaml`
- Expected:
  1. 步骤 1 至 4 退出码均为 0。
  2. 步骤 5 只出现 `workloom`（根，PRIVATE）、`@workloom-ai/core`、`@workloom-ai/dsh-workloom` 三条记录。
  3. 步骤 6 输出恰为 `core` 与 `dsh-workloom`。
  4. 步骤 7 无命中。
- Evidence:
  - `case-evidence/c1-install.log`
  - `case-evidence/c1-build.log`
  - `case-evidence/c1-typecheck.log`
  - `case-evidence/c1-lint.log`
  - `case-evidence/c1-pnpm-ls.log`
  - `case-evidence/c1-old-names-grep.log`
- Cleanup: none

### C2 resources 内容与残留引用

- Covers: AC2
- Preconditions:
  1. C1 的 build 已通过，dist 与源码一致。
- Steps:
  1. `ls packages/core/resources`，逐个确认目录存在。
  2. `test -f packages/core/resources/third-party/mattpocock-skills/LICENSE`
  3. `for d in skills templates workflow third-party; do base=$(git ls-tree -r --name-only main "packages/assets/$d" | wc -l); now=$(find "packages/core/resources/$d" -type f | wc -l); echo "$d base=$base now=$now"; done`
  4. `grep -rn "packages/assets\|packages/adapter-pi" --include='*.ts' --include='*.js' --include='*.json' packages/ .workloom/config.json pnpm-lock.yaml`
  5. `node --input-type=module -e 'import { loadCaseTemplateText, loadWorkflowContractText } from "./packages/core/dist/index.js"; const c = loadCaseTemplateText(); const w = loadWorkflowContractText(); if (!c?.includes("## Traceability") || !w) { console.error("RESOURCE_LOAD_FAIL"); process.exit(1) } console.log("RESOURCE_LOAD_OK")'`
  6. `ls .workloom/spec`，确认无 `adapter-pi`。
- Expected:
  1. 步骤 1 恰为 `skills`、`templates`、`third-party`、`workflow` 四个目录。
  2. 步骤 2 退出码 0。
  3. 步骤 3 四个目录的 base 与 now 相等。
  4. 步骤 4 无命中；步骤 5 输出 `RESOURCE_LOAD_OK`；步骤 6 无 `adapter-pi`。
- Evidence:
  - `case-evidence/c2-resources-ls.log`
  - `case-evidence/c2-resource-counts.log`
  - `case-evidence/c2-residual-grep.log`
  - `case-evidence/c2-resource-load.log`
- Cleanup: none

### C3 子包结构与引用边界

- Covers: AC3
- Preconditions:
  1. C1 的 typecheck 已通过。
- Steps:
  1. `find packages/core/src -maxdepth 1 -mindepth 1 | sort`
  2. `find packages/dsh-workloom/src -maxdepth 1 -mindepth 1 | sort`
  3. `grep -rnE "from '(@workloom-ai/core|@workloom-ai/dsh-workloom)/" packages/ --exclude-dir=node_modules --exclude-dir=dist`
  4. `grep -rnE "from '\.\./(\.\./)*(core|dsh-workloom)/" packages/*/src packages/*/test`
  5. `grep -rnE "from '\.\./index\.(js|ts)'" packages/core/src/task packages/core/src/dispatch packages/core/src/injection packages/core/src/workspace packages/dsh-workloom/src/dispatch packages/dsh-workloom/src/tooling`
  6. `node -e 'const p=require("./packages/core/package.json"); console.log(JSON.stringify(Object.keys(p.exports)))'`
- Expected:
  1. 步骤 1 只出现 `task`、`dispatch`、`injection`、`workspace` 四个目录与 `index.ts`、`resources-manifest.ts`；若清单放在子包内，则根层只余 `index.ts`。
  2. 步骤 2 只出现 `dispatch`、`tooling` 两个目录与 `index.ts`、`plugin.ts`、`constants.ts`。
  3. 步骤 3 至 5 无命中；步骤 6 输出 `["."]`。
- Evidence:
  - `case-evidence/c3-core-src-tree.log`
  - `case-evidence/c3-dsh-src-tree.log`
  - `case-evidence/c3-import-boundaries.log`
- Cleanup: none

### C4 .workloom 布局与 init 骨架

- Covers: AC4
- Preconditions:
  1. C1 的 build 已通过，init 探针使用最新 dist。
- Steps:
  1. `ls -A .workloom`（worktree 根）
  2. `MAIN=$(cd "$(git rev-parse --git-common-dir)/.." && pwd); ls -A "$MAIN/.workloom"`
  3. 在 worktree 根跑 init 探针：
     ```bash
     node --input-type=module -e '
       import { mkdtempSync, readdirSync, rmSync } from "node:fs"
       import { tmpdir } from "node:os"
       import { join } from "node:path"
       import { initWorkloom } from "./packages/core/dist/index.js"
       const root = mkdtempSync(join(tmpdir(), "wl-init-probe-"))
       const [err, result] = initWorkloom(root)
       if (err) { console.error("INIT_ERR", err.message); process.exit(1) }
       const top = readdirSync(join(root, ".workloom")).sort()
       const forbidden = top.filter((n) => ["workspace", ".developer", "config.example.js", "config.example.json"].includes(n))
       console.log("TOP", JSON.stringify(top))
       console.log("FORBIDDEN", JSON.stringify(forbidden))
       console.log("CREATED", JSON.stringify(result.created))
       console.log("INIT_OK")
       rmSync(root, { recursive: true, force: true })
     '
     ```
  4. `cd packages/core && node --test 'test/worktree-*.test.ts'`
  5. `grep -n "\.runtime/" .workloom/.gitignore`
- Expected:
  1. 步骤 1 输出为 `tasks`、`spec`、`config.json`、`.gitignore` 四件；允许出现 `.runtime`（运行时目录）；无 `workspace`、`.developer`、`config.example.js`、`config.example.json`、`worktree`。
  2. 步骤 2 只做记录：主仓库里的 `workspace/`、`.developer` 属旧 pin 运行期产物（见 SR4 检查 4），不判失败。
  3. 步骤 3 输出 `TOP [".gitignore",".runtime","config.json","spec","tasks"]`、`FORBIDDEN []`、`INIT_OK`。
  4. 步骤 4 全绿，用例断言 worktree 落在 `.workloom/.runtime/worktrees`。
  5. 步骤 5 命中 `.runtime/`。
- Evidence:
  - `case-evidence/c4-branch-layout.log`
  - `case-evidence/c4-main-layout.log`
  - `case-evidence/c4-init-probe.log`
  - `case-evidence/c4-worktree-tests.log`
- Cleanup: init 探针在脚本内删除临时目录。

### C5 TS 测试与可擦除语法

- Covers: AC5
- Preconditions:
  1. C1 的 build 已通过，dsh 测试经 dist 加载被编译的 TS 模块。
- Steps:
  1. `cd packages/core && node --test 'test/*.test.ts'`
  2. `cd packages/core && node --test 'resources/skills/workloom-packages-scan/scripts/*.test.ts'`
  3. `cd packages/dsh-workloom && node --test 'test/*.test.ts'`
  4. 迁移完整性（core 与 dsh 各跑一次，期望输出为空）：
     ```bash
     comm -23 \
       <(git ls-tree -r --name-only main packages/core/test | grep '\.test\.js$' | sed 's/\.test\.js$/.test.ts/' | sort) \
       <(find packages/core/test -maxdepth 1 -name '*.test.ts' -printf '%p\n' | sort)
     comm -23 \
       <(git ls-tree -r --name-only main packages/adapter-dsh/test | grep '\.test\.js$' \
         | sed 's#^packages/adapter-dsh/test/\(.*\)\.test\.js$#packages/dsh-workloom/test/\1.test.ts#' | sort) \
       <(find packages/dsh-workloom/test -maxdepth 1 -name '*.test.ts' -printf '%p\n' | sort)
     comm -23 \
       <(git ls-tree -r --name-only main packages/assets/skills/workloom-packages-scan/scripts | grep '\.test\.js$' \
         | sed 's#^packages/assets/skills/workloom-packages-scan/scripts/\(.*\)\.test\.js$#packages/core/resources/skills/workloom-packages-scan/scripts/\1.test.ts#' | sort) \
       <(find packages/core/resources/skills/workloom-packages-scan/scripts -maxdepth 1 -name '*.test.ts' -printf '%p\n' | sort)
     ```
  5. `find packages -name '*.test.js' -not -path '*/node_modules/*' -not -path '*/dist/*'`
  6. `grep -rnE "bun test|bun:test" packages AGENTS.md --include='*.ts' --include='*.js' --include='*.json' --include='*.md'`
  7. `grep -rnE "^[[:space:]]*(export[[:space:]]+)?(const[[:space:]]+)?enum[[:space:]]|^[[:space:]]*(export[[:space:]]+)?namespace[[:space:]]|constructor[[:space:]]*\([^)]*\b(private|public|protected)[[:space:]]+[A-Za-z_$]" --include='*.ts' packages`
- Expected:
  1. 步骤 1 至 3 全绿，0 fail。
  2. 步骤 4 两边输出为空。
  3. 步骤 5 无输出；步骤 6、7 无命中。
- Evidence:
  - `case-evidence/c5-core-tests.log`
  - `case-evidence/c5-core-resources-tests.log`
  - `case-evidence/c5-dsh-tests.log`
  - `case-evidence/c5-migration-diff.log`
  - `case-evidence/c5-bun-enum-grep.log`
- Cleanup: none

### C6 dist 同 commit 与产物新鲜度

- Covers: AC6
- Preconditions:
  1. 实现已在任务分支提交，worktree 无未提交实现改动；C1 的 build 已通过。若 HEAD 仍在 main 基线或实现未提交，记 blocked 并回报。
- Steps:
  1. `git log --oneline main..HEAD -- packages/dsh-workloom/src`
  2. 逐 commit 检查同 commit 是否带 dist：
     ```bash
     for c in $(git log --format=%H main..HEAD -- packages/dsh-workloom/src); do
       git show --name-only --format= "$c" | grep -q '^packages/dsh-workloom/dist/' || echo "MISSING_DIST $c"
     done
     ```
  3. `git show --stat --oneline $(git log --format=%H main..HEAD -- packages/dsh-workloom/src | head -1)`
  4. `pnpm -r build && git status --porcelain packages/dsh-workloom/dist packages/core/dist`
  5. `find packages/dsh-workloom/dist -maxdepth 1 -name '*.js' ! -name '*.d.ts' -printf '%f\n' | sort`
- Expected:
  1. 步骤 1 至少一条 commit；步骤 2 无 `MISSING_DIST` 输出。
  2. 步骤 3 的 stat 同时列出 `src/` 与 `dist/` 文件。
  3. 步骤 4 无输出（构建可复现、产物已提交）。
  4. 步骤 5 恰为 `constants.js`、`index.js`、`plugin.js`。
- Evidence:
  - `case-evidence/c6-commit-list.log`
  - `case-evidence/c6-same-commit.log`
  - `case-evidence/c6-dist-status.log`
  - `case-evidence/c6-dist-root.log`
- Cleanup: none

### C7 生产 pin 未变与宿主加载

- Covers: AC7
- Preconditions:
  1. 生产 profile 目录可读：`${DSH_HOME:-$HOME/.dsh}/profiles/web`。
  2. 现有生产实例运行中；本 case 只读，不重启、不重钉。
- Steps:
  1. 取当前 pin 与快照：
     ```bash
     MAIN=$(cd "$(git rev-parse --git-common-dir)/.." && pwd)
     TASK="$MAIN/.workloom/tasks/11-06-sop-structure"
     PROFILE="${DSH_HOME:-$HOME/.dsh}/profiles/web"
     PIN_NOW=$(grep -o 'tar\.gz/[0-9a-f]\{40\}#path:packages/adapter-dsh' "$PROFILE/pnpm-lock.yaml" | head -1 | sed 's#tar.gz/##; s/#.*//')
     PIN_SNAP=$(grep -oE '[0-9a-f]{40}' "$TASK/pin-snapshot.txt" | head -1)
     echo "now=$PIN_NOW snap=$PIN_SNAP"
     ```
  2. `timeout 20 git ls-remote https://github.com/northwang-lucky/workloom.git refs/heads/main`
  3. `pgrep -af "dsh web"`；`curl -s -o /dev/null -w '%{http_code}\n' --max-time 5 http://127.0.0.1:3088/`
  4. `grep -n "adapter-dsh" "$PROFILE/package.json"`；`ls "$PROFILE/node_modules/@workloom-ai/adapter-dsh/dist/index.js"`
  5. `grep -i "workloom" "${DSH_HOME:-$HOME/.dsh}/web.log" | tail -5`
- Expected:
  1. 步骤 1 的 `now` 与 `snap` 同值 `1dc46f7ce515afb0e9b907aae809ca9d11dc8e9d`。
  2. 步骤 2 远端 `refs/heads/main` 命中该 commit；网络不可用时记环境受限，改用 tarball 可达性补充。
  3. 步骤 3 有运行中的 dsh web 进程，HTTP 返回 200 或 401（监听正常）。
  4. 步骤 4 bundle 列表含 `@workloom-ai/adapter-dsh`，dist 入口存在。
  5. 步骤 5 有 workloom adapter 的运行期输出（journal、executor 或 breadcrumb 前缀）。
- Evidence:
  - `case-evidence/c7-pin-compare.log`
  - `case-evidence/c7-remote-pin.log`
  - `case-evidence/c7-host-process.log`
  - `case-evidence/c7-profile-install.log`
  - `case-evidence/c7-host-log.log`
- Cleanup: none（只读生产目录，不做任何写操作）

## Coverage

- Tool: Node.js v24.18.1 内置测试覆盖率（`node --test --experimental-test-coverage`）与原生 `lcov` reporter
- Instrumentation: 两个包先经 C1 的 `pnpm -r build`；测试套件以 coverage 模式各跑一遍，`--test-coverage-include` 同时覆盖 `src/**` 与 `dist/**`（core 的遗留 JS 模块直接从 src 加载，TS 模块与 dsh-workloom 经 dist 加载），lcov 原始报告写入任务目录。聚合时把 `SF:dist/...` 映射回 `src/...`，同名源文件取 src 记录，避免同一模块双计；未覆盖行取 lcov 中 hits=0 的 DA 行号区间。
- Aggregate command:
  ```bash
  MAIN=$(cd "$(git rev-parse --git-common-dir)/.." && pwd)
  TASK="$MAIN/.workloom/tasks/11-06-sop-structure"
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
- Scope: `packages/core/src/**` 与 `packages/dsh-workloom/src/**` 中可执行的 TS/JS 模块（同路径的 dist 产物映射回源）；新文件 `resources-manifest.ts`、改动的入口与子包模块全部纳入。
- Exclusions:
  - packages/core/src/: 功能子包搬迁与 import 同步，无行为变更；结构由 SR3 逐项验证，行为回归由 C5 全量测试覆盖
  - packages/dsh-workloom/src/: 功能子包搬迁与 import 同步，无行为变更；结构由 SR3 逐项验证，行为回归由 C5 全量测试覆盖
  - packages/core/test/: 测试自身，C5 验迁移完整性
  - packages/dsh-workloom/test/: 测试自身，C5 验迁移完整性
  - packages/core/dist/: 构建产物，C6 验同 commit 与新鲜度
  - packages/dsh-workloom/dist/: 构建产物，C6 验同 commit 与新鲜度
  - packages/core/resources/: 内容原样搬迁，C2 验计数与 LICENSE
  - packages/core/scripts/: 构建脚本随布局调整，SR5 与 C1 验证
  - packages/dsh-workloom/tsconfig.json: 编译配置随布局调整，C1 验 typecheck 与 build
  - spec/repo/worktree-setup/index.md: worktree 运行目录描述随 .runtime/worktrees 更新，由 SR12 覆盖
  - **/*.d.ts: 类型产物，无运行时行
  - **/*.js.map: 映射产物，无运行时行
- Raw outputs:
  - `coverage/core.lcov.info`
  - `coverage/dsh-workloom.lcov.info`

## Standard Verification

| Command | Expected |
| --- | --- |
| `pnpm install --frozen-lockfile` | 退出码 0 |
| `pnpm -r build` | 退出码 0 |
| `pnpm -r typecheck` | 退出码 0 |
| `pnpm lint` | 退出码 0 |
| `cd packages/core && node --test 'test/*.test.ts'` | 退出码 0，0 fail |
| `cd packages/core && node --test 'resources/skills/workloom-packages-scan/scripts/*.test.ts'` | 退出码 0，0 fail |
| `cd packages/dsh-workloom && node --test 'test/*.test.ts'` | 退出码 0，0 fail |

## Traceability

| AC | Static review | Runtime cases |
| --- | --- | --- |
| AC1 | SR1、SR8、SR9、SR10 | C1 |
| AC2 | SR2、SR11 | C2 |
| AC3 | SR3 | C3 |
| AC4 | SR4、SR12 | C4 |
| AC5 | SR5 | C5 |
| AC6 | SR6 | C6 |
| AC7 | SR7 | C7 |
