# 实施计划：alignment review 提前暴露 PRD 结构门禁

按 test-first 执行：每个切片先补会失败的行为测试，再实现。所有实现文件变更由 implement executor 完成，主会话只做评审与后续 check 阶段修复。

## 切片 1：结构化 PRD 分类器

### 红

修改 `packages/core/test/task-gates.test.js`：

1. 引入 `inspectPrdStructure` 与 `PRD_STRUCTURE_CODES`。
2. 覆盖 `null`、缺 H1、缺小节、placeholder、marker 缺失、marker pending 与完整 PRD。
3. 覆盖多问题同时存在时的固定顺序：H1 → 四个小节 → open nodes。
4. 覆盖 `## Note` 单数仍被识别为 `Notes` missing。
5. 保留并更新 `findUnfilledPrdSections()` 旧行为测试。

先运行 core 测试确认新测试失败，且失败原因是新导出/行为尚不存在。

### 绿

修改 `packages/core/src/legacy/task-gates.js`：

1. 新增冻结常量 `PRD_STRUCTURE_CODES`。
2. 新增 issue message 构造函数，集中管理英文运行时文案。
3. 从 `./alignment.js` 额外引入 `findOpenNodeState` 与 `OPEN_NODE_MARKER`。
4. 实现 `inspectPrdStructure(prdContent)`：
   - `null` 只返回 `prd_missing`；
   - 非空字符串依次检查 H1、四个必备小节、open-nodes marker；
   - 每个缺失小节和每个 placeholder 小节分别产生 issue；
   - marker 缺失和 pending 分别产生不同 code。
5. 用分类器重写 `findUnfilledPrdSections()`，仅过滤 section 两类 issue 并返回 `section`。
6. 保持 `splitSectionBodies()`、`PRD_SECTIONS` 与现有骨架生成逻辑不变。

修改 `packages/core/src/legacy/task-gates.d.ts`：

1. 新增 `PrdStructureCode` 联合类型；
2. 新增 `PrdStructureIssue` 接口；
3. 声明 `PRD_STRUCTURE_CODES` 与 `inspectPrdStructure()`；
4. 保留旧函数类型。

修改 `packages/core/src/index.ts`：导出新函数、常量与类型。

## 切片 2：alignment review/confirm 契约

### 红

修改 `packages/core/test/task-ops.test.js`：

1. review 缺 PRD：断言仍成功，`prdHash === null`、`structureIssues[0].code === 'prd_missing'`、`confirmBlockers` 有消息、`readyToConfirm === false`。
2. review 缺 Notes：断言返回 hash，同时 Notes issue code 为 `prd_section_missing`，不能只出现 placeholder 文案。
3. review Notes placeholder：断言 code 为 `prd_section_placeholder`。
4. review marker 缺失/pending：分别断言对应 code。
5. review 完整 PRD：断言 `structureIssues` 与 `confirmBlockers` 为空、`readyToConfirm === true`。
6. confirm 骨架 PRD：断言仍被拒绝、零写入，错误消息包含 `content blockers` 和 placeholder/missing 的具体小节消息。
7. 构造同时含多个 PRD 内容问题的输入，断言 confirm 只抛一个 Error，但消息列出全部 blocker。
8. 保留 expectedPrdHash 缺失、hash mismatch、summary 缺失、成功 confirm、同 hash 幂等测试。

### 绿

修改 `packages/core/src/service/alignment-service.ts`：

1. import `inspectPrdStructure` 与 `PrdStructureIssue` 类型。
2. 扩展 `AlignReviewResult`：
   - `structureIssues: PrdStructureIssue[]`；
   - `confirmBlockers: string[]`；
   - `readyToConfirm: boolean`。
3. 在 `reviewAlign()` 中调用分类器并填充三个字段。
4. 在 `confirmAlign()` 中用分类器替换分散的 H1、unfilled、open-node 检查。
5. 有内容 blocker 时只抛一个 Error，消息按分类器顺序聚合。
6. 内容 blocker 清空后，再执行既有参数/hash/summary/凭据写入逻辑。
7. 不把 credential stale、任务状态、expectedPrdHash、summary 纳入 `readyToConfirm`。

## 切片 3：start 与 doctor 复用分类结果

### 红

更新/新增测试：

1. `packages/core/test/task-store.test.js` 或 start gate 相关测试：缺 Notes 与 Notes placeholder 的错误消息不同；多个 PRD 内容问题一次列出。
2. `packages/core/test/doctor.test.js`：
   - 缺小节产生 missing 文案和添加该小节的 hint；
   - placeholder 产生 placeholder 文案和填充该小节的 hint；
   - 同一 PRD 中两类问题分开报告；
   - open-node marker 缺失不产生 doc-completeness issue。

### 绿

修改 `packages/core/src/legacy/task-gates.js` 的 `evaluateStartGate()`：

1. PRD 缺失时使用分类器的 `prd.md is missing` 消息；
2. PRD 存在时把分类器 issue message 全部加入 missing；
3. 保留之后的 alignment credential gate 与 jsonl gate 顺序。

修改 `packages/core/src/service/doctor-check-rules.ts`：

1. import `inspectPrdStructure` 与 `PRD_STRUCTURE_CODES`；
2. PRD 缺失仍输出原有 Missing prd.md doctor issue；
3. 非空 PRD 只投影 H1 与两类 section issue；
4. 对每个 section issue 生成独立 doctor issue；
5. 根据 missing/placeholder code 生成不同 message/hint；
6. 忽略 open-node issue，不把 alignment readiness 混入普通文档完整性检查。

## 切片 4：surface、workflow、skill 与协议版本

### 红

1. 更新 `packages/core/test/protocol.test.js` 对常量的行为断言（通常无需硬编码 22）。
2. 更新 `packages/core/test/contract-asset.test.js`：
   - 版本字面量从 21 改为 22；
   - Phase 1.1 文本包含 `readyToConfirm`、`structureIssues`/`confirmBlockers`、修复后重新 review 的顺序；
   - planning norms 含“ready 前不得请求用户确认”规则。
3. 更新 adapter surface 测试：
   - `packages/adapter-dsh/test/tasks.test.js`；
   - `packages/adapter-pi/test/tasks.test.ts`；
   - 断言 action 描述包含 review structural issues、confirm blockers、readyToConfirm。
4. 更新/新增 skill eval 断言场景，确保 eval JSON 仍可解析。

先运行相关测试确认资产文本尚未满足。

### 绿

1. 修改 `packages/core/src/surface.ts` 的 `action` 参数描述。
2. 修改 `packages/assets/workflow/workflow.md`：
   - frontmatter `version: 22`；
   - Phase 1.1 convergence order 加入 review readiness gating；
   - planning norms 同步加入同一条主会话规则。
3. 修改 `packages/assets/skills/workloom-alignment/SKILL.md`：
   - review 后先检查 `readyToConfirm`；
   - false 时处理全部 blockers 并重新 review；
   - true 时才展示 snapshot/hash 给用户。
4. 修改 `packages/assets/skills/workloom-alignment/evals/evals.json`：
   - 更新 convergence-order case 的 expected output/assertions；
   - 新增 review blocker case，覆盖缺 Notes/placeholder 时不得请求用户确认。
5. 修改 `packages/core/src/legacy/protocol.js`：`WORKFLOW_PROTOCOL_VERSION = 22`。
6. 不新增 changeset，不修改四包版本号。

## 切片 5：构建、类型与全量验证

1. 使用 LSP 辅助检查改动的 TS 文件：
   - `lsp_symbols` 先确认结构；
   - 完成后对改动 TS 文件运行 `lsp_diagnostics`。
2. 运行：

```bash
pnpm lint
pnpm -r typecheck
pnpm -r build
cd packages/core && node --test test/*.test.js
cd packages/adapter-dsh && node --test test/*.test.js
cd packages/adapter-pi && bun test test/*.test.ts
```

3. 若 Bun 不可用或 adapter-pi 测试被环境阻塞，记录原始错误；不得改写测试规避。
4. 不执行 `~/dsh/bin/dsh-sync-workloom`，不重启 dshweb。
5. 不主动 push。

## 文件清单

预期修改：

- `packages/core/src/legacy/task-gates.js`
- `packages/core/src/legacy/task-gates.d.ts`
- `packages/core/src/legacy/protocol.js`
- `packages/core/src/service/alignment-service.ts`
- `packages/core/src/service/doctor-check-rules.ts`
- `packages/core/src/surface.ts`
- `packages/core/src/index.ts`
- `packages/core/test/task-gates.test.js`
- `packages/core/test/task-ops.test.js`
- `packages/core/test/task-store.test.js`
- `packages/core/test/doctor.test.js`
- `packages/core/test/contract-asset.test.js`
- `packages/adapter-dsh/test/tasks.test.js`
- `packages/adapter-pi/test/tasks.test.ts`
- `packages/assets/workflow/workflow.md`
- `packages/assets/skills/workloom-alignment/SKILL.md`
- `packages/assets/skills/workloom-alignment/evals/evals.json`

如实现中发现需要增减文件，必须在实现报告中说明原因；不得在 adapter 中复制 PRD 分类规则。

## 提交计划

所有实现与测试通过后形成一个提交：

```txt
feat(alignment): review 返回 PRD 结构就绪诊断
```

提交正文说明：

- 新增统一 PRD 结构 issue 分类器；
- review 返回 structureIssues、confirmBlockers、readyToConfirm；
- confirm/start/doctor 复用分类结果；
- workflow protocol 升级到 22。