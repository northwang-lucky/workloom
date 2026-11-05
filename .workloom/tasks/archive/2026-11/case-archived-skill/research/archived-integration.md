tasks/11-03-case-archived-skill:mw354dmgfzk68qu6

> 冲突说明（只陈述一次）：执行者约定要求先读 plan.md，但本任务目录目前只有 prd.md、task.json、implement.jsonl、check.jsonl（task.json status=planning），没有 plan.md；本报告按委托的任务提示与 PRD 执行，不虚构计划内容，也不修改实现代码。

# workloom-case-archived 接入点调查：归档选择、只读清单、独立任务与评测落在哪些真实文件

> Scope: `packages/core/src/domain/{task-store,worktree,git,case,task-gates,alignment,locate}.{js,d.ts}`、`packages/core/src/service/{task-ops,case-service,alignment-service,doctor-*}.ts`、`packages/assets/{skills,templates,workflow}`、`packages/adapter-dsh/{src,test}`、`packages/adapter-pi/{src,test,scripts,package.json}`、`.workloom/tasks/archive/**` 的代表样本。
> Format: `##` 标题即该节结论；锚点为仓库根相对 `path:line`；建议与事实分开，没有代码锚点的建议标为“建议（未验证）”。

## 结论：接入面是 1 个新技能目录 + 2 处注册清单 + 1 个 Pi 构建拷贝 + 3 类测试锚点，再加 1 个自建归档枚举/清单脚本；core 工具、slash command 与 workflow 版本都不动

| 接入点 | 真实位置（实现时只改这些） |
| --- | --- |
| 技能正文与新脚本 | 新目录 `packages/assets/skills/workloom-case-archived/`（对照 `packages/assets/skills/workloom-case-active/SKILL.md:1-58` 的形状） |
| DSH 注册 | `packages/adapter-dsh/src/skills.ts:50-61` 的 `SKILL_ASSETS` 增一行；注册函数 `registerSkills` 在 `packages/adapter-dsh/src/skills.ts:166-190`，由 `packages/adapter-dsh/src/plugin.ts:118` 调用 |
| Pi 注册与构建副本 | `packages/adapter-pi/scripts/sync-skills.mjs:21-32` 的 `SKILL_SOURCES` 增一行；包清单 `packages/adapter-pi/package.json:25-27` 的 `pi.skills` 已指向构建产物 `./skills` |
| 注册/文本测试 | `packages/adapter-dsh/test/skills.test.js:142-158` 与 `packages/adapter-pi/test/skills.test.ts:20-37` 的技能名单断言；资产文本断言仿 `packages/adapter-dsh/test/skills.test.js:160-214` |
| 归档枚举与原件清单 | 没有现成工具可复用，需要新脚本（建议），理由见下一节；代码指纹复用 `packages/assets/skills/workloom-case-active/scripts/task-fingerprint.mjs:1-36` |
| 不改的部分 | 命令面只有 init/doctor（`packages/core/src/surface.ts:15-18`）；workflow 版本 25（`packages/core/src/domain/protocol.js:13`、`packages/assets/workflow/workflow.md:1-2`） |

## 归档任务只能自建枚举：`workloom_task_list` 明确跳过 archive，返回摘要里也没有 mode 和 completedAt

- `listTasks` 的文档与实现都写着“不含 archive/”：`packages/core/src/domain/task-store.js:1567` 与 `packages/core/src/domain/task-store.js:1593` 直接 `continue` 掉名为 `archive` 的目录。
- 列表工具只暴露 `status` 一个过滤参数，没有“包含归档”的选项：`packages/adapter-dsh/src/tasks.ts:184-193`；core 入参类型只有 `status`：`packages/core/src/domain/task-store.d.ts:317-319`。
- 摘要字段没有 `mode`、`completedAt`：`packages/core/src/domain/task-store.d.ts:240-250`。因此无法只靠 `workloom_task_list` 区分“归档 full 任务”和“light 任务”，也拿不到归档时间。

```js
// packages/core/src/domain/task-store.js:1592-1594
for (const entry of readdirSync(tasksDir, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name === DIR_NAMES.archive) continue
  const taskRelPath = join(DIR_NAMES.tasks, entry.name)
```

- core 内部确实有一份“active + archive”枚举，但没从公共入口导出：`collectTasks` 在 `packages/core/src/service/doctor-tasks.ts:33-66`，公共入口只导出 `runDoctor`/`buildDoctorRelayText`（`packages/core/src/index.ts:263`），没有 `collectTasks`。技能脚本不能 import 它。

归档数据布局与字段事实（对 `.workloom/tasks/archive/*/*/task.json` 实测，共 85 个归档任务）：

| 事实 | 数值/锚点 |
| --- | --- |
| 目录形态 `tasks/archive/<YYYY-MM>/<name>` | `packages/core/src/domain/task-store.js:1505`；样本 `.workloom/tasks/archive/2026-11/case-active-skill/task.json:1-20` |
| 状态全部 `completed`、`completedAt` 全部非空 | 85/85；样本 `.workloom/tasks/archive/2026-11/case-active-skill/task.json:6-15` |
| 显式 `mode: "full"` | 10 个；样本 `.workloom/tasks/archive/2026-10/plan-md-prescriptive/task.json:8` |
| 缺 `mode` 字段（读取归一为 full） | 72 个；归一逻辑 `packages/core/src/domain/task-store.js:287-289` |
| 显式 `mode: "light"` | 3 个；样本 `.workloom/tasks/archive/2026-10/continue-candidate-scan/task.json:8` |
| `commit` 字段非空 | 0/85，全为空串；样本 `.workloom/tasks/archive/2026-11/case-active-skill/task.json:20` |

复现实测统计：

```bash
cd <repo>
node -e '
const fs=require("fs"),path=require("path");const root=".workloom/tasks/archive";
let n=0,light=0,full=0,noMode=0,noDone=0,commit=0;
for(const m of fs.readdirSync(root)){for(const name of fs.readdirSync(path.join(root,m))){
 const p=path.join(root,m,name,"task.json");const t=JSON.parse(fs.readFileSync(p,"utf8"));
 n++; if(t.mode==="light")light++; if(t.mode==="full")full++; if(t.mode===undefined)noMode++;
 if(!t.completedAt)noDone++; if(t.commit)commit++;}}
console.log({n,full,light,noMode,noDone,commit})'
```

- 归档时间的权威字段是 `completedAt`，不是目录月份（目录月份由归档发生在哪天决定：`packages/core/src/domain/task-store.js:1505`；`completedAt` 在移动后写入 `packages/core/src/domain/task-store.js:1523-1525`）。
- “已完成但还没归档”的任务仍在 `tasks/` 下，doctor 有专门的 error 规则：`packages/core/src/service/doctor-check-rules.ts:72-87`。技能的分流必须拒绝这种路径，而不是把它当归档任务。

建议（未验证）的判定口径：

| 输入 | 判定 | 去向 |
| --- | --- | --- |
| 路径不在 `tasks/archive/<YYYY-MM>/<name>/task.json` | 非归档任务 | 拒绝，指向 `workloom-case-active` 或正常流程 |
| `status !== "completed"` | 未归档/活跃 | 拒绝，并提示先完成归档 |
| `mode === "light"`（显式） | 轻量任务 | 拒绝，走轻量自查流程 |
| `mode` 缺失或 `"full"` | full（与 core 读取归一一致） | 接受 |
| 归档目录缺 `prd.md` 或 `task.json` 不可解析 | 材料缺失 | 停止并报告（R10） |

建议（未验证）脚本形状：`packages/assets/skills/workloom-case-archived/scripts/archived-task.mjs`，只依赖 Node 内置模块（与 `task-fingerprint.mjs` 同风格），导出 `listArchivedTasks(root)` 与 `inspectArchivedTask(root, relPath)`；路径先规范化掉 `.workloom/` 前缀，再经 `insideWorkloom` 同款越界判断（`packages/core/src/domain/locate.js:95-102`）。不要 import `@workloom-ai/core`：技能脚本要能在用户项目里裸跑，和 `task-fingerprint.mjs` 一样只带 `node:` 内置依赖（`packages/assets/skills/workloom-case-active/scripts/task-fingerprint.mjs:1-5`）。

## 归档原件没有写保护门禁：逐字节 SHA-256 清单是唯一可靠约束，且必须用原始字节而不是归一化 hash

- core 没有“archive 路径只读”的检查；路径校验只有 `insideWorkloom` 的越界防护（`packages/core/src/domain/locate.js:95-102`）。
- 已有工具靠状态间接挡住归档任务：`startTask` 只接受 planning（`packages/core/src/domain/task-store.js:719-722`）、`checkTask` 只接受 in_progress（`packages/core/src/domain/task-store.js:807-810`）、alignment 凭据拒绝 completed（`packages/core/src/domain/task-store.js:920-924`）、CASE 确认拒绝 completed（`packages/core/src/domain/task-store.js:965-967`）。但这些都不是“文件只读”，直接编辑 `task.json`/证据文件仍然可行。
- 最危险的暗写是父子关系：创建任务时若把归档路径传给 `parent`，`linkChildToParent` 会读归档 `task.json`、push children 并整文件写回：`packages/core/src/domain/task-store.js:556-567`（调用点 `packages/core/src/domain/task-store.js:663`）。R4 的“不在归档原件上创建子任务关系”在实现上就是**绝不传 `parent`**。
- 不能直接用 `computeContentHash` 做原件清单：它先把 CRLF/CR 归一为 LF 再取 SHA-256（`packages/core/src/domain/alignment.js:49-60`），换行差异会被抹掉，不满足 R3 的“逐字节比较”。清单必须对 `readFileSync` 得到的原始字节做 `createHash('sha256').update(bytes)`。
- 清单要覆盖目录下**全部文件**，包括 task.json、prd/plan/case/result、jsonl、evidence、coverage、research、evals、hidden 文件。`case-active-skill` 归档目录实测 1053 个文件、48 MB（`du -sh .workloom/tasks/archive/2026-11/case-active-skill`），脚本按路径排序流式输出即可。

建议（未验证）脚本契约：

```text
node scripts/archived-task.mjs manifest <archive-task-rel-path>
# 每行：<64-hex><两个空格><仓库根相对路径>，按路径排序
node scripts/archived-task.mjs compare <before-manifest> <after-manifest>
# 输出 missing/added/changed 三类差异；无差异 exit 0，有差异 exit 1
```

| 产物 | 建议位置 | 理由 |
| --- | --- | --- |
| 处理前清单 | 新任务 `case-evidence/archive-before.sha256` | 归档证据与 RESULT 引用路径都在 `case-evidence/`（`packages/assets/templates/case-result.md:5-9`、`packages/core/src/domain/case.js:504-516`） |
| 处理后清单 | 新任务 `case-evidence/archive-after.sha256` | 同上 |
| 比较结论 | 新任务 `case-evidence/archive-manifest-compare.txt` | 供 check 会话和用户复核 |

测试锚点（建议，未验证）：`scripts/archived-task.test.mjs` 用临时目录构造“完整归档 / light / 缺 mode / 损坏 JSON / 活跃目录”五种输入，断言列表过滤、排序、路径规范化和越界拒绝；清单测试断言“内容改 1 字节则 compare 非 0、文件增删被识别、空目录不影响、多次运行输出稳定”。

## 独立任务创建复用 `workloom_task_create`；`parent` 绝不能传归档路径，Source 元数据只能落在 `meta` 或直接编辑 task.json

创建面事实：

| 事实 | 锚点 |
| --- | --- |
| 工具入参：`title`、`package` 必填；`slug`/`priority`/`description`/`parent` 可选；不接受 `mode: full` | `packages/adapter-dsh/src/tasks.ts:49-67`、`packages/core/src/service/task-ops.ts:98-115`、`packages/core/src/service/task-ops.ts:164` |
| `package` 必须是 `config.packages` 的键，缺失/未知直接报错 | `packages/core/src/service/task-ops.ts:156-163`、`packages/core/src/domain/task-store.js:628-646` |
| 新任务目录名 `tasks/<MM-DD>-<slug>`，日期段由工具生成 | `packages/core/src/domain/task-store.js:610-613` |
| 显式 slug 必须 kebab-case、≤40 字符、不带 MM-DD 前缀 | `packages/core/src/domain/task-store.d.ts:253-270`、`packages/core/src/domain/task-store.js:163-183` |
| 中文标题派生 slug 会得到空串并报错（`slugify` 只保留 `[a-z0-9]`） | `packages/core/src/domain/task-store.js:143-148`、`packages/core/src/domain/task-store.js:600-608` |
| create 会把新任务写成当前会话活跃任务 | `packages/core/src/domain/task-store.js:769-771` |
| `task.json` 有 `meta: Record<string, unknown>`，新建空对象；扫描 `.workloom/tasks/archive/*/*/task.json` 实测 85 个归档任务无任何非空 meta | `packages/core/src/domain/task-store.js:414`、`packages/core/src/domain/task-store.d.ts:218` |
| 没有“按字段更新任务”的工具；官方错误文案反而指引手工编辑 task.json 的字段 | `packages/core/src/domain/task-store.js:748-752` |
| `meta` 经 `...parsed` 透传，后续 start/check/confirm/archive 整文件回写时不会丢 | `packages/core/src/domain/task-store.js:272-273`、`packages/core/src/domain/task-store.js:353-364`、`packages/core/src/domain/task-store.js:1525` |

Source task 元数据的落点结论：

1. **事实**：CASE 模板已有 `Source task` 字段，且 core 结构校验强制它存在：`packages/assets/templates/case.md:13`、`packages/core/src/domain/case.js:404`。
2. **事实**：RESULT 模板没有 Source task 字段，core 也不校验：`packages/assets/templates/case-result.md:1-9`、`packages/core/src/domain/case.js:626-640`。
3. **建议（未验证）**：用 `meta.sourceTask` 存结构化来源，不新增 create 参数：

```json
"meta": {
  "sourceTask": {
    "path": "tasks/archive/2026-11/case-active-skill",
    "archiveCommit": "<40-hex>",
    "archivedAt": "2026-11-05T01:49:07.063Z",
    "purpose": "<current verification purpose>"
  },
  "codeBaseline": {
    "ref": "main",
    "commit": "<40-hex>",
    "refSource": "default-current-branch | user-specified",
    "reason": "<why this baseline>"
  }
}
```

4. **建议（未验证）**：如果非要走工具参数，需要同时改 `CreateTaskParams`（`packages/core/src/domain/task-store.d.ts:253-270`）、`buildTaskRecord`（`packages/core/src/domain/task-store.js:386-432`）、`ExecuteCreateTaskParams` 与 `executeCreateInternal`（`packages/core/src/service/task-ops.ts:98-178`）、两个 adapter 的 schema（`packages/adapter-dsh/src/tasks.ts:49-67`、`packages/adapter-pi/src/tasks.ts:37-47`）以及对应测试；改动面明显大于 `meta`，与 R11“复用现有工具”不一致。
5. **建议（未验证）**：CASE 的 `Source task` 与 RESULT 的 `Summary` 各写一行来源说明；RESULT 的 extra bullet 不触发 core 校验（`packages/core/src/domain/case.js:626-700`），但不要改模板本身，避免影响所有任务。

## 历史材料按 PLAN > design+implement > PRD-only 分流；`workloom-migrate-plan` 不能直接跑在归档原件上

归档材料的实际分布（85 个归档任务实测）：

| 材料组合 | 数量 | 代表样本 |
| --- | --- | --- |
| 有 `plan.md`（无 design/implement） | 5 | `.workloom/tasks/archive/2026-11/case-active-skill/`、`.workloom/tasks/archive/2026-10/plan-migration-skill/`、`.workloom/tasks/archive/2026-10/prd-traceability/`、`.workloom/tasks/archive/2026-10/review-executor/`、`.workloom/tasks/archive/2026-11/full-task-case-coverage/` |
| `design.md` + `implement.md` | 37 | `.workloom/tasks/archive/2026-10/plan-md-prescriptive/{design.md,implement.md}` |
| 只有 `design.md` | 1 | `.workloom/tasks/archive/2026-08/task-start-task-archive/design.md` |
| 只有 `implement.md` | 2 | `.workloom/tasks/archive/2026-09/s0-legacy-to-domain-rename/implement.md`、`.workloom/tasks/archive/2026-09/slim-executor-context/implement.md` |
| 只有 PRD（无 plan/design/implement） | 40 | `.workloom/tasks/archive/2026-08/agent/{prd.md,task.json}` |

判定与落点：

| 结论 | 锚点 |
| --- | --- |
| 新任务 start 强制要求结构完整的 plan.md（父任务豁免），每个 AC 至少被一个步骤 `Covers` | `packages/core/src/domain/task-gates.js:311-315`、`packages/core/src/domain/task-gates.js:346-380` |
| plan 的写作标准是“每步 Target/Edit/Verify + 新文件全文 + AC 全覆盖” | `packages/assets/workflow/workflow.md:66`、`packages/assets/skills/workloom-alignment/references/plan-authoring.md:5-20` |
| `workloom-migrate-plan` 的边界明确写“archived 任务永不扫描、永不迁移” | `packages/assets/skills/workloom-migrate-plan/SKILL.md:13` |
| 该技能在第 4 步会删除 design.md 与 implement.md | `packages/assets/skills/workloom-migrate-plan/SKILL.md:36-38` |
| 迁移前必须对着当前代码验证锚点，不能照搬旧计划 | `packages/assets/skills/workloom-migrate-plan/SKILL.md:31` |
| 迁移标记的既有写法（PRD/plan 各一行） | `packages/assets/skills/workloom-migrate-plan/SKILL.md:24`、`packages/assets/skills/workloom-migrate-plan/SKILL.md:34` |

由此得到实现约束：

1. **PLAN 优先不等于照抄**：归档 `plan.md` 只能当历史输入；新任务仍要按当前代码重写，否则 start 门禁虽能过，CASE 的 SR 目标会指向旧行号/旧符号。归档样本里 `.workloom/tasks/archive/2026-11/case-active-skill/plan.md` 的锚点是当时 worktree 的代码（例如 `.workloom/tasks/archive/2026-11/case-active-skill/plan.md:50` 的脚本路径），新任务核对后可能已经漂移。
2. **legacy 迁移只能在新任务目录里做**：把 design.md + implement.md 的内容读出来、在新任务重写 plan.md，**绝不能把 `workloom-migrate-plan` 指向归档目录**，否则第 4 步会删掉原件，直接违反 R3。
3. **PRD-only 必须显式标记**：新 PRD 的 H1 下第一行写类似 `> Rebuilt from PRD-only archived source <path>; no historical PLAN existed.`，新 plan 从当前代码重建。core 不校验这行标记，它由技能文本与评测断言保护；不要把它伪装成“迁移”。
4. **只有单侧 legacy 文件（只有 design 或只有 implement）不属于 R5 的成对迁移**：建议按材料缺失停止并报告（R10），不要静默降级为 PRD-only；归档里确实存在 3 个这种任务，选中时必须给出明确失败。
5. **缺 prd.md 一律停止**：没有 PRD 无法重建 R/AC 与验收目的，不能从 design/implement 反推 PRD。

## 代码基准默认当前分支 HEAD；指定 ref 没有现成落点，来源提交也没写进 task.json

| 事实 | 锚点 |
| --- | --- |
| worktree 的 base 分支 = 当前检出分支；只有子任务才改用父任务分支 | `packages/core/src/domain/worktree.js:300-314` |
| start 只把分支名写进 `branch` / `base_branch`，不写完整 commit | `packages/core/src/domain/task-store.js:758-760`、`packages/core/src/domain/task-store.d.ts:193-232` |
| detached HEAD 在 start 时被拒绝 | `packages/core/src/domain/worktree.js:296-298` |
| 归档任务 `commit` 字段全为空（85/85），无法从 task.json 取“来源提交” | 样本 `.workloom/tasks/archive/2026-11/case-active-skill/task.json:20`；实测脚本见上文 |
| 可用的 ref 解析原语是 `git rev-parse`，没有更高层的“按 ref 建 worktree”封装 | `packages/core/src/domain/git.js:245-249` |
| package 所属仓由 `resolveTaskRepo` 解析（root/sub/submodule），基准分支要在该仓里取 | `packages/core/src/domain/worktree.js:117-166`、`packages/core/src/domain/worktree.d.ts:57-62` |

默认基准的解析方式（建议，未验证）：

```bash
git -C <package-repo-root> rev-parse --abbrev-ref HEAD   # ref 来源 = default-current-branch
git -C <package-repo-root> rev-parse HEAD                # 40 位完整 commit
```

指定 ref 的实际能力边界：

- **分支 ref 可以落地，但要改用户主检出（建议，未验证）**：start 从“当前检出分支”建 worktree。如果用户指定的是另一个分支，只有在主检出干净、用户明确同意时，先 `git checkout <branch>` 再 start，才能让新 worktree 基于该分支；这不是任务级参数，会改变用户主检出的状态，必须在动作前停下来确认。
- **commit ref 不能直接落地**：detached HEAD 被 start 拒绝（`packages/core/src/domain/worktree.js:296-298`），create/start 也没有“base commit”参数（`packages/core/src/service/task-ops.ts:98-115`）。可选路径只有三种（建议，未验证）：a) 只记录 ref、验证仍按当前 HEAD 并明确标注“未按该提交执行”；b) 在独立 scratch worktree 里 `git worktree add --detach <dir> <commit>` 跑只读验证，产物另存；c) 扩展 core 的 worktree 创建参数。三条都超出“只复用现有工具”的范围，需要 PLAN 明确拍板。
- **来源提交**：`task.json.commit` 不可用。能稳定解析的是“把归档目录加进 git 的那个提交”：

```bash
git log --diff-filter=A -1 --format=%H -- .workloom/tasks/archive/2026-11/case-active-skill/task.json
# 实测返回 6b4c272f62880a1f84c346a2d5e277483552238a chore(task): archive case-active-skill
```

它由归档工具的提交前缀产生（`packages/core/src/domain/task-store.js:79`、`packages/core/src/domain/task-store.js:1561`），语义是“归档记账提交”，不是“历史验证时的代码提交”。新格式归档任务的 RESULT 里可能有更接近的 `codeBaseline`（样本 `.workloom/tasks/archive/2026-11/case-active-skill/case-result.md:5`），旧任务则没有。两者都取不到时，应如实记录 `null` 与原因，或按 R10 停止——这是需要拍板的口径，见开放问题。

## 新任务的 CASE/RESULT 凭据全部由既有核心机制产生，历史 CASE 与 RESULT 无法复用

| 事实 | 锚点 |
| --- | --- |
| 完整任务 start 时自动把 `case.required` 置 true | `packages/core/src/domain/task-store.js:762-766` |
| `kind: check` + `purpose: case-design` 的派发才会记录 `case.designSession` 并保持当前 stage | `packages/core/src/domain/task-store.js:1101-1111`、`packages/core/src/domain/task-store.js:1387-1400` |
| `purpose: execution` 才把 stage 推进到 check | `packages/core/src/domain/task-store.js:1397-1399` |
| 执行前要求 CASE 已确认且当前字节 hash 等于 `case.caseHash`，还要求 `designSession` 非空 | `packages/core/src/domain/case.js:470-484` |
| `workloom_task_case` review 只读、confirm 必须精确 `expectedCaseHash` + 非空 summary | `packages/core/src/service/case-service.ts:63-120` |
| 最终通过门禁要求 RESULT `status=passed`、caseHash 一致、codeBaseline 非空、checkSession 等于 designSession 或经 fallbackOf 链可达 | `packages/core/src/domain/case.js:626-638`、`packages/core/src/domain/case.js:518-532` |
| CASE 的 `Source task` 字段是硬性必需 | `packages/assets/templates/case.md:13`、`packages/core/src/domain/case.js:404` |
| RESULT 没有 Source task 字段；`codeFingerprint` 只存在于技能约定，core 不解析它 | `packages/assets/templates/case-result.md:1-9`、`packages/assets/skills/workloom-case-active/SKILL.md:27`、`packages/assets/skills/workloom-case-active/SKILL.md:46`、`packages/core/src/domain/case.js:632` |
| check 通过时把 RESULT 的 caseHash/resultHash 写进 `task.case.result` | `packages/core/src/domain/task-store.js:856-870` |

直接推论：

1. 历史归档任务的 `case.caseHash`、`designSession`、`checkSession` 指向旧任务，**在新任务上一定不成立**：hash 由新任务 `case.md` 计算，session 链也只在新任务 `dispatches` 里找（`packages/core/src/domain/case.js:518-532`）。
2. 新任务的 RESULT 必须重新跑 check 会话得到；历史 RESULT 只能作为参考内容，不能作为当前通过凭据。
3. `codeFingerprint` 必须由技能自己写入 `codeBaseline` 并在复用/检查时比对；core 只检查 `codeBaseline` 非空（`packages/core/src/domain/case.js:632`）。

## DSH 与 Pi 的注册是两份清单加一个构建期整目录拷贝，测试把技能名单写死

| 事项 | 锚点与改法 |
| --- | --- |
| DSH 注册清单是 `SKILL.md` 路径数组，注册时读 assets 并解析 front-matter | `packages/adapter-dsh/src/skills.ts:50-61`、`packages/adapter-dsh/src/skills.ts:166-200` |
| DSH 插件启动时调用 `registerSkills(ctx)` | `packages/adapter-dsh/src/plugin.ts:118` |
| Pi 的构建脚本清空 `skills/` 后按 `SKILL_SOURCES` 整目录递归拷贝 | `packages/adapter-pi/scripts/sync-skills.mjs:21-32`、`packages/adapter-pi/scripts/sync-skills.mjs:36-44` |
| Pi 包清单把 `./skills` 声明为技能目录 | `packages/adapter-pi/package.json:21-28` |
| `skills/` 是构建产物、被 gitignore | `packages/adapter-pi/.gitignore:1` |
| DSH 名单测试写死 10 个名字，新增技能必须改数组 | `packages/adapter-dsh/test/skills.test.js:142-158` |
| Pi 构建产物名单测试写死同样的 10 个目录 | `packages/adapter-pi/test/skills.test.ts:20-37` |
| 资产文本测试的样例：front-matter 可解析、关键句、evals 英文断言 | `packages/adapter-dsh/test/skills.test.js:160-214` |
| 英文约束的机器断言（CJK 正则） | `packages/adapter-dsh/test/skills.test.js:196-200` |
| 技能语言纪律句（资产英文、任务文档用项目语言） | `packages/assets/skills/workloom-case-active/SKILL.md:17` |
| 不新增 slash command：命令面只有 init/doctor | `packages/core/src/surface.ts:15-18` |
| 不改 workflow 版本：协议常量 25 与契约 front-matter 25 | `packages/core/src/domain/protocol.js:13`、`packages/assets/workflow/workflow.md:1-2` |
| DSH 的 dist 必须随源码同 commit 重建入库 | `.workloom/spec/repo/deployment/index.md:5-6`；`packages/adapter-dsh/package.json:19-22` |

实现注意：

- DSH 的技能正文是运行期从 assets 包读取的（`packages/adapter-dsh/src/skills.ts:167-190`），所以新增目录不需要复制到 dist；但 `SKILL_ASSETS` 数组在 TS 源码里，必须 `pnpm -r build` 重建 `packages/adapter-dsh/dist/skills.js` 并提交 dist。
- Pi 的副本只在 `pnpm --filter @workloom-ai/adapter-pi build`（`sync-skills.mjs`）时生成；测试前必须先 build，否则名单测试看到的是旧产物。
- `case-active` 已经在新技能缺位时把归档任务路由到 `workloom-case-archived`（`packages/assets/skills/workloom-case-active/SKILL.md:3-4`、`packages/assets/skills/workloom-case-active/SKILL.md:14`），新技能落地后这两句从“占位指向”变成真实指向，不需要再改 case-active。

## 代码指纹直接复用 case-active 的 `task-fingerprint.mjs`；它排除 `.workloom/**`，所以原件清单必须另算

- 指纹语义：HEAD + 相对 HEAD 的 binary diff（排除 `.workloom/**`、`.pi/**`）+ 排序后的 untracked 文件内容，一起取 SHA-256：`packages/assets/skills/workloom-case-active/scripts/task-fingerprint.mjs:7-10`、`packages/assets/skills/workloom-case-active/scripts/task-fingerprint.mjs:14-30`。
- CLI 入口只接受一个 worktree 根：`packages/assets/skills/workloom-case-active/scripts/task-fingerprint.mjs:32-36`；调用样例在 `packages/assets/skills/workloom-case-active/SKILL.md:23`。
- 因为排除 `.workloom/**`，**它不会发现归档原件被改动**；R3 的清单必须独立实现对原始字节取 hash（见上文）。
- 复用路径建议（未验证）：DSH 的 `resourceBase` 指向 `assets/skills/<name>`（`packages/adapter-dsh/src/skills.ts:183-190`），Pi 把技能平铺复制到 `skills/`（`packages/adapter-pi/scripts/sync-skills.mjs:36-44`），两种形态下 `<skill-resource>/../workloom-case-active/scripts/task-fingerprint.mjs` 都存在。技能正文应写这一句，而不是复制第二份指纹实现。

## 三组真实评测沿用 case-active 的夹具/运行/评分设施；只跑带技能组，不带技能组不参与通过判定

| 设施 | 现有锚点 |
| --- | --- |
| 评测定义：`skill_name` + `evals[]`（id/name/prompt/expected_output/assertions/files） | `packages/assets/skills/workloom-case-active/evals/evals.json:1-78` |
| 夹具生成器：临时项目、`.workloom/config.json`（`worktree.enabled=false`）、归档任务、git init/commit | `packages/assets/skills/workloom-case-active/evals/build-fixtures.mjs:6-10`、`packages/assets/skills/workloom-case-active/evals/build-fixtures.mjs:29-89`、`packages/assets/skills/workloom-case-active/evals/build-fixtures.mjs:91-125` |
| 真实运行器：tmux + Pi TUI、`--skill` / `--no-skills`、session JSONL、`run.json` | `packages/assets/skills/workloom-case-active/evals/run-scenario.sh:12-54` |
| 运行产物：`outputs/`、`run.json`、`timing.json`、`grading.json` | `.workloom/tasks/archive/2026-11/case-active-skill/evals/skill-eval/acceptance/eval-1-ready-executes-and-revalidates-fingerprint/with_skill/run-1/{run.json,timing.json,grading.json}` |
| 评分文件形状：expectations[].text/passed/evidence + summary | `.workloom/tasks/archive/2026-11/case-active-skill/evals/skill-eval/acceptance/eval-2-legacy-migrates-and-executes/with_skill/run-1/grading.json:1-35` |
| 计时：total_duration_seconds / total_tokens / session_files | `.workloom/tasks/archive/2026-11/case-active-skill/evals/skill-eval/acceptance/eval-2-legacy-migrates-and-executes/with_skill/run-1/timing.json:1-8` |
| 聚合 benchmark：metadata（skill_name/path/model/runs_per_configuration）+ runs[].result + expectations | `.workloom/tasks/archive/2026-11/case-active-skill/evals/skill-eval/acceptance/benchmark.json:1-40` |
| 人读汇总：Pass rate / Mean duration / Duration range / Notes | `.workloom/tasks/archive/2026-11/case-active-skill/evals/skill-eval/acceptance/benchmark.md:1-23` |
| 静态审阅页 `reviewer.html` | `.workloom/tasks/archive/2026-11/case-active-skill/evals/skill-eval/acceptance/reviewer.html:1-40` |
| 用户反馈 `feedback.json` | `.workloom/tasks/archive/2026-11/case-active-skill/evals/skill-eval/acceptance/feedback.json:1-13` |
| 只跑带技能组、不带技能不评分 | `.workloom/tasks/archive/2026-11/case-active-skill/evals/skill-eval/acceptance/benchmark.md:19`、`.workloom/tasks/archive/2026-11/case-active-skill/evals/skill-eval/acceptance/feedback.json:1-13` |
| 英文断言机器检查 | `packages/adapter-dsh/test/skills.test.js:196-200` |

外部工具（本机实测存在，非仓库锚点，标为环境事实）：`~/.agents/skills/skill-creator/scripts/aggregate_benchmark.py`、`~/.agents/skills/skill-creator/eval-viewer/generate_review.py`；运行器依赖 `pi 0.99.1`、`tmux`、`minimax-cn/MiniMax-M3.1-Flash`（predecessor 使用）。聚合脚本会覆写迭代目录的 `benchmark.json/markdown`，不要对归档目录重跑（predecessor 研究已记录：`.workloom/tasks/archive/2026-11/case-active-skill/research/skill-active-evals.md:130-155`）。

三组新场景的最小断言建议（对应 R13/AC10，建议未验证）：

| 场景 | 夹具 | 必须断言 |
| --- | --- | --- |
| `plan-default-head` | 归档 full 任务带 `plan.md`、prd、jsonl；活跃/light 对照任务 | 新任务来自该归档路径；CASE `Source task` 与 task.json meta 一致；`Code target` 记录当前分支与 40 位 HEAD；原归档清单前后一致；没有把归档任务设成 parent |
| `legacy-design-implement-ref` | 归档 full 任务只有 design.md + implement.md；项目里预置 `ref`（分支或 commit） | 新任务 plan.md 由 legacy 迁移生成并带迁移说明；指定 ref 的完整 commit 与 ref 来源被记录；原件未被删除；清单一致 |
| `prd-only-rebuild` | 归档 full 任务只有 prd.md | 新 PRD 带“PRD-only、无历史 PLAN”显式标记；新 plan 从当前代码重建且通过 `inspectPlanStructure`；没有伪称迁移 |

## test-first 红绿顺序与可执行命令

红阶段（先改测试与清单，再看失败）：

```bash
# 1) DSH 注册与资产缺口：改 test 名单/资产断言 + SKILL_ASSETS，但先不放 SKILL.md
cd packages/adapter-dsh && pnpm run build && node --test test/skills.test.js
# 预期失败：注册名单缺 workloom-case-archived；资产读取 ENOENT 或关键句缺失

# 2) Pi 构建副本缺口：改 SKILL_SOURCES 与名单测试，但先不建技能目录
cd packages/adapter-pi && pnpm run build
# 预期失败：cpSync ENOENT（源目录不存在），构建退出非 0

# 3) 归档脚本缺口：先写脚本测试
cd packages/assets && node --test skills/workloom-case-archived/scripts/archived-task.test.mjs
# 预期失败：Cannot find module './archived-task.mjs'
```

绿阶段与标准验证：

```bash
pnpm lint
pnpm -r typecheck
pnpm -r build
cd packages/core && node --test test/*.test.js
cd packages/adapter-dsh && node --test test/*.test.js
cd packages/adapter-pi && bun test test/*.test.ts
cd packages/assets && node --test skills/workloom-case-archived/scripts/archived-task.test.mjs
```

注意：`packages/assets/package.json:24` 的 `test` 脚本只跑 packages-scan 两个测试，`case-active` 的 `task-fingerprint.test.mjs` 目前是孤儿测试（没有任何包脚本引用）。新脚本测试要么在 PLAN 的 Verify 里显式跑，要么把两处脚本测试补进 assets 的 `test` 脚本；否则标准验证不会覆盖它们。

## 建议的实现文件清单与编排顺序（建议，未验证；不修改实现代码）

新增文件：

| 文件 | 内容 |
| --- | --- |
| `packages/assets/skills/workloom-case-archived/SKILL.md` | 英文正文；front-matter `name/description/whenToUse`；入口分流、单任务选择、预检、清单、建任务、材料迁移、基准记录、CASE 编排、独立归档、失败路径 |
| `packages/assets/skills/workloom-case-archived/scripts/archived-task.mjs` | `list`/`inspect`/`manifest`/`compare`（以及建议的 `annotate`）四个子命令；只用 `node:` 内置模块 |
| `packages/assets/skills/workloom-case-archived/scripts/archived-task.test.mjs` | 列表过滤、路径越界、清单稳定/变更检测、annotate 保字段 |
| `packages/assets/skills/workloom-case-archived/evals/evals.json` | 三个场景（plan-default-head、legacy-design-implement-ref、prd-only-rebuild），断言英文 |
| `packages/assets/skills/workloom-case-archived/evals/build-fixtures.mjs` | 临时 git 项目 + 归档 full/light/活跃任务 + 指定 ref 的预置历史 |
| `packages/assets/skills/workloom-case-archived/evals/run-scenario.sh` | tmux + Pi TUI + `--skill`/`--no-skills` + run/timing/grading 产物 |

修改文件：

1. `packages/adapter-dsh/src/skills.ts:50-61`：在 `SKILL_ASSETS` 增加 `'skills/workloom-case-archived/SKILL.md'`（位置建议紧跟 case-active）。
2. `packages/adapter-pi/scripts/sync-skills.mjs:21-32`：在 `SKILL_SOURCES` 增加 `'../assets/skills/workloom-case-archived'`。
3. `packages/adapter-dsh/test/skills.test.js:142-158`：名单数组加 `workloom-case-archived`；在 `packages/adapter-dsh/test/skills.test.js:160` 之后新增资产断言（front-matter、`archived`/`light`/`plan.md`/`Source task`/`codeFingerprint`/`manifest` 等关键句、evals 三场景英文）。
4. `packages/adapter-pi/test/skills.test.ts:20-37`：产物目录数组加同名项；建议再断言 `SKILL.md`、`scripts/archived-task.mjs`、`evals/evals.json` 确实被复制。
5. `packages/adapter-dsh/dist/skills.js`（及 `.js.map`）：`pnpm -r build` 后同 commit 入库（`.workloom/spec/repo/deployment/index.md:6`）。
6. 可选：`packages/assets/package.json:24` 把新脚本测试加入 `test`（同时可补 case-active 的孤儿指纹测试）。

建议的 SKILL.md 主流程（与 R1-R10 一一对应）：

1. **入口分流**：没有任务路径 → 枚举 `tasks/archive/<YYYY-MM>/<name>/task.json`，只列 `completed` 且 full（`mode` 缺失按 full）的任务，输出标题、路径、`completedAt`，然后停下等用户选（`workloom_task_list` 的局限见上文）。有路径 → 只处理这一个。
2. **预检（失败即停，零写盘）**：路径必须在 `tasks/archive/` 下且不可越界；`status=completed`；不是 light；`prd.md` 可读；材料组合可判定；指定 ref 能 `rev-parse --verify <ref>^{commit}`；`.workloom` 与 git 工作区可用；不要创建任何任务。
3. **记录基准**：在 package 所属仓（`resolveTaskRepo` 口径）解析当前分支与完整 HEAD；用户指定 ref 时解析完整 commit 并记录 `refSource`/`reason`。无法满足指定提交语义时按 R10 停下，不要假装执行。
4. **建任务**：`workloom_task_create`，`title` 用项目语言，显式传英文 kebab `slug`（避免中文标题 slug 为空），`package` 继承源任务且必须在当前 `config.packages` 中，`description` 写当前验证目的，**绝不传 `parent`**。创建后把 `meta.sourceTask`/`meta.codeBaseline`/`meta.verificationPurpose` 原子写入新任务 `task.json`（建议用脚本的 annotate 子命令，2 空格缩进 + 尾换行）。
5. **清单前值**：对新任务 `case-evidence/archive-before.sha256` 写入原件全量清单。
6. **历史材料**：按 PLAN → design+implement → PRD-only 三档读取；只在**新任务目录**写 prd.md/plan.md，归档原件只读；PRD-only 在 H1 下写显式重建标记。载入 `workloom-alignment` 完成 Phase 1.1，按 1.4 先派 review executor 审查 plan.md、处置全部 P0/P1/P2（`packages/assets/workflow/workflow.md:68`），再出 PRD/PLAN/上下文审阅包，用户确认后 `workloom_task_align` confirm → `workloom_task_start`。
7. **CASE 编排**：start 后 `case.required` 自动为 true；实施与 `kind=check, purpose=case-design` 并行；CASE 的 `Source task`/`Code target` 写入归档路径与解析后的基准；review → 用户按 hash 确认 → 同 designSession `purpose=execution` 执行；历史 CASE/RESULT 只作参考。可直接复用 `workloom-case-active` 的 Step 2-5 机制（`packages/assets/skills/workloom-case-active/SKILL.md:25-58`），新技能负责把来源元数据与基准传进设计提示。
8. **收尾**：2.4 提交、2.3 check 记录、3.1 归档新任务（`workloom_task_archive` 必须显式 `taskPath`，`packages/adapter-dsh/src/tasks.ts:165-181`）；最后写 `case-evidence/archive-after.sha256` 并 compare，把差异（应为空）与结论写进 RESULT/证据。
9. **失败路径**：无效归档路径、不可解析 ref、缺 PRD、材料不完整、工作区不可用分别给出明确错误；不启动任务、不改原件、不降验收要求。

## 开放问题（阻塞项，需主会话汇总给用户拍板）

1. **指定 commit ref 的验证目标怎么落地（R6）**：现状 start 只从当前检出分支建 worktree，detached HEAD 被拒（`packages/core/src/domain/worktree.js:296-314`），create/start 没有 base commit 参数（`packages/core/src/service/task-ops.ts:98-115`）。三种可选口径：只记录不改变验证目标；在 scratch detached worktree 里跑只读验证并把产物放进新任务证据；扩展 core 支持 base ref。选哪种直接决定 R6/AC3 的实现与评测断言。
2. **“来源提交”的口径（R4）**：归档任务的 `commit` 字段 85/85 为空（样本 `.workloom/tasks/archive/2026-11/case-active-skill/task.json:20`）。可解析的是归档记账提交（`git log --diff-filter=A -1 -- .workloom/tasks/archive/<...>/task.json`），它不等于历史验证时的代码提交；新格式任务的 RESULT `codeBaseline` 才有更接近的值（`.workloom/tasks/archive/2026-11/case-active-skill/case-result.md:5`）。需要明确记录哪一个、取不到时是 `null` 还是停止。
3. **package 继承规则（R4）**：create 的 `package` 必填且必须是当前 `config.packages` 的键（`packages/core/src/service/task-ops.ts:156-163`）。归档源任务的 `package` 可能已不在当前配置里；需要决定“缺失时停止并让用户选”还是“默认项目根 package”。
4. **单侧 legacy 材料怎么处理（R5/R10）**：归档里有 1 个只有 design.md、2 个只有 implement.md 的任务。R5 只定义了成对迁移；需要明确这是“材料缺失停止”还是“按 PRD-only 重建并标记”；不能静默当成完整迁移。

## 待确认的实现选择（不阻塞，但计划里要写死）

1. 指纹脚本跨技能引用 `<skill-resource>/../workloom-case-active/scripts/task-fingerprint.mjs` 依赖两个技能同时安装；DSH assets 与 Pi 构建副本都满足，但如果未来支持单技能安装会断。备选是复制一份脚本（违背 R11 的“复用”）。
2. 新脚本测试目前不会被 `packages/assets` 的 `test` 脚本自动执行（`packages/assets/package.json:24`，case-active 的指纹测试同样是孤儿）。建议在 PLAN 的 Verify 里显式跑，或补进 package test。
3. `meta.sourceTask` 需要直接写 task.json（没有工具参数支持）；建议由 `archived-task.mjs annotate` 做原子写并保留未知字段，避免手写 JSON 出错。
