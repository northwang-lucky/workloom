Injection marker: tasks/11-06-simplify-document-confirmations:mw479qr158x9jt9a — 协议冲突声明（只声明一次）：executor 加载协议要求先读 plan.md，但本任务目录 `.workloom/tasks/11-06-simplify-document-confirmations/` 只有 prd.md、task.json、implement.jsonl、check.jsonl，没有 plan.md（已核对），因此以 prd.md + task.json 为事实源继续调研。

# 资产层与双 adapter 的文档确认流程改造影响：代码事实

> 范围：`packages/assets`（workflow、skills、templates、evals、scripts）、`packages/adapter-dsh`（src/dist/test）、`packages/adapter-pi`（src/skills 产物/test）的只读调研；`packages/core` 只记录交界面锚点（由另一份调研覆盖，见第十七节）。
> 格式：每个 `##` 标题即结论；结论锚点为 `path:line`（相对仓库根）；关键代码用围栏代码块；无锚点的判断一律标注 unverified。

## 一、PRD 与 PLAN 的内容确认要拆成两次，而现行主契约把两次压进同一次 1.4 复核包（packages/assets/workflow/workflow.md:41,64,74）

- 现行收敛顺序明确要求 1.1 阶段“不要请用户确认 prd”，唯一确认点在 1.4，且 confirm 需要 `expectedPrdHash`——`packages/assets/workflow/workflow.md:41`。
- 1.4 的复核包把“prd 快照 + hash + plan.md + jsonl”一次呈现，用户一次确认后连续执行 confirm 与 start——`packages/assets/workflow/workflow.md:64`、`packages/assets/workflow/workflow.md:74`。
- 1.4 的“逃生舱”是“先确认 prd，再第二轮复核 plan.md”——`packages/assets/workflow/workflow.md:72`；R3 落地后分阶段确认成为唯一路径，这段逃生舱语义与正文冲突，必须删除或改写。

```text
# packages/assets/workflow/workflow.md:74（节选）
On the user's confirmation of the package: run `workloom_task_align` with action=confirm against the reviewed hash (writes the alignment credential), then `workloom_task_start`
```

需要调整的行为：

| 位置 | 现状 | R3/R5 要求 |
| --- | --- | --- |
| `packages/assets/workflow/workflow.md:41` | 1.1 明令“不得在此确认 prd” | PRD 定稿后执行内容确认，作为进入 1.2 调研与 PLAN 编写的前置 |
| `packages/assets/workflow/workflow.md:64` | 一次复核包含 prd + plan | 拆成“PRD 内容确认”与“PLAN 内容确认”两次，各自只针对文档内容 |
| `packages/assets/workflow/workflow.md:72` | 分阶段确认是例外 | 分阶段即主路径，删掉例外叙述 |
| `packages/assets/workflow/workflow.md:74` | confirm 依赖 reviewed hash | 只记确认时间与文字摘要；start 门禁改为“PRD、PLAN 两次确认都已记录” |
| `packages/assets/workflow/workflow.md:134` | planning 面包屑复述“1.4 单包确认 + 固定 hash” | 面包屑同步为两次内容确认（否则模型同时看到两套互相矛盾的指令） |

- 面包屑与会话上下文直接来自契约文本，改契约即生效，无需改 adapter 代码——`packages/adapter-dsh/src/plugin.ts:149-186`、`packages/adapter-pi/src/inject.ts:76-91`。
- 另有一处易漏：`packages/assets/workflow/workflow.md:163` 的分层加载协议句被 core 测试逐字锚定，改写其他段落时不得动它（见第十七节）。

## 二、CASE 的“用户确认 + caseHash 门禁”贯穿 2.2、2.3 与 norms 段，R4/R8 要求整段改写（packages/assets/workflow/workflow.md:92,94,98,161,162）

- 2.2 要求主会话复核后运行 `workloom_task_case` action=review，把快照与 hash 呈给用户，显式批准后再 confirm；任何后续 CASE 修改都会让旧确认失效——`packages/assets/workflow/workflow.md:92`。
- 2.2 完成判据写死“用户已确认当前 caseHash，`task.json` 记录设计会话与确认”——`packages/assets/workflow/workflow.md:94`。
- 2.3 要求带着“确认过的 caseHash”续接 `purpose: execution`——`packages/assets/workflow/workflow.md:98`。
- norms 段写死“CASE 未确认或 hash 不匹配时拒绝 execution；普通续接只追加确认摘要值”——`packages/assets/workflow/workflow.md:161`。
- core CASE 失败清单含“未确认或过期 CASE”，且不可 force 绕过——`packages/assets/workflow/workflow.md:162`；R4/R8 之后这一项语义也要改成“缺少实际执行结果/会话链断裂”之类，不能再以确认凭证为判据。

```text
# packages/assets/workflow/workflow.md:161（节选）
CASE confirmation gates execution: `workloom_execute` with `purpose: execution` is refused while the CASE is unconfirmed or its current hash no longer matches the confirmed `caseHash`.
```

需要调整的行为：删掉“用户确认”“caseHash”与“确认失效”表述；改成“主会话对照 PRD、PLAN 与实际代码复核 CASE，满意后继续同一 `case.designSession` 执行”；`purpose` 参数本身保留（设计轮与执行轮的区别仍需保留）。

## 三、轻量契约不含任何文档确认或哈希语句，R6 的一致性改造不触及 workflow-light.md（packages/assets/workflow/workflow-light.md:2,19,31,43）

- 全文检索 `packages/assets/workflow/workflow-light.md` 无 `hash`、`caseHash`、`prdHash` 字样（1..56 行逐一核对）。
- 轻量轨固定不做 1.1 alignment、不写 jsonl、不做 CASE，start 门禁只看 prd.md 的 H1/Goal/验收点——`packages/assets/workflow/workflow-light.md:2`、`packages/assets/workflow/workflow-light.md:19`、`packages/assets/workflow/workflow-light.md:31`、`packages/assets/workflow/workflow-light.md:43`。
- 结论：R6 只影响 full 轨的正常流程、补充 CASE、归档重建三处，轻量轨无需改；若主契约步骤集合变化，轻量文件的步骤 id 仍须保持 `1.0/2.1/2.2/2.3/3.1`（被 core 测试锚定，见第十七节）。

## 四、alignment 技能把哈希写进确认协议本体，R1/R2/R3 要求重写收敛协议与完成判据（packages/assets/skills/workloom-alignment/SKILL.md:9,76-83,87,93）

- 开篇把整条链定义成“单次 1.4 用户确认写凭据”——`packages/assets/skills/workloom-alignment/SKILL.md:9`。
- 收敛协议第 3、4、5 步反复出现“返回 SHA-256 hash”“未清空 blocker 不得展示 hash”“此处不确认，唯一确认在 1.4”——`packages/assets/skills/workloom-alignment/SKILL.md:76-78`。
- 第 6 步要求“重新 review 固定当前 hash，再带 `expectedPrdHash` 与 summary 调 confirm，同 hash 重复幂等”——`packages/assets/skills/workloom-alignment/SKILL.md:79`。
- 边界段写明“prd 的用户确认故意不做独立门禁，搭 1.4 单包”——`packages/assets/skills/workloom-alignment/SKILL.md:87`；完成判据同样以“1.4 单次确认后凭据新鲜”收尾——`packages/assets/skills/workloom-alignment/SKILL.md:93`。

需要调整的行为：

| 位置 | 现状 | 目标 |
| --- | --- | --- |
| `packages/assets/skills/workloom-alignment/SKILL.md:76` | review 返回快照与 SHA-256 hash | review 只返回内容诊断（结构问题、内容阻断项、就绪标志） |
| `packages/assets/skills/workloom-alignment/SKILL.md:79` | confirm 传 `expectedPrdHash` | confirm 只传文字摘要；记录只留确认时间 + 摘要 |
| `packages/assets/skills/workloom-alignment/SKILL.md:78,87,93` | PRD 确认搭 1.4 单包 | PRD 定稿即确认，PLAN 复核后再次确认，两次都针对内容 |
| `packages/assets/skills/workloom-alignment/SKILL.md:83` | prd 改动后必须再次向用户重确认 | 用户主动提出的明确变更，该消息即内容确认（R9）；系统发现的阻塞/基线变化仍集中提问 |

- `packages/assets/skills/workloom-alignment/references/plan-authoring.md:3` 与 `packages/assets/skills/workloom-alignment/references/plan-authoring.md:37` 以“1.4-ready / Workflow 1.4's Authoring bar”作为 PLAN 就绪口径；若 PLAN 确认点仍在 1.4，这两句可保留，否则需同步改号（改动属文本层，不必升协议版本）。

## 五、case-active 技能以“用户批准 caseHash”为执行前置，R4/R8 要求改为主会话复核后直接执行（packages/assets/skills/workloom-case-active/SKILL.md:9,27,34-39,45-46）

- 开篇要求“保留用户已确认的 caseHash”——`packages/assets/skills/workloom-case-active/SKILL.md:9`。
- 旧结果复用规则以 `case.caseHash`、RESULT 的 `caseHash`、`resultHash`、`codeFingerprint` 四项相等为条件——`packages/assets/skills/workloom-case-active/SKILL.md:27`；R8 明令不再复用旧结果，这一整条要走删除，而不是只删 hash 字段。
- 复核与确认步骤要求“把快照与 hash 呈给用户，仅在明确批准后 confirm；原始请求或泛化 continue 不算批准；批量时把多个 hash 汇成一个审批包”——`packages/assets/skills/workloom-case-active/SKILL.md:34-39`。
- 执行步骤要求 `purpose: execution` 时携带“确认过的 caseHash”，并在结果里写 `codeFingerprint`——`packages/assets/skills/workloom-case-active/SKILL.md:45-46`。
- 完成判据写死“已复核且经用户确认的 CASE”——`packages/assets/skills/workloom-case-active/SKILL.md:58`。

```text
# packages/assets/skills/workloom-case-active/SKILL.md:36（节选）
For one task, present the snapshot and hash to the user. Call `action: confirm` only after explicit approval of that exact hash.
```

需要调整的行为：复核保留（这是 R4 的核心动作），确认与哈希审批整段删除；执行改为“复核满意后直接续接设计会话”；批量审批包章节（`packages/assets/skills/workloom-case-active/SKILL.md:38` 与 `.workloom/workspace/case-batches/` 文件约定）随之删除；补上“PRD/PLAN 两次内容确认”与正常流程一致的引用。

## 六、case-archived 技能的独立批准与“不复用旧哈希”条要与正常流程同构，R6 要求按 PRD/PLAN 两次内容确认重写（packages/assets/skills/workloom-case-archived/SKILL.md:15,36,38,45,57）

- 边界条写死“Phase 1.4 启动与 CASE 确认都需要新的用户消息批准当前内容或 caseHash”——`packages/assets/skills/workloom-case-archived/SKILL.md:15`。
- 第 3 步要求新建 PRD 时“不得复用旧的 alignment hash”，并跑正常 alignment、等新用户消息批准后再 confirm + start——`packages/assets/skills/workloom-case-archived/SKILL.md:36`、`packages/assets/skills/workloom-case-archived/SKILL.md:38`。
- 第 4 步要求“复核后停下，等新用户消息批准当前 caseHash”——`packages/assets/skills/workloom-case-archived/SKILL.md:45`。
- 完成判据是“经用户批准的 PRD/PLAN 与 CASE”——`packages/assets/skills/workloom-case-archived/SKILL.md:57`。

需要调整的行为：重建任务的入口与正常任务完全同构（R6）——PRD 内容确认一次、PLAN 内容确认一次、CASE 只做主线复核；把“旧 alignment hash 不复用”改写成“不复用历史确认记录”，因为哈希机制整体移除后这句会指向不存在的概念。归档件的原始字节清单（`packages/assets/skills/workloom-case-archived/SKILL.md:23`、`packages/assets/skills/workloom-case-archived/scripts/archived-tasks.mjs:95`）是防篡改证据，不是文档确认，必须保留。

## 七、continue、finish、migrate-plan 三处哈希措辞是旧链路的尾巴，不改会与新规则自相矛盾（packages/assets/skills/workloom-continue/SKILL.md:32-33、packages/assets/skills/workloom-finish/SKILL.md:14、packages/assets/skills/workloom-migrate-plan/SKILL.md:26）

- 路由表写“CASE 待用户复核 → review 后 confirm”“CASE 已确认 → 2.3 执行”——`packages/assets/skills/workloom-continue/SKILL.md:32-33`。
- 收尾第 3 步把“task.json 里已记录的 result hash（`case.result`）”当作归档前置——`packages/assets/skills/workloom-finish/SKILL.md:14`。
- 迁移第 2 步要求“重跑 review、聚焦改动再确认，然后带新 hash 调 confirm”——`packages/assets/skills/workloom-migrate-plan/SKILL.md:26`。

需要调整的行为：continue 改为“review 后直接执行”；finish 删除 result hash 前置（改为“RESULT 与实际执行结果有效”）；migrate-plan 改为“PRD 内容变更后按内容确认规则处理”，用户主动变更一句即确认（R9）。注意 `packages/assets/skills/workloom-finish/SKILL.md:14` 同时受 AC5 影响：若 core 取消 `case.result` 的 resultHash 字段，这句必须同步删。

## 八、R9 在 workflow 与技能里是一处新增 + 三处改写：阻塞集中提问保留，用户主动变更免二次确认（packages/assets/workflow/workflow.md:86,41；packages/assets/skills/workloom-alignment/SKILL.md:83；packages/assets/skills/workloom-migrate-plan/SKILL.md:26）

- 现有的“阻塞项成批交用户决断”句在 2.1 末尾，措辞被 core 测试逐字锚定——`packages/assets/workflow/workflow.md:86`（对应测试 `packages/core/test/contract-asset.test.js:61-70`）。这句保留不动，R9 的“系统发现的阻塞/基线变化仍集中提问”由它承载。
- R9 需要新增的是“用户主动提出明确需求变更时，该消息即视为变更内容确认，主会话同步更新受影响的 PRD 或 PLAN，不再要求二次确认”；落点建议放在 2.3 与 norms 的决策规则段（`packages/assets/workflow/workflow.md:112`、`packages/assets/workflow/workflow.md:145-179` 为现有 norms 结构），属建议，unverified：具体段落位置由实现者定，但必须让 AC6 的文本测试能定位到该句。
- 三处改写点：`packages/assets/workflow/workflow.md:41`（prd 改动后“重新确认”）、`packages/assets/skills/workloom-alignment/SKILL.md:83`、`packages/assets/skills/workloom-migrate-plan/SKILL.md:26`。三处都要区分“用户主动变更”与“系统发现变化”，前者不再向用户二次确认。

## 九、CASE 模板只有 case-result.md 一处哈希字段，case.md 模板无需改动（packages/assets/templates/case-result.md:4）

- `packages/assets/templates/case.md:1-4` 的 front-matter 只有 `version` 与 `task`，全文无 hash 字样（1..67 行核对）。
- `packages/assets/templates/case-result.md:4` 的 `caseHash: <confirmed-case-sha256>` 是唯一需要删除的字段；`codeBaseline` 仍承担当前代码基线记录——`packages/assets/templates/case-result.md:5`。
- 交界面：core 的结果校验当前强制比对 `meta.caseHash` 与 `task.case.caseHash`，并检查 `task.case.result.caseHash`——`packages/core/src/domain/case.js:631`、`packages/core/src/domain/case.js:713-714`。模板删字段前必须由 core 侧同步放宽校验，否则 RESULT 一律判 stale。
- `packages/assets/test/case-templates.test.js:1-17` 只断言起始行与章节名，不涉及 hash，模板改动不会让它转红；该测试不在 `packages/assets/package.json:24` 的 test 脚本里，需要手动 `node --test test/case-templates.test.js`（已实跑通过，1/1）。

## 十、资产评测夹具与断言把“批准 caseHash”写成判定条件，需与技能同步改（packages/assets/skills/workloom-case-active/evals/evals.json:8-73、packages/assets/skills/workloom-case-active/evals/build-fixtures.mjs:75,84；packages/assets/skills/workloom-case-archived/evals/evals.json:8-49；packages/assets/skills/workloom-alignment/evals/evals.json:49-76）

- 夹具在 task.json 里写 `alignment.prdHash` 与 `case.caseHash: null`——`packages/assets/skills/workloom-case-active/evals/build-fixtures.mjs:75`、`packages/assets/skills/workloom-case-active/evals/build-fixtures.mjs:84`；确认字段被移除后这两行会与 schema 校验不一致。
- case-active 五个 eval 的 prompt 与断言大量出现“等用户批准当前 caseHash”“确认的 caseHash 与 CASE 字节一致”“批量含各自 hash”——`packages/assets/skills/workloom-case-active/evals/evals.json:8`、`packages/assets/skills/workloom-case-active/evals/evals.json:23`、`packages/assets/skills/workloom-case-active/evals/evals.json:52-56`、`packages/assets/skills/workloom-case-active/evals/evals.json:66`。
- case-archived 三个场景同样以“批准当前 caseHash”为断言——`packages/assets/skills/workloom-case-archived/evals/evals.json:8`、`packages/assets/skills/workloom-case-archived/evals/evals.json:24`、`packages/assets/skills/workloom-case-archived/evals/evals.json:42`、`packages/assets/skills/workloom-case-archived/evals/evals.json:47`。
- alignment 五个场景以“展示 snapshot 与 hash”“带 `expectedPrdHash` confirm”为判定——`packages/assets/skills/workloom-alignment/evals/evals.json:49`、`packages/assets/skills/workloom-alignment/evals/evals.json:57`、`packages/assets/skills/workloom-alignment/evals/evals.json:61`、`packages/assets/skills/workloom-alignment/evals/evals.json:76`。
- 这些 eval 被 adapter 测试解析并逐条校验（见第十六节），因此“改技能不改 eval”会直接转红。

## 十一、双 adapter 的工具参数只有 align/case 两个 schema 与两处透传需要删参（packages/adapter-dsh/src/tasks.ts:115-137,304,331；packages/adapter-pi/src/tasks.ts:75-87,168,288）

- DSH 侧 align 参数含 `expectedPrdHash`，case 参数含 `expectedCaseHash`，两者都直接引用 core 的参数描述常量：

```ts
// packages/adapter-dsh/src/tasks.ts:113-121
action: { type: 'string', enum: ['review', 'confirm'], description: PARAM_DESCRIPTIONS.action },
taskPath: { type: 'string', description: PARAM_DESCRIPTIONS.taskPath },
expectedPrdHash: {
  type: 'string',
  description: PARAM_DESCRIPTIONS.expectedPrdHash,
},
summary: { type: 'string', description: PARAM_DESCRIPTIONS.alignmentSummary },
```

- 透传点：`packages/adapter-dsh/src/tasks.ts:304`（`expectedPrdHash: stringOf(typed, 'expectedPrdHash')`）与 `packages/adapter-dsh/src/tasks.ts:331`（`expectedCaseHash`）。
- Pi 侧同构：`TASK_ALIGN_PARAMS` 在 `packages/adapter-pi/src/tasks.ts:70-79`、`TASK_CASE_PARAMS` 在 `packages/adapter-pi/src/tasks.ts:82-89`；透传在 `packages/adapter-pi/src/tasks.ts:168` 与 `packages/adapter-pi/src/tasks.ts:288`。
- 参数文案的真正来源是 core 常量，删参必须同时删 core 的 `PARAM_DESCRIPTIONS.expectedPrdHash` / `expectedCaseHash` 与工具描述——`packages/core/src/surface.ts:49-52`、`packages/core/src/surface.ts:74-77`、`packages/core/src/surface.ts:119-134`；core 侧有逐字断言（见第十七节）。
- 两处 `action` 枚举 `review/confirm` 与主会话限制说明一起构成“确认是用户决定”的接口语义：`packages/adapter-dsh/src/tasks.ts:284-297`、`packages/adapter-dsh/src/tasks.ts:313-325`、`packages/adapter-pi/src/tasks.ts:151-152`。CASE 确认退场后，case 工具的 `confirm` 分支与“CASE confirm is a user decision”注释要一并删除；`align` 的 confirm 保留但改为内容确认记录（建议保留 `action=review` 作为内容诊断，unverified：是否把 PLAN 确认并入该工具由实现者定，见第十八节）。
- 两 adapter 都按 `delegationDepthOf` 拒绝子代理调用 align/case（`packages/adapter-dsh/src/tasks.ts:290-298`、`packages/adapter-dsh/src/tasks.ts:319-325`），这是“用户决定”的实现护栏；CASE 退场后 case 工具若只剩 review，这条护栏可以保留也可以放松，属实现选择。

## 十二、两个 adapter 各有一份 stale-alignment 派发门禁与 force 审计，R2 后整段删除（packages/adapter-dsh/src/executor.ts:339-361；packages/adapter-pi/src/executor.ts:446-465,232-252）

- DSH 在每次派发前求值 `evaluateStaleAlignmentGate`，stale 则阻断并提示 force，放行时写 `stale_alignment` override——`packages/adapter-dsh/src/executor.ts:339-361`。
- Pi 同构，且在 `recordForceOverrides` 里聚合三类 override——`packages/adapter-pi/src/executor.ts:446-465`、`packages/adapter-pi/src/executor.ts:232-252`：

```ts
// packages/adapter-pi/src/executor.ts:232-241
export function recordForceOverrides(
  root: string,
  taskRelPath: string,
  input: { conflictForced: boolean; staleMissing: boolean; lightMissing: boolean; reason: string },
): void {
  if (input.conflictForced) {
    recordForcedOverride(root, taskRelPath, input.reason)
  }
  if (input.staleMissing) {
    const [recordErr] = recordGateOverride(root, taskRelPath, GATES.STALE_ALIGN, input.reason)
```

- R2 明确“不再通过文档哈希判断确认是否失效”，因此 `evaluateStaleAlignmentGate` 的存在基础消失；core 侧该门禁与 `GATES.STALE_ALIGN` 定义在 `packages/core/src/domain/task-gates.js:47-48`、`packages/core/src/domain/task-gates.js:271-318`，导出在 `packages/core/src/index.ts:207`。删除时应两侧同批处理，否则 adapter 继续 import 会编译失败（TypeScript 会报未导出符号）。
- 连带影响：两个 adapter 的 `staleMissing` 变量、`recordForceOverrides` 入参、以及 start/check/archive 的 stale 语义（core）一起收敛；adapter 侧至少 4 个 DSH 用例与 3 个 Pi 用例断言该行为（见第十六节）。

## 十三、adapter 侧还有两处 CASE 执行语义文案，必须与 core 新纪律一起改（packages/adapter-dsh/src/executor-schema.ts:63-66；packages/adapter-pi/src/executor.ts:112-116；packages/adapter-pi/src/agent-definitions.ts:54）

- DSH executor schema 的 `purpose` 枚举为 `case-design | execution`，描述取自 core——`packages/adapter-dsh/src/executor-schema.ts:63-66`；Pi 同构——`packages/adapter-pi/src/executor.ts:112-116`、`packages/adapter-pi/src/executor.ts:304-305`。
- 描述文案在 `packages/core/src/surface.ts:136-137`（“execution runs the confirmed CASE”），改文案只需改 core，adapter 自动跟随。
- Pi 的 check 角色 systemPrompt 写着“then execute the confirmed CASE with purpose execution”——`packages/adapter-pi/src/agent-definitions.ts:54`；这是 adapter 自有文案，必须改，否则与 core 新纪律（复核后直接执行）冲突。对应测试只断言 `purpose case-design` / `purpose execution` 存在，不锁 “confirmed”，改词不会转红——`packages/adapter-pi/test/agents.test.ts:47-58`。
- `purpose` 参数本身不要删：设计轮保持 stage、执行轮进入 check，这个区分与确认机制无关（`packages/assets/workflow/workflow.md:160`）。

## 十四、协议版本是资产 front-matter 与 core 常量的双写握手，是否 bump 取决于 #### 步骤集合是否变化（packages/assets/workflow/workflow.md:2；packages/core/src/domain/protocol.js:13；.workloom/spec/repo/workflow/index.md:8）

- 资产版本在 `packages/assets/workflow/workflow.md:2`（当前 25），core 侧常量在 `packages/core/src/domain/protocol.js:13`（当前 25）；比较函数不一致即 fail loud——`packages/core/src/domain/protocol.js:22-29`。
- 两个 adapter 在注册任何副作用前握手：DSH `apply` 首行调用——`packages/adapter-dsh/src/plugin.ts:93-95`，实现——`packages/adapter-dsh/src/plugin.ts:271-281`；Pi 工厂首行调用——`packages/adapter-pi/src/index.ts:29-31`，实现——`packages/adapter-pi/src/index.ts:48-57`。
- 仓规把 bump 条件限定为“states 列表或 `####` 步骤集合/顺序变化”，纯文本增补不 bump——`.workloom/spec/repo/workflow/index.md:8`。

```text
# packages/core/src/domain/protocol.js:12-13
/** 期望的 workflow contract（protocol）版本。 */
export const WORKFLOW_PROTOCOL_VERSION = 25
```

- 本次改造的版本判断（关键）：
  1. 若 PRD 确认与 PLAN 确认都塞进现有 1.1 / 1.4 步骤正文内（只改正文与完成判据），步骤集合不变 → 按仓规**不 bump**，版本保持 25。
  2. 若新增独立步骤（例如 `1.2 Confirm PRD` 并顺延后续编号）或重排 Phase 1 步骤 → 必须同时 bump `packages/assets/workflow/workflow.md:2` 与 `packages/core/src/domain/protocol.js:13` 到 26，并更新步骤 id 断言（见第十七节）。
  3. 两种情况下 adapter 代码都**不需要为版本号改动**：握手是动态比对，改常量即可；但漏改任一侧会同时打红 core 握手测试与 DSH `apply` 测试（`packages/adapter-dsh/test/plugin.test.js:39-47` 走真实资产 + 真实 core）。
- 轻量契约版本独立（`packages/assets/workflow/workflow-light.md:2`，当前 1），不参与握手比对（`packages/adapter-dsh/src/plugin.ts:149-186` 与 `packages/adapter-pi/src/inject.ts:76-91` 只加载、不校验轻量版本）。

## 十五、构建产物两条链路：dist 入库必须重建，adapter-pi/skills 是忽略目录且当前已过期（.gitignore:1-5；packages/adapter-pi/scripts/sync-skills.mjs:28-42）

- `packages/core/dist` 与 `packages/adapter-dsh/dist` 被 gitignore 反向白名单纳入版本库（`.gitignore:1-5`），部署规范要求 src 改动同一 commit 重建并提交 dist——`.workloom/spec/repo/deployment/index.md:6`。
- DSH 的 dist 里确实存在待删参数：`packages/adapter-dsh/dist/tasks.js:84-105`（schema）、`packages/adapter-dsh/dist/tasks.js:258`（align 透传）、`packages/adapter-dsh/dist/tasks.js:282`（case 透传）；共 63 个 dist 文件在版本库内（`git ls-files packages/adapter-dsh/dist`）。
- Pi 的 `skills/` 是构建产物且被 ignore（`packages/adapter-pi/.gitignore:1`），由 `packages/adapter-pi/scripts/sync-skills.mjs:28-42` 的清单从 `packages/assets/skills` 整目录拷贝；`packages/adapter-pi/package.json:17` 的 build 就是它。
- 已实跑的仓库现状证据：`packages/adapter-pi/skills/` 目录缺少 `workloom-case-active`、`workloom-case-archived`、`workloom-migrate-plan` 三项，`bun test test/skills.test.ts` 当前 1 失败（断言 `packages/adapter-pi/test/skills.test.ts:20-38`）。即：**跑 Pi 测试前必须先 `pnpm --filter @workloom-ai/adapter-pi build`**，否则基线就是红的（本次改造与它无关，但会干扰红绿判定）。
- 相应的验证命令（`packages/*/package.json` 与仓规一致）：`pnpm lint`、`pnpm -r typecheck`、`pnpm -r build`；`cd packages/core && node --test 'test/*.test.js'`；`cd packages/adapter-dsh && node --test 'test/*.test.js'`；`cd packages/adapter-pi && bun test test/*.test.ts`（`packages/adapter-dsh/package.json:22`、`packages/adapter-pi/package.json:19`、`packages/core/package.json:21`）。

## 十六、测试红名单：资产 1 个文件、adapter-dsh 5 个文件、adapter-pi 6 个文件受影响，逐条列出锚点与改法

| 包 | 测试锚点 | 现在断言的行为 | 改造后处理 |
| --- | --- | --- | --- |
| assets | `packages/assets/test/case-templates.test.js:1-17` | 模板结构（不含 hash） | 预计仍绿，作为回归确认 |
| adapter-dsh | `packages/adapter-dsh/test/tasks.test.js:78-93` | align schema 含 `expectedPrdHash` | 改成“不再声明该参数”的缺席断言（用完整结构形式） |
| adapter-dsh | `packages/adapter-dsh/test/case.test.js:31-45` | case schema 含 `expectedCaseHash` 与主会话限制 | 删参数断言，保留/调整护栏断言 |
| adapter-dsh | `packages/adapter-dsh/test/case.test.js:47-68` | review 返回 `caseHash: null` | 删除 `caseHash` 字段断言 |
| adapter-dsh | `packages/adapter-dsh/test/case-executor.test.js:30,51` | 夹具写 `caseRecord.caseHash`；增量 prompt 以 `Confirmed CASE hash: ` 开头 | 删字段；改用新的执行轮提示文案断言 |
| adapter-dsh | `packages/adapter-dsh/test/skills.test.js:183` | case-active 正文含 “explicitly approves the current caseHash” | 改成“主会话复核后直接执行”的正面断言 |
| adapter-dsh | `packages/adapter-dsh/test/skills.test.js:204-215` | eval prompt 必须含“初始请求不是批准”“等新消息批准当前 hash” | 删除该纪律断言，改断言“无用户确认步骤” |
| adapter-dsh | `packages/adapter-dsh/test/executor.test.js:2360,2392,2434,2467` | stale alignment 门禁与 `stale_alignment` override | 整组用例删除或改为“哈希不再参与失效判定” |
| adapter-pi | `packages/adapter-pi/test/tasks.test.ts:103-120` | align schema 含 `expectedPrdHash` | 同 DSH |
| adapter-pi | `packages/adapter-pi/test/case.test.ts:55-64` | case schema 含 `expectedCaseHash` | 同 DSH |
| adapter-pi | `packages/adapter-pi/test/case.test.ts:66-91` | review 诊断返回结构 | 去掉 hash 相关断言 |
| adapter-pi | `packages/adapter-pi/test/case-executor.test.ts:27,51` | 夹具 `caseHash` + “Confirmed CASE hash: ”开头 | 同 DSH |
| adapter-pi | `packages/adapter-pi/test/case-executor-forward.test.ts:26,85-86` | 夹具 `caseHash: computeCaseHash(...)` | 删字段 |
| adapter-pi | `packages/adapter-pi/test/executor.test.ts:617,662,693` | `stale_alignment` override 组合 | 整组删除/改写 |
| adapter-pi | `packages/adapter-pi/test/skills.test.ts:20-38` | skills 产物目录清单 | 无需改，但依赖 build（见十五节） |

- 当前基线（已实跑）：`node --test test/tasks.test.js test/case.test.js`（adapter-dsh）11/11 通过；`bun test test/tasks.test.ts test/case.test.ts`（adapter-pi）13/13 通过；`node --test test/case-templates.test.js`（assets）1/1 通过。转红的判定应以此为对照。
- 注意仓规的缺席断言要求：断言“不再包含 X”必须用完整结构形式（如 `expectedPrdHash:` 键 + 描述），不能用裸子串，因为共享文案里可能合法出现该词——`.workloom/spec/repo/code-style/index.md:17`。

## 十七、与 core 的交界面共 9 处，决定资产与 adapter 能否编译、握手与过测（另一份调研覆盖实现，这里只留锚点）

| core 锚点 | 与本报告的关系 |
| --- | --- |
| `packages/core/src/surface.ts:49-52,74-77,119-134` | align/case 工具描述与参数描述的唯一来源；adapter schema 直接引用 |
| `packages/core/src/domain/protocol.js:13` | 协议版本常量，与 `packages/assets/workflow/workflow.md:2` 双写 |
| `packages/core/src/domain/task-gates.js:47-48,271-318` | `evaluateStaleAlignmentGate` 与 `GATES.STALE_ALIGN` 定义；adapter 导入点见第十二节 |
| `packages/core/src/domain/case.js:475-477,631,713-714` | CASE 确认摘要、RESULT `caseHash`、`task.case.result.caseHash` 校验；模板删字段的编译前提 |
| `packages/core/src/domain/executor-context.js:509-516` | execution 轮注入“Confirmed CASE hash”行；adapter 只消费 |
| `packages/core/src/service/case-service.ts:16-33,86-112` | review/confirm 结果结构（`caseHash`、`confirmBlockers`）与 confirm 的 `expectedCaseHash` 必填校验 |
| `packages/core/src/service/alignment-service.ts:71`、`packages/core/src/service/alignment-service.ts:158` | `expectedPrdHash` 参数与校验顺序 |
| `packages/core/test/contract-asset.test.js:26-46,203-236,247-280,281-313,314-323,725-747,804-867` | 逐字锚定 workflow 文本、步骤 id 列表与 CASE 模板结构；改资产必同步 |
| `packages/core/test/protocol.test.js:38` | 握手测试：资产版本必须等于 core 常量 |

- 其中 `packages/core/test/contract-asset.test.js:26-46` 的强约束容易被改写误伤：1.4 / 2.3 / 3.1 正文必须保留“`force: true` with a non-empty `reason`”原句。
- `packages/core/test/contract-asset.test.js:314-323` 把步骤 id 固定为 `['1.0','1.1','1.2','1.3','1.4','2.1','2.2','2.3','2.4','3.1']`；这正是第十四节版本判断的第 2 分支要同步改的那一行。

## 十八、仍需确认的开放问题（阻塞项，均未在源码中找到既成答案）

1. 协议版本是否 bump（第十四节）：取决于 PRD 确认是否新增独立步骤。未决，需实现者先定步骤拓扑再决定 25→26；两侧必须同批改。
2. PLAN 确认记录落在 task.json 的哪个字段：R2 要求“确认时间 + 文字摘要”，但现行 `alignment` 记录只有 PRD 一份（`packages/core/src/domain/task-store.js:905-946`）。建议扩成 PRD/PLAN 两条记录，unverified；该结构属 core，需与 workflow 文本的 start 门禁描述一致。
3. `codeFingerprint` 与 `packages/assets/skills/workloom-case-active/scripts/task-fingerprint.mjs` 的去留：R8 取消“旧结果复用”，该指纹的两项用途（复用判据、结果时效）都失去依据；但 `packages/assets/templates/case-result.md:5` 的 `codeBaseline` 仍记录基线。建议保留指纹作为证据字段、删除其复用判据用途，unverified；若整体删除，需连带删 `packages/assets/skills/workloom-case-active/scripts/task-fingerprint.test.mjs` 与 `packages/assets/skills/workloom-case-archived/SKILL.md:50` 的引用。
4. `workloom_task_case` 工具是否保留：R4 只取消用户确认，主会话仍需要结构诊断（`confirmBlockers` 对 CASE 结构完整性仍有用）。建议保留 `action=review`、删除 `confirm` 与 `expectedCaseHash`，unverified；若整体删除，两 adapter 的注册面与 `packages/assets/workflow/workflow.md:92` 的诊断描述要一起撤。
5. 批量 CASE 流程（`packages/assets/skills/workloom-case-active/SKILL.md:38`、`.workloom/workspace/case-batches/` 约定）在取消用户审批包后是否保留：R4/R6 未提批量入口，unverified；若保留，批量文件只剩执行状态记录，不再有 hash 与审批时间。
6. `packages/assets/skills/workloom-case-archived/evals/build-fixtures.mjs:28` 的 PRD 验收句“Verification: inspect task documents and hashes”属历史夹具文案，改不改不影响机制，unverified 是否顺手清理。
