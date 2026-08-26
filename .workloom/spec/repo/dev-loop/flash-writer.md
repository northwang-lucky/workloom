# flash writer

Dispatch the flash subagent with a complete prompt.

- rule: the dispatch prompt must contain target files, the behavior spec, style requirements (global `~/.dsh/AGENTS.md` plus this repo's spec indexes), and engineering constraints (single write ≤80 lines, split modules over 600 lines, node:test coverage)
- rule: subagents must not run `git restore`/`checkout`/`reset`; commits and rollbacks belong to the main agent
- counter-example: a flash prompt naming no spec and letting the subagent invent interface shapes
