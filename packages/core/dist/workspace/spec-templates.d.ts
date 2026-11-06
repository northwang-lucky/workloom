/**
 * spec-templates：把 spec 模板资产幂等写入项目 .workloom/spec/.templates/
 * （新增抽象，TypeScript）。
 *
 * 设计意图：
 * - 依赖方向：模板文本由 adapter 从 assets 读入装配（内容资源在 assets），
 *   本模块只做「定位 .workloom + 幂等写两个固定文件名」的最小编排；
 * - 目标目录 .templates 首字符非字母数字，spec-index 收集器的目录名
 *   字符校验天然排除，不会进 guidelines 索引（见 spec-knowledge-base-spec §10.3）；
 * - 幂等语义与 init 一致：文件已存在不覆盖，用户可改项目内拷贝；
 * - 入参 root 可为项目根或根下任意目录，内部经 findWorkloomRoot 定位。
 */
/** ensureSpecTemplates 入参。 */
export interface SpecTemplatesParams {
    /** 项目根（或根下任意目录）。 */
    root: string;
    /** spec-index.md 模板全文（adapter 从 assets 读入）。 */
    indexTemplate: string;
    /** spec-detail.md 模板全文（adapter 从 assets 读入）。 */
    detailTemplate: string;
}
/** ensureSpecTemplates 结果。 */
export interface SpecTemplatesResult {
    /** 项目根（定位结果）。 */
    root: string;
    /** 本次新建的文件（.workloom 相对路径）。 */
    created: string[];
}
/**
 * 幂等写入 spec 模板到项目 .workloom/spec/.templates/。
 * @param params 入参
 * @returns [err, result]：项目不在 .workloom 内或写盘失败时 err 非空
 */
export declare function ensureSpecTemplates(params: SpecTemplatesParams): [Error | null, SpecTemplatesResult | null];
