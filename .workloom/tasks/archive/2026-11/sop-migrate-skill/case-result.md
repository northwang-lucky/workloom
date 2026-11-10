---
version: 1
task: tasks/11-06-sop-migrate-skill
codeBaseline: worktree .workloom/worktree/11-06-sop-migrate-skill（分支 workloom/11-06-sop-migrate-skill，HEAD 41435dd，work commit 待主会话 2.4 落地）; codeFingerprint=05780f2fceb3ff6ab1399c8e5227cd0cdc8311d6ebac87b99eef71c79eb63454
checkSession: 940879de-7f32-4de7-b62c-71f91a3e7197
status: passed
startedAt: 2026-11-10T12:23:14+08:00
completedAt: 2026-11-10T12:29:10+08:00
---

# CASE Result: 迁移 skill（workloom-migrate-to-sop、trellis 残留链删除与端到端夹具）

## Summary

- Static review: `16/16`
- Runtime cases: `5/5`; blocked: `0`
- Coverage: `generated`
- Standard verification: `passed`

## Static Review Results

### SR1 SKILL.md 迁移总规程

- Status: `passed`
- Evidence: 实际读取 `packages/core/resources/skills/workloom-migrate-to-sop/SKILL.md` 全文 91 行：L1-4 front-matter 三键（name/description/whenToUse）；L11、L17、L25、L35、L43、L61、L71、L75、L79 恰九章按序；L21-23 前置三项（git 干净、备份、dry-run）；L29-33 目录规则（createdAt MM-DD、subtasks 嵌套、INERT.md 注记、.developer 待确认）；L39-41 十一节骨架与归档不动；L45-59 配置命令与原子写/NOOP 文案；L63-69 migration-log 四字段；L73 重跑幂等；L77 dry-run；L81-91 检查单。`grep -ciE 'trellis|purge'` 输出 0（c3-structure.log L14-16）。
- Findings: `none`

### SR2 配置映射脚本

- Status: `passed`
- Evidence: 实际读取 `packages/core/resources/skills/workloom-migrate-to-sop/scripts/migrate-config.mjs` 全文 170 行：L1-18 JSDoc；L24 四级路径常量；L27 usage；L31-37 createRequire 取 LEGACY_KIND_TO_ROLE/isExecutorRole/writeFileAtomic；L47-53 CLI 校验；L64-68 NOOP；L69-76 dry-run 计划；L77-79 writeFileAtomic 与 Done；L84-99 基础错误；L107-141 条目映射（非对象 L109-110、双键 L114-115、subagents/roles 非对象 L117-121、改名与键序 L123-139）；L147-167 角色映射（isExecutorRole L151、映射表 L155-156、冲突 L157-159、未知键 L165）。新五值字面量仅出现在 L165 错误文案，非映射源。
- Findings: `none`

### SR3 evals 夹具模块

- Status: `passed`
- Evidence: 实际读取 `packages/core/resources/skills/workloom-migrate-to-sop/evals/build-fixtures.mjs` 全文 108 行：L19/22/25/32/68 具名导出（INERT_NOTE、FIXTURE_CREATED_AT、FIXTURE_DATE_PREFIX、legacyConfigDoc、buildLegacyProject）；L32-57 旧配置两条目；L68-108 旧目录夹具（task.json L75-99、workspace L100-103、.developer L104-107）；顶层无副作用。`node --check` 退出 0（c3-structure.log）。
- Findings: `none`

### SR4 skill 清单登记

- Status: `passed`
- Evidence: `packages/core/src/resources-manifest.ts` L51-52 头注释含新 skill 用途；L54 `SKILL_ENTRIES`；L62 新条目位于 L63 migrate-plan 之前；其余条目未改。dist 探针实测 12 条、新条目 index 7 < migrate-plan index 8（c3-manifest-probe.log）。
- Findings: `none`

### SR5 init 命令描述文案

- Status: `passed`
- Evidence: `packages/core/src/injection/surface.ts` L8 头注释补「init 描述以真实行为为准」例外句；L21-24 新描述 `Initialize the .workloom skeleton (idempotent; missing pieces are filled, existing content is never overwritten)`；`PURGE_FLAG` 常量与注释块已删除，文件内 purge/trellis 零命中（c4-zero-hit.log）；COMMAND_NAMES/doctor 等旁证常量未变（c4-init-probe.log）。
- Findings: `none`

### SR6 init 命令编排

- Status: `passed`
- Evidence: `packages/core/src/workspace/command-ops.ts` 全文 63 行：L14-15 仅 import initWorkloom 与 ERR_PREFIX；L22 单参 `executeInitCommand(cwd)`；L37 恒定 `initWorkloom(cwd, { force: true })`；L44-49 成功文本（Created / already complete）；L54-57 空 cwd 报错文案；无 parseInitArgs 与 purge 门禁。
- Findings: `none`

### SR7 core 导出面

- Status: `passed`
- Evidence: `packages/core/src/index.ts` L14-18 locate 导出仅 WORKLOOM_DIR/findWorkloomRoot/insideWorkloom；L286 仅再导出 `executeInitCommand`；surface 再导出块无 PURGE_FLAG；`grep -rn "PURGE_FLAG\|parseInitArgs\|detectLegacyTrellis\|LEGACY_TRELLIS_DIR"` 在 src/test 零命中（c4-zero-hit.log）。
- Findings: `none`

### SR8 init 模块注释与公开参数

- Status: `passed`
- Evidence: `packages/core/src/workspace/init.ts` L5-14 头注释幂等语义不变；L74-75 新增「命令面恒定 force，force=false 报错路径仅直调可达」注释；L112 旧检测链注释改为「已随 workloom-migrate-to-sop 任务整体删除」注记；`InitWorkloomParams.force` 与报错路径保留。
- Findings: `none`

### SR9 locate 行为模块

- Status: `passed`
- Evidence: `packages/core/src/workspace/locate.js` L1-6 头注释已删 trellis 句；L15 仅 WORKLOOM_DIR；L23-25 findWorkloomRoot；无 LEGACY_TRELLIS_DIR/detectLegacyTrellis；其余辅助函数（findUpDir/resolveHomeDir/safeRealpath）逐字保留；文件内 trellis/purge 零命中。
- Findings: `none`

### SR10 locate 类型锚点

- Status: `passed`
- Evidence: `packages/core/src/workspace/locate.d.ts` L2 WORKLOOM_DIR、L6-9 LocateOptions、L12 findWorkloomRoot、L17 insideWorkloom；无 LEGACY_TRELLIS_DIR 与 detectLegacyTrellis 声明；与 locate.js 导出面一致，dist-dts 守卫通过（c5-core-tests.log）。
- Findings: `none`

### SR11 dsh init 命令投影

- Status: `passed`
- Evidence: `packages/dsh-workloom/src/tooling/commands.ts` L43-53 init 注册仅 name/description/handler（无 input hint）；L84-87 头注释纯幂等口径；L99 `executeInitCommand(cwd)` 单参；`grep -rn -- "--purge"` 在 dsh src/test 零命中（c4-zero-hit.log）。
- Findings: `none`

### SR12 迁移 skill 端到端测试

- Status: `passed`
- Evidence: `packages/core/test/migrate-to-sop.test.ts` 全文 293 行：L44-48 HOME/TMPDIR 隔离；L75-103 组①子进程正向对照；L105-127 组②正式迁移与零 WARNING；L129-145 组③dry-run 内容/mtime；L147-161 组④NOOP 字节不变；L163-178 组⑤未知键定位与零写入；L192-234 目录重排 helper；L236-261 组⑥目录树/INERT；L263-293 组⑦全局层夹具。文件内 37 处 assert；eval 命令 7 tests / 7 pass / 0 fail（c2-eval-test.log）。
- Findings: `none`

### SR13 core command-ops 测试删改

- Status: `passed`
- Evidence: `packages/core/test/command-ops.test.ts` 全文 54 行：L5-11 仅导入 executeInitCommand；L13-21 HOME+TMPDIR 隔离；L28-40 干净目录 init；L42-54 二次 init already complete；无 parseInitArgs/seedLegacy/purge/.trellis（grep 零命中）。该文件 20/20 通过（c4-tests.log）。
- Findings: `none`

### SR14 dsh commands 测试删改

- Status: `passed`
- Evidence: `packages/dsh-workloom/test/commands.test.ts` L115-133 「init 二次执行 relay already complete」；L135-151 「init 成功 relay Workloom initialized」；原 purge 用例已删，`--purge` 零命中；doctor 用例未动。commands.test.ts 6/6 通过（c4-tests.log）。
- Findings: `none`

### SR15 core locate 测试删改

- Status: `passed`
- Evidence: `packages/core/test/locate.test.ts` 全文：L10 仅导入 findWorkloomRoot/insideWorkloom；L39-47 insideWorkloom 防越界；L50-59/74-110 家目录边界与 symlink 用例；无 detectLegacyTrellis 与 .trellis 用例（grep 零命中）。locate.test.ts 在 c4-tests.log 中全绿。
- Findings: `none`

### SR16 dsh skill 清单契约测试

- Status: `passed`
- Evidence: `packages/dsh-workloom/test/skills.test.ts` L142-159 期望数组更新为 12 条，按字典序在 `workloom-migrate-plan` 与 `workloom-packages-scan` 之间含 `workloom-migrate-to-sop`；否定断言保留。skills.test.ts 17/17 通过（c3-dsh-skills.log）。
- Findings: `none`

## Runtime Results

### C1 配置映射脚本端到端：双布局解析、五条 fail loud、dry-run 与幂等

- Status: `passed`
- Executed at: `2026-11-10T12:25:00+08:00`
- Actions:
  1. `pnpm -r build`（隔离 HOME/TMPDIR）退出 0；`node --check` 脚本退出 0。
  2. 运行 `case-evidence/probes/c1-migrate-config-probe.mjs`（<worktree>）：仓库布局与模拟发布布局各解析一次；旧配置正式迁移；进程内 + 子进程加载复核；二次执行 NOOP；dry-run 旧/新两态；F1-F5 与三形态 F3 共 8 个 fail loud 变体；四类基础错误；inode 与临时文件残留核对。
- Observed: repo=0、noDist=1 且含 `core dist not reachable; run pnpm -r build first`、withDist=0；正式迁移 `Done: migrated 2 profile(s), 11 key(s).`，内层 roles、五键 researcher/developer/checker/frontend-developer/judger 且键序保持，P2 缺键不补默认；迁移后进程内 legacy WARNING 0、子进程 LOADED_CLEAN；二次执行精确 `NOOP: config already migrated` 且字节/mtime 不变；dry-run 12 行计划（含 `subagents -> roles`、`research -> researcher`、`review -> judger`、`subagent_profiles[2]: noop`）且零写入；8 个 fail loud 变体全部 exit 1 且定位命中、零写入；四类基础错误 exit 1 带定位；目标 inode 变化且无 `.tmp` 残留。
- Evidence:
  - `case-evidence/c1-build.log`
  - `case-evidence/c1-migrate-config-probe.log`
  - `case-evidence/c1-probe-summary.json`
- Findings: `none`

### C2 eval 端到端：七用例组、子进程 WARNING 对照与全局层夹具

- Status: `passed`
- Executed at: `2026-11-10T12:26:30+08:00`
- Actions:
  1. `cd packages/core && HOME=<iso>/home TMPDIR=<iso>/tmp node --test test/migrate-to-sop.test.ts`（本任务 skill eval 口径）。
  2. 运行 `case-evidence/probes/c2-evals-probe.mjs`（<worktree>）：自造旧结构项目与全局层夹具、子进程正向对照、脚本迁移后零 WARNING、目录/文档/落账演练与幂等重跑。
  3. 扫描测试文件七组关键断言及 assert 数量。
- Observed: eval 命令 tests 7 / pass 7 / fail 0，七组用例名逐条可见；独立探针 positive-control 子进程 `uses a legacy executor kind key` WARNING 出现且 legacy 内层键 LOAD_REJECTED；脚本迁移后子进程 LOADED_CLEAN 且零 legacy WARNING，roles 顺序为新五值；全局层隔离 HOME 下迁移后同样零 WARNING；目录演练得到 `tasks/09-15-parent-task` 与 `tasks/09-15-parent-task/subtasks/09-15-child-task`、父 children 与子 parent 同步、workspace 保留且 INERT.md 首行为注记、.developer 留存、archive 零变化、文档三节按 Goal→Requirements→Notes 重排且正文保留、migration-log 4 行均 4 字段 ISO 时间；目录 helper 重跑树形不变，脚本二次执行项目/全局均 NOOP 且字节不变。断言扫描 37 处 assert 覆盖七组关键串。
- Evidence:
  - `case-evidence/c2-eval-test.log`
  - `case-evidence/c2-evals-probe.log`
  - `case-evidence/c2-assertion-scan.log`
- Findings: `none`

### C3 SKILL.md 章节与 skill 可发现性

- Status: `passed`
- Executed at: `2026-11-10T12:27:00+08:00`
- Actions:
  1. `pnpm -r build`；对 `scripts/migrate-config.mjs` 与 `evals/build-fixtures.mjs` 跑 `node --check`；`ls` 三文件。
  2. grep 九章标题、front-matter 三键、trellis/purge 计数；逐项 grep 内容清单（preconditions/backup/dry-run/createdAt/subtasks/INERT/十一节/migration-log/checklist）。
  3. 运行 `case-evidence/probes/c3-manifest-probe.mjs`（<worktree>） 校验 dist 可发现性。
  4. `cd packages/dsh-workloom && node --test test/skills.test.ts`。
- Observed: build 与两个 `node --check` 退出 0；三文件存在；`##` 标题恰 9 行且顺序与计划一致；front-matter `name: workloom-migrate-to-sop` 计数 1；trellis|purge 计数 0；内容清单 13 项逐条命中（c3-structure.log）；manifest 探针得到 12 条、新条目 index 7 < migrate-plan 8、readResourceText 首行 front-matter 正确、resourceDirOf 目录含脚本与夹具；dsh skills.test.ts 17/17 通过。
- Evidence:
  - `case-evidence/c3-structure.log`
  - `case-evidence/c3-manifest-probe.log`
  - `case-evidence/c3-dsh-skills.log`
- Findings: `none`

### C4 trellis 零命中门禁与 init 真幂等行为

- Status: `passed`
- Executed at: `2026-11-10T12:27:20+08:00`
- Actions:
  1. 两包 src/test/resources 全量 `grep -rniE "trellis|purge"`；`grep PURGE_FLAG`；`grep parseInitArgs|detectLegacyTrellis|LEGACY_TRELLIS_DIR`；dsh `--purge`。
  2. 运行 `case-evidence/probes/c4-init-probe.mjs`（<worktree>）：dist 导出面、init 描述语义、首次/二次/保留已有内容/空 cwd/额外 --purge 参数。
  3. `node --test`：core command-ops + init + locate；dsh commands。
- Observed: 全量命中仅 1 条——`packages/core/src/workspace/init.ts:112` 的「legacy .trellis 检测链已随 workloom-migrate-to-sop 任务整体删除」注记历史句，符合白名单口径；PURGE_FLAG、parseInitArgs、detectLegacyTrellis、LEGACY_TRELLIS_DIR、dsh `--purge` 均零命中。探针确认四符号从 dist 消失、新描述含 idempotent/missing pieces/never overwritten 且无 purge/trellis、首次 init 建骨架、二次精确 already complete、改写 config 后不被覆盖、空 cwd 报错、额外 `--purge` 参数被忽略。core 测试 20/20、dsh 测试 6/6 通过，含「二次 init already complete」与「干净目录 init」。
- Evidence:
  - `case-evidence/c4-zero-hit.log`
  - `case-evidence/c4-init-probe.log`
  - `case-evidence/c4-tests.log`
- Findings: `none`

### C5 全量验证、dist 同步、变更集与覆盖率

- Status: `passed`
- Executed at: `2026-11-10T12:28:05+08:00`
- Actions:
  1. 依次 `pnpm -r build`、`pnpm -r typecheck`、`pnpm lint`；两包 `pnpm test`；eval 命令复跑。
  2. `git status --short`、staged/unstaged/untracked 合并与预期清单比对；dist 新鲜度映射核对。
  3. `task-fingerprint.mjs <worktree>` 取指纹。
  4. Coverage Aggregate command 跑两包 coverage，解析 lcov 生成 `coverage/coverage-summary.json`。
- Observed: build/typecheck/lint 全 0（lint 零 error 零 warning）；core 725/725、dsh 213/213、eval 7/7 全绿（含 dist-mirror 与 dist-dts）；变更集非 dist 16 个、missing 0、unexpected 0、dist 19 个（c5-change-set-compare.txt），8 个 src 目标与 dist 产物一一对应；指纹 `codeFingerprint=05780f2fceb3ff6ab1399c8e5227cd0cdc8311d6ebac87b99eef71c79eb63454`；coverage Overall `17727/18582 (95.40%)`，六个运行时文件逐行数据见下表。工作区在本轮验证后无 unstaged/untracked 变化，变更全部 staged，待主会话 2.4 单一 work commit 落地。
- Evidence:
  - `case-evidence/c5-build.log`
  - `case-evidence/c5-typecheck.log`
  - `case-evidence/c5-lint.log`
  - `case-evidence/c5-core-tests.log`
  - `case-evidence/c5-dsh-tests.log`
  - `case-evidence/c5-eval.log`
  - `case-evidence/c5-change-set.log`
  - `case-evidence/c5-dist-check.log`
  - `case-evidence/c5-fingerprint.log`
  - `case-evidence/c5-coverage-core.log`
  - `case-evidence/c5-coverage-dsh.log`
- Findings: `none`

## Coverage

- Status: `generated`
- Tool: Node.js v24.18.1 内置测试覆盖率（`node --test --experimental-test-coverage`）与原生 lcov reporter
- Command: `cd packages/core && node --test --experimental-test-coverage --test-coverage-include='src/**' --test-coverage-include='dist/**' --test-reporter=spec --test-reporter-destination=stdout --test-reporter=lcov --test-reporter-destination=<task>/coverage/core.lcov.info 'test/*.test.ts' 'resources/skills/workloom-packages-scan/scripts/*.test.ts'`；dsh 包同款参数写 `dsh-workloom.lcov.info`；聚合时 `SF:dist/...` 映射回 `SF:src/...`，同名源文件取 src 记录
- Overall lines: `17727/18582 (95.40%)`
- Raw reports:
  - `coverage/core.lcov.info`
  - `coverage/dsh-workloom.lcov.info`

### Changed Files

| File | Covered/Total | Line coverage | Uncovered lines | Details |
| --- | --- | --- | --- | --- |
| `packages/core/src/injection/surface.ts` | `462/484` | `95.45%` | `406-407, 448-459, 469-473, 482-484` | `coverage/core.lcov.info` |
| `packages/core/src/resources-manifest.ts` | `107/123` | `86.99%` | `78-80, 85-86, 90-91, 95-96, 100-101, 117-118, 121-123` | `coverage/core.lcov.info` |
| `packages/core/src/workspace/command-ops.ts` | `52/63` | `82.54%` | `26-27, 39-40, 42-43, 56-57, 61-63` | `coverage/core.lcov.info` |
| `packages/core/src/workspace/init.ts` | `122/122` | `100.00%` | `-` | `coverage/core.lcov.info` |
| `packages/core/src/workspace/locate.js` | `88/88` | `100.00%` | `-` | `coverage/core.lcov.info` |
| `packages/dsh-workloom/src/tooling/commands.ts` | `159/184` | `86.41%` | `99-104, 121-123, 126-127, 129-130, 141-146, 149-154` | `coverage/dsh-workloom.lcov.info` |

### Exclusions

| Path | Reason |
| --- | --- |
| `packages/core/dist/` | `构建产物，C5 先重建再由 core 的 dist-mirror/dist-dts 守卫核对镜像，同 commit 由主会话提交时复核` |
| `packages/dsh-workloom/dist/` | `构建产物，C5 先重建再由 dsh 的 dist-mirror 守卫核对镜像，同 commit 由主会话提交时复核` |
| `packages/core/test/` | `测试与夹具自身，C2/C4/C5 验全绿，无独立运行时行` |
| `packages/dsh-workloom/test/` | `dsh 测试与夹具自身（含 SR16 清单契约），C3/C4/C5 验全绿` |
| `packages/core/resources/skills/workloom-migrate-to-sop/SKILL.md` | `静态文档资源，C3 逐章核对章节与禁令` |
| `packages/core/resources/skills/workloom-migrate-to-sop/scripts/migrate-config.mjs` | `独立 CLI 子进程（spawnSync）执行，node --test 父进程覆盖率不采集，C1 逐态行为与文件字节核对` |
| `packages/core/resources/skills/workloom-migrate-to-sop/evals/build-fixtures.mjs` | `评测夹具，C2 以 node --check 与端到端演练验证` |
| `packages/core/src/index.ts` | `纯导出面改线，无独立运行时逻辑，由 build/typecheck 与 SR7 验证` |
| `packages/core/src/workspace/locate.d.ts` | `手写类型锚点，无运行时行，SR10 与 dist-dts 守卫验证` |
| `**/*.js.map` | `构建映射产物，无运行时行` |

### Collection Failure

`none`

## Standard Verification

| Command | Exit code | Evidence |
| --- | --- | --- |
| `pnpm -r build` | `0` | `case-evidence/c5-build.log` |
| `pnpm -r typecheck` | `0` | `case-evidence/c5-typecheck.log` |
| `pnpm lint` | `0` | `case-evidence/c5-lint.log`（零 error 与零 warning） |
| `cd packages/core && pnpm test` | `0` | `case-evidence/c5-core-tests.log`（725 tests / 725 pass / 0 fail，含 dist-mirror 与 dist-dts 守卫） |
| `cd packages/dsh-workloom && pnpm test` | `0` | `case-evidence/c5-dsh-tests.log`（213 tests / 213 pass / 0 fail） |
| `cd packages/core && node --test test/migrate-to-sop.test.ts` | `0` | `case-evidence/c5-eval.log`（7 tests / 7 pass / 0 fail；本任务 skill eval 口径） |

## Resolved Findings

- none

## Open issues

- none
