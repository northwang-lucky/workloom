/**
 * executor 同类并发轮换选取纯函数（行为移植模块，纯 JS + JSDoc）。
 *
 * 设计意图：
 * - 把 `[主模型位, fallback_models…]` 池视为环形：新派发按「同类已占用模型」
 *   顺延取首个未占用条目作为起始绑定，并把环形顺序在派发时刻物化为线性失败
 *   转移链——走链模块（runFallbackChain）按线性链消费，零改动；
 * - 纯同步、无 IO、无副作用：入参均为值对象，adapter 在容量放行后的同步段调用
 *   （判定→选取→in-flight 登记之间不得有 await 间隙）；
 * - 全占用回绕主模型位（下标 0）：不拒绝、不排队（回绕即现状绑定，零行为变化）；
 * - 主模型位 label（继承形态的 PARENT_MODEL_LABEL）由调用方归一进池，本模块
 *   不感知 label 语义，占用集合的来源归一同属调用方。
 */

/**
 * 选取轮换起始下标（纯函数）：按池顺序返回首个不在占用集合的下标；全占用返回
 * 0（回绕主模型位，调用方按现状绑定处理）。池为空时返回 0。
 * @param {{poolModels: string[], usedModels: ReadonlySet<string>}} params
 *   poolModels：池内模型 label 顺序表（下标 0 = 主模型位）；
 *   usedModels：同 kind 已占用的模型 label 集合。
 * @returns {number} 起始下标（池非空时 0..poolModels.length-1；全占用或空池返回 0）
 */
export function selectRotationStartIndex({ poolModels, usedModels }) {
  for (let index = 0; index < poolModels.length; index++) {
    const model = poolModels[index]
    if (model !== undefined && !usedModels.has(model)) return index
  }
  return 0
}

/**
 * 物化环形链（纯函数）：按起始下标把环形顺序产出为「起始条目 + 线性转移链」，
 * 与失败转移链的线性消费协议完全兼容：
 * - startIndex = 0：起始即主模型位条目，转移链为 [F1..FN]（现状恒等）；
 * - startIndex > 0：起始为池内第 i 项，转移链为环的剩余部分
 *   [第 i+1 项..第 N 项, 主模型位, 第 1 项..第 i-1 项]。
 * 空池 fail loud（无灰区：派发侧链非空才进入轮换，空池属调用方错误）。
 * @param {{pool: {model: string, effort?: string}[], startIndex: number}} params
 *   pool：轮换池（下标 0 = 主模型位条目，条目形如 {model, effort?}）；
 *   startIndex：selectRotationStartIndex 的返回值。
 * @returns {{startEntry: {model: string, effort?: string}, chain: {model: string, effort?: string}[]}}
 *   起始条目与线性化转移链（链不含起始条目本身）
 */
export function materializeRingChain({ pool, startIndex }) {
  if (pool.length === 0) {
    throw new Error('materializeRingChain: pool must not be empty (rotation requires a fallback pool)')
  }
  // 防御式归一：下标越界夹回池内（调用方传 selectRotationStartIndex 的返回值时恒在界内）。
  const start = Math.max(0, Math.min(startIndex, pool.length - 1))
  const startEntry = /** @type {{model: string, effort?: string}} */ (pool[start])
  const chain = []
  for (let step = 1; step < pool.length; step++) {
    const entry = pool[(start + step) % pool.length]
    if (entry !== undefined) chain.push(entry)
  }
  return { startEntry, chain }
}
