# 实施方案：移除 DSH 写入硬门禁

## 阶段 1：配置接缝 TDD

1. 修改 core 配置测试，先断言默认配置不含 `executor.gate`，旧配置中的该字段被静默忽略；运行定向测试确认红灯。
2. 从 `packages/core/src/legacy/config.js` 默认值与解析分支删除 gate。
3. 从 `packages/core/src/legacy/config.d.ts` 删除 gate 类型。
4. 运行配置定向测试转绿。

## 阶段 2：初始化与 doctor 接缝 TDD

1. 调整 init 测试，先断言生成配置不含 gate；运行确认红灯。
2. 删除 init 模板中的 gate 注释和字段，运行测试转绿。
3. 调整 doctor 测试，先断言残留旧 gate 字段不会产生 issue，同时保留缺失/损坏配置覆盖；运行确认红灯。
4. 删除 doctor gate 关闭分支及相关文案，运行测试转绿。
5. 从仓库 `.workloom/config.yaml` 删除已废弃的 `executor.gate`。

## 阶段 3：adapter-dsh 接缝 TDD

1. 在 adapter-dsh plugin 公共注册接缝新增测试，先断言激活过程不注册 Workloom 文件写入预执行监听；运行确认红灯。
2. 从 plugin 删除 gate import 与注册调用。
3. 从 executor 删除豁免 import、登记、注销和相关注释；保持 start/followup、collect、drain 生命周期不变。
4. 删除 `packages/adapter-dsh/src/gate.ts` 与 `packages/adapter-dsh/test/gate.test.js`。
5. 删除 executor 测试中的 gate import 与跨轮豁免专用用例，保留同会话 followup 测试。
6. 运行 adapter-dsh 定向测试转绿。

## 阶段 4：workflow 接缝 TDD

1. 调整 core contract asset 测试，先同时断言 implement executor 分工和 check 例外存在、`executor.gate` 与运行时写阻断陈述不存在；运行确认红灯。
2. 仅删除 `packages/assets/workflow/workflow.md` 中两处 DSH 门禁说明，不改 Agent 分工硬提示和 check 例外。
3. 运行 contract asset 定向测试转绿。

## 阶段 5：静态检查与完整验证

1. 用 grep 确认 packages 下无 `executor.gate`、gate 注册和豁免符号残留；允许任务历史文档保留背景描述。
2. 对修改过的 TypeScript 文件执行 LSP diagnostics，并修复全部诊断。
3. 执行 `pnpm lint`。
4. 执行 `pnpm -r typecheck`。
5. 删除 `packages/core/dist` 与 `packages/adapter-dsh/dist` 后执行 `pnpm -r build`。
6. 执行 core 测试与 adapter-dsh 测试；必要时执行仓库其他受影响测试。
7. 执行 `git diff --check`，确认没有无关改动。

## 阶段 6：同步与交付

1. 确认工作区 `packages/adapter-dsh/dist/` 不存在 `gate.js`、`gate.d.ts`、`gate.js.map`。
2. 对 core、adapter-dsh 与 assets 到当前 DSH profile 的 rsync 执行 dry-run，核对删除项。
3. 运行 `~/dsh/bin/dsh-sync-workloom`。
4. 确认 profile 中旧 `dist/gate.*` 已删除；不重启 DSH Web。
5. 报告每个 TDD 红绿切片、完整验证结果、同步结果和剩余风险；等待独立 check。