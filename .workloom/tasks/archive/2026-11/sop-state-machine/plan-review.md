> 注入标记：tasks/11-06-sop-state-machine:mw5r62rfj98rfksj（协议已读）。冲突申明（仅此一次）：Executor contract 定义的职责是实施前审计 plan.md 并把报告写入本文件，而任务简报与主会话两条即时指令均要求对子任务一、二已合并的六个代码 commit 做追溯只读评审；按主会话最新指令执行追溯代码评审，报告仍按约定写入本文件，全程未改动任何代码、plan.md 与 prd.md。

# 评审报告

## 第一轮：追溯代码评审（子任务一与子任务二已合并 commit）

### 评审范围与方法

- 范围：main 分支六个代码 commit。子任务一 d89b90e；子任务二 62332be、206eaf8、738df44、75e76cb、ae543d4。chore 与簿记 commit 不在范围。
- 简报笔误更正：任务简报写子任务一为 d89b00e，main 分支实际为 d89b90e，本轮按 d89b90e 评审，请主会话更正登记。
- 方法：逐 commit 读 diff 与提交说明，对照 rewrite-reuse-eval.md 的去留判定与基线规则、requirements-addendum.md 的增补决定、sop-cleanup 归档 prd 的三项过渡期裁定；再按八个维度核查 HEAD 终态（包边界、跨包引用、TS 化与可擦除语法、dist 纪律、旧身份残留、死代码孤儿文件、文档口径、测试覆盖）。
- 只读约束：未重建 dist、未复跑测试门禁；dist 一致性按文件清单级比对，加上 206eaf8 与 ae543d4 的同 commit 重建记录佐证。

### 总体结论

不是零意见。未发现 P0。共 15 条：P1 五条（意见 1 至 5），P2 十条（意见 6 至 15）。包收敛、子包边界、跨包引用、可擦除语法、孤儿模块五个维度查验通过；问题集中在 init --purge 文案与行为矛盾、注入 spec 与生产流程文档未随重构更新、dist 纪律曾被破坏且无守卫、注入新主链零测试，以及一批清单与注释残留。

### 编号意见清单

1. P1 — init --purge 的文案与行为矛盾，trellis 迁移链半退役悬空（62332be 新引入，未见过渡期登记）。
   - 锚点：packages/core/src/injection/surface.ts:22；packages/core/src/workspace/command-ops.ts:54-58；packages/core/src/injection/surface.ts:208；packages/dsh-workloom/src/tooling/commands.ts:47,85；packages/core/src/workspace/init.ts:39,114,118；packages/core/src/index.ts:12,14。
   - 问题：62332be 把 init 的命令描述改为 "rerun with --purge to fill in missing pieces"，但 command-ops.ts:54 仍以 detectLegacyTrellis 非空为 purge 前置，无 .trellis 的项目按描述执行 --purge 会直接报 "nothing to purge"，该行为被 command-ops.test.ts:82-92 固化。surface.ts:208 的 PURGE_FLAG 注释仍写"迁移后直接删除旧 .trellis 目录"，实际 migrate.js 已删，现实现不删旧目录（command-ops.test.ts:94 固化"不动旧目录"）。commands.ts:85 注释"可选迁移"同样过期。init.ts 的 legacyTrellisRoot 输出字段全仓零调用方，属死输出；LEGACY_TRELLIS_DIR 与 detectLegacyTrellis 仍挂在包公共入口。
   - 修订建议：短期把描述改为与行为一致（写明 --purge 仅限旧 .trellis 项目，或去掉 .trellis 前置让 purge 成为纯 force 补齐）；长期由子任务六对整条链（locate 检测、init 报告、purge 前置、公共导出、测试）统一裁定去留。
   - 喂给：子任务六（链路归属）；文案矛盾本身可随子任务三先行修正。

2. P1 — 注入用 spec 与仓库现状冲突，子任务三开工即会内联错误规则。
   - 锚点：.workloom/spec/repo/architecture/index.md:3-9；layering.md:5；dependency.md:5-7；executor-voice.md:5；.workloom/spec/repo/code-style/verify.md:6。
   - 问题：architecture 一族仍描述"三包"、assets 内容层、src/domain 纯 JS 无构建、domain/executor-context.js 与 Pi persona 等已不存在的结构；verify.md 仍写"core tests run against dist/, build before testing; adapter-pi tests run with bun test"，而 d89b90e 已切换为 node --test 直跑 TS、撤 build 前缀，adapter-pi 包已撤。这些 spec 经 implement.jsonl 与 check.jsonl 注入执行会话，子任务三 pointer 列表已含 architecture；layering.md 的"domain 纯 JS"规则与子任务三 PRD 假设 4"新代码一律 TS"直接冲突。基线规则 11 只登记了 domain-module spec 归子任务七，architecture 与 verify 的失实无归属裁定。
   - 修订建议：主会话在子任务三实施前以一次独立 chore commit 修正（spec 在 .workloom 内，不涉代码），最晚归子任务七并标注"先于任何注入前修正"。
   - 喂给：立即 chore（推荐）；否则子任务七。

3. P1 — 生产安装与变更流程文档失效，仍写旧包名 adapter-dsh。
   - 锚点：AGENTS.md:38-44；.workloom/spec/repo/deployment/index.md:5-6,8-9。
   - 问题：两处仍写 `github:northwang-lucky/workloom#path:packages/adapter-dsh`、`packages/adapter-dsh/dist/`、`pnpm update @workloom-ai/adapter-dsh`。d89b90e 已把目录与包名改为 packages/dsh-workloom 与 @workloom-ai/dsh-workloom，照文档执行会失败（路径与包名都不存在）。生产切换（容器决定 10）前必须修正，否则重钉锁流程即错。
   - 修订建议：与意见 2 同一 chore 改为 dsh-workloom 命名；deployment spec 顺带补 dist 入库的两条 .gitignore 例外说明，以及"提交前比对 dist 与 src 清单"步骤（呼应意见 4）。
   - 喂给：立即 chore（推荐）；最晚子任务七，且必须早于生产切换。

4. P1 — 62332be 破坏 dist 同 commit 纪律，靠两个后续清理 commit 修复终态，且无守卫防复发。
   - 锚点：62332be 提交说明"dist 同 commit：两包 dist 重建入库"；738df44（清理 executor-context、alignment-service、case、git、identity、journal、migrate 等约 12 组已删模块的 dist 残留）；75e76cb（清理 config.js 与 worktree.js 拆分残留）；packages/core/test/dist-dts.test.ts:19-30。
   - 问题：62332be 删拆了 src 模块，dist 却残留约一万一千行过期编译产物，main 上一度可检出；git 子目录安装无构建步骤，过期 dist 等于过期行为。现有 dist-dts.test.ts 只比对手写 *.d.ts 的内容一致，不校验 dist 与 src 的文件清单镜像，.js 残留对它不可见。终态已由 738df44 与 75e76cb 修复：本轮核查两包 dist 与 src 清单完全镜像，无 .ts 源码混入 dist。
   - 修订建议：新增清单级守卫测试（src 的 .js/.ts 去扩展名集合与 dist 的 .js 集合相等，两包各一份，约二十行），任何 dist 残留直接红；顺带修正 dist-dts.test.ts:5 过期注释"core 的 test 脚本先 build 后测"（build 前缀已撤）。
   - 喂给：子任务三（顺路加守卫）；纪律条目记入增补记录约束子任务三至七。

5. P1 — 注入单一解析新主链 resolveTurnTask 零测试，现有单测只走回退路径。
   - 锚点：packages/core/src/injection/session-assemble.ts（整文件）；requirements-addendum.md:36（观察二）。
   - 问题：resolveTurnTask 是基线规则 5"每轮只解析一次活跃任务"的唯一实现，全仓测试零引用；观察二自述 session-context 与 workflow-service 保留"未注入缓存记录"回退直读、仅供既有单测直连。即 session-context.test.ts 与 inject.test.ts 覆盖的是回退分支，生产主链（dsh plugin.ts 回合缓存加 resolveTurnTask）无行为测试；回退分支本身是生产代码里的测试专用通道。
   - 修订建议：补 resolveTurnTask 直测（命中、未命中、指针缺失三态，与 plugin.ts 回合缓存的组装一致性）；同时评估删除回退直读通道，把 session-context 与 workflow-service 的入口收敛为单一形态。
   - 喂给：子任务四（其观察一已计划 executor 复用 resolveTurnTask 产物，收编时一并补测与收敛）。

6. P2 — failover.js 成死导出，包位置未落定。
   - 锚点：packages/core/src/dispatch/failover.js；packages/core/src/index.ts:36。
   - 问题：62332be 删除 dsh 侧 failover 三文件后，core 的 failover.js 仅剩 index.ts 再导出与 failover.test.ts 自测，无任何真实调用方；rewrite-reuse-eval 改判 2 要求它改造保留并迁往 dsh-workloom，服务派发层单次重试（子任务四范围）。
   - 修订建议：子任务四落地单次重试时把模块迁往 dsh-workloom，failover.test.ts 随迁或重写；迁移前在 index.ts 导出块加注释锚点，防止误当可用能力接入。
   - 喂给：子任务四。

7. P2 — dispatch-binding.js 未按裁定迁移，注释引用两个已退役能力。
   - 锚点：packages/core/src/dispatch/dispatch-binding.js:6,15；调用方 packages/dsh-workloom/src/dispatch/executor.ts:86,512。
   - 问题：eval 裁定"随派发链路搬进 dsh-workloom"未执行，现唯一真实调用方就是 dsh executor.ts；头注释仍写"DSH 与 Pi 的新派绑定构造语义相同，抽到 core 共用"，PARENT_MODEL_LABEL 注释仍引用"失败转移文案与轮换池主模型位"，两者均已退役。
   - 修订建议：子任务四重写派发层时把模块迁往 dsh-workloom，注释随迁移修正为单 runtime 口径。
   - 喂给：子任务四。

8. P2 — NATIVE_TOOLS_DSH（DSH 专属常量）留在 runtime 无关的 core 包。
   - 锚点：packages/core/src/dispatch/executor-tools.ts:16；packages/core/src/index.ts（再导出）。
   - 问题：Pi 清单删除后，唯一的 runtime 专属工具清单仍住在 core，与"core 持 runtime 无关逻辑"的分层口径不一致；eval 只裁定"删 Pi 清单与 runtime 参数"，未裁定清单去向。
   - 修订建议：子任务四重写派发层时评估把清单移入 dsh-workloom，core 只留 runtime 无关的求交合并算法，清单参数化由 adapter 注入。
   - 喂给：子任务四。

9. P2 — prompt-compose.ts 645 行，超 600 行拆分阈值。
   - 锚点：packages/core/src/injection/prompt-compose.ts:1-645。
   - 问题：62332be 新建文件（executor-context.js 902 行的重写产物），仍超全局编码原则的 600 行拆分线；纪律文本已拆往 dsh discipline-text.ts，剩余部分可再按首条组装、增量组装、kind 指令常量分段。
   - 修订建议：子任务四重写 executor prompt 时顺带拆分，不单独立项。
   - 喂给：子任务四。

10. P2 — 仓库元数据描述过期：两个 package.json description、engines 下限、pnpm-workspace 死配置。
    - 锚点：package.json:5,25；packages/core/package.json:4,28；pnpm-workspace.yaml:4-7,10-32。
    - 问题：根 description 仍写"core/assets 经 adapter 插件分发到各 runtime"；根 engines 写 node >=20，与两包 >=22 不一致，且 TS 直跑测试实际依赖 node 的类型擦除能力（>=22.18 或 >=23.6），根下限误导；core description 仍列已退役的 journal 能力；pnpm-workspace.yaml 的 allowBuilds 段注释与条目（@google/genai、protobufjs）为 pi-coding-agent 依赖树而设，锁文件已零引用；minimumReleaseAgeExclude 段 22 条全部钉 @deepseek-ai/*@0.2.0-rc.1，锁文件实际为 0.2.1-rc.2（223 处），0.2.0-rc.1 零命中，整段过期。
    - 修订建议：一次 chore 统一修正：描述改两包口径，engines 对齐 >=22.18，删 allowBuilds 死条目，exclude 段重钉 0.2.1-rc.2 或整段删除。
    - 喂给：子任务七；建议提前为独立 chore（pnpm-workspace 死条目影响供应链检查语义）。

11. P2 — README 首段与状态行失实（首段已登记归子任务七，状态行属新确认）。
    - 锚点：README.md:3,13。
    - 问题：首段"资源层（assets）……面向各 runtime 的官方格式插件"属增补记录观察二已登记项，确认至 HEAD 仍未改；状态行"双端（DSH/Pi）……journal……均已实现并真机验证"不在已登记清单内，Pi 端与 journal 能力均已退役，为本轮新确认。
    - 修订建议：子任务七一并重写首段与状态行；状态行改为单端 DSH，能力清单去掉 journal。
    - 喂给：子任务七。

12. P2 — 四个 spec 小项口径过期，research-facts 模板未登记进 resources-manifest。
    - 锚点：.workloom/spec/repo/language/index.md:5；workflow/index.md:8；terminology/index.md:24；research-facts/index.md:6；packages/core/resources/templates/research-facts.md；packages/core/src/resources-manifest.ts。
    - 问题：language spec 仍写 packages/assets/ 路径且 runtime 文本清单含 journal entries；workflow spec 的 asset-version-bump 指向 packages/assets/workflow/workflow.md 与 domain/protocol.js，实际为 packages/core/resources/workflow/workflow.md 与 src/injection/protocol.js；terminology 的 journal 词条未标退役；research-facts spec 的模板路径仍指 packages/assets。另外 research-facts.md 模板是唯一未登记进 resources-manifest 的模板（其余模板与全部 skills 均已登记），与清单头注释"全部资源条目路径集中在本清单导出"的设计意图不符，当前也无代码读取方。
    - 修订建议：子任务七统一修 spec 路径与词条；research-facts 模板要么登记进 manifest 并修 spec 路径，要么删除，二选一。
    - 喂给：子任务七。

13. P2 — 已登记过渡期条目的全站点清单（非新缺陷，供子任务七一次清完防遗漏）。
    - 锚点：packages/core/resources/skills/workloom-finish/SKILL.md:3；workflow/workflow.md:117,140；workflow-light.md:55；skills/workloom-case-archived/SKILL.md:52,57；裁定出处 .workloom/tasks/archive/2026-11/sop-cleanup/prd.md:27,73。
    - 问题：sop-cleanup 已裁定"finish skill 等文档文案统一归子任务七，含 workloom_journal 引用残留过渡期"。本轮确认 HEAD 残留站点如锚点所列：finish skill 描述仍写 record the session journal；workflow.md 两处、workflow-light.md 一处仍有 journal 簿记与"load workloom-finish to record it"指引；case-archived skill 两处 journal 字样（该 skill 整体已判删除）。62332be 已清理 workflow.md 3.1 节，说明清理是选择性的，清单外的站点易漏。
    - 修订建议：子任务七按本清单一次清理，完成后 grep 复核 workloom_journal 与 journal 在 resources 下零命中（third-party 目录除外）。
    - 喂给：子任务七。

14. P2 — 过期代码注释捆绑（六处，按文件归属窗口分批带走）。
    - 锚点与归属：
      - packages/core/src/index.ts:4-6 头注释仍描述"src/domain/ 纯 JS 加其余 TS"旧分层（domain 目录已撤）→ 子任务三；
      - packages/core/src/task/task-ops.ts:86-89 errPrefix 注释仍列 journal 为调用方（journal 工具已删）→ 子任务三；
      - packages/core/test/dist-dts.test.ts:5 "test 脚本先 build 后测"（build 前缀已撤）→ 子任务三（随意见 4 守卫一起）；
      - packages/dsh-workloom/src/constants.ts:15 "不阻断派发/转移"（转移能力已退役）→ 子任务四；
      - packages/dsh-workloom/cordis.patch.yml:1-2 "把 core/assets 注册为 DSH 原生机制"与"点 7-12 逐步填充"（assets 已撤，旧编号计划已完成）→ 子任务四；
      - packages/core/src/workspace/worktree.d.ts:3 "与 worktree.js 的 JSDoc 保持同步"（worktree.js 已拆为 worktree-lifecycle.ts 与 worktree-integrate.ts）→ 子任务五。
    - 问题：均为注释级失实，不影响行为，但会误导后续执行会话对结构的理解。
    - 修订建议：各随归属子任务顺带两行级修正，或合并为一次注释清理 chore。
    - 喂给：子任务三、四、五（按上述归属）。

15. P2 — 本地工作区遗留 packages/adapter-dsh/node_modules 死目录（非 commit 内容，不影响 main）。
    - 锚点：packages/adapter-dsh/（仅含 node_modules；git 零跟踪、被忽略、无 package.json，不进 pnpm workspace 解析；pnpm-lock 中 adapter-dsh 零引用）。
    - 问题：d89b90e 改名后的本地旧目录壳，会误导人工浏览与全仓文本搜索。
    - 修订建议：主会话本地删除 packages/adapter-dsh 目录即可；本评审只读，未代为处理。
    - 喂给：无需子任务，本地即时清理。

### 通过项（按维度核验，无意见）

- 两包收敛与子包边界：core/src 恰为 task、dispatch、injection、workspace 四子包，根层仅 index.ts 与 resources-manifest.ts；dsh/src 恰为 dispatch、tooling 加根层 index.ts、plugin.ts、constants.ts 三文件；无越界文件。
- 跨包引用：dsh 的 src 全部经裸包名 '@workloom-ai/core' 入口引用，无深路径；core 无反向依赖 dsh；dsh tsconfig 无 paths 直连 core src 的旁路。
- TS 化与可擦除语法：全部 .ts 无 enum、namespace、构造函数参数属性、装饰器；tsconfig.base.json 配好 rewriteRelativeImportExtensions 与 verbatimModuleSyntax；存量 JS 加手写 d.ts 属 domain-module 过渡形态，已登记归子任务七退役。
- dist 终态：两包 dist 与 src 文件清单完全镜像，dist 无 .ts 源码混入；206eaf8 与 ae543d4 均为 src 与 dist 同 commit（过程问题见意见 4）。
- 旧身份与旧包：git 跟踪文件中 adapter-dsh、adapter-pi、assets 包零残留（docs/research 历史研究文档除外，属存档性质）；TOOL_NAMES 无 workloom_journal；ERR_PREFIX 无 journal 键；identity、journal、migrate 模块清零；.workloom/config.json 包映射与 .gitignore dist 例外均已更新（文案级残留见意见 10 至 14）。
- 死代码与孤儿文件：src 全量扫描无零引用孤儿模块；worktree-integrate 与 setup-executor 经 worktree-lifecycle 与 doctor 链路间接覆盖；例外为意见 1 的 legacyTrellisRoot 死输出与意见 6 的 failover 死导出。
- 测试覆盖主体：case 三拆分模块经 case.test 与 doc-review 链路覆盖；doctor 经 doctor.test 覆盖；workflow 约定文本有 contract-asset、subtask-contract、dist-dts 三重守卫；dsh 的 continuation 与 receipt 经 executor.test 的 continue_executor 与 fork 场景间接覆盖；缺口见意见 5。

### 局限与备注

- 只读评审：未重建 dist、未复跑测试门禁；dist 一致性结论基于文件清单级比对与同 commit 记录，内容级新鲜度由 206eaf8、ae543d4 的同 commit 重建佐证（core 侧 206eaf8 后无 src 变更，dsh 侧 ae543d4 后无 src 变更）。
- 三项已登记过渡期条目（finish 文案、kind 值域、.developer 忽略行）未计为新意见，仅在意见 13 提供站点清单。
- 无阻塞项，无需要用户裁决的开放问题。
