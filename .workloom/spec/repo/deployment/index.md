# repo/deployment standards

Deploying this repo's build artifacts into the DSH web profile.

- dist committed: `packages/core/dist/` and `packages/adapter-dsh/dist/` are tracked (gitignore negation) so `github:…#path:` subdirectory installs work without a build step; every src change must rebuild and commit dist in the same commit — a stale dist ships stale behavior to git installs
- sync: after `pnpm -r build`, run the rsync section of `~/dsh/bin/dsh-sync-workloom` — core/adapter-dsh `dist/` plus the full `assets/` package (only needed for `file:`-installed profiles; git-installed profiles instead re-run `dsh plugin add` after the push)
- hard-copy: `file:` dependencies are hard copies; skipping the sync makes the next dsh restart fail on missing files
- restart: the dshweb restart belongs to the user; never restart it mid-session without confirmation
- check: `--dry-run` first when in doubt about the diff
- counter-example: building a new skill asset, syncing nothing, and the profile loading a stale asset list after restart
