# Phase 1 需求对齐：brainstorm 探索 + grilling 拷问，无灰区 gate，写文档前必读 writing-for-agents

用户要求把 mattpocock/skills（MIT）的 grilling 与 writing-for-agents 融入 workloom 工作流。决定：Phase 1.1 拆为两步——先 brainstorm 逐题探索需求清单，再对含设计决策的需求用 grilling 的 design-tree 方法轮次拷问；进入文档编写前的硬性 gate 是“需求无灰区”（每条需求可判定、无歧义、无未决假设）；撰写任何面向 agent 的文档（prd/design/implement/spec/journal）前必须加载 writing-for-agents。资源以 vendoring 方式纳入 assets/third-party/mattpocock-skills/，保留 MIT 声明与署名。

## Considered Options

- grilling 取代 brainstorm：全程拷问对简单任务过重，否决。
- grilling 主、brainstorm 辅：按任务复杂度路由，引入额外判定分支；用户明确要求两者并行，否决。
- 并行（本决定）：探索与拷问分工清晰——brainstorm 澄清“要什么”，grilling 压测“这样定对不对、还有什么没定”。

## Consequences

- 需求对齐是 Phase 1 的硬 gate：frontier 未清空、存在灰区时不得进入文档编写，复杂任务时间成本上升是预期代价。
- writing-for-agents 的触发范围从“skill/AGENTS.md/CLAUDE.md”扩展为所有面向 agent 的文档；vendoring 时同步改写其 description 的触发分支。
- 第三方资源集中在 assets/third-party/，上游 mattpocock/skills 更新时可按 diff 同步；任何本地修改都须在文件头标注偏离。
