# git primitives (`domain/git.js`)

Decidable criteria for extending `packages/core/src/domain/git.js` with new git primitives.

- no-shell: primitives run via `execFile` with argument arrays, never through a shell
- english-output: the subprocess env pins `LC_ALL=C` so stderr/stdout text is deterministic English; consumers may rely on git wording, host locale must not leak in
- error-shape: failures return `[err, null]` where `err` is the Node `ExecFileException` as-is — a numeric `err.code` is the git exit code and `err.stderr` is the raw stderr; JSDoc of each primitive states which exit codes are expected and what they mean
- boolean-primitives: probes whose exit 0/1 is a business result (`gitIsAncestor`, `gitHasMergeHead`, `gitBranchExists`, `gitCheckRefFormat`) return `[err, boolean]` — exit 1 maps to `false`, never to `err`; only exit >1 or spawn failure produces `err`
- merge-state: classify merge failures with the `MERGE_HEAD` probe (`gitHasMergeHead`), never with the exit code alone (conflict and untracked-overwrite refusal both exit 1, dirty-tracked refusal exits 2); call `gitMergeAbort` only when `gitHasMergeHead` is true (abort without an ongoing merge exits 128)
- absolute-paths: worktree path arguments are passed as absolute paths — `git worktree` resolves relative paths against each repo's own working directory, which is ambiguous for cross-repo (`git -C`) calls
- compat-surface: the return shapes of the pre-existing primitives (`gitAddCommit`, `gitStatusSync`, `gitCurrentBranchSync`, `countDirtyLines`) are frozen; the `err.code`/`err.stderr` consumption convention applies to new primitives only
- counter-example: deciding "merge conflict" from `err.code === 1`; passing a relative worktree path to `gitWorktreeRemove`; treating `gitIsAncestor` exit 1 as an error instead of `false`
