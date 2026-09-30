/**
 * 初始化 .workloom 骨架。
 * @param {string} root 目标项目根（或根下任意目录）
 * @param {import('./init.d.ts').InitWorkloomParams} [params] 初始化参数
 * @returns {[Error | null, import('./init.d.ts').InitWorkloomResult | null]}
 */
export function initWorkloom(root: string, params?: import("./init.d.ts").InitWorkloomParams): [Error | null, import("./init.d.ts").InitWorkloomResult | null];
