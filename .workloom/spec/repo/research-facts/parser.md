# research-facts parser

The parser contract implemented by `packages/core/src/legacy/research-facts.js` (pure JS + JSDoc, `node --test`).

- input: every `*.md` under `<task>/research/`
- index: sections — title (heading), summary (first paragraph), deduped anchors, conclusions (with their own anchors), code excerpts; empty organizational headings are dropped
- robustness: anchors in the section summary count toward the section anchor index; an unclosed fenced block at end of file is kept as an excerpt; malformed lines never crash the parser
- unverified: a conclusion without anchors is kept with `verified: false`; the pack reports `unverifiedCount`
- files: the pack `files` list is the deduped, sorted set of anchored paths (relative to the task repo root); a path without a line number is not an anchor
- invalidation: the pack is written to `<task>/context/pack.json` keyed by the git rev of the task repo HEAD; a different rev rebuilds the pack
- fallback: without a git environment the rev degrades to the newest research-file mtime — a per-machine invalidation key only
- empty: no research artifacts yield an empty pack (`files: []`, `sections: []`), never an error
- counter-example: dropping an unanchored conclusion to keep the index tidy
