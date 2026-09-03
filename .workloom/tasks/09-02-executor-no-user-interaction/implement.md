# Implement：三切片 test-first 执行序列

执行纪律：逐切片红绿循环（先写失败断言再实现）；每切片完成后跑完整
验证矩阵；切片间各成一个 commit（`repo/commits`）。

## 切片 0（前置文件，先于一切代码改动）

1. 新建 `.workloom/config.json`：等效现状（仅 `packages` 段，五包 +
   repo），JSON 格式。
2. 新建 `.workloom/config.local.json`：个人 `subagent_profiles` —— 现
   config.yaml 被删的三 kind model/effort 原值 + 每 kind
   `tools.includes: ["lsp_*"]`。
3. `.gitignore`：追加 `.workloom/config.local.json` 与
   `.workloom/config.local.js`（保留现有条目）。
4. 删除 `.workloom/config.yaml`（内容已迁移；此时旧解析器仍在读——
   注意：切片 ① 完成前 loadConfig 仍读 yaml，删除动作与切片 ① 的
   新 loader 同一个 commit 内成对落地，避免中间态断配置）。

## 切片 ①：配置系统换轨（core）

1. 红：`packages/core/test/config.test.js` 新增用例——
   json/js 双格式加载、对象顶层 key 覆盖、函数工厂（入参为低层合并
   结果）、三层优先级链、同层双文件歧义、yaml 探测报错、全局白名单
   （6 类放行/项目字段报错/白名单外报错）、遗留 `subagents` WARNING、
   tools 字段校验（数组/类型/空/去重）、`default_package` 删除后不再
   解析、`requires_tools` front-matter 报错。
2. 红：`local-prompts` 三层目录叠加与顺序用例（全局 → 项目 →
   local；层内 all 在前）。
3. 绿：按 design 1.1–1.5 重写 `config.js` / `local-prompts.ts`，
   清 `default_package`（含 `migrate.js`）、`requiresTools`（含两
   adapter 调用面）。
4. 模板与外围：`init.js`（空模板改 `config.json`、example 重写为
   `config.example.json` + `config.example.js` 两形态）、
   `doctor-check-rules.ts` 检查⑨与 `doctor-local-prompts.ts` 更新。
5. 验证矩阵 + commit（feat(core): 配置系统换轨…）。

## 切片 ②：工具可见性机制层（core + 两 adapter）

1. 红：`executor-tools.test.js`——默认名单（两 runtime）、includes/
   excludes、尾缀 `*` 模式、求交去重保序。
2. 绿：新增 `core/src/legacy/executor-tools.js`（+ `.d.ts`）。
3. 红：adapter-dsh——`toolFilter: {allow}` 成形、未知名不出现在
   allow、capability 校验保留、回执 `, K tools allowed`、
   守卫拒绝（越界 write/edit）与放行（非 research / 域内路径）、
   重建逻辑（fixture task.json 扫描）。
4. 绿：重写 `executor-dispatch.ts`（删 `buildDenyList` /
   `availableToolNames`）、`executor.ts` 接线、新 `executor-guard.ts`。
5. 红：adapter-pi——`-t` 参数成形、空交集报错、pi-lsp 按需 `-e`、
   research `-e` 副本扩展。
6. 实证第一步：pi 同名注册覆盖语义（child pi 实测）；按结果定副本名，
   落 `assets/research-scope.ts`。
7. 验证矩阵 + commit（feat(core/adapter-*): 执行器工具白名单…）。

## 切片 ③：协议层（assets + core）

1. 红：`executor-context.test.js` 纪律两句 + research 句逐字断言；
   `contract-asset.test.js` 处置句逐字断言 + `version: 19`。
2. 绿：`executor-context.js` 共用段与 research 段追加；`workflow.md`
   2.1 末尾处置句 + 版本号。
3. 验证矩阵 + commit（feat(assets): 提问回传协议…）。

## 验证矩阵（每切片收尾全跑）

```bash
pnpm lint
pnpm -r typecheck
pnpm -r build
cd packages/core && node --test test/*.test.js
cd packages/adapter-dsh && node --test test/*.test.js
cd packages/adapter-pi && bun test test/*.test.ts
```

外加：改动文件 `lsp_diagnostics` 零 Error。

## 部署（全部切片完成后）

`~/dsh/bin/dsh-sync-workloom`（rsync）；dshweb 重启归用户；重启后派发
回执应含 `, K tools allowed` 新口径（验证生效）。
