# workflow 文档与 skill 改写

## Context

重构至今代码面已全面翻新：三模式状态机与 completed 终态（子任务三/五）、五角色派发与 Judger 评审轨（子任务四）、subtasks 嵌套与级联归档（子任务五）、workloom-migrate-to-sop 与 trellis 链清零（子任务六）、rotate_on_busy 轮换恢复（子任务八）。但文档与资源面仍讲旧故事：workflow.md 骨架藏着旧面叙述与 grilling 引用、3.1 段（L124）残留 archived 旧句、五处 stage 旧值；5 个 skill 目录待撤除；case 两模板未沉淀执行轮连踩的格式教训；spec 多条目过期（含 notes 第三节已被子任务八推翻的 rotate 点）；叙述漂移面广——README/AGENTS 首段、surface.ts 归档提示、session-context 已删 skill 指路句、finish 描述 journal 句、约 15 处现行时态 Pi 注释；dsh 四测试文件无 HOME+TMPDIR 隔离。本子任务按容器 skill 去留决策与各处登记一次收口，是容器最后一个子任务。

## Goal

文档与资源面与现行行为零漂移。可观察：workflow.md 全量对齐现行面；五个 skill 目录撤除与换口径完毕（manifest 12→7）；case 两模板承载 Checker 纪律与格式样例；task-fingerprint 迁入新家且可发现；退役 spec 更新；叙述层四组关键词白名单外零命中；dsh 四测试补齐隔离；全量验证绿。

## Scope

包含：

1. 删除类 skill 撤除：workloom-case-archived、workloom-continue、workloom-migrate-plan、grilling（third-party/mattpocock-skills/grilling）、workloom-case-active（并入删除）五目录整删；manifest SKILL_ENTRIES 摘至 7 条；dsh skills.test 清单契约同步 7 条、直读用例处置（case-active/case-archived/migrate-plan 三组整删，continue/finish 组合用例拆为 finish-only 保留）。
2. task-fingerprint 迁移：packages/core/resources/skills/workloom-case-active/scripts/ 下脚本与测试 git mv 至 packages/core/resources/scripts/，core package.json test 脚本 glob 增补，resources 内引用改新路径；可发现性由 case.md 纪律注释块承载（不加 manifest 常量）。
3. case-active 方法论提炼：删除前把 SKILL.md 四组要点摘进任务目录 methodology-notes.md 供模板改写消费。
4. case.md 模板改写：front-matter 后增 HTML 注释块 checker-discipline（块内只用 - 列表、禁行首 ##；四组要点含 task-fingerprint 包内相对路径），Runtime Cases 增构建时序条，Coverage 增排除模式语义注释。
5. case-result.md 模板改写：格式纪律样例做进正文（裸 0 逐字样例行、表下纪律正文、双反引号 Exclusions 样例表、Overall lines 形态、Resolved/Open issues 的 - none 样例与末节约定）。
6. workflow.md 锚点清单改写：grilling 清零（L31/L169）、3.1 旧句改 completed（L124，保留 missing/reason/trace 子句）、五处 stage 新值（L79/L110/L136/L155/L156）、补 11 工具归属句与 autonomy 三值及 source 审计句；front-matter version 保持 25；同步 contract-asset/protocol/session-context 钉住面。
7. 保留类 skill 换口径：workloom-alignment 改写（grilling 指代清除含 evals.json 7 行、补 autonomy 审计口径）；workloom-finish 描述去 journal；workloom-packages-scan 与 workloom-update-spec 核对无不一致。
8. 退役 spec 更新：terminology（L10/L11 改五角色、L19/L24 退役条目删除、L5 删 Pi 示例不改定义句、L20 旧 hash 口径；L9 assets 词条不动）、workflow（transport-failover 单跳+roles 配置面+rotate 有效+legacy 退役、asset-version-bump 路径）、language（L5 journal entries 与 packages/assets 整句）、research-facts（L6 路径）、code-style/concurrency（L8 Pi）。
9. 叙述层清理：README 首段与 L13 状态行、AGENTS 首段、surface.ts 归档提示（L276/L278）、workflow.md L117/L140 与 workflow-light.md L55 的 journal 句、prompt-compose（L330-331 JSDoc 按 frontend-developer 与 checker 双门禁口径改写，L344 字符串本体保留）与 task-ops（L484）叙述句、alignment/evals/evals.json:146 journal、.prettierignore L8-L11、15 处现行时态 Pi 注释（protocol.js、surface.ts、prompt-compose、dsh 三源码文件与四测试行 14 处，加 terminology L5 归 Scope 8 共 15 处——以 grep 实单为准，4 处带注记历史句入白名单）；末轮四组关键词白名单外零命中收口。
10. dsh 四测试文件补 HOME+TMPDIR 隔离块：commands/skills/plugin/dist-mirror。

不包含（non-goals）：

1. 生产 pin 切换与全局配置实迁：容器决定 10。
2. 代码行为变化：纯文档/资源/测试隔离面与叙述性代码文案，不改运行时语义。
3. 归档区既有文档的旧引用：归档不动。
4. third-party 的 tdd 与 writing-for-agents：保留不动（其 journal/Pi 字样入白名单）。
5. workflow.md front-matter version 升级：结构未变，协议握手指纹不动。
6. UI 设计不适用；test-first 不适用。

## Assumptions, Constraints and Dependencies

1. skill 去留清单为容器 session 拍板终稿；rotate 口径以现行代码与子任务八裁定为准（notes 第三节该点已过期）。
2. 钉住面共四份测试：subtask-contract（13 条短语 L22-70）、contract-asset（46 用例多组固定串，含 L158-166 面包屑、L349-365 alignment 句、L851 禁词 stale/idempotent/SHA-256）、protocol（版本相等）、session-context（指路句四处）——文档改动必须同步断言。
3. task-fingerprint 新路径 resources/scripts/，可发现性经 case.md 纪律块以包内相对路径表述（scripts/task-fingerprint.mjs）。
4. dsh 测试隔离沿用 core 的 mkdtemp 重定向惯例。
5. 改写 skill 文档前按全局规则先读 writing-for-agents 与 skill-creator。
6. 外部依赖：无。

## Requirements

- R1: 五个 skill 目录整删；manifest SKILL_ENTRIES 12→7；dsh skills.test 清单契约 7 条且直读用例按三组整删加 finish 拆分处置；workflow.md grilling 清零（S6 交付）。
- R2: task-fingerprint 两文件 git mv 至 resources/scripts/；core package.json test glob 增补；旧路径全 resources 零引用（归档区除外）；case.md 纪律块含包内相对路径。
- R3: case.md 增 checker-discipline HTML 注释块（四组要点、块内禁行首 ##）、Runtime Cases 构建时序条、Coverage 排除模式语义注释。
- R4: case-result.md 五处样例前置：裸 0 逐字样例行、表下纪律正文、Exclusions 双反引号样例表、Overall lines 形态、Resolved/Open issues 的 - none 样例。
- R5: workflow.md 锚点改写齐备：grilling 零、3.1 completed 口径（保留留痕子句）、五处 stage 新值、11 工具归属与 autonomy/source 审计句、version 不变；contract-asset/protocol/session-context 测试同步。
- R6: alignment 换口径（grilling 7 行清除、autonomy 审计段）；finish 描述去 journal；packages-scan/update-spec 核对无不一致。
- R7: spec 更新按现行口径：terminology 五角色与退役条目、workflow 的 transport-failover（单跳、roles 配置面、rotate 有效、legacy 退役）与 asset-version-bump、language/research-facts/code-style 的 Pi/assets/journal 条目。
- R8: 叙述层清理面：README/AGENTS、surface.ts 归档提示、workflow 两文件 journal 句、prompt-compose 与 task-ops 叙述句、alignment evals journal、.prettierignore、约 15 处现行时态 Pi 注释；末轮四组关键词白名单外零命中。
- R9: dsh 四测试补 HOME+TMPDIR 隔离，commands.test 的 doctor 耐受不回归。
- R10: dist 同 commit（manifest 变更进 dist 重建），全量验证绿。

## Acceptance Criteria

- AC1: 覆盖 R1——五目录不存在、manifest 恰 7 条、skills.test 全绿（直读用例处置完成）、workflow.md 零 grilling。验证方法：ls 五路径；grep 计数 7；node --test test/skills.test.ts 绿；grep -ci grilling workflow.md 为 0（退出 1 即期望）。
- AC2: 覆盖 R2——新目录两文件、test glob 含 resources/scripts、旧路径零命中（归档区除外）、case.md 纪律块含包内相对路径。验证方法：ls；grep package.json glob 行；grep -rn case-active/scripts 零命中（归档区除外）；grep checker-discipline 块内 scripts/task-fingerprint.mjs。
- AC3: 覆盖 R3/R4——两模板各新增点逐字命中（checker-discipline 四组关键词、bare 0 样例行、双反引号 Exclusions 样例、- none 样例）。验证方法：grep 关键词清单逐条。
- AC4: 覆盖 R5/R6——workflow.md 命中新关键词组（autonomy、implementing、checking、completed、workloom_task_complete、workloom_task_finish、workloom_task_list、workloom_task_autonomy）且旧词组零命中；四份钉住测试全绿；finish 无 journal。验证方法：grep 新旧对照（含 11 工具名全量 grep）；node --test 四份测试；grep -ci journal finish/SKILL.md 为 0。
- AC5: 覆盖 R7/R8——spec 新口径命中；四组关键词白名单外零命中，白名单命中逐条列明。四组 = journal/workloom_journal、Pi、packages/assets、旧角色键形态（`"(research|implement|check|frontend|review)":` 与 `roles\.(research|implement|check|frontend|review)\b`）。白名单 = third-party 保留件、docs/research、任务簿记与归档、dist、LEGACY_KIND 与旧配置键兼容读面（config.test.ts:452 等）、带注记历史句四处（dispatch-binding.ts:7、executor-settle.ts:72、executor-capacity.ts:18、executor.test.ts:2522）。验证方法：grep spec 新口径行；四组 grep 逐组跑并对照白名单固定清单（plan 文末）逐条核对。
- AC6: 覆盖 R9/R10 与全部——全量验证绿、dist 同 commit、暂存路径齐备。验证方法：pnpm -r build/typecheck、pnpm lint、两包 node --test 全 0；git diff 核对 dist 与 manifest 同 commit；暂存含 packages/、README.md、AGENTS.md、.workloom/spec。

## Edge Cases and Failure Paths

1. 四份钉住测试的同步义务：任一行文档改写先对 pin-checklist 核对断言；断言更新须记录在案。
2. 改写中新发现未登记漂移（如 2.2/2.3 步骤号注释 8 处）：记容器增补记录，本任务不改；已登记项（terminology L20）按 Scope 8 执行。
3. skills.test 契约与 manifest 强耦合：任一侧漏改即红。
4. dsh 四测试隔离后 doctor 耐受路径变化：commands.test 单独复核。
5. checker-discipline 注释块内若出现行首 ## 会被 sectionMap 解析：块内只用 - 列表。
6. Pi 改写面以执行时 grep 实单为准（约 15 处），带注记历史句 4 处（dispatch-binding.ts:7、executor-settle.ts:72、executor-capacity.ts:18、executor.test.ts:2522）入白名单。

## Risks and Open Questions

none：对齐一轮八问全按推荐收敛；AC5 范围与 Pi 边界经用户裁定（白名单制、15 改写加 4 白名单）。

## Alignment Decisions

1. task-fingerprint 迁 resources/scripts/，可发现性由 case.md 纪律块承载（推荐 A，Q1；不加 manifest 常量）。
2. Checker 纪律内联 case.md 模板头部（推荐 A，Q2）。
3. case-result.md 把格式纪律做进模板正文样例（推荐 A，Q3）。
4. 删除类 skill 整目录撤除加全连带（推荐 A，Q4）。
5. workflow.md 全量改写对齐现行（推荐 A，Q5）。
6. 退役 spec 本任务直接改（推荐 A，Q6）。
7. dsh 四测试隔离本轮顺手补齐（推荐 A，Q7）。
8. 叙述层一次清完加 grep 收口（推荐 A，Q8）；AC5 白名单制、Pi 15 改写加 4 白名单经用户裁定。
9. 收敛摘要：一轮八问全按推荐；评审增补裁定两项；四项概念解释记入 Notes。

## References

1. 注释清理登记：tasks/archive/2026-11/sop-roles/notes-stale-comments.md（第三/四/六节；第三节 rotate 点已被子任务八推翻，以代码为准）。
2. 需求增补记录：.workloom/tasks/11-06-sop-refactor/requirements-addendum.md。
3. 重写复用评估基线：.workloom/tasks/11-06-sop-refactor/rewrite-reuse-eval.md（skill 去留行）。
4. 现行工件：workflow.md、workflow-light.md、templates/case.md、templates/case-result.md、resources-manifest.ts、spec 五个条目文件、surface.ts、session-context.ts。

## Notes

1. task-fingerprint：CASE 执行轮 C5 给被验代码算 64 位十六进制指纹写入 case-result codeBaseline；迁入 resources/scripts/ 后由 case.md 纪律块以包内相对路径指路。
2. 叙述层定义：不执行的描述性文字（README/AGENTS 首段、skill 正文、注释叙述、fixture 名词、面向用户的代码文案）。
3. 钉住面四清单：subtask-contract 13 短语、contract-asset 46 用例固定串（含面包屑与 alignment 两组及 L851 禁词）、protocol 版本相等、session-context 指路句四处——改写前必先核对。
4. 改写 skill 文档前主会话与执行轮均须先读 writing-for-agents 与 skill-creator。
