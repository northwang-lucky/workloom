/**
 * .workloom 初始化骨架（TypeScript）。
 *
 * 设计意图：
 * - 幂等生成骨架：目录与文件缺失才创建，已有内容一律不覆盖（含 force 模式）；
 * - 数据布局对齐 core 约定：.workloom/{tasks,spec,.runtime/worktrees} + config.json
 *   + .gitignore + spec/README.md（运行时状态收敛进 .runtime/）；
 * - 模板外置：config 种子、.gitignore 种子与 spec README 种子全部落在
 *   core/resources/skeleton/ 并经 resources-manifest 登记，本模块经 manifest
 *   读取，内嵌模板字符串清零；种子缺失 fail loud（部署残缺不静默降级）；
 * - 顺带检测旧 .trellis 目录并报告（迁移由后续实现点消费，本模块只报告）；
 * - 生成自包含的 .workloom/.gitignore：运行时状态忽略策略随骨架分发，
 *   接入方仓库无需在根 .gitignore 手工维护 workloom 内部布局规则。
 */
/** initWorkloom 入参。 */
export interface InitWorkloomParams {
    /** 已存在 .workloom 时是否强制补建缺失项（不覆盖已有文件）。 */
    force?: boolean;
}
/** 初始化结果。 */
export interface InitWorkloomResult {
    /** 项目根绝对路径。 */
    root: string;
    /** 本次新创建的文件/目录相对路径（相对 root，按创建顺序）。 */
    created: string[];
    /** 向上检测到的旧 .trellis 项目根；无则 null。 */
    legacyTrellisRoot: string | null;
}
/**
 * 初始化 .workloom 骨架。
 * @param root 目标项目根（或根下任意目录）
 * @param params 初始化参数
 * @returns [Error | null, InitWorkloomResult | null]
 */
export declare function initWorkloom(root: string, params?: InitWorkloomParams): [Error | null, InitWorkloomResult | null];
