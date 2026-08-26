# ADR-0007: spec 知识库机制——两级布局 + 索引列表注入 + packages scope 过滤

- 状态：已接受
- 日期：2026-08-26
- 决策者：主 agent + 用户对齐（四项决策全部由用户选定）

## 背景

`.workloom/spec/` 在 Phase 1-3 只做到「兼容预留位」：init 建空目录、migrate 能迁、
jsonl 引用消费已通（executor-context），但 Trellis 的会话侧 spec 索引注入
（session-start 的 `<guidelines>` 段）与维护 skill 缺失。调研报告
`docs/trellis-core-workflows.md` 给出事实：spec 按 `<package>/<layer>/index.md`
两级组织；会话启动只注入索引路径列表，全文由 jsonl 引用按需内联；另配
update-spec skill 维护。

## 决策

1. **范围全套**：会话索引注入 + `workloom-update-spec` skill + check 引导文案 +
   init 生成 `spec/README.md` 骨架模板，一次对齐 Trellis 能力面。
2. **两级布局** `spec/<package>/<layer>/index.md`：与 Trellis 数据布局兼容，
   migrate 无需拍平；`index.md` 是注入单元，细则文件只被索引链接。
3. **注入粒度 = 索引列表**：会话启动注入 `<guidelines>` 段（路径清单，AI 按需读全文）。
   否决全文注入——每轮上下文过重，违背「Specs injected, not remembered」原则。
4. **scope 解析 = 按 packages 过滤**：`config.yaml` 的 `packages` 键集合为声明包名，
   只收集声明包名的 spec；未声明回退全量（实用回退，规格显式约定）。

### 实现细节决策

1. 字节预算 `MAX_GUIDELINES_BYTES = 8192`：累计超限截断，余量记入 `truncated`
   并在注入块追加提示行。
2. 符号链接统一跟随（statSync）：声明分支与回退分支收集结果一致。
3. 失败语义分层：spec 目录缺失按空处理；目录读失败 fail loud 抛错上行；
   config 解析失败时 guidelines 段降级为空（与 developer/git 降级同策，
   不拖垮整份快照）。
4. update-spec 为纯 skill（无专属工具）：四步流程（归属 → 索引 → 细则 → 校验）
   靠 skill 文案约束，完成判据是布局/链接/孤立细则三项静态检查。

## 后果

积极：
- spec 库随仓库版本化，会话与子代理按 scope 精确注入，上下文增量可预测（≤8KB）。
- 数据布局与 Trellis 兼容，既有 `.trellis/spec/` 可迁移直用。
- 收集逻辑是 core 纯函数（spec-index.js），双端 adapter 零改动复用。

代价：
- scope 过滤依赖用户在 config 声明 packages；不声明的团队失去过滤能力
  （回退全量，可能注入无关规范）。
- update-spec 无运行时校验工具，索引悬空/孤立细则靠模型自律与 skill 判据。
- Pi 开发期 `-e` 直载形态不覆盖包内 skills 自动发现，update-spec 只随发布形态生效
  （既有已知限制，见 `docs/adapter-install.md`）。

## 验证

Pi 真机（qwen3.7-plus）：全量回退注入两条索引（字典序）✓；声明
`packages: cli` 后只注入 cli ✓；模型按索引读文件报出首行标题 ✓。
DSH 侧待 profile 重启后按同法验证。
