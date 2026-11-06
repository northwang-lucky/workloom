---
name: workloom-packages-scan
description: Scan a project's package structure and produce a candidate packages list with worktree setup commands for `.workloom/config.json`. Detects pnpm/npm workspaces, lerna, nx, turbo, go.work, Cargo workspaces, git submodules, and nested git repos.
whenToUse: Use when the user asks to scan packages, initialize or refresh the workloom packages config, or detect workspace layout, git submodules, or nested git repos — e.g. "scan packages", "探测 workspace 结构", "初始化 workloom packages 配置".
---

# Workloom Packages Scan

Scan the project's package structure and write the candidate list into `.workloom/config.json`, including the commands that prepare each package's task worktree. The bundled script detects packages; this skill infers setup recipes, presents both for confirmation, and writes the confirmed config.

## Workflow

1. **Run the scan** — execute `scripts/scan-packages.mjs` against the project root. It returns `{ name: { path, type?, git? } }` and appends a `repo: { path: "." }` root entry (skipped when a scanned package already uses the `repo` name).
2. **Propose setup commands** — inspect the manifests, lockfiles, `packageManager` fields, existing dependency directories, and relevant project instructions. Add a `setup` string array to every new candidate, following [Setup configuration](#setup-configuration). Use `[]` when no preparation is needed.
3. **Present the candidates** — show each entry's path, type (`workspace` / `submodule` / `nested-git`), `git` flag, and proposed `setup`. Briefly state the evidence for each non-empty recipe and flag any uncertain choice. The user may drop or rename entries and edit the commands.
4. **User confirms** — apply the requested package and setup edits. Resolve uncertain recipes during this confirmation instead of writing guessed commands.
5. **Write `.workloom/config.json`** — merge the confirmed candidates into the `packages` field:
   - existing non-empty `packages` are merged incrementally; existing keys, including their `setup`, are **not** overwritten.
   - conflicting keys (same name, different path) are **reported, not silently replaced** — the user decides.
   - the `repo` root entry is appended by default; tell the user it can be removed.

## Setup configuration

`packages.<name>.setup` is an ordered array of shell commands. Workloom runs it after creating or reusing that package's task worktree; an omitted field and `[]` both mean no setup. For example, two pnpm workspace entries can share the root install recipe:

```json
{
  "packages": {
    "web": {
      "path": "apps/web",
      "type": "workspace",
      "setup": ["pnpm install"]
    },
    "repo": {
      "path": ".",
      "setup": ["pnpm install"]
    }
  }
}
```

### Execution rules

- Commands run serially in array order through `/bin/sh -c`, with the worktree root as the current directory. The first failure aborts task start and leaves the task in planning.
- Use non-interactive, idempotent commands with explicit flags where needed. Setup has no interactive owner and runs again when a worktree is reused or a failed start is retried.
- The only supported placeholders are `<worktree>` (the worktree root) and `<source-checkout>` (the main checkout of the package's repository). For a root repository, the source checkout is the project root; for a submodule or nested repository, it is that package's checkout.
- Config loading rejects every other `<…>` token. When a command uses both input and output redirection, put output and error redirection before input redirection so the shell syntax is not parsed as an unsupported placeholder.

### Choosing recipes

- Base each recipe on the repository that owns the package. For workspace members, use the root manifest and lockfile, and run installation from the worktree root rather than changing into each member directory. Members that need the workspace dependencies can share the same root recipe.
- For pnpm, use `pnpm install` with a warm store. When the source checkout already has `node_modules`, a fast alternative is `rm -rf <worktree>/node_modules && cp -al <source-checkout>/node_modules <worktree>/node_modules`. Keep the `rm` prefix so reruns do not nest the copy, and use hard links rather than symlinks because Turbopack rejects symlinked `node_modules`.
- For npm with a root `package-lock.json`, use `npm ci`. For another JavaScript package manager, choose the non-interactive, lockfile-respecting install command supported by the detected version.
- For Go, normally use `[]`; the shared module cache serves every worktree. For other ecosystems, use `[]` unless project files show that dependency fetching, code generation, or another preparation step is required.
- Add project-specific bootstrap or generation commands only when repository evidence shows they are required, and run them after dependency installation.

## Detection coverage

The script reads workspace manifests directly (pnpm-workspace.yaml, package.json workspaces, lerna, nx, turbo, go.work, Cargo.toml) and expands trailing-`*` (single-level) and `**` (recursive) globs — only directories containing `package.json` are kept as workspace candidates — then `.gitmodules` for submodules, then probes first-level subdirectories not already covered for nested `.git`. It excludes `node_modules`, `dist`, `vendor`, and hidden directories. go.work and Cargo members are trusted as explicit paths and bypass the `package.json` filter. See `scripts/scan-packages.mjs` for the full rule set and `scripts/scan-packages.test.js` for fixture-backed examples.

## Boundaries

- This skill modifies only `.workloom/config.json`; it leaves source files and git configuration unchanged.
- The `repo` root entry is a convenience default; remove it if the user prefers packages-only config.
