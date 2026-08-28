# workloom executor 子代理切换为一次性(one-shot)模式

## Goal

把 workloom 在 DSH 侧的 `workloom_execute` 子代理派发从「可继续(continuable)」
切换为「一次性(one-shot)」:子代理一旦派发即成为封闭的一次性记录,用户无法通过
GUI 对其发送消息。DSH 原生双保险:客户端对 one-shot 子代理渲染只读 composer
(「一次性任务不支持后续消息,可在这里查看完整执行记录」),服务端
`subagent.prompt` 端点只接受 continuable 子代理,one-shot 直接拒绝 follow-up。

## Requirements

### 已确认(用户拍板:直接切 one-shot,放弃 effort 通道)

- **派发方式**:`ctx.subagents.startContinuable(...)` + `drainContinuableChildren`
  替换为 `ctx.subagents.start(SPAWN_PROVIDER, {...})`(one-shot),provider 仍为
  `spawn`(in-process)。
- **DSH 侧 effort 完全移除(用户拍板 1A)**:
  - `workloom_execute` 工具的 schema 删除 `effort` 参数;
  - DSH 派发不再消费 `subagents.<kind>.effort` 配置;
  - 删除 effort header 写入通道、receipt 里的 effort 标注、冲突检测与
    force 审计(含 `executor_model_effort` gate)中的 effort 维度,
    只保留 model 维度;
  - `.workloom/config.example.yaml` 的 effort 字段说明标注「仅 Pi 生效」;
  - core 的 `resolveSubagentDefaults`/`detectExecutorConflicts` 保持
    model/effort 通用实现(供 adapter-pi 使用),不删逻辑。
- **保留 model 链路**:`model` 参数、`provider/model` 拆分、
  `subagents.<kind>.model` 回退(含 runtime map)、model 冲突检测与
  `force`/`reason` 审计 gate 全部保持。
- **保留派发语义**:`maxDepth: 1`(子代理禁止再派发)、`label` 前缀
  `[<KindLabel>] <title>`、`signal` 取消、任务路径/上下文解析、空输出兜底
  `EMPTY_OUTPUT_TEXT`、receipt 行(model/来源,force 放行标注 `(forced)`)。
- **输出获取**:由 `run.result` 取代「child 引用 + `whenIdle()` +
  `events.slice(boundary)` + `finalAssistantOutput`」手工切片;`runId` 沿用
  child session id。
- **Pi 侧不动**:adapter-pi 保留自己的 effort 通道(`--thinking`),
  不受本次改动影响。
- **异常终止呈现(用户拍板 2A)**:`run.result.stopReason` 非 `completed`
  时,`workloom_execute` 返回工具错误结果,错误文本为 `diagnostic`(缺失时
  用 stopReason 的兜底文案,如 `the executor subagent ended with <reason>`);
  不附完整输出文本(避免把中止/失败当成功消费)。
- **资源释放**:读取 `run.result` 后调用 `run.dispose()`(对齐原
  `drainContinuableChildren` 语义),释放失败仅 WARNING 不阻塞返回。

## Acceptance Criteria

- [ ] one-shot 派发生效:GUI 中 workloom 子代理显示为「一次性」,composer
      只读,无法发送消息;服务端 `subagent.prompt` 对旧会话同样拒绝。
- [ ] `workloom_execute` 行为对齐:成功返回文本 + receipt;model 配置回退、
      冲突检测、force/reason 审计、taskPath 解析、取消均与现状一致;
      `stopReason` 非 `completed` 时返回错误结果(带 diagnostic/兜底文案)。
- [ ] effort 通道干净退出:DSH 侧工具 schema、receipt、冲突门与审计
      gate 均无 effort 痕迹,Pi 侧与 core 共享逻辑不受影响。
- [ ] 验证全绿:`pnpm lint`、`pnpm -r typecheck`、`pnpm -r build`、
      `cd packages/core && node --test test/*.test.js`、
      `cd packages/adapter-dsh && node --test test/*.test.js`。
- [ ] 测试更新:executor.test.js 子代理桩改为 `subagents.start`(返回
      mock run),新增 one-shot 行为断言;effort 相关旧断言按新形态改写。

## Notes

- 实现参考:`research/dsh-one-shot-vs-continuable.md`(DSH 机制与证据,
  含客户端只读判定与服务端拒绝路径)。
- 关键契约:`@deepseek-ai/dsh-subagent@0.1.1-rc.2` 的
  `SubagentStartRequest`/`SubagentResult`/`SubagentRun`;spawn provider
  capability 含 `depthLimit`(故 `maxDepth: 1` 继续可用)。
- 硬约束:主会话不写实现代码;实现由 dispatched 的 implement 子代理完成,
  任务实现时把相关 spec(见 AGENTS.md)内联进 implement.jsonl。
