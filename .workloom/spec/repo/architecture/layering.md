# layering

Where each kind of code lives.

- rule: `packages/core/src/legacy/` is pure JS + JSDoc, no build; `packages/core/src/service/` is new TypeScript abstractions; `packages/assets/` is Markdown + YAML content with a thin accessor
- rule: runtime-neutral logic goes to core, content to assets, host mechanics to adapters
- counter-example: putting a DSH-specific command text inside core instead of assets
