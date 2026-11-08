/**
 * 模型不可访问失败转移（dsh 内部模块，自 core failover.js 迁入）：错误码白名单
 * 分类 + 两段英文文案。
 *
 * 设计意图：
 * - 触发口径只认 DSH 结构化 LlmFailure 的 code（白名单常量单一来源），业务性
 *   失败（测试不过、refusal、max-tokens、INVARIANT 等）一律不触发——宁可漏转
 *   也不误转；
 * - 文案是 runtime 文本（英文）：note 段追加进重派 prompt 尾部（transport-failover
 *   的 appending a failover note 语义），notice 行经结算 followup 投影通知父会话
 *   并追加进失败记录 error 后缀；dsh 内部直接消费，不再经 core index 重导出
 *   （死导出问题随迁移消解）；
 * - 纯同步、无 IO、无副作用。
 */

/**
 * 触发失败转移的 DSH LlmFailure code 白名单（单一来源）。
 * TRANSPORT/TIMEOUT/UNKNOWN_MODEL 为路由与模型不可用；AUTH 族与 ACCOUNT 族为
 * 凭据/配额；RATE_LIMIT/QUOTA 为限流；UNSUPPORTED_REASONING_EFFORT 为档位不兼容
 * （换模型后条目 effort 独立决定，可能恢复可用）。
 */
export const MODEL_INACCESSIBLE_CODES: readonly string[] = Object.freeze([
  'TRANSPORT',
  'TIMEOUT',
  'UNKNOWN_MODEL',
  'AUTH',
  'INVALID_CREDENTIAL',
  'MISSING_CREDENTIAL',
  'ACCOUNT_QUOTA',
  'ACCOUNT_SIGN_IN_REQUIRED',
  'ACCOUNT_TOKEN_INVALID',
  'RATE_LIMIT',
  'QUOTA',
  'UNSUPPORTED_REASONING_EFFORT',
])

/** 白名单集合（判定用，由常量派生，杜绝两处字面量漂移）。 */
const MODEL_INACCESSIBLE_CODE_SET = new Set(MODEL_INACCESSIBLE_CODES)

/**
 * 判定错误码是否属于「模型无法正常访问」白名单：非 string / 空串 / 白名单外
 * 一律 false（保守口径，不触发转移）。
 * @param code DSH LlmFailure code（可能缺失/形状未知）
 * @returns 命中白名单时 true
 */
export function isModelInaccessibleCode(code: unknown): boolean {
  return typeof code === 'string' && MODEL_INACCESSIBLE_CODE_SET.has(code)
}

/**
 * 从同步异常提取 DSH 错误码：仅对象形状且 code 为去空白后非空的 string 时返回
 * code；其余（string / null / 无 code 对象）返回 null——null 不触发转移。
 * @param error 同步抛出的错误（startActivation reject 等）
 * @returns 错误码或 null
 */
export function extractFailureCode(error: unknown): string | null {
  if (error === null || typeof error !== 'object') return null
  const code = (error as { code?: unknown }).code
  if (typeof code !== 'string') return null
  const trimmed = code.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * 组装失败转移说明（追加进重派的首条 prompt 尾部，英文单行）：上一轮死于哪个
 * 模型的哪类错误、工作区可能留有半成品；续用轮失败时再注明增量指令随旧会话
 * 丢失（transport-failover 的 keeping the original prompt + appending a failover
 * note 语义：原 prompt 全文保留，note 只追加）。
 */
export function buildFailoverNote(params: {
  deadModel: string
  code: string
  wasContinuation: boolean
}): string {
  let note =
    `Failover: the previous attempt on model ${params.deadModel} died with a model-access error (${params.code}). ` +
    'The workspace may contain partially completed work from that attempt: inspect it and keep ' +
    'whatever is still valid instead of redoing it blindly.'
  if (params.wasContinuation) {
    note +=
      ' That attempt was a continuation turn, so the incremental instructions sent in it were lost ' +
      'with the old child session; restate anything from them this task still needs.'
  }
  return note
}

/**
 * 组装父会话一行转移通知（英文单行）：失败模型 + 错误码 + 下一模型 + 第几跳。
 * 三种分支共用同一函数：一跳重派（nextModel 存在）/ 无链或链穷尽（nextModel
 * 缺省）/ 阻断（blockedReason 存在——已重试过或重派启动失败，放弃自动转移并
 * 提示人工重派）。
 * @param params 通知要素（attempt = 本跳序号；穷尽时等于总跳数）
 * @returns 单行通知文本
 */
export function buildFailoverNotice(params: {
  role: string
  title: string
  deadModel: string
  code: string
  nextModel?: string
  attempt: number
  total: number
  blockedReason?: string
}): string {
  const { role, title, deadModel, code, nextModel, attempt, total, blockedReason } = params
  const headline =
    `workloom executor failover (${role} "${title}"): model ${deadModel} failed with ${code}; `
  if (blockedReason !== undefined) {
    return `${headline}automatic failover was skipped (${blockedReason}); the dispatch stays failed — re-dispatch manually when ready.`
  }
  if (nextModel === undefined) {
    return `${headline}the fallback chain is exhausted after ${total} attempt(s); the dispatch stays failed — re-dispatch manually with a healthy model.`
  }
  return `${headline}starting failover attempt ${attempt} of ${total} on ${nextModel}.`
}
