Injection marker: tasks/10-29-review-executor:mvubzo1wowkur3nl

# review 执行器：workflow 1.4 契约正文与插入点事实

Research report for task `tasks/10-29-review-executor`，覆盖任务清单第 8 项。

> 执行契约冲突说明：执行契约要求先读 plan.md，本任务 planning 阶段无 plan.md，
> 以 prd.md 与源码为准（声明一次）。

## 1.4 正文当前是五段式，review 派发指引的自然插入点是 Authoring bar 段之后

契约文件 `packages/assets/workflow/workflow.md` 的 1.4 全文（62-73 行，逐行）：

```md
#### 1.4 Review and start

This step holds the one and only user confirmation before implementation. The review package is assembled once everything is ready: the finalized prd.md (re-run `workloom_task_align` action=review now to pin the current snapshot, hash, and an empty blocker list), the jsonl context lists, and plan.md when the final alignment round chose to author it. Present the package in one message — prd snapshot with its hash, the plan document when present, and the context lists.

Authoring bar for plan.md (applies whenever the plan is authored or revised): every step names its target file path and symbol; every edit carries the exact before/after code, with the before snippet locating uniquely in the file and line numbers only as aids; every new file carries its full content; every step ends with its verification command and expected result; a directive without an anchor ("optimize", "adjust accordingly") is a defect. The full standard and the plan.md document shape live in the workloom-alignment skill's references/plan-authoring.md — read it before authoring.

Run the scale self-check while assembling the package: judge precisely by the actual number of phases in prd.md/plan.md. When the work is large, the package carries a candidate subtask list instead — for each candidate, its title, its scope, and the reason it is a separate deliverable — and the user's confirmation either starts the task or confirms the split (create the subtasks one by one with `workloom_task_create`, each with `parent` set to the main task; every subtask runs the full lifecycle; the main task starts, checks, and archives only after every declared subtask is archived).

Escape hatch: for a large task the user may ask for stage-wise review instead — then confirm the prd first (run action=confirm after that confirmation) and review plan.md in a second pass before start.

On the user's confirmation of the package: run `workloom_task_align` with action=confirm against the reviewed hash (writes the alignment credential), then `workloom_task_start` — the task enters `in_progress`. The start tool is gated: it refuses while prd.md has no H1 title, any prd.md section is still the skeleton placeholder, the alignment credential is missing or stale, or implement.jsonl/check.jsonl hold no real entries; tasks with no spec to reference may pass `force: true` with a non-empty `reason`, and the bypass is recorded in task.json `overrides` for audit.
Completion criteria: `task.json` `status` is `in_progress`; and the user has confirmed the single review package (or the stage-wise passes under the escape hatch).
```

- 段 1（64 行）：审阅包组成 — prd 快照 + hash、jsonl、plan.md。
- 段 2（66 行）：plan.md 规定式写作标准（Authoring bar），并指向
  `references/plan-authoring.md`。
- 段 3（68 行）：规模自检 / 子任务拆分候选。
- 段 4（70 行）：escape hatch（分阶段审阅）。
- 段 5（72 行）：确认 → `action=confirm` → `workloom_task_start`。
- 段 6（73 行）：Completion criteria。

### 插入点建议与理由

| 候选插入点 | 行 | 评价 |
| --- | --- | --- |
| Authoring bar 段之后、规模自检之前 | 66 与 68 之间 | **最佳**：review 的触发条件就是「plan 写完」，紧跟写作标准；不打断「审阅包组成 → 写作 → 派发审查 → 规模自检 → 确认」的因果顺序 |
| 第一段审阅包组成里追加 | 64 | 会让「包里包含审查报告与处置结果」和「何时派发审查」混在一句，句子已经很长 |
| Escape hatch 之后 | 70 与 72 之间 | 离开「plan 写完即派发」的语境，读者要到确认前才看到 |
| Completion criteria 之前 | 72 与 73 之间 | 可行但不如写作标准后自然 |

按 prd 第 2、4 条，要写进正文的指引要素：
默认派发（写完 plan 即派发，对齐轮可显式跳过）、复审循环（主会话修完 plan 后用
`continue_executor` 续接同一 review 子会话，不新开）、上限三轮、到顶剩余发现连同处置说明进 1.4 审阅包
交用户裁决、审查报告与逐条处置结果一起进审阅包。

## 不升协议版本是成立的：版本校验只比对一个常量，正文改动不影响解析

```js
// packages/core/src/domain/protocol.js:13
export const WORKFLOW_PROTOCOL_VERSION = 24
```

```js
// packages/core/src/domain/protocol.js:23-30（版本比对）
  if (contractVersion !== WORKFLOW_PROTOCOL_VERSION) {
    throw new Error(`${VERSION_MISMATCH_PREFIX}: expected …`)
  }
```

- 契约 front-matter `version: 24`（`packages/assets/workflow/workflow.md:2`）与常量一致；
  只在正文加文本、不动 version，解析与校验都不受影响。
- 步骤解析规则：`#### X.X 标题` 起头，任意四级标题终止步骤正文
  （`packages/core/src/domain/workflow-contract.js:40-44`）。在 1.4 段内追加纯文本不会产生新步骤。
- 现有步骤 id 全序被测试固定为 `['1.0','1.1','1.2','1.3','1.4','2.1','2.2','2.3','3.1']`
  （`packages/core/test/contract-asset.test.js:316`），加文本不改 id。

## 固定 1.4 正文的契约测试清单（新增 review 指引句的落点）

| 测试 | 位置 | 固定的内容 |
| --- | --- | --- |
| force 路径必须带 non-empty reason | `contract-asset.test.js:28-36` | 1.4 / 2.2 / 3.1 三段同句（**改 1.4 别删这句**） |
| 1.4 的 H1 门禁措辞 | `contract-asset.test.js:167-169` | `prd.md has no H1 title` |
| plan.md 口径统一 | `contract-asset.test.js:712-723` | 全文不得出现 `design.md` / `implement.md`；必须含 `plan.md` |
| Authoring bar 关键句逐字 | `contract-asset.test.js:724-744` | `Authoring bar for plan.md`、`every step names its target file path and symbol`、`every edit carries the exact before/after code`、`every step ends with its verification command and expected result`、`references/plan-authoring.md` |
| 1.1 的 plan.md authoring 问题 | `contract-asset.test.js:747-764` | `plan.md authoring question`、`A. author the plan / B. author neither`、planning 面包屑 `author plan.md` + `prescriptive authoring bar` |
| 1.1 的 R/AC 编号句 | `contract-asset.test.js:765-783` | `Number Requirements as R1, R2, ...` 等 |
| alignment 技能与 plan-authoring 文案 | `contract-asset.test.js:784-801` | `- **Covers** —`、AC 覆盖判据 |

- 接缝⑤要求「workflow 1.4 的 review 指引句被 contract 测试逐字固定」，落点就是
  `contract-asset.test.js` 新增一条用例（建议紧邻 724-744 的 Authoring bar 用例），
  断言 insert 句的关键片语与顺序要素（触发时机、默认派发与对齐跳过、同子会话续接、
  上限三轮、剩余处置）。
- 契约测试直接读资产文件（`contract-asset.test.js:11-12` 的 `assetPath`），再用
  `parseContract` 取 `contract.steps.find((step) => step.id === '1.4').body` 断言，
  因此只断言 1.4 body 即可，不需要改解析层。
- 1.4 正文里若引用新文件名（`plan-review.md`），注意不要引入 `implement.md` / `design.md`
  子串（否则 712-723 的用例红）。
