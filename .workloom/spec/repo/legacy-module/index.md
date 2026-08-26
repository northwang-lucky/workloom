# repo/legacy-module standards

The core legacy modules are the behavior-port modules.

- layout: `packages/core/src/legacy/` holds pure JS + JSDoc modules that run without a build; new abstractions are TypeScript under `src/service`
- data: field names and defaults keep the established data layout, compatible with existing data files; wording is written fresh
- counter-example: renaming `task.json` fields and breaking existing task directories
