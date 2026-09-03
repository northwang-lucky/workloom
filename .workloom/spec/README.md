# workloom spec

Team coding standards live here, organized as `<package>/<layer>/index.md`.

## Layout

- `spec/<package>/<layer>/index.md` is the injection unit: its path enters the
  session-context guidelines list at session start; the agent reads files on demand.
- Detail files (`*.md`) sit next to their `index.md`; the index links to them.

## Scope

- `packages` in `.workloom/config.json|js` declares which packages get injected.
  When it is empty, every `<package>/<layer>/index.md` is collected.

## Minimal example

```md
# cli backend standards

- errors: return named tuples, error first — see error-handling.md
```

## Maintenance

Update standards with the `workloom-update-spec` skill: add the entry to the
index first, then write the detail file; every detail file must be referenced
by its index.
