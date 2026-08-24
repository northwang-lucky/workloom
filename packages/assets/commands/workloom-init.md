---
name: workloom_init
title: 初始化 workloom
description: 在当前项目中生成 .workloom 资产目录，并支持从旧 .trellis 目录迁移
argument-hint: '[目录路径]'
---

# 初始化 workloom

在当前项目（或参数指定目录）生成 `.workloom/` 资产目录骨架：`config.yaml`、`tasks/`、`spec/`、`workspace/`，并写入 `.developer` 身份文件。

若检测到旧 `.trellis/` 目录：

1. 迁移任务数据：`tasks/`（含 `archive/`）原样搬入。
2. 迁移 `workspace/` 与 `spec/`。
3. 旧 `config.yaml` 字段映射为新配置（未知字段丢弃并提示）。
4. 迁移完成后提示用户确认，再删除旧目录。

完成判据：`.workloom/` 骨架齐全；有旧目录时迁移完成且用户已确认。
