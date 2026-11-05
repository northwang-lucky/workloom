# 部分执行记录（SR1–SR11、C1–C6）

- 任务：`tasks/11-03-case-active-skill`
- 确认 CASE：`314ace1e243e9a99dec396f0af30a7dddd3175ebb4e28f876930e7dfc96e3fca`（CASE 已按最新验收事实修订，当前 review hash `fa55c32e0475cc554f75bcb74e5cd5c54e98dd985849f848a9265463cb0164fb`；本文档记录修订前的 SR/C1–C6 执行，结果不变）
- 代码指纹：`codeFingerprint=eb487e5a2778de8cd36f93dc6a98ae4a145823512da4ed453574a8a6d3523953`（revision-purpose fix 与回归断言之后）
- 执行时间：2026-11-04（Asia/Shanghai）
- 执行范围：SR1–SR11、C1–C6
- 未写入 `case-result.md`，未调用 `workloom_task_check`，未记录最终通过。

## 静态审查

| 项目 | 结果 | 证据 |
| --- | --- | --- |
| SR1 | 通过；P1 已修复并复核（两处续用显式 `purpose: case-design`） | `case-evidence/sr-review.md` |
| SR2 | 通过 | `case-evidence/c4-fingerprint.txt` |
| SR3 | 通过 | `case-evidence/c1-red.txt`、`c4-fingerprint.txt` |
| SR4 | 通过 | `case-evidence/c3-skill-contract.txt` |
| SR5 | 通过 | `case-evidence/c6-plan.txt`、`/tmp` 夹具探针（已清理） |
| SR6 | 通过；修复 1 个 P2 | `case-evidence/sr6-launcher-guard.txt` |
| SR7 | 通过 | `case-evidence/c2-registration.txt` |
| SR8 | 通过 | `case-evidence/c1-red.txt`、`c2-registration.txt` |
| SR9 | 通过 | `case-evidence/c2-registration.txt` |
| SR10 | 通过 | `case-evidence/c1-red.txt`、`c2-registration.txt` |
| SR11 | 通过 | `case-evidence/sr11-dist.txt` |

## 真实用例

| 用例 | 结果 | 观测 | 证据 |
| --- | --- | --- | --- |
| C1 红阶段 | passed | 三条命令均非 0：DSH 清单缺 case-active 且 SKILL.md ENOENT；Pi 构建副本缺该技能；指纹测试无法导入脚本 | `case-evidence/c1-red.txt` |
| C2 注册与构建副本 | passed | 构建 10 个技能目录；DSH 16/16、Pi 3/3、surface 33/33；副本含 SKILL/evals/scripts；命令面仅 init/doctor | `case-evidence/c2-registration.txt` |
| C3 技能契约 | passed | front-matter、关键短语、无 CJK、无模板章节、五个 eval id、continue/finish 路由与两条修订续用断言共 35/35 | `case-evidence/c3-skill-contract.txt` |
| C4 指纹 | in_progress | 单测 2/2；CLI 稳定；untracked 探针使指纹变化并在删除后恢复；场景级指纹证据待 C7/C8 | `case-evidence/c4-fingerprint.txt` |
| C5 CASE 审查 | passed | 12 个变更文件、结构问题 0；caseHash 与确认值一致；required/confirmedAt/designSession 齐全；无旧 RESULT | `case-evidence/c5-case-review.txt` |
| C6 PLAN | passed | `inspectPlanStructure` 为空；AC1–AC14 全覆盖；六份新增文件均有完整内容块；三轮审查无未处置 P0/P1/P2 | `case-evidence/c6-plan.txt` |

## 修复记录

- P2：`packages/assets/skills/workloom-case-active/evals/run-scenario.sh` 增加既有 run 目录早退检查，避免覆盖。
- P1：主会话已修复 `SKILL.md:29` 与 `SKILL.md:35`，两处续用均显式 `purpose: case-design`；DSH 内容测试新增两条上下文断言。
- 修复后 `bash -n`、`pnpm lint`、`pnpm -r typecheck`、`pnpm -r build` 均通过；DSH 178/178、Pi 205/205；C1–C6 全量重跑通过（C4 场景级子步骤待 C7/C8）。

## 待执行项

| 用例 | 原因 |
| --- | --- |
| C7 评测产物与一次运行 | 正式运行使用 iteration-2；iteration-1 planning/with_skill 已中止，不作为完成证据 |
| C8 planning/ready 行为 | 依赖 C7 的 eval-0/eval-1 项目与 grading |
| C9 legacy/batch/blocked | 依赖 C7 的 eval-2/3/4 项目与确认包 |
| C10 continue 路由回归 | 可在主会话评测完成后执行，依赖环境稳定 |
| C11 标准验证全量 | 待代码冻结后执行（本轮已先跑 lint/typecheck） |
| C12 覆盖率采集 | 依赖 C11 与最终代码 |
| C13 审阅页与反馈 | 依赖 benchmark、reviewer.html 与用户反馈 |

## 验收目录说明

- 最新 acceptance 由 planning/batch 的 `iteration-2` 与 ready/legacy/blocked 的 `iteration-4` 组成；只验收五个 `with_skill/run-1`。planning/batch 的 `without_skill` 仅作观察，不参与评分、benchmark 或审阅页。
- `acceptance-superseded`、`iteration-1`（planning 中止）与 `iteration-3`（ready 中止）不作为完成证据。
- C4 步骤 5、C7–C13 执行时以 `EVAL=$TASK/evals/skill-eval/acceptance` 读取；ready/legacy/blocked 的独立批准时序来自 `iteration-4` transcript；`grading.json`、benchmark、reviewer 与 feedback 仍待基于已有 run 生成。
