# repo/code-style standards

Coding principles for this repository.

- lsp: prefer LSP-assisted coding and debugging
- enums: repeated identical strings/numbers must be named enums or constants; no magic values
- comments: concise, plain Chinese comments explain design intent
- size: files over 600 lines split when it does not hurt function
- params: more than 3 parameters become an options object
- errors: error returns use a named tuple with `err` first; more than 1 non-error return becomes a result object
- guards: guard clauses first, error paths before happy paths; no `else` after `return`
- concurrency: no await gap between a gate check and the guarded action; slot occupancy follows resource semantics, not entity lifecycle — see concurrency.md
- types: type imports always use `import type {}`; no `@ts-ignore`/`@ts-expect-error` except for broken third-party types
- private: functions unused outside their module stay private
- verify: eslint clean (no error/warning, no disables), tsc clean for changed TS, tests green — see verify.md
- subagents: every dispatched subagent gets complete context; no free-reign prompts
- absence-assertions: a "must not contain X" assertion on injected or generated text uses the full structural form (task path, pointer-line format), never the bare substring — shared copy (discipline sentences, templates) may legitimately contain it; in rename-style red-green tasks the red-phase verification covers the post-build combination too, not just the red-moment state
- red-green-expectations: derive the expected red/green list of a rename or copy-change task from every consumer of the touched constant/fixture (grep the constant name, list and classify each consumer), never from the assertion sites of the replaced text alone — a missed consumer is a missed red-list entry, and the same fixture consumed under different gate modes (light vs full) turns red or green per consumer, not per fixture
