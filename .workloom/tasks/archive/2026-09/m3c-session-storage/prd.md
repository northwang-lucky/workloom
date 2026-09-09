# M3c child 会话存储治理（归档清理 + gitignore 守护 + shutdown 清表）

## Goal

完成容器任务 pi-executor-parity 的 R6 存储生命周期余量：child 会话 transcript 的归档清理、`.workloom/sessions/` 的 gitignore 守护、shutdown 时落盘 registry 即时清空（M1-9 真机观察项 P3 打磨），使 child 会话存储从创建到回收全链路闭环。

## Requirements

- R1 transcript 归档清理：adapter-pi 在归档命令路径（/workloom-finish 或 task_archive 工具的 Pi 侧投影）按被归档任务 task.json dispatches 的 childId 对账，删除 `.workloom/sessions/pi/` 下关联会话文件；清理失败仅 WARNING 不阻塞归档；core 归档流程不感知 runtime 文件（薄投影原则，repo/architecture）。
- R2 gitignore 守护：核实 workloom init 的 gitignore 模板机制——有模板则把 `.workloom/sessions/` 加入；无模板机制则 sessions/pi 目录创建时落自守护 `.gitignore`。以实际核实结果择一实现，并在报告说明选择依据。
- R3 shutdown 清表（P3）：`handleSessionShutdown` 的 `sigtermAllAlive` 之后把 registry.json 持久化为空表——shutdown 即时清空落盘，与重启 `cleanupOrphans` 构成完整双层防线（M1-9 真机观察：现状 shutdown 后落盘表残留，靠重启清理兜底）。
- R4 单测：归档清理对账（命中删除/未命中保留/失败 WARNING 不阻塞）、自守护 .gitignore 生成（若走该分支）、shutdown 后落盘表为空。

## Acceptance Criteria

- adapter-pi 测试全绿（含 R4 新增），typecheck/lint 干净，改动文件 LSP 诊断干净，源文件 <600 行。
- 真机可验项（归档后 transcript 删除、shutdown 后 registry 空表）写进容器 verify-m3.md 清单由容器主会话执行。
- core/adapter-dsh 零改动（若 R1 核实后发现必须动 core，先在报告说明再最小化改动并回归三端）。

## Alignment Decisions

- 拆分与范围：用户在容器主会话确认（2026-09-09）；串行于 ST-B 之后。
- R2 分支选择授权 implement 按核实结果自决（模板有则同步、无则自守护），无需回到用户。
- 执行形态：全新 implement 会话；无开放节点。UI 不适用；test-first 不强制（单测随交付）。

<!-- workloom:open-nodes=none -->

## Notes

- 关联：容器 prd R6、design.md §2.2/§4；verify-m1.md 第 9 项观察记录。
- 提交纪律：容器主会话统一提交；子任务 implement 禁止 git commit。
