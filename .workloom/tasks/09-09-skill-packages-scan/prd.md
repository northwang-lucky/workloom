# 新增 skill workloom-packages-scan：旧项目引入 workloom 后的包扫描与 config.json packages 自动填写

## Goal

为旧项目新引入 workloom 的场景提供一个包扫描 skill：自动识别项目的包结构（各类 monorepo、git submodule、纯 git 嵌套项目），生成候选包清单，帮助用户填写 `.workloom/config.json` 的 `packages` 字段（`name → { path, type?, git? }`），让 spec-index 的包名 scope 过滤开箱可用。

## 已核实的事实（主会话探查结论）

- `packages` 字段 schema：`packages/core/src/legacy/config.js` 的 `parsePackages`——`name → { path: string, type?: string, git?: boolean }`；当前唯一消费者是 `packages/core/src/legacy/spec-index.js` 的包名 scope 过滤（只用 `Object.keys`），`type/git` 目前为纯标注字段。
- skill 分发链路：中间表示在 `packages/assets/skills/<name>/SKILL.md`；Pi 侧经 `packages/adapter-pi/scripts/sync-skills.mjs` 的 `SKILL_SOURCES` 同步；DSH 侧在 `packages/adapter-dsh/src/skills.ts` 的 SKILL_PATHS 硬编码清单注册（改动后需按 `repo/deployment` spec 重建 dist）。
- workloom 自身 `.workloom/config.json` 的 packages 写法可作参照：按目录名做 key（core/assets/adapter-dsh/adapter-pi），另有根条目 `repo: { path: "." }`。

## Alignment Decisions

（对齐进行中：第 1 轮问题已列出，等待用户回答；结论将逐条记录于此。）

### 开放节点（第 1 轮 frontier，均已附主会话推荐）

1. **skill 形态**：纯 SKILL.md 提示词引导 agent 用 bash/glob 扫描，还是捆绑确定性扫描脚本（如 `scripts/scan-packages.mjs`，识别 pnpm-workspace.yaml / package.json workspaces / lerna / nx / turbo / go.work / Cargo workspace / .gitmodules / 嵌套 .git）？
   - 推荐：脚本 + 提示词组合——扫描是重复性机械工作，脚本保证各生态识别的确定性，提示词负责候选清单的呈现与确认交互。
2. **写入策略**：扫描后直接改写 `.workloom/config.json`，还是先输出候选清单等用户确认再写？已有 packages 非空时是增量合并还是仅提示？
   - 推荐：先确认后写入（符合 workloom 确认文化）；已有非空时增量合并、冲突条目仅提示不覆盖。
3. **`git` 与 `type` 取值口径**：`git: true` 标 submodule 与嵌套 git 仓库；`type` 无现存消费者，标什么——生态类型（npm/go/cargo…）、来源类型（workspace/submodule/nested-git），还是不填？
   - 推荐：`git: true` 仅标 submodule/嵌套 git；`type` 标来源类型（workspace/submodule/nested-git），语义与 `git` 互补且对 spec 组织有指导意义。
4. **包名 key 命名约定**：目录 basename？scoped 包（`@org/pkg`）取 `pkg`？是否追加根条目 `repo: { path: "." }`？
   - 推荐：目录 basename，scoped 包去 org 前缀取包名尾部，重名时以相对路径消歧；默认追加 `repo` 根条目（与 workloom 自身配置一致），用户可去掉。
5. **分发范围**：DSH 与 Pi 两个 adapter 都接入，还是只接其一？
   - 推荐：两个都接——skill 本身 runtime 无关，只操作文件系统与 config.json。
6. **触发方式**：model-invoked（带 description 自动触发，如用户说"帮我扫一下包/初始化 workloom 配置"）还是 user-invoked（`disable-model-invocation: true`，只能手动点名）？
   - 推荐：model-invoked——"新引入 workloom 后配置 packages"是用户会用自然语言表达的诉求，需要 agent 自主发现。
7. **扫描深度与排除规则**：嵌套 git 仓库识别到什么深度？node_modules/dist/vendor 等目录如何排除？
   - 推荐：workspace 清单文件驱动为主（清单声明的路径直接采信）；嵌套 git 仅扫 workspace 清单未覆盖的一级子目录 + .gitmodules；排除 node_modules、dist、vendor、隐藏目录。
8. **验收口径**：以 workloom 本仓（pnpm monorepo）+ 一个含 submodule 的样例仓做验证，产出 config.json diff 供人工确认即算通过？还是需要 node:test 单测覆盖脚本？
   - 推荐：脚本配 node:test 单测（各生态 fixture 目录），skill 文档层走人工验证。

<!-- workloom:open-nodes=pending -->

## Requirements

（待对齐收敛后填写。）

## Acceptance Criteria

（待对齐收敛后填写。）

## Notes

- 关联背景：本任务由主会话第 2 项工作发起；第 1 项工作（pi-web v0.9.0 内建 subagent 探查）结论为 workloom 无需适配改动，与本任务无耦合。
