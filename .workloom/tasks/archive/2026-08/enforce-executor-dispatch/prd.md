## Goal

修复 session-2bd857ee 暴露的 executor 派发问题：主会话绕过派发直接写实现、子代理未按 `config.yaml` 的 subagents 配置使用模型且难以诊断。通过契约强化、跨 provider 修复、model 按 runtime 拆分、`config.local.yaml` 本地覆盖、in_progress 写文件硬门禁与派发结果可观测性，使「实现走子代理、模型按配置」成为可靠行为。

## Requirements

1. 契约强化（`packages/assets/workflow/`）：step 2.1 明确主会话禁止直接写实现代码（含 test-first 的测试种子），实现工作必须先经 `workloom_execute` 派发 implement executor；顺带核对 1.2/2.2 的派发表述口径一致。文案英文（assets 语言规范）。
2. 跨 provider 修复（core + adapter-dsh + adapter-pi）：
   - model 字符串支持 `provider/model` 前缀形式，adapter-dsh 拆分后将 provider 一并传入 `agentOptions.provider`（当前只传 model，DSH 按父会话 provider 解析裸 id，跨 provider 必报 UNKNOWN_MODEL）；
   - 裸 id（无前缀）保持现状语义（按父 provider 解析），不 WARNING，文档写明；
   - adapter-pi 侧按 Pi 的模型参数形式等价处理；
   - 修 `writeEffortHeader` 兜底错误：跨 provider 子代理不得回退父会话的 provider/model，必须使用生效的 provider/model。
3. model 按 runtime 拆分（core config）：`subagents.<kind>.model` 支持两种形式——string（所有 runtime 同值）或 map（如 `{dsh: xxx, pi: yyy}` 按 runtime 取值）；map 的 key 为 runtime 名，不白名单（与 kind 不白名单的既有约定一致）；map 形式缺当前 runtime 的 key 时 fail loud（`WorkloomConfigError`，带字段路径）。effort 保持 string，不拆 runtime。
4. `config.local.yaml` 本地覆盖：`.workloom/config.local.yaml` 存在时深合并覆盖 `config.yaml`（map 按 key 深合并、其余替换）；workloom 的 init/模板把 `config.local.yaml` 写进 `.workloom/.gitignore`；本仓库 `.workloom/.gitignore` 同步。
5. 硬门禁（adapter-dsh）：config 新增 `executor.gate: boolean`，默认 `true`。任务 `in_progress` 期间，主会话（`delegationDepthOf(exec.agent) === 0`）调用 `write`/`edit` 且目标路径不在 `.workloom/` 下时，经 `tools/pre-execute` 返回 `{kind:'deny', reason}`，reason 用英文引导文案指向 `workloom_execute`；子代理（depth ≥ 1）、非 in_progress 状态、`.workloom/` 路径均放行。已知边界：bash 工具内的写文件命令（`cat >`、`sed -i` 等）无法拦截，仍靠契约约束。
6. 可观测性：`workloom_execute` 返回文本尾部追加一行摘要：生效 model/effort 及各自来源（param / config / default），配置未生效一眼可辨。
7. 本仓库 `.workloom/config.yaml` 的裸模型 id 改为带 provider 前缀（`deepseek-official/...`）；map 形式的示范单独放 `.workloom/config.example.yaml`（dsh: `deepseek-official/deepseek-v4-flash`，pi: `deepseek/deepseek-v4-flash`），不影响生效配置。

## Acceptance Criteria

1. config 解析：`subagents.<kind>.model` 的 string/map 两种形式正确解析；map 缺当前 runtime key 抛 `WorkloomConfigError`（带字段路径）；`config.local.yaml` 深合并覆盖生效；`executor.gate` 缺省为 `true`，非法值抛错。
2. adapter-dsh：配置 `deepseek-official/deepseek-v4-flash-vision-exp` 时子代理实际以该 provider+model 启动（不再是 UNKNOWN_MODEL 或父会话模型）；`writeEffortHeader` 写入的 header 使用生效 provider/model；返回文本尾部含生效 model/effort 及来源。
3. 硬门禁：任务 in_progress 时主会话对业务路径 write/edit 被 deny 且文案指向 `workloom_execute`；`.workloom/` 路径、子代理、`gate: false`、非 in_progress 状态均放行。
4. adapter-pi：model map 按 `pi` 取值，既有行为不回归。
5. 验证全绿：`pnpm lint`、`pnpm -r typecheck`、`pnpm -r build`、`packages/core` 与 `packages/adapter-dsh` 的 `node --test`、`packages/adapter-pi` 的 `bun test`。

## Notes

- 根因记录：session-2bd857ee 模型未生效是双层原因——dshweb 进程（08-26 21:35 启动）加载的是 config 合并功能（08-26 20:52 提交）之前的旧 dist，且 08-27 11:19 同步新 dist 后未重启；叠加 executor 不传 provider 的代码 bug。前者重启 dshweb 即可（重启归用户），后者本任务修复。
- 调研结论见同目录 `research.md`：硬门禁挂点 `tools/pre-execute`（dsh-tools），主/子代理由 `delegationDepthOf` 可靠区分。
- cardx 项目的 `.workloom/config.yaml` 也存在裸 id，本任务不动该仓库，完成后提醒用户自行修改。
