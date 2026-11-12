#!/usr/bin/env node
/**
 * migrate-config.mjs：旧 .workloom 配置字段到新形态的机械映射（workloom-migrate-to-sop skill）。
 *
 * 设计意图：
 * - 值域单源：角色键合法域与旧 kind 映射经 createRequire 取 core dist 导出的
 *   LEGACY_KIND_TO_ROLE / isExecutorRole，脚本不自造映射表（core 升级脚本自动跟随）；
 *   脚本位于 resources/skills/workloom-migrate-to-sop/scripts/，上溯四级到包根
 *   （仓库布局与发布布局 node_modules/@workloom-ai/core/ 同形），解析失败给 build 指引；
 * - 幂等：已是新形态（内层 roles、角色键全新值）识别后输出 NOOP 并原样跳过，
 *   重复执行不产生第二次改写；
 * - fail loud：条目非对象、内层双键并存、subagents/roles 非对象、未知角色键、
 *   改名目标键冲突，一律带 subagent_profiles[i]... 定位非零退出，零写入不猜测；
 * - dry-run：恒定输出逐条目计划行（rename 明细或 noop）且不写文件；
 * - 原子写：正式执行经 core writeFileAtomic（同目录临时文件 + rename）写回，
 *   2 空格缩进加结尾换行，键序保持原插入序；
 * - 运行时文案一律英文（skill 资产随包分发，使用者语言不定）。
 */

import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

/** core dist 相对本脚本的路径（scripts → skill → skills → resources → 包根）。 */
const CORE_DIST_REL = '../../../../dist/index.js'

/** usage 文案（CLI 形态唯一说明）。 */
const USAGE = 'Usage: node migrate-config.mjs <config-path> [--dry-run]'

// core 值域单源解析：dist 缺失（未构建/部署残缺）即给指引退出，不降级自造映射。
let core
try {
  core = createRequire(import.meta.url)(CORE_DIST_REL)
} catch {
  console.error('core dist not reachable; run pnpm -r build first')
  process.exit(1)
}
const { LEGACY_KIND_TO_ROLE, isExecutorRole, writeFileAtomic } = core

/** fail loud 统一出口：带定位的错误打 stderr 并非零退出（零写入）。 */
function fail(message) {
  console.error(message)
  process.exit(1)
}

/** CLI 入口（无参数时打印 usage）。 */
function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const configPath = args.find((arg) => arg !== '--dry-run')
  if (configPath === undefined || args.length !== (dryRun ? 2 : 1)) {
    console.error(USAGE)
    process.exit(1)
  }

  const doc = readConfigDoc(configPath)
  if (doc === null) {
    // 缺 subagent_profiles 字段：无 profile 可迁移，视同 NOOP（不写文件、不改形状）。
    console.log('NOOP: config already migrated')
    return
  }
  // 逐条目映射并收集计划行（全部成功才进入写文件阶段，fail loud 天然零写入）。
  const plans = []
  const profiles = doc.subagent_profiles.map((entry, index) =>
    migrateProfileEntry(index, entry, plans),
  )
  const changedKeys = plans.reduce((sum, plan) => sum + plan.keys, 0)
  const changedProfiles = new Set(plans.filter((plan) => plan.keys > 0).map((plan) => plan.profile)).size

  if (changedKeys === 0) {
    // 全 NOOP：已是新形态，幂等跳过不写文件。
    console.log('NOOP: config already migrated')
    return
  }
  if (dryRun) {
    // 预演：逐条目计划行（rename 明细；无 rename 的条目打 noop），不写文件。
    for (const plan of plans) {
      for (const line of plan.lines) console.log(line)
      if (plan.lines.length === 0) console.log(`subagent_profiles[${plan.profile}]: noop`)
    }
    return
  }
  const nextDoc = { ...doc, subagent_profiles: profiles }
  writeFileAtomic(configPath, `${JSON.stringify(nextDoc, null, 2)}\n`)
  console.log(`Done: migrated ${changedProfiles} profile(s), ${changedKeys} key(s).`)
}

/** 读入并校验配置文档形状（路径/JSON/根对象/subagent_profiles 数组，均带路径报错）。 */
function readConfigDoc(configPath) {
  if (!existsSync(configPath)) {
    fail(`config not found: ${configPath}`)
  }
  let doc
  try {
    doc = JSON.parse(readFileSync(configPath, 'utf8'))
  } catch (error) {
    fail(`invalid JSON: ${configPath}: ${error.message}`)
  }
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    fail(`invalid config: ${configPath}: root must be a JSON object`)
  }
  if (doc.subagent_profiles === undefined) {
    return null
  }
  if (!Array.isArray(doc.subagent_profiles)) {
    fail(`invalid config: ${configPath}: subagent_profiles must be an array`)
  }
  return doc
}

/**
 * 迁移单条 profile 条目（内部）：收集计划行并返回新条目对象。
 * 内层键 subagents 原位改名 roles（保持插入序），角色键逐键映射；
 * whenMain 等其余字段原样保留，缺 roles 的条目保持缺键。
 */
function migrateProfileEntry(index, entry, plans) {
  const at = `subagent_profiles[${index}]`
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    fail(`${at} must be an object`)
  }
  const hasSubagents = entry.subagents !== undefined
  const hasRoles = entry.roles !== undefined
  if (hasSubagents && hasRoles) {
    fail(`${at}: both "subagents" and "roles" are present; keep only "roles" (merge manually, no silent overwrite)`)
  }
  if (hasSubagents && (entry.subagents === null || typeof entry.subagents !== 'object' || Array.isArray(entry.subagents))) {
    fail(`${at}.subagents must be an object`)
  }
  if (hasRoles && (entry.roles === null || typeof entry.roles !== 'object' || Array.isArray(entry.roles))) {
    fail(`${at}.roles must be an object`)
  }
  const innerKey = hasSubagents ? 'subagents' : 'roles'
  const plan = { profile: index, keys: 0, lines: [] }
  let roleMap = entry[innerKey]
  if (roleMap !== undefined) {
    if (hasSubagents) {
      plan.keys += 1
      plan.lines.push(`${at}: subagents -> roles`)
    }
    roleMap = migrateRoleMap(index, roleMap, plan)
  }
  plans.push(plan)
  // 重建条目保持原键插入序；目标内层键取 roles（rename 即原位换名）。
  const next = {}
  for (const [key, value] of Object.entries(entry)) {
    next[key === innerKey && roleMap !== undefined ? 'roles' : key] =
      key === innerKey ? roleMap : value
  }
  return next
}

/**
 * 迁移单条 roles 映射（内部）：合法角色键保留、旧 kind 键改名（目标键已存在
 * fail loud）、未知键带值报定位；返回保持插入序的新映射对象。
 */
function migrateRoleMap(index, roleMap, plan) {
  const at = `subagent_profiles[${index}].roles`
  const next = {}
  for (const [key, value] of Object.entries(roleMap)) {
    if (isExecutorRole(key)) {
      next[key] = value
      continue
    }
    if (key in LEGACY_KIND_TO_ROLE) {
      const renamed = LEGACY_KIND_TO_ROLE[key]
      if (renamed in roleMap) {
        fail(`${at}.${renamed} already exists; renaming legacy key "${key}" would overwrite it (resolve the conflict manually)`)
      }
      plan.keys += 1
      plan.lines.push(`${at}: ${key} -> ${renamed}`)
      next[renamed] = value
      continue
    }
    fail(`${at}.${key} is not a valid executor role (value: ${JSON.stringify(value)}); allowed: researcher/developer/frontend-developer/checker/judger`)
  }
  return next
}

main()
