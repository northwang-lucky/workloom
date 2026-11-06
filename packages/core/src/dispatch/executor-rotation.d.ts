/** executor 同类并发轮换选取纯函数：轮换池条目、选取与环形物化的类型锚点。 */

/** 轮换池条目（池与物化产物共用形状：模型 label + 可选 effort）。 */
export interface RotationPoolEntry {
  /** 模型 label（provider/model 或裸 id；继承父会话的主模型位为 PARENT_MODEL_LABEL）。 */
  model: string
  /** 该条目的 reasoning effort（可选；省略即不传，用目标模型默认档位）。 */
  effort?: string
}

/** selectRotationStartIndex 入参。 */
export interface SelectRotationStartIndexParams {
  /** 池内模型 label 顺序表（下标 0 = 主模型位）。 */
  poolModels: string[]
  /** 同 kind 已占用的模型 label 集合（读不到的绑定由调用方归一为主模型位 label）。 */
  usedModels: ReadonlySet<string>
}

/** materializeRingChain 入参。 */
export interface MaterializeRingChainParams {
  /** 轮换池（下标 0 = 主模型位条目，条目形如 {model, effort?}）。 */
  pool: readonly RotationPoolEntry[]
  /** 起始下标（selectRotationStartIndex 的返回值）。 */
  startIndex: number
}

/** materializeRingChain 结果：起始条目与线性化转移链（链不含起始条目本身）。 */
export interface MaterializedRingChain {
  /** 起始条目（池非空时必有；空池 fail loud 抛错）。 */
  startEntry: RotationPoolEntry
  /** 环的剩余部分线性化（起始条目之后按环形顺序）。 */
  chain: RotationPoolEntry[]
}

/**
 * 选取轮换起始下标（纯函数）：按池顺序返回首个不在占用集合的下标；全占用返回
 * 0（回绕主模型位）；池为空返回 0。
 */
export function selectRotationStartIndex(params: SelectRotationStartIndexParams): number

/**
 * 物化环形链（纯函数）：把环形顺序产出为起始条目与线性转移链；startIndex = 0
 * 时转移链即池的 1..N-1 段（现状恒等）。空池抛错（调用方保证链非空才进入轮换）。
 */
export function materializeRingChain(params: MaterializeRingChainParams): MaterializedRingChain
