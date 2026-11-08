/**
 * executor-roles 值域模块单测：五角色值域判定、旧 kind 值兼容读映射、
 * 未知值可判定报错、非抛错变体、显示名单源与过渡期双值域守卫。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  EXECUTOR_ROLES,
  LEGACY_KIND_TO_ROLE,
  ROLE_LABELS,
  isExecutorRole,
  normalizeExecutorRole,
  tryNormalizeExecutorRole,
} from '../src/dispatch/executor-roles.ts'

// 测试隔离：纯常量模块虽不读配置，仍沿 HOME 加 TMPDIR 隔离惯例（防全局配置
// 残留污染后续同进程用例，与 task-store.test.ts 同口径）。
const isolatedHome = mkdtempSync(join(tmpdir(), 'workloom-core-roles-home-'))
process.env.HOME = isolatedHome
process.env.TMPDIR = isolatedHome

const NEW_ROLES = [
  EXECUTOR_ROLES.RESEARCHER,
  EXECUTOR_ROLES.DEVELOPER,
  EXECUTOR_ROLES.FRONTEND_DEVELOPER,
  EXECUTOR_ROLES.CHECKER,
  EXECUTOR_ROLES.JUDGER,
]

test('EXECUTOR_ROLES 五键值域钉住', () => {
  assert.deepEqual(Object.values(EXECUTOR_ROLES), [
    'researcher',
    'developer',
    'frontend-developer',
    'checker',
    'judger',
  ])
})

test('isExecutorRole：五新值合法，旧值与未知值非法', () => {
  for (const role of NEW_ROLES) {
    assert.equal(isExecutorRole(role), true, `role ${role} should be valid`)
  }
  for (const legacy of ['research', 'implement', 'check', 'frontend', 'review']) {
    assert.equal(isExecutorRole(legacy), false, `legacy ${legacy} should not be a new role`)
  }
  assert.equal(isExecutorRole('bogus'), false)
  assert.equal(isExecutorRole(undefined), false)
  assert.equal(isExecutorRole(42), false)
})

test('normalizeExecutorRole：新值原样返回', () => {
  for (const role of NEW_ROLES) {
    assert.equal(normalizeExecutorRole(role), role)
  }
})

test('normalizeExecutorRole：五旧值映射为新角色', () => {
  assert.equal(normalizeExecutorRole('research'), 'researcher')
  assert.equal(normalizeExecutorRole('implement'), 'developer')
  assert.equal(normalizeExecutorRole('check'), 'checker')
  assert.equal(normalizeExecutorRole('frontend'), 'frontend-developer')
  assert.equal(normalizeExecutorRole('review'), 'judger')
})

test('LEGACY_KIND_TO_ROLE 映射表五条钉住', () => {
  assert.deepEqual(LEGACY_KIND_TO_ROLE, {
    research: 'researcher',
    implement: 'developer',
    check: 'checker',
    frontend: 'frontend-developer',
    review: 'judger',
  })
})

test('normalizeExecutorRole：未知值抛可判定错误', () => {
  assert.throws(
    () => normalizeExecutorRole('bogus'),
    (error) => {
      assert.ok(error instanceof Error)
      assert.match(error.message, /unknown executor role: "bogus"/)
      return true
    },
  )
  assert.throws(() => normalizeExecutorRole(undefined), /unknown executor role/)
  assert.throws(() => normalizeExecutorRole(''), /unknown executor role/)
})

test('tryNormalizeExecutorRole：新值原样、旧值映射、未知值返回 null', () => {
  assert.equal(tryNormalizeExecutorRole('judger'), 'judger')
  assert.equal(tryNormalizeExecutorRole('implement'), 'developer')
  assert.equal(tryNormalizeExecutorRole('bogus'), null)
  assert.equal(tryNormalizeExecutorRole(null), null)
  assert.equal(tryNormalizeExecutorRole(7), null)
})

test('ROLE_LABELS：五角色显示名齐全钉住', () => {
  assert.deepEqual(ROLE_LABELS, {
    researcher: 'Researcher',
    developer: 'Developer',
    'frontend-developer': 'Frontend Developer',
    checker: 'Checker',
    judger: 'Judger',
  })
  for (const role of NEW_ROLES) {
    assert.equal(typeof ROLE_LABELS[role], 'string')
    assert.ok(ROLE_LABELS[role].length > 0)
  }
})
