# repo/legacy-module standards

The core legacy modules are the behavior-port modules.

- layout: `packages/core/src/legacy/` holds pure JS + JSDoc modules that run without a build; new abstractions are TypeScript under `src/service`
- data: field names and defaults keep the established data layout, compatible with existing data files; wording is written fresh
- counter-example: renaming `task.json` fields and breaking existing task directories

- migration: data-model migrations need explicit boundaries, an audit trail, and test coverage; migrating a model means writing a new field set with the layout spec below, never silently reinterpreting old fields
- normalize: task.json normalization spreads parsed records and only adds defaults (`alignment: null` etc.); old fields (e.g. `grilling`) pass through untouched as inert history and never feed the new semantics
- legacy fields: never read a legacy field to drive a new gate or remap its values into a new model; keep it readable for audit and leave it in place on write-back
- doctor write-back boundary: doctor `--fix` may write back a normalized record for tasks it actually fixes — the write may add new-field defaults (`alignment: null`) to a legacy archived task while preserving every old field; doctor never rewrites records it did not fix and never auto-migrates legacy tasks
- counter-example: reading `task.grilling` to decide the alignment gate, or renaming `grilling` to `alignment` with a value mapping
