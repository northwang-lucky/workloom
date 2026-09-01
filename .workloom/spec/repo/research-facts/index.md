# repo/research-facts standards

Research output format and context-pack contract: `research/*.md` feeds the implementer through a parsed anchor index.

- format: structured research blocks — `##` heading with one-sentence takeaway, every conclusion anchored as `path:line` (relative to the task repo root), key code in fenced excerpts — see format.md
- parser: `packages/core/src/legacy/research-facts.js` parses `research/*.md` into an anchor index; unparseable conclusions are marked unverified, never dropped — see parser.md
- template: `packages/assets/templates/research-facts.md` is the canonical output shape for research agents
