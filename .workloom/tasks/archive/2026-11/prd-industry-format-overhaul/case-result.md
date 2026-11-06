---
version: 1
task: tasks/11-06-prd-industry-format-overhaul
caseHash: 7118485c6a37eb890a73a23b30aba136b4d49f9653e87004f8d58371e2de04a4
codeBaseline: workloom/11-06-prd-industry-format-overhaul @ 32bdbed codeFingerprint=b60cbda802e2b86b0c55f8e322beedd330343795219367c547bbb7a8eed1e806
checkSession: 3aae4e90-8ea3-46c0-8476-549297f991d8
status: passed
startedAt: 2026-11-06T06:43:48.337Z
completedAt: 2026-11-06T07:25:07.000Z
---

# CASE Result: 调研并升级 workloom PRD 格式

## Summary

- Static review: `17/17`
- Runtime cases: `9/9; blocked: 0`
- Coverage: `generated`
- Standard verification: `passed`
- Re-run record: `2026-11-06T07:13–07:19Z 主会话删除真实 PRD 残留标记行后执行完整复查：SR1–SR17 与 C1–C9 全部复现，无标记 PRD 结构检查零问题，历史夹具确认仅作 legacy 输入且生产 src 零引用`

## Static Review Results

### SR1 PRD 骨架常量与结构检查

- Status: `passed`
- Evidence: `case-evidence/sr-review.txt`（PRD_SECTIONS 十一小节顺序、九个问题码、inspectPrdStructure 的中英文冒号与验证方法词表、零 open-node 残留）
- Findings: `none`

### SR2 task-gates 手写类型声明同步

- Status: `passed`
- Evidence: `case-evidence/sr-review.txt`（PrdSection、PrdStructureCode 值域与实现一致，无 open-node 成员）
- Findings: `none`

### SR3 PRD 骨架单一来源生成

- Status: `passed`
- Evidence: `case-evidence/sr-review.txt`（buildPrdContent 按 PRD_SECTIONS 生成，createTask 单一调用点）
- Findings: `none`

### SR4 开放节点 domain 实现删除

- Status: `passed`
- Evidence: `case-evidence/sr-review.txt`（alignment.js 无 OPEN_NODE_MARKER/正则/findOpenNodeState）
- Findings: `none`

### SR5 alignment 手写类型声明删除

- Status: `passed`
- Evidence: `case-evidence/sr-review.txt`（alignment.d.ts 无 OpenNodeState/findOpenNodeState）
- Findings: `none`

### SR6 对齐服务结果结构收敛

- Status: `passed`
- Evidence: `case-evidence/sr-review.txt`（review 结果无 openNodeState；target=prd/plan 双分支确认与顺序前置保留）
- Findings: `none`

### SR7 公开导出面收敛

- Status: `passed`
- Evidence: `case-evidence/c4-no-marker.txt` 步骤7（dist 动态导入无两个旧导出）
- Findings: `none`

### SR8 doctor 文档完整性投影

- Status: `passed`
- Evidence: `case-evidence/sr-review.txt`（检查⑦提示列出十一小节，无 R/AC 投影、无 open-node 字样）
- Findings: `packages/core/src/service/doctor-check-rules.ts:362 观察项（非缺陷）：提示文案小节枚举用无逗号连写，与机器校验标题的逗号形态并存，系散文列举避免分隔符歧义的取舍，校验名一致`

### SR9 workflow 契约叙述规则

- Status: `passed`
- Evidence: `case-evidence/sr-review.txt`（固定小节与每节用途、反流水账规则、无标记、版本 25、步骤标题集合与 main 一致）
- Findings: `none`

### SR10 轻量流程文本收敛

- Status: `passed`
- Evidence: `case-evidence/sr-review.txt`（workflow-light.md 零 open-nodes 引用）
- Findings: `none`

### SR11 alignment 技能正文重写

- Status: `passed`
- Evidence: `case-evidence/c5-narrative-evals.txt`（fixed section set、按能力组织、反流水账句齐备，无标记）
- Findings: `none`

### SR12 叙述质量对照评测定义

- Status: `passed`
- Evidence: `case-evidence/c5-narrative-evals.txt`（两场景各 4 条英文断言，方向正确）
- Findings: `none`

### SR13 迁移技能重写指引

- Status: `passed`
- Evidence: `case-evidence/sr-review.txt`（两处 open-nodes 字样均为否定式声明，重写语义合规）
- Findings: `none`

### SR14 资产契约测试更新

- Status: `passed`
- Evidence: `case-evidence/sr-review.txt`（仅存否定式标记断言，questioning/merged/batch 文本保留，叙述断言新增）
- Findings: `none`

### SR15 DSH 技能测试更新

- Status: `passed`
- Evidence: `case-evidence/c5-narrative-evals.txt`（17 pass；本轮补强叙述场景与 CJK 断言后验证）
- Findings: `none`

### SR16 Pi 技能测试与构建副本

- Status: `passed`
- Evidence: `case-evidence/c7-adapters.txt`（5 pass；本轮补强同步产物新格式断言后验证，副本与 assets 一致）
- Findings: `none`

### SR17 ESLint 全局忽略与归档不可变边界

- Status: `passed`
- Evidence: `case-evidence/sr-review.txt` 与 `case-evidence/c8-verification.txt` 步骤1（ignores 含 .workloom/**，既有忽略保留，lint 前后归档零字节变化）
- Findings: `none`

## Runtime Results

### C1 红阶段：实施前基线上新测试先失败

- Status: `passed`
- Executed at: `2026-11-06T07:14:51.000Z`
- Actions:
  1. `git worktree add --detach /tmp/wl-prd-red b3a2875` + 四处 node_modules 软链
  2. 基线树自带旧 dist（与源码同提交），复制 10 个 core 测试与双 adapter 技能测试后分别运行
- Observed: core exit=1（缺 prd_ac_verification_missing 等能力）、dsh exit=1（narrative coherent case must exist + 标记断言）、pi exit=1（新格式口径测试失败）——三条均指向缺失能力而非环境错误；两轮执行均复现
- Evidence:
  - `case-evidence/c1-red.txt`
- Findings: `none`

### C2 十一小节模板真实创建与占位判定

- Status: `passed`
- Executed at: `2026-11-06T06:52:41.000Z`
- Actions:
  1. 临时项目根（worktree.enabled=false）调用 dist createTask 创建 full 与 light 任务
- Observed: full 与 light 骨架除 H1 外逐字节一致；11 个小节顺序与常量一致；结构问题恰 11 条 prd_section_placeholder
- Evidence:
  - `case-evidence/c2-c3.txt`
- Findings: `none`

### C3 R/AC 编号、引用与验证方法格式

- Status: `passed`
- Executed at: `2026-11-06T06:52:41.000Z`
- Actions:
  1. 六类缺陷变体 + 英文/中文冒号合法样本逐一调用 inspectPrdStructure 与 evaluateStartGate
  2. 五字段协议 PLAN 夹具的 Covers 全覆盖与缺失对照
- Observed: 六个变体各自命中目标问题码且 start 门禁拦截；两种冒号与三种验证标识零问题；Covers 全覆盖零问题、缺失报 plan_ac_missing
- Evidence:
  - `case-evidence/c2-c3.txt`
- Findings: `none`

### C4 无开放节点标记的 review/confirm/start 全链路

- Status: `passed`
- Executed at: `2026-11-06T07:15:05.000Z`
- Actions:
  1. 临时 full 任务写入真实新格式 PRD（主会话删除残留标记行后全文无独立 HTML 注释）+ 合法 PLAN + 双 jsonl 有效记录
  2. review → target=prd confirm → target=plan review/confirm → startTask
  3. none/pending 标记惰性验证、dist 动态导入、src/assets 残留 grep 逐条分类
- Observed: review readyToConfirm=true 且结果无 openNodeState；双确认后 start 成功转 in_progress；标记惰性、运行时代码零残留；assets 4 处命中均为否定声明或 legacy 夹具输入（生产 src 无引用）；两轮执行均复现
- Evidence:
  - `case-evidence/c4-no-marker.txt`
- Findings: assets 两个 case-* 评测夹具生成器嵌入的标记文本为 legacy 任务的历史输入（主会话已记录保留理由）；生产 src 无任何对夹具生成器的引用，无标记 PRD 结构检查零问题

### C5 叙述质量对照评测

- Status: `passed`
- Executed at: `2026-11-06T07:15:15.000Z`
- Actions:
  1. 解析 evals.json 断言两场景 id、英文断言与方向
  2. 运行 contract-asset 与 adapter-dsh 技能测试
- Observed: log 场景覆盖问答堆叠/重复摘要/逐轮答复三类问题；coherent 场景按能力组织被接受；两条命令 exit 0
- Evidence:
  - `case-evidence/c5-narrative-evals.txt`
- Findings: `none`

### C6 轻量、旧 planning 与归档边界

- Status: `passed`
- Executed at: `2026-11-06T07:15:16.000Z`
- Actions:
  1. 轻量任务 H1+Goal 门禁正反验证
  2. 旧四小节 planning 任务 review 拒绝 + sha256 前后比对
  3. 直接构造已归档任务夹具（不调用 archiveTask），doctor 只读运行 + 目录清单逐字节比对
- Observed: 轻量只查 H1 与 Goal；旧 planning 被拒且字节不变、无 open-node 问题码；归档夹具 doctor（29 条 issue，无 fix）运行后零字节变化
- Evidence:
  - `case-evidence/c6-boundaries.txt`
- Findings: `none`

### C7 双 adapter 一致

- Status: `passed`
- Executed at: `2026-11-06T07:15:28.000Z`
- Actions:
  1. `pnpm --filter @workloom-ai/adapter-dsh --filter @workloom-ai/adapter-pi build`
  2. 两包技能测试 + Pi 副本核对 + DSH dist 与 src 清单比对
- Observed: build exit 0；dsh 17 pass、pi 5 pass；Pi 副本无 open-nodes；dist 与 src 各 11 条资产清单一致
- Evidence:
  - `case-evidence/c7-adapters.txt`
- Findings: `none`

### C8 标准验证与真实新格式样本

- Status: `passed`
- Executed at: `2026-11-06T07:15:46.000Z`
- Actions:
  1. 归档清单 + `pnpm lint` + `pnpm -r typecheck` + `pnpm -r build`
  2. 三包全量测试（Pi 因 bun 不展开引号 glob 改用 shell 展开等价命令 `bun test test/*.test.ts`）
  3. 真实 PRD/PLAN 只读结构检查（含"无独立标记行"断言）+ sha256 前后比对
  4. 38 个实际变更文件代入 inspectCaseStructure 复核
  5. 残留 grep 与禁止性表述核对
  6. dist 两次构建哈希比对
- Observed: 全部 exit 0（core/dsh/pi 分别全绿）；真实样本零问题、无独立标记行且字节不变；38 个变更零未审问题；两次构建 dist 哈希一致；lint 前后归档零变化；两轮执行均复现
- Evidence:
  - `case-evidence/c8-verification.txt`
- Findings: `none`

### C9 覆盖率采集与适用文件集合

- Status: `passed`
- Executed at: `2026-11-06T07:18:18.000Z`
- Actions:
  1. 按 CASE Aggregate command 运行 core 全量测试 LCOV 采集与合并脚本（复查轮共采集三次）
- Observed: 合并后恰 5 条 SF 记录；稳定轮总覆盖 3323/3532（94.1%），各文件均大于 0；无 dist/测试/资产混入；三次采集为 94.1% → 86.9%（并行归因偶发缺失，exit 0、stderr 干净）→ 94.1%（与首轮逐文件一致），产物取稳定轮
- Evidence:
  - `case-evidence/c9-coverage.txt`
  - `coverage/lcov.info`
  - `coverage/summary.txt`
- Findings: coverage/core-test.log 为 0 字节（stderr 在全绿运行下为空），测试运行主记录为 lcov-core.info；提交后门禁按 SR 声明集合回退，覆盖表纳入未修改的 task-store.js（真实行覆盖数据取自原始 lcov，非重采集）

## Coverage

- Status: `generated`
- Tool: `Node v24.18.1 内置覆盖率（--experimental-test-coverage --test-reporter=lcov --enable-source-maps）`
- Command: `见 CASE Aggregate command：core 全量测试 LCOV 采集 + merge-lcov.mjs 按 Scope 合并；task-store.js 实际未变更，但提交后门禁按 SR 声明集合回退，因此最终结果表纳入其真实行覆盖数据`
- Overall lines: `3323/3532 (94.1%)`
- Raw reports:
  - `coverage/lcov-core.info`
  - `coverage/lcov.info`
  - `coverage/summary.txt`

### Changed Files

| File | Covered/Total | Line coverage | Uncovered lines | Details |
| --- | --- | --- | --- | --- |
| `packages/core/src/domain/alignment.js` | `41/41` | `100.0%` | `none` | `coverage/lcov.info` |
| `packages/core/src/domain/task-gates.js` | `837/844` | `99.2%` | `662-663,665-667,670-671` | `coverage/lcov.info` |
| `packages/core/src/domain/task-store.js` | `1507/1639` | `91.9%` | `193-194,208-209,318-319,324-328,330-331,541-542,564-567,638-647,753-766,824-828,1086-1094,1115-1116,1175-1176,1204-1205,1207-1208,1210-1213,1216-1217,1254-1255,1269-1275,1280-1281,1286-1290,1294-1295,1299-1300,1302-1303,1332-1336,1396-1397,1524-1550,1581-1582,1631-1633` | `coverage/lcov.info` |
| `packages/core/src/service/alignment-service.ts` | `323/335` | `96.4%` | `142-143,208-209,221-222,247-248,296-297,313-314` | `coverage/lcov.info` |
| `packages/core/src/service/doctor-check-rules.ts` | `615/673` | `91.4%` | `102-113,395-408,440-441,474-485,565-578,617-618,655-656` | `coverage/lcov.info` |

### Exclusions

| Path | Reason |
| --- | --- |
| `eslint.config.js` | `根 ESLint 平面配置，无独立测试可注入；由 SR17 与 C8 的 pnpm lint 运行验证覆盖` |
| `packages/core/src/domain/task-gates.d.ts` | `手写类型声明，无运行时行为；由 SR2 与 typecheck 覆盖` |
| `packages/core/src/domain/alignment.d.ts` | `手写类型声明，无运行时行为；由 SR5 与 typecheck 覆盖` |
| `packages/core/src/index.ts` | `仅删除公开导出，无分支逻辑；由 SR7 与 C4 的动态导入断言覆盖` |
| `packages/core/test/` | `测试代码，由 C1 红阶段与 C8 全量运行覆盖；contract-asset.test.js 另有 SR14 直接审查` |
| `packages/core/dist/` | `tsc 构建产物，由 C8 两次构建比对校验` |
| `packages/assets/workflow/` | `Markdown 运行指引，由 SR9/SR10 与 C4/C5 文本断言覆盖` |
| `packages/assets/skills/workloom-alignment/` | `技能正文与评测定义，由 SR11/SR12、C5 与资产测试覆盖` |
| `packages/assets/skills/workloom-migrate-plan/SKILL.md` | `Markdown 运行指引，由 SR13 与资产测试覆盖` |
| `packages/adapter-dsh/test/` | `测试代码，由 C1/C7/C8 覆盖；skills.test.js 另有 SR15 直接审查` |
| `packages/adapter-pi/test/` | `测试代码，由 C1/C7/C8 覆盖；skills.test.ts 另有 SR16 直接审查` |
| `packages/adapter-dsh/dist/` | `构建产物，由 C7/C8 校验` |
| `packages/adapter-pi/skills/` | `gitignore 的构建副本，由 C7 校验` |

### Collection Failure

`none`

## Standard Verification

| Command | Exit code | Evidence |
| --- | --- | --- |
| `pnpm lint` | `0` | `case-evidence/c8-verification.txt` |
| `pnpm -r typecheck` | `0` | `case-evidence/c8-verification.txt` |
| `pnpm -r build` | `0` | `case-evidence/c8-verification.txt` |
| `node --test 'test/*.test.js'`（packages/core） | `0` | `case-evidence/c8-verification.txt` |
| `node --test 'test/*.test.js'`（packages/adapter-dsh） | `0` | `case-evidence/c8-verification.txt` |
| `bun test test/*.test.ts`（packages/adapter-pi，shell 展开等价命令） | `0` | `case-evidence/c8-verification.txt` |

## Resolved Findings

- `packages/adapter-pi/test/skills.test.ts:64 [P2] 缺同步产物新格式断言（SR16 口径）— fixed: 新增"skills 同步产物携带 PRD 新格式口径"测试：固定小节句、按能力组织句、反流水账句、无标记、叙述评测场景 id`
- `packages/adapter-dsh/test/skills.test.js:388 [P2] alignment evals 断言缺叙述对照场景与 CJK 校验（SR15 口径）— fixed: 补 align-narrative-coherent/log 存在性、方向断言（capability-grouped/Q&A-round-stacked）与全部 prompt/assertions 无 CJK 校验`
- `prd.md:96 [P2] 当前任务 PRD 残留独立开放节点标记 — fixed: 主会话按用户决定删除该标记；R10 中的文字说明保留，用于描述被移除的机制`
- `case-result.md Coverage [P2] 提交后 SR 回退集合需要纳入 task-store.js — fixed: 从原始 lcov 补入 1507/1639（91.9%），最终 Overall 更新为 3323/3532（94.1%）；不代表该文件发生代码修改`
- `packages/assets/skills/workloom-case-active/evals/build-fixtures.mjs:21 与 workloom-case-archived/evals/build-fixtures.mjs:28 [P2] 历史任务评测夹具仍含开放节点标记 — recorded: 两处夹具专门模拟 legacy/归档任务，旧标记属于被测历史输入；新代码不得读取它，保留夹具可继续验证历史兼容，不改变生产行为`

## Open issues

- none
