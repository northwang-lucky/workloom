# repo/deployment standards

Deploying this repo's build artifacts into the DSH web profile.

- install shape: the production profile (`~/.dsh/profiles/web`) depends on `github:northwang-lucky/workloom#path:packages/adapter-dsh`; pnpm-lock pins the commit, and the loop below follows that source shape
- dist committed: `packages/core/dist/` and `packages/adapter-dsh/dist/` are tracked (gitignore negation) so `github:…#path:` subdirectory installs work without a build step; every src change must rebuild and commit dist in the same commit — a stale dist ships stale behavior to git installs
- change loop: edit src → `pnpm -r build` + `pnpm -r typecheck` + the package's `node --test` → commit dist in the same commit → push → run `pnpm update @workloom-ai/adapter-dsh` in the profile directory so the lock repins to the new commit (verified 2026-09-28; replaces the retired `dsh plugin add` reinstall)
- taking effect: adapter-dsh is a host-side bundle read at host boot, so every change needs an instance restart; restart via `dsh-stop --only-ui && dsh-start --only-ui`, owned by the user with fresh per-run authorization — the agent never restarts on its own
- retired paths: the `~/dsh/bin/dsh-sync-workloom` rsync hard-copy and `dsh plugin add` belong to the old flow, and the script no longer exists on this machine; only a hypothetical `file:`-installed profile still needs manual hard-copy sync of `dist/` plus the full `assets/` package, else the next restart fails on missing files
- counter-example: building a new skill asset, committing neither dist nor a lock repin, and the profile loading a stale asset list after restart
