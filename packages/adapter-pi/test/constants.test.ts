/**
 * constants.ts 静态边界单测：命令/工具名常量与注册调用使用的名字一致。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  COMMAND_CONTINUE,
  COMMAND_FINISH,
  COMMAND_INIT,
  EXECUTOR_TOOL,
  NODE_ID_PREFIX,
  STEPS_TOOL,
  TASK_ARCHIVE_TOOL,
  TASK_CREATE_TOOL,
  TASK_FINISH_TOOL,
  TASK_LIST_TOOL,
  TASK_START_TOOL,
} from '../src/constants.ts'

test('static boundary: registered command names match constants', () => {
  assert.equal(COMMAND_INIT, 'workloom-init')
  assert.equal(COMMAND_CONTINUE, 'workloom-continue')
  assert.equal(COMMAND_FINISH, 'workloom-finish')
})

test('static boundary: registered tool names match constants', () => {
  assert.equal(TASK_CREATE_TOOL, 'workloom_task_create')
  assert.equal(TASK_START_TOOL, 'workloom_task_start')
  assert.equal(TASK_FINISH_TOOL, 'workloom_task_finish')
  assert.equal(TASK_ARCHIVE_TOOL, 'workloom_task_archive')
  assert.equal(TASK_LIST_TOOL, 'workloom_task_list')
  assert.equal(EXECUTOR_TOOL, 'workloom_execute')
  assert.equal(STEPS_TOOL, 'workloom_step')
})

test('static boundary: executor delegation nodeId prefix', () => {
  assert.equal(NODE_ID_PREFIX, 'workloom-execute-')
})
