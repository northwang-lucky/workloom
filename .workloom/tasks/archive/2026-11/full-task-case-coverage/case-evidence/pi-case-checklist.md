# C24 Pi 真机清单摘录（最终执行）

来源：`verify/pi-case.md`（主会话原 Pi durable 会话，经 `/model` 切换为 `minimax-cn/MiniMax-M3.1-Flash` 后完成全部九项；专用 tmux 会话 `workloom-pi-case-1103` 已关闭）。本文件由 check 执行会话（609a15d5-361b-4b8b-9fca-96a17803c894，fallbackOf 链回 3f349e9d-38cf-4fd2-ad76-392971f8fea3）于 2026-11-03T21:07+08:00 摘录核对，证据文件均存在于本目录。

## 逐项结论与证据位置（9/9 PASS，无 PENDING）

| # | 项目 | 结论 | 证据位置 |
| --- | --- | --- | --- |
| 1 | Tool surface：workloom_task_case 可见且含 review/confirm 与 expectedCaseHash；子会话无 CASE 任务工具面 | PASS | `pi-case-design-dispatch.txt`（review 返回 case/caseHash/structureIssues/readyToConfirm；Pi child 无 CASE 任务工具） |
| 2 | Start gate：无 PLAN 拒绝；合法 PLAN 后 start 写 case.required=true 且无 override | PASS | `pi-start-gate.txt`、`pi-valid-start.txt` 与 scratch task.json |
| 3 | CASE design：purpose=case-design 派发真实 check child，保持 stage=implement 并记录 designSession 与 purpose | PASS | `pi-clean-design.txt`、`pi-clean-design-task.json`（新任务 purpose=case-design、designSession 非空、stage=implement） |
| 4 | Confirmation：合法 CASE review 返回 readyToConfirm；confirm 记当前 hash；改 CASE 后执行在新 child 启动前失败 | PASS | `pi-confirm-execution.txt`、`pi-confirm-execution-task.json`（review/confirm、当前 caseHash、stale CASE 拒绝） |
| 5 | Execution continuation：重新确认后 purpose=execution 续用 designSession，stage=check，spawn 绑定保留 | PASS | 与第 4 项同一证据记录（designSession childId、purpose=execution、stage=check、spawn binding 保留） |
| 6 | Process recovery：Pi 宿主以 `--session 01a1a0cd-8592-71e6-9be7-07313b85c814` 重启（同 MiniMax 模型），child id 不变，未伪造 fallbackOf | PASS | `pi-before-host-restart.txt`、`pi-host-recovery.txt`（时间线完整） |
| 7 | Full injection：首派/reinject 含当前 CASE 与两份模板全文；普通续用只带确认摘要值不重复模板 | PASS | `pi-injection-evidence.txt`（取自真实 child JSONL） |
| 8 | Budget failure：超预算 CASE 报字节上限错误且不建 child、不写 dispatch 记录 | PASS | `pi-budget-failure.txt`（8949 > 1024 报错、无新 child）、`pi-over-budget-task.json`（dispatches=[]，配置恢复有交代） |
| 9 | Outcome gate：合法 RESULT 通过；无 fallbackOf 的异会话、failed 覆盖率、blocked/pending 用例均拒绝且 force 不加 override；恢复后的 resultHash 与记录的合法 check 一致 | PASS | `pi-invalid-results.txt`（三类原始工具错误）、`pi-outcome-gate.txt`、`pi-valid-outcome.txt`、`pi-valid-final-task.json` |

## 补充核对

- 进程恢复前后 child id 相同（`--session 01a1a0cd-8592-71e6-9be7-07313b85c814` 重启续用），未伪造 fallbackOf 链；与公共校验一致：Pi 无链时要求执行会话等于设计会话。
- Pi 参数面不含 `fallback_models`（src 零消费，仅测试反向断言，见 `case-evidence/c16-runtime-chain.txt`）。
- 执行期真机发现的 dispatchChildPi purpose 漏传已由实施会话修复并经本会话复核（见 case-result.md Resolved Findings）；清单第 3、5 项在修复后代码上验证通过。
- 相关历史故障留痕：`pi-model-busy.txt`、`pi-service-latest.txt`、`pi-immediate-retry.txt`、`pi-start-gate.txt`（首次 503 与恢复过程）、`pi-unauthorized-patch.txt`（未授权改动留痕）。

## 结论

9 项全部 PASS 且有证据引用，不存在 PENDING；C24 按已确认 CASE 判定 passed。
