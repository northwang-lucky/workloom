# S1 implement 计划：core worktree 生命周期（test-first 关键路径）

前置：S0 已归档（目录为 `packages/core/src/domain/`）。设计依据 = 本任务 `design.md`（模块布局/原语表/编排序列/插入点/测试映射），一手事实 = `research/01`、`research/02`（下文 §A/§B 引用）。**纪律**：全程不执行 git commit（2.3 归主会话）；运行时文案英文；domain 模块 JSDoc 约定；R2/R3 加载 `tdd` skill 走红绿循环；每轮结束跑该轮验证命令，全轮结束后跑终局验证。

## R1 基础层：config worktree 节 + init 模板（常规 TDD，非先红）

- `domain/config.js` + `config.d.ts`：design §4（DEFAULT_CONFIG / GLOBAL_PROJECT_ONLY_FIELDS / mergeWithDefaults 块 / 占位符白名单 / cleanup 枚举）。
- `domain/init.js`：design §6（CONFIG_TEMPLATE 种子根包、GITIGNORE_TEMPLATE 加 `worktree/`、注释同步、example 模板加 worktree 示例）。
- 测试：`config.test.js` 新增 worktree 节用例（缺省值/非法 cleanup/空模板/未知占位符/未知子字段/全局层项目字段错误）；`init.test.js` 必红两条更新 + `worktree/` 断言（§B5）。
- 验证：`cd packages/core && pnpm run build && node --test test/config.test.js test/init.test.js`。

## R2 先红：集成测试 `test/worktree-lifecycle.test.js`

- 按 design §8 映射表写全用例 ①-⑨ + 补充组（脏 worktree force 不豁免 / 残留非法目录含空目录 / 非法 ref 模板）。fixture：mkdtemp + `-c user.name/-c user.email` 逐命令身份注入 + git 不可用 skip；`runGit` helper 扩展 `-c` 前缀透传（§A5/A9-10）；submodule fixture 带 `-c protocol.file.allow=always`（§A5）；真合并场景注入身份（§A7.5）。
- import 面按 design §9 的 index.ts 新导出书写（尚不存在 → 红）。
- 验证：`node --test test/worktree-lifecycle.test.js` 全红，且红因正确（导出缺失/行为未实现，非 fixture 自身错误）；报告记录红输出摘要。

## R3 实现层：git 原语 + worktree.js + 接线 → 全绿

- `domain/git.js`：design §2 原语表全量新增（既有 4 原语返回形状不动；err.code/err.stderr 消费约定写进 JSDoc；§B6/B9-2/B9-3）。
- 新增 `domain/worktree.js` + `worktree.d.ts`：design §3（resolveTaskRepo / renderBranchName / createTaskWorktree / cleanupTaskWorktree），逐条落实 §A 硬事实：add 失败 `branch -D` 回滚（§A1）、空目录残留前置探测拒绝（§A1/A3）、merge 三态以 MERGE_HEAD 判别 + abort 门（§A7.1-2）、已合并 = merge-base --is-ancestor（§A7.2）、HEAD==base 校验（§A7.3）、gitlink 在主检出合并后联动 + `HEAD:<path>` vs 子仓 HEAD 幂等探针（§A6，**禁用 `git rev-parse <path>`**）、remove→branch -D 顺序（§A2）、locked worktree err 透传。
- `domain/task-store.js`：design §5.2/§5.3 插入点（start：门禁后 status 前；archive：冲突检查后 renameSync 前；gitlink 独立 fail-loud 不复用 autoCommitIfEnabled §B3）；`createTaskInternal` package ∈ packages 校验（loadConfig 后 buildTaskRecord 前，§B1）；`buildTaskRecord` package 落值；`task-store.d.ts` 类型面。
- `service/task-ops.ts`：design §5.1（ExecuteCreateTaskParams.package 必填 + execute 层校验 + 透传）；archive 回执增 cleanup 摘要。
- `index.ts`：design §9 导出面；`surface.ts`：create snippet/参数描述加 package（§B8）。
- 既有红点修复：`worktree-compat.test.js:148,174,226,255`、`task-ops.test.js:69,118,160,205,222,232` 补 package 参数（fixture 经新 init 模板自带 `repo` 包，§B8）。
- 验证：`pnpm run build && node --test test/*.test.js`（core 全量绿，含 R2 文件转绿 + 既有测试零回归）。

## R4 adapter 面：create schema 原子交付（容器 R5-Q1）

- `packages/adapter-dsh/src/tasks.ts:51-58`：create schema `required: ['title','package']` + properties.package 描述；透传核对。
- `packages/adapter-pi/src/tasks.ts:35-41,187-193`：TASK_CREATE_PARAMS 加 package + executeCreateTask 透传。
- 两端 adapter 测试同步（各自 verify 规范）；`pnpm -r build` 后 **adapter-dsh `dist/` 重建产物留在工作区**（部署纪律：主会话 2.3 同 commit 提交）。
- 验证：`cd packages/adapter-dsh && node --test test/*.test.js`；`cd packages/adapter-pi && bun test test/*.test.ts`。

## R5 doctor：design §7

- packages 空配置 → `checkConfig` 扩展 issue（复用 `config` code，零类型改动）。
- 新增第 12 个 code `worktree`：`doctor-types.ts`（联合 + CHECK_META）、`doctor-check-rules.ts` 规则函数（gitignore 缺条目 / 目录-注册不一致，`fixable:false` + hint）、`doctor-checks.ts` 注册。
- `doctor.test.js:579` 断言 11→12（`:2` 注释同步）+ 新检查用例（含 §B4 的 config 检查 issue 计数复核）。
- 验证：`node --test test/doctor.test.js` + core 全量。

## R6 终局验证与报告

```bash
pnpm lint && pnpm -r typecheck && pnpm -r build
cd packages/core && node --test test/*.test.js
cd packages/adapter-dsh && node --test test/*.test.js
cd packages/adapter-pi && bun test test/*.test.ts
```

LSP 面：对改动 TS/JS 文件跑 lsp_diagnostics 清零。审计：`git status` 改动文件清单与 design 预期一致（无意外文件）；PRD AC 1-13 逐条自检勾选。

报告格式：逐轮状态（R1-R6）、先红证据摘要（R2 红输出关键行 → R3 转绿结论）、改动文件分类清单（core domain/service/test、adapter、dist）、AC 自检表、遗留风险。不提交 git commit。
