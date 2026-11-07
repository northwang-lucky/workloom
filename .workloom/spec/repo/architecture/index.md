# repo/architecture 规范

两个包的层次与依赖规则（workloom-sop 重构子任务一起生效）。

- layering: `core` 持 runtime 无关逻辑与内容资源（src 按 task、dispatch、injection、workspace 四个功能子包划分，resources/ 持 skills、templates、workflow、skeleton、third-party）；`dsh-workloom` 为 DeepSeek Harness 插件包——见 layering.md
- dependency: `dsh-workloom` 只依赖 `core` 与 host 侧 peer deps；core 不依赖任何 runtime 包——见 dependency.md
- projection: 插件包是薄的——取 cwd 与 context 键、读 core 资源清单、调 core、把错误与成功交宿主通道；不自持业务逻辑
- executor voice: runtime 纪律文本在 dsh-workloom 的 dispatch/discipline-text.ts，core 的 injection/prompt-compose.ts 只持 runtime 无关的 prompt 组装；纪律变更时文本与测试同改——见 executor-voice.md
- entry-form: 引导型 agent 入口优先 skill 而非 slash command；command 只用于宿主必须跑确定性编排的场景——init 与 doctor 保留 command，continue 与 finish 是 skill
- counter-example: 在 `dsh-workloom` 内深引 `@workloom-ai/core` 子路径，或 core 反向 import dsh-workloom
