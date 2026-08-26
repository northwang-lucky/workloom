# repo/deployment standards

Deploying this repo's build artifacts into the DSH web profile.

- sync: after `pnpm -r build`, run the rsync section of `~/dsh/bin/dsh-sync-workloom` — core/adapter-dsh `dist/` plus the full `assets/` package
- hard-copy: the profile's `file:` dependencies are hard copies; skipping the sync makes the next dsh restart fail on missing files
- restart: the dshweb restart belongs to the user; never restart it mid-session without confirmation
- check: `--dry-run` first when in doubt about the diff
- counter-example: building a new skill asset, syncing nothing, and the profile loading a stale asset list after restart
