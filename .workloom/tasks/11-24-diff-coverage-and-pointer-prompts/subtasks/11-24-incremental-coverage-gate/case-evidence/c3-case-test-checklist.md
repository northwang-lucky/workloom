# C3 用例定位清单（case.test.ts，来源 `c2-case-tests.log`）

命令：`cd <WT>/packages/core && node --test test/case.test.ts` → 退出码 0，25 用例全 pass。

| CASE C3 步骤 1 要求 | 实际用例名 | 结果 |
| --- | --- | --- |
| 纯文档变更 + `- Reason:` 非空通过（Exclusions 为空也通过） | 纯文档范围允许 not_applicable，文件缺失或漏审仍拒绝（夹具把 `src/a.js` 全部替换为 `docs/guide.md`，Exclusions 仅剩文档行，RESULT 加 `- Reason: docs only, no executable changes` 后 issues 为 `[]`） | pass |
| 缺 `- Reason:` → `coverage_na_reason` | 同上用例后半段（删除 Reason 行后断言 `coverage_na_reason`） | pass |
| 全部可执行变更文件缺席时 not_applicable 仍硬拒 | not_applicable 零分母时，缺席可执行文件仍硬拒 | pass |
| 非可执行后缀缺席不触发 | 缺席可执行文件硬拒，非可执行后缀缺席不触发 | pass |
| 排除项两处一致才通过且不计入覆盖范围 | RESULT 排除表与规则化 CASE 排除一致时通过且不计入覆盖范围 | pass |

场景级核对（排除全部可执行文件后 not_applicable 加 Reason 通过、RESULT 排除表缺行拒绝、50% 自报 100% 被复算与阈值同时拒绝）由 `c3-not-applicable-probe.log` 承载（6/6 通过）。
