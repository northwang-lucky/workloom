/**
 * journal-tool 单测：schema 投影（taskPath 必填）与缺参透传 core 权威校验。
 * 测试依赖 dist（test 脚本先 build 再跑 node --test）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { PARAM_DESCRIPTIONS } from '@workloom-ai/core'
import { registerJournalTool } from '../dist/journal-tool.js'

/** 捕获 journal 工具注册定义。 */
function makeCtx() {
  const registered = []
  const ctx = {
    tools: {
      register(def) {
        registered.push(def)
        return () => {}
      },
    },
  }
  return { ctx, registered }
}

test('journal 工具 schema：taskPath 与 title 必填，描述引用 taskPathRequired', () => {
  const { ctx, registered } = makeCtx()
  registerJournalTool(ctx)
  const def = registered[0]
  assert.ok(def, 'journal tool must be registered')
  assert.equal(def.name, 'workloom_journal')
  assert.deepEqual(def.parameters.required, ['taskPath', 'title'])
  assert.equal(def.parameters.properties.taskPath.description, PARAM_DESCRIPTIONS.taskPathRequired)
})

test('journal 工具缺 taskPath：透传 core 权威校验拒绝（schema required 只是投影）', async () => {
  const { ctx, registered } = makeCtx()
  registerJournalTool(ctx)
  const def = registered[0]
  // 非空 cwd 走到 core 的必填校验；任务存在性校验在其后，本用例不触盘。
  const exec = { agent: { session: { header: { cwd: '/tmp/workloom-journal-no-project' } } } }
  await assert.rejects(() => def.execute({ title: 'No TaskPath' }, exec), /taskPath is required/)
})
