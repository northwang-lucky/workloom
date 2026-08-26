# repo/code-style standards

Coding principles for this repository.

- lsp: prefer LSP-assisted coding and debugging
- enums: repeated identical strings/numbers must be named enums or constants; no magic values
- comments: concise, plain Chinese comments explain design intent
- size: files over 600 lines split when it does not hurt function
- params: more than 3 parameters become an options object
- errors: error returns use a named tuple with `err` first; more than 1 non-error return becomes a result object
- guards: guard clauses first, error paths before happy paths; no `else` after `return`
- types: type imports always use `import type {}`; no `@ts-ignore`/`@ts-expect-error` except for broken third-party types
- private: functions unused outside their module stay private
- verify: eslint clean (no error/warning, no disables), tsc clean for changed TS, tests green — see verify.md
- subagents: every dispatched subagent gets complete context; no free-reign prompts
