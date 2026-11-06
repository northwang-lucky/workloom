# workloom-sop 重写复用评估表（待拍板版）

来源：三个并行盘点子会话，2026-11-06。覆盖 core domain 26 模块、core service 16 文件、adapter-dsh 21 文件、assets 内容 16 项，共 79 项。

去留枚举定义。去留列判定的是功能命运，落地形态一律为函数级或代码片段级拷贝，进入重新设计的目录与包结构，任何文件不整体搬迁：

- 原样保留：函数级拷贝，逻辑不改。
- 改造保留：函数级拷贝，但需拆分、改名、重做接口或变更归属。
- 重写：功能需求保留，实现推倒重来。
- 删除：功能整体不要，或并入其他模块。

统计随拍板轮次动态调整，以各行标注为准。第四轮拍板后：原样保留 18，改造保留 41，重写 5，删除 12，合并或并入 3，待定 0。

## 一、core domain 层（26 模块）

| 模块 | 行数 | 去留 | 职责 | 理由 |
| --- | --- | --- | --- | --- |
| active-task.js | 223 | 改造保留 | 以 contextKey 为键读写清理当前任务指针 | 指针格式与幂等清理可留，读写并入状态机，避免两套写入口 |
| alignment.js | 42 | 改造保留 | 纯函数求值 planning 对齐凭据门禁 | 判定收编为状态机迁移守卫，删重复文案常量 |
| breadcrumb.js | 118 | 原样保留 | 合并 overlay 与内置 workflow 文档，按状态取指引正文 | 状态到指引映射仍是注入所需，runtime 无关 |
| case.js | 695 | 改造保留 | CASE 记录创建、结构校验、执行与结果门禁、改动范围 | 校验规则留，拆三块，prd 解析与 task-gates 合并一处 |
| config.js | 1265 | 改造保留 | 三层配置加载、校验、subagent 解析、冲突检测、命令渲染 | 分层加载与校验是核心资产，按职责拆文件，删 per-runtime 分支 |
| dispatch-binding.js | 59 | 原样保留 | 构造 dispatches 记录的 model 绑定值与 modelSource | 派发审计字段单一来源，随派发链路搬进 dsh-workloom |
| executor-capacity.js | 68 | 原样保留 | 按 childId 去重计数，判全局与单角色并发上限 | 纯判定逻辑，新适配层直接用 |
| executor-context.js | 902 | 改造保留 | 组装子会话首条与增量 prompt，维护 kind 枚举与纪律文本 | 注入协议是核心，拆 prompt 组装与纪律文本，jsonl 与 prd 解析外移 |
| executor-profiles.js | 149 | 删除 | 渲染当前生效执行器配置小节 | 单调用方，并入 session-context，不值得单列模块 |
| executor-rotation.js | 58 | 删除（改判） | 模型池轮换取首个未占用项，物化环形顺序 | 角色制下模型由派发方显式指定，轮换失去意义，详见改判节 |
| executor-tools.js | 98 | 改造保留 | 原生工具候选集与运行时可见集求交合并 | allowlist 算法留，删 Pi 清单与 runtime 参数 |
| failover.js | 110 | 改造保留 | 按 DSH 错误码白名单分类并生成转移文案 | 逻辑仍需要但属 runtime 专属，迁出 core 到 dsh-workloom |
| file-atomic.js | 42 | 原样保留 | 同目录临时文件加 rename 的原子写 | 通用写盘原语，凭据类写入仍需要 |
| git.js | 513 | 改造保留 | git 查询、提交、merge/rebase/worktree/branch 原语封装 | 原语保留，按查询面与集成操作面拆文件 |
| identity.js | 25 | 删除 | developer 名字符集校验 | 用户身份能力整体去除，校验规则无承接方 |
| init.js | 318 | 改造保留 | 幂等生成 .workloom 骨架 | 保留 init 命令但删除身份相关部分，模板外置，目录布局随 sop 调整 |
| journal.js | 355 | 删除 | 写个人 journal 并维护索引 | 身份去除，journal 能力按决定整体删除 |
| locate.js | 103 | 原样保留 | 向上找 .workloom 根，路径越界校验，目录常量 | 全仓扇入最高的路径基准，必须原样保留 |
| migrate.js | 454 | 删除 | 旧 .trellis 到 .workloom 的一次性迁移 | 新体系不再有 .trellis 用户，留着拖住 config 结构调整 |
| protocol.js | 31 | 原样保留 | workflow 文档版本与 core 期望常量比对 | 版本门禁机制需要，新文档发布时改常量 |
| spec-index.js | 127 | 原样保留 | 收集 spec 索引清单并做字节预算截断 | spec 索引注入是 guidelines 入口，逻辑稳定 |
| task-gates.js | 845 | 重写 | prd/plan 结构校验与六类门禁求值 | 门禁要变成状态机迁移守卫，当前形态承载不了迁移表 |
| task-mode.js | 30 | 改造保留 | 维护 full/light 取值与合法性判定 | 值域保留并扩为三模式，作为状态机输入，不再单独成模块 |
| task-store.js | 1639 | 重写 | 任务创建读取启动归档列表、hooks、状态与 stage 迁移、指针联动 | 显式状态机取代散落状态判断，读写面按存储、迁移、派发记录分层 |
| workflow-contract.js | 364 | 原样保留 | 解析 workflow 文档 front-matter、状态指引块、步骤节 | SOP 流程文档读取入口，runtime 无关 |
| worktree.js | 846 | 改造保留 | 任务 worktree 创建复用清理、整合、一致性扫描 | 生命周期编排保留，按职责拆分，setup 命令执行独立成配置执行器 |

## 二、core service 层（16 文件）

| 文件 | 行数 | 去留 | 职责 | 理由 |
| --- | --- | --- | --- | --- |
| alignment-service.ts | 335 | 改造保留 | PRD/PLAN 的 review 与 confirm 编排 | 确认协议保留，并入状态机确认步骤，按 target 拆两段 |
| case-service.ts | 120 | 改造保留 | CASE 的 review 编排 | 与 alignment-service 合并成一个文档复核服务 |
| command-ops.ts | 263 | 改造保留 | init 命令与 journal 工具编排 | 删 journal 编排与 init 身份段，保留骨架编排 |
| doctor-check-rules.ts | 673 | 重写 | doctor 11 个检查规则只读实现 | 检查项绑旧状态机与旧工具面，只有 worktree 与 config 两类逻辑站得住 |
| doctor-checks.ts | 109 | 重写 | 跑检查并汇总 DoctorReport | 检查清单与报告结构按新状态机重定义 |
| doctor-fixes.ts | 132 | 重写 | 三类确定性修复与修复度量 | 修复必须走 task-store 正式写口，当前绕过归档门禁 |
| doctor-local-prompts.ts | 180 | 删除 | 扫三层 prompts 输出加载状态 | 并入 local-prompts 加载结果，不再维护第二套扫描 |
| doctor-tasks.ts | 112 | 改造保留 | doctor 任务目录枚举与 issue 工厂 | 枚举下沉 task-store 成统一 API，issue 工厂保留 |
| doctor.ts | 69 | 改造保留 | doctor 编排入口 | 编排骨架薄可留，转述文本搬到 surface 统一 |
| doctor-types.ts | 119 | 改造保留 | DoctorReport 类型族与检查元信息 | 报告 schema 沿用，CHECK_META 按新检查集重建 |
| local-prompts.ts | 346 | 改造保留 | 三层提示词片段读取解析与注入合成 | 三层叠加机制保留，target 换五角色，删 front-matter 死抽象 |
| session-context.ts | 443 | 改造保留 | 组装会话上下文快照 | DSH 快照机制保留，小节拆分、角色与工具面整体重做 |
| spec-templates.ts | 93 | 原样保留 | spec 模板幂等写入 | 逻辑最小语义清楚 |
| step-lookup.ts | 40 | 原样保留 | 按 stepId 从契约文本查步骤 | 40 行纯函数，两个 adapter 已共用 |
| task-ops.ts | 476 | 改造保留 | 六任务工具编排与路径解析公共件 | 解析件与错误元组形态留，按工具拆分并改接状态机 |
| workflow-service.ts | 273 | 改造保留 | breadcrumb 指引与 steps/norms 投影 | breadcrumb 与投影保留，去 light 双轨与已死 async 入口 |

## 三、adapter-dsh 层（21 文件，包将改名 dsh-workloom）

| 文件 | 行数 | 去留 | 职责 | 理由 |
| --- | --- | --- | --- | --- |
| index.ts | 6 | 原样保留 | 包入口转出 plugin | 包改名后照搬 |
| constants.ts | 16 | 改造保留 | 插件名与前缀四个共享常量 | 常量保留，随包改名，删冗余别名 |
| main-model.ts | 38 | 改造保留 | 从请求头快照读主模型 | 逻辑可留，角色制简化后接口重做 |
| executor-schema.ts | 72 | 改造保留 | 组装 workloom_execute 的 JSON Schema | builder 留，参数从 kind 换 role 并补枚举 |
| executor-dispatch.ts | 63 | 改造保留 | 组装工具白名单 | 白名单组装留，另两件事拆走，文件按职责改名 |
| executor-failover-notify.ts | 59 | 删除 | 往父会话投转移通知 | 转移链路去掉后无存在意义，通知统一到 followup 投影 |
| executor-receipt.ts | 94 | 改造保留 | 派发回执渲染与 fork 错误转译 | 渲染与转译留，按职责拆开并统一文本块类型 |
| journal-tool.ts | 84 | 删除 | 注册 workloom_journal | journal 能力整体删除，工具随撤 |
| executor-injection.ts | 126 | 改造保留 | 组装全量注入 prompt 与统计、装配子会话标题 | 注入与统计保留，模板改由 core 提供，标签换角色枚举 |
| executor-continuation.ts | 174 | 改造保留 | 定位可续用 childId、拼 turn 回执 | 续用定位留，回执与绑定读写合成一处 |
| executor-guard.ts | 175 | 改造保留 | 只读子会话的写限制在 .workloom 内 | 只读角色写限制必要，扫描逻辑抽共享实现 |
| executor-toolface.ts | 183 | 改造保留 | 按白名单调 tools.restrict 收窄工具面 | 唯一可行收窄通道必须留，合并重复扫描 |
| executor-settle.ts | 323 | 改造保留 | 抓 turn/end 错误并回填 dispatches 终态 | 终态自动回填必须留，去钩子后按三块拆分 |
| executor-capacity.ts | 256 | 改造保留 | 合并 in-flight 与模型绑定判容量 | 容量闸留，轮换与模型绑定随 failover 去掉，文件拆 |
| executor-failover.ts | 608 | 删除 | 转移注册表、同步走链、异步重派 | 角色制下模型由派发方显式指定，自动换模型掩盖配置错误 |
| executor-failover-chain.ts | 211 | 删除 | 按链逐跳重试循环与链条目组装 | 仅约 30 行重试循环有复用价值，日后在新派发层重写 |
| executor.ts | 705 | 重写 | 注册 workloom_execute 并编排一整轮派发 | 所有耦合汇聚点，角色制派发要重设，改造成本高于重写 |
| commands.ts | 197 | 改造保留 | 注册 init 与 doctor 两个 slash 命令 | 命令投影结构可用，模板来源与 followup 通道统一 |
| skills.ts | 267 | 改造保留 | 注册 skills 与 workloom_step 工具 | 解析与注册留，清单改 core 资源枚举，叶子提示按角色重写 |
| plugin.ts | 281 | 改造保留 | 插件入口，校验文档版本并注册全部能力 | 注入与注册骨架留，文档来源与注入内容随状态机与角色重做 |
| tasks.ts | 380 | 改造保留 | 注册八个任务工具并投影 core task-ops | 投影模式保留，三模式与五角色改参数面和权限判定 |

## 四、assets 内容（16 项，包撤销后并入 core 资源目录）

| 内容 | 去留 | 理由 |
| --- | --- | --- |
| skill workloom-alignment | 改写 | 对齐仍是标准模式核心，三模式与状态机要改写入口与收敛判定 |
| skill workloom-case-active | 并入删除（建议，待确认） | 编排归状态机，设计方法论并入 Checker 纪律文本与 case.md 模板 |
| skill workloom-case-archived | 删除 | 新仓库无历史归档任务，迁移期之外没有使用场景 |
| skill workloom-continue | 合并 | 状态机直接给出下一步，路由不该由 skill 文件探测实现 |
| skill workloom-finish | 保留 | 与状态机无冲突，换工具名与角色口径，删 journal 段 |
| skill workloom-migrate-plan | 删除 | 新项目从 plan.md 起步，没有存量格式要迁 |
| skill workloom-packages-scan | 保留 | 与角色无关的工具型 skill，脚本继续用 |
| skill workloom-update-spec | 保留 | 规范注入体系延续，口径按新架构更新 |
| 模板 case.md | 改写 | 结构可留，plan.md 引用与角色名同步，来源改 core 资源 |
| 模板 case-result.md | 改写 | 字段基本可用，Checker 记录字段要重定 |
| 模板 research-facts.md | 保留 | 与 Researcher 角色一一对应 |
| 模板 spec-index.md | 保留 | 规范体系沿用 |
| 模板 spec-detail.md | 保留 | 随规范体系一起迁移 |
| workflow/workflow.md | 重写 | 三模式状态机与五角色要重排阶段与提示块，提问与提交规范段落可留 |
| workflow/workflow-light.md | 合并 | light 只是状态机一个分支，单独成文档造成两套编号要同步 |
| third-party/mattpocock-skills | 保留 | 纯文本 runtime 无关，改存放位置并保留 LICENSE |

## 五、主会话改判两项

1. executor-rotation.js：domain 盘点建议原样保留，adapter 盘点认为轮换随 failover 一起去掉。两份证据指向后者：角色制下模型由派发方显式指定，rotate_on_busy 失去意义。改判删除，executor-capacity 相应去掉轮换段。
2. failover.js：分类与文案原服务转移链。改判保留派发层对模型不可用错误的一次重试，failover.js 随之改造保留并迁往 dsh-workloom。若不要这一次重试，则改删除。

## 六、基线清理规则（重叠证据汇总）

1. 门禁求值统一：task-gates、case、alignment 三处门禁源合并为状态机迁移守卫。
2. PRD 解析统一：task-gates 与 case 两套 prd 小节解析合并成一处。
3. jsonl 解析移出 executor-context，消除 task-store 与 executor-context 循环 import。
4. 生命周期收口：task-store、task-mode、active-task、alignment 四处分管收敛进状态机。
5. 会话注入每轮只解析一次活跃任务：workflow-service、session-context、local-prompts 三件套合并组装。
6. 文档复核统一：alignment-service 与 case-service 合并成一个文档复核服务。
7. 归档路径统一：删除 doctor 自制归档，全部走 task-store 正式写口。
8. 结果投影统一：TextBlockLike 与 renderOutput 四份副本合成一个投影模块。
9. followup 注入通道统一：commands 与 failover-notify 两份实现只留一份。
10. 双 runtime 分支整类删除：executor-tools、config、failover、init、executor-context 的 Pi 清单与 per-runtime 分支一次清完。
11. 新代码一律 TypeScript 编写，domain 层纯 JS 约定随之退役，对应 spec 由子任务七更新或删除。
