# 新增 skill workloom-packages-scan：旧项目引入 workloom 后的包扫描与 config.json packages 自动填写

## Goal

为旧项目新引入 workloom 的场景提供一个包扫描 skill：自动识别项目的包结构（各类 monorepo、git submodule、纯 git 嵌套项目），生成候选包清单，帮助用户填写 `.workloom/config.json` 的 `packages` 字段（`name → { path, type?, git? }`），让 spec-index 的包名 scope 过滤开箱可用。

## 已核实的事实（主会话探查结论）

- `packages` 字段 schema：`packages/core/src/legacy/config.js` 的 `parsePackages`——`name → { path: string, type?: string, git?: boolean }`；当前唯一消费者是 `packages/core/src/legacy/spec-index.js` 的包名 scope 过滤（只用 `Object.keys`），`type/git` 目前为纯标注字段。
- skill 分发链路：中间表示在 `packages/assets/skills/<name>/SKILL.md`；Pi 侧经 `packages/adapter-pi/scripts/sync-skills.mjs` 的 `SKILL_SOURCES` 同步；DSH 侧在 `packages/adapter-dsh/src/skills.ts` 的 SKILL_PATHS 硬编码清单注册（改动后需按 `repo/deployment` spec 重建 dist）。
- workloom 自身 `.workloom/config.json` 的 packages 写法可作参照：按目录名做 key（core/assets/adapter-dsh/adapter-pi），另有根条目 `repo: { path: "." }`。

## Alignment Decisions

第 1 轮 8 个决策节点，用户 2026-09-09 答复「全按推荐」，逐条锁定：

- skill 形态：脚本 + 提示词组合。确定性扫描（pnpm-workspace.yaml / package.json workspaces / lerna / nx / turbo / go.work / Cargo workspace / .gitmodules / 嵌套 .git）归脚本，候选呈现与确认交互归 SKILL.md。
- 写入策略：先输出候选清单、用户确认后再写；已有 packages 非空时增量合并，冲突条目仅提示不覆盖。
- `git`/`type` 口径：`git: true` 仅标 submodule 与嵌套 git 仓库；`type` 标来源类型（workspace/submodule/nested-git），与 `git` 互补。
- 命名约定：目录 basename 做 key，scoped 包去 org 前缀取包名尾部，重名以相对路径消歧；默认追加 `repo: { path: "." }` 根条目，用户可去掉。
- 分发范围：DSH 与 Pi 两个 adapter 都接入（skill runtime 无关，只操作文件系统与 config.json）。
- 触发方式：model-invoked，靠 description 自动触发。
- 扫描深度：workspace 清单文件驱动（清单路径直接采信）；嵌套 git 仅扫清单未覆盖的一级子目录 + .gitmodules；排除 node_modules / dist / vendor / 隐藏目录。
- 验收口径：脚本配 node:test 单测（各生态 fixture 目录），skill 文档层走真仓人工验证。

已否决备选：纯提示词无脚本（各生态识别不确定性）、直接改写 config.json（绕过确认文化）、type 标生态类型（与 git 语义重叠）、全深度递归扫嵌套 git（成本与误报）、仅接单 adapter、user-invoked（自然语言诉求需 agent 自主发现）、纯人工验证无单测。

收敛摘要：frontier 无开放节点，Requirements 与 Acceptance Criteria 已按上述决策落定。

<!-- workloom:open-nodes=none -->

## Requirements

- R1 扫描脚本：skill 目录内捆绑确定性扫描脚本，识别 pnpm-workspace.yaml、package.json workspaces、lerna、nx、turbo、go.work、Cargo workspace、.gitmodules、嵌套 .git；workspace 清单声明的路径直接采信，嵌套 git 仅探测清单未覆盖的一级子目录 + .gitmodules；排除 node_modules / dist / vendor / 隐藏目录。输出候选清单 `name → { path, type?, git? }`（key 命名与 type/git 口径按 Alignment Decisions）。
- R2 SKILL.md（model-invoked，含 description 自动触发）：流程 = 运行扫描 → 呈现候选清单 → 用户确认 → 写入 `.workloom/config.json`；已有 packages 非空时增量合并，冲突条目仅提示不覆盖；默认追加 `repo: { path: "." }` 根条目并说明可去掉。
- R3 双端分发接入：`packages/adapter-dsh/src/skills.ts` SKILL_PATHS 注册；`packages/adapter-pi/scripts/sync-skills.mjs` SKILL_SOURCES 同步（含脚本资产，Pi 侧可直接执行）；按 repo/deployment 重建 dist。
- R4 单测与回归：扫描脚本配 node:test 单测，各生态用 fixture 目录覆盖；三端 test / typecheck / lint / build 全绿。

## Acceptance Criteria

- workloom 本仓（pnpm monorepo）人工验证：扫描产出的候选与现有 `.workloom/config.json` packages 一致（core / assets / adapter-dsh / adapter-pi + repo 根条目）。
- 含 submodule 与嵌套 git 的样例仓验证：`git: true` 与 `type` 标注正确；已有非空 packages 时增量合并且冲突仅提示不覆盖。
- 脚本 node:test 单测全部通过；三端测试基线（core 545+ / dsh 135+ / pi 158+）全绿，typecheck / lint 干净。
- skill 在 DSH 与 Pi 双端可被发现并加载（SKILL_PATHS / SKILL_SOURCES 注册生效，dist 时间戳晚于源码并完成 rsync 同步）。

## Notes

- 关联背景：本任务由主会话第 2 项工作发起；第 1 项工作（pi-web v0.9.0 内建 subagent 探查）结论为 workloom 无需适配改动，与本任务无耦合。
