---
name: npm-publish
description: '发布 workloom 的 npm 包（@workloom-ai/core 与 @workloom-ai/dsh-workloom）。当用户说发版、发布 npm 包、打 tag 发布、release、升版本，或需要同步升级两个包版本并触发自动发布时使用。负责版本 bump、写 changelog、lockfile 更新、重建 dist、提交与打 tag，并给出推送指令。GitHub Actions 在 tag push 后完成校验、发布与 GitHub Release。'
---

# npm 包发版

workloom 是 pnpm monorepo，两个包同版本发布：`@workloom-ai/core` 与 `@workloom-ai/dsh-workloom`。tag 形如 `v1.0.0`，push tag 后 GitHub Actions 自动校验并发布到 npm。

发布由 tag 触发，本 skill 负责 tag 之前的本地准备。Agent 不主动 push，最后一步把推送命令交给用户执行。

## 前置检查

先向用户确认目标版本或 bump 类型（major/minor/patch）。然后逐项检查，任一不满足就停下并说明原因：

1. 当前分支是 `main`。
2. 工作区没有未提交改动。未提交的内容必须先让用户处理，避免把无关变更带进发版提交。
3. 目标版本比当前版本大。读两个包的 `version` 字段，确认两者一致且都小于目标版本。

## 版本基线

版本从 `0.0.0` 起算，首个正式版是 `1.0.0`。两个包的版本字段位于 `packages/core/package.json` 与 `packages/dsh-workloom/package.json`，必须始终相等。

## 发版步骤

按顺序执行，每步失败即停止，保留现场供修复。

1. **Bump 版本。** 运行脚本同步升级两个包：

   ```bash
   node .agents/skills/npm-publish/scripts/bump-version.mjs <major|minor|patch|x.y.z>
   ```

   脚本只改 `version` 字段并打印新版本。

2. **写 changelog。** 根目录 `CHANGELOG.md` 是唯一事实源。读 `git log <上个tag>..HEAD` 收集本次变更（没有上个 tag 时读全部），按 Added、Changed、Fixed 分组写简洁中文条目，在文件顶部追加 `## [新版本] - 日期` 段落。条目概括主题，不逐条抄 commit。

3. **更新 lockfile。** 运行 `pnpm install --lockfile-only`，让 importer 版本与 package.json 一致。

4. **重建 dist。** 运行 `pnpm -r build`。dist 随源码入库，过期 dist 会让 CI 的版本校验失败，也会给 git 子目录安装发过期行为。

5. **验证。** 依次运行 `pnpm -r typecheck` 与 `pnpm -r test`，全部通过后继续。

6. **核对 dist。** `git status --short packages/core/dist packages/dsh-workloom/dist` 应只显示 build 产生的预期变化。确认 dist 与 src 文件清单镜像一致，没有已删模块的残留。

7. **提交。** commit message 用 `chore(release): vX.Y.Z`，把两个 package.json、pnpm-lock.yaml、CHANGELOG.md 与 dist 一并提交。

8. **打本地 tag。** 运行 `git tag -a vX.Y.Z -m "Release vX.Y.Z"`。tag 名必须与包版本完全一致。

9. **交给用户推送。** 打印下面两条命令，让用户自行执行，agent 不主动 push：

   ```bash
   git push origin main
   git push origin vX.Y.Z
   ```

   tag push 触发 `.github/workflows/publish.yml`：校验 tag 与包版本一致、dist 干净，把 CHANGELOG.md 复制进两个包目录后按拓扑顺序发布，最后用对应版本段落创建 GitHub Release。

## Changelog 与 Release

根目录 CHANGELOG.md 是唯一事实源。CI 发布前把它复制到 `packages/core/CHANGELOG.md` 与 `packages/dsh-workloom/CHANGELOG.md`，两个包的 `files` 都包含它，npm 包里能看到。

根目录的 README.md 与 README.en.md 只随 `@workloom-ai/dsh-workloom` 发布。CI 发布前把它们复制到 `packages/dsh-workloom/`，该包的 `files` 包含两者。core 不带 README。

所有复制产物都进了 .gitignore，不单独入库。

CI 用 `node .agents/skills/npm-publish/scripts/extract-changelog.mjs <版本>` 提取对应段落作为 GitHub Release notes。Release 已存在时跳过，重跑不会失败。

## 依赖说明

`dsh-workloom` 依赖 `@workloom-ai/core` 使用 `workspace:*` 协议，本地开发链接到 workspace 包，pnpm publish 时自动替换成真实版本号。不要改回 `file:../core`，否则 npm 用户无法安装。

## 校验发布结果

tag push 后确认 GitHub Actions 的 Publish npm packages 工作流全部通过，并在 npm 上核对两个包的版本。

首次把包发布到 npm 时，registry 分两步写入。publish 请求先建包记录，放一个 `0.0.0-stage` 占位版本，`latest` 指向它。占位包里只有一个标了 `stub: true` 的空 package.json。等 tarball 上传、校验、元数据写完，正式版本才写入，`latest` 迁移过去。这个过程通常要两分钟。

这段时间里，`npm view` 可能只查到 0.0.0-stage，单版本查询与 tarball 下载可能返回 404，npmjs 网页也可能把 0.0.0-stage 显示为 latest。这些都是占位阶段的表现，不是发布失败。等几分钟再核验，或者以 `npm pack <包名>@<版本>` 能下载为准。不要在占位阶段重发版本或另打 tag。

这是首次发布专有的一步，包记录建好后的后续版本发布不会再出现。
