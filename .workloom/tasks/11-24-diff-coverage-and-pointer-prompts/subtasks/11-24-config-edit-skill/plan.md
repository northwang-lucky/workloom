# S3 config 编辑专属 skill 与引用收编 — 计划（Round 2 修订）

> 修订依据：plan-review.md Round 1（P0×2/P1×3/P2×7）全部处置。

## Design decisions

- **model-invoked + 注册 ripple**：config-edit 模型可 invocation（其他 skill 须引用）。注册走硬编码名单 `resources-manifest.ts` SKILL_ENTRIES，插件只注册名单内条目；须加名单条目 + 更新 skills.test 精确 pin + manifest 注释，否则 skill 永不注册（P0-1）。
- **字段清单随正文**：skill 运行在用户项目，config-defaults.ts 不在现场，"cheap lookup 不缓存"前提不成立。正文携带 8 个磁盘 snake_case 顶层字段清单（packages、worktree、hooks、subagent_profiles、context_injection、prompt_injection、executor、session_auto_commit）+ 权威源指针（P0-2）。
- **未知字段强制点**：loadConfig 对项目/本地层未知顶层字段静默忽略（mergeWithDefaults 只处理已知 key），不依赖它拒绝；skill 步骤 2 的字段清单拒绝是唯一强制点；loadConfig 校验已知字段形状 fail loud（P1-1）。
- **五步带完成判据**（writing-for-agents）；收编保留专门逻辑（packages-scan 扫描/setup 含 repo 根条目、migrate-to-sop 迁移脚本）。
- **实现先读** writing-for-agents + SKILL-MECHANICS；skill 正文英文。
- **覆盖率**：S1 已完成合入，task-diff-coverage.mjs 可用；S3 文档为主，自身证据按新脚本计算，无可执行行 not_applicable + Reason。

## Steps

#### 步骤 1 — 新建 workloom-config-edit skill

- Covers: AC1
- Target: `packages/core/resources/skills/workloom-config-edit/SKILL.md`（新文件）
- Edit:
  ```text
  Input: writing-for-agents + SKILL-MECHANICS；config-defaults.ts DEFAULT_CONFIG 字段；packages-scan/migrate-to-sop frontmatter 形态。
  Output: model-invoked skill，frontmatter name/description/whenToUse；正文五步纪律（带完成判据）+ 8 字段清单 + boundaries。
  Preconditions: 已读 writing-for-agents 与 SKILL-MECHANICS
  Procedure:
    - frontmatter：description front-load "config"，触发分支区分"编辑 config 字段"与 packages-scan"扫描包结构"；whenToUse 列改 config.json/config.local.json 请求；不设 disable-model-invocation。
    - 五步（每步完成判据）：1 读现状（原始文件 + loadConfig 合并结果，判据：两层文件与合并结果都读到）；2 提议变更（展示字段影响/diff，对照 8 字段清单拒绝未知顶层字段，判据：每个变更字段在清单内且形状合法）；3 用户确认（判据：用户明确同意）；4 合并写（保留其他字段、顶层 key 覆盖、原子写，判据：其他字段字节不变）；5 workloom-doctor 校验（判据：doctor 命令退出 0、config 健康，失败回滚；doctor 内部调 loadConfig 校验已知字段形状，用户项目无 core 现场故入口钉 doctor）。
    - 字段清单：正文列 8 个磁盘 snake_case 顶层字段 + 权威源指针 config-defaults.ts；关键子字段白名单（worktree.enabled/branch_template/cleanup）；说明 loadConfig 静默忽略未知顶层字段，故清单拒绝是强制点。
    - 备份：项目 config git 兜底，未提交先 .bak。
    - boundaries：只编辑项目层 config.json|js 与本地层 config.local.json|js；全局层拒绝指引 migrate-to-sop；同层双文件（config.json+config.js 并存）loadConfig 已 fail loud，skill 不制造；config.js 工厂提示手工；不改源码与 git 配置。
  Failure: none（文档资产）
  ```
- Verify: skill 存在；frontmatter 可解析；grep 五步判据 + 8 字段清单可定位。

#### 步骤 2 — 注册 ripple

- Covers: AC1, AC4
- Target: `packages/core/src/resources-manifest.ts` — SKILL_ENTRIES（L53-61）+ 注释（L47-52）；`packages/dsh-workloom/test/skills.test.ts` — 清单 pin（L152-162）
- Edit:
  ```text
  Input: SKILL_ENTRIES 现 7 条（finish/alignment/update-spec/packages-scan/migrate-to-sop + tdd/writing-for-agents）；skills.test 精确名单断言。
  Output: SKILL_ENTRIES 加 'skills/workloom-config-edit/SKILL.md'；manifest 注释补 config-edit；skills.test 名单加 'workloom-config-edit'。
  Preconditions: Step 1
  Procedure:
    - SKILL_ENTRIES 数组加 config-edit 条目（workloom 侧，置于 migrate-to-sop 后）。
    - manifest 注释保留名单补 config-edit 说明。
    - skills.test 名单断言加 'workloom-config-edit'（排序后位置正确）；退役 skill 断言不变。
    - dist 随 Step 7 build 重建。
  Failure: 名单 pin 红 → 同步修。
  ```
- Verify: `cd packages/dsh-workloom && node --test test/skills.test.ts` 退出 0；grep SKILL_ENTRIES 含 config-edit。

#### 步骤 3 — packages-scan 收编

- Covers: AC2
- Target: `packages/core/resources/skills/workloom-packages-scan/SKILL.md` — Workflow 步骤 5（L17-20）、Boundaries（L61-64）
- Edit:
  ```text
  Input: 步骤 5 合并语义（增量合并、不覆盖既有 key 含 setup、冲突报告、repo 根条目 L20）。
  Output: 步骤 5 引用 config-edit 纪律，保留全部合并子项（含 repo 根条目）；Boundaries 补 config 编辑经 config-edit。
  Preconditions: Step 1
  Procedure:
    - 步骤 5 首句加"按 workloom-config-edit skill 修改纪律写入"；保留增量合并/不覆盖/冲突报告/repo 根条目四子项。
    - Boundaries 补 config 字段编辑经 workloom-config-edit。
    - 步骤 1-4 不动。
  Failure: none
  ```
- Verify: grep 引用；四子项仍在（含 repo 根条目）；步骤 1-4 逐字不变。

#### 步骤 4 — migrate-to-sop 收编

- Covers: AC2
- Target: `packages/core/resources/skills/workloom-migrate-to-sop/SKILL.md` — Preconditions（L17-23）、Config field migration（L43+）
- Edit:
  ```text
  Input: 备份纪律（git/.bak）；migrate-config.mjs（dry-run/real/global）。
  Output: 通用 config 修改入口引用 config-edit（限项目/本地层）；备份/校验对齐；迁移脚本不变。
  Preconditions: Step 1
  Procedure:
    - Config field migration 节首加：遗留字段迁移用本脚本；项目/本地层其他通用 config 字段编辑经 workloom-config-edit skill（全局层仍用本脚本）。
    - Preconditions 备份条对齐 config-edit（git/.bak），校验补 workloom-doctor（内部 loadConfig 已知字段形状 fail loud）。
    - migrate-config.mjs 调用/dry-run/全局/原子写逐字不变。
  Failure: none
  ```
- Verify: grep 引用含项目/本地层限定；脚本存在；dry-run/全局命令逐字不变。

#### 步骤 5 — spec 条目

- Covers: AC3
- Target: `.workloom/spec/repo/workflow/index.md`（新条目，worktree 副本）
- Edit:
  ```text
  Input: 既有条目形态 `- <kebab-name>: <text>` 单行英文。
  Output: `- config-edit-skill: ...` 条目（config 修改经 workloom-config-edit，五步纪律，项目/本地层，全局归 migrate-to-sop，注册 SKILL_ENTRIES）。
  Preconditions: Step 1
  Procedure: 追加单行英文条目，既有条目不改不删。
  Failure: none
  ```
- Verify: `grep -n "config-edit-skill" .workloom/spec/repo/workflow/index.md` 恰一行。

#### 步骤 6 — workflow 指引句

- Covers: AC3
- Target: `packages/core/resources/workflow/workflow.md` — Principles 节（L12-18）末加一句
- Edit:
  ```text
  Input: Principles 现有 5 条；front-matter version=25、states、#### 步骤集合。
  Output: Principles 加第 6 句"config.json/config.local.json modifications go through the workloom-config-edit skill"；states/step/version 不变。
  Preconditions: none
  Procedure:
    - Principles 节末加一句英文指引（落点钉死 Principles）。
    - 不动 states/#### 步骤/front-matter version。
  Failure: none
  ```
- Verify: grep 指引句；`git diff main -- packages/core/resources/workflow/workflow.md | grep -E '^[-+]version:'` 为空。

#### 步骤 7 — 测试 pin 与验证

- Covers: AC3, AC4
- Target: `packages/core/test/contract-asset.test.ts`（skill 存在 + workflow 句 + spec 条目 pin）、两包 dist
- Edit:
  ```text
  Input: contract-asset 现有 skill 资产 pin（workloom-alignment SKILL.md L939 形态）。
  Output: pin config-edit SKILL.md 存在 + frontmatter name；workflow Principles 指引句；spec config-edit-skill 条目（钉死路径，非条件空转）。
  Preconditions: Steps 1-6
  Procedure:
    - 加 config-edit skill 存在与 name pin（完整结构形式）。
    - 加 workflow 指引句 pin、spec 条目 pin（明确文件路径）。
    - pnpm -r build 重建 dist；pnpm lint / pnpm -r typecheck / 两包 node --test 全绿。
  Failure: pin 红 → 修资产或 pin。
  ```
- Verify: 两包 node --test 退出 0；lint/typecheck/build 0。

#### 步骤 8 — 自身证据与提交

- Covers: AC4
- Target: 任务 `coverage/`、worktree 提交（主会话 2.4）
- Edit:
  ```text
  Input: S1 已交付 task-diff-coverage.mjs（main 可用）；S3 变更集（skill/spec/workflow/manifest 源码 + 测试）。
  Output: 自身增量证据落任务 coverage/；主会话提交 + 合入 + 簿记。
  Preconditions: Step 7 全绿
  Procedure:
    - 路径解析：WT=<worktree 绝对路径>；MAIN=$(cd "$(git -C "$WT" rev-parse --git-common-dir)/.." && pwd)；TASK="$MAIN/.workloom/tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-config-edit-skill"；mkdir -p "$TASK/coverage"。
    - 双包 lcov 采集（glob 与 core package.json test 脚本三个 glob 同形）：cd "$WT" && node --test --experimental-test-coverage --test-reporter=lcov 'packages/core/test/*.test.ts' 'packages/core/resources/skills/workloom-packages-scan/scripts/*.test.ts' 'packages/core/resources/scripts/*.test.mjs' > "$TASK/coverage/lcov-core.info"；dsh：node --test --experimental-test-coverage --test-reporter=lcov 'packages/dsh-workloom/test/*.test.ts' > "$TASK/coverage/lcov-dsh.info"。
    - node packages/core/resources/scripts/task-diff-coverage.mjs "$WT" - "$TASK/coverage/lcov-core.info" "$TASK/coverage/lcov-dsh.info" --exclude 'packages/core/dist/' --exclude 'packages/dsh-workloom/dist/' --exclude 'packages/core/test/' --exclude 'packages/dsh-workloom/test/' --exclude 'packages/core/resources/skills/' --exclude '.workloom/' --out-dir "$TASK/coverage" --json。
    - resources-manifest.ts 源码变更行经 lcov 计入；skill/spec/workflow 文档非可执行排除；无可用执行行时 not_applicable + Reason。
    - 主会话 2.4 提交（dist 同 commit）+ 合入 + 簿记。
  Failure: 增量不达标 → 附原因审核。
  ```
- Verify: 命令退出 0；coverage/ 证据存在；git diff --check 0。
