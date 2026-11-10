/**
 * .workloom 初始化骨架（TypeScript）。
 *
 * 设计意图：
 * - 幂等生成骨架：目录与文件缺失才创建，已有内容一律不覆盖（含 force 模式）；
 * - 数据布局对齐 core 约定：.workloom/{tasks,spec,.runtime/worktrees} + config.json
 *   + .gitignore + spec/README.md（运行时状态收敛进 .runtime/）；
 * - 模板外置：config 种子、.gitignore 种子与 spec README 种子全部落在
 *   core/resources/skeleton/ 并经 resources-manifest 登记，本模块经 manifest
 *   读取，内嵌模板字符串清零；种子缺失 fail loud（部署残缺不静默降级）；
 * - 生成自包含的 .workloom/.gitignore：运行时状态忽略策略随骨架分发，
 *   接入方仓库无需在根 .gitignore 手工维护 workloom 内部布局规则。
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { findWorkloomRoot, WORKLOOM_DIR } from './locate.js'
import {
  loadSkeletonText,
  SKELETON_CONFIG_ENTRY,
  SKELETON_GITIGNORE_ENTRY,
  SKELETON_SPEC_README_ENTRY,
} from '../resources-manifest.ts'
/** initWorkloom 入参。 */
export interface InitWorkloomParams {
  /** 已存在 .workloom 时是否强制补建缺失项（不覆盖已有文件）。 */
  force?: boolean
}

/** 初始化结果。 */
export interface InitWorkloomResult {
  /** 项目根绝对路径。 */
  root: string
  /** 本次新创建的文件/目录相对路径（相对 root，按创建顺序）。 */
  created: string[]
}

/** 错误消息前缀（运行时文案英文）。 */
const ERR_PREFIX = 'workloom init'

/** 骨架子目录（相对 .workloom，按创建顺序）。 */
const SUB_DIRS = Object.freeze(['tasks', 'spec', '.runtime/worktrees'])

/** 骨架文件名常量。 */
const FILE_NAMES = Object.freeze({
  config: 'config.json',
  gitignore: '.gitignore',
})

/**
 * 初始化 .workloom 骨架。
 * @param root 目标项目根（或根下任意目录）
 * @param params 初始化参数
 * @returns [Error | null, InitWorkloomResult | null]
 */
export function initWorkloom(
  root: string,
  params: InitWorkloomParams = {},
): [Error | null, InitWorkloomResult | null] {
  try {
    return [null, initWorkloomInternal(root, params)]
  } catch (error) {
    return [toError(error), null]
  }
}

/**
 * 初始化骨架（内部实现，失败抛错由外层转元组）。
 * @param root 目标项目根
 * @param params 初始化参数
 * @returns 初始化结果
 */
function initWorkloomInternal(root: string, params: InitWorkloomParams): InitWorkloomResult {
  const existing = findWorkloomRoot(root)
  // 命令面恒定 force（幂等补缺件），本报错路径仅 initWorkloom 直调 force=false 时可达（公开 API 保留）。
  if (existing !== null && params.force !== true) {
    throw new Error(
      `${ERR_PREFIX}: .workloom already exists at ${existing.root} (run with force to fill in missing pieces)`,
    )
  }
  const target = existing === null ? resolve(root) : existing.root
  const created: string[] = []
  const workloomDir = join(target, WORKLOOM_DIR)
  if (!existsSync(workloomDir)) {
    mkdirSync(workloomDir, { recursive: true })
    created.push(WORKLOOM_DIR)
  }
  for (const rel of SUB_DIRS) {
    const dir = join(workloomDir, rel)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
      created.push(join(WORKLOOM_DIR, rel))
    }
  }
  // spec 骨架种子（manifest 外置资源）：spec 目录已由 SUB_DIRS 保证，README 幂等写入。
  const specReadme = join(workloomDir, 'spec', 'README.md')
  if (!existsSync(specReadme)) {
    writeFileSync(specReadme, loadSkeletonText(SKELETON_SPEC_README_ENTRY))
    created.push(join(WORKLOOM_DIR, 'spec', 'README.md'))
  }
  const configFile = join(workloomDir, FILE_NAMES.config)
  if (!existsSync(configFile)) {
    writeFileSync(configFile, loadSkeletonText(SKELETON_CONFIG_ENTRY))
    created.push(join(WORKLOOM_DIR, FILE_NAMES.config))
  }
  const gitignoreFile = join(workloomDir, FILE_NAMES.gitignore)
  if (!existsSync(gitignoreFile)) {
    writeFileSync(gitignoreFile, loadSkeletonText(SKELETON_GITIGNORE_ENTRY))
    created.push(join(WORKLOOM_DIR, FILE_NAMES.gitignore))
  }
  // legacy .trellis 检测链已随 workloom-migrate-to-sop 任务整体删除（init 结果不再输出 legacyTrellisRoot）。
  return {
    root: target,
    created,
  }
}

/** @param value 未知异常 @returns 归一化 Error */
function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}
