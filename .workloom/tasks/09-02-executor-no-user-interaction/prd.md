# 执行器工具可见性治理与提问回传协议

## Goal

三个切片按 ①→②→③ 串行交付（不拆任务，同一批文件、同一次契约版本递增）：

1. 配置系统换轨：config.json/config.js 取代 YAML，三层优先级合并，
   全局配置与全局/项目级 prompts 目录，requiresTools 移除。
2. 工具可见性机制层：执行器默认工具白名单（allow 单一事实源），用户配置
   includes/excludes 修改，DSH toolFilter 与 Pi `-t` 双通道下发；research
   的 write/edit 限定 `.workloom/`（DSH ToolGuard + Pi extension 副本）。
3. 协议层提问回传：执行器契约纪律句（全 kind）+ 主会话处置句，契约 18→19。

## Background（实证）

- 实证一（2026-09-02）：cardx-cli-work 项目 implement 执行器 96f11210 因
  设计与代码事实冲突调用 ask_user_question，DSH 对子会话该调用静默返回空答案。
- 实证二（同日）：本仓任务 C implement 执行器 918afc28 同类冲突下调用
  ask_user_question 被用户中止；主会话按「阻塞项回传、用户决断」处置后重派。
- 机制可行性已实证：`SubagentStartRequest.toolFilter`（`ToolRestriction
  {allow, deny}`）生效（被滤工具从提示词消失且拒绝执行）；pi CLI 原生
  `-t/--tools` allowlist；DSH `ctx.tools.guard()` 为公开机制缝
  （`SubagentStartRequest` 无子作用域工具注入通道，影子副本路不通）。
- 配置消费审计：9 类顶层字段中 8 类实消费，`default_package` 死字段。

## Requirements

### ① 配置系统换轨

1. 格式：`config.json` / `config.js`（及 `.local` 变体）；YAML 退役——
   探测到遗留 yaml → fail loud 指明迁移目标文件名；同层同时存在两主文件
   （或两 local）→ fail loud 报歧义。
2. config.js：同步加载（`createRequire`；`module.exports` 与 `export
   default` 兼容、取 `.default` 归一；低版本环境无 require(esm) → fail
   loud 说明）。导出为对象 → 顶层 key 直接覆盖低层结果；导出为函数 →
   工厂入参为低层合并后配置（无则 `undefined`），同步返回本层完整文档，
   返回值即最终形态、不再自动合并。`deepMerge` 整体废止。
3. 优先级：项目 `config.local` > 项目 `config` > 全局
   `$HOME/.workloom/config.json|js`；工厂入参逐层传递；全局层无 local 覆盖。
4. 全局配置仅消费项目无关字段：`subagent_profiles`、`session_auto_commit`、
   `session_commit_message`、`max_journal_lines`、`prompt_injection`、
   `context_injection`；`packages` / `hooks` 及白名单外顶层字段 → fail
   loud；遗留 `subagents` 接受 + 加载期 WARNING（项目层同口径）。
5. `default_package` 死字段删除（解析、默认值、migrate 读写全清）。
6. tools 字段：`subagent_profiles[i].subagents.<kind>.tools: {includes,
   excludes}`——在默认白名单上扩充/移除；字符串数组，空数组合法、重复去重、
   类型错报错；未知名字与运行时可见集求交静默忽略；支持尾缀 `*` 前缀模式
   （如 `lsp_*`，仅前缀匹配）。
7. prompts 三层：全局 `$HOME/.workloom/prompts/`、项目 `.workloom/prompts/`
   （新增、可入库）、项目 `.workloom/prompts.local/`（现状保留）；内部结构
   同构（`all.md` / `<target>.md` + front-matter），`requiresTools` 整体
   移除（不再解析，现存片段含该字段 → fail loud 清理）；注入为叠加：顺序
   全局 → 项目 → 项目 local，各层内 all 在前、target 在后。
8. config.example 重写为 `config.example.json` / `config.example.js`
   （对象 + 工厂两形态示例）；init 空模板、doctor 提示文案、`.gitignore`
   （`config.local.json|js`）同步更新。
9. 实现顺序约束：第一步先落 `.workloom/config.json`（等效现状：仅 packages
   段）、`.workloom/config.local.json`（个人 `subagent_profiles`：
   model/effort + `tools.includes: [lsp_*]`）、`.gitignore` 更新，再动
   解析器（防改造期 LLM 行为漂移；用户已删除 config.yaml 的 subagents 段）。

### ② 工具可见性机制层

10. allow 清单组装下沉 core（新增纯函数模块，双 runtime 单一事实源）：
    默认 = runtime 原生工具全集 − 全部 `lsp_*`（四 kind 相同）；插件工具
    不入默认，经 includes 补入；求交入参为可见集（DSH：`ctx.tools.schemas()`
    全局视图；Pi：理论工具集 = 内置 4 ∪ 探测到的 pi-lsp 2），runtime 无关。
11. DSH 下发：派发请求 `toolFilter` 只传 allow；`buildDenyList` /
    `availableToolNames` 删除，本机片段 `requiresTools` 判定改按 allow 集；
    capability 校验保留（缺失 fail loud）。
12. Pi 下发：`-t` 传 allow ∩ 理论工具集；交集为空 → fail loud 拒绝派发
    （英文错误指明 kind）；pi-lsp 仅当最终 allow 含其工具名时才 `-e` 加载；
    research 派发额外 `-e` 加载随包的路径受限 write/edit extension（同名
    覆盖语义实现第一步验证，不支持则 `wl_write`/`wl_edit` + `-xt
    write,edit` 剔原生，research 纪律段补 Pi 切片副本用法句）。
13. research write/edit 限 `.workloom/`：DSH 用全局 `ctx.tools.guard()`
    守卫——按派发登记的 research 子会话身份识别（dsh 重启后遍历非归档任务
    全部 research dispatches 重建，不区分活跃/已结算）；路径按子会话 cwd
    resolve、`<cwd>/.workloom/` 前缀判定；`write.file_path` 与
    `edit.file_path` 均判；拒绝消息英文。bash 路径绕过记为已知边界，不根治。
14. 派发回执：同行追加 `, K tools allowed`（K = 实际下发 allow 集大小），
    两 runtime 口径一致。

### ③ 协议层

15. 执行器终极权威段全 kind 共用部分补纪律三句：无用户通道、禁止交互式
    提问、无法自决的缺口必须停下把问题作为阻塞项写进报告回传主会话
    （命令式、禁弱化词；逐字措辞设计阶段定稿）；research kind 段补
    `.workloom/` 路径限制告知句。
16. workflow.md 2.1 末尾加一段主会话处置句（覆盖 implement 与 check：
    收到执行器阻塞项必须成批交用户决断）；契约版本 18 → 19。

## Acceptance Criteria

- test-first 交付。seams 五组：① config 解析与校验（新格式、三层合并、
  全局白名单、tools 字段）② allow 清单构建（默认 + includes/excludes +
  前缀模式 + 求交）③ DSH toolFilter 成形与 capability 校验 ④ Pi `-t`
  参数成形 ⑤ 协议文本逐字断言（纪律句/处置句/版本号 19）。
- 逐字断言三处：纪律句 + 处置句 + 契约版本号；守卫拒绝与 Pi 空交集
  fail loud 均配错误消息断言。
- 机制强制面：DSH 守卫对 research 越界 write/edit 拒绝、Pi extension
  副本同语义（单测断言）。
- 不涉及前端 UI。grilling 收敛结论见 task.json `grilling.summary`。

## Notes

- 已知边界（不根治）：bash 路径绕过；DSH 对子会话 ask_user_question 静默
  返回空答案（上游行为）；无 LSP 环境（如 Pi 主会话）LSP 片段无条件注入。
- 部署：代码 + 资产改动后跑 `~/dsh/bin/dsh-sync-workloom`，dshweb 重启
  归用户（`repo/deployment` 纪律）。
- 同批文件：config.js、local-prompts.ts、executor-context.js、
  executor.ts / executor-dispatch.ts（两 adapter）、workflow.md、init.js、
  doctor 系列。
