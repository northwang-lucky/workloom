# C3 步骤 3：case.test.ts 用例定位清单

来源：`case-evidence/c3-case-tests.log`（node --test test/case.test.ts，退出码 0，全部 pass）。

| 期望路径 | 日志行 | 用例名 |
| --- | --- | --- |
| 配置阈值 80：80.0 拒 / 80.1 过 | 16 | 配置阈值 80：80.0 拒、80.1 过（门禁随之变化） |
| config 非法 → coverage_config（不抛裸异常） | 17 | coverage 配置非法 → coverage_config core failure（不抛裸异常） |
| 非内置未配置语言回退：自报不达标拒、达标过、not_applicable 反规避 | 18 | 非内置未配置语言：unsupported 一致性回退，配置阈值仍硬作用自报数 |
| 单语言 formatHints 生效（coverage_missing_file 出现）/ 多语言纯推断（不出现） | 19 | 门禁 formatHints：单语言广播走机械复算报 missing，多语言纯推断回退自报 |
| 缺省 90 边界保持 | 15 | 增量阈值严格大于 90%：90.0 拒、90.1 过 |
| unsupported 报告阈值回退自报（既有） | 24 | unsupported 格式跳过机械复算，但阈值仍校验 RESULT 自报 Overall |
| HOME 隔离 | 文件头 | case.test.ts L23-25 模块级 HOME 重定向（command-ops 先例口径） |

结论：SR14 第 1、2 条各路径均有可定位用例且为 pass；探针 c3-gate-config-probe 七个场景全部 PASS。
