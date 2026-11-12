---
name: workloom-migrate-to-sop
description: Migrate a legacy .workloom layout to the current structure in place — task directories (date prefixes, nested subtasks), task documents (fixed section skeleton), and config fields (subagent_profiles inner key and executor role keys) via the bundled script.
whenToUse: Use when the user upgrades a project from a legacy workloom version, or when config loading warns or fails about legacy config fields — e.g. "migrate .workloom", "migrate to the new structure", "legacy config field warning".
---

# Workloom Migrate To SOP

Migrate a legacy `.workloom` layout to the current structure, in place, in three blocks: task directories, task documents, and config fields. The config rewrite is mechanical — run the bundled script; the directory and document moves follow the steps below. Record every action in the migration ledger.

## When to use

- The project still carries a legacy `.workloom` layout from an older workloom version (task directories without date prefixes, top-level subtasks, a `workspace/` or `.developer` directory inside `.workloom`).
- Config loading warns about or rejects legacy config fields (the `subagents` inner key, legacy executor role keys) in the project config or the global config (`~/.workloom/config.json`).
- The user asks to migrate or upgrade `.workloom` to the new structure.

## Preconditions

Stop at the first failing check and resolve it before any move.

1. **Clean git workspace (project migration only).** Run `git status --porcelain` in the project root; it must be empty, or commit the pending changes first. This check does not apply to the global config migration — `~/.workloom/config.json` lives outside any repository — but the backup in the next item is mandatory there.
2. **Back up the config file before the rewrite.** Copy the original config next to itself (for example `.workloom/config.json` → `.workloom/config.json.bak`). A project config may rely on git instead of a `.bak` copy only when the pre-migration state is committed; the global config has no git fallback and must get a `.bak` copy.
3. **Dry run first.** Run the config script with `--dry-run` (see [Dry run](#dry-run)) and read the printed plan before any real write.

## Task directory migration

All moves happen in place under `.workloom/tasks/`. Work through the directories one by one.

1. **Date prefix.** Every active task directory name starts with `MM-DD-` (local month and day). Read `createdAt` from `task.json`, convert it to the local date, and rename the directory when the prefix is missing (for example `setup-ci` → `11-10-setup-ci`). When `createdAt` is missing, use the migration day instead and note the fallback in the migration log.
2. **Nested subtasks.** A top-level task directory whose `task.json` has a non-null `parent` field belongs under its parent: move it into `<parent>/subtasks/`, and update the parent's `task.json` `children` array so every recorded child path matches the new location. Nested directories keep their own date prefix.
3. **Legacy `workspace/` directory.** First confirm nothing in the current product still writes into it (the journal capability was removed in workloom-sop, so a workspace holding only old journal files is legacy; any live writer means it is not). When the content is already committed in git, delete the directory outright; when it holds uncommitted content, keep the directory and add an `INERT.md` inside it noting: `legacy workspace kept for reference; not read by workloom-sop`. Record the disposition in the migration ledger.
4. **Legacy `.developer` directory.** Never delete it on your own; removal requires explicit user confirmation. Leave it in place until the user decides.
5. **`.gitignore`.** Lines in `.workloom/.gitignore` that only described the legacy layout may be removed; keep what the current skeleton generates.

## Document format rewrite

Rewrite documents in place; never move content to new files.

1. `prd.md`: reorder the content into the fixed eleven-section skeleton — Context; Goal; Scope; Assumptions, Constraints and Dependencies; Requirements; Acceptance Criteria; Edge Cases and Failure Paths; Risks and Open Questions; Alignment Decisions; References; Notes — keeping the substance of the old sections.
2. Other task documents (`plan.md`, legacy `design.md`, `implement.md`) stay in place; this skill does not rewrite them.
3. Archived tasks are left untouched.

## Config field migration

Run the bundled script against the target config (project or global):

```sh
node <skill-dir>/scripts/migrate-config.mjs .workloom/config.json --dry-run   # preview, writes nothing
node <skill-dir>/scripts/migrate-config.mjs .workloom/config.json            # real run
node <skill-dir>/scripts/migrate-config.mjs ~/.workloom/config.json          # global config
```

The script resolves the role value domain from the core package at runtime and maps mechanically:

- the inner key `subagents` of every `subagent_profiles` entry is renamed to `roles` (for example legacy role keys move over, such as `research` → `researcher`);
- entries without role keys stay without them; no defaults are added;
- unknown role keys or invalid shapes fail loud with a `subagent_profiles[i]...` location and nothing is written;
- an already-migrated config prints `NOOP: config already migrated` and is left byte-identical;
- the real run writes atomically (temporary file plus rename) and reports `Done: migrated <n> profile(s), <m> key(s).`

## Migration ledger

Record every migration action in `.workloom/migration-log.md` (create it when missing), one line per action:

```txt
<ISO timestamp> | <action> | <path> | <result>
```

`action` names the block (`dir-rename`, `subtask-move`, `doc-rewrite`, `config-migrate`, ...); `result` states the outcome (`done`, `noop`, `skipped: <reason>`).

## Re-run after failure

The migration is idempotent and resumable. Already-migrated parts are recognized and skipped (the config script prints `NOOP`; directories and documents only change while they still carry the legacy shape), so after a failure, fix the cause and re-run the checklist from the start — each pass only touches what is still legacy. A failed config rewrite leaves no half-written file (atomic write), and the backup from the Preconditions restores the pre-migration state when needed.

## Dry run

`--dry-run` is the preview mode of the config script: it prints the per-entry plan lines (each rename, or `noop` for entries with nothing to change) and writes nothing — the file stays byte-identical. Run it first, present the plan, then run without the flag to apply.

## Completion checklist

- [ ] `git status --porcelain` was empty (or the pending changes were committed) before the project migration
- [ ] the config backup exists (`.bak` copy, or the pre-migration state is committed)
- [ ] the `--dry-run` plan was reviewed before the real run
- [ ] the config script real run completed; the config loads without legacy-key warnings
- [ ] every active task directory name carries the `MM-DD-` prefix
- [ ] every top-level task with a `parent` moved under `<parent>/subtasks/`, and the parent `children` paths were updated
- [ ] the legacy `workspace/` directory is deleted (content committed) or kept with `INERT.md` inside (uncommitted content)
- [ ] the legacy `.developer` directory disposition was confirmed by the user
- [ ] every active `prd.md` follows the eleven-section skeleton
- [ ] archived tasks are untouched
- [ ] `.workloom/migration-log.md` carries one entry per action
