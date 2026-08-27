# implement: always-on 行为规范注入会话上下文快照

## 步骤拆分（每步一个 commit，TDD 缝先红后绿）

### 第 1 步 core：契约解析 norms（缝 1）

文件：`packages/core/src/legacy/workflow-contract.js`、workflow-contract.d.ts、对应测试

- 先写测试（红）：norms 块解析成功（多行内容保留）、旧契约无 norms 块时 norms 为 null 不告警。
- 再实现（绿）：norms open/close 正则 + parseContract 返回 `norms`。

### 第 2 步 core：快照组装 norms 小节（缝 2）

文件：`packages/core/src/service/session-context.ts`、对应测试

- 先写测试（红）：norms 非空时快照末尾（guidelines 之后）含 `Always-on norms:` 小节与原文；null/空白不追加。
- 再实现（绿）：SessionContextParams 加 norms 可选字段 + assembleInternal 追加逻辑。

### 第 3 步 两 adapter：透传 norms

文件：`packages/adapter-dsh/src/plugin.ts`、`packages/adapter-pi/src/inject.ts`、相关测试

- renderSessionContext / Pi 注入处入参补 `norms: contract.norms`；类型收窄如有报错同步处理。

### 第 4 步 assets：契约 norms 块与 version 6

文件：`packages/assets/workflow/workflow.md`

- 文末新增 `[workflow-norms]` 块（两组规范，与 1.1/2.1 正文措辞对齐）；version 5 → 6；core 契约测试若断言受影响则同步。

## 质量门（每步）

- `pnpm lint`、`pnpm -r typecheck`；
- core 与 adapter-dsh 的 `node --test`、adapter-pi 的 `bun test`；
- 第 4 步后 `pnpm -r build` + 全量测试。
- 禁止 git commit（主会话统一提交）。
