# C2 引用收编核对记录（完整结构形式，逐字引用）

采集命令：`grep -n "workloom-config-edit" <四个消费方文件>`（worktree `/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/.runtime/worktrees/11-24-config-edit-skill`，基线 `main`@`bd681c9`）。

## 1. packages-scan SKILL.md（步骤 5 新首句 + Boundaries 新行）

- `packages/core/resources/skills/workloom-packages-scan/SKILL.md:17`（整句）：
  `5. **Write `.workloom/config.json`** — follow the `workloom-config-edit` skill's modification discipline: read the current file and merged config, show the diff, get confirmation, write atomically, and validate with `workloom-doctor`. Merge the confirmed candidates into the `packages` field:`
  五要素齐：read（current file and merged config）、show the diff、get confirmation、write atomically、validate with `workloom-doctor`。
- `packages/core/resources/skills/workloom-packages-scan/SKILL.md:64`（整行）：
  `- Edits to config fields outside this scan's `packages` candidates go through the `workloom-config-edit` skill.`

## 2. migrate-to-sop SKILL.md（限定句 + Preconditions 第 4 条 + checklist 行）

- `packages/core/resources/skills/workloom-migrate-to-sop/SKILL.md:46`（整句）：
  `Use the bundled script for legacy field migration only. Other general config field edits in the project and local layers go through the `workloom-config-edit` skill; the global layer (`~/.workloom/config.json`) stays with this script.`
- `packages/core/resources/skills/workloom-migrate-to-sop/SKILL.md:24`（整句）：
  `4. **Plan config validation.** After the config rewrite, run `workloom-doctor` in the project. Doctor calls `loadConfig`, which fails loud on malformed known fields.`
- `packages/core/resources/skills/workloom-migrate-to-sop/SKILL.md:87`（整行）：
  `- [ ] the config script real run completed; the config loads without legacy-key warnings and `workloom-doctor` reports no config issue`

## 3. workflow.md（Principles 第 6 条整句）

- `packages/core/resources/workflow/workflow.md:19`：
  `6. Config edits go through the skill: `.workloom/config.json` and `.workloom/config.local.json` modifications go through the `workloom-config-edit` skill.`

## 4. spec index（条目整行）

- `.workloom/spec/repo/workflow/index.md:11`（worktree 副本）：
  `- config-edit-skill: route project and local `.workloom/config.json`/`config.local.json` (and `.js` variants) field edits through the `workloom-config-edit` skill — five steps with completion criteria, whitelist rejection of unknown top-level fields, backup, atomic write, and `workloom-doctor` validation; global config stays with `workloom-migrate-to-sop`, and the skill is registered in `resources-manifest.ts` `SKILL_ENTRIES``
  `grep -c "config-edit-skill"` 恰 1 行命中；英文。

## 5. 注册与收编入口（非 grep 整句，另见 C1）

- `packages/core/src/resources-manifest.ts:60`：`'skills/workloom-config-edit/SKILL.md',`（数组条目）；注释 `:50` 用 `config-edit（config 字段五步编辑）` 简称。
- `packages/dsh-workloom/test/skills.test.ts:157`：`'workloom-config-edit',`（排序后位于 workloom-alignment 与 workloom-finish 之间）。

## 6. 保留逻辑（详见 c2-preserved-diff.log）

- packages-scan：删除行仅步骤 5 旧首句一行；三条合并 bullet（incremental / reported, not silently replaced / repo root entry）各恰 1 处逐字存在；hunk 恰 2。
- migrate-to-sop：删除行仅 checklist 旧行一条；dry-run 命令与遗留映射句逐字存在；`scripts/migrate-config.mjs` diff 为空（7318 字节，未改动）。
- workflow：`git diff main` 无 `version:` 行增删（version-guard-lines=0）。
