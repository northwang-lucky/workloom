# fix(locate): 向上查找命中家目录即停，禁止把全局 ~/.workloom 识别为项目资产目录

## Goal

修复 `findWorkloomRoot` / `detectLegacyTrellis` 向上查找缺少家目录边界的问题：当会话 cwd 位于没有 `.workloom` 的项目（如 deepseek-harness）时，查找一路上溯至 `$HOME`，把全局配置层 `~/.workloom` 误判为项目资产目录，导致 workloom 上下文被注入非 workloom 项目、任务与资产可能写入全局目录。修复后：向上查找命中家目录（realpath 归一后）即停止，家目录永远不被识别为项目根。

## Requirements

1. `findWorkloomRoot` 向上查找时，候选目录经 realpath 归一后等于家目录（`os.homedir()` 同口径归一）即停止并返回 null；家目录本身的 `.workloom` 不参与命中（cwd == home 时同样返回 null）。
2. symlink 场景必须正确：`homedir()` 返回 symlink 路径（如 `/home/xxx` → `/data00/home/xxx`）而 cwd 为真实路径时，仍能识别家目录边界。
3. `detectLegacyTrellis` 同口径加边界（`~/.trellis` 不算遗留项目）。
4. 两个函数增加可选第二参 `options?: { homeDir?: string }`（缺省 `os.homedir()`），供测试注入家目录；纯新增可选参数，向后兼容。
5. 家目录之上的目录（如 `/data00`）若存在 `.workloom` 仍可命中——行为不变，本任务不改。
6. 项目 `.workloom` 位于家目录之下的正常场景（到达家目录前已命中）不受影响。

## Acceptance Criteria

Seam 确认为 core 的两个公共导出函数 `findWorkloomRoot` / `detectLegacyTrellis`，test-first 交付，测试落在 `packages/core/test/locate.test.js`（不触碰内部 helper）：

1. AC1：cwd 在家目录之下、链路中无项目 `.workloom`、家目录存在 `.workloom` → `findWorkloomRoot` 返回 null（以 `options.homeDir` 注入模拟）。
2. AC2：cwd == 家目录 → 返回 null。
3. AC3：`homeDir` 为 symlink 路径、startDir 为真实路径（或反之）→ 边界仍生效。
4. AC4：项目 `.workloom` 位于家目录之下时正常命中（回归保护）。
5. AC5：`detectLegacyTrellis` 同样在家目录边界停止（`~/.trellis` 不命中）。
6. AC6：不传 `options` 时行为缺省取 `os.homedir()`，全部既有测试通过。
7. 验证命令：`cd packages/core && node --test test/*.test.js` 全绿；`pnpm lint` 无 error。

## Notes

- 两个 adapter（dsh/pi）共 5 处消费均走 core 同一实现；root 为 null 时插件静默不注入（`adapter-dsh/src/plugin.ts`），无需 adapter 改动。
- realpath 归一失败（路径不存在）时的降级策略属实现细节，由 implement executor 处理，要求不抛错中断查找。
- 复现依据：DSH 会话 session-066de674-7c1c-4cc5-91a1-d962beed39e7（cwd=deepseek-harness）把 `~/.workloom` 识别为项目资产目录（注入上下文显示 `source: project config`、`Git: branch unknown`、`Developer: unknown`）。

## Alignment Decisions

- 边界语义：命中家目录即停，家目录本身永不为项目根（用户确认，方案 A）。
- `detectLegacyTrellis` 同口径加边界（用户确认，方案 B 同加）。
- 可测试性：增加可选 `options.homeDir` 注入（推荐 A，与 `loadConfig` 的 `options.homeDir` 模式一致）。已拒绝：测试直连真实 `$HOME`（依赖环境、脆弱）；导出内部边界判定 helper（扩大公共 API 表面）。
- test-first：采用（推荐 A），seam = `findWorkloomRoot` / `detectLegacyTrellis`，测试文件 `packages/core/test/locate.test.js`。
- 非目标：adapter 行为变更、全局配置层位置变更、家目录之上目录的命中策略。
- 开放节点：无。
- 收敛总结：目标与价值、范围与非目标、环境约束（legacy 纯 JS + JSDoc 模块）、可观测验收（AC1–AC6 含 seam）、test-first 适用性、关键决策（边界语义 / 接口注入）、边界与失败路径（symlink、cwd==home、realpath 失败降级）均已确认，frontier 为空。

<!-- workloom:open-nodes=none -->
