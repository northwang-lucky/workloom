# Implement：test-first 切片计划

切片按依赖排序（S2 的 core schema 是 S1/S3 回填与统计的基础），单轮交付，红→绿逐切片推进。

## 切片 1：core 记录 schema 与回填 API（S2-core）

- 红：`packages/core/test/task-store.test.js` 断言——派发初写即含 `status: 'running'`；回填 API 写入 `completed`/`failed` + 一行 error 摘要且不改 stage、不重复计数；无 status 存量记录读取视为 `completed`；失败派发（初写后未结算）留痕可见。
- 绿：`task-store.js`/`task-store.d.ts` 增字段与两 API（初写/回填），遵循 legacy 纯 JS 模块约定。

## 切片 2：后台派发默认化（S1）

- 红：`adapter-dsh/test/executor.test.js` 断言——默认调用即返回（不等待 turn 结算、不消费 whenIdle），返回值含子代理标识与完整 receipt（注入四元组 + model/effort）；`foreground: true` 维持现状阻塞行为与 `(reused)` 语义。
- 绿：`executor.ts`/`executor-continuation.ts` 拆分前台/后台返回路径；初写 dispatches 提前到派发时刻（切片 1 API）。

## 切片 3：终态自动回填（S2-adapter）

- 红：`adapter-dsh/test/plugin.test.js` 断言 `subagent/end` 监听注册；`executor.test.js` 补事件接缝（mock `on/emit`），派发返回后手动 emit `completed`/`error` 终态，断言 dispatches 记录回填 `completed`/`failed` + stopReason 一行摘要，按 `info.id` 关联。
- 绿：`plugin.ts` 注册监听并接线回填。

## 切片 4：续接增量与 reinject（S3）

- 红：`adapter-dsh/test/executor.test.js` 断言——续接默认只发增量指令（followup 收到参数 prompt，不含完整 `built.text`）；`reinject: true` 恢复全量；两种情况 receipt 注入统计如实反映实际发送内容。
- 绿：`executor.ts:437` 续接分支改造 + `continue_executor` 参数扩展。

## 切片 5：纪律与契约 v17（S4）

- 红：assets/core 测试逐字断言——`[workflow-norms]` 含"不复述"句；契约版本号 17；§2.1/§2.2 后台流程叙述存在。
- 绿：`packages/assets/workflow/workflow.md` 措辞定稿并递增版本号。

## 回归

`pnpm -r build` → core/adapter-dsh `node --test`、adapter-pi `bun test` → `pnpm lint` → `pnpm -r typecheck` → 改动文件 LSP diagnostics。禁止 commit/push/workloom check，固定格式报告。
