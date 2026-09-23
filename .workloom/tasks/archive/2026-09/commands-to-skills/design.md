# 设计：continue/finish 命令改造为 skill 并收紧自动提交工具 slug 约束

## 目标行为

1. `/workloom-continue`、`/workloom-finish` 不再是 slash 命令；同名 skill（`workloom-continue`、`workloom-finish`）注册进双 runtime，模型按 description 触发后，依据 SKILL.md 静态指引自行读取 task.json / git 状态完成路由与收尾。
2. `workloom_task_archive` 缺 `taskPath` 即报错拒绝；`workloom_journal` 缺 `taskPath` 即报错拒绝；两者的 auto-commit 只暂存本次操作相关路径，其他在途任务的脏文件零接触。

## 改动范围

1. assets
   - 新增 `skills/workloom-continue/SKILL.md`、`skills/workloom-finish/SKILL.md`（front-matter 含 name/description，格式对齐现有 workloom-update-spec）。
   - 删除 `commands/workloom-continue.md`、`commands/workloom-finish.md`。
   - `workflow/workflow.md` step 3.1 与收尾段：`/workloom-finish` 命令引用改为「加载 workloom-finish skill」；step 3.1 的「Run `workloom_finish`」同步改写。
2. core
   - 删除：`buildContinueGuidance`、`buildFinishGuidance`（command-ops.ts）、`route-service.ts` 整模块、index.ts 对应导出（含 RouteNextStep 类型）、surface.ts 的 `ASSET_COMMAND_CONTINUE`/`ASSET_COMMAND_FINISH` 与 `COMMAND_NAMES`/`COMMAND_DESCRIPTIONS` 的 continue/finish 条目。
   - `TASK_ARCHIVE_NOTE` 改为引导加载 workloom-finish skill 的文案。
   - `git.js`：`gitAddCommit` 增加路径列表参数（`git add -- <...paths>`），不再固定暂存整个 `.workloom`。
   - `task-store.js` archive：`autoCommitIfEnabled` 暂存 `[tasks/<slug>（移动后的删除）, tasks/archive/<yyyy-mm>/<slug>（新增）]`（指针文件位于 gitignore 的 `.runtime/`，无需暂存）。
   - `journal.js` addSession：auto-commit 暂存 `[workspace/<developer>/（journal 文件 + 个人索引，目录级覆盖滚动）, workspace/index.md（全局索引）]`。
   - `task-ops.ts`：新增必填版 taskPath 解析（缺参报错，不回退活跃任务），archive 改用之；start/finish 保持现有回退不变。
   - `command-ops.ts` `executeJournalEntry`：新增必填 `taskPath`，用必填版解析并校验任务存在后调 addSession。
3. adapter-dsh
   - `commands.ts` 删 continue/finish 注册与 handler；`skills.ts` `SKILL_ASSETS` 加两条新 SKILL.md；archive/journal 工具 schema 的 taskPath 改/新增为 required。
4. adapter-pi
   - `commands.ts` 同样删除；`scripts/sync-skills.mjs` `SKILL_SOURCES` 加两个 skill 目录；archive/journal 工具 schema 同步。
5. 测试
   - 删除：core command-ops 的 continue/finish 用例、`route.test.js` 整文件、双 adapter commands 测试的 continue/finish 用例。
   - 新增/改写：archive 缺 taskPath 拒绝、journal 缺 taskPath 拒绝、auto-commit 暂存收窄（两个在途任务互不卷入）的行为用例；surface 测试同步（relay 测试改用保留命令名）。

## 关键设计点

1. **SKILL.md 内容来源**：continue skill 的路由表逐条翻译自 route-service（planning 无 prd → 1.1；planning 有 prd 无 design → 1.4 轻量待评审；planning 有 prd+design → 1.4 复杂待评审；in_progress → 2.1（已实现 → 2.2；2.2 已过 → 2.3）；completed → 3.1），判定动作改写为「模型自行读取活跃任务 task.json 的 status 与产物文件存在性」；finish skill 沿用原命令五步（列状态 → 脏文件分类处置 → 归档 → journal → spec 候选），脏文件检查改写为「模型自行执行 git status」。两个 skill 的步骤中都显式要求 archive/journal 调用必须带 taskPath。
2. **gitAddCommit 收窄的接口形态**：签名改为 `(root, message, paths)`，paths 为相对项目根的路径列表，由调用方（archive/journal）各自枚举；保持 legacy 纯 JS + JSDoc 约定。
3. **journal 的 taskPath 语义**：仅做存在性校验（任务须能解析并读取），强制调用方显式绑定会话所属任务；journal 条目格式不变，不新增字段。
4. **必填解析落点**：在 core service 层（task-ops/command-ops）做权威校验（缺参报错），adapter schema 的 required 只是投影；与现有「编排下沉 core、adapter 薄投影」分层一致。

## 边界与非目标

1. `/workloom-init`、`/workloom-doctor` 保持命令形态与行为不变。
2. skill 触发机制（DSH `ctx.skills.register`、Pi package.json skills 字段）不变，仅扩清单。
3. journal 条目格式、task.json 数据模型不变，无历史数据迁移。
4. 不处理 `.workloom` 之外的脏文件（实现代码脏文件本就由 2.3 提交纪律约束）。

## 风险与应对

1. 风险：用户肌肉记忆输入 `/workloom-finish` 变成未知命令。
   - 应对：按仓库原则选择不兼容历史的干净重构；workflow.md 契约与 skill description 覆盖原触发场景，模型在收尾语境自动加载 skill。
2. 风险：archive 暂存清单漏路径导致提交不完整。
   - 应对：暂存路径由 archiveTaskInternal 内部已知的 `params.taskRelPath` 与 `archiveRel` 直接推导，不依赖外部输入；测试覆盖「归档后工作区无该任务残留未提交项」。
3. 风险：双 adapter 落地走样。
   - 应对：schema/文案常量统一走 core surface；check 阶段按 adapter-pi/verify 核对 Pi 侧产物。

## 拆分判断

两个交付块（命令转 skill、slug 约束+范围收窄）共享 workflow.md、surface.ts、双 adapter 文件，不能独立验收发布；不拆子任务（已在 prd 记录）。
