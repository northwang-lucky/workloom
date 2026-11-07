# repo/deployment 规范

把本仓库构建产物部署进 DSH web profile。

- install shape: 生产 profile（`~/.dsh/profiles/web`）依赖 `github:northwang-lucky/workloom#path:packages/dsh-workloom`；pnpm-lock 钉提交，下面循环按该源形态。临时说明：容器切换前生产 pin 仍在旧提交的 `packages/adapter-dsh` 路径（容器决定 10），切换时重钉到新路径
- dist committed: `packages/core/dist/` 与 `packages/dsh-workloom/dist/` 入库（gitignore 例外），使 `github:…#path:` 子目录安装免构建步骤；每次 src 改动必须同 commit 重建并提交 dist——过期 dist 会给 git 安装发过期行为；提交前比对 dist 与 src 文件清单镜像，防已删模块残留
- d.ts distribution: core 构建在 tsc 后跑 `scripts/copy-domain-dts.mjs`，用手写 src `.d.ts` 锚点（现为 worktree.d.ts、config.d.ts 等过渡锚点）覆盖对应 dist 产物；锚点与 dist 字节相等由 `test/dist-dts.test.ts` 每次构建后断言
- change loop: 改 src → `pnpm -r build` + `pnpm -r typecheck` + 该包 `node --test` → dist 同 commit 提交 → push → 在 profile 目录跑 `pnpm update @workloom-ai/dsh-workloom` 把锁重钉到新提交
- taking effect: dsh-workloom 是 host 侧 bundle，启动时读取，每次变更需实例重启；重启经 `dsh-stop --only-ui && dsh-start --only-ui`，用户所有、逐次授权——agent 不自行重启
- retired paths: `dsh-sync-workloom` rsync 硬拷贝与 `dsh plugin add` 属旧流程，脚本本机已不存在
- counter-example: 构建新 skill 资源后既不提交 dist 也不重钉锁，profile 重启后加载旧资源清单
