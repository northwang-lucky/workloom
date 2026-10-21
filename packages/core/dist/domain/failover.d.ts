/**
 * 判定错误码是否属于「模型无法正常访问」白名单：非 string / 空串 / 白名单外
 * 一律 false（保守口径，不触发转移）。
 * @param {unknown} code DSH LlmFailure code（可能缺失/形状未知）
 * @returns {boolean} 命中白名单时 true
 */
export function isModelInaccessibleCode(code: unknown): boolean;
/**
 * 从同步异常提取 DSH 错误码：仅对象形状且 code 为去空白后非空的 string 时返回
 * code；其余（string / null / 无 code 对象）返回 null——null 不触发转移。
 * @param {unknown} error 同步抛出的错误（startActivation reject 等）
 * @returns {string | null} 错误码或 null
 */
export function extractFailureCode(error: unknown): string | null;
/**
 * 组装失败转移说明（追加进重派的首条 prompt，英文单行）：上一轮死于哪个模型的
 * 哪类错误、工作区可能留有半成品；续用轮失败时再注明增量指令随旧会话丢失。
 * @param {{deadModel: string, code: string, wasContinuation: boolean}} params
 *   失败模型、错误码、失败轮是否为续用轮
 * @returns {string} 单行说明（无换行）
 */
export function buildFailoverNote({ deadModel, code, wasContinuation }: {
    deadModel: string;
    code: string;
    wasContinuation: boolean;
}): string;
/**
 * 组装父会话一行转移通知（英文单行）：失败模型 + 错误码 + 下一模型 + 第几跳。
 * 三种分支共用同一函数：常规转移（nextModel 存在）/ 链穷尽（nextModel 缺省）/
 * 门禁阻断（blockedReason 存在，放弃自动转移并提示人工重派）。
 * @param {{
 *   kind: string,
 *   title: string,
 *   deadModel: string,
 *   code: string,
 *   nextModel?: string,
 *   attempt: number,
 *   total: number,
 *   blockedReason?: string,
 * }} params 通知要素（attempt = 下一跳序号；穷尽时等于总跳数）
 * @returns {string} 单行通知文本
 */
export function buildFailoverNotice(params: {
    kind: string;
    title: string;
    deadModel: string;
    code: string;
    nextModel?: string;
    attempt: number;
    total: number;
    blockedReason?: string;
}): string;
/**
 * 模型不可访问失败转移的纯函数（行为移植模块）：错误码白名单分类 + 两段英文文案。
 *
 * 设计意图：
 * - 触发口径只认 DSH 结构化 LlmFailure 的 code（白名单常量单一来源），业务性
 *   失败（测试不过、refusal、max-tokens、INVARIANT 等）一律不触发——宁可漏转
 *   也不误转；
 * - 文案是 runtime 文本（英文），与 core 其他用户项目侧文案同纪律；adapter 只
 *   负责把文案拼进 prompt / 父会话通知，不在 adapter 私造措辞；
 * - 纯同步、无 IO、无副作用。
 */
/**
 * 触发失败转移的 DSH LlmFailure code 白名单（单一来源）。
 * TRANSPORT/TIMEOUT/UNKNOWN_MODEL 为路由与模型不可用；AUTH 族与 ACCOUNT 族为
 * 凭据/配额；RATE_LIMIT/QUOTA 为限流；UNSUPPORTED_REASONING_EFFORT 为档位不兼容
 * （换模型后条目 effort 独立决定，可能恢复可用）。
 * @type {readonly string[]}
 */
export const MODEL_INACCESSIBLE_CODES: readonly string[];
