/**
 * workloom core 公共入口。
 *
 * 分层约定（ADR-0002）：
 * - src/legacy/ 下的模块是原 Trellis Python 脚本的行为移植，纯 JS（JSDoc 注释）；
 * - 其余模块是新增抽象，用 TypeScript 编写。
 * 本包整体经 tsc 构建发布，不得 import 任何 runtime 包。
 */

/** core 包语义版本（点 1 骨架占位，后续由各模块填充导出）。 */
export const VERSION = '0.0.0'
