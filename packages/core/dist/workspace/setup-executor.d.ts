/**
 * setup 配置执行器（TypeScript）：执行 package 的 worktree 依赖准备命令。
 *
 * 设计意图：
 * - 命令取自 `config.packages[<pkg>].setup`（缺省空数组 = 零行为），逐条渲染
 *   占位符后以 worktree 根为 cwd 经 `/bin/sh -c` 串行执行；任一失败立即返回
 *   err（worktree 现场保留，重跑 start 走幂等复用路径重新准备）；
 * - `stdio: inherit` 让 stdout/stderr 直达宿主进程日志（长安装命令可见进度）；
 * - 与生命周期编排（worktree-lifecycle）拆分：本模块只负责「命令如何执行」，
 *   何时执行由 lifecycle 决定（创建与幂等复用两条路径都要执行）。
 */
import type { WorkloomConfig } from './config.d.ts';
/** runPackageSetup 入参（对象封装多参数）。 */
export interface RunPackageSetupOptions {
    /** package 名（task.package；命令取自其 setup 列表）。 */
    pkg: string;
    /** 项目配置。 */
    config: WorkloomConfig;
    /** 命令工作目录（worktree 根绝对路径；`<worktree>` 占位符值）。 */
    worktreeAbs: string;
    /** 源检出目录（`<source-checkout>` 占位符值）。 */
    sourceCheckout: string;
}
/**
 * 执行 package 的 worktree 依赖准备命令：命令逐条渲染占位符后串行执行；
 * 任一失败立即返回 err（带命令与码值，指引修 config 后重跑 start）。
 */
export declare function runPackageSetup(options: RunPackageSetupOptions): Promise<Error | null>;
