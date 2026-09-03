# git worktree 兼容性加固

## Goal

把 workloom 在人工创建的 git worktree 中的兼容性，从“通常可以运行”的口头结论升级为由真实集成测试背书的能力；修复 cwd 深层子目录的 `.workloom` 定位缺陷。原生 branch/worktree 生命周期管理是后续演进方向，本期仅留接缝，不做实现。

## Requirements

1. 产品边界（Q1=C）：本期只做兼容性加固——真实集成测试 + 使用文档 + cwd 定位缺陷修复；不实现 worktree/branch 的创建、切换、合并、清理；缺陷修复须抽象为通用定位机制，为原生阶段留接缝。
2. 生命周期覆盖（Q6=A）：仅覆盖“在人工创建的 worktree 中正确运行”——定位 `.workloom`、读取 Git 状态、task 工具链在 worktree cwd 下工作、`.runtime` 隔离；worktree 的创建、合并、清理均由用户手动执行 git 命令。
3. 元数据归属（Q5=A）：维持 `.workloom/tasks/` 随 Git 分支跟踪的现状，接受 task 跨 worktree 不可见；该行为以测试固化为显式语义，而非隐式副作用；原生阶段必须重新决策元数据归属（见 Notes 演进说明）。
4. runtime 边界（Q7=A、Q10=A、Q4 终论）：不做会话 cwd 自动切换，不改 executor 能力，不新增 worktree 环境检测等运行时行为，也不交付任何形式的操作指引文档——“请在新 cwd 开启会话”等使用知识本期不落任何载体。
5. 缺陷修复：`resolveTaskRelPath` 在深层子目录 cwd 下误寻 `<cwd>/.workloom` 的问题，修复为复用 `findWorkloomRoot` 向上定位的通用机制（grilling Q1-1）；此为唯一行为修复点，走 test-first（Q9=C 接缝）。
6. 集成测试基建（grilling Q2-1）：`packages/core/test/` 新增 worktree 集成测试，node:test + 每测试 `mkdtemp` 独立临时仓库，真实执行 `git init`/`git worktree add`，git 不可用时 skip 兜底；adapter 层不改不测（grilling Q3-1）。

## Acceptance Criteria

1. 临时 Git 仓库真实 `git worktree add` 后，在 worktree 根 cwd 下 task create/start/工具链全链路通过（集成测试）。
2. worktree 深层子目录 cwd 的解析：先以失败测试复现缺陷，修复后转回归测试。
3. 脏工作区下 Git 状态读取正确（集成测试）。
4. `.workloom/.runtime/` 在两个 worktree 间互不可见（集成测试）。
5. task 数据随分支隔离的行为有测试固化（显式语义）。
6. test-first 范围（Q9=C、Q12=A）：cwd 定位机制修复是唯一接缝，先写失败测试再实现；纯测试/文档新增按常规流程。
7. 验证命令全绿：`pnpm lint`、`pnpm -r typecheck`、`pnpm -r build`、`node --test`（core、adapter-dsh）、`bun test`（adapter-pi）。

## Notes

- 操作指引不交付（grilling Q4 终论）：AGENTS.md 受众错位、README 扩写被否，人工 worktree 的使用知识本期不落任何载体；原生管理阶段若将操作规程做成注入资产，再一并考虑。
- 留接缝边界（grilling Q5-1）：不预演任何原生阶段接口，`findWorkloomRoot` 本身即通用机制；不为定位函数添加当前无消费方的扩展返回值。
- 演进方向（原生阶段的倾向性结论，非本期交付，供后续 task 继承）：创建时机 = task start（Q2=B）；worktree 目录 = 仓库同级 `<repo>-worktrees/<task-slug>/`（Q3=A）；分支策略 = 自动命名 `workloom/<task-slug>`、base 默认当前分支、分支已存在则复用、detached HEAD 拒绝并提示（Q4=A）；元数据归属是原生阶段的前置设计冲突，必须重新决策（Q5）。
- 交接文档 `/tmp/workloom-git-worktree-handoff.md`：含代码事实入口与风险清单，research 阶段应重新核查后落入本 task。
- 已知限制（Q11=A，仅记录于本 prd，不改写守卫逻辑、不另行成文）：DSH research 写守卫按子会话 cwd 拼允许域，cwd 非项目根时写保护范围可能偏窄/偏宽，属安全边界问题，改动需独立评估。

<!-- workloom:open-nodes=none -->
