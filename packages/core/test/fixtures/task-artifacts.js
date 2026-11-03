/**
 * 既有链路测试的旧任务夹具：start 后把 case 记录还原为 null（落盘形态与
 * 旧任务一致——无 case 字段），模拟在本功能之前开始的任务。CASE 设计、
 * RESULT、覆盖率与确认链路的行为由 case.test.js 用完整夹具覆盖；本夹具
 * 让 worktree/check/archive 等既有机制测试在新 start 转换后保持原结果
 * （计划步骤 3.2 验证口径：旧任务无 case 的既有测试保持原结果）。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** task.json 序列化缩进（与 task-store 落盘格式一致）。 */
const JSON_INDENT = 2

/**
 * 把已 start 的任务还原为旧任务形态（task.json 无 case 字段）。
 * @param {string} root 项目根
 * @param {string} taskRelPath 任务相对 .workloom 的路径
 */
export function markTaskLegacy(root, taskRelPath) {
  const path = join(root, '.workloom', taskRelPath, 'task.json')
  const record = JSON.parse(readFileSync(path, 'utf8'))
  delete record.case
  writeFileSync(path, `${JSON.stringify(record, null, JSON_INDENT)}\n`)
}
