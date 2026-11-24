# C2 红绿清单：引用方 → 钉住检查 → 移除即红

口径（code-style absence-assertions）：每条核对用完整结构形式（整句、整行、`| \`field\` |` 表格行），裸子串不算。红 = 删除或改写该引用时，下述至少一条检查失败。

| 引用方文件 | 钉住检查（完整结构形式） | 移除引用时变红的检查 |
| --- | --- | --- |
| `packages/core/resources/skills/workloom-config-edit/SKILL.md` | contract-asset L1122 `/^---\nname: workloom-config-edit\n/`；L1123 `/^whenToUse: .+/m`；L1126-1135 八字段 `\| \`field\` \|` 表格行逐个；L1136 `*Completion:*` 计数 5；L1137 含 `workloom-doctor` | `node --test test/contract-asset.test.ts` 的 config-edit pin 用例（断言失败） |
| `packages/core/src/resources-manifest.ts` | contract-asset 经 skills.test 读真实 resources；dsh skills.test L154-159 排序名单 deepEqual 含 `workloom-config-edit`；C1 探针 `8 true 1` | skills.test 清单契约用例（名单不齐 → deepEqual 失败） |
| `packages/dsh-workloom/test/skills.test.ts` | 同上 deepEqual（期望数组本身被钉）；退役反向断言不变 | 名单测试自身即钉住对象；改错期望 → deepEqual 失败 |
| `packages/core/resources/skills/workloom-packages-scan/SKILL.md` | contract-asset L1161-1166 步骤 5 整句前缀 `"5. **Write `.workloom/config.json`** — follow the `workloom-config-edit` skill's modification discipline:"`；L1168-1171 Boundaries 整行 `- Edits to config fields outside this scan's ...`；C2 步骤 1 grep（L17、L64 两处） | contract-asset 两条 includes 断言失败；C2 grep 命中数从 2 降 |
| `packages/core/resources/skills/workloom-migrate-to-sop/SKILL.md` | contract-asset L1174-1179 限定句整句 `Use the bundled script for legacy field migration only. ...`；L1181 含 `scripts/migrate-config.mjs`；C2 grep（L46 一处 config-edit + L24/L87 doctor） | contract-asset 两条断言失败；C2 grep 命中数降 |
| `packages/core/resources/workflow/workflow.md` | contract-asset L1140-1145 Principles 第 6 条整句逐字 `6. Config edits go through the skill: ...`；C2 grep（L19）；version 守卫（无 `version:` 行增删） | 整句 includes 断言失败；C2 grep 命中数降 |
| `.workloom/spec/repo/workflow/index.md`（worktree 副本） | contract-asset L1150-1155 `startsWith('- config-edit-skill:')` 整行定位 + 含 `` `workloom-config-edit` skill `` 与 `` `SKILL_ENTRIES` ``；C2 grep（L11 恰一行） | `entry !== undefined` 断言失败；C2 grep 计数从 1 降为 0 |

七个引用方全部至少一条完整结构钉住；名单/资产双路径（运行时注册 + 文本 pin）互为红绿备份。
