/**
 * 清空并重建本包 skills/ 目录：从 ../assets 递归拷贝 8 个 skill 目录
 * （自有 continue/finish/alignment/update-spec/packages-scan + 三个 vendored
 * mattpocock skills），连同目录内所有文件（SKILL.md / references / agents /
 * 子文档 / scripts 脚本资产）与 mattpocock 的 LICENSE。
 *
 * skills/ 是构建产物（发布/安装前由 pnpm build 生成），git 忽略。
 */

import { cpSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SKILLS_DIR = join(PACKAGE_ROOT, 'skills')

/** 相对本包根的资源源目录（整目录递归拷贝）。
 * 自有 workloom 侧同步 continue/finish（原 slash 命令改造的路由与收尾指引）、
 * alignment（统一 Phase 1.1）、update-spec 与 packages-scan；
 * 旧 brainstorm/ui-design 目录不再同步，generic tdd/grilling/writing-for-agents 保留。 */
const SKILL_SOURCES = [
  '../assets/skills/workloom-continue',
  '../assets/skills/workloom-finish',
  '../assets/skills/workloom-alignment',
  '../assets/skills/workloom-update-spec',
  '../assets/skills/workloom-packages-scan',
  '../assets/third-party/mattpocock-skills/tdd',
  '../assets/third-party/mattpocock-skills/grilling',
  '../assets/third-party/mattpocock-skills/writing-for-agents',
]

/** mattpocock vendored 技能集合的 LICENSE（拷到 skills/ 根，随包分发）。 */
const LICENSE_SOURCE = '../assets/third-party/mattpocock-skills/LICENSE'

rmSync(SKILLS_DIR, { recursive: true, force: true })
mkdirSync(SKILLS_DIR, { recursive: true })

for (const rel of SKILL_SOURCES) {
  const source = join(PACKAGE_ROOT, rel)
  cpSync(source, join(SKILLS_DIR, rel.split('/').at(-1)), { recursive: true })
}
cpSync(join(PACKAGE_ROOT, LICENSE_SOURCE), join(SKILLS_DIR, 'LICENSE'))

console.log(`Synced ${SKILL_SOURCES.length} skill directories into ${SKILLS_DIR}`)
