# C3 代码面锚点：四路径相对轮换段的分流位置

## executor.ts 关键行
246:    params.continue_executor !== undefined &&
375:  if (params.continue_executor !== undefined) {
395:    if (continueGate.text !== null) {
472:    if (dispatchGate.text !== null) {
480:    decision = decideRotationStart({
481:      rotateOnBusy: effective.rotateOnBusy === true,

## rotated 字样检索（src）
/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/worktree/11-08-rotate-on-busy/packages/dsh-workloom/src/dispatch/executor-continuation.ts:42:   * 标注尾部追加 (rotated: <model>)。非轮换轮不设，零行为变化。
/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/worktree/11-08-rotate-on-busy/packages/dsh-workloom/src/dispatch/executor-continuation.ts:83:  // 标注顺序：forced → reused → rotated（各自独立，回执尾部追加，便于审计扫读）。
/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/worktree/11-08-rotate-on-busy/packages/dsh-workloom/src/dispatch/executor-continuation.ts:86:    `${meta.rotation !== undefined ? ` (rotated: ${meta.rotation.model})` : ''}`
/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/worktree/11-08-rotate-on-busy/packages/dsh-workloom/src/dispatch/executor.ts:67: *   轮换起步绑定留痕 modelSource='rotate'、回执追加 (rotated: <model>) 标注。
/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/worktree/11-08-rotate-on-busy/packages/dsh-workloom/src/dispatch/executor.ts:591:    // 轮换起步：回执尾部追加 (rotated: <model>) 标注；主模型位起步不置字段不标注。

## rotate 字样检索（executor.ts）
62: * - 同类并发轮换（executor-rotation.ts 纯函数 + 本文件编排）：新派发闸放行后的
63: *   同步段，`rotateOnBusy 且未显式传 model 且 fallback 链非空` 时把
67: *   轮换起步绑定留痕 modelSource='rotate'、回执追加 (rotated: <model>) 标注。
74: * executor-capacity.ts，同类并发轮换纯函数在 executor-rotation.ts。
134:import { decideRotationStart } from './executor-rotation.ts'
342:  let decision: ReturnType<typeof decideRotationStart> = {}
480:    decision = decideRotationStart({
481:      rotateOnBusy: effective.rotateOnBusy === true,
491:      decision.rotation ?? { model: effective.model, effort: effective.effort }
532:    // （轮换传选中条目：绑定即链条目，modelSource='rotate' 留痕审计）。
535:      : buildNewDispatchBinding(params, effective, mainModel, decision.rotation)),
552:      decision.rotation ?? {
591:    // 轮换起步：回执尾部追加 (rotated: <model>) 标注；主模型位起步不置字段不标注。
592:    ...(decision.rotation !== undefined ? { rotation: { model: decision.rotation.model } } : {}),

## executor-rotation.ts：进入条件与回绕零留痕分支
55:  if (!params.rotateOnBusy || params.explicitModel !== undefined || params.fallbackChain.length === 0) {
75:  if (startIndex === 0) return {}

## 四路径分流结论
- 续用轮：executor.ts:375 续用分支独立，轮换段只在新派发 else 分支（480 起）。
- 容量拒绝：executor.ts:472 拒绝 return 先于 480 轮换段，次序不可颠倒。
- 开关缺省/false 与显式 model：进入条件在 executor-rotation.ts:55，直接返回空决策。
- 全占用回绕：executor-rotation.ts:75 startIndex === 0 返回空决策，不置 rotation。
