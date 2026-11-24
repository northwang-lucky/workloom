# C6 cross-check：轨道二数值核对与双轨结论

## 轨道二（新脚本增量交集，执行轮重采）

- 命令：Aggregate command 原样执行（工作区口径 `-`，HOME 隔离至 `case-evidence/home`，排除集与 CASE Exclusions 逐项相同）。
- 结果（`coverage/diff-coverage.json`）：
  - `format` = `lcov` ✓
  - `missingExecutableFiles` = `[]` ✓
  - `overall` = **377/379（99.5%）**，满足 `covered * 100 > total * 90`（37700 > 34110）✓
  - `files` 路径集合恰为变更集去排除后的六个可执行文件（与 `git status --porcelain` 审计一致，见 `c5-change-set.log`）✓
- 逐文件：config-defaults 111/111、config-load 5/5、coverage-compute 161/161、case-gates 25/25、task-diff-coverage.mjs 35/35、scan-packages.mjs 40/42（未覆盖 61–62）。
- 主会话提示的 Developer 自证据（`coverage/summary.json`，19:05 落盘）为 336/337；执行轮重采为 377/379。差异 +42 恰为 scan-packages.mjs 的变更行数（Developer 自测口径未含该文件），另 case-gates 的 1 行未覆盖经本执行轮补测后清零；两侧结论一致（均 > 90%），以执行轮重采数字为准。

## 单文件交叉核对（步骤 5）

`packages/core/src/task/coverage-compute.ts`（changed-lines 区间见 `coverage/changed-lines.json`）：

- 变更行集合：161 行（16 个区间，含新增块 25–53、90–141、381–405 等）。
- 手算（`lcov-core.info` 的 `SF:packages/core/src/task/coverage-compute.ts` 段逐行统计 `DA` hits，与变更行求交）：covered=161，total=161，hits=0 的变更行：无。
- 脚本值（`diff-coverage.json`）：covered=161，total=161，uncoveredRanges=[]。
- 结论：手算值与脚本值完全相同（差异 0）。

## --check 复证（步骤 6）

同参数追加 `--check`：`threshold=90 pass=true overall=377/379`（缺省配置阈值 90、判定极性 pass，验证脚本消费配置链路在生产口径可用）。

## 轨道一数值（旧门禁整文件口径，供 RESULT 填写）

见 `coverage/whole-file-summary.md`（探针 `c6-lcov-summary.mjs`）：六个文件整文件 LF/LH 合计 **2250/2306（97.6%）**；RESULT Coverage 按旧格式填写 `Status: generated`、Changed Files 表恰列六文件、`Overall lines: 2250/2306 (97.6%)`。

## 残留未覆盖变更行（轨道二）

- `packages/core/resources/skills/workloom-packages-scan/scripts/scan-packages.mjs` L61–62：`readdirSync` 的 catch 分支（目录不可读的防御性 IO 错误路径，无业务语义分支；复现需 chmod 000 夹具，跨环境不稳定，不为此写用例）。
- 其余五个文件变更行全覆盖；整体 99.5% > 90%，无需豁免。

## 指纹

`node packages/core/resources/scripts/task-fingerprint.mjs "$WT"`（最后一次代码修复之后执行）：
`codeFingerprint=0515bb32ab84f989f885c240ca54cf49ff483c3758d6daab6dcb27473bd9c43e`
