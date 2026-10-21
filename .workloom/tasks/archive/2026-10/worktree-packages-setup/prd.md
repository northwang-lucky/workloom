# worktree 依赖准备机制（packages.setup）

## Goal

workloom 的 `createTaskWorktree` 止步于 `git worktree add`，依赖准备全靠主会话手工处理，导致 worktree 的 node_modules 问题频发：嵌套 worktree 靠手动备依赖、临时 worktree 漏装依赖直到测试时才报 `rslib: not found`、失败延迟到执行器跑测试时才暴露，浪费执行器轮次。

本任务为 core 增加一等的依赖准备机制：worktree 创建成功后自动执行配置的 setup 命令，失败在 start 阶段直接报错，把「环境没备好」从执行器晚期暴露提前到任务启动时暴露。

## Requirements

1. 配置：`.workloom/config.json` 的 `packages.<name>` 条目新增 `setup` 字段（字符串数组，shell 命令列表）。类型错误 fail loud（复用 `requireStringList` 风格），缺省为空数组（零行为变化）。不设全局兜底字段。
2. 占位符：setup 命令字符串支持白名单占位符，执行前渲染——
   - `<worktree>`：本次创建的 worktree 根绝对路径（也是命令的 cwd）。
   - `<source-checkout>`：该 package 所属仓的主检出绝对路径（root 布局为项目根，子仓/submodule 布局为 `resolve(root, pkg.path)`；统一按仓解析结果取值，不做 git 推导，submodule 的 `.git/modules` 陷阱天然不存在）。
   - 加载期校验：扫描 `<…>` 片段，白名单外占位符 fail loud（沿用 `branch_template` 的 `assertBranchTemplatePlaceholders` 模式）。
   - 不新增任何环境变量；`after_start` hooks 维持现状（需要路径时经 `TASK_JSON_PATH` 读 task.json）。
3. 执行时机：`createTaskWorktree` 成功后、start 写状态前执行；幂等复用路径（worktree 已存在且分支匹配）同样执行，否则首次 setup 失败后重跑 start 永远无法自愈。setup 命令的幂等性由配置方负责。
4. 执行方式：每条命令经 `/bin/sh -c` 执行（沿用 hooks 假设），cwd 为创建的 worktree 根（root 布局 `.workloom/worktree/<task-id>`，子仓/submodule 布局 `.workloom/worktree/<task-id>/<pkg>`），按数组顺序串行，任一命令失败即停止后续命令。
5. 输出与超时：stdout/stderr 透传到宿主进程日志（长安装命令可见进度），报错带命令与退出码；不设超时；spec 条目要求命令非交互。
6. 失败语义：setup 失败即整个 start 报错中止，任务保持 planning、不写状态（与 createTaskWorktree 现有「零部分状态」一致）。现场保留 worktree 与分支，报错文案指引修复配置后重跑 start（重跑走幂等复用路径，setup 重新执行，自愈）。
7. spec：新增 `.workloom/spec/repo/worktree-setup/` 条目，记录——
   - pnpm 配方：温 store 下 `pnpm install`，或整树硬链接拷贝 `cp -al <source-checkout>/node_modules <worktree>/node_modules`，附 Turbopack 拒绝软链接的注意事项；
   - Go 配方：无需处理（module cache 共享）；
   - 手动创建的 worktree 用同一配方手工兜底；
   - setup 命令必须非交互、必须幂等。
   并更新 AGENTS.md 的 spec 索引表。

非目标：

- 不处理手动创建的 worktree（spec 配方兜底，工具不管）。
- 不做包管理器自动探测（策略由配置显式给出）。
- archive 不单独清理 node_modules（随 worktree remove 自然消失）。
- 不改 hooks 的执行 cwd、环境变量与警告语义。
- 不支持 Windows（沿用 hooks 的 `/bin/sh` 假设）。

## Acceptance Criteria

test-first 适用，接缝（测试观察的公开边界）两条，已与用户确认：

- **配置加载接缝**（`config.test.js`）：合法 setup 数组通过；非字符串数组报 `WorkloomConfigError` 且字段名准确；缺省为 `[]`；白名单外占位符（如 `<bogus>`）在加载期 fail loud。
- **任务 start 接缝**（worktree 生命周期集成测试，真实 git 夹具，marker 文件观察）：
  1. 配置 setup 的任务 start 后，worktree 内按序出现命令痕迹（如 `touch` 的 marker 文件），证明串行与 cwd 正确（用 `$PWD` 写文件验证）。
  2. 占位符渲染正确：命令把 `<source-checkout>` / `<worktree>` 渲染结果写入文件，内容与预期绝对路径一致。
  3. 任一命令失败：start 返回错误，task.json 保持 planning，后续命令未执行，worktree 目录保留。
  4. 重跑 start（幂等复用路径）：setup 再次执行。
  5. 未配置 setup 的包：start 行为与现状一致（零行为变化）。
  6. `worktree.enabled=false` 或非 git 项目：setup 不执行。

其他验收：

7. 全部现有测试通过（`packages/core` 下 `node --test test/*.test.js`），`pnpm lint`、`pnpm -r typecheck` 通过。
8. spec 条目与 AGENTS.md 索引表更新到位。
9. core 的 `dist/` 按 `.workloom/spec/repo/deployment` 纪律同 commit 重建提交。

## Notes

- core 是 domain 纯 JS + JSDoc 模块，遵守 `.workloom/spec/repo/domain-module` 与 `code-style`。
- `createTaskWorktree` 的调用点在 `task-store.js` 的 start 流程内（约 669 行）；setup 执行点的具体落位（domain/worktree.js 内还是 start 编排层）由实现决定，注意 repoRoot 与 worktree 绝对路径在 `createTaskWorktree` 内部均已解析现成。
- 执行器可参考 `runTaskHooks`/`runHookOnce`（task-store.js）的模式，但 cwd、stdio 与失败语义不同，预计是并列实现而非直接复用；stdio 透传意味着错误里不含命令输出尾部，报错文案依赖退出码与命令本体。
- 占位符渲染函数参照 `renderBranchName` 的纯函数模式；加载期校验参照 `assertBranchTemplatePlaceholders`。

## Alignment Decisions

已裁定（含推荐与备选）：

- 方向：core 加一等准备机制（用户选定；备选「只扩 hooks 环境变量」「只写 spec 配方」被拒）。
- 失败语义：fail loud，start 中止，任务保持 planning（用户选定；备选「警告放行」被拒）。
- 配置形态：只保留 per-package `setup`，不加 `worktree.setup` 全局兜底（用户选定；混合技术栈仓里全局兜底会误伤不需要准备的包）。
- 路径供给：白名单占位符 `<worktree>` / `<source-checkout>` 渲染进命令（用户选定；环境变量方案被拒——信息本就在配置与仓解析结果里，`pkg.path` 即主检出依据；相对路径方案被拒——布局层数硬编码太脆）。`<package-path>` 不加（per-package 配置里是静态已知量）。
- 失败现场：保留 worktree 与分支，重跑 start 自愈（用户选定；备选「回滚删除归零」被拒——保留现场便于排查）。
- 输出与超时：stdio 透传 + 无超时（用户选定；备选「缓冲输出 + 默认超时」被拒——install 类命令输出有 maxBuffer 风险）。
- 测试接缝：配置加载接缝 + 任务 start 接缝（marker 文件观察，用户确认）。
- UI：不适用（纯后端工具链改动）。

开放点：无。

<!-- workloom:open-nodes=none -->
