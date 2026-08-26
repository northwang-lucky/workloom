---
name: workloom-update-spec
description: Maintain the team coding standards under .workloom/spec/ (add, update, or remove entries); use when the user asks to "update spec", "record a standard", "write down a convention", or when implementation surfaced a convention worth persisting for the team.
---

# Workloom Update Spec

Standards live in `.workloom/spec/<package>/<layer>/index.md` (the injection unit) with optional detail files next to it. This skill maintains that knowledge base.

## When to run

- The user asks to update, record, or remove a team standard.
- Implementation surfaced a convention worth persisting: propose it to the user first, then write it after confirmation.

## Steps

### 1. Place the standard

- **package** — a key declared under `packages` in `.workloom/config.yaml`. If no package fits, tell the user to declare one first, or create a new directory with their confirmation.
- **layer** — the layer inside the package (e.g. `backend`, `frontend`); create it if missing.
- Names allow `[A-Za-z0-9._-]`, starting with a letter or digit.

### 2. Update the index

`index.md` is the injection unit — sessions see only its path. Every standard must be reachable from it:

- short standards live as one line in the index;
- longer standards get a detail file next to the index and a link line in the index, written as `[name](file.md)` or `file.md`.

### 3. Write the detail file (when needed)

One topic per `.md` file:

- first line is the title;
- the body states the standard as decidable criteria — an observer can judge done vs violated.

### 4. Verify the layout

- two-level layout holds (`<package>/<layer>/index.md`);
- every link in the index resolves to an existing file;
- no orphan detail files (each must be referenced by its index);
- package/layer names match the character rules.

## Completion criteria

The index and detail files follow the layout, links resolve, and no detail file is orphaned. No tests run for spec changes.

## Boundaries

- Write only under `.workloom/spec/`.
- Do not edit `workflow.md`, `config.yaml`, or anything under `tasks/`.
