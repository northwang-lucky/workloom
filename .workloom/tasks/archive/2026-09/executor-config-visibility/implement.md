# 执行器配置可见性与终态错误可观测 实施计划（test-first）

> 任务：`tasks/09-03-executor-config-visibility`。规划文档，只写计划、不改实现。
> 纪律：每阶段先写失败测试再实现；执行器不 commit 不 push，提交由主会话负责；
> 派发不传 model/effort（走全局配置解析，本任务以身作则）。

## §0 公共约定

- 测试隔离：配置/画像/注入测试用临时目录构造三层配置文件（含函数工厂样例）；
  adapter-dsh 测试沿用既有 mock 风格（cordis Context、subagents 服务 mock）。
- 文案口径：注入块与运行时文案英文；注释中文；错误摘要截断上限 200 字符。
- 阶段完成定义：该阶段测试红→绿 + `pnpm -r typecheck` + 改动文件
  `lsp_diagnostics` 干净；全量门在 §3 统一跑。

## §1 阶段一：provenance + 画像解析 + 注入组装（core）

1. 红：`config.test.js` 新增 provenance 用例——三层逐级覆盖、工厂层含/不含
   `subagent_profiles`、legacy `subagents` 来源、全程缺失为 undefined。
2. 绿：`config.js` 按 design §1 实现来源跟踪与字段挂载；`config.d.ts` 补类型。
3. 红：画像纯函数用例——命中（whenMain/fallback/legacy）、未配置行、
   mainModel 缺省分支、tools 摘要截断（>4 项 `… +N`）。
4. 绿：按 design §2 实现（复用 `resolveSubagentDefaults`）。
5. 红：`session-context` 注入用例——两新节顺序紧跟 Active task、派发行格式
   （含无 error 变体）、无任务/无派发不输出、配置错误整节降级。
6. 绿：按 design §3 实现（含 `readTask` 一次读取两行消费的重构）。
7. 阶段门：`cd packages/core && node --test test/*.test.js` 全绿 + typecheck。

## §2 阶段二：错误捕获与落账（adapter-dsh）

1. 红：session/event 捕获用例——登记表内/外、覆盖式取最近、非 turn/end 与非
   error 忽略、listener 异常只告警。
2. 红：结算替换用例——真实错误整体替换、200 字符截断、登记缺失回退泛化文案
   且记 WARNING；同步更新 `executor.test.js` 既有 "failed before it finished"
   断言的语义（error 分支换真实错误，其余分支不动）。
3. 绿：按 design §4 实现（`executor-settle.ts` 内登记表 + 监听 + 结算分支）。
4. 派发链路同点预置登记表 key（`trackDispatchSettle` 调用方不变，内部扩职）。
5. 阶段门：`cd packages/adapter-dsh && node --test test/*.test.js` 全绿
   + typecheck。

## §3 阶段三：续派模型治理（adapter-dsh + core 派发记录，design §8）

1. 红：`continue_executor` 与 `model`/`effort` 同传时拒绝派发（错误文案指明
   换模型须新开派发；不产生任何登记/结算副作用；传相同值也拒）。
2. 红：新派记录落实际生效 `model`/`effort`/`modelSource`；续派轮记录沿用
   childId 首次绑定、`modelSource: spawn`；旧记录缺省读取不炸。
3. 红：续派回执展示 spawn 绑定值（`(spawn binding)`），缺绑定显示
   `(unrecorded spawn binding)`；新派回执 `(param)`/`(config: …)` 不变。
4. 绿：按 design §8 实现（adapter-dsh executor 续派分支 + core task-store
   派发记录字段扩展）。
5. 阶段门：adapter-dsh 全量测试 + core 全量测试 + 双包 typecheck。

## §4 阶段四：描述警示 + 接线 + 全量门（core surface + 一致性）

1. 红：`surface` 相关测试（如有描述断言）或新增断言——model/effort 描述含
   覆盖警示句；双 adapter 工具 schema 快照核对共用单源。
2. 绿：按 design §5 追加文案。
3. adapter 接线核对（design §6）：adapter-dsh 传 `readMainModel(parent)` 结果；
   adapter-pi 传可得值（取不到 `undefined`，走 `main model unknown` 分支）。
4. 全量门：`pnpm lint`、`pnpm -r typecheck`、`pnpm -r build`、core +
   adapter-dsh + adapter-pi 全量测试、改动文件 `lsp_diagnostics`。

## §4 报告要求

每阶段汇报：改动文件清单、红绿证据（先失败后通过的测试名）、阶段门输出尾部、
与 design 的偏差及原因。四阶段完成后汇总全量门结果与剩余风险（特别是 §9
冒烟前不可验证项）。
