## Goal

让 workloom 工作流的运行时状态忽略策略自包含：init 在 `.workloom/` 下幂等生成 `.gitignore`，接入方仓库无需在根 `.gitignore` 手工维护 workloom 内部布局规则。

## Requirements

1. workloom init（`packages/core/src/legacy/init.js`）幂等生成 `.workloom/.gitignore`：文件缺失才创建，已有内容一律不覆盖（与现有骨架语义一致）。
2. `.gitignore` 模板忽略条目确认为两项：`.runtime/`（瞬态运行状态）与 `.developer`（本机开发者身份，类比 `AGENTS.local.md`）。
3. `.workloom/.gitignore` 本身必须入库，随仓库分发。
4. 落地范围含两部分，同一任务内拆两个 commit 完成：
   - `feat(core)`：init.js 生成 `.gitignore` + 测试；
   - `chore(repo)`：本仓库收敛——根 `.gitignore` 移除 `.workloom/.runtime/` 条目、`git rm --cached .workloom/.developer`、提交新生成的 `.workloom/.gitignore`。

## Acceptance Criteria

test-first 交付（选项 A），以下三条测试接缝先写失败测试再实现，全部通过：

1. 首次 init 骨架含 `.workloom/.gitignore`，内容含 `.runtime/` 与 `.developer` 两条目，且该文件出现在结果 `created` 列表中。
2. force 幂等不覆盖用户已自定义的 `.gitignore`（内容保持用户版本）。
3. 已有 `.workloom` 但缺 `.gitignore` 时，force 补建该文件。

仓库收敛验收：

4. `git check-ignore .workloom/.runtime/ .workloom/.developer` 命中 `.workloom/.gitignore`；根 `.gitignore` 不再含 `.workloom/` 相关条目。
5. `git ls-files .workloom` 输出中不含 `.developer`，含 `.gitignore`。

验证命令：`pnpm lint`、`pnpm -r typecheck`、`cd packages/core && node --test test/init.test.js` 全绿。

## Notes

- `.gitignore` 模板内容（英文注释，遵循 `spec/repo/language`「写入用户项目的运行时文案全英文」）：

  ```gitignore
  # Runtime state (session pointers etc.), per-machine.
  .runtime/

  # Local developer identity (like AGENTS.local.md).
  .developer
  ```

- 老项目兼容：init 不清理使用方根 `.gitignore` 中可能残留的旧条目（如手写的 `.workloom/.runtime/`），重复条目无害；init 保持纯生成职责，与 detectLegacyTrellis 只报告的克制一致。
- 模板实现方式沿用现有骨架模式：`FILE_NAMES` 增加 `gitignore` 常量，模板常量与 `SPEC_README_TEMPLATE`/`CONFIG_TEMPLATE` 同级。
- core 改动后按 `AGENTS.local.md` 执行 `pnpm -r build` + `dsh-sync-workloom` rsync 段。
