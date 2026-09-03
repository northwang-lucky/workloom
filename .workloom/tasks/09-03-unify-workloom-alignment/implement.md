# implement: test-first 实施切片

## 1. 执行规则

1. 每个切片执行 red → green；测试只观察已确认的公共接缝。
2. 每完成一个切片运行受影响测试；全部切片完成后运行全量验证。
3. 使用 LSP symbols/signature 定位接口，修改 TS 后检查 diagnostics；重命名优先用 LSP rename。
4. 不顺带拆分 1194 行的 `task-store.js`；只增加窄写口，纯函数和编排放新模块。

## 2. 切片一：Alignment 纯函数

- Red：新增 hash、换行归一化、open-node marker、stale 状态矩阵测试。
- Green：新增 runtime-neutral legacy 模块并导出最小公共接口；复用现有 PRD title/placeholder 校验。
- 验收：完整 PRD 参与 hash；planning research 与旧 in_progress 空凭据不被 stale。

## 3. 切片二：数据模型与原子写

- Red：新任务仅有 `alignment:null`、旧 grilling 往返不丢、doctor 写回边界、temp+rename 失败清理测试。
- Green：增加 `TaskAlignmentRecord`、normalize/build 默认值、通用原子写原语和 task-store 凭据窄写口；删除 grilling 写入与 pending 提示链路。
- 验收：校验失败零写入；同 hash confirm 不刷新时间；旧字段不被重解释。

## 4. 切片三：Review/confirm service 与工具面

- Red：review 只读、confirm 成功/hash 冲突/非法 PRD/open nodes/幂等/非主会话拒绝测试。
- Green：新增 `alignment-service.ts`、core surface 常量与 `workloom_task_align`；DSH/Pi 注册 schema，DSH 增 delegation-depth guard。
- 验收：confirm 同步执行并只通过原子窄写口落盘；Pi executor 不获得该工具。

## 5. 切片四：生命周期门禁与 force

- Red：start、executor 新派发/continuation、check、archive 的状态矩阵与多 gate override 测试；force 空 reason 全拒绝。
- Green：以通用 gate override 写口替换 executor 专用硬编码；新增 `stale_alignment`，各入口先求值再逐项记录绕过。
- 验收：planning 可 research；仅已对齐的 in_progress stale 被后续动作阻断；双冲突写双记录。

## 6. 切片五：Workflow 与 skill 资产

- Red：契约版本、单一 Phase 1.1、固定节点族、frontier、推荐答案、事实调查、收敛步骤及触发排他性资产测试先失败。
- Green：新增 `workloom-alignment` 与 UI/TDD references；删除两个旧 workloom skill；改写 workflow、planning breadcrumb、norms、2.1 UI 文案及 vendored grilling/tdd workloom 注记。
- 验收：主 skill 保持精简，分支知识按需披露；agent-facing 文案全部英文。

## 7. 切片六：双 runtime 分发与 protocol

- Red：DSH/Pi skill 清单、新 align 工具 schema、协议匹配/不匹配、四包 semver 一致性测试。
- Green：更新 DSH `SKILL_ASSETS`、Pi `sync-skills.mjs`，增加 core protocol 常量及 DSH apply/Pi 工厂启动校验。
- 验收：注册副作用前 fail loud；Pi build 后旧 skill 目录无残留。

## 8. 切片七：Doctor 与团队规范

- Red：overlay 有旧引用、无 overlay、无旧引用、`--fix` 不修改 overlay 的 doctor 测试。
- Green：新增不可修复 issue 类型和检查规则；共享 overlay 路径常量；按已确认边界更新 legacy-module spec。
- 验收：提示包含准确替换动作，不自动修改用户 guidance。

## 9. 切片八：Skill eval

- 建立流程行为用例和 20 条 should-trigger/near-miss 描述评估集。
- 同轮启动 with-skill 与 baseline fresh-agent 样本，保存 timing；完成断言评分与 benchmark。
- 使用 skill-creator 的 `generate_review.py --static` 生成 HTML，等待用户评审；反馈要求改动时由同一 implement executor 继续修订并重跑。

## 10. 全量验证

```bash
pnpm lint
pnpm -r typecheck
pnpm -r build
cd packages/core && node --test test/*.test.js
cd packages/adapter-dsh && node --test test/*.test.js
cd packages/adapter-pi && bun test test/*.test.ts
```

对所有修改过的 TS 文件执行 LSP diagnostics。随后使用独立 DSH headless profile 与 Pi 沙箱完成 planning smoke；先 dry-run 再按部署规范同步构建产物，Web GUI 重启只由用户决定。

## 11. 交付顺序

完成代码与自动化测试 → skill eval/viewer 用户评审 → 按反馈迭代 → runtime smoke → check executor 全量复核 → 提交。实施 executor 不提交 Git。
