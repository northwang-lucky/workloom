---
version: 1
task: tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-config-edit-skill
---

<!-- checker-discipline: how the Checker authors and revises this CASE; re-read before writing or changing any section
- SR/C writing: one entry covers one cohesive slice of one file — Target names a single file path (`<file>#<symbol>` or the whole file), every Check is a decidable yes/no structure, type, naming, behavior, or spec conformance check, and Expected states a decidable code property, never a restatement of requirement intent.
- Traceability: every AC in prd.md is covered by at least one SR or one C row in the Traceability table; an uncovered AC is a CASE defect, and Coverage Exclusions only relax statistics, never the AC mapping.
- Evidence integrity: Evidence cites real observed anchors as `<file>:<line>` instead of restating the Expected text; probe scripts live in `case-evidence/probes/` with only pointers in prose; compute `codeFingerprint` for C5 with the core package's package-relative script `scripts/task-fingerprint.mjs` (under `resources/`, never a repo-absolute path) and record the 64-hex value in the result's codeBaseline.
- Result discipline: the Standard Verification exit-code cell is bare `0`; both cells of every Exclusions row are backtick-wrapped; Overall coverage lines use the `covered/total (pct%)` form only; the last section of the result is `## Open issues` and its body is exactly `- none` when clean.
-->

# CASE: config 编辑专属 skill 与引用收编

## References

- PRD: `prd.md`
- Implementation: `plan.md`（8 个实施步骤；行号锚点以基线 `main`@`bd681c9` 与 worktree 终态双重口径记录，终态以 worktree 实际变更为准）
- Code target: worktree `/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/.runtime/worktrees/11-24-config-edit-skill`（分支 `workloom/11-24-config-edit-skill`，base `main`，基线提交 `bd681c9`）。下文 `<WT>` 指该 worktree 绝对路径；`<task>` 指主检出侧任务目录 `/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-config-edit-skill`（本文件所在目录，不是 worktree 副本）；相对路径以 `<WT>` 为根。
- Source task: none（容器任务 `tasks/11-24-diff-coverage-and-pointer-prompts` 的 S3，无前置子任务）

## Scope

- Requirements: R1、R2、R3、R4、R5、R6、R7
- Acceptance criteria: AC1、AC2、AC3、AC4
- Out of scope:
  - S1（增量覆盖率门禁，已合入 main）、S2（派发注入纯指针化）、S4（coverage 字段进 config schema）；S4 落地后 config-edit 字段清单的同步归 S4。
  - 不改 config schema 本身、不改 `loadConfig`/`DEFAULT_CONFIG` 校验逻辑（本任务只消费其语义）。
  - update-spec 保持禁止改 config（不收编）；全局层 `~/.workloom/config` 迁移行为不回归重测（脚本逻辑不变，C3 只做 dry-run 功能核对）。
  - 生产 DSH 实例操作：不重启实例、不执行 `dsh-stop`/`dsh-start`、不改 profile 与 pnpm-lock、不 push。
  - 代码提交：CASE 执行轮零 commit；`dist/` 与 src 同 commit 由主会话在 2.4 落实，本 CASE 只验 dist 镜像守卫与变更集。
  - 探针与夹具只建在 `mktemp -d` 临时目录并自清理；证据只写 `<task>`（`case-result.md`、`case-evidence/`、`coverage/`）；worktree 内不新建 `case-evidence/` 或 `coverage/`。

## Static Review

### SR1 workloom-config-edit skill 资产

- Covers: `AC1`
- Target: `packages/core/resources/skills/workloom-config-edit/SKILL.md#whole-file`（新文件）
- Checks:
  1. 文件存在；frontmatter 恰含 `name: workloom-config-edit`、`description`、`whenToUse` 三键；无 `disable-model-invocation`（model-invoked）。
  2. description 前部承载触发词 "Edit workloom config fields"，列出 `config.json`/`config.js`/`config.local.json`/`config.local.js` 四种磁盘形态，并与 workloom-packages-scan 分工（package-structure scanning stays with `workloom-packages-scan`）；whenToUse 覆盖对上述四种文件的 change/add/remove 请求（含中文触发例句）；一个分支一个触发词，无同义分支重复（writing-for-agents 的 pointer 纪律）。
  3. 正文含 Five-step discipline 节，五步顺序为：读现状（原始文件 + `loadConfig` 合并结果 + 层归属）→ 提议变更（diff + 顶层白名单拒绝 + 嵌套形状检查）→ 用户确认 → 合并写（只改约定 key、其他字段与格式字节不变、顶层 key 原位覆盖、临时文件加 rename 原子写、git/.bak 备份）→ `workloom-doctor` 校验（退出 0、config 无问题、失败恢复备份并复跑）。
  4. 每步带完成判据：`*Completion:*` 标记恰出现 5 次，一次一步；判据可判定（如步骤 4 要求备份存在且字节比对显示约定 key 之外无变化，步骤 5 要求 doctor 退出 0 且失败写回滚）。
  5. 正文含 Disk field whitelist 节，表格恰列 8 个磁盘 snake_case 顶层字段：`packages`、`worktree`、`hooks`、`subagent_profiles`、`context_injection`、`prompt_injection`、`executor`、`session_auto_commit`；与 `packages/core/src/workspace/config-defaults.ts` 的 `DEFAULT_CONFIG`（camelCase 键集 `sessionAutoCommit`/`contextInjection`/`promptInjection`/`hooks`/`packages`/`executor`/`worktree`/`subagentProfiles`，基线 L14-38）一一对应；`worktree` 子字段白名单恰为 `enabled`/`branch_template`/`cleanup`（基线 L32-36 与 L43+ cleanup 全集）；`session_auto_commit` 为 boolean。
  6. 白名单节含权威源指针 `packages/core/src/workspace/config-defaults.ts` 与 `config-load.ts`（`mergeWithDefaults`），并明示机制句：`loadConfig` 对项目/本地层未知顶层字段静默忽略，步骤 2 的清单拒绝是唯一强制点（R3 的机制声明，C3 场景 A 做运行时佐证）。
  7. Boundaries 覆盖：仅编辑项目层与本地层；全局层拒绝并指引 `workloom-migrate-to-sop`；同层双文件（json+js 并存）不制造；`config.js` 工厂提示手工编辑；不改源码与 git 配置；包结构扫描与 `packages` 候选生成归 `workloom-packages-scan`。
  8. 全文英文（repo/language：`packages/core/resources/` 下资产一律英文）；字段清单单源（正文恰一份完整清单，不散落重复）。
- Expected: `grep -c '\*Completion:\*' SKILL.md` 为 5；8 个字段表格行 `| \`<field>\` |` 逐个命中；`workloom-doctor`、`workloom-migrate-to-sop`、`workloom-packages-scan` 指引句均可定位；字段集与 `config-defaults.ts` 逐项一致，无多余或缺席顶层字段。

### SR2 注册名单 resources-manifest

- Covers: `AC1、AC4`
- Target: `packages/core/src/resources-manifest.ts#SKILL_ENTRIES`（基线 L47-63）
- Checks:
  1. `SKILL_ENTRIES` 数组新增 `'skills/workloom-config-edit/SKILL.md'`，位置在 `skills/workloom-migrate-to-sop/SKILL.md` 之后、`third-party/` 条目之前；数组共 8 条，仍为 `as const` 冻结形态。
  2. 数组上方保留名单注释补 config-edit 说明（"config 字段五步编辑"），注释描述与数组实际成员一致。
  3. `git diff main -- packages/core/src/resources-manifest.ts` 只有名单注释一行改写为两行与数组新增一行两处改动；`TEMPLATE_*`、`SKELETON_*`、`readResourceText` 等其余导出逐字不变。
  4. `packages/core/dist/resources-manifest.js` 随 build 同步含 config-edit 条目（dist 同 commit 纪律，C4 步骤 6 核对）。
- Expected: 数组条目与注释各恰一处 grep 命中 `workloom-config-edit`；diff 无第三处改动；dist 与 src 名单一致。

### SR3 skills.test 名单 pin

- Covers: `AC1、AC4`
- Target: `packages/dsh-workloom/test/skills.test.ts#whole-file`（清单契约用例，基线 L152-166 一带）
- Checks:
  1. 清单契约用例的期望数组新增 `'workloom-config-edit'`（排序后位于 `workloom-alignment` 与 `workloom-finish` 之间）；断言仍为排序后 `deepEqual`。
  2. 用例标题补 config-edit；退役 skill 的反向断言（brainstorm/ui-design/case-active/case-archived/continue/migrate-plan/grilling 不注册）逐字不变。
  3. 文件内其余用例（finish 资产解析、step 工具等）不动。
- Expected: `node --test test/skills.test.ts` 全绿；期望名单与 `SKILL_ENTRIES` 推导出的注册名集合完全一致（C1 步骤 3 以真实注册交叉核对）。

### SR4 packages-scan 收编

- Covers: `AC2`
- Target: `packages/core/resources/skills/workloom-packages-scan/SKILL.md#workflow-step-5`（基线 L17-20 步骤 5、L61-64 Boundaries）
- Checks:
  1. Workflow 步骤 5 首句改为引用 `workloom-config-edit` 的修改纪律，一句内覆盖五要素：读当前文件与合并结果、展示 diff、用户确认、原子写、`workloom-doctor` 校验。
  2. 步骤 5 的合并子项逐字保留：增量合并且既有 key（含其 `setup`）不被覆盖、同名冲突报告而非静默替换、`repo` 根条目默认附加（三条 bullet 原文不变）。
  3. Workflow 步骤 1-4 逐字不变；`git diff main` 对该文件的删除行仅步骤 5 旧首句一行。
  4. Boundaries 新增一行：本次扫描 `packages` 候选之外的 config 字段编辑经 `workloom-config-edit` skill；既有边界行（只改 config.json、repo 条目可移除）不变。
- Expected: grep `workloom-config-edit` 在该文件恰两处（步骤 5 与 Boundaries）；三条合并 bullet 可逐字定位；diff 无其他 hunk。

### SR5 migrate-to-sop 收编

- Covers: `AC2`
- Target: `packages/core/resources/skills/workloom-migrate-to-sop/SKILL.md#config-field-migration`（基线 L17-23 Preconditions、L43+ Config field migration）
- Checks:
  1. Config field migration 节首新增限定句：遗留字段迁移仅用本脚本；项目层与本地层的其他通用 config 字段编辑经 `workloom-config-edit` skill；全局层（`~/.workloom/config.json`）仍用本脚本。
  2. Preconditions 新增第 4 条：迁移重写后运行 `workloom-doctor`（其内部 `loadConfig` 对已知字段形状 fail loud）；既有备份条（git 兜底、未提交先 `.bak`）原文不变，与 config-edit 的备份纪律同构。
  3. `migrate-config.mjs` 专门逻辑不变：调用命令块（dry-run/real/global 三行）、遗留映射说明（`subagent_profiles[i].subagents` → `roles`、无默认补齐、无效形状 fail loud 零写入、NOOP 幂等、原子写）逐字保留；脚本文件 `packages/core/resources/skills/workloom-migrate-to-sop/scripts/migrate-config.mjs` 存在且 `git diff main` 为空。
  4. 收尾 checklist 的 config 行追加 doctor 无问题要求；`git diff main` 对该文件的删除行仅 checklist 旧行一条。
- Expected: grep `workloom-config-edit` 恰一处（限定句）；`workloom-doctor` 在 Preconditions 与 checklist 各可定位；脚本未被改动。

### SR6 spec 条目 config-edit-skill

- Covers: `AC3`
- Target: `.workloom/spec/repo/workflow/index.md#whole-file`（worktree 副本；终态追加于第 11 行）
- Checks:
  1. 新增单行条目 `- config-edit-skill: ...`，英文，内容覆盖：项目层与本地层 `config.json`/`config.local.json`（及 `.js` 变体）字段编辑路由至 `workloom-config-edit` skill、五步带完成判据、未知顶层字段白名单拒绝、备份、原子写、`workloom-doctor` 校验、全局层归 `workloom-migrate-to-sop`、注册于 `resources-manifest.ts` `SKILL_ENTRIES`。
  2. 条目形态与同文件既有条目一致（`- <kebab-name>: <text>` 单行）；既有条目（asset-version-bump、incremental-coverage、counter-example 等）不改不删。
  3. 改动落在 worktree 分支的 spec 副本（随 2.4 合入主线），不直接改主检出 spec 文件。
- Expected: `grep -n "config-edit-skill" .workloom/spec/repo/workflow/index.md` 恰一行命中且为英文。

### SR7 workflow Principles 指引句

- Covers: `AC3`
- Target: `packages/core/resources/workflow/workflow.md#principles`（基线 L12-18；终态第 6 条 L19）
- Checks:
  1. Principles 节新增恰一句（第 6 条）：`.workloom/config.json` 与 `.workloom/config.local.json` 修改经 `workloom-config-edit` skill（英文原句含两个文件名与 skill 名）。
  2. front-matter `version: 25` 不升；`states` 列表与 `####` 步骤集合及顺序不变：`git diff main -- packages/core/resources/workflow/workflow.md | grep -E '^[-+]version:'` 输出为空（asset-version-bump：guidance 句不加版本）。
  3. 既有 5 条 Principles 原文不变；diff 仅一行新增。
- Expected: 指引句 grep 可定位；version 行无增删；states/步骤集合与基线逐字一致。

### SR8 contract-asset 资产 pin

- Covers: `AC3、AC4`
- Target: `packages/core/test/contract-asset.test.ts#whole-file`（新增 config-edit 资产 pin 用例，终态 L1117 一带）
- Checks:
  1. 新增用例钉住：config-edit `SKILL.md` 存在、frontmatter `name` 精确匹配、`whenToUse` 非空、8 个磁盘字段的表格行逐个存在、`*Completion:*` 计数为 5、校验入口含 `workloom-doctor`；workflow Principles 第 6 句逐字匹配；spec 的 `- config-edit-skill:` 条目存在且含 `workloom-config-edit` skill 指引。
  2. 引用收编类断言用完整结构形式（整句、整行或 `| \`field\` |` 表格行形态），不用裸子串（code-style absence-assertions）；spec pin 以 `startsWith('- config-edit-skill:')` 整行定位，非条件空转。
  3. 既有 pin 用例（alignment 资产、模板结构、workflow 其他钉住项）不删不改语义。
- Expected: `node --test test/contract-asset.test.ts` 全绿；任一被钉资产句被删除或改写时对应断言变红（红绿清单见 C2 步骤 5）。

## Runtime Cases

时序纪律：所有运行时用例以 `pnpm -r build` 先行为前提（C3 探针 import core dist；C1 的名单探针读 dist）；探针源码放 `<task>/case-evidence/probes/`，夹具经 `mktemp -d` 创建并在 `finally` 删除；任何代码修复之后，SR 全部重审、C1 至 C5 全量重跑、指纹重算。

### C1 注册 ripple：名单、注册与 dist 一致

- Covers: `AC1、AC4`
- Preconditions:
  1. 已在 `<WT>` 执行 `pnpm -r build`，`packages/core/dist/resources-manifest.js` 存在且与 src 同代。
  2. 命令在 `<WT>` 根目录执行。
- Steps:
  1. `cd <WT>/packages/dsh-workloom && node --test test/skills.test.ts`，输出存 `<task>/case-evidence/c1-skills-tests.log`；在输出中定位清单契约用例名（含 config-edit 的标题）。
  2. 名单探针 `node --input-type=module -e "const m = await import('./packages/core/dist/resources-manifest.js'); console.log(m.SKILL_ENTRIES.length, m.SKILL_ENTRIES.includes('skills/workloom-config-edit/SKILL.md'), m.SKILL_ENTRIES.indexOf('skills/workloom-config-edit/SKILL.md') - m.SKILL_ENTRIES.indexOf('skills/workloom-migrate-to-sop/SKILL.md'))"`（在 `<WT>/packages/core` 目录运行），输出存 `c1-manifest-probe.log`。
  3. 真实注册核对：skills.test 的 `setupSkills()` 读真实 resources 注册，清单契约用例通过即证新 `SKILL.md` 可被解析并注册（frontmatter 破损会直接使名单不齐）。
  4. dist/src 一致：`grep -c "workloom-config-edit" packages/core/dist/resources-manifest.js` 与 `grep -c "workloom-config-edit" packages/core/src/resources-manifest.ts` 计数相等且至少 1（数组条目；名单注释用 `config-edit` 简称，不计入全名 grep）。
- Expected:
  1. 步骤 1 退出码 0，清单契约用例为 pass。
  2. 步骤 2 输出 `8 true 1`（8 条名单、含 config-edit、紧跟 migrate-to-sop 之后）。
  3. 步骤 4 两文件计数一致（dist 镜像 src）。
- Evidence:
  - `case-evidence/c1-skills-tests.log`
  - `case-evidence/c1-manifest-probe.log`
- Cleanup: none。

### C2 引用收编核对与红绿清单

- Covers: `AC2、AC3`
- Preconditions:
  1. C1 通过；命令在 `<WT>` 根目录执行。
- Steps:
  1. `grep -n "workloom-config-edit" packages/core/resources/skills/workloom-packages-scan/SKILL.md packages/core/resources/skills/workloom-migrate-to-sop/SKILL.md packages/core/resources/workflow/workflow.md .workloom/spec/repo/workflow/index.md`，行号与整句记录到 `c2-references.md`。
  2. 完整结构断言逐字记录（c2-references.md）：packages-scan 步骤 5 新首句整句与 Boundaries 新增整行；migrate-to-sop 限定句整句与 Preconditions 第 4 条整句；workflow Principles 第 6 条整句；spec `- config-edit-skill:` 整行。
  3. 保留逻辑核对（输出存 `c2-preserved-diff.log`）：
     1. `git diff main -- packages/core/resources/skills/workloom-packages-scan/SKILL.md | grep '^-'`：删除行仅步骤 5 旧首句一行（含 diff 前缀）；`grep -Fc "existing non-empty \`packages\` are merged incrementally"`、`grep -Fc "reported, not silently replaced"`、`grep -Fc "the \`repo\` root entry is appended by default"` 三条合并 bullet 在终态逐字存在。
     2. `git diff main -- packages/core/resources/skills/workloom-migrate-to-sop/SKILL.md | grep '^-'`：删除行仅 checklist 旧行一条；dry-run/real/global 三行命令块与遗留映射句在终态逐字存在。
     3. `git diff main -- packages/core/resources/skills/workloom-migrate-to-sop/scripts/migrate-config.mjs`：输出为空（脚本未改）；`ls` 确认脚本存在。
     4. `git diff main -- packages/core/resources/skills/workloom-packages-scan/SKILL.md | grep -c '^@@'`：hunk 恰两处（步骤 5 与 Boundaries）。
  4. workflow 版本守卫：`git diff main -- packages/core/resources/workflow/workflow.md | grep -E '^[-+]version:'` 为空。
  5. 红绿清单（写入 `c2-red-green.md`）：逐消费方列表——消费方文件 → 钉住断言（contract-asset pin 断言或本用例整句 grep）→ 移除该引用时哪条检查变红；覆盖全部消费方：packages-scan SKILL.md、migrate-to-sop SKILL.md、workflow.md、spec index、resources-manifest.ts、skills.test.ts、contract-asset.test.ts。
- Expected:
  1. 步骤 1 四个文件各至少一处命中；步骤 2 每条整句可逐字定位。
  2. 步骤 3 三项保留核对全部成立：专门逻辑逐字未动、脚本存在未改、hunk 数符合预期。
  3. 步骤 4 输出为空；步骤 5 清单覆盖七个消费方，每个至少一条完整结构断言。
- Evidence:
  - `case-evidence/c2-references.md`
  - `case-evidence/c2-preserved-diff.log`
  - `case-evidence/c2-red-green.md`
- Cleanup: none。

### C3 config 机制探针：loadConfig 语义与 doctor 入口

- Covers: `AC1、AC2`
- Preconditions:
  1. C1、C2 通过；`pnpm -r build` 已执行。
  2. 探针 `case-evidence/probes/c3-config-mechanism-probe.mjs` import core dist 的 `loadConfig`（`dist/workspace/config-load.js`）与 `runDoctor`（`dist/workspace/doctor.js`）；临时项目经 `mkdtempSync` 创建并在 `finally` 清理。
- Steps:
  1. 场景 A（静默忽略实证）：临时项目写 `.workloom/config.json`，含 8 个合法顶层字段样例（`packages` 一条、`worktree` 三子字段、`hooks` 空对象、`subagent_profiles` 空数组、`context_injection`/`prompt_injection` 空对象、`executor`、`session_auto_commit`）加一个未知顶层键 `unknown_tunnel`；调 `loadConfig(root)` 与 `runDoctor(root)`，打印合并结果 JSON 与 doctor 报告 JSON。
  2. 场景 B（已知形状 fail loud）：临时项目写 `.workloom/config.json`，`executor` 为 `{ "max_concurrent": "three" }`；分别调 `loadConfig(root)` 与 `runDoctor(root)`，打印错误与报告。
  3. 场景 C（顶层覆盖语义）：项目层 `executor.max_concurrent` 为 1，本地层 `.workloom/config.local.json` 写 `executor` 为 `{ "max_concurrent": 2 }`；打印 `loadConfig` 合并结果。
  4. doctor 入口锚点：`grep -n "doctor" packages/core/src/injection/surface.ts | head -3`，确认 `TOOL_NAMES.doctor` 为 `'workloom-doctor'`，与 SKILL.md 步骤 5 的命令名逐字一致。
  5. 迁移脚本 dry-run：临时目录写含遗留形态的 `.workloom/config.json`（`subagent_profiles` 数组某项内层为 `subagents` 键）；执行 `node packages/core/resources/skills/workloom-migrate-to-sop/scripts/migrate-config.mjs <tmp>/.workloom/config.json --dry-run`（命令形态取 SKILL.md Config field migration 节原文）；记录退出码、stdout 与前后 sha256。
- Expected:
  1. 场景 A：`loadConfig` 无错，合并结果不含 `unknown_tunnel`（静默忽略得到运行时实证，skill 清单拒绝是强制点的机制前提成立）；`runDoctor` 返回无 config 失败项的报告。
  2. 场景 B：`loadConfig` 抛 `WorkloomConfigError` 且文案含 `executor.max_concurrent` 路径；`runDoctor` 以 fail loud 方式暴露该失败——以 err 返回或在报告的 config 检查中生成 error 级 issue，两条路径的文案均含字段路径（doctor 作为 skill 步骤 5 的校验入口）。
  3. 场景 C：合并结果 `executor.maxConcurrent === 2` 且项目层文件字节不变（对象层顶层 key 覆盖语义）。
  4. 步骤 4 锚点命中且命令名一致。
  5. 步骤 5 退出码 0，stdout 为 dry-run 计划，前后 sha256 相同（零写入）。
- Evidence:
  - `case-evidence/c3-config-mechanism-probe.log`
  - `case-evidence/c3-migrate-dry-run.log`
- Cleanup: 探针在 `finally` 删除全部临时目录。

### C4 标准验证全表、dist 同批与变更集审计

- Covers: `AC3、AC4`
- Preconditions:
  1. C1 至 C3 通过；全部代码修复已落地（任何修复后重跑 C1 至 C5）。
  2. 命令在 `<WT>` 根目录执行，build 先行。
- Steps:
  1. `pnpm -r build`，输出存 `case-evidence/c4-build.log`。
  2. `pnpm -r typecheck`，输出存 `case-evidence/c4-typecheck.log`。
  3. `pnpm lint`，输出存 `case-evidence/c4-lint.log`。
  4. `cd packages/core && pnpm test`，输出存 `case-evidence/c4-core-tests.log`（含 dist-mirror、dist-dts、contract-asset、case-templates 守卫用例）。
  5. `cd packages/dsh-workloom && pnpm test`，输出存 `case-evidence/c4-dsh-tests.log`（含 dist-mirror 守卫与 skills.test 清单契约）。
  6. dist 核对：`grep -n "workloom-config-edit" packages/core/dist/resources-manifest.js`；`git status --porcelain packages/core/dist packages/dsh-workloom/dist`，输出存 `c4-dist-status.log`（非空属预期：dist 随 src 同批重建，待主会话 2.4 单一 work commit 落实）。
  7. 变更集审计（输出存 `c4-change-set.log`）：`git status --porcelain` 与 `git diff --name-only main...HEAD`；逐项核对——不以 `packages/core/dist/`、`packages/dsh-workloom/dist/`、`packages/core/test/`、`packages/dsh-workloom/test/`、`.workloom/` 开头且不等于 Coverage Exclusions 命中项的每个变更文件，都是某个 SR 的 Target（八文件对照：config-edit SKILL.md、resources-manifest.ts、skills.test.ts、packages-scan SKILL.md、migrate-to-sop SKILL.md、spec index、workflow.md、contract-asset.test.ts）。
  8. `git diff --check`：无空白错误输出。
- Expected:
  1. 步骤 1 至 5 退出码均为 0；lint 无 error 与 warning；两包测试 0 fail 且守卫用例全部通过。
  2. 步骤 6：dist 名单含 config-edit；dist-mirror 守卫通过即证 dist 与 src 镜像一致。
  3. 步骤 7：每个非排除变更文件都有 SR 目标，没有则记为 CASE 缺项交主会话修订 CASE 后重跑。
  4. 步骤 8 无输出。
- Evidence:
  - `case-evidence/c4-build.log`
  - `case-evidence/c4-typecheck.log`
  - `case-evidence/c4-lint.log`
  - `case-evidence/c4-core-tests.log`
  - `case-evidence/c4-dsh-tests.log`
  - `case-evidence/c4-dist-status.log`
  - `case-evidence/c4-change-set.log`
- Cleanup: none。

### C5 本任务自身增量覆盖率证据（双轨）与指纹

- Covers: `AC4`
- Preconditions:
  1. C1 至 C4 通过；C4 步骤 1 的 `pnpm -r build` 已执行，dist 与 src 同代。
  2. 执行轮代码尚未提交，变更集等于 `<WT>` 内 `git status --porcelain` 的全部条目（含未跟踪文件）。
- Steps:
  1. 路径解析：`WT=/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/.runtime/worktrees/11-24-config-edit-skill`；`MAIN=$(cd "$(git -C "$WT" rev-parse --git-common-dir)/.." && pwd)`；`TASK="$MAIN/.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-config-edit-skill"`；`mkdir -p "$TASK/coverage" "$TASK/case-evidence"`。
  2. 双包 lcov 采集（Aggregate command 原样执行；glob 与 core `package.json` test 脚本三 glob 同形）：spec 输出分别存 `case-evidence/c5-core-coverage-run.log` 与 `case-evidence/c5-dsh-coverage-run.log`，lcov 落 `$TASK/coverage/`。
  3. 轨道二（新脚本增量交集）：Aggregate command 的 `task-diff-coverage.mjs` 命令原样执行（工作区口径 `-`，排除集为 plan 步骤 8 钉死清单），产出 `coverage/changed-lines.json`、`coverage/diff-coverage.json`，stdout 存 `case-evidence/c5-diff-coverage-stdout.json`。
  4. 轨道二断言：`format` 为 `lcov`；`missingExecutableFiles` 为 `[]`；`files` 的路径集合恰为 `{packages/core/src/resources-manifest.ts}`（skill/spec/workflow 文档与测试、dist 均被排除或非可执行）；该文件变更行中唯一可执行行为 SKILL_ENTRIES 数组条目行（注释行不可执行），`overall` 为 `covered/total` 且两者相等（预期 1/1，100%）；如 lcov 对该行口径不同，以实际区间记录并交叉核对 covered 等于 total。
  5. 轨道一数值（旧门禁整文件口径，供 RESULT 填写）：从 `lcov-core.info` 的 `SF:packages/core/src/resources-manifest.ts` 段统计整文件 `LF`/`LH` 与 hits=0 的 `DA` 行区间，手算写入 `case-evidence/c5-cross-check.md`；判定规则：非排除可执行变更行集非空 → RESULT Coverage `Status: generated`、Changed Files 表恰列该文件、Overall lines 取整文件口径数字（本任务预期路径）；集为空 → `not_applicable` 加非空 `- Reason:` 行（预案，本任务不触发）。
  6. 指纹：`node packages/core/resources/scripts/task-fingerprint.mjs "$WT" | tee case-evidence/c5-fingerprint.txt`（在最后一次代码修复之后执行），输出形如 `codeFingerprint=<64 位十六进制>`，记入 RESULT front-matter `codeBaseline`。
  7. 排除审计：`git -C "$WT" status --porcelain` 去掉 Exclusions 命中项与 `.workloom/` 前缀后的可执行文件集合，等于步骤 4 的 `files` 集合。
- Expected:
  1. `<task>/coverage/` 含 `lcov-core.info`、`lcov-dsh.info`、`changed-lines.json`、`diff-coverage.json`，两份 JSON 可被 `JSON.parse`。
  2. 步骤 4 各断言成立，`missingExecutableFiles` 为空说明全部非排除变更可执行文件都进入报告。
  3. 步骤 5 手算值与 lcov 原文一致；RESULT 轨道一 `Overall lines` 形态合规（`covered/total (pct%)`）。
  4. 步骤 6 得到 64 位十六进制指纹；步骤 7 集合相等。
- Evidence:
  - `coverage/lcov-core.info`
  - `coverage/lcov-dsh.info`
  - `coverage/changed-lines.json`
  - `coverage/diff-coverage.json`
  - `case-evidence/c5-core-coverage-run.log`
  - `case-evidence/c5-dsh-coverage-run.log`
  - `case-evidence/c5-diff-coverage-stdout.json`
  - `case-evidence/c5-cross-check.md`
  - `case-evidence/c5-fingerprint.txt`
- Cleanup: none（证据保留在任务目录；worktree 内不新建 `coverage/` 或 `case-evidence/`）。

## Coverage

- Tool: Node.js v24 内置测试覆盖率（`node --test --experimental-test-coverage`）与原生 `lcov` reporter；增量交集用 S1 已合入 main 的 `packages/core/resources/scripts/task-diff-coverage.mjs`（经 core dist 的 `task/coverage-compute.js` 单一计算源）。
- Instrumentation: 双轨并行，两轨共用同一份原生报告，都以 `pnpm -r build` 先行为前提。
  1. 轨道一（门禁轨，旧格式）：运行中的插件是旧版本，本任务 RESULT 的 Coverage 节按旧口径填写——`Status: generated`，`Overall lines` 与 Changed Files 表取 lcov 的整文件行覆盖（逐文件 `LF`/`LH`，未覆盖行取 hits=0 的 `DA` 行区间，由 C5 步骤 5 给出）。旧门禁只校验 Overall 形态、Changed Files 文件集合等于非排除变更文件集、Exclusions 两处一致、原始报告存在；判定规则见 C5 步骤 5（无可执行变更行时才允许 `not_applicable` 加 Reason，本任务预期不触发）。
  2. 轨道二（证据轨，新口径）：C5 用新脚本对同一份 lcov 报告与本任务工作区 diff 求交集，产出 `coverage/changed-lines.json` 与 `coverage/diff-coverage.json`；`overall` 须 covered 等于 total（本任务唯一可执行变更行为名单数组条目行，经模块加载执行覆盖）。该结果不进旧门禁，只作为新门禁口径在本任务自身 diff 上的真实证据。
  3. 两包测试都从 `<WT>` 根目录以 coverage 模式运行，lcov 的 `SF:` 路径即 repo 相对路径，直接匹配 diff 路径；dsh 测试经 `@workloom-ai/core` 加载 core dist，dist 文件同样进入报告，但 dist 在 Exclusions 中，两轨都不计入。
  4. 轨道二在执行轮用 `-`（工作区口径：变更尚未提交，三点 diff 为空）；2.4 提交后可用 `main` 复跑交叉核对，不作为通过条件。
- Aggregate command:
  ```bash
  WT=/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/.runtime/worktrees/11-24-config-edit-skill
  MAIN=$(cd "$(git -C "$WT" rev-parse --git-common-dir)/.." && pwd)
  TASK="$MAIN/.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-config-edit-skill"
  mkdir -p "$TASK/coverage" "$TASK/case-evidence"
  cd "$WT"
  node --test --experimental-test-coverage \
    --test-reporter=spec --test-reporter-destination="$TASK/case-evidence/c5-core-coverage-run.log" \
    --test-reporter=lcov --test-reporter-destination="$TASK/coverage/lcov-core.info" \
    'packages/core/test/*.test.ts' \
    'packages/core/resources/skills/workloom-packages-scan/scripts/*.test.ts' \
    'packages/core/resources/scripts/*.test.mjs'
  node --test --experimental-test-coverage \
    --test-reporter=spec --test-reporter-destination="$TASK/case-evidence/c5-dsh-coverage-run.log" \
    --test-reporter=lcov --test-reporter-destination="$TASK/coverage/lcov-dsh.info" \
    'packages/dsh-workloom/test/*.test.ts'
  node packages/core/resources/scripts/task-diff-coverage.mjs "$WT" - \
    "$TASK/coverage/lcov-core.info" "$TASK/coverage/lcov-dsh.info" \
    --exclude 'packages/core/dist/' --exclude 'packages/dsh-workloom/dist/' \
    --exclude 'packages/core/test/' --exclude 'packages/dsh-workloom/test/' \
    --exclude 'packages/core/resources/skills/' --exclude '.workloom/' \
    --out-dir "$TASK/coverage" --json | tee "$TASK/case-evidence/c5-diff-coverage-stdout.json"
  node packages/core/resources/scripts/task-fingerprint.mjs "$WT" | tee "$TASK/case-evidence/c5-fingerprint.txt"
  ```
- Scope: 两轨共同的可执行变更文件集合——预期恰为 `packages/core/src/resources-manifest.ts`（本任务以 skill/spec/workflow 文档资产为主，可执行源码仅该名单文件与两处测试；测试与 dist 在 Exclusions）。实际集合以 C4 步骤 7 与 C5 步骤 7 的变更集审计为准；多出的非排除文件须有 SR 目标，否则属 CASE 缺项，交主会话修订 CASE 后重跑。
- Exclusions:
  - packages/core/dist/: 构建产物，镜像 src；C4 验 dist-mirror 守卫通过，同 commit 由主会话 2.4 提交时复核
  - packages/dsh-workloom/dist/: 构建产物，镜像 src；C4 验 dist-mirror 守卫通过，同 commit 由主会话 2.4 提交时复核
  - packages/core/test/: contract-asset 资产 pin 用例自身；C4 验全绿
  - packages/dsh-workloom/test/: skills.test 清单 pin 用例自身；C1 与 C4 验全绿
  - packages/core/resources/skills/: agent 面向 skill 文档资产（含迁移脚本目录），文档无运行时行；引用与资产质量经 SR1/SR4/SR5 静态审、C2 grep 整句与 contract-asset pin 验证
  - packages/core/resources/workflow/workflow.md: 工作流 guidance 英文文本，无运行时行；C2 验指引句与 version 不升，contract-asset pin 钉住
  - .workloom/: 任务元数据与 worktree 侧 spec 副本，非代码；spec 条目经 SR6 静态审与 C2 grep 验证
  Pattern semantics: a trailing `/` prefix-matches a whole directory subtree, an exact path without globs matches one file, a single `*` is anchored within its own path segment (never crosses `/`), and a `**` segment crosses directory levels (zero or more levels mid-pattern, any remaining path at the tail).
- Raw outputs:
  - `coverage/lcov-core.info`
  - `coverage/lcov-dsh.info`
  - `coverage/changed-lines.json`
  - `coverage/diff-coverage.json`

## Traceability

| AC | Static review | Runtime cases |
| --- | --- | --- |
| AC1 | SR1、SR2、SR3 | C1、C3 |
| AC2 | SR4、SR5 | C2、C3 |
| AC3 | SR6、SR7、SR8 | C2、C4 |
| AC4 | SR2、SR3、SR8 | C4、C5 |

## Execution Notes

1. 双轨口径（对 PLAN 步骤 8 的落实）：轨道一以旧格式过旧门禁——本任务存在非排除可执行变更文件（resources-manifest.ts），故 RESULT 取 `generated` 而非 `not_applicable`；`not_applicable` 加非空 `- Reason:` 行仅作为无可执行变更行时的预案（C5 步骤 5 判定规则）。RESULT 的 Exclusions 表必须与上文 Exclusions 逐路径逐原因相同（workflow.md 一行仅旧门禁需要，轨道二命令不含该排除也不影响结果：.md 非可执行后缀，不入 `files` 也不触发缺席检测）。
2. 指纹在 C5（checker-discipline 钉 C5 计算 `codeFingerprint`），在最后一次代码修复之后执行，记入 RESULT `codeBaseline`。
3. CASE 设计期间 developer 子代理在同一 worktree 并行推进（SR 所引终态行号以 `main`@`bd681c9` 基线与 worktree 终态双重口径记录）；本 CASE 全部判据取自 PRD/PLAN 的要求本身，不依赖瞬态行号，执行轮以实际变更核对。
4. 红绿清单口径（code-style absence-assertions）：引用收编的每条核对用完整结构形式（整句、整行、`| \`field\` |` 表格行），裸子串不算；C2 步骤 5 的清单覆盖全部七个消费方，任一引用被删除时 contract-asset pin 或 C2 整句 grep 至少一条变红。
5. 探针与夹具的落点：`<task>/case-evidence/probes/`（c3 一个探针）与 `mktemp -d` 临时项目；探针自清理，不写生产目录，不执行 commit 与 push；证据只写 `<task>`。
6. 任何代码修复之后：SR 全部重审、C1 至 C5 全量重跑、指纹重算。
