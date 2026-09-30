# S0 implement 计划：legacy/ → domain/ 机械重命名

纯机械重构，零行为变化，无 design.md。按下述顺序执行；每步完成后再进下一步。**改动不提交**（2.3 由主会话统一 commit）。

## 0. 基线盘点（先跑，分类每个命中）

```bash
grep -rn "legacy" packages/core/src packages/core/test packages/adapter-dsh/src packages/adapter-pi/src packages/assets docs README.md AGENTS.md eslint.config.js tsconfig.base.json .workloom/spec 2>/dev/null
```

逐命中分类：**路径引用**（`./legacy/`、`../legacy/`、`src/legacy`、`dist/legacy`、`legacy-module`）→ 改；**语义白名单** → 一律不动：

- `migrateLegacyTrellis` / `detectLegacyTrellis` / `MigrateLegacyTrellisParams` / `MigrateLegacyTrellisResult`（.trellis 历史迁移语义）
- `LEGACY_YAML_BY_LAYER` 及 config.js 中 "legacy YAML config is retired" 文案（退役 YAML 配置语义）
- 配置来源枚举 `'legacy'`（旧 subagents 层语义）：core `config.js` / `executor-profiles.js` / `dispatch-binding.js` 及类型、adapter-dsh `executor.ts:510` 注释、adapter-pi `executor.ts` / `executor-continuation.ts` / `executor-dispatch.ts` 的 `'whenMain' | 'fallback' | 'legacy'` 类型
- assets `workflow.md:108` "no new/legacy distinction"（任务记录语义）
- "subagents is deprecated" 相关文案
- `.workloom/tasks/archive/**` 全部（历史归档，零接触）

## 1. 目录重命名（git mv 保留历史）

```bash
git mv packages/core/src/legacy packages/core/src/domain
git mv .workloom/spec/repo/legacy-module .workloom/spec/repo/domain-module
```

## 2. core 代码引用更新

- `src/index.ts`：~30 处 `from './legacy/…'` → `'./domain/…'`；头注释 "src/legacy/ 下的模块是既有脚本的行为移植，纯 JS（JSDoc 注释）" → "src/domain/ 下是 runtime 无关的领域行为模块，纯 JS（JSDoc 注释）"（措辞可微调，语义=领域模块 vs service 编排层）。
- `src/surface.ts`、`src/workflow-contract-types.ts`、`src/service/*.ts`（alignment-service/command-ops/doctor-*/local-prompts/session-context/spec-templates/step-lookup/task-ops/workflow-service，共 12+ 文件）：`'../legacy/…'` → `'../domain/…'`，注释中的目录表述同步。
- `src/domain/` 内部：同目录相对 import（`./xxx.js`）不变；各模块头注释/JSDoc 中"legacy"目录概念表述更新为 domain（模块自身"行为移植模块"历史描述若与目录名绑定则同步，纯历史说明可保留但不得再指向 `legacy/` 路径）。
- `packages/core/test/*.test.js`：多为 `../dist/index.js` 导入不受影响；grep `'legacy'` 字面量逐一判别（路径断言 → 改；语义 → 留）。

## 3. dist 重建（tracked，防 stale 残留）

```bash
git rm -r -q packages/core/dist/legacy
pnpm -r build
```

确认 `packages/core/dist/domain/` 生成、`dist/index.js` 内 import 路径为 `./domain/`、`dist/legacy` 不存在。

## 4. 文档指针更新

- `.workloom/spec/repo/domain-module/index.md`：内容术语 "legacy 模块"→"domain 模块"、路径示例 `src/legacy/` → `src/domain/`（标题/文件名同步）。
- `.workloom/spec/repo/architecture/layering.md`、`executor-voice.md`：legacy 措辞 → domain。
- `.workloom/spec/repo/terminology/index.md`：更新/收录 domain 层词条，移除或改写 legacy 词条（保留"语义白名单"中 legacy 一词的其他含义不受影响）。
- `AGENTS.md`：仓库结构图 `├── core/ # runtime 无关逻辑：legacy 纯 JS 移植模块 + service TS 抽象` → `domain 纯 JS 领域模块 + service TS 抽象`；其余 legacy 措辞同步。
- `docs/`、`README.md`、`packages/core/README.md`（如有）、`packages/assets`：grep 命中处按分类处理。
- 活跃任务活指针（仅文件路径指针，PRD 叙述"legacy/→domain/ 重命名"的文字不改）：
  - `.workloom/tasks/09-30-s1-core-worktree-lifecycle/implement.jsonl`：`packages/core/src/legacy/…` → `…/src/domain/…`、spec 指针 `repo/legacy-module` → `repo/domain-module`
  - `.workloom/tasks/09-30-s1-core-worktree-lifecycle/check.jsonl`：spec 指针同上
  - `.workloom/tasks/09-30-s2-worktree-runtime-integration/implement.jsonl`：`packages/core/src/legacy/executor-context.js` → `…/src/domain/executor-context.js`
  - 本任务（S0）自身 jsonl 不改（implement.jsonl 记录的是派发时刻路径，check.jsonl 已用新路径）。

## 5. 验证（全绿才算完成）

```bash
pnpm lint
pnpm -r typecheck
pnpm -r build
cd packages/core && node --test test/*.test.js
cd packages/adapter-dsh && node --test test/*.test.js
cd packages/adapter-pi && bun test test/*.test.ts
```

## 6. 终局审计

```bash
grep -rn "legacy" packages docs README.md AGENTS.md eslint.config.js tsconfig.base.json .workloom/spec 2>/dev/null | grep -v "tasks/archive"
```

剩余命中必须全部属于第 0 步语义白名单；`src/legacy`、`dist/legacy`、`legacy-module` 路径式引用零命中。另核对 `git status`：无预期外文件改动；`packages/core/package.json` 与 `index.ts` 导出符号清单零 diff（`git diff packages/core/src/index.ts | grep '^[+-]export'` 应只有路径变化无符号变化）。

## 报告要求

完成后报告：改动文件数（分类：core src/test/dist/spec/docs/任务 jsonl）、语义白名单保留清单（抽样列举）、验证命令输出结论、终局审计剩余命中及其白名单归属。不提交 git commit。
