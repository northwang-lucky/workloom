# research-facts format

The output format for research artifacts (`research/*.md`) so the implementer can consume them directly.

- heading: every block starts with a `##` heading whose text is the section takeaway in one sentence
- anchor: every conclusion cites its source as `path:line`, the path relative to the task repo root; a line range is `path:start-end`
- excerpt: key code is quoted in a fenced code block with its language tag when known
- conclusion: a table row (`topic | fact`), a list item, or a paragraph that carries information for the implementer
- unverified: a conclusion without any `path:line` anchor is marked unverified and stays in the report; never drop it
- counter-example: a long prose section with no `##` headings, no anchors, and no code excerpts
