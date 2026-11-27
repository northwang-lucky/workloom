# Changelog

本文件记录 workloom 各版本的主要变更。格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/spec/v2.0.0.html)。

## [1.0.0] - 2026-11-27

首个正式版本。workloom 以 `@workloom-ai/core` 与 `@workloom-ai/dsh-workloom` 两个包发布，均可从 npm 安装。

### Added

- 任务工作流：三模式（standard、light、parent）状态机、需求对齐与两道内容确认、CASE 设计与执行、覆盖率门禁。
- 角色体系：五类执行角色、失败转移与同类并发轮换，派发链路与工具白名单管控。
- worktree：任务级隔离、setup 依赖准备、rebase 与 merge 清理模式、级联归档。
- 工具与 skill：config 编辑、存量迁移、需求对齐、会话收尾、npm 发版等仓库级 skill。
- 注入机制：纯指针化注入，prd、plan、case 以路径指针下发，控制上下文体积。
- 覆盖率：工具配置驱动、任务增量覆盖率门禁与采集脚本。
- npm 发布：push `v*` tag 自动构建、校验并发布两个包，同时生成 GitHub Release。

### Changed

- 插件适配 DSH 0.2.2-rc.2，子代理启动参数改为扁平结构。
- 中文撰写规范与提问模板统一，README 改为中英双语角色视角。

### Fixed

- 变更行提取补 `maxBuffer`，避免容器级大 diff 触发 ENOBUFS。
- 归档合入核验对缺失基线分支给出修复指引，不再透传 git 原始错误。
