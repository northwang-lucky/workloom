# C5 双轨交叉核对

worktree：`/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/.runtime/worktrees/11-24-config-edit-skill`（分支 `workloom/11-24-config-edit-skill`，HEAD `bd681c9`，变更未提交，工作区口径 `-`）。

## 轨道二（新脚本，变更行交集）

命令：CASE Coverage 节 Aggregate command 的 `task-diff-coverage.mjs` 行（排除集 dist×2、test×2、`packages/core/resources/skills/`、`.workloom/`）。

- `format`：`lcov`
- `missingExecutableFiles`：`[]`（全部非排除变更可执行文件都在报告中）
- `files`：恰一项 `packages/core/src/resources-manifest.ts`
- `changedRanges`：`49-50`（名单注释两行）、`60`（SKILL_ENTRIES 数组条目行）——与 `git diff main` 的新增行一致
- `covered/total`：`3/3`，`uncoveredRanges` 为空 → `overall` 100%（covered 等于 total）

口径说明：node lcov 的 `DA` 行把两行块注释（49-50）也计入可测行（落在模块加载覆盖范围内），故 total 为 3 而非 CASE 预期的 1；CASE C5 步骤 4 的 contingency（"如 lcov 对该行口径不同，以实际区间记录并交叉核对 covered 等于 total"）生效，判定标准 covered==total 成立。三个变更行全部经 `contract-asset.test.ts` 的模块加载（import `SKILL_ENTRIES`）执行覆盖。

## 轨道一（旧门禁，整文件 lcov 口径，供 RESULT 填写）

来源：`coverage/lcov-core.info` 的 `SF:packages/core/src/resources-manifest.ts` 段。

- `LF:119`、`LH:103`（awk 直接提取；与逐行 `DA` 统计一致：119 条 DA，103 条 hits>0）
- hits=0 的 DA 行：74、75、76、81、82、86、87、91、92、96、97、113、114、117、118、119（readResourceText/load*Text 的 catch 与 null 分支、resourceDirOf 未消费分支）
- 整文件行覆盖：`103/119 (86.6%)`（103/119=86.55%，一位小数 86.6%）
- RESULT Coverage：`Status: generated`（非排除可执行变更行集非空，判定规则走 generated 分支）；Changed Files 表恰列该文件；Overall lines 取上值

## 排除审计（C5 步骤 7）

`git status --porcelain` 全部条目（11 项）经 `.workloom/` 前缀过滤与 Exclusions 命中后，剩余可执行文件恰为 `packages/core/src/resources-manifest.ts`，等于轨道二 `files` 集合（探测复核见执行记录；与设计期算术核对结论一致）。

## 指纹（C5 步骤 6）

`node packages/core/resources/scripts/task-fingerprint.mjs "$WT"` → `codeFingerprint=5768897d4342efd0b9c5c2816e9733457c420a2d206311f7b7ba4eed15e8fa42`（64 位十六进制，见 `case-evidence/c5-fingerprint.txt`；在任何代码修复之后执行）。
