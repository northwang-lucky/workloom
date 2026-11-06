---
version: 1
task: tasks/11-06-sop-structure
codeBaseline: branch workloom/11-06-sop-structure @ 45c75d2（worktree .workloom/worktree/11-06-sop-structure）; codeFingerprint=516432a2b0c1136d990b7f3881f9962aa8248ac259588c3474ec4544c10b5f9b
checkSession: 73b2adb2-e2b8-438e-b397-d2cfe55af78b
status: passed
startedAt: 2026-11-06T21:56:11+08:00
completedAt: 2026-11-06T22:00:30+08:00
---

# CASE Result: 包与目录骨架重组

## Summary

- Static review: `12/12`
- Runtime cases: `7/7; blocked: 0`
- Coverage: `generated`
- Standard verification: `passed`

## Static Review Results

### SR1 dsh-workloom 包名与依赖

- Status: `passed`
- Evidence: `packages/dsh-workloom/package.json` 的 name 为 `@workloom-ai/dsh-workloom`，dependencies 仅 `@workloom-ai/core`（file:../core），files 为 `dist`+`cordis.patch.yml`，test 为 `node --test 'test/*.test.ts'`（无 build 前缀、无 bun）；`packages/` 仅 core 与 dsh-workloom；根 workspace 仍 `packages/*`；旧身份 grep 无命中。exports 保留既有 `./cordis.patch.yml` 子路径（dsh bundle 必需，CASE 的“只暴露包入口”按入口面有效执行）。
- Findings: none

### SR2 resources 清单

- Status: `passed`
- Evidence: `resources-manifest.ts` 集中登记 workflow/spec/CASE/skill 条目并提供读取与 `resourceDirOf`，缺失返回 null；resources 顶层 skills/templates/workflow/third-party 四目录，LICENSE 存在，base/now 计数 29/5/2/10 全等；路径残留与 `@workloom-ai/assets` grep 无命中；dsh 的 executor-injection/plugin/skills/commands 均由 `@workloom-ai/core` 取清单导出；`.workloom/spec` 已无 adapter-pi。
- Findings: none

### SR3 core 包入口与功能子包结构

- Status: `passed`
- Evidence: core/src 根层只有 `index.ts` 与 `resources-manifest.ts`，子目录 task/dispatch/injection/workspace，domain/service 不存在；dsh/src 根层只有 index/plugin/constants，子目录 dispatch/tooling；深引 `@workloom-ai/core/*`、跨包相对逃逸、子包 import 包根入口三类 grep 均无命中；core exports 为 `["."]`。
- Findings: none

### SR4 init 骨架

- Status: `passed`
- Evidence: 任务分支 `.workloom` 顶层为 config.json/.gitignore/.runtime/spec/tasks，无 workspace/.developer/config.example.*/spec/adapter-pi/worktree；init 的 `SUB_DIRS=[tasks,spec,.runtime/worktrees]`、`FILE_NAMES={config.json,.gitignore}`，无 developer/config.example 写盘段，返回值不再读 .developer；仓库 `.workloom/.gitignore` 首行规则覆盖 `.runtime/`；主仓库残留 workspace/.developer 属旧 pin 插件运行期产物（R11 期允许），未判失败。
- Findings: none

### SR5 core 包发布面与测试配置

- Status: `passed`
- Evidence: core files 为 `dist`+`resources`，exports 仅 `["."]`，dependencies 仅 yaml；scripts 为 build（tsc + copy-domain-dts）/typecheck（tsc --noEmit）/test（node --test 'test/*.test.ts' + resources 脚本 glob），无 build 前缀、无 bun；core test 40 个、dsh test 9 个、resources 脚本测试 2 个全部 `.ts`，无 `.test.js`；enum/namespace/参数属性 grep 无命中；Node v24.18.1 类型擦除直跑通过（见 C5）。
- Findings: none

### SR6 dsh-workloom dist 产物

- Status: `passed`
- Evidence: commit 45c75d2 同时含 dsh src 21 个与 dist 63 个文件；`pnpm -r build` 后 `git status --porcelain packages/dsh-workloom/dist packages/core/dist` 为空；dsh dist 根层仅 constants.js/index.js/plugin.js，core dist 无旧 domain/service 目录；commit message 为 `refactor(sop): ...` + 中文要点，符合 repo/commits。
- Findings: none

### SR7 lockfile 与生产 pin

- Status: `passed`
- Evidence: 仓库 lockfile importers 为 `.`、`packages/core`、`packages/dsh-workloom`，无 assets/adapter-pi/adapter-dsh 条目；生产 pin 与 `pin-snapshot.txt` 同为 `1dc46f7ce515afb0e9b907aae809ca9d11dc8e9d`；远端 main 命中该 commit；宿主 pid 11896 运行中、HTTP 401、profile bundles 含 adapter-dsh、dist 就位、web.log 有 workloom 运行期输出。
- Findings: none

### SR8 插件名常量

- Status: `passed`
- Evidence: `PLUGIN_NAME='dsh-workloom'`；`SOURCE_PLUGIN = PLUGIN_NAME`；`CONTEXT_KEY_PREFIX='dsh'`；plugin/inject 测试在 C5 全绿。
- Findings: none

### SR9 cordis 补丁

- Status: `passed`
- Evidence: 插件行成对为 `id: dsh-workloom` 与 `name: '@workloom-ai/dsh-workloom'`；包 `dsh.bundle.patch='./cordis.patch.yml'` 且 files 含该文件。
- Findings: none

### SR10 AGENTS.md 与配置同步

- Status: `passed`
- Evidence: 常用验证命令块为新布局（pnpm lint / pnpm -r typecheck / pnpm -r build / core 与 dsh-workloom 各一条 pnpm test；两条 pnpm test 展开即 node --test TS glob，见 SR1/SR5 的 scripts），无 bun test、无 adapter-pi；结构树只列 core 与 dsh-workloom；`.workloom/config.json` packages 恰为 core/dsh-workloom/repo；插件变更流程保留 `#path:packages/adapter-dsh`（当前生产 pin，R11 要求）。
- Findings: none

### SR11 README.md 结构树

- Status: `passed`
- Evidence: 结构树只列 core 与 dsh-workloom；core 描述含 task/dispatch/injection/workspace 子包与 resources，dsh-workloom 描述为 DSH 插件且 dist 同 commit。
- Findings: none

### SR12 worktree 运行目录

- Status: `passed`
- Evidence: `WORKTREE_DIR='.runtime/worktrees'`，创建/扫描路径拼接一致，不再向 `.workloom/worktree` 写；`worktree-setup` spec 已新增 layout 行指向 `.workloom/.runtime/worktrees/`；worktree 相关测试 38 个全绿。
- Findings: none

## Runtime Results

### C1 门禁与 workspace 包清单

- Status: `passed`
- Executed at: `2026-11-06T21:56:14+08:00`
- Actions:
  1. `pnpm install --frozen-lockfile`（exit 0）
  2. `pnpm -r build`（exit 0）
  3. `pnpm -r typecheck`（exit 0）
  4. `pnpm lint`（exit 0）
  5. `pnpm -r ls --depth -1`
  6. `ls packages`
  7. 旧包身份 grep
- Observed: 步骤 1-4 全 0；步骤 5 只有 workloom（根，PRIVATE）、@workloom-ai/core、@workloom-ai/dsh-workloom 三条；步骤 6 输出 core、dsh-workloom；步骤 7 无命中。
- Evidence:
  - `case-evidence/c1-install.log`
  - `case-evidence/c1-build.log`
  - `case-evidence/c1-typecheck.log`
  - `case-evidence/c1-lint.log`
  - `case-evidence/c1-pnpm-ls.log`
  - `case-evidence/c1-packages.log`
  - `case-evidence/c1-old-names-grep.log`
- Findings: none

### C2 resources 内容与残留引用

- Status: `passed`
- Executed at: `2026-11-06T21:57:52+08:00`
- Actions:
  1. `ls packages/core/resources`
  2. `test -f packages/core/resources/third-party/mattpocock-skills/LICENSE`
  3. base/now 目录计数
  4. 路径残留 grep
  5. dist 加载 CASE 模板与 workflow 契约探针
  6. `ls .workloom/spec`
- Observed: 四目录 skills/templates/third-party/workflow；LICENSE_OK；四项计数 base=now（29/5/2/10）；grep exit 1；探针输出 `RESOURCE_LOAD_OK`；spec 只剩 README.md 与 repo。
- Evidence:
  - `case-evidence/c2-resources-ls.log`
  - `case-evidence/c2-resource-counts.log`
  - `case-evidence/c2-residual-grep.log`
  - `case-evidence/c2-resource-load.log`
- Findings: none

### C3 子包结构与引用边界

- Status: `passed`
- Executed at: `2026-11-06T21:57:55+08:00`
- Actions:
  1. `find packages/core/src -maxdepth 2 -mindepth 1`
  2. `find packages/dsh-workloom/src -maxdepth 2 -mindepth 1`
  3. 深引 grep、跨包相对逃逸 grep、子包引根入口 grep
  4. core exports keys
- Observed: 两包子包形状与映射表一致；三类 grep 均无命中；exports 为 `["."]`。
- Evidence:
  - `case-evidence/c3-core-src-tree.log`
  - `case-evidence/c3-dsh-src-tree.log`
  - `case-evidence/c3-import-boundaries.log`
- Findings: none

### C4 .workloom 布局与 init 骨架

- Status: `passed`
- Executed at: `2026-11-06T21:57:59+08:00`
- Actions:
  1. 分支 checkout `ls -A .workloom`
  2. 主仓库 `ls -A .workloom`（记录）
  3. 临时目录 init 探针（经 core dist）
  4. `node --test 'test/worktree-*.test.ts'`
  5. `.workloom/.gitignore` 检查
- Observed: 分支顶层 config.json/.gitignore/.runtime/spec/tasks；探针 `TOP [".gitignore",".runtime","config.json","spec","tasks"]`、`FORBIDDEN []`、`INIT_OK`；worktree 测试 38 pass；gitignore 第 2 行 `.runtime/`。主仓库仍有旧 pin 运行期目录（已记录，不判失败）。
- Evidence:
  - `case-evidence/c4-branch-layout.log`
  - `case-evidence/c4-main-layout.log`
  - `case-evidence/c4-init-probe.log`
  - `case-evidence/c4-worktree-tests.log`
- Findings: none

### C5 TS 测试与可擦除语法

- Status: `passed`
- Executed at: `2026-11-06T21:57:45+08:00`
- Actions:
  1. `cd packages/core && node --test 'test/*.test.ts'`
  2. `cd packages/core && node --test 'resources/skills/workloom-packages-scan/scripts/*.test.ts'`
  3. `cd packages/dsh-workloom && node --test 'test/*.test.ts'`
  4. 三组迁移完整性 `comm`
  5. `find packages -name '*.test.js'`
  6. bun 与不可擦除语法 grep
  7. 两包 `pnpm test` 复核
- Observed: core 758 pass / 0 fail；resources 27 pass；dsh 177 pass；三组 comm 输出为空；无 `.test.js`；bun 与 enum/namespace/参数属性均无命中；`pnpm test` 两包 exit 0。
- Evidence:
  - `case-evidence/c5-core-tests.log`
  - `case-evidence/c5-core-resources-tests.log`
  - `case-evidence/c5-dsh-tests.log`
  - `case-evidence/c5-migration-diff.log`
  - `case-evidence/c5-bun-enum-grep.log`
  - `case-evidence/c5-core-pnpm-test.log`
  - `case-evidence/c5-dsh-pnpm-test.log`
- Findings: none

### C6 dist 同 commit 与产物新鲜度

- Status: `passed`
- Executed at: `2026-11-06T21:58:47+08:00`
- Actions:
  1. `git log --oneline main..HEAD -- packages/dsh-workloom/src`
  2. 逐 commit 检查是否带 dist
  3. `git show --stat`
  4. `pnpm -r build && git status --porcelain packages/dsh-workloom/dist packages/core/dist`
  5. `find packages/dsh-workloom/dist -maxdepth 1 -name '*.js'`
- Observed: 唯一 commit 45c75d2，src 21 / dist 63 同 commit；无 MISSING_DIST；重建后 dist 状态为空；dist 根层仅 constants.js/index.js/plugin.js。
- Evidence:
  - `case-evidence/c6-commit-list.log`
  - `case-evidence/c6-same-commit.log`
  - `case-evidence/c6-dist-status.log`
  - `case-evidence/c6-dist-root.log`
- Findings: none

### C7 生产 pin 未变与宿主加载

- Status: `passed`
- Executed at: `2026-11-06T21:58:52+08:00`
- Actions:
  1. 提取 profile lockfile pin 与 pin-snapshot.txt 比对
  2. `git ls-remote ... refs/heads/main`
  3. `pgrep` + `curl 127.0.0.1:3088`
  4. profile package.json 与已安装 dist 检查
  5. `web.log` workloom 运行期输出
- Observed: `now=1dc46f7... snap=1dc46f7...`；远端 main 命中该 commit；宿主 pid 11896 运行中，HTTP 401（监听正常）；bundle 列表含 @workloom-ai/adapter-dsh 且 dist/index.js 存在；日志有 workloom journal/breadcrumb 输出。
- Evidence:
  - `case-evidence/c7-pin-compare.log`
  - `case-evidence/c7-remote-pin.log`
  - `case-evidence/c7-host-process.log`
  - `case-evidence/c7-profile-install.log`
  - `case-evidence/c7-host-log.log`
- Findings: none

## Coverage

- Status: `generated`
- Tool: `Node.js v24.18.1（--experimental-test-coverage + 原生 lcov reporter）`
- Command: 两包各一次 coverage 运行，`--test-coverage-include='src/**'`（同时带 `dist/**`，实际测试直接 import src，未加载 dist），原始 lcov 落任务目录
- Overall lines: `17438/18325 (95.16%)`
- Breakdown: core `13453/14026 (95.91%)`，dsh-workloom `3985/4299 (92.70%)`；逐模块明细见两份原始 lcov 报告
- Raw reports:
  - `coverage/core.lcov.info`
  - `coverage/dsh-workloom.lcov.info`

### Changed Files

| File | Covered/Total | Line coverage | Uncovered lines | Details |
| --- | --- | --- | --- | --- |
| `AGENTS.md` | 0/0 | N/A |  | 文档文件无运行时行，SR10 逐项审查 |
| `README.md` | 0/0 | N/A |  | 文档文件无运行时行，SR11 逐项审查 |
| `packages/core/package.json` | 0/0 | N/A |  | 配置文件无运行时行，SR5 逐项审查 |
| `packages/dsh-workloom/cordis.patch.yml` | 0/0 | N/A |  | 配置文件无运行时行，SR9 逐项审查 |
| `packages/dsh-workloom/package.json` | 0/0 | N/A |  | 配置文件无运行时行，SR1 逐项审查 |
| `pnpm-lock.yaml` | 0/0 | N/A |  | 锁文件无运行时行，SR7 逐项审查 |

其余变更文件（src、test、dist、resources、scripts 等）按 case.md 的 Coverage Exclusions 豁免，逐模块覆盖明细见原始 lcov 报告。

### Exclusions

| Path | Reason |
| --- | --- |
| `packages/core/src/` | `功能子包搬迁与 import 同步，无行为变更；结构由 SR3 逐项验证，行为回归由 C5 全量测试覆盖` |
| `packages/dsh-workloom/src/` | `功能子包搬迁与 import 同步，无行为变更；结构由 SR3 逐项验证，行为回归由 C5 全量测试覆盖` |
| `packages/core/test/` | `测试自身，C5 验迁移完整性` |
| `packages/dsh-workloom/test/` | `测试自身，C5 验迁移完整性` |
| `packages/core/dist/` | `构建产物，C6 验同 commit 与新鲜度` |
| `packages/dsh-workloom/dist/` | `构建产物，C6 验同 commit 与新鲜度` |
| `packages/core/resources/` | `内容原样搬迁，C2 验计数与 LICENSE` |
| `packages/core/scripts/` | `构建脚本随布局调整，SR5 与 C1 验证` |
| `packages/dsh-workloom/tsconfig.json` | `编译配置随布局调整，C1 验 typecheck 与 build` |
| `spec/repo/worktree-setup/index.md` | `worktree 运行目录描述随 .runtime/worktrees 更新，由 SR12 覆盖` |
| `**/*.d.ts` | `类型产物，无运行时行` |
| `**/*.js.map` | `映射产物，无运行时行` |

### Collection Failure

`none`

## Standard Verification

| Command | Exit code | Evidence |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | 0 | `case-evidence/c1-install.log` |
| `pnpm -r build` | 0 | `case-evidence/c1-build.log` |
| `pnpm -r typecheck` | 0 | `case-evidence/c1-typecheck.log` |
| `pnpm lint` | 0 | `case-evidence/c1-lint.log` |
| `cd packages/core && node --test 'test/*.test.ts'` | 0 | `case-evidence/c5-core-tests.log` |
| `cd packages/core && node --test 'resources/skills/workloom-packages-scan/scripts/*.test.ts'` | 0 | `case-evidence/c5-core-resources-tests.log` |
| `cd packages/dsh-workloom && node --test 'test/*.test.ts'` | 0 | `case-evidence/c5-dsh-tests.log` |

## Resolved Findings

- none

## Open issues

- none
