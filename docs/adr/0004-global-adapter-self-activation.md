# adapter 交付形态：全局安装 + 按资产目录自激活，项目零残留

workloom 的 runtime 插件（adapter-dsh、adapter-pi）均采用全局安装：DSH 侧为 profile bundle（`dsh plugin add`），Pi 侧为全局 Pi Package（`pi install`）。插件运行时检测当前项目的 `.workloom/` 目录存在性决定是否激活工作流注入；项目内不写入任何 runtime 配置或 dot 目录。

## Considered Options

- 每项目 init 生成平台文件（原 Trellis 模式）：项目里残留 `.claude/`、`.pi/` 等 dot 目录，且平台文件与插件版本漂移，否决。
- 每项目生成适配配置：仍产生 `.workloom` 之外的残留，且启用/停用依赖 init 往返，否决。
- 全局安装 + 自激活（本决定）：装一次、全局升级、项目零残留，两端机制对称。

## Consequences

- 用户项目内只保留 `.workloom/`；未装 workloom 的协作者打开项目时完全无感知。
- 插件升级即全局生效，不存在项目内陈旧平台文件。
- 自激活检测点是会话启动与每轮注入前；无 `.workloom/` 时插件保持静默。
- “启用一个项目”的语义 = 在该项目执行 init 生成 `.workloom/`，不再有“安装插件”这一项目级动作。
