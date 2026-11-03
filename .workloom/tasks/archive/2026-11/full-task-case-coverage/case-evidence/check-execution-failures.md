# CASE 执行故障原始记录

## 执行身份

- 任务：`tasks/11-03-full-task-case-coverage`
- 原 check 会话：`3f349e9d-38cf-4fd2-ad76-392971f8fea3`
- 已确认 CASE：`9d49be545eda046d123245ce9bf98a96bd419ac942b6d4a1c2650c10b36a6710`

## 失败记录

1. 首次执行派发 `2026-11-03T09:45:45.691Z`：模型服务返回 503，原始文本为 `Service is too busy. We advise users to temporarily switch to alternative LLM API service providers.`，请求 id `99e2d0fc-8ca1-48c1-9baf-1e7dac596e74`。
2. 同会话重试派发 `2026-11-03T09:55:36.915Z`：原始错误为 `DeepSeek Messages stream ended before message_stop (STREAM_CLOSED)`。
3. Pi 真机同一主会话也多次出现 503；pane 证据分别保存为 `pi-model-busy.txt` 与 `pi-service-latest.txt`。

## 当前状态

- `case-result.md` 尚未生成。
- 没有记录 check 通过。
- 没有把任何未执行用例写成 passed。
- 自动重试已停止；用户随后要求立即试一次，原会话重试仍未产生实际结果。
- 主会话已暂停卡住的 check 与 Pi 当前请求，保留原 durable 会话、任务目录和 worktree，供服务恢复后继续。
- Pi 立即重试的 pane 证据另存为 `pi-immediate-retry.txt`。
- 用户随后授权改用健康模型。GLM 健康探针返回 `GLM_OK`，新执行会话为 `609a15d5-361b-4b8b-9fca-96a17803c894`，并记录 `fallbackOf=3f349e9d-38cf-4fd2-ad76-392971f8fea3`、`fallbackAttempt=2`、`purpose=execution`。
- Pi 保持原 durable 会话，经 `/model` 切换为 `minimax-cn/MiniMax-M3.1-Flash`，继续使用原临时项目。
