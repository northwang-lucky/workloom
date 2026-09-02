# git 封装非 git 目录 stderr 泄漏修复

## Goal

消除 `packages/core/src/legacy/git.js` 在非 git 目录执行时向宿主 stderr 泄漏 git 报错
（"致命错误"），与 T3 对 `research-facts.js` 的静默化保持一致，全链路无噪音。

## Requirements

1. `gitStatusSync`/`gitCurrentBranchSync` 的 `execFileSync` 调用增加
   `stdio: ['ignore', 'pipe', 'ignore']`（stdout 仍 pipe 取输出；stdin/stderr ignore，
   git 失败不再向宿主 stderr 打印），失败语义不变：仍返回 `[err, null]`，调用方仅用
   err 非空判断（不消费 err.stderr，无需保留）。
2. `gitStatus`（异步 execFile 回调版）与 `runGit` 不受影响（其错误经回调返回，无泄漏
   问题，验证即可，不改）。
3. 模块 JSDoc 更新：注明同步查询在非 git 目录静默失败（不向宿主 stderr 输出）。

## Acceptance Criteria

1. 非 git 目录下 `gitStatusSync`/`gitCurrentBranchSync` 返回 `[err, null]` 且
   **捕获的 process.stderr 无任何输出**（添加/复用 T3 式 stderr 捕获测试）。
2. git 仓库（正常/脏/干净）下两者行为不回归（现有 git.test.js 全绿）。
3. `cd packages/core && pnpm run build && node --test test/*.test.js` 全绿；
   `pnpm -r typecheck`、`pnpm lint`、`pnpm -r build` 干净。
4. 改动仅限 `packages/core/src/legacy/git.js` 与其测试；无 commit/push（由主会话提交）。

## Notes

- 参照实现：`9b942d0` 对 `research-facts.js` 的同一修复（stdio 静默 + stderr 捕获测试）。
- 来源：容器任务验收遗留观察 #1（adapter-pi 测试输出可见"致命错误：不是 git 仓库"）。
- 固定 grilling 问题（test-first）判定见 task.json grilling 记录。
