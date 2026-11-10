# methodology-notes：case-active SKILL.md 方法论摘录（S2 产物，供 S3/S4 模板改写消费）

来源：`packages/core/resources/skills/workloom-case-active/SKILL.md`（删除前摘录）+ 子任务四/八执行轮格式踩坑。
摘录时点：2026-11-10。摘录后原 SKILL.md 随五目录撤除（S5）。

## 一、SR/C 写法

- SR（Static Review）条目 Target 收敛到单文件粒度：`- Target: <file-path>#<symbol-or-whole-file>`，一个 SR 只查一个文件的一个内聚面，不做跨文件泛查。
- Checks 必须可判定：每条 check 是一个能机械回答「是/否」的结构、类型、命名、行为或 spec 符合性检查，不写「代码质量良好」这类不可判定措辞。
- Expected 写可判定的代码性质：结论能对照代码逐字核验（存在性、形状、调用关系、门禁语义），禁止复述需求意图。

## 二、Traceability 映射

- 每个 AC 至少被一条 SR 或一条 C 覆盖；Traceability 表按 AC 编号逐行映射到 `SRn`/`Cn` 列。
- 覆盖不得只挂在一侧：验收口径能用代码检查证实的走 SR，必须运行才能证实的走 C。
- 未覆盖的 AC 是 CASE 缺陷；Coverage 的 Exclusions 只豁免覆盖率统计口径，不豁免 AC 映射。

## 三、证据完整性

- Evidence 写实际观察到的证据与行号锚点（`<file>:<line>` 形态），不复述 Expected 的预期文本。
- 探针（为验证而写的临时脚本/最小复现）源码存 `case-evidence/probes/`，正文只留指路，不内联代码。
- C5 指纹：`codeFingerprint` 经 core 包 `resources/scripts/task-fingerprint.mjs` 计算（包内相对路径表述 `scripts/task-fingerprint.mjs`，勿写仓库绝对路径），64 位十六进制写入 case-result 的 codeBaseline；缺指纹是结果缺陷，执行轮重跑补齐。

## 四、Result Discipline（case-result.md 格式纪律）

- Standard Verification 表的 exit code 单元格写裸 `0`（不带文字修饰）；guards、fail counts、commit 状态等细节进 Evidence 列。
- Coverage 的 Exclusions 表两列都写反引号包裹值：路径列 `` `packages/core/dist/` ``，理由列写短语。
- Overall lines 只写 ` covered/total (pct%) ` 形态（例 `1234/5678 (21.7%)`），不带文字。
- Resolved Findings 与 Open issues 无内容时各写一行 `- none`；全文最后一节必须是 `## Open issues`，干净时正文恰好 `- none`。
- Changed Files 表：File 列反引号路径，Covered/Total 写形态化计数，Uncovered 写行号区间。

## 附：SKILL.md 其余可保留语义（归 workflow 2.2/2.3 口径，本任务不改代码）

- CASE 无用户确认：主会话对照 PRD/PLAN/真实代码评审，满意后直接续接 `case.designSession` 执行（2.2/2.3 现行口径一致）。
- 每次执行生成全新结果，旧结果不复用；CASE 后改再执行须重评审。
- 执行就绪判定：最新 Developer 派发完成 + 主会话确认无剩余实现工作，否则推迟执行。
- P2 自修触发 SR/C/coverage 全量重跑；P0/P1 上报主会话；never force a core CASE failure。
- 失败路径：模型访问失败保留 child/purpose 记录，替换会话须有 fallbackOf 链回溯到 case.designSession。
