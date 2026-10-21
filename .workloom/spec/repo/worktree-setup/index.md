# repo/worktree-setup standards

Dependency preparation for task worktrees, driven by `packages.<name>.setup`.

- config: `setup` is an ordered string array under a package entry; it runs after worktree creation or reuse, and the first failing command aborts start while the task stays planning
- commands: each command runs as `/bin/sh -c` with cwd at the worktree root, serially in array order; stdout/stderr stream to the host process log and there is no timeout
- placeholders: only `<worktree>` (worktree root) and `<source-checkout>` (that package's repository main checkout: project root for the root layout, the package checkout for sub-repository/submodule layouts) are allowed; config loading rejects every other `<…>` token
- non-interactive: commands must never prompt — a setup command has no interactive owner and a prompt hangs start; pass explicit flags instead of relying on defaults
- idempotent: start re-runs setup on the reuse path after a failure, so every command must tolerate an existing worktree and already-present dependencies
- pnpm: with a warm store run `pnpm install`; for an instant shortcut hard-link the whole tree with `rm -rf <worktree>/node_modules && cp -al <source-checkout>/node_modules <worktree>/node_modules` — the `rm` prefix keeps the recipe idempotent on setup re-runs (a plain `cp -al` nests the copy when the target exists); Turbopack rejects symlinked node_modules, so never use `ln -s`; hard links share inodes with the main checkout, and `pnpm` normally replaces entries instead of rewriting them, so the main checkout stays intact; do not edit files under `node_modules` in place
- redirection: an input redirection followed by another redirection in the same command forms a non-whitelisted `<…>` span (`cmd < in > out` gives `< in >`, `cmd < in 2>&1` gives `< in 2>`) and fails config loading; put every `>` before the `<` (`cmd > out < in`, `cmd 2>&1 < in`) or keep only one redirection
- go: nothing to prepare; the shared module cache serves every worktree
- manual worktrees: worktrees created outside workloom get the same recipe by hand; the tool does not manage them
- failure: a failed command reports the command and exit code, keeps the worktree and branch in place, and a re-run start retries setup after the config is fixed
- counter-example: a setup command waiting for interactive input, or a symlinked node_modules that breaks the bundler
