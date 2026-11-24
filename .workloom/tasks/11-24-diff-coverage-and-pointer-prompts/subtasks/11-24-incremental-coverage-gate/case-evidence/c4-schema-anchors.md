# C4 schema 与文案锚点（`grep -n "coverageWaiver"`，终态代码）

## packages/core/src/injection/surface.ts

| 行 | 内容 |
| --- | --- |
| 51 | `TOOL_DESCRIPTIONS.taskCheck`：`...force bypasses and is recorded; the optional coverageWaiver records an approved below-threshold exemption with its reason, bound to the RESULT code fingerprint` |
| 83 | `TOOL_SNIPPETS.taskCheck`：`workloom_task_check(summary?, taskPath?, force?, reason?, coverageWaiver?) — record the 2.3 check pass` |
| 138 | `PARAM_DESCRIPTIONS.coverageWaiver`：`Optional approved below-threshold coverage waiver: an object with a required non-empty reason; the code fingerprint is bound to the RESULT automatically and the waiver is recorded with the check credential` |

## packages/dsh-workloom/src/tooling/tasks.ts

| 行 | 内容 |
| --- | --- |
| 108-115 | check 工具 schema `properties.coverageWaiver`：`type: 'object'`、`description: PARAM_DESCRIPTIONS.coverageWaiver`、`properties.reason`（string，同描述）、`required: ['reason']`、`additionalProperties: false` |
| 317-321 | `coverageWaiverOf(args)`：对象且非数组时提取 `{ reason }`，reason 非字符串给空串交 core 报参数错；否则返回 undefined |
| 367、373 | `checkTaskTool` 经 `coverageWaiverOf` 取值并透传给 `executeCheckTask` |

结论：`surface.ts` 三处命中（描述、签名、参数描述），`tasks.ts` 两类命中（schema、透传），与 CASE C4 步骤 4 期望一致。
