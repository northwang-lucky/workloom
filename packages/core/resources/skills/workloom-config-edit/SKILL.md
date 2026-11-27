---
name: workloom-config-edit
description: Edit workloom config fields in a user project — config.json, config.js, config.local.json, config.local.js — through a five-step discipline and the on-disk field whitelist. Triggers on config field edits (packages, worktree, hooks, subagent_profiles, prompt_injection, executor, archive_auto_commit, coverage); package-structure scanning stays with workloom-packages-scan.
whenToUse: Use when the user asks to change, add, or remove a field in `.workloom/config.json`, `.workloom/config.js`, `.workloom/config.local.json`, or `.workloom/config.local.js` — e.g. "set the worktree cleanup mode", "raise executor concurrency", "change the prompt skip keyword", "配置 config.local.json".
---

# Workloom Config Edit

Edit workloom configuration in the user's project through a fixed five-step discipline. On-disk keys are snake_case; `loadConfig` converts them to the camelCase runtime shape. The [disk field whitelist](#disk-field-whitelist) is the enforcement point for unknown top-level keys, because `loadConfig` ignores them silently.

## Five-step discipline

1. **Read the current state** — read the raw file you will edit (project `.workloom/config.json|js` or local `.workloom/config.local.json|js`) and the merged `loadConfig` result, then name the layer each changed key comes from. *Completion:* the raw file text and the merged result have both been read, and the target layer is identified.
2. **Propose the change** — show the exact fields and values as a diff. Check every top-level key against the [disk field whitelist](#disk-field-whitelist) and reject a key outside it. Check nested shapes as well: `worktree` accepts only `enabled`, `branch_template`, and `cleanup`. *Completion:* every changed key is in the whitelist, every nested shape is legal, and the user can see the exact diff.
3. **Get user confirmation** — present the proposal and wait for explicit agreement. Fold requested corrections into the diff and confirm again when the diff changes. *Completion:* the user has explicitly agreed to the final diff.
4. **Merge and write** — edit only the agreed keys, preserve every other key and its formatting byte-for-byte, replace top-level values in place, and write atomically through a temporary file plus rename. Back up before writing: a committed project config relies on git; otherwise copy the file to a `.bak` beside it. *Completion:* the backup exists and a byte comparison shows no change outside the agreed keys.
5. **Validate with workloom-doctor** — run the `workloom-doctor` command in the target project. Doctor calls `loadConfig`, which fails loud on malformed known fields, and returns a health report. Read the config check in that report. On a config failure, restore the backup and re-run doctor. *Completion:* `workloom-doctor` exits 0 with no config issue; after any failed write the original file is back in place.

## Disk field whitelist

The eight snake_case top-level keys accepted on disk. Authoritative source: `packages/core/src/workspace/config-defaults.ts` (`DEFAULT_CONFIG`) and the field parsing in `packages/core/src/workspace/config-load.ts` (`mergeWithDefaults`).

| Field | Accepted shape |
| --- | --- |
| `packages` | map of name to `{ path, setup?, type?, git? }` |
| `worktree` | `{ enabled?, branch_template?, cleanup? }` |
| `hooks` | `{ after_create?, after_start?, after_finish?, after_archive? }`, each a string array |
| `subagent_profiles` | array of `{ whenMain?, roles }` |
| `prompt_injection` | `{ skip_keyword? }` |
| `executor` | `{ max_concurrent? }` |
| `archive_auto_commit` | boolean |
| `coverage` | `{ threshold?, languages? }` — see [Coverage configuration](#coverage-configuration) |

`loadConfig` silently ignores unknown top-level keys in the project and local layers. Step 2 is the only enforcement point: a key outside the whitelist is rejected before any write. Known keys are shape-checked by `loadConfig`; doctor surfaces those errors.

## Coverage configuration

`coverage.threshold` is an integer from 0 to 100 (default 90). The gate requires incremental coverage to be strictly greater than it. `coverage.languages` maps a language name to `{ format, command? }`; `format` must be one of `go-coverprofile`, `lcov`, `jacoco-xml`, or `cobertura-xml`. Built-in languages need no entry — they fall back to `LANGUAGE_DEFAULTS`. An unknown subfield, an invalid format, or an unknown `<…>` placeholder in `command` is rejected by `loadConfig`.

The only accepted command placeholders are `<worktree>` (task worktree root), `<profile>` (coverage report output path), and `<base-ref>` (baseline branch). Any other token fails validation. For example:

```json
{
  "coverage": {
    "threshold": 80,
    "languages": {
      "go": { "format": "go-coverprofile" },
      "python": { "format": "lcov", "command": "coverage run -m pytest && coverage lcov -o <profile>" }
    }
  }
}
```

The `workloom-packages-scan` skill proposes entries for detected languages with built-in defaults; languages without a default need a manual `format` and `command`.

## Boundaries

- Edit only the project layer (`.workloom/config.json` or `.workloom/config.js`) and the local layer (`.workloom/config.local.json` or `.workloom/config.local.js`). Global config under `$HOME/.workloom/` is out of scope; route it to `workloom-migrate-to-sop`.
- One file per layer. A layer with both `config.json` and `config.js` (or both local variants) already makes `loadConfig` fail loud; treat the existing layout as given and never create the second file.
- A `config.js` file is a factory function. Point the user to edit it by hand; this skill does not rewrite JavaScript config factories.
- Leave source files and git configuration untouched.
- Package-structure scanning, language-stack detection, and `packages` / `coverage.languages` candidate generation belong to `workloom-packages-scan`; this skill takes over for the config edit after the user chooses the fields.
