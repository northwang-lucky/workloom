# repo/workflow standards

Main-session task-lifecycle discipline for this repository.

- archive-quiescence: before archiving a task, wait for every in-flight dispatch to settle; a child that finishes after the archive move backfills against the stale pre-move path (warning only, and the record stays `running` frozen at archive time)
- effort-compat: a dispatch's `effort` must be inside the target model's supported range; an unsupported value (e.g. `low` on LongCat-2.0) produces a healthy-looking background receipt and then kills the child at its first model request with `UNSUPPORTED_REASONING_EFFORT`
