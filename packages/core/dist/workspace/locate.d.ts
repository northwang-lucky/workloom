/** 资产目录名（本项目的唯一项目内目录）。 */
export const WORKLOOM_DIR: '.workloom'

/** locate 模块的公共类型（typecheck 时本文件遮蔽同目录 JS，须与 locate.js 导出面保持一致）。 */
export interface LocateOptions {
  /** 家目录边界（缺省取 os.homedir()）；到达该目录即停止查找。 */
  homeDir?: string
}

/** 向上查找资产目录根；到家目录边界停止，未找到返回 null。 */
export function findWorkloomRoot(startDir?: string, options?: LocateOptions): { root: string } | null

/** 拼出项目根下资产目录内的绝对路径（防越界：目标必须落在根内）。 */
export function insideWorkloom(root: string, rel: string): string
