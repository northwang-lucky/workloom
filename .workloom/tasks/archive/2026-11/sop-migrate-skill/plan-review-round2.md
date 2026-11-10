tasks/11-06-sop-migrate-skill:mwa4wwpc7ac0ekau — 冲突声明（续首轮）：任务书要求报告按轮次命名为 plan-review-round2.md（用户规矩优先），执行器指令节默认 plan-review.md；本轮按任务书命名写入 plan-review-round2.md，冲突在此声明一次。

# Plan Review — 迁移 skill（11-06-sop-migrate-skill，第 2 轮）

- 评审对象：`.workloom/tasks/11-06-sop-migrate-skill/plan.md`（110 行，2026-11-10 重写稿）
- 对照材料：同目录 `prd.md`；仓库现码（core/dsh 两包 src、test、dist 与 `node_modules` 链接形态）；首轮报告 `plan-review-round1.md`
- 总结论：**首轮 25 条意见中 22 条已按建议修好，3 条只修了一部分；但重写稿新引入 2 条 P0，仍然不能按现稿开工。** 本轮另有 2 条 P1、12 条 P2。不是零发现。

## 一、首轮意见逐条复核

状态说明：已修＝按首轮建议改到位；部分修＝主项改了但留下缺口；未修＝原问题仍在。

| 首轮编号 | 状态 | 复核证据 |
| --- | --- | --- |
| P0-1 脚本加载路径 | 已修 | Design#1 L5、S1 Output L21 改为 `../../../../dist/index.js`；S1 Verify L26 增加了仓库布局与模拟发布布局的双解析探针 |
| P0-2 index.ts 导出面 | 已修 | S4 Target L59 与 Output L63 明确列了 L286（只导 `executeInitCommand`）与 L332（删 `PURGE_FLAG`） |
| P0-3 dsh 调用面 | 已修 | S4 Target L59 列入 dsh commands L29/L47/L86-87/L99 与 dsh commands.test L116-132；Output L63 给了逐条改法。测试编辑另有遗漏，见本轮 P0-2 |
| P0-4 init 语义 | 已修 | Design#2 L6 与 S4 Output L63 写死“恒定 `initWorkloom(cwd, { force: true })`”；force 参数保留、init.test.ts 不动；两条用例的删改写进 S4。遗留“待用户确认”字样，见本轮 P2-2 |
| P1-1 章节与 AC1 | 已修 | S2 Output L35 改为与 AC1 清单逐个同名（Preconditions / Task directory migration / Document format rewrite / Config field migration / Migration ledger / Re-run after failure / Dry run / Completion checklist，另加 When to use）；Verify L40 首个 grep 带路径。遗留“七类/八节”数值，见本轮 P2-5 |
| P1-2 目录迁移可执行化 | 已修 | S6 Output L91 ⑥ 增加测试内目录重排 helper、父子 fixture 与 children 路径更新；⑦ 增加全局层夹具。遗留“标 inert”未定义，见本轮 P2-7 |
| P1-3 AC4 eval 形态 | 已修 | Design#4 L8 声明本任务的 skill eval 命令即 `node --test test/migrate-to-sop.test.ts`，并说明 case-active 的 tmux 驱动不适用 |
| P1-4 force 参数裁定 | 已修 | Design#2 明确保留公开参数；S4 Input L62 写清报错路径仅直调可达、保留 |
| P1-5 fail loud 补齐 | 已修 | S1 Output L21 增条目非对象、`subagents` 非对象、改名目标键已存在三处 fail loud；Failure L24 同步 |
| P1-6 workspace/.developer 处置 | 已修 | S2 Output L35 写保守策略：历史内容保留并标 inert、`.developer` 删除前须用户确认、`.gitignore` 旧行可删 |
| P1-7 权威引用 | 已修 | S2 Input L34 增 `prd-structure.ts L35-87`、`records.ts L30-33`、`create.ts L135-137/L395-400`，三处行号与现码一致 |
| P1-8 注释归属 | 已修 | S4 Target 增 surface L7 与 init.ts L74-80；S5 Target 增 init.ts L111-112 |
| P1-9 英文文案 | 已修 | S1 Output L21 的 usage、build 指引、NOOP、Done 全部改为英文；Procedure L23 同步 |
| P2-1 manifest 口径 | 部分修 | S3 Input L48 已改“11 条：8 自有加 3 third-party”；但 Procedure L51 仍写“不动其余十条”，见本轮 P2-1 |
| P2-2 resources 与 dist | 已修 | S7 Input/Output L104-105 明确 resources 不进 dist、dist-mirror 只比 src/dist |
| P2-3 提交口径 | 已修 | Design#6 L10 与 S7 L105 统一为“执行器只暂存不提交，主会话落单一 work commit” |
| P2-4 skill 用户视角 | 已修 | Design#3 L7 与 S2 Output L35 去掉 pin 切换与“本子任务验收”措辞 |
| P2-5 六合法字段 | 已修 | S1 Input L20 改为六字段并列 |
| P2-6 dry-run/NOOP/写回格式 | 已修 | S1 Output L21 写死 `NOOP: config already migrated`、dry-run 计划行、2 空格缩进、结尾换行、键序保持 |
| P2-7 WARNING 正向对照与全局夹具 | 部分修 | S6 ① 增正向对照、⑦ 增全局层夹具；但“去重集合重置”不可行，见本轮 P2-6 |
| P2-8 S2 Verify 可执行 | 部分修 | 首个 `grep -n` 已带路径；`sed -n '1,6p'` 与 `grep -c ... SKILL.md` 仍缺路径，且零命中时 `grep -c` 退出码为 1，见本轮 P2-4 |
| P2-9 SKILL 正文禁 trellis/purge | 已修 | S2 Output L35 与 Procedure L37 明确禁止；Verify L40 增加零命中检查 |
| P2-10 S4 Verify 不再预期红 | 已修 | S4 Verify L68 改为 typecheck 加三组测试全绿；但未处理 core dist 时序，见本轮 P0-1 |
| P2-11 落账落点 | 已修 | S2 Output L35 定义 `.workloom/migration-log.md` 与最小字段 |
| P2-12 surface 头注释 | 已修 | S4 Target L59 列入 surface L7，Output L63 给了改法 |

## 二、本轮 P0（按现稿执行必失败）

### P0-1 S4 的 Verify 在 core dist 重建之前跑 dsh 检查，必红

- 位置：plan L68（S4 Verify 的 `pnpm -r typecheck` 与 dsh 测试）、L63（S4 把 dsh 调用改为单参）、L105/L107（build 只排在 S7）
- 事实：dsh 通过 `packages/dsh-workloom/node_modules/@workloom-ai/core -> ../../../core` 的符号链接解析 core，而 `packages/core/package.json:9-14` 的 exports 把 types 与 import 都指向 `dist`。当前提交里的 `packages/core/dist/workspace/command-ops.d.ts:27` 仍是两参签名 `executeInitCommand(cwd: string, rawInput: string)`。S4 把 dsh 调用改成单参后：
  - `pnpm -r typecheck` 的 core 段只检查 src，能过；dsh 段用旧 `dist/index.d.ts` 检查源码，报 TS2554（Expected 2 arguments, but got 1）；
  - 即便类型检查被绕开，dsh 测试运行时也走旧 dist 的 purge 分支，改写后的“二次 init 输出 already complete”用例会红。
  S1 的 Verify 已从首轮的“先 `pnpm -r build`”改成纯路径探针，S7 才 build，所以 S4 这个时点没有新的 core dist。
- 影响：S4 的 Verify 必红，执行器卡在 S4；这不是执行器临场发挥能补的，需要在计划里补 build 步骤。
- 修法：S4 Verify 开头加 `pnpm -r build`（递归构建会按依赖序先出 core dist 再出 dsh dist），或先 `pnpm --filter @workloom-ai/core build` 再跑 dsh 检查；Procedure 同步注明“先重建 core dist，再验 dsh”。S7 的最终 build 保留不变。

### P0-2 S4/S5 的测试编辑清单仍不完整，两个测试文件加载即失败

- 位置：plan L59/L63（S4 的 command-ops.test 编辑）、L73/L77（S5 的 locate.test 编辑）
- 事实：
  1. `packages/core/test/command-ops.test.ts:11` 仍是 `import { executeInitCommand, parseInitArgs } from '../src/index.ts'`。S4 把 `index.ts` L286 改成只导 `executeInitCommand` 后，该测试文件在模块加载阶段就报 “does not provide an export named 'parseInitArgs'”，S4 Verify 的 core 测试段整组失败。计划只写“删 parseInitArgs 用例组”，没写改导入。
  2. 同文件 `:94-107` 的“executeInitCommand 带旧 .trellis 时骨架照常落盘且不动旧目录”用例没有进删改清单。若按计划删掉 `seedLegacy`（`:28-32`，被 `:70`、`:97` 使用），这个用例会因引用未定义函数直接失败；若保留夹具，`.trellis` 又会撞上 S5 的“测试夹具名清零”门禁。两条路都走不通，必须显式删掉或改写这个用例。
  3. 删掉 `seedLegacy` 与 `:94-107` 后，`command-ops.test.ts:7` 的 `existsSync, mkdirSync, writeFileSync` 变成未使用导入（`existsSync` 只在 `:101` 用、`mkdirSync`/`writeFileSync` 只在 `:30-31` 用），S7 的 `pnpm lint` 会报 `@typescript-eslint/no-unused-vars`。
  4. `packages/core/test/locate.test.ts:10` 仍是 `import { findWorkloomRoot, detectLegacyTrellis, insideWorkloom }`。S5 删掉 `detectLegacyTrellis` 导出后，该文件加载即失败，S5 Verify 的 locate 段整组红。计划只写删两处用例（`:39-47`、`:136-144`），没写改导入。
- 影响：S4/S5 的 Verify 红；S7 lint 红。
- 修法：S4 Target/Output 增列 `command-ops.test.ts` 的 L7 导入清理、L11 只导 `executeInitCommand`、L94-107 用例删除（该用例测的是 purge 时代的 `.trellis` 兼容，已无对应行为）；S5 Target/Output 增列 `locate.test.ts:10` 的导入清理。

## 三、本轮 P1

### P1-1 R2 的“git 工作区干净（或先提交）”在 S2 规程内容里消失

- 位置：prd R2（prd.md L42）；plan Design#3 L7、S2 Output L35
- 事实：重写后的 plan 全文没有“git 工作区干净/先提交”的要求（`grep 工作区` 零命中）。Design#3 只列“先备份、先 dry-run、真实全局配置改写需用户确认”；S2 Output 把统一前置压缩成 `## Preconditions` 一个标题，没有列前置内容。R2 明确要求统一前置包含“项目 git 工作区干净（或先提交）”和“配置迁移前备份原文件”；备份在 Design#3 有，git 干净完全没有落点。
- 影响：按 S2 Output 字面写出的 SKILL.md 会缺 R2 要求的一项统一前置，AC1 的“前置检查”章内容不达标；这是相对首轮的回归（首轮 S2 Output 写有“git 工作区干净或先提交”）。
- 修法：S2 Output 明确 Preconditions 章写三条：git 工作区干净（或先提交）、配置迁移前备份原文件（写清备份命名与位置）、dry-run 预演；S2 Verify 增一条按关键词核对。

### P1-2 S7 的 `git add -A` 会混入任务簿记，与 Design#6 的簿记单独提交冲突

- 位置：plan L10（Design#6）、L101（S7 Target“任务 worktree 暂存面”）、L105/L107（`git add -A`）；`.workloom/tasks/11-06-sop-migrate-skill/task.json:22`（`worktree_path` 为空）
- 事实：本任务没有 worktree，执行器在主 checkout 工作；仓库当前已有 `prd.md`、`task.json`、`check.jsonl`、`implement.jsonl` 的修改和未跟踪的 `plan.md`、`plan-review-round1.md`。`git add -A` 会把它们全部暂存，正好与 Design#6 的“簿记另走主会话 chore commit”相反；commits 规范也把“功能与无关文档改写混在一个 commit”列为反例。
- 影响：暂存面混入任务文档，主会话若直接 commit 会把代码与簿记混在一起；S7 Verify 的“git status 仅剩暂存变更”也会把簿记一起算进去，变更清单失真。
- 修法：S7 改成 `git add -A packages/` 或显式列出 8 个 src、3 个 resources、4 个 test 与两包 dist；S7 Target 的“任务 worktree 暂存面”改为“主 checkout 的 packages/ 暂存面”。

## 四、本轮 P2

1. **S3 “不动其余十条”应为十一条**（plan L51）。`resources-manifest.ts:53-65` 现有 11 条，新增 1 条后其余是 11 条；改成“不动其余十一条”。
2. **Design#2 仍写“（裁定 A，待用户确认）”**（plan L6），与用户 2026-11-10 已拍板确认矛盾；删掉“待用户确认”，改为“已确认”。
3. **S7 的变更计数“src 改六文件”少了两个**（plan L105）。实际是 8 个：S4 的 surface.ts、command-ops.ts、index.ts、init.ts、dsh commands.ts，S5 的 locate.js、locate.d.ts，S3 的 resources-manifest.ts。
4. **S2/S1 的 Verify 仍不能原样执行**（plan L40、L26）：S2 的 `sed -n '1,6p'` 没有文件参数、`grep -c 'trellis\|purge' SKILL.md` 用相对路径且零命中时退出码为 1（会打断 `&&` 链）；S1 的 `node --check` 也没有文件参数。补路径，零命中检查改成 `grep -q ... || true` 或明确核对输出“0”，`node --check` 写全脚本路径。
5. **“AC1 八节”与 prd AC1 的“七类章节”数值不一致**（plan L40 对 prd L51）。plan 现在按 8 个迁移章节加首节命名，方向是对的；但验收方若按 prd 的“七类”逐条核对会卡在数字上。建议主会话校正 prd 的计数措辞，或 plan 里注明“AC1 实际列名八项、原文‘七类’按八项执行”。
6. **S6 ① 的“去重集合重置”不可行**（plan L91）。`warnedLegacyRoleKeys` 是 `config-subagent.ts:30` 的模块私有 Set，没有导出，测试无法重置；只能子进程隔离。另外若 ① 在父进程内跑，① 已经把旧键写进去重集合，② 的“零 WARNING”就会被污染——同一个旧键不会再告警，② 失去对“迁移后仍带旧键”的检出能力（键值检查还能兜住改名失败，但 WARNING 语义的验收失真）。把 ① 写死为“子进程运行并捕获输出”，② 留在父进程。
7. **S6 ⑥ 的“标 inert”没有定义标记方式**（plan L91）。是写进 `.workloom/migration-log.md` 的一行 `retained/inert`，还是往 workspace 里放标记文件？二选一写死，否则 helper 与 SKILL.md 各写各的。
8. **S4 的 dsh hint 应直接删字段**（plan L63）。“改空或删 hint 字段”留了空 hint 的选项，空提示仍会占命令面的输入提示位；直接删 `input` 字段更干净。
9. **S1 的“subagents 值非对象”应写成“非对象或数组”**（plan L21）。按 JS 的 `typeof`，数组也算 object；`config-defaults.ts:137-142` 的 `requireMap` 会拒数组，但脚本若只判 `typeof` 会把 `subagents: []` 改名成 `roles: []`，要到 loadConfig 才报错，违反 R3 的迁移期 fail loud。
10. **AC4 的 evals 口径只落在 plan 里**（Design#4 L8）。prd AC4 原文仍是“跑 skill eval 命令”，plan 改成 `node --test` 并说“理由记进结果”；建议主会话把这个口径写进任务记录（check.jsonl 或 task.json notes），否则 check 阶段按原文复核时还会再对一次。
11. **AC1 的 glob 检查没有对应 Verify**（prd L51）。S2/S3 各自检查了内容和登记，但没有一条命令检查“skill 目录与 SKILL.md、migrate-config.mjs 两文件存在”；建议在 S3 Verify 加 `test -f` 两文件加 `test -d` 目录。
12. **AC5 的 `git diff --name-only` 同 commit 核对未出现在 S7 Verify**（prd L55）。执行器不提交，这一步属于主会话；建议 S7 Verify 注明“主会话提交后跑 `git diff --name-only HEAD~1` 核对 dist 与 src 同 commit”，避免验收时找不到对应动作。

## 五、全量扫描结论

| 维度 | 结论 |
| --- | --- |
| 五字段齐序 | 7 个步骤全部齐备，顺序均为 Input、Output、Preconditions、Procedure、Failure（plan L20-24、L34-38、L48-52、L62-66、L76-80、L90-94、L104-108） |
| AC 覆盖 | AC1→S2/S3/S7；AC2→S1/S6/S7；AC3→S4/S5/S7；AC4→S6/S7；AC5→S7，五条都在 Covers 里 |
| 依赖序 | S3←S2、S5←S4、S6←S1/S2、S7←S1-S6 均成立；S4 新增的 dsh 面不改变依赖序，但暴露了 P0-1 的构建时序 |
| 锚点 | 重写后的新锚点已核对：index L38/L40/L145、index L17/L19/L286/L332、dsh commands L29/L47/L86-87/L99、command-ops L13/L15/L23-29/L53-59、locate.js L18/L36-37、locate.d.ts L5/L17、init.ts L74-80/L111-112、prd-structure L35-87、records L30-33、create.ts L135-137/L395-400，均与现码一致 |
| 硬约束（不动真实全局配置） | 未发现违反：S6 ⑦ 的全局层夹具在重定向 HOME 下，S1/S6 其余步骤不触达 `~/.workloom/config.json` |
| 新引入矛盾 | 2 条 P0（dist 时序、测试导入与残留用例）、2 条 P1（R2 git 干净回归、`git add -A` 混入簿记），其余为措辞或计数问题 |

## 六、结论与开工前动作

- **不能按现稿开工。** 先修 P0-1（S4 Verify 加 core dist 重建）与 P0-2（补齐 command-ops.test / locate.test 的导入与残留用例），这两条决定 S4/S5 的 Verify 能否过。
- 建议一并修 P1-1（补回 git 工作区干净前置）与 P1-2（`git add -A` 改 `packages/`），否则 R2 覆盖和提交纪律仍有缺口。
- P2 可在同一轮顺手改，尤其是 S3 的“十一条”、S7 的“八文件”、Design#2 的“待用户确认”和 S2/S1 的 Verify 路径，改动很小但会直接影响验收时的逐条核对。
- 本轮不是零发现；修完后建议按同一脚本再核一轮 S4/S5 的测试编辑面，确认没有第三处未列出的导入或用例。
