# repo/language standards

Language split for this repository.

- english: everything agent-facing or shipped — workflow assets under `packages/assets/`, runtime text core writes into user projects (breadcrumbs, prd skeletons, jsonl seeds, journal entries, error/warning messages), and all spec content under `.workloom/spec/`
- chinese: project development documents (`AGENTS.md`), commit messages, in-source comments (JSDoc and line comments), and developer-authored task documents under `.workloom/tasks/<task>/` (`prd.md`, `design.md`, `implement.md`, and sibling notes)
- clarification: the `english` rule covers only text core itself generates at runtime (prd skeletons, jsonl seeds, breadcrumbs); once a developer fills in a task document, the filled content follows the `chinese` rule above
- counter-example: a Chinese error message injected into a user's project runtime text
