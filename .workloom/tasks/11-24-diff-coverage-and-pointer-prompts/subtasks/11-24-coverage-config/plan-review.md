tasks/11-24-diff-coverage-and-pointer-prompts/subtasks/11-24-coverage-config:mwuk0d11xlwi52c4
Executor contract 为权威；与 task prompt 无实质冲突（五项核查清单与四维审计互补，一并执行）。

# plan-review — S4 覆盖率工具配置驱动与内置默认

## 第 1 轮评审（2026-11-24）

评审对象：plan.md（170 行，9 步）。对照 prd.md 与真实代码逐项核查。

### 结论

无 P0。P1 共 7 项，P2 共 6 项。锚点全部真实唯一，AC1–AC6 与 R1–R8 的 Covers 覆盖完整，核心设计（整数交叉乘、Cobertura 解析、fail loud schema）正确。主要缺口集中在：脚本阈值与 command 行为未定义、格式提示机制未定义、90% 文案调用方遗漏、测试隔离与失败通道未指定、packages-scan 检测路径未定。建议修订 plan 后再进入实现。

### 锚点核查（全部通过）

| plan 锚点 | 真实位置 | 结果 |
| --- | --- | --- |
| config.d.ts WorkloomConfig L2-32 | packages/core/src/workspace/config.d.ts:2-32 | 吻合 |
| DEFAULT_CONFIG L14-38 | packages/core/src/workspace/config-defaults.ts:14-38 | 吻合 |
| mergeWithDefaults L311-394 | packages/core/src/workspace/config-load.ts:311-394 | 吻合 |
| worktree 分支 L367-392 | packages/core/src/workspace/config-load.ts:367-392 | 吻合，未知子字段 fail loud 先例在 L370-377 |
| CoverageFormat L59 / meetsThreshold L102 / inferFormat L112 / EXECUTABLE_EXTENSIONS L26 | packages/core/src/task/coverage-compute.ts:59,102,112,26 | 吻合 |
| case-gates meetsThreshold 调用处 | packages/core/src/task/case-gates.ts:429 | 唯一调用点（src 内） |
| task-diff-coverage.mjs | packages/core/resources/scripts/task-diff-coverage.mjs（97 行） | 存在 |
| packages-scan SKILL Workflow/检测节 | packages/core/resources/skills/workloom-packages-scan/SKILL.md:11-20,57-59 | 存在 |
| config-edit SKILL 白名单节 | packages/core/resources/skills/workloom-config-edit/SKILL.md:19-34（Disk field whitelist，8 行表） | 存在 |
| 步骤 8/9 测试与 spec 目标 | config.test.ts、coverage-compute.test.ts、case.test.ts、contract-asset.test.ts、task-diff-coverage.test.mjs、scan-packages.test.ts、.workloom/spec/repo/workflow/index.md | 全部存在 |

### 覆盖核查

- AC1→步骤 1/2/3/8；AC2→2/3/4/5/8；AC3→4/8；AC4→6/8；AC5→7/8；AC6→8/9。无遗漏。
- R1→1；R2→2/3；R3→4；R4→5；R5→4；R6→6；R7→7；R8→8/9。无遗漏。
- 对齐决策全部落实：默认 90 严格 >、cobertura 原生解析、项目层字段、经 config skill 写入、S4 同步清单。无超范围改动（S2 注入、全局 config、S1 增量口径均未触碰）。
- Edit 五字段（Input/Output/Preconditions/Procedure/Failure）9 步齐全有序；Procedure 为行为伪代码，无 after-code。

### P1 发现

#### P1-1 步骤 5：脚本现状描述失实，阈值与 command 的使用行为未定义

- plan 锚点：plan.md:90-91（Input/Output）。
- 证据：task-diff-coverage.mjs:14-15 只 import computeDiffCoverage、gitDiffChangedLines、DIFF_COVERAGE_ARTIFACTS；main（L72-92）只做交集计算与输出，没有任何阈值判定，也不 import meetsThreshold。plan Input 称"脚本现硬编码阈值（经 meetsThreshold 缺省）"与事实不符。
- 问题：Output 说"meetsThreshold 传配置阈值"，但未定义阈值产生什么可观察行为（markdown 行？JSON 字段？退出码？）；command 渲染也没有使用方——脚本输入是报告正文，不执行采集命令，渲染结果给谁用未说明。AC2"脚本读配置阈值与格式提示"因此无法确定性测试。另 parseArgs（L40）拒绝未知选项，新增 --threshold 需同步改 FLAGS 与 USAGE。
- 修正建议：更正 Input；写明阈值输出面（如 renderMarkdown 增加 Threshold/Pass 行、JSON result 增加 threshold 字段）与 --threshold 的优先级（CLI > config > 默认 90）；写明 command 渲染用途（如输出采集命令骨架供 Checker 参考），若用途不在本脚本则把该行为移出步骤 5 重新锚定。

#### P1-2 步骤 3/5：command 占位符白名单未封闭，渲染值来源与常量位置未定义

- plan 锚点：plan.md:60、91、96（"<worktree>/<profile> 等"）。
- 证据：config-defaults.ts:57-61 SETUP_PLACEHOLDER_TOKENS 是模块私有常量，仅覆盖 setup 场景（<worktree>/<source-checkout>）；renderSetupCommand（L69-78）接收 values 对象逐 token 替换；assertPlaceholders（L173-180）可复用。
- 问题："等"使白名单开放，违反 fail loud 设计；parseCoverage（workspace 层，加载期校验）与脚本渲染（运行期）必须共用同一白名单，plan 未指定常量落点与导出；<profile> 的渲染值由谁提供未定义。
- 修正建议：在 config-defaults 新增封闭常量 COVERAGE_COMMAND_PLACEHOLDERS 与 renderCoverageCommand（与 renderSetupCommand 同节），导出供脚本复用；逐一列出占位符及渲染值来源（如 <profile> = 输出报告路径，由调用方传入）；parseCoverage 与渲染共用该常量。

#### P1-3 步骤 4：格式提示机制未定义，含 go-coverprofile→go 字面量映射

- plan 锚点：plan.md:74、78（"computeDiffCoverage 可选格式提示入参……inferFormat 优先用提示"）。
- 证据：ComputeDiffCoverageInput.reports 是纯文本数组（coverage-compute.ts:93-99），报告不带语言标签；CoverageFormat 用 'go'（L59），config 枚举是 'go-coverprofile'（prd R1），两套字面量不同。
- 问题：lang→format 映射如何落到逐报告推断未定义（按哪些变更文件的语言？多语言多报告时哪条提示作用于哪份报告？）；R2"未配置语言走内置默认"要求提示解析合并 LANGUAGE_DEFAULTS，plan 只写 config languages；"优先用提示"可能覆盖正确的机械推断，提示与推断不一致时的行为未定义。
- 修正建议：写明解析规则（变更文件经 detectLanguage 归类 → config.languages[lang] ?? LANGUAGE_DEFAULTS[lang]）、逐报告应用规则与优先级（建议仅在推断 unsupported 时用提示兜底，或提示与推断冲突即 err）；显式写出 'go-coverprofile'→'go' 映射。

#### P1-4 步骤 4/8/9：硬编码 90% 文案调用方遗漏

- plan 锚点：plan.md:76-79（步骤 4 只参数化 meetsThreshold）、149（红绿清单）、164（spec 只新增条目）。
- 证据：case-gates.ts:431 'below_threshold requires incremental coverage <= 90%'、L434 'incremental coverage must be >90%...'；resources/workflow/workflow.md:97、113 两处 90% 句被 contract-asset.test.ts:1148-1149 逐字 pin；.workloom/spec/repo/workflow/index.md:9 incremental-coverage 条目写死 "Threshold is strictly greater than 90% (`covered*100 > total*90`)"。
- 问题：阈值配 80 时门禁报错文案仍说 90%，误导 Checker；code-style red-green-expectations（spec/repo/code-style/index.md:18）要求从全部调用方推导红绿清单，plan 步骤 8 的清单漏了这批文案调用方。
- 修正建议：门禁两条 issue 文案用配置阈值参数化；workflow.md 措辞做出明确决策（建议改为"默认 90，可经 coverage.threshold 配置"并同步 contract-asset pin；按 asset-version-bump 条目，guidance 文本改动不 bump version）；步骤 9 同步更新 incremental-coverage spec 条目的阈值句。

#### P1-5 步骤 4/5：loadConfig 的测试隔离与失败通道未指定

- plan 锚点：plan.md:77、80（"loadConfig 失败 → 门禁 err"）、94、97。
- 证据：loadConfig 全局层读 $HOME/.workloom/config，本机该文件真实存在（含 subagent_profiles）；case.test.ts 与 task-diff-coverage.test.mjs 均无 HOME 隔离（grep 无 HOME/homeDir）；dsh-workloom/test/executor.test.ts:39-45 明确记录此陷阱并重定向 HOME。门禁返回 CaseStructureIssue[]，ISSUE_CODES（case-gates.ts:38-74）无 config 错误码；guards.ts:219-224 只 join issue message，loadConfig 抛错会直接穿透守卫。
- 问题：门禁/脚本内嵌 loadConfig(root) 后，既有夹具测试依赖本机全局配置，换机器可能整体红；"门禁 err"未指明是新增 issue code 还是抛错穿透，失败路径行为不完整。
- 修正建议：指定失败通道（新增 ISSUE_CODES 条目如 config_invalid，或明确抛错语义与调用方处理）；受影响测试按 executor.test.ts 先例重定向 HOME，或在 CaseStructureOptions 加 homeDir/config 注入缝。

#### P1-6 步骤 4：门禁读 config 的 root 未指定（主检出 vs worktree）

- plan 锚点：plan.md:77（"evaluateCaseOutcomeGate loadConfig 读 coverage.threshold"，未写 root 参数）。
- 证据：guards.ts:220 传入 ctx.root（主检出）；worktreeDirectory（case-scope.ts:30-34）在 worktree 模式返回任务 worktree；步骤 5 脚本用 loadConfig(worktree)。
- 问题：worktree 模式下任务期经 config-edit 写入的 coverage 配置落在 worktree 分支的 .workloom/config.json；门禁若 loadConfig(root) 读到的是 base 分支配置，任务期配置的阈值不生效。两处读取口径还可能不一致。
- 修正建议：锚定 loadConfig(worktreeDirectory(root, task))，与脚本同口径（worktree 未启用时该函数返回 root，行为不变）；若坚持 root，需说明任务期配置可见性。

#### P1-7 步骤 6：语言检测路径二选一未定，单测目标未定义

- plan 锚点：plan.md:113（"scan-packages.mjs 可选输出语言检测（或 SKILL 指引 agent 检测）"）、116（Verify "packages-scan 单测"）。
- 证据：scan-packages.mjs:16-21 只 import 本地 fs-utils/glob-expand，只读 manifest，不引 core dist；AC4 验证方法为"packages-scan 单测 + grep 引用"。
- 问题：两条路径测试面不同。脚本检测需新增文件遍历或 manifest 语言推断并落 scan-packages.test.ts；SKILL 指引则脚本无新行为，"单测"只能落 contract-asset 文本 pin。plan 未选定，实现与验证都无法确定。检测来源（扩展名遍历 vs manifest）也未指定。
- 修正建议：选定一条路径。脚本侧：锚定 import dist/task/coverage-compute.js 的 LANGUAGE_DEFAULTS/EXTENSION_LANGUAGE（先例 task-diff-coverage.mjs:14），写明检测来源与测试文件；SKILL 侧：把 contract-asset 文本 pin 明确为验证手段并写入步骤 8。

### P2 发现

#### P2-1 skill frontmatter 与 packages-scan Boundaries pin 联动未列

- plan 锚点：plan.md:124-131（步骤 7 只改白名单表与示例）、110-113（步骤 6）。
- 证据：config-edit SKILL.md:3 description 逐一列举 8 个触发字段；packages-scan SKILL.md:64 Boundaries 句被 contract-asset.test.ts:1205-1208 逐字 pin，文案限定 "this scan's `packages` candidates"。
- 修正建议：步骤 7 把 coverage 补进 description 触发列表；步骤 6 若改 Boundaries 措辞（packages 与 coverage 候选），步骤 8 同步改 pin；packages-scan description（L3）顺带提及 coverage 提议。

#### P2-2 阈值默认 90 多处重复，缺共享常量；校验器文案不匹配

- plan 锚点：plan.md:21（DEFAULT_CONFIG threshold 90）、59（meetsThreshold 缺省 90）。
- 证据：code-style enums 规则（spec/repo/code-style/index.md:6）；requireNonNegativeInt（config-defaults.ts:117-122）错误文案为 "(0 means unlimited)"，与 threshold 语义不符。
- 修正建议：config-defaults 导出 DEFAULT_COVERAGE_THRESHOLD，coverage-compute 引用（task→workspace 先例 coverage-compute.ts:15）；threshold 用专用范围校验器或自定义文案，避免复用 unlimited 措辞。

#### P2-3 EXTENSION_LANGUAGE 与 EXECUTABLE_EXTENSIONS 双源，一致性未钉

- plan 锚点：plan.md:52（Target 列 EXECUTABLE_EXTENSIONS）、61（EXTENSION_LANGUAGE 全量后缀）。
- 证据：coverage-compute.ts:26-29 注释已写"与 S4 内置语言对齐；扩展需先改本常量"；isExecutableFile（L38-41）排除 .d.ts。步骤 3 Target 列了该常量但 Edit 未改动它，也未加一致性校验。
- 修正建议：EXTENSION_LANGUAGE 键集与 EXECUTABLE_EXTENSIONS 互相推导，或加一致性测试；写明 detectLanguage 未命中返回 null，以及 .d.ts 的归类口径（语言检测可归 typescript，可执行判定仍排除）。

#### P2-4 parseCoberturaXml 根缺失错误路径未写；混合格式用例缺失

- plan 锚点：plan.md:42、45（Failure 仅 XML 解析失败与歧义）、146（测试清单）。
- 证据：parseJacocoXml 根缺失返回 err（coverage-compute.ts:243）；combineFormats（L120-124）对新格式值通用。
- 修正建议：补 <coverage> 根缺失 err（对齐 jacoco 先例）；步骤 8 增加含 cobertura-xml 的混合格式合并用例（R2 多报告合并的 ripple 钉）。

#### P2-5 Verify 命令工作目录不一致，部分步骤无可执行命令

- plan 锚点：plan.md:29（cd packages/core）、47/65/82（core 相对路径）、99（仓库根相对路径）、116/133（文字式验证）、166（lcov 无命令）。
- 证据：步骤 1 cd 进 packages/core 后，步骤 5 的 `node --test packages/core/resources/scripts/task-diff-coverage.test.mjs` 在该目录下不存在；S3 plan（11-24-config-edit-skill/plan.md:145-146）已有现成双包 lcov 采集命令。
- 修正建议：统一工作目录或逐步写明 cd；步骤 6/7 给出具体 grep 命令与目标文件；步骤 9 引用 S3 plan 的 lcov 命令形态。

#### P2-6 LANGUAGE_DEFAULTS command 骨架内容未列

- plan 锚点：plan.md:60（"各 command 骨架"）。
- 证据：prd R2 交付物含 command 骨架；prd Risks 已接受"模板给骨架 + Checker 按任务实例化"，但骨架本身应在 plan 定型。
- 修正建议：plan 列出 8 语言骨架命令（如 go：`go test -coverprofile=<profile> ./...`；python：`coverage run -m pytest && coverage lcov -o <profile>`；java/kotlin：mvn/gradle jacoco 报告；rust：cargo llvm-cov --lcov），至少固定占位符用法，供评审校验。

### 核查通过项（无发现）

1. meetsThreshold 整数交叉乘正确：threshold 80 时 800*100=80000 不大于 1000*80=80000（80.0 拒），801*100>80000（80.1 过）；缺省 90 语义保持。
2. meetsThreshold 唯一调用点 case-gates.ts:429；thresholdBasis（L384）已区分机械复算与自报数，参数化一处即覆盖两分支，AC3 回退阈值硬作用天然成立。
3. GLOBAL_PROJECT_ONLY_FIELDS（config-load.ts:58）加 coverage 正确：全局层 L287 先查项目专属字段并报对应错误；GLOBAL_ALLOWED_TOP_FIELDS 不加 coverage，符合"不进全局白名单"。
4. 未知子字段 fail loud 对齐 worktree 分支先例（L370-377）；parseCoverage 对齐 parsePackages 先例；assertPlaceholders 可直接复用。
5. parseCoberturaXml 复用 resolveReportPath（L173-189）后缀匹配与多候选歧义 err；err 首位元组与兄弟解析器一致；inferFormat 以根标签区分 jacoco（<report>）与 cobertura（<coverage>），规则不冲突。
6. CoverageFormat 调用方核查：combineFormats、parseReport、脚本 renderMarkdown 均按值通用；dsh-workloom src 无 CoverageFormat/meetsThreshold 引用（grep 空）。ripple 面仅 parseReport 分支与测试，plan 已覆盖。
7. config.d.ts 为手写锚点，copy-domain-dts.mjs 构建后自动覆盖 dist 并校验导出子集，步骤 1 类型改动无需额外 dist 类型工序。
8. 非内置后缀不在 EXECUTABLE_EXTENSIONS，缺席硬拒不误伤（R5"不误判非可执行"由 S1 机制保持）。
9. 步骤 9 dist 同 commit 符合 deployment spec；spec 条目英文符合 language spec；提交归主会话，符合执行者纪律。

### 阻塞项

无。全部发现均可由 plan 作者修订解决，无需用户裁决的未决问题。

## 第 2 轮评审（2026-11-24）

评审对象：plan.md Round 2 修订版（177 行，9 步）。逐条核对 Round 1 发现闭合，重审锚点、五字段、AC 覆盖与 ripple。代码侧自首轮以来无改动（git 核对 packages 与 spec 干净）。

### 结论

无 P0。P1 共 1 项，P2 共 5 项。Round 1 七项 P1 中六项闭合，formatHints 机制部分闭合（计算侧改动无步骤锚点、调用方构造规则仍缺）；六项 P2 中四项闭合，其余残留并入本轮 P2。建议补齐 formatHints 步骤落地后即可进入实现。

### Round 1 闭合核对

| Round 1 发现 | Round 2 处置 | 判定 |
| --- | --- | --- |
| P1-1 脚本现状与行为 | 步骤 5 Input（L99）与真实代码吻合；--check 按配置阈值输出 pass/fail，缺省只产 JSON；renderCoverageCommand 用途指明 | 闭合 |
| P1-2 占位符白名单 | COVERAGE_PLACEHOLDER_TOKENS 封闭三 token，值来源明确（L11）；共享函数命名 | 闭合（落点一致性残留见 P2-R2-1） |
| P1-3 格式提示机制 | FORMAT_NORMALIZE、内容优先、unsupported 才回退、冲突以内容为准（L10） | 部分闭合（见 P1-R2-1） |
| P1-4 90% 文案 ripple | 步骤 4 Target 列 L431/434、workflow L97/113、spec L9；步骤 8 pin 更新入红绿清单（L156-157） | 闭合 |
| P1-5 隔离与失败通道 | coverage_config issue 通道（L82/85/89）；HOME 隔离引 executor.test 先例（L16/91/109/150） | 闭合 |
| P1-6 config root | loadConfig(worktreeDirectory(root,task))（L12/85），锚 case-scope L30-34 | 闭合 |
| P1-7 检测路径 | 钉死脚本检测输出 languages，AC4 单测目标明确（L15/121） | 闭合（Verify 文件名笔误见 P2-R2-2） |
| P2-1 description/Boundaries | config-edit 侧已列（L130/134/138） | 部分闭合（packages-scan 侧见 P2-R2-3） |
| P2-2 阈值共享常量 | DEFAULT_THRESHOLD 导出（L8/63） | 部分闭合（单源贯穿见 P2-R2-1） |
| P2-3 EXTENSION 单源 | 键派生 + 一致性测试（L14/68/154） | 闭合（detectLanguage 细节见 P2-R2-5） |
| P2-4 cobertura err/混合 | 根缺失 err（L49/52）+ 混合格式用例（L54/154） | 闭合 |
| P2-5 Verify 精度 | 步骤 9 注明 <WT> 根（L177） | 部分闭合（见 P2-R2-2） |
| P2-6 command 骨架 | go 与 ts/js 命令列出（L67） | 部分闭合（见 P2-R2-4） |

### P1 发现

#### P1-R2-1 formatHints 计算侧改动无步骤锚点，调用方同序构造规则未定义

- plan 锚点：plan.md:10（Design）、87（步骤 4 Procedure）、104（步骤 5 Procedure）；步骤 2/3/4 的 Target 与 Output。
- 证据：ComputeDiffCoverageInput 在 coverage-compute.ts:93-99，现无 formatHints 字段；computeDiffCoverage 的格式映射在 L335（input.reports.map(inferFormat)），回退逻辑需改此处。步骤 4 Target（L78）只列 case-gates.ts、workflow.md、spec index，不含 coverage-compute.ts；步骤 2/3 Output 均未声明新增 formatHints 入参与回退逻辑。
- 问题一（落地）：Design L10 描述的 computeDiffCoverage 入参扩展与"unsupported 才回退 hint"逻辑，没有任何步骤的 Target/Output 承接。严格按步骤执行会漏掉计算侧改动，AC2 的 formatHints 用例无法通过。
- 问题二（构造）：formatHints 与 reports 同序，但调用方如何从 lang→format 映射构造同序数组仍未定义——报告与语言的关联规则缺失（按变更文件语言归类？单一格式广播？），LANGUAGE_DEFAULTS 对未配置语言的合并（config.languages[lang] ?? LANGUAGE_DEFAULTS[lang]）只在 Design 末句隐含，步骤 4 L87 只写 config languages。两个实现者会写出不同构造，AC2 测试不确定。
- 修正建议：把 coverage-compute.ts（ComputeDiffCoverageInput L93-99、computeDiffCoverage L335）补进步骤 2 或 4 的 Target，Output/Procedure 写明入参字段与回退逻辑（formats[i] 为 unsupported 时取 hints[i]，否则以内容为准）；写明调用方构造规则（建议：变更文件经 detectLanguage 归类，取 config.languages[lang] ?? LANGUAGE_DEFAULTS[lang] 经 FORMAT_NORMALIZE；单一格式时广播至全部报告，多语言时逐报告关联或退化为纯推断，选定一种写死）。

### P2 发现

#### P2-R2-1 共享工具落点与单源贯穿不一致

- plan 锚点：plan.md:8（DEFAULT_THRESHOLD 单源声明）、28（DEFAULT_CONFIG.coverage={threshold:90}）、63（步骤 3 Output 落 coverage-compute）、106（步骤 5 "renderCoverageCommand 导出"）。
- 证据：config-defaults.ts:1-11 自述为校验器叶子模块；coverage-compute.ts:15 已有 task→workspace 引文先例；workspace→task 亦有先例（doctor-check-rules.ts:31-41），且依赖链无环（git-query/case-structure 均不引 config，已核）。
- 问题：Design L8 声称"单源……消除 90 硬编码散落"，但步骤 1 L28 仍写字面量 threshold:90，未引用 DEFAULT_THRESHOLD，单源未贯穿；COVERAGE_PLACEHOLDER_TOKENS 与 renderCoverageCommand 落 coverage-compute（task），而步骤 1 parseCoverage（workspace 叶子）要引用，叶子模块将耦合覆盖率计算链；步骤 5 L106 又说脚本"导出 renderCoverageCommand"，与步骤 3 落点矛盾。
- 修正建议：推荐常量与渲染函数落 config-defaults（renderSetupCommand 同节先例），coverage-compute 反向引用（task→workspace 先例 L15）；若坚持落 coverage-compute，步骤 1 必须 import 引用 DEFAULT_THRESHOLD 与 COVERAGE_PLACEHOLDER_TOKENS（不得字面量 90），并删改步骤 5 L106 的导出表述，明确 packages-scan 直接从 dist 引。

#### P2-R2-2 Verify 精度残留：文件名笔误、工作目录混用、命令不具体

- plan 锚点：plan.md:125（步骤 6 Verify）、36/54/73/91（core 相对路径）、109（仓库根相对路径）、141（步骤 7 prose）、173（步骤 9 lcov prose）。
- 证据：真实测试文件为 scan-packages.test.ts 与 scan-packages-git.test.ts（glob 核对），plan 写 scan-packages.test.js，命令直跑会失败；SKILL.md:59 本身也残留 .test.js 旧引用（plan 笔误疑似沿袭此处）。步骤 1 cd packages/core 后，步骤 2-4 用 core 相对路径、步骤 5-6 用仓库根相对路径，未声明统一约定。
- 修正建议：步骤 6 Verify 改 .test.ts（顺带修 SKILL.md:59 旧引用）；统一各步工作目录（建议全部 <WT> 根 + 完整相对路径，或逐步写明 cd）；步骤 6/7 的 grep 给出模式与目标文件；步骤 9 引用 S3 plan（11-24-config-edit-skill/plan.md:145-146）的 lcov 采集命令。

#### P2-R2-3 packages-scan description/Boundaries 联动未列

- plan 锚点：plan.md:114（步骤 6 Target 仅 Workflow）、146/156（步骤 8 pin 清单）。
- 证据：packages-scan SKILL.md:3 description 只述 packages 候选产出；L64 Boundaries 句被 contract-asset.test.ts:1205-1208 逐字 pin，文案限定 "this scan's `packages` candidates"。
- 问题：扫描新增 coverage 候选后，description 与 Boundaries 措辞未同步更新。Boundaries 句严格意义上仍真（coverage 写入确经 config skill），不改不红；但 description 触发面与扫描产出描述已不准确。
- 修正建议：步骤 6 顺带更新 description（提及 coverage.languages 提议）；若改 Boundaries 措辞（packages 与 coverage 候选），步骤 8 同步更新对应 pin。

#### P2-R2-4 六语言 command 骨架内容仍未列出

- plan 锚点：plan.md:67（"python/rust/c/cpp→lcov，java/kotlin→jacoco-xml（骨架列出）"）。
- 证据：prd R2 交付物含 8 语言 command 骨架；plan 实际只列 go 与 ts/js 两条命令，其余六语言标注"骨架列出"但内容不在 plan 文本。
- 修正建议：补列 python（如 coverage run -m pytest && coverage lcov -o <profile>）、rust（cargo llvm-cov --lcov --output-path <profile>）、c/cpp（gcovr --lcov -o <profile>）、java/kotlin（mvn test jacoco:report / gradle jacocoTestReport）骨架，固定占位符用法。

#### P2-R2-5 细节措辞残留

- plan 锚点：plan.md:68（detectLanguage）、32（threshold 校验）、88（issue 文案）。
- 问题与修正建议：
  1. detectLanguage 未命中返回值（建议 null）与 .d.ts 归类口径未写明（isExecutableFile 在 coverage-compute.ts:38-41 排除 .d.ts，语言检测可归 typescript，两者口径需注明）。
  2. threshold 校验复用 requireNonNegativeInt 会带 "(0 means unlimited)" 文案（config-defaults.ts:117-122），与阈值语义不符，建议专用范围校验或自定义 reason。
  3. issue 文案"configured threshold (default 90%)"建议插值实际阈值（如 must be >80%），配 80 时文案仍只显示 default 90% 会误导 Checker。

### 重审通过项

1. 9 步锚点全部真实唯一（新增锚点 SETUP_PLACEHOLDER_TOKENS L57-61、GLOBAL_PROJECT_ONLY_FIELDS L58、case-scope L30-34、workflow L97/113、spec L9、contract-asset L1148-1149、脚本 L14-15 均核对吻合）；唯一例外是 P2-R2-2 的测试文件名笔误。
2. Edit 五字段 9 步齐全有序；AC1–AC6、R1–R8 Covers 全覆盖；无 after-code。
3. coverage_config 新 issue code 无豁免：test 目录无 ISSUE_CODES 穷举 pin（grep 空），加值安全。
4. .workloom/config.json 为 git 跟踪文件（git ls-files 核对），worktree 含已提交配置，loadConfig(worktreeDirectory) 选择成立；worktree 未启用时该函数返回 root，行为不变。
5. 共享常量跨子包引用无模块环：coverage-compute 依赖链（git-query、case-structure→prd-structure）均不引 config-defaults/config-load；workspace→task 有 doctor-check-rules 先例。落点为耦合取舍问题，非可行性障碍。
6. workflow.md L97/113 属 guidance 文本改动，按 asset-version-bump 条目不 bump version，plan 未 bump 正确。
7. HOME 隔离引 executor.test.ts:39-45 先例成立；脚本测试经 execFileSync 子进程继承 env，隔离可达。

### 阻塞项

无。P1-R2-1 与五项 P2 均可由 plan 作者修订解决，无需用户裁决。

## 第 3 轮评审（2026-11-24）

评审对象：plan.md Round 3 修订版（179 行，9 步）。逐条核对 Round 2 发现闭合，重审锚点、五字段、AC 覆盖与 ripple。代码侧无改动（git 核对 packages 与 spec 干净）。

### 结论

无 P0。P1 共 1 项，P2 共 4 项。Round 2 的 P1-R2-1 已闭合（计算侧锚点与构造规则钉死，核对真实代码吻合）；五项 P2 中三项闭合、两项部分闭合。新增 P1：ts/js command 骨架含白名单外占位符 <tests>，与封闭白名单自相矛盾，packages-scan 提议写入 config 的流程在 ts/js 项目必然被拒。不能写零发现结论；修正 P1-R3-1 后即可进入实现，P2 可顺带处置。

### Round 2 闭合核对

| Round 2 发现 | Round 3 处置 | 判定 |
| --- | --- | --- |
| P1-R2-1 formatHints 落地 | 步骤 2 Target/Output/Procedure 补 ComputeDiffCoverageInput L93-99 与格式映射 L335（L41/45/52）；步骤 4/5 钉死构造规则（L88/105：恰一种语言→单格式广播 config ?? LANGUAGE_DEFAULTS，多语言/无命中→纯推断） | 闭合 |
| P2-R2-1 落点与单源 | 常量与渲染函数落 config-defaults（L64/67/70）；步骤 1 DEFAULT_CONFIG 引用 DEFAULT_THRESHOLD（L28） | 基本闭合（Design 残留见 P2-R3-1；定义顺序见 P2-R3-2） |
| P2-R2-2 Verify 精度 | 步骤 6 改 .test.ts（L127）；SKILL.md:59 旧引用同步（L124） | 部分闭合（cwd 与 prose 命令见 P2-R3-3） |
| P2-R2-3 description/Boundaries | 步骤 6 列入联动（L124/127） | 闭合（pin 同步枚举见 P2-R3-4） |
| P2-R2-4 command 骨架 | 8 语言全列（L68） | 内容闭合，ts/js 骨架与白名单冲突（见 P1-R3-1） |
| P2-R2-5 细节措辞 | detectLanguage 未命中 null、.d.ts 排除（L64）；threshold 专用文案（L28）；issue 文案插值 ${threshold}%（L89） | 闭合 |

### P1 发现

#### P1-R3-1 ts/js command 骨架含白名单外 <tests>，提议写入流程必失败

- plan 锚点：plan.md:68（ts/js 骨架）、70（封闭白名单）、32（parseCoverage 占位符校验）、123（packages-scan 提议写入）。
- 证据：COVERAGE_PLACEHOLDER_TOKENS={<worktree>,<profile>,<base-ref>}（L70）；assertPlaceholders 以 /<([^>]+)>/g 扫描全部 <…> 片段，白名单外即抛 WorkloomConfigError（config-defaults.ts:173-180，已核）。ts/js 骨架 'node --test --experimental-test-coverage --test-reporter=lcov --test-reporter-destination=<profile> <tests>' 含 <tests>，不在白名单，也无渲染值来源。
- 问题：步骤 6 packages-scan 据 LANGUAGE_DEFAULTS 提议 coverage.languages（format+command），经 config skill 确认后写入 config；步骤 1 parseCoverage 对 command 做占位符白名单校验——ts/js 骨架会被本 plan 自己的校验拒绝，AC4 流程在 ts/js 项目（本仓库即是）无法走通。步骤 3 Failure"未知占位符 → fail loud"与骨架内容自相矛盾。其余语言骨架仅含 <profile> 或无占位符，无此问题（java/kotlin 的"（报告路径 <profile>）"是括注说明，不在命令串内）。
- 修正建议：ts/js 骨架去掉 <tests>，只用白名单 token——如 'node --test --experimental-test-coverage --test-reporter=lcov --test-reporter-destination=<profile>'，注明 Checker 按任务追加测试 glob；或写具体示例 glob（不带尖括号）。若确需 <tests> 作占位符，须扩白名单并定义渲染值来源，但三 token 封闭集是 Round 2 已定决策，扩展需重新锚定值来源。

### P2 发现

#### P2-R3-1 Design 节落点表述与标题残留

- plan 锚点：plan.md:8（Design "coverage-compute 导出"）、1/3（标题与修订依据）、107（步骤 5 导出 bullet）。
- 问题：步骤 1/3 已把 DEFAULT_THRESHOLD/COVERAGE_PLACEHOLDER_TOKENS/renderCoverageCommand 落 config-defaults（L28/64/67/70），Design L8 仍写"单源（coverage-compute 导出）"，与步骤矛盾；标题仍"（Round 2 修订）"，修订依据只列 Round 1；步骤 5 L107"renderCoverageCommand 导出供 packages-scan/CASE"置于脚本步骤下，但函数落 config-defaults，脚本自身不用也无需再导出。
- 修正建议：Design L8 改"config-defaults 导出，coverage-compute 引用"；标题与修订依据更新到 Round 3；L107 移至步骤 3 或 6，写明 packages-scan 直接从 dist/workspace/config-defaults.js 引用。

#### P2-R3-2 常量定义顺序：步骤 1 引用步骤 3 才创建的常量

- plan 锚点：plan.md:28/32（步骤 1 用 DEFAULT_THRESHOLD、COVERAGE_PLACEHOLDER_TOKENS）、67/70（步骤 3 定义）、29（步骤 1 Preconditions none）。
- 问题：按步骤顺序执行，步骤 1 的 DEFAULT_CONFIG.coverage={threshold:DEFAULT_THRESHOLD} 与 parseCoverage 占位符校验引用尚未定义的常量（步骤 3 才创建），步骤 1 Verify 先红。两常量同在 config-defaults，正是步骤 1 编辑的文件，依赖在同文件内即可解决。
- 修正建议：两常量定义移入步骤 1 Output/Procedure（config-defaults）；步骤 3 改"引用 DEFAULT_THRESHOLD/COVERAGE_PLACEHOLDER_TOKENS"；或在步骤 1 注明随同定义。

#### P2-R3-3 Verify 精度残留：工作目录混用、部分命令 prose

- plan 锚点：plan.md:36（cd packages/core）、55/74/92（core 相对路径）、110/127（仓库根相对路径）、143（步骤 7 prose）、175（步骤 9 lcov prose）。
- 问题：步骤 2-4 承步骤 1 的 cd 用 core 相对路径，步骤 5-6 用仓库根相对路径，同一 shell 顺序执行时步骤 5 路径在 packages/core 下不存在；未声明统一工作目录约定（步骤 9 的"<WT> 根"只约束该步）。步骤 6/7 的 grep 与步骤 9 lcov 采集仍 prose，无可执行命令。
- 修正建议：统一 <WT> 根 + 完整相对路径（步骤 2-4 改 packages/core/test/...），或逐步写明 cd；grep 给出模式与目标文件；步骤 9 引用 S3 plan（11-24-config-edit-skill/plan.md:145-146）的 lcov 命令。

#### P2-R3-4 步骤 8 pin 与测试枚举不全

- plan 锚点：plan.md:158-159（pin 更新清单与红绿清单）、124（步骤 6 Boundaries 联动）。
- 证据：packages-scan SKILL.md:64 Boundaries 句被 contract-asset.test.ts:1205-1208 逐字 pin；步骤 6 承诺改 description/Boundaries，步骤 8 pin 清单只列 config-edit 9 字段 + workflow 文案，漏该 pin。另 formatHints 回退逻辑（步骤 2 计算侧新行为）仅由步骤 5 脚本级"formatHints 生效"覆盖，coverage-compute.test 清单（L156）无直接用例。
- 修正建议：步骤 8 同步清单补 packages-scan Boundaries pin（contract-asset L1205-1208，随步骤 6 措辞联动）；coverage-compute.test 补 formatHints 回退/内容优先直接用例。步骤 8 Failure"pin 红 → 修"有修复回路，本项为枚举完整性问题，非阻塞缺陷。

### 重审通过项

1. 9 步锚点全部真实唯一：新锚点 ComputeDiffCoverageInput L93-99、格式映射 L335 与真实代码吻合；SKILL.md:59 旧 .test.js 引用属实，步骤 6 已列同步。
2. Edit 五字段 9 步齐全有序；AC1–AC6、R1–R8 Covers 全覆盖；无 after-code。
3. formatHints 构造规则确定：恰一种语言→广播（config.languages[lang] ?? LANGUAGE_DEFAULTS[lang] 经 FORMAT_NORMALIZE），多语言/无命中→undefined 纯推断；detectLanguage 只返回内置语言名或 null，LANGUAGE_DEFAULTS[lang] 恒存在，无空引用。
4. 8 语言 command 骨架全列；除 ts/js（P1-R3-1）外仅含白名单 token。
5. detectLanguage 未命中 null、.d.ts 排除，与 isExecutableFile（coverage-compute.ts:38-41）口径一致；threshold 专用文案；issue 文案插值实际阈值。
6. ripple 重审：meetsThreshold 调用方（门禁 L429 + 脚本 --check）、CoverageFormat 使用方、90% 文案三处（门禁插值/workflow/spec）、字段清单 8→9、EXTENSION 单源、coverage_config 新码（无 ISSUE_CODES 穷举 pin）均在清单。
7. 共享常量落 config-defaults 无模块环（Round 2 已核依赖链）；代码/spec 自首轮以来未改动。

### 阻塞项

无。P1-R3-1 与四项 P2 均可由 plan 作者修订解决，无需用户裁决。

## 第 4 轮评审（2026-11-24）

评审对象：plan.md Round 4 修订版（180 行，9 步）。逐条核对 Round 3 发现闭合，重审锚点、五字段、AC 覆盖、ripple 与占位符白名单一致性。代码侧无改动（git 核对 packages 与 spec 干净）。

### 结论

无 P0，无 P1。P2 共 2 项，均为非阻塞的精度/措辞项。Round 3 的 P1-R3-1 已闭合，四项 P2 中三项闭合、一项（Verify 工作目录）plan 文本未改动。plan 已可执行，可进入实现；两项 P2 建议顺带处置，不构成实现前置条件。

### Round 3 闭合核对

| Round 3 发现 | Round 4 处置 | 判定 |
| --- | --- | --- |
| P1-R3-1 ts/js 骨架 <tests> | 骨架改 'node --test --experimental-test-coverage --test-reporter=lcov --test-reporter-destination=<profile>'，注明测试 glob 由 Checker 按任务追加、不入白名单（L68） | 闭合 |
| P2-R3-1 Design 落点/标题 | Design L8 改"config-defaults 导出，workspace 叶子"；标题与修订依据更新 Round 4（L1/3，三轮计数准确）；落点经步骤 1 L32"供步骤 3/5/6 引用"与步骤 3 L64"引用步骤 1"钉死 | 闭合 |
| P2-R3-2 常量定义顺序 | DEFAULT_THRESHOLD/COVERAGE_PLACEHOLDER_TOKENS/renderCoverageCommand 定义移入步骤 1（L32）；步骤 3 L67 显式"步骤 1 定义于 config-defaults" | 闭合（残留措辞见 P2-R4-2） |
| P2-R3-3 Verify 精度 | plan 文本未改动：步骤 1 仍 cd packages/core（L36），步骤 2-4 core 相对路径（L55/74/92）vs 步骤 5-6 仓库根相对路径（L110/127）；grep/lcov 仍 prose（L127/143/176） | 未闭合（见 P2-R4-1） |
| P2-R3-4 步骤 8 枚举 | 补 packages-scan Boundaries 逐字 pin（L158，contract-asset L1205-1208）+ formatHints unsupported 回退直接用例（L159） | 闭合 |

### 占位符白名单一致性专项（本轮重点）

1. 白名单三处表述一致：Design L11、步骤 1 L32、步骤 3 L70 均为 {<worktree>,<profile>,<base-ref>}，值来源明确。
2. 8 语言骨架逐条扫描：go/ts/js/python/rust/c/cpp 仅含 <profile>；java/kotlin 命令串 'gradle test jacocoTestReport' 无占位符（"（报告路径 <profile>）"为括注，不在命令串内）；ts/js 括注无尖括号 token。全部骨架 token ⊆ 白名单，packages-scan 提议写入 config 经 parseCoverage 校验可通过。
3. 校验链闭合：parseCoverage command 占位符校验（步骤 1 L32）→ renderCoverageCommand 经 assertPlaceholders（步骤 3 L70）→ 未知占位符 fail loud（步骤 1/3 Failure），与 config-defaults.ts:173-180 的 /<([^>]+)>/g 扫描机制吻合。

### P2 发现

#### P2-R4-1 Verify 工作目录仍混用，部分命令 prose（Round 3 遗留，文本未改）

- plan 锚点：plan.md:36（cd packages/core）、55/74/92（core 相对路径）、110/127（仓库根相对路径）、127/143（grep prose）、176（lcov prose）。
- 问题：修订说明称"Verify 工作目录统一 <WT> 根"，但 plan 文本与 Round 3 逐字一致，未统一。步骤 2-4 承步骤 1 的 cd 用 core 相对路径，步骤 5-6 用仓库根相对路径，同一 shell 顺序执行时步骤 5 路径在 packages/core 下不存在；步骤 9 的"<WT> 根"只约束该步。步骤 6/7 grep 与步骤 9 lcov 采集仍无可执行命令。
- 修正建议：统一 <WT> 根 + 完整相对路径（步骤 1 去 cd、步骤 2-4 改 packages/core/test/...），或逐步写明 cd；grep 给出模式与目标文件；步骤 9 引用 S3 plan（11-24-config-edit-skill/plan.md:145-146）的 lcov 命令。每项命令从某个工作目录可跑，实现者会自然纠正，故非阻塞。

#### P2-R4-2 步骤措辞残留：步骤 3 常量定义语气、步骤 5 import 清单不全

- plan 锚点：plan.md:65（步骤 3 Preconditions 仅 Step 2）、64（Output 首子句）、70（Procedure 定义语气）、104（步骤 5 import 清单）。
- 问题：
  1. 常量定义已移步骤 1，但步骤 3 Preconditions 仍只列 Step 2（现依赖步骤 1 的 DEFAULT_THRESHOLD，宜 Steps 1,2）；Output L64 首子句"DEFAULT_THRESHOLD=90 导出常量（落 config-defaults……）"与步骤 1 重复，Procedure L70"COVERAGE_PLACEHOLDER_TOKENS={……} + 值来源；renderCoverageCommand（assertPlaceholders 校验）"仍定义语气，与 L64"引用步骤 1"不对称。显式 parenthetical（L67"步骤 1 定义"、L64"引用步骤 1"）已消除执行歧义，仅措辞残留。
  2. 步骤 5 L104 import 清单列 loadConfig/meetsThreshold/FORMAT_NORMALIZE，但 L105 构造规则"同步骤 4"需 detectLanguage 与 LANGUAGE_DEFAULTS，清单未列（实现者按规则引用即会补 import，缺 import 会在步骤 5 Verify 立即报错）。
- 修正建议：步骤 3 Preconditions 改 Steps 1,2；L64 首子句与 L70 改"引用步骤 1 的 DEFAULT_THRESHOLD/COVERAGE_PLACEHOLDER_TOKENS/renderCoverageCommand"；步骤 5 L104 import 清单补 detectLanguage/LANGUAGE_DEFAULTS（dist/task/coverage-compute.js）。

### 重审通过项

1. 9 步锚点全部真实唯一（ComputeDiffCoverageInput L93-99、格式映射 L335、case-gates L429/431/434、config-load L58/311-394/367-392、config-defaults L14-38/57-61、case-scope L30-34、workflow L97/113、spec L9、contract-asset L1148-1149/1205-1208、脚本 L14-15、SKILL.md:59 均经前四轮核对，代码未改动）。
2. Edit 五字段 9 步齐全有序；AC1–AC6、R1–R8 Covers 全覆盖；无 after-code。
3. formatHints 全链路闭合：计算侧入参与回退（步骤 2）、构造规则钉死（步骤 4/5）、直接用例（步骤 8 L159）；内容优先、冲突以内容为准。
4. ripple 清单完整：meetsThreshold 调用方（门禁 L429 + 脚本 --check）、CoverageFormat 使用方、90% 文案三处（门禁插值 ${threshold}%/workflow/spec）、字段清单 8→9、EXTENSION 单源派生、coverage_config 新码（无 ISSUE_CODES 穷举 pin）、三处 contract-asset pin 同步。
5. 常量单源贯穿：步骤 1 定义 DEFAULT_THRESHOLD 并用于 DEFAULT_CONFIG，步骤 3 meetsThreshold 缺省引用，门禁/脚本传统一阈值；config-defaults 叶子落点无模块环（Round 2 已核）。
6. HOME 隔离（executor.test L39-45 先例）、worktreeDirectory 读 config、dist 同 commit、spec 英文条目均符合 repo spec。

### 阻塞项

无。无 P0/P1，plan 可进入实现；两项 P2 为非阻塞精度项，无需用户裁决。
