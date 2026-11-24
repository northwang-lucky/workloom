# 覆盖率工具配置驱动与内置默认

## Context

S1 落地了任务增量覆盖率门禁（>90% 硬门禁、三格式机械复算），但阈值硬编码 90、覆盖率工具由 Checker 按 CASE ad-hoc 选择。用户要求：阈值可配置（默认 90），覆盖率工具按语言项目配置驱动、不配置走内置默认（含 java/kotlin）。S3 已落地 config 编辑专属 skill，S4 的 coverage 字段写入经它。

## Goal

coverage 项目级配置驱动覆盖率门禁与采集：threshold 可配（默认 90 严格 >），languages 按语言配置工具与格式、内置 9 个语言键默认；门禁与脚本读配置；packages-scan 初始化时提议 coverage 默认。观察方式：改 coverage.threshold 门禁阈值随之变；未配置语言走内置默认；非内置未配置语言走一致性回退且阈值仍硬。

## Scope

范围内：

- config schema：`coverage` 项目层字段（threshold + languages 映射），config-defaults.ts DEFAULT_CONFIG + config-load.ts mergeWithDefaults + config.d.ts 类型；未知子字段 fail loud（worktree 纪律）。
- 内置语言默认与扩展名检测：go/ts/js/python/rust/c/cpp/java/kotlin 9 个语言键。
- 门禁消费：case-gates meetsThreshold 读 config.coverage.threshold；computeDiffCoverage 格式推断用 config languages format 提示。
- 脚本消费：task-diff-coverage.mjs 读 config threshold/languages；command 模板占位符。
- 非内置未配置语言回退（复用 S1 unsupported 一致性校验，阈值仍硬）。
- packages-scan 扩展：检测语言栈，经 config skill 提议 coverage.languages 默认。
- config-edit skill schema 清单同步（8→9 字段 + coverage 示例）。
- 测试/spec/dist。

非目标：

- 不改 S1 增量口径/缺席硬拒/豁免链路语义（只参数化阈值与格式来源）。
- 不改 S2 注入；全局层 config 归 migrate-to-sop。
- 格式解析器扩至四种（go-coverprofile/lcov/jacoco-xml/cobertura-xml），其余格式走一致性回退。

## Assumptions, Constraints and Dependencies

- coverage 项目层字段（语言栈项目相关），不进全局白名单；三层流水线对象层顶层 key 覆盖。
- threshold 默认 90，严格 >（恰好 90 不达标）；合法范围 0–100 整数，非法 fail loud。
- languages 映射开放：内置 9 个语言键只是默认，用户可为任何语言加 {format, command}。
- format 枚举 go-coverprofile/lcov/jacoco-xml/cobertura-xml；command 模板占位符白名单校验（assertPlaceholders 先例）。
- 非内置未配置语言 → S1 unsupported 回退（Checker 声明工具/格式自报，门禁一致性校验，阈值硬作用自报数）。
- 前置 S1（门禁/脚本）+ S3（config skill）已合入 main。
- 语言分工、验证命令、编码约束按 repo spec。

## Requirements

- R1：config 新增 coverage 项目层字段——`threshold?: number`（默认 90，0–100 整数，非法 fail loud）+ `languages?: { <lang>: { format: "go-coverprofile"|"lcov"|"jacoco-xml"|"cobertura-xml", command?: string } }`；未知子字段 fail loud；DEFAULT_CONFIG/mergeWithDefaults/config.d.ts 同步。
- R2：内置 9 个语言键默认（go→go-coverprofile，typescript/javascript/python/rust/c/cpp→lcov，java/kotlin→jacoco-xml）+ command 骨架；按变更文件扩展名归类语言；未配置语言走内置默认；多语言任务多工具多报告合并（S1 combineFormats）。新增 parseCoberturaXml 解析器（Cobertura XML：class filename 属性 + line number/hits，hits>0 覆盖，filename 路径归一后缀匹配），inferFormat 加 cobertura 识别（根 <coverage> + <packages>/<class>/<lines>）。
- R3：门禁消费——meetsThreshold 参数化读 config.coverage.threshold（缺省 90）；computeDiffCoverage 格式推断用 config languages format 提示；case-gates 传配置阈值。
- R4：脚本消费——task-diff-coverage.mjs 读 config threshold/languages（loadConfig 或 CLI 入参）；command 模板占位符渲染（<worktree> 等白名单）。
- R5：非内置且未配置语言 → S1 unsupported 一致性回退（Checker CASE 声明工具/格式、自报覆盖数，门禁校验文件集/行区间/算术，阈值仍硬作用自报数）；不静默放行、不误判非可执行。
- R6：packages-scan 扩展——扫描检测语言栈，经 workloom-config-edit skill 提议 coverage.languages 默认（与 packages 候选一并确认）；非内置语言标注"需手动配置 format/command"，不猜默认。
- R7：config-edit skill schema 清单同步——顶层字段 8→9（加 coverage），补 coverage 示例与子字段白名单。
- R8：既有测试更新 + 新行为测试覆盖；spec 新增条目；dist 同 commit；lint/typecheck/build/两包 test 全绿。

## Acceptance Criteria

- AC1（R1、R2）：config 解析 coverage（threshold 默认 90、languages 映射、format 四枚举）；8 内置默认与扩展名检测可定位；parseCoberturaXml 夹具复算正确；未知子字段/非法 threshold/非法 format fail loud。验证方法：config.test.ts + coverage-compute.test.ts cobertura 用例。
- AC2（R3、R4）：自定义 threshold（如 80）门禁随之变（80.0 拒/80.1 过）；脚本读配置阈值与格式提示；cobertura-xml 格式机械复算；command 占位符渲染。验证方法：case.test.ts/coverage-compute.test.ts/脚本单测。
- AC3（R5）：非内置未配置语言变更 → unsupported 回退 + 阈值硬作用自报数（不达标拒）。验证方法：case.test.ts 回退用例。
- AC4（R6）：packages-scan 提议 coverage.languages 默认经 config skill；非内置语言标注手配。验证方法：packages-scan 单测 + grep 引用。
- AC5（R7）：config-edit skill 字段清单 9 项含 coverage + 示例。验证方法：contract-asset pin + grep。
- AC6（R8）：pnpm lint/typecheck/build/两包 node --test 全退出 0；spec 条目；dist 同 commit。验证方法：命令退出码 + git 核对。

## Edge Cases and Failure Paths

- threshold 非法（非整数/负数/>100）：fail loud。
- languages format 非枚举 / command 未知占位符：fail loud。
- 缺 coverage 配置：全默认（threshold 90 + 8 内置语言）。
- 多语言任务：多工具多报告，S1 combineFormats 合并（任一 unsupported 即 unsupported）。
- 非内置未配置语言：unsupported 一致性回退，阈值硬。
- 全删除行变更文件：轨道二无新增可测行（S1 口径），轨道一旧门禁仍列整文件。

## Risks and Open Questions

- 风险：command 模板占位符设计需覆盖采集场景（profile 路径/coverpkg 范围），过简则 Checker 仍须手改；接受，模板给骨架 + Checker 按任务实例化。
- 无未决问题（Q1A/Q2A+回退/Q3A 已确认）。

## Alignment Decisions

- coverage schema：threshold + languages 映射（Q1A），项目层，未知子字段 fail loud。
- 内置 9 个语言键 + 扩展名检测（Q2A）：go/ts/js/python/rust/c/cpp/java/kotlin；未配置走默认。
- 原生支持 Cobertura XML（用户选 B）：format 枚举加 cobertura-xml，新增 parseCoberturaXml 解析器（最热门跨语言额外格式，Java/Python/.NET/Rust 不必转 lcov）；内置默认仍 lcov/jacoco，cobertura 作可配置格式。
- 非内置未配置语言 → S1 unsupported 一致性回退，阈值仍硬（用户问"没有内置的语言怎么办"的答复）；languages 开放映射用户可配任何语言。
- packages-scan 扩展提议 coverage 默认经 config skill（Q3A）。
- threshold 默认 90 严格 >（用户原始要求）。
- config-edit skill 清单同步归 S4（S3 预留）。

## References

- `packages/core/src/workspace/config-defaults.ts`、`config-load.ts`、`config.d.ts`（schema 与校验先例）。
- S1：`packages/core/src/task/coverage-compute.ts`（meetsThreshold/inferFormat/EXECUTABLE_EXTENSIONS）、`case-gates.ts`、`resources/scripts/task-diff-coverage.mjs`。
- S3：`packages/core/resources/skills/workloom-config-edit/SKILL.md`（字段清单）、`workloom-packages-scan/SKILL.md`。
- 规范：repo/language、repo/code-style、repo/workflow、repo/deployment。

## Notes

- command 占位符白名单与渲染实现为内部细节，Developer 在 plan 锚定（assertPlaceholders/renderSetupCommand 先例）。
- S4 完成后容器做集成 CASE 验收 + 部署（profile 重钉 + 用户授权重启），整个任务收尾。
- 运行中插件旧版：S4 自身 CASE 走旧门禁；新配置驱动自部署后生效。
