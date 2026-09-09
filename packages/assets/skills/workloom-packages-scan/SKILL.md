---
name: workloom-packages-scan
description: Scan a project's package structure and produce a candidate packages list for `.workloom/config.json`. Detects pnpm/npm workspaces, lerna, nx, turbo, go.work, Cargo workspaces, git submodules, and nested git repos.
whenToUse: Use when the user asks to scan packages, initialize or refresh the workloom packages config, or detect workspace layout, git submodules, or nested git repos — e.g. "scan packages", "探测 workspace 结构", "初始化 workloom packages 配置".
---

# Workloom Packages Scan

Scan the project's package structure and write the candidate list into `.workloom/config.json`. The bundled script does the detection; this skill runs it, presents the candidates, and writes them after the user confirms.

## Workflow

1. **Run the scan** — execute `scripts/scan-packages.mjs` against the project root. It returns `{ name: { path, type?, git? } }` and appends a `repo: { path: "." }` root entry (skipped when a scanned package already uses the `repo` name).
2. **Present the candidates** — show the full list with each entry's path, type (`workspace` / `submodule` / `nested-git`), and `git` flag. The user may drop or rename entries.
3. **User confirms** — apply any edits the user requests before writing.
4. **Write `.workloom/config.json`** — merge the confirmed candidates into the `packages` field:
   - existing non-empty `packages` are merged incrementally; existing keys are **not** overwritten.
   - conflicting keys (same name, different path) are **reported, not silently replaced** — the user decides.
   - the `repo` root entry is appended by default; tell the user it can be removed.

## Detection coverage

The script reads workspace manifests directly (pnpm-workspace.yaml, package.json workspaces, lerna, nx, turbo, go.work, Cargo.toml) and expands trailing-`*` (single-level) and `**` (recursive) globs — only directories containing `package.json` are kept as workspace candidates — then `.gitmodules` for submodules, then probes first-level subdirectories not already covered for nested `.git`. It excludes `node_modules`, `dist`, `vendor`, and hidden directories. go.work and Cargo members are trusted as explicit paths and bypass the `package.json` filter. See `scripts/scan-packages.mjs` for the full rule set and `scripts/scan-packages.test.js` for fixture-backed examples.

## Boundaries

- Detection only — this skill does not modify source files or git configuration.
- The `repo` root entry is a convenience default; remove it if the user prefers packages-only config.
