# worktree 归档 rebase 清理模式 — implement

按 test-first 红绿推进，每个阶段先写失败用例再实现到绿。全部改动落在任务
worktree（`.workloom/worktree/10-26-worktree-rebase-cleanup`）。设计细节以
[design.md](design.md) 为准；实现前读本任务 prd.md + design.md +
implement.jsonl 列出的 spec 条目。

## 阶段 1：配置面（config）

1. 红：`packages/core/test/config.test.js`——默认值断言改为
   `rebase-keep-branch`；新增 `rebase-keep-branch` / `rebase-delete-branch`
   合法加载用例；保留裸值 `rebase` 拒收用例。
2. 绿：`config.js`（枚举扩六值 + 默认值）、`config.d.ts`（类型联合 + 注释）、
   `init.js`（模板默认值与注释）。
3. 跑 `node --test test/config.test.js` 确认绿。

## 阶段 2：git 原语（domain/git.js）

1. 红：`packages/core/test/git.test.js` 真 git 夹具——`gitHasRebaseHead`
   三态（无中断 exit 1 → false / 冲突中断 → true / abort 后 → false）；
   `gitRebase` 成功路径与冲突路径 exit 1；`gitRebaseAbort` 恢复现场；
   `gitMergeFfOnly` 快进成功与非快进失败（stderr 透出）。
2. 绿：`git.js` 新增四原语（纪律见 design.md「git 原语」节），core 入口
   导出与 .d.ts 同步。
3. 跑 `node --test test/git.test.js` 确认绿。

## 阶段 3：cleanup rebase 路径（domain/worktree.js）

1. 红：`packages/core/test/worktree-lifecycle.test.js`——新增 ⑫ 组
   （⑫a-f，清单见 design.md「测试设计」节）；既有 merge 语义用例 fixture
   显式 pin 原 cleanup 模式值。
2. 绿：`worktree.js`（`REBASE_MODES` + rebase 整合路径 + delete 条件扩展 +
   `rebased` 回执字段）、`worktree.d.ts`、`service/task-ops.ts` 回执透传
   （若类型需要）。
3. 先 `pnpm -r build` 再跑 `node --test test/worktree-lifecycle.test.js`
   确认绿（core 测试跑 dist，见 verify spec）。

## 阶段 4：全量验证 + dist 入库

1. `pnpm lint`、`pnpm -r typecheck`、`pnpm -r build`、
   `cd packages/core && node --test test/*.test.js` 全绿。
2. dist/ 重建产物与源码同 commit 入库（deployment 纪律）。
3. commit 粒度：配置面 / git 原语 / cleanup 路径 / d.ts 分发修复各一个
   commit，消息格式 `<type>(<scope>): <中文描述>`。

## 阶段 5：手写 d.ts 分发修复（R8，检查阶段并入，主会话直修）

1. 红：新增 `packages/core/test/dist-dts.test.js`——逐个断言手写
   `src/domain/*.d.ts` 与 `dist/domain/` 同名文件内容一致（先失败：
   当前 dist 是 tsc 生成版）。
2. 绿：新增 `packages/core/scripts/copy-domain-dts.mjs`（拷贝 + 导出名
   子集校验 fail loud）；`packages/core/package.json` build 脚本追加拷贝步骤。
3. `pnpm -r build`、`pnpm -r typecheck`、core 与两个 adapter 的测试复跑全绿。
