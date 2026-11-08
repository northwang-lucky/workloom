/**
 * executor 角色值域（dispatch 层角色名词的单一来源，TypeScript）。
 *
 * 设计意图：
 * - 五角色是派发值域的唯一名词：researcher/developer/frontend-developer/
 *   checker/judger（Developer 拆通用与前端专项两个派发类型；Owner 是主会话，
 *   不进值域）；显示名（Researcher/Developer/Frontend Developer/Checker/Judger）
 *   单源在 ROLE_LABELS；
 * - 旧 kind 五值（research/implement/check/frontend/review）只存在于历史派发
 *   记录：LEGACY_KIND_TO_ROLE 是兼容读映射单点（永久保留），normalizeExecutorRole
 *   新值原样、旧值映射、未知值抛可判定错误；历史文件不改写；
 * - tryNormalizeExecutorRole 是非抛错变体（运行期扫描与收集面用，脏值返回
 *   null 由调用方跳过加 WARNING，抛错版保留给兼容读入口与展示判定点）；
 *   写侧与参数校验只收新五值（isExecutorRole）；
 * - 纯常量模块，无副作用、零依赖。
 */
/** executor 角色（子代理派发值域；五角色单源）。 */
export declare const EXECUTOR_ROLES: Readonly<{
    readonly RESEARCHER: "researcher";
    readonly DEVELOPER: "developer";
    readonly FRONTEND_DEVELOPER: "frontend-developer";
    readonly CHECKER: "checker";
    readonly JUDGER: "judger";
}>;
/** EXECUTOR_ROLES 的单值类型。 */
export type ExecutorRole = (typeof EXECUTOR_ROLES)[keyof typeof EXECUTOR_ROLES];
/** 旧 kind 值（历史派发记录落盘值；仅作兼容读映射的输入域，不进新写入）。 */
declare const LEGACY_KINDS: Readonly<{
    readonly research: "research";
    readonly implement: "implement";
    readonly check: "check";
    readonly frontend: "frontend";
    readonly review: "review";
}>;
/** 旧 kind 值的单值类型（过渡期双值域校验用；旧值域模块退役后仍随映射表保留）。 */
export type LegacyExecutorKind = (typeof LEGACY_KINDS)[keyof typeof LEGACY_KINDS];
/**
 * 值域判定（守卫）：字符串是否为合法 executor 角色（新值域）。
 * @param value 待判定值
 * @returns 合法角色时 true（并收窄类型）
 */
export declare function isExecutorRole(value: unknown): value is ExecutorRole;
/** 角色显示名（值 → 展示文案；dsh 标题标签与画像节消费此单源）。 */
export declare const ROLE_LABELS: Readonly<Record<ExecutorRole, string>>;
/** 旧 kind 值 → 新角色值的兼容读映射（历史记录读取单点；永久保留，历史文件不改写）。 */
export declare const LEGACY_KIND_TO_ROLE: Readonly<Record<LegacyExecutorKind, ExecutorRole>>;
/**
 * 兼容读归一（抛错版）：新值原样返回，旧 kind 值按映射表归一，其余值抛可判定
 * 错误（不静默按缺省处理，与既有记录规范化行为一致）。兼容读入口与展示判定点
 * 用本版；运行期扫描与收集面用 tryNormalizeExecutorRole 非抛错变体。
 * @param value 记录原值（历史派发记录 kind 字段等）
 * @returns 新值域角色
 */
export declare function normalizeExecutorRole(value: unknown): ExecutorRole;
/**
 * 兼容读归一（非抛错变体）：新值原样、旧值映射、未知值返回 null（脏值由调用方
 * 跳过并加 WARNING，不中断批量扫描）。
 * @param value 记录原值
 * @returns 新值域角色，或 null（未知值）
 */
export declare function tryNormalizeExecutorRole(value: unknown): ExecutorRole | null;
export {};
