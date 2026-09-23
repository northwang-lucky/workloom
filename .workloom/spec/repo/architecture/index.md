# repo/architecture standards

Layer and dependency rules for the three packages.

- layering: `core` holds runtime-independent logic, `assets` holds content, adapters hold host projections — see layering.md
- dependency: `core` never depends on `assets`; adapters depend on both and wire text from assets into core functions — see dependency.md
- projection: adapters are thin — they take cwd/context keys, read assets, call core, and hand errors/success to host channels; no business logic of their own
- executor voice: core owns the per-kind executor directives (single source, every runtime); adapters keep only the complementary role persona, both updated together when a kind changes — see executor-voice.md
- entry-form: prefer a skill over a slash command for guidance-type agent entries (skills auto-trigger by description, no registration code); commands only when the host must run deterministic orchestration (arg parsing, dedicated input flags) — init/doctor stay commands, continue/finish are skills
- counter-example: importing `@workloom-ai/assets` from inside `packages/core`
