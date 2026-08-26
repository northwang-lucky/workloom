# spec 知识库能力规格（`.workloom/spec/`）

> 状态：已与用户对齐（2026-06-27）。本文档是本次实现的唯一行为规格来源。
> 调研依据：`docs/trellis-core-workflows.md` W2（spec 索引注入）、5.3（jsonl 引用）、W7/W8（implement/check 读 spec）。
> 红线：不读原 Trellis 仓库源码；本文档所有行为由 workloom 自研或依据上述调研报告。

## 1. 背景与对齐决策

现状：init 建 `spec/` 空目录、migrate 能迁、`executor-context.js` 的 jsonl 引用消费已通；缺
会话索引注入、spec 维护 skill、check 引导文案。本次补齐全套能力，四项对齐决策：

1. 范围：会话索引注入 + `workloom-update-spec` skill + check 流程引导文案 + init 生成 spec 骨架模板。
2. 布局：两级 `spec/<package>/<layer>/index.md`（对齐 Trellis 数据布局，migrate 无需拍平）。
3. 注入粒度：只注入 index.md 路径列表（对齐 `<guidelines>`），AI 按需读全文。
4. scope 解析：按 config.yaml `packages` 声明过滤（对齐 `_resolve_spec_scope`）。

## 2. 数据布局

```txt
.workloom/spec/
├── README.md                    # init 生成：布局说明 + 最小示例（英文）
└── <package>/                   # package 名 = config packages 键（目录名精确匹配）
    └── <layer>/                 # 包内层级（backend/frontend/…，一个直接子目录）
        ├── index.md             # 规范索引：每条规范一行 + 细则文件链接
        └── *.md                 # 细则文件（可选，index.md 引用）
```

1. `package`/`layer` 目录名允许 `[A-Za-z0-9._-]`，首字符字母或数字。
2. `index.md` 是注入单元：收集只认 `index.md`，细则文件不直接进索引。
3. 非两级形态（如 `spec/<pkg>/index.md` 无 layer）不收集、不算错误——布局不符即不注入。

## 3. 索引收集规则（core/legacy/spec-index.js）

输入：root、config（`loadConfig` 产物）。输出：`{ indexes: string[], truncated: number }`。

1. scope 解析：`config.packages` 键集合为声明包名；声明非空时只收集 `spec/<pkg>/**/index.md`
   （pkg ∈ 声明集合），未声明包的 spec 安静跳过（scope 语义，不提示）。
2. 回退：`packages` 为空（未声明）→ 全量收集所有两级 `index.md`（实用回退，规格显式约定）。
3. 排序：按 (package, layer) 字典序，保证注入稳定。
4. 路径形态：`.workloom` 相对路径（如 `.workloom/spec/cli/backend/index.md`），与
   session-context 现有 `taskRelPath` 风格一致，AI 可直接读。
5. 截断：累计字节超 `MAX_GUIDELINES_BYTES`（8192）后停止收集，`truncated` 记剩余条数。
6. 失败语义：spec 目录缺失按空处理（返回空列表，不算错误）；目录读失败抛错（fail loud）。
7. 符号链接：目录探测统一跟随（statSync），声明分支与回退分支收集结果一致。

## 4. guidelines 注入块格式（session-context 组装）

`assembleSessionContext` 在现有快照末尾追加 guidelines 段；无 spec 时不输出该段（快照保持紧凑）。

```txt
<workloom-session-context>
Developer: northwang-lucky
Active task: "…" (planning) at tasks/06-27-demo.
Git: branch main, 0 dirty file(s).
Workflow: 1.0 Create task | 1.1 Align requirements | …
Guidelines (spec index — read files as needed):
  .workloom/spec/cli/backend/index.md
  .workloom/spec/web/frontend/index.md
</workloom-session-context>
```

1. 段标签行固定为 `Guidelines (spec index — read files as needed):`，条目行两空格缩进。
2. 截断发生时追加一行 `  (… N more index files; raise context_injection or trim spec/)`，N = truncated。
3. 装配顺序：Developer → Active task → Git → Workflow → Guidelines（新段放最后，快照可读性优先）。
4. 注入通道不变：DSH `systemPrompt.context` 与 Pi `session_start` 均渲染同一份快照，
   core 改完双端自动生效，adapter 零改动。
5. spec 索引属「轻量清单」：每轮取代式快照重渲染，不随轮次膨胀（与现有 context 语义一致）。
6. config 解析失败：guidelines 段降级为空（与 developer/git 降级同策，不拖垮整份快照）；
   spec 目录读取失败仍抛错上行（fail loud，§3.6）。

## 5. init 骨架模板

`initWorkloom` 在创建 `spec/` 目录时追加生成 `spec/README.md`（幂等：已存在不覆盖）。

1. 内容全英文：布局说明（两级 package/layer）、index.md 作用（注入单元）、
   与 config `packages` 声明的关系、最小示例（代码块内，不落真实目录）。
2. 不生成示例 `<package>/<layer>/index.md`：示例目录会进索引列表造成污染，
   说明放进 README 代码块即可。
3. 迁移不涉及：migrate 原样搬运 `spec/`（现行为保留）。

## 6. workloom-update-spec skill（assets 新增）

自研设计（Trellis 同名 skill 行为不明，clean-room 禁读，按 workloom 自身机制设计）：

1. 触发：用户表达「更新/记录/沉淀规范、update spec」；或实现中发现值得团队沉淀的
   编码约定时，先向用户提议再写。
2. 流程四步：
   - 归属：确定 package（config packages 键；未声明则提醒先补声明或直接建目录）
     与 layer（包内层级，如 backend/frontend）；
   - 索引：写/更新 `index.md`——每条规范一行，链接细则文件（`[name](file.md)` 或 `file.md`），
     无细则的短规范直接写在 index 内一行；
   - 细则：细则文件一个主题一个 `.md`，首行为标题，正文为该规范的判据（decidable）；
   - 校验：确认两级布局、index 内链接存在、无孤立细则（细则必须被 index 引用）。
3. 完成判据：index.md 与细则布局正确、链接不悬空、无孤立细则；无需跑测试。
4. 边界：不改 workflow.md、不改 config、不动 tasks/；skill 只写 `.workloom/spec/`。

## 7. workflow.md 引导文案变更（assets）

仅改正文文案，不动 front-matter 与 `[workflow-state:*]` 块结构（契约解析兼容）。

1. 1.3 Configure context 补一句：引用的 spec 路径必须落在 `.workloom/spec/` 两级布局内。
2. 2.2 Check 补强：对照 check.jsonl 引用的 spec 与 prd/design/implement 逐项核查
   （目录结构/命名/类型/潜在 bug），发现问题自己修，不只报告；
   任务最后一次 2.2 必须全量范围检查。

## 8. 测试与验证清单

core 单测（node:test）：
1. spec-index：全量收集、按 packages 过滤（声明子集）、未声明回退全量、
   字典序稳定、非两级形态不收集、目录缺失空结果、截断边界（8192）。
2. session-context：guidelines 段渲染、无 spec 不输出段、截断提示行。
3. init：spec/README.md 生成、幂等不覆盖。

双端真机验证：
1. DSH：`/tmp/workloom-demo` 建 `spec/` 两级 + index.md + config packages 声明，
   新会话看 session-context 快照含 guidelines 段。
2. Pi：`/tmp/workloom-pi-demo` 同构，`session_start` 注入消息含 guidelines 段。
3. 模型按索引读文件：让模型报出某 index.md 的首行标题（证明「按需读」链路可用）。

## 9. 实施轮次

1. 轮 1：core spec-index.js + session-context 接入 + init README 模板 + 单测 → 汇报。
2. 轮 2：workflow.md 文案 + workloom-update-spec skill → 汇报。
3. 轮 3：build + 部署同步 + 双端真机验证 + ADR-0007 + 文档收尾 → 汇报。
