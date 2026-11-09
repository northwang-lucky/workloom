# C4 代码面互验锚点（相对 worktree 根）

## executor.ts：轮换段同步接线、绑定留痕、settle 链、receipt 标注
480:    decision = decideRotationStart({
490:    const selected: { model?: string; effort?: string } =
495:    registerInFlightDispatch(dispatchSeq, params.role, selected.model ?? PARENT_MODEL_LABEL)
535:      : buildNewDispatchBinding(params, effective, mainModel, decision.rotation)),
557:    ...(decision.chain !== undefined ? { failoverChain: decision.chain } : {}),
592:    ...(decision.rotation !== undefined ? { rotation: { model: decision.rotation.model } } : {}),

## executor-settle.ts：failoverChain 字段与链取值优先
113:  failoverChain?: SubagentFallbackModel[]
420:    respawn.failoverChain ??
426:  const next = fallbackChain.find((entry) => entry.model !== deadModel)

## executor-rotation.ts：组合纯函数与物化协议
46:export function decideRotationStart(params: {
75:  if (startIndex === 0) return {}
110:export function materializeRingChain(params: {
119:  const start = Math.max(0, Math.min(startIndex, pool.length - 1))

## executor.test.ts：用例锚点（轮换起步/全占用/链优先/receipt）
3321:test('failover: respawn.failoverChain 优先（物化环序链一跳取起点后继，不读配置链）', async () => {
3411:test('receipt: rotation 标注逐字追加尾部（forced→reused→rotated 顺序；非轮换零变化）', async () => {
3472:test('轮换编排：主模型位与 F1 被占用时起步 F2——记录 modelSource=rotate、receipt 标注、结算重试走物化环序链', async () => {
3520:test('轮换编排：全占用回绕主模型位零痕迹——spawn 现状绑定、记录无 rotate、receipt 无标注、结算回落配置链', async () => {

## 非轮换不传链的静态证据（executor.ts 543-557）
  trackDispatchSettle(childId, root, taskRelPath, {
    parent,
    prompt: sendText,
    role: params.role,
    title: params.title,
    toolsAllow: allowFilter.allow,
    wasContinuation: reused,
    // 生效模型绑定：轮换用选定条目（deadModel 基准），非轮换维持 effective 现状。
    binding:
      decision.rotation ?? {
        ...(effective.model !== undefined ? { model: effective.model } : {}),
        ...(effective.effort !== undefined ? { effort: effective.effort } : {}),
      },
    // 结算重试消费链：轮换传物化环序链，非轮换不传（回落配置重算，零行为变化）。
    ...(decision.chain !== undefined ? { failoverChain: decision.chain } : {}),
