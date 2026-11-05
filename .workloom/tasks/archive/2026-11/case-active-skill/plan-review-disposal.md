# workloom-case-active PLAN 审查处置记录

## Round 1

- P0-1：已修复。真实运行目录改为 `eval-0` 至 `eval-4` 前缀，与 aggregate_benchmark 的目录发现规则一致。
- P0-2：已修复且已实证。指纹测试导入 mkdirSync 与 fileURLToPath；临时运行 2/2 通过。
- P1-1：已修复。DSH 新增技能内容与 eval 读取测试，先红后绿；关键状态、整批确认、指纹和五场景均有断言。
- P1-2：已修复。SKILL 明确使用 core 的 computeCaseHash 计算当前 RESULT 全文摘要，并给出精确 Node 命令。
- P1-3：已修复。新增同入口 Pi TUI + MiniMax 预检；失败即停止，不启动正式 run。
- P1-4：已修复。batch/blocked 夹具各新增不就绪 full、light、completed/archive 干扰任务；eval 增加零变化断言。
- P1-5：已修复。eval_metadata 写 eval 目录与配置目录，包含整数 eval_id、eval_name、prompt、assertions、真实模型和 runs=1，并给出精确写入命令。
- P2-1：已修复。DSH 测试标题与 Pi 头注释/清单标题同步包含 case-active。
- P2-2：已修复。evals.json 增加 skill_name、英文 description 和每项 name。
- P2-3：已修复。批量文件每个任务条目保存该次 confirm 的 summary 值。
- P2-4：已修复。ready 场景新增未批准 CASE 编辑后不得执行的阶段与断言。
- P2-5：已修复。planning 场景新增 purpose=case-design、designSession 和批准前不得 confirm 的断言。
- P2-6：已修复。启动器等待 TUI 模型栏就绪；initial/final 输出均需连续两次相同且非空。
- P2-7：已修复。新增 DSH 测试读取 evals.json，校验五个 id、name、非空英文断言。

## 主会话补充验证

- 指纹脚本临时测试 2/2 通过；任务元数据变化不影响指纹，HEAD、tracked、untracked 和 deleted 均会改变指纹。
- 五类夹具均在真实 git 项目中生成；批量与 blocked 场景各有 2 个目标 + 不就绪 + light + completed/archive。
- evals.json 可解析，skill_name 正确，5 个 id 与 name 齐全。
- run-scenario.sh 通过 `bash -n`；目录使用 eval-0…eval-4，TUI 有就绪与稳定输出检查。

## Round 2

- Round 1 的 14 项发现已由 review 会话核销，并独立重跑指纹测试与五类夹具原始记录。
- 新 P0：已按推荐修复。SKILL 明确拒绝 `mode: "light"`，与内容测试一致。
- P2：预检写入前新增 `mkdir -p case-evidence`，避免目录缺失导致证据保存失败。
- P2：ready 场景第四阶段固定保存为 `outputs/case-edit.txt`。
- P2：resultHash 命令注明需在可解析 @workloom-ai/core 的仓库根执行，目标 RESULT 可传绝对路径，避免夹具内模块解析失败。

## Round 3

- R2 的 P0 与两个 P2 已由 review 会话核销；机械断言 16/16 通过，指纹测试和五类夹具原始记录复核通过。
- 唯一残留的 P2：已修复。主会话保存清单新增 `outputs/case-edit.txt`，并明确使用同一稳定捕获规则，不依赖被测模型自行写文件。
- 三轮审查已完成，无新增第四轮；所有报告与处置记录纳入 1.4 审阅包。
