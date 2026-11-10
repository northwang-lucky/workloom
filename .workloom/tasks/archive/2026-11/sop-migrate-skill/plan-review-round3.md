tasks/11-06-sop-migrate-skill:mwa4wwpc7ac0ekau — 冲突声明（续前两轮）：任务书要求报告按轮次命名为 plan-review-round3.md（用户规矩优先），执行器指令节默认 plan-review.md；本轮按任务书命名写入 plan-review-round3.md，冲突在此声明一次。

# Plan Review — 迁移 skill（11-06-sop-migrate-skill，第 3 轮）

- 评审对象：`.workloom/tasks/11-06-sop-migrate-skill/plan.md`（110 行，2026-11-10 第三稿）
- 对照材料：同目录 `prd.md`；仓库现码；前两轮报告 `plan-review-round1.md`、`plan-review-round2.md`
- 总结论：**P0 已清零。** 第二轮 16 条意见中 8 条已修好、2 条只修了一部分、6 条未修；本轮另有 1 条 P1（`git add -A` 残留）与若干 P2。不是零发现，但离可开工只差一条命令的改动。

## 一、第二轮 16 条意见逐条复核

状态说明：已修＝按第二轮建议改到位；部分修＝主项改了但留下缺口；未修＝原问题仍在。

| 第二轮编号 | 状态 | 复核证据 |
| --- | --- | --- |
| P0-1 构建时序 | 已修 | S1 Verify L26 与 S4 Verify L68 均前置 `pnpm -r build`，并写明“dsh 经 core dist 解析”的理由 |
| P0-2 测试编辑清单 | 已修 | S4 Target L59 补 command-ops.test L7 未使用导入、L11 `parseInitArgs` 导入删除、L94-107 `.trellis` 用例删除；S5 Target L73 补 locate.test L10 导入删除 |
| P1-1 R2 三项前置 | 已修 | S2 Output L35 的 Preconditions 章列出 git 干净、配置备份、dry-run 预演三项 |
| P1-2 暂存收窄 | 部分修 | S7 Output L105 已改 `git add packages/`；但 Design#6 L10 与 S7 Procedure L107 仍是 `git add -A`，见本轮 P1-1 |
| P2-1 十一条口径 | 已修 | S3 Procedure L51 改为“不动其余十一条” |
| P2-2 Design#2 确认状态 | 已修 | L6 改为“用户 2026-11-10 拍板确认” |
| P2-3 八文件口径 | 已修 | S7 Output L105 写“src 改八文件”并逐项列出 surface、command-ops、index、init.ts、locate.js、locate.d.ts、resources-manifest、dsh commands |
| P2-4 Verify 路径与退出码 | 部分修 | S2 Verify L40 三条命令都带了完整路径，并注明 `grep -c` 零命中退出码 1 即期望；S1 Verify L26 的 `node --check` 仍没有文件参数 |
| P2-5 AC1 八节/七类 | 未修 | plan L40 仍写“AC1 八节加首节”，prd AC1（prd.md L51）仍写“七类章节” |
| P2-6 去重集合正向对照 | 已修 | S6 Output L91 ① 改为 `spawnSync` 子进程跑 loadConfig 并捕获 WARNING；⑦ 也改为子进程检查 |
| P2-7 INERT.md 定义 | 已修 | S2 Output L35 定义 workspace 目录落 `INERT.md` 及首行注记文案；S6 ⑥ 增加“存在且首行为注记”的检查 |
| P2-8 dsh hint | 未修 | S4 Output L63 仍写“改空或删 hint 字段” |
| P2-9 subagents 数组 | 未修 | S1 Output L21 仍写“仅 subagents 且其值非对象 fail loud”，未覆盖数组 |
| P2-10 AC4 口径落点 | 未修 | Design#4 L8 仍只说“理由记进结果”，prd AC4 与任务记录都没有该口径 |
| P2-11 AC1 glob 检查 | 未修 | S3 Verify 只有 manifest 的 grep，没有“目录与两文件存在”的 `test -f` 检查 |
| P2-12 AC5 同 commit 核对 | 未修 | S7 Verify 仍只有“全绿且 git status 仅剩暂存变更”，没有 `git diff --name-only` 的说明 |

## 二、本轮 P1

### P1-1 `git add -A` 仍留在 Design#6 与 S7 Procedure，和 S7 Output 的 `git add packages/` 冲突

- 位置：plan L10（Design#6）、L105（S7 Output）、L107（S7 Procedure ⑤）
- 事实：同一份 plan 里三处口径不一致：
  - Design#6 L10：“S7 执行器 git add -A 收拢、不 commit”；
  - S7 Procedure L107：“⑤ git add -A 收拢，报告清单”；
  - S7 Output L105：“执行器在 worktree 内 `git add packages/` 收窄暂存（不碰 .workloom 簿记）”。
  本轮只改了 Output，执行器实际照 Procedure 干活，仍会走 `-A`。
- 影响：暂存范围的口径回到第二轮的问题。worktree 内 `.workloom` 若是检出内容、执行器没有改动它，`-A` 与 `packages/` 的实际差集可能为空；但计划自身的自相矛盾会让执行器二选一，且一旦 worktree 里有未跟踪文件（例如临时探针、日志），`-A` 仍会带进暂存面。这是本轮唯一决定“能否按现稿执行”的项。
- 修法：L10 与 L107 都改成 `git add packages/`；L107 可写成“⑤ `git add packages/` 收窄暂存，报告清单”。改完这三处口径一致。

## 三、本轮 P2

1. **S1 Verify 的 `node --check` 仍缺文件参数**（plan L26）；S5 Verify 的 `node --test test/locate.test.ts ...`（plan L82）也没写 `cd packages/core`，而它前面的 grep 是仓库根相对路径。把 `node --check` 补成完整脚本路径，S5 的测试命令补 `cd packages/core &&`。
2. **“AC1 八节”与 prd “七类章节”数值不一致**（plan L40 对 prd L51）。plan 现在按 8 个迁移章节加首节命名（`##` 行数期望 9），内容方向是对的；但验收方按 prd 的“七类”逐条核对会卡在数字上。建议主会话校正 prd 的计数措辞，或 plan 注明“AC1 实际列名八项，原文‘七类’按八项执行”。
3. **S4 的 dsh hint 仍写“改空或删 hint 字段”**（plan L63）。空 hint 会在命令面留一个空提示位；直接删 `input` 字段更干净。
4. **S1 的“仅 subagents 且其值非对象”未覆盖数组**（plan L21）。按 JS 的 `typeof`，数组也算 object；`config-defaults.ts:137-142` 的 `requireMap` 会拒数组，但脚本若只判 `typeof` 会把 `subagents: []` 改名成 `roles: []`，要到 loadConfig 才报错，违反 R3 的迁移期 fail loud。改成“非对象或数组”。
5. **S2 的备份口径对全局配置不成立**（plan L35）。“配置迁移前备份原文件（复制为 config.json.bak 或 git 已提交）”把 git 提交当成复制备份的替代；本 skill 的首要用户是 `$HOME/.workloom/config.json`，它在项目仓库之外，git 提交覆盖不到。建议写成“全局配置必须复制 .bak；项目内配置可用提交历史作为等效备份”，两类分开。
6. **AC4 的 eval 口径只落在 plan 里**（Design#4 L8）。prd AC4 原文仍是“跑 skill eval 命令”，plan 改成 `node --test` 并说“理由记进结果”；建议主会话把这个口径写进任务记录（task.json notes 或 check.jsonl），否则 check 阶段按原文复核时还会再对一次。
7. **AC1 的 glob 检查仍没有对应 Verify**（prd L51）。S3 Verify 只检查 manifest 的 grep；建议加 `test -d packages/core/resources/skills/workloom-migrate-to-sop` 与 `test -f` 两个文件，正好补上 AC1 的验证方法。
8. **AC5 的 `git diff --name-only` 同 commit 核对仍未出现在 S7 Verify**（prd L55）。执行器不提交，这一步属于主会话；建议 S7 Verify 注明“主会话提交后跑 `git diff --name-only HEAD~1` 核对 dist 与 src 同 commit”，避免验收时找不到对应动作。

## 四、全量扫描结论

| 维度 | 结论 |
| --- | --- |
| 五字段齐序 | 7 个步骤全部齐备，顺序均为 Input、Output、Preconditions、Procedure、Failure（plan L20-24、L34-38、L48-52、L62-66、L76-80、L90-94、L104-108） |
| AC 覆盖 | AC1→S2/S3/S7；AC2→S1/S6/S7；AC3→S4/S5/S7；AC4→S6/S7；AC5→S7，五条都在 Covers 里 |
| 依赖序 | S3←S2、S5←S4、S6←S1/S2、S7←S1-S6 均成立；S1/S4 的 `pnpm -r build` 不改变依赖序 |
| 锚点 | 本轮修订引入的锚点已核对：S4 的 command-ops.test L7/L11/L94-107、S5 的 locate.test L10、S2 的 prd-structure L35-87 / records L30-33 / create.ts L135-137/L395-400，均与现码一致 |
| 硬约束（不动真实全局配置） | 未发现违反：S6 ⑦ 的全局层夹具在重定向 HOME 下，S1/S6 其余步骤不触达 `~/.workloom/config.json` |
| 新引入矛盾 | 只剩 `git add -A` 与 `git add packages/` 的三处口径冲突（P1-1）；没有新 P0 |

## 五、结论

- **没有 P0。** 第二轮的两条 P0（构建时序、测试导入与残留用例）已修到位，P1-1（三项前置）也已修好。
- **修掉 P1-1（Design#6 与 S7 Procedure 的 `git add -A` 改成 `git add packages/`）后即可开工。** 这条只是三处口径统一，不涉及新设计。
- 8 条 P2 不影响开工，但会影响验收逐条核对；建议同轮顺手改，尤其是第 1、2、7、8 条（Verify 路径、AC1 计数、AC1 glob、AC5 同 commit 核对）。
- 本轮不是零发现；修完后无需再开一轮全面复审，建议执行器在 S7 收尾时按本报告的 P2 清单自检一遍即可。
