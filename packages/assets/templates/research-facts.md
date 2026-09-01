# <research topic>: code facts

Research report for task `<task-id>`. The implementer consumes this file directly; every conclusion must be anchored.

> Scope: <repos and areas read> — research output is read-only, not an implementation.
> Format: `##` headings with one-sentence takeaways; anchors `path:line` relative to the task repo root; key code in fenced blocks; unverified conclusions stay in the report, marked as such.

## <Section takeaway in one sentence>

| Topic | Fact (with anchor) |
| --- | --- |
| <topic> | <fact> — `path/to/file.go:120-135` |
| <topic> | <fact> — `path/to/file.ts:42` and `path/to/file.ts:88-90` |

- <conclusion> — `path/to/file.go:12`
- <suggestion without a source yet> — unverified: mark it as such

```go
// Key excerpt supporting the conclusion above
func Foo() error
```

## <Second section takeaway in one sentence>

- <conclusion> — `path/to/file.ts:300-310`

## <Final section takeaway in one sentence>

1. <open question, unverified — no anchor>
2. <another open question, unverified — no anchor>
