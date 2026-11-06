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
import { spawn } from 'node:child_process';
import { errCode, wtErr } from "./worktree-integrate.js";
import { renderSetupCommand } from "./config-defaults.js";
/**
 * 执行 package 的 worktree 依赖准备命令：命令逐条渲染占位符后串行执行；
 * 任一失败立即返回 err（带命令与码值，指引修 config 后重跑 start）。
 */
export async function runPackageSetup(options) {
    const { pkg, config, worktreeAbs, sourceCheckout } = options;
    const commands = config.packages[pkg]?.setup ?? [];
    for (const command of commands) {
        const rendered = renderSetupCommand(command, { worktree: worktreeAbs, sourceCheckout });
        const error = await runSetupCommandOnce(worktreeAbs, rendered);
        if (error !== null) {
            return wtErr(`setup command failed (${errCode(error)}): ${JSON.stringify(rendered)}; ` +
                `worktree ${JSON.stringify(worktreeAbs)} kept for retry — fix packages.${pkg}.setup ` +
                'in .workloom/config.json and re-run start');
        }
    }
    return null;
}
/**
 * 执行单条渲染后的 setup 命令（内部）：`/bin/sh -c`，cwd 为 worktree 根；
 * 失败以退出码或终止信号构造 err，供上层带命令与码值报告。
 */
function runSetupCommandOnce(worktreeAbs, command) {
    return new Promise((done) => {
        const child = spawn('/bin/sh', ['-c', command], { cwd: worktreeAbs, stdio: 'inherit' });
        child.on('error', (error) => done(error));
        child.on('close', (code, signal) => {
            if (code === 0) {
                done(null);
                return;
            }
            done(setupExitError(code, signal));
        });
    });
}
/**
 * 构造 setup 子进程失败错误（内部）：`code` 沿用 execFile 错误形状，供 errCode
 * 统一提取（信号终止时无数字退出码，改用信号名）。
 */
function setupExitError(code, signal) {
    const detail = code !== null ? `exit ${code}` : `terminated by signal ${String(signal)}`;
    return Object.assign(new Error(detail), { code: code ?? String(signal) });
}
//# sourceMappingURL=setup-executor.js.map