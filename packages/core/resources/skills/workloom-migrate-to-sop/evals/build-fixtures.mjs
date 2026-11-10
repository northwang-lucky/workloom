/**
 * build-fixtures.mjs：旧结构 .workloom 夹具构造（workloom-migrate-to-sop evals）。
 *
 * 设计意图：
 * - 一处构造旧结构夹具：旧 config 字段（subagent_profiles 双条目——其一 subagents
 *   内层键挂旧五角色键，其二 roles 内层键但角色键仍是旧五值）与旧目录形态
 *   （无日期前缀任务目录、顶层子任务带 parent、legacy workspace 与 .developer），
 *   供 migrate-to-sop.test.ts 七用例组与手工演练共用；
 * - 纯 ESM 导出函数形态（无 CLI）：测试直接 import，夹具只写调用方传入的项目根，
 *   不触真实全局配置；
 * - task.json 的 parent/children 记完整相对路径（tasks/<dir>），与 core create
 *   写路径一致，迁移后指针断言才有单源口径。
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** INERT.md 注记文案（SKILL.md 保守策略口径唯一单源，测试断言同串）。 */
export const INERT_NOTE = 'legacy workspace kept for reference; not read by workloom-sop'

/** 夹具任务 createdAt（无时区后缀按本地时区解析，恒为 9 月 15 日）。 */
export const FIXTURE_CREATED_AT = '2026-09-15T10:00:00'

/** createdAt 派生的期望目录日期前缀（MM-DD，本地时区下恒定）。 */
export const FIXTURE_DATE_PREFIX = '09-15'

/**
 * 旧 config 文档（迁移前形态）：subagent_profiles 两条目按「其一 subagents、
 * 其二 roles 旧角色键」排序（字面顺序；加载期 WARNING 断言由测试方重排条目）。
 * @returns 旧形态配置对象
 */
export function legacyConfigDoc() {
  return {
    session_auto_commit: false,
    subagent_profiles: [
      {
        whenMain: 'anthropic/claude-opus-4',
        subagents: {
          research: { model: 'anthropic/claude-sonnet-4', effort: 'high' },
          implement: { model: 'anthropic/claude-sonnet-4', effort: 'medium' },
          check: { model: 'anthropic/claude-haiku-4', effort: 'low' },
          frontend: { model: 'anthropic/claude-sonnet-4', effort: 'high' },
          review: { model: 'anthropic/claude-opus-4', effort: 'high' },
        },
      },
      {
        roles: {
          research: { model: 'openai/gpt-5.2', effort: 'high' },
          implement: { model: 'openai/gpt-5.2', effort: 'medium' },
          check: { model: 'openai/gpt-5.2', effort: 'low' },
          frontend: { model: 'openai/gpt-5.2', effort: 'medium' },
          review: { model: 'openai/gpt-5.2', effort: 'high' },
        },
      },
    ],
  }
}

/** 写最小 task.json 记录（parent/children 记完整相对路径，与 core 写路径一致）。 */
function writeTaskRecord(taskDir, record) {
  writeFileSync(join(taskDir, 'task.json'), `${JSON.stringify(record, null, 2)}\n`)
}

/**
 * 构造旧结构 .workloom 项目夹具（旧 config + 旧目录形态）。
 * @param {string} root 项目根（调用方创建的临时目录，夹具只在其下写入）
 */
export function buildLegacyProject(root) {
  const workloom = join(root, '.workloom')
  const tasksDir = join(workloom, 'tasks')
  mkdirSync(tasksDir, { recursive: true })
  // 旧 config：subagents 内层键在前、roles 旧角色键在后
  writeFileSync(join(workloom, 'config.json'), `${JSON.stringify(legacyConfigDoc(), null, 2)}\n`)
  // 父任务目录：无日期前缀，children 记子任务相对路径
  const parentDir = join(tasksDir, 'parent-task')
  mkdirSync(parentDir, { recursive: true })
  writeTaskRecord(parentDir, {
    id: 'id-parent-task',
    name: 'parent-task',
    title: 'Parent task',
    status: 'in_progress',
    priority: 'P2',
    createdAt: FIXTURE_CREATED_AT,
    parent: null,
    children: ['tasks/child-task'],
  })
  // 子任务目录：无日期前缀，parent 指向父任务相对路径（模拟旧版顶层子任务）
  const childDir = join(tasksDir, 'child-task')
  mkdirSync(childDir, { recursive: true })
  writeTaskRecord(childDir, {
    id: 'id-child-task',
    name: 'child-task',
    title: 'Child task',
    status: 'planning',
    priority: 'P2',
    createdAt: FIXTURE_CREATED_AT,
    parent: 'tasks/parent-task',
    children: [],
  })
  // legacy workspace：历史内容原样保留的对象
  const workspaceDir = join(workloom, 'workspace')
  mkdirSync(workspaceDir, { recursive: true })
  writeFileSync(join(workspaceDir, 'notes.md'), '# Legacy workspace notes\n')
  // legacy .developer：留存待用户确认的对象
  const developerDir = join(workloom, '.developer')
  mkdirSync(developerDir, { recursive: true })
  writeFileSync(join(developerDir, 'state.json'), '{}\n')
}
