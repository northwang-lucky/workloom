# repo/architecture standards

Layer and dependency rules for the three packages.

- layering: `core` holds runtime-independent logic, `assets` holds content, adapters hold host projections — see layering.md
- dependency: `core` never depends on `assets`; adapters depend on both and wire text from assets into core functions — see dependency.md
- projection: adapters are thin — they take cwd/context keys, read assets, call core, and hand errors/success to host channels; no business logic of their own
- counter-example: importing `@workloom-ai/assets` from inside `packages/core`
