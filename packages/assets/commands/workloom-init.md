---
name: workloom_init
title: Initialize workloom
description: Generate the .workloom asset directory in the current project and migrate a legacy .trellis directory when present
argument-hint: '[directory]'
---

# Initialize workloom

Generate the `.workloom/` asset directory skeleton in the current project (or the directory given as an argument): `config.yaml`, `tasks/`, `spec/`, `workspace/`, plus a `.developer` identity file.

If a legacy `.trellis/` directory is detected:

1. Migrate task data: `tasks/` (including `archive/`) moves over as-is.
2. Migrate `workspace/` and `spec/`.
3. Map legacy `config.yaml` fields onto the new configuration (unknown fields are dropped with a notice).
4. Ask the user to confirm before deleting the legacy directory.

Completion criteria: the `.workloom/` skeleton is complete; when a legacy directory existed, migration is done and the user has confirmed.
