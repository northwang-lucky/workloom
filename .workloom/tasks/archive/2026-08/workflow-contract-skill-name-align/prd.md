# workflow 契约 skill 名与注册名对齐（brainstorm → workloom-brainstorm）

## Goal

消除工作流契约中 skill 短名 `brainstorm` 与实际注册名 `workloom-brainstorm` 不一致的问题：DSH 会话在 Phase 1.1 按契约加载 skill 时不再出现 `Error: skill "brainstorm" is unknown or no longer available` 的失败调用；统一全部相关引用并同步部署 DSH profile 资产。

## Requirements

1. `packages/assets/workflow/workflow.md` 第 30 行：加载指令 `First load the brainstorm skill` 改为 `First load the \`workloom-brainstorm\` skill`，该行其余文本不变（含 stage 序列描述 `brainstorm → grilling`，作为阶段名保留）。
2. `packages/assets/workflow/workflow.md` 第 107 行：状态提示 `align requirements (brainstorm + grilling, no-grey-areas gate)` 中的 `brainstorm` 改为 `workloom-brainstorm`。
3. `packages/assets/workflow/workflow.md` front-matter：`version: 10` 改为 `version: 11`。
4. `packages/assets/skills/workloom-brainstorm/SKILL.md` 第 22 行：内部自称 `**brainstorm (this skill)**` 改为 `**workloom-brainstorm (this skill)**`。
5. `packages/assets/skills/workloom-brainstorm/SKILL.md` 第 25 行：阶段描述 `brainstorm first to settle the requirement set` 改为 `workloom-brainstorm first to settle the requirement set`。
6. 明确不改：源码注释（`packages/adapter-dsh/src/skills.ts`、`packages/adapter-pi/scripts/sync-skills.mjs`）、研究文档（`docs/research/`）、以及不指向 skill 名的描述性阶段词语。
7. 构建与部署：`pnpm -r build` 后手工执行 `~/dsh/bin/dsh-sync-workloom` 的 rsync 部分（core/adapter-dsh `dist/` + 完整 `assets/` 包），**跳过脚本末尾的 dshweb 自动重启**；先 `--dry-run` 检查 diff，再实际同步；dshweb 重启由用户自行执行。

## Acceptance Criteria

1. 上述 5 处文本变更逐条落地：`packages/assets/` 内不再出现 `load the brainstorm skill`、`(brainstorm (this skill)`；`workflow.md` front-matter `version: 11`。
2. 仓库验证全绿：`pnpm lint`、`pnpm -r typecheck`、`pnpm format:check`。
3. 部署同步一致：`~/.dsh/profiles/web/node_modules/@workloom-ai/assets/workflow/workflow.md` 与 `packages/assets/workflow/workflow.md` 内容一致（diff 为空）；`dist/` 同步结果与 dry-run 预期一致。
4. 提交纪律：单一 commit（`fix(assets): ...`），不主动 push。
5. 未触碰范围内的文件（源码注释、研究文档）无变更：`git status` 中不属于本任务目标的变更一概没有。

## Notes

- 修复背景：DSH 会话 `session-3a0aaafc-c3ba-4de3-8576-3ef7972ce6de`（workflow Phase 1.1）按契约调用 `skill "brainstorm"` 失败，原因即契约短名与注册名 `workloom-brainstorm` 不一致；当时模型自行降级（跳过 brainstorm、直接用 grilling），工作流未中断，属良性噪声，本任务消除该失败调用。
- 版本号 bump 是契约语义（skill 名）实际变化的审计标记；解析器只校验正整数，不强制递增，故为约定而非机制依赖。
- 用户已确认：test-first 不适用（纯文档变更）、不涉及前端 UI、部署同步采用「手工 rsync、跳过自动重启 dshweb」。
