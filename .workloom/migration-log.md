2026-11-12T13:05:00+08:00 | config-migrate | .workloom/config.json | noop: 无 subagent_profiles 字段（脚本缺字段误报已修复，见下条）
2026-11-12T13:05:00+08:00 | config-migrate | ~/.workloom/config.json | noop: 用户已于 2026-11-11 完成迁移（dry-run 复核 NOOP，字节不变）
2026-11-12T13:05:00+08:00 | script-fix | packages/core/resources/skills/workloom-migrate-to-sop/scripts/migrate-config.mjs | done: 缺 subagent_profiles 字段由报错改为 NOOP（本仓库项目配置实测暴露），补钉住用例⑧
2026-11-12T13:05:00+08:00 | dir-rename | .workloom/tasks/ | noop: 无活跃任务目录（全部已归档，归档不动）
2026-11-12T13:05:00+08:00 | subtask-move | .workloom/tasks/ | noop: 无顶层带子任务的活跃任务
2026-11-12T13:05:00+08:00 | doc-rewrite | .workloom/tasks/ | noop: 无活跃 prd.md（归档任务不改写）
2026-11-12T13:05:00+08:00 | workspace-review | .workloom/workspace/ | skipped: 现行 journal 存储（journal-1.md 在写），非 legacy 目录，不落 INERT.md
2026-11-12T13:20:00+08:00 | developer-disposition | .workloom/.developer/ | done: 用户裁定删除（旧 pin 身份产物，实为单文件）；.gitignore 注释行与忽略行同步移除；归档区 eval 运行残留同名件（未跟踪）一并清理
