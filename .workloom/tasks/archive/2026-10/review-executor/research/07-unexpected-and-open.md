Injection marker: tasks/10-29-review-executor:mvubzo1wowkur3nl

# review 执行器：与预期不符的机制与开放问题

Research report for task `tasks/10-29-review-executor`。本文件只收录「与任务清单预期不符」
或「任务清单未提但会阻断实现」的机制，以及无法自行裁决的开放问题。

> 执行契约冲突说明：执行契约要求先读 plan.md，本任务 planning 阶段无 plan.md，
> 以 prd.md 与源码为准（声明一次）。

## 意外发现 1（阻断级）：本机片段机制对未知 kind 直接抛错，review 只加枚举会让所有 review 派发失败

- 派发链路把 kind 原样当片段 target 传给 `composeLocalDirectivesText`
  （`packages/adapter-dsh/src/executor.ts:483-486,527-530`；
  `packages/adapter-pi/src/executor.ts:310`），失败即抛错、派发中止。
- `filterAndOrderLocal` 对不在 `LOCAL_FRAGMENT_TARGETS` 的 target 抛
  `unknown target "review"`（`packages/core/src/service/local-prompts.ts:158-176`）。
- 实测：

  ```txt
  workloom local prompts: target: unknown target "review" (must be one of main/research/implement/check/frontend/all)
  ```

- 因此「新增 review 执行器」的最小改动集里必须包含
  `LOCAL_FRAGMENT_TARGETS`（`local-prompts.ts:39-46`）与 `TARGET_BY_FILE`
  （`local-prompts.ts:60-68`）两处；这不在 prd 的六个 test-first 接缝里。
- 同源风险：若用户先建 `.workloom/prompts/review.md`，`readAllFragments` 会对未知文件名抛错
  （`local-prompts.ts:247,272-282`），**连累所有 kind 的派发**。落地顺序上应先加 target 支持，
  或在 plan 里显式说明该文件在建好支持前不可创建。
- doctor 侧对应文案未更新会让 doctor 把 `review.md` 报成 unknown
  （`packages/core/src/service/doctor-local-prompts.ts:123,126`）。

## 意外发现 2：`computeTaskStage` 没有 review 分支，review 会被当成 implement 改 stage

```js
// packages/core/src/domain/task-store.js:1234-1236
  if (kind === EXECUTOR_KINDS.research) return current
  if (kind === EXECUTOR_KINDS.check) return TaskStage.CHECK
  return TaskStage.IMPLEMENT
```

- planning 阶段新任务 stage 本来就是 implement（`task-store.js:365`），所以 1.4 前派发 review
  表面无变化；但在 stage=check 之后派发 review（补审计划）会把 stage 悄悄改回 implement，
  且 doctor 的阶段一致性检查只在 stage=check 时告警（`doctor-check-rules.ts:229-259`），
  改回后不报，属于静默状态污染。
- 建议在 `computeTaskStage` 加 `review → current`（与 research 同语义），并补一条纯函数单测
  （现成测试在 `packages/core/test/task-store.test.js`）。

## 意外发现 3：prd 说的「init 配置模板里四个 kind 默认条目」与事实不符

- `config.json` 种子模板（`packages/core/src/domain/init.js:73-81`）只有 `packages`。
- `config.example.json` 的 `subagents` 只有 research/implement/check 三条
  （`init.js:111-119`），**没有 frontend**。
- `config.example.js` 的 `subagents` 段只在 `subagent_profiles` 内出现 research/check
  （`init.js:186-200`）。
- 结论：接缝③「init 配置模板 seeding 出 subagents.review 默认条目」实际只能落到示例模板
  （`CONFIG_EXAMPLE_JSON_TEMPLATE`），并且要接受「模板本来就不覆盖全部四个 kind」的现状，
  或者顺手补齐（属范围扩张，需主会话裁决）。`init.test.js:157-167` 的路径清单只固定了现有三条。

## 意外发现 4：kind 的「文案枚举」有三份独立副本，改一处不会互相提醒

| 副本 | 位置 | 作用 |
| --- | --- | --- |
| core 工具描述（两处） | `packages/core/src/surface.ts:55`（工具 description）、`surface.ts:130`（kind 参数 description） | 模型可见的工具说明 |
| DSH 标签表 | `packages/adapter-dsh/src/executor-injection.ts:14-19` | 子会话标题 + 容量统计反解 |
| Pi 标签表 | `packages/adapter-pi/src/pi-args.ts:22-27` | 子会话标题 |

- 三处都不引用 `EXECUTOR_KINDS` 的键做运行时校验，只是字面量对象/字符串。
- 遗漏后果：标题退化为 `workloom-review`（`executor-injection.ts:91-93`）/ 纯 kind 标签（`pi-args.ts:76` 的 `?? kind`），
  不报错、不阻断，因此不会被测试自然捕获——需要显式补测（dsh `executor.test.js:780-803`、
  pi `pi-args.test.ts:44-54` 的 kind 标签数组）。

## 意外发现 5：doctor 没有任何 executor kind 白名单检查，也没有执行器画像展示

- `checkConfig`（`doctor-check-rules.ts:466-530`）只校验文件存在、packages 非空、config 可解析。
- 全部 12 类检查里与 kind 相关的只有 `doctor-check-rules.ts:245`（stage=check 的最近派发）
  与 `doctor-local-prompts.ts:123,126`（片段文件名文案）。
- 「Executor profiles」展示在会话快照（`session-context.ts:216-232`），由
  `executor-profiles.js:52` 遍历枚举自动生成，与 doctor 无关。
- 结论：接缝③「doctor 认识 review 类型」的可落地面只有片段文件名 message/hint 两处字符串；
  如果 plan 里写了「doctor 的配置检查新增 review」会找不到锚点。

## 意外发现 6：DSH 侧没有 kind 参数校验，「派发校验接受 review」的失点不在参数层

- Pi 在 `adapter-pi/src/executor.ts:375` 显式 `assertKind`。
- DSH 只在组装注入时经 core `buildExecutorPrompt` → `assertKind`（`executor-context.js:385`）报错，
  而该调用发生在 `composeLocalDirectivesText` 之后（`adapter-dsh/src/executor.ts:527-541`）。
- 因此 DSH 的非法 kind 失败信息是 `workloom executor context: invalid kind: …`，
  不是参数校验错误；写测试时不要期待 schema 拦截（schema 无 enum，见
  `adapter-dsh/src/executor-schema.ts:22-25`）。

## 意外发现 7：审查报告文件不会被任何注入机制自动带上

- 注入只认 `prd.md`（`executor-context.js:47`）、`plan.md`（`executor-context.js:50`）
  与 `research/*.md`（`executor-context.js:620-634`）。
- `plan-review.md` 落在任务目录不会出现在 Pointer list / Research materials，也不会被
  `workloom_task_*` 工具读取。
- 因此 prd 第 4 条「报告与处置结果一起进 1.4 审阅包」只能由主会话在 1.4 手工呈现；
  若希望机制自动带出，需要改注入或工具面，属于额外范围。

## 意外发现 8：写范围守卫的 Pi 副本是 `.ts` 扩展源，按 `-e` 绝对路径直接加载

- `packages/adapter-pi/src/executor.ts:113-117` 用 `fileURLToPath(new URL('../assets/research-scope.ts', …))`
  指到包内 `assets/`，随 `-e` 下发（`pi-args.ts:92-94`）。
- `packages/adapter-pi/package.json` 的 `files` 已含 `assets`，加文件不需要改打包配置；
  但扩展内部文案与文件名都带 research（`assets/research-scope.ts:46-49`），
  review 复用时应重命名或参数化，否则错误信息会误导（「denied for the research executor」）。
- 已知边界：守卫只挡 `write`/`edit`，bash 路径绕过（`adapter-dsh/src/executor-guard.ts:13-14`；
  `assets/research-scope.ts:8-11`），review 同样存在该边界。

## 开放问题（unverified，需主会话裁决）

1. 接缝③里的「doctor 认识 review 类型」到底指什么：只补片段文件名文案，还是要求新增一条
   doctor 检查（例如「有 plan.md 但无 review 派发」）？后者需要新的判定字段与 override 面，
   现有代码里没有对应锚点。
2. 「init 配置模板 seeding review 默认条目」是只加 `config.example.json`，还是连
   `config.example.js` 与（当前根本没有的）frontend 条目一起补齐？
3. review 与 research 的写范围守卫要不要合并成一个「kind 集合守卫」模块（推荐，符合
   code-style「抽象通用机制」），还是复制一份 review 专用模块（改动更小但违背同一条规范）？
4. 审查报告文件名 `plan-review.md` 是否需要进 `.workloom/.gitignore` 或任务归档逻辑？
   归档会整目录搬走（`archive/`），目前看不需要。
5. review 的复审轮次（上限三轮）是否需要机制留痕（例如 dispatches 里记轮次）？
   现有 `continue_executor` 复用同一 childId，dispatches 会新增同 kind 记录，
   但没有轮次字段；若要可审计需要新增字段（超出当前 prd 表述，unverified）。
