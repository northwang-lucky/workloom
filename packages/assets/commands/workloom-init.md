---
name: workloom_init
title: Initialize workloom
description: Generate the .workloom asset directory in the current project and migrate a legacy .trellis directory when present
argument-hint: '[developer identity | --purge]'
---

# Initialize workloom

Generate the `.workloom/` asset directory skeleton in the current project: `config.yaml`, `tasks/`, `spec/`, `workspace/`, plus a `.developer` identity file.

The free-form argument is the developer identity recorded into `.developer`; omit it to leave the identity empty for now.

If a legacy `.trellis/` directory is detected:

1. Migrate task data: `tasks/` (including `archive/`) moves over as-is.
2. Migrate `workspace/` and `spec/`.
3. Map legacy `config.yaml` fields onto the new configuration (unknown fields are dropped with a notice).
4. The legacy directory is kept after migration. Once you confirm the migrated data, run `/workloom-init --purge` to delete it; passing `--purge` as the argument migrates and removes the legacy directory in one run.

Completion criteria: the `.workloom/` skeleton is complete; when a legacy directory existed, migration is done and the user has confirmed.
