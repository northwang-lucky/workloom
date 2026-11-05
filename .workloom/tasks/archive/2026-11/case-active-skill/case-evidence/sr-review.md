# 静态审查记录（SR1–SR11）

- 任务：`tasks/11-03-case-active-skill`
- 确认 CASE：`fa55c32e0475cc554f75bcb74e5cd5c54e98dd985849f848a9265463cb0164fb`
- 代码指纹：`codeFingerprint=c3ba1f6e1719009c79ee63d9d32f64cfedc8aa015366ffd48f273246aba6f47d`
- 审查时间：2026-11-05
- 结论：SR1–SR11 全部通过；无未处置 P0/P1/P2。

## SR1 技能正文的状态分流与编排约束

- 状态：通过。
- 证据：
  - front-matter 三键齐全，name 为 `workloom-case-active`；description 覆盖 planning/in_progress full 与 light/completed/archive 拒绝。
  - Step 1 的活跃任务/候选扫描、Step 2 的复用条件与 `case=null` 设计、Step 3 的独立批准与批量确认、Step 4 的延迟/执行与指纹、Step 5 的 check/提交/批量暂停均已覆盖。
  - `SKILL.md:37` 写明初始请求或泛化 continue 不是批准，review 后必须等待新的用户消息明确批准当前 caseHash，批量同样适用；`SKILL.md:29` 与 `SKILL.md:35` 的修订续用均显式 `purpose: case-design`。
  - 正文为英文（无 CJK），未复制模板章节；机械检查 45/45（`case-evidence/c3-skill-contract.txt`）。

## SR2 代码指纹脚本

- 状态：通过。
- 证据：HEAD、`git diff --binary --no-renames HEAD`（排除 `.workloom/**`、`.pi/**`）与排序后的 untracked 路径/字节参与 SHA-256；CLI 输出 `codeFingerprint=<64hex>`，无参数抛错；脚本只读。实测见 `case-evidence/c4-fingerprint.txt`。

## SR3 指纹公开测试

- 状态：通过。
- 证据：`node --test` 2/2；覆盖稳定性、`.workloom` 元数据不影响、tracked 修改、untracked 增删、HEAD 改变、tracked 删除与 CLI 一致性；临时目录清理。红阶段见 `case-evidence/c1-red.txt`。

## SR4 五组评测定义

- 状态：通过。
- 证据：`skill_name` 与五个 id 顺序正确；每项有 name、英文 prompt/assertions、expected_output；ready/legacy/blocked 的 prompt 明确初始请求不是批准，assertions 含独立用户批准等待；planning/batch 保留各自批准断言；无 CJK。见 `case-evidence/c3-skill-contract.txt`。

## SR5 场景夹具生成器

- 状态：通过。
- 证据：参数/白名单/session-id 校验齐全；目标目录已存在时直接失败且不删除；五个场景的任务、指针、干扰项与 alignment 哈希符合定义；`node --check` 通过；batch 夹具与参考夹具的干扰任务目录逐字节一致（C9）。

## SR6 顶层 Pi 场景启动器

- 状态：通过；P2 已修复。
- 证据：`bash -n` 通过；只启动一个 MiniMax TUI，with_skill `--skill`、without_skill `--no-skills`；等待模型栏；run 目录固定；既有 run 目录早退检查在 `run-scenario.sh:34`。修复复验见 `case-evidence/sr6-launcher-guard.txt`。

## SR7 DSH 技能注册清单

- 状态：通过。
- 证据：`SKILL_ASSETS` 在 alignment 后加入 `skills/workloom-case-active/SKILL.md`，注释同步；`COMMAND_NAMES` 未变。见 `case-evidence/c2-registration.txt`。

## SR8 DSH 清单与资产测试

- 状态：通过。
- 证据：期望数组含 case-active；资产测试检查 front-matter、正文关键句、五个 id、英文断言，并新增审批规则与修订续用 purpose 的回归断言（`skills.test.js:176-181`、`:207-211`）；红绿见 `c1-red.txt` 与 `c2-registration.txt`。

## SR9 Pi 构建同步清单

- 状态：通过。
- 证据：`SKILL_SOURCES` 加入 `../assets/skills/workloom-case-active`；构建副本含 SKILL/evals/scripts；整目录同步语义不变。见 `c2-registration.txt`。

## SR10 Pi 产物清单测试

- 状态：通过。
- 证据：期望目录数组含 case-active，文件头与标题同步；build 后 3/3 通过。见 `c2-registration.txt`。

## SR11 DSH dist 构建产物同步

- 状态：通过。
- 证据：`dist/skills.js` 的 `SKILL_ASSETS` 含 case-active 并与 src 一致；两次构建的 dist SHA-256 相同。见 `case-evidence/sr11-dist.txt`、`c11-verification.txt`。

## 修复与复核记录

- P1（修订续用缺 `purpose: case-design`）已由主会话修复，`SKILL.md:29`、`:35` 显式传 purpose，并补两条回归断言；C3 45/45、DSH 16/16。
- P2（启动器缺既有 run 目录早退）已修复于 `run-scenario.sh:34`，复验 exit 2 且不覆盖。
- 本轮完整复核：lint/typecheck/build 全部 exit 0；core 732/732、adapter-dsh 178/178、adapter-pi 205/205、assets 3/3；两次构建 dist 稳定。
