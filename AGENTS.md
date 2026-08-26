# workloom 项目指南

workloom：把 AI 编码工作流抽象为 runtime 无关的核心逻辑层（core）与资源层（assets），经 adapter 插件分发到 DeepSeek Harness 与 Pi。

## 仓库结构

```txt
packages/
├── core/            # runtime 无关逻辑：legacy 纯 JS 移植模块 + service TS 抽象
├── assets/          # workflow 契约、skills/agents/commands 中间表示
├── adapter-dsh/     # DSH profile bundle（@workloom-ai/adapter-dsh）
└── adapter-pi/      # Pi Package（@workloom-ai/adapter-pi，executor 自研 spawn child pi）
```

## 团队规范（.workloom/spec/）

开发规范沉淀在 `.workloom/spec/`，随会话注入 guidelines 清单、按需读取。开始工作前先读相关索引；任务实现时把相关 spec 写进任务的 `implement.jsonl` / `check.jsonl` 以强制内联：

| 索引 | 内容 |
| --- | --- |
| `repo/code-style` | 编码原则、验证命令（verify） |
| `repo/legacy-module` | legacy 纯 JS + JSDoc 模块约定 |
| `repo/deployment` | 构建产物部署同步纪律 |
| `repo/language` | 中英文分工约定 |
| `repo/commits` | 提交规范 |
| `repo/terminology` | 术语表 |
| `repo/architecture` | 分层与依赖规则 |

## 常用验证命令

```bash
pnpm lint
pnpm -r typecheck
pnpm -r build
cd packages/core && node --test test/*.test.js
cd packages/adapter-dsh && node --test test/*.test.js
cd packages/adapter-pi && bun test test/*.test.ts
```

## 个人本地规则

个人化/本地规则写在 `AGENTS.local.md`（已 gitignore，每台机器各自维护，不入库）。
