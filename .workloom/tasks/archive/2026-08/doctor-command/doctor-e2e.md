# workloom-doctor 端到端体检记录

执行方式：

```bash
node /tmp/doctor-e2e.mjs
```

脚本 `packages/core/dist/index.js` 的 `runDoctor`，先对**本仓库**跑一次真实体检（`fix: false`，只读），再对一个**临时病态项目**执行 `--fix` 模拟（不触碰本仓库任务目录）。

## A. 本仓库真实体检（fix: false，只读）

`runDoctor(REPO, { fix: false })` 产出真实报告，`summary`：

```json
{ "total": 62, "fixable": 0, "manual": 62 }
```

| 检查 | 结果 | severity | 说明 |
| --- | --- | --- | --- |
| task-lifecycle | 2 | warn | `08-26-adapter-opencode`（planning 超期 24h）、`08-29-doctor-command`（in_progress 无 check） |
| parent-child | 4 | error | 归档的 `stm-p0-contract`/`stm-p1-core`/`stm-p2-adapters`/`stm-p3-e2e` 引用 parent `08-29-subtask-mechanism`，但该 parent 目录已不存在（归档后被清理，引用残留） |
| archive | 0 | error | — |
| dispatch-audit | 24 | warn | 多个已归档旧任务无 executor 派发记录 |
| active-pointer | 0 | warn | — |
| doc-completeness | 16 | warn | 旧任务 prd 缺 H1 / 占位符、jsonl 无有效记录 |
| spec-ref | 16 | warn | 旧任务 jsonl 引用不存在的 research/spec 文件（如 `research/current-state.md`） |
| config | 0 | warn | — |

`archive`/`active-pointer`/`config` 三类健康；`config` 无 issue（.workloom/config.yaml 存在且合法）。本仓库**未执行任何写盘修复**（fix:false）。

## B. --fix 模拟（临时病态项目）

构造：`parent-p` 在 `children` 报 `child-c` 而 `child-c.parent` 为空；`done-task` completed+check 未归档；`sess-ghost` 指针指向不存在任务；`done-task` 上有 `links` 指针。`runDoctor(proj, { fix: true })` 产出：

```json
"fixed": 3   // completed-task-not-archived(done-task) / child-missing-parent(child-c) / dangling-pointer(sess-ghost)
"manual": 14 // 其余不可自动化项
"summary": { "total": 14, "fixable": 0, "manual": 14 }
```

POST_FIX 断言（脚本内打印）全部符合：

```text
POST_FIX_SESSION_GHOST_EXISTS=false   // 悬空指针被删除
POST_FIX_SESSION_DONE_EXISTS=false    // 指向 done-task 的指针被 clearPointersToTask 清理
POST_FIX_CHILD_C_PARENT=tasks/parent-p // 子任务 parent 反向补全
POST_FIX_PARENT_P_CHILDREN=["tasks/child-c"] // 父 children 正向补全
POST_FIX_DONE_ARCHIVED=true            // completed+check 移入归档
```

`fixed[]` 记录修复前的 issue 快照；`manual[]` 为复核后残留（含 in_progress 无 check、dispatch-audit、doc-completeness 缺失等不可自动项）。

## C. 验证

- 引擎测试：`packages/core/test/doctor.test.js`（13 例，红→绿）。
- 命令面测试：`packages/core/test/surface.test.js`、`packages/adapter-dsh/test/commands.test.js`、`packages/adapter-pi/test/commands.test.ts`。
- 全量回归：`pnpm lint` / `pnpm -r typecheck` / `pnpm -r build` / 三包测试全绿（core 313、dsh 61、pi 45）。
