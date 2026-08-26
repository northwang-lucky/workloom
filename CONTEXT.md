# workloom 上下文

workloom 把 Trellis 式 AI 编码工作流抽象为与 runtime 无关的核心逻辑层（core）与资源层（assets），通过面向各 runtime 的官方格式插件（adapter）分发；用户项目内只保留一个资产目录 `.workloom`（替代原 `.trellis`）。许可证：MIT。

## Language

**runtime**:
外部 AI 编码平台（DeepSeek Harness、Pi、Claude Code 等），即插件的宿主环境。
_Avoid_: platform（DSH 语境中 platform 另指 host/client 运行面）

**adapter**:
面向一个 runtime、符合其官方插件格式的封装层。
_Avoid_: plugin（与 DSH 的动态插件机制混淆）

**core**:
与 runtime 无关的代码逻辑层：任务生命周期、工作流状态机、上下文组装、资产渲染。
_Avoid_: engine, kernel

**assets**:
与 runtime 无关的内容资源（skills、agents、commands 的定义），中间表示为 Markdown + YAML front-matter。
_Avoid_: resources（与 runtime 的资源加载器混淆）

**Executor**:
执行研究/实现/检查工作流的执行体抽象，支持 inline（主会话内）与 subagent（子代理）两种模式。
_Avoid_: worker, runner

**effort**:
执行体的推理强度档位；核心层统一枚举 `low` / `medium` / `high` / `xhigh` / `max`，由 adapter 映射到各 runtime 的原生档位。
_Avoid_: thinking level, budget

**workflow-state breadcrumb**:
每轮注入给主会话的任务 + 阶段指引块，是工作流阶段控制的唯一每轮通道。
_Avoid_: status banner, phase hint

**workflow contract**:
工作流状态机契约：tag 块约定、阶段编号、状态枚举与迁移关系，随插件包分发，项目不可定制。
_Avoid_: workflow schema, state machine（泛指）

**workflow guidance**:
各状态下指导 AI 的自然语言文案；内置默认文案随插件分发，项目可用 workflow overlay 覆盖局部。
_Avoid_: workflow docs

**workflow overlay**:
项目级指引文案覆盖层（`.workloom/workflow.override.md`，可选），只改“某步怎么做”，不改状态机；渲染时与内置默认合并。
_Avoid_: workflow patch, workflow override file

**workflow profile**:
一套可选的契约 + 指引组合，二期机制；当前只要求契约加载器与 overlay 合并器预留可替换接口。
_Avoid_: workflow preset（与 DSH 的 agent preset 混淆）

**grilling**:
Phase 1.1b 的设计树拷问 skill（第三方，mattpocock/skills，MIT，vendoring）：以 frontier 轮次制提问并给推荐答案，直至无未决假设。
_Avoid_: interrogation

**brainstorm**:
Phase 1.1a 的需求探索 skill：一次一个问题澄清需求，产出需求清单。
_Avoid_: 头脑风暴（直译）

**requirement alignment**:
Phase 1 的完成状态：最终对齐的需求无灰区——每条需求可判定、无歧义、无未决假设；是进入文档编写前的硬性 gate。
_Avoid_: 需求澄清（不含可判定性判据）

**test-first**:
实现策略选项（Phase 1.1b 固定问题）：是否按 TDD red-green 循环交付；选择后 seams 确认写入 prd.md 验收标准，W7 按 tdd skill 执行。
_Avoid_: TDD 偏好（不含对齐义务）

**task**:
一个任务目录（task.json、prd/design/implement、research/、jsonl 清单），数据布局与原 Trellis 兼容。
_Avoid_: issue, ticket

**spec**:
按 package/layer 组织的编码规范（`.workloom/spec/<package>/<layer>/index.md` 两级布局）。
_Avoid_: rules（与工具规则混淆）

**spec index**:
会话启动注入的 spec 索引路径清单（session-context 快照的 guidelines 段，按 config packages 过滤）。
_Avoid_: guidelines 全文、spec 摘要

**journal**:
按开发者组织的会话日志，构成跨会话项目记忆（workspace）。
_Avoid_: log, diary

**init**:
adapter 内置的初始化命令，生成/更新项目内的 `.workloom` 目录，并支持从旧 `.trellis` 目录迁移。
_Avoid_: bootstrap, scaffold
