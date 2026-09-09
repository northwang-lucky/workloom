/**
 * pi-rpc.ts 单测：严格 \n 分帧（含 U+2028/U+2029 不分行、\r\n、end 冲刷）、
 * response 关联与 success:false 抛错、事件分发。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PassThrough } from 'node:stream'
import { ChildProcess } from 'node:child_process'

import { extractLines, parseRpcLine, createRpcConnection } from '../src/pi-rpc.ts'

// ---- extractLines 纯函数测试 ----

test('extractLines: 基本分行（\\n 分隔）', () => {
  // 所有行以 \\n 结尾 → 全部提取，remaining 为空。
  const { lines, remaining } = extractLines('line1\nline2\nline3\n')
  assert.deepEqual(lines, ['line1', 'line2', 'line3'])
  assert.equal(remaining, '')
})

test('extractLines: 最后一行无 \\n 时留在 remaining', () => {
  // 最后一行无 \\n → 留在 remaining（等待 end 冲刷或更多数据）。
  const { lines, remaining } = extractLines('line1\nline2\nline3')
  assert.deepEqual(lines, ['line1', 'line2'])
  assert.equal(remaining, 'line3')
})

test('extractLines: 不完整行留在 remaining', () => {
  const { lines, remaining } = extractLines('line1\nline2\npartial')
  assert.deepEqual(lines, ['line1', 'line2'])
  assert.equal(remaining, 'partial')
})

test('extractLines: U+2028/U+2029 不分行（JSON 字符串内合法）', () => {
  // U+2028/U+2029 在 JSON 字符串内合法，不应被当作换行符。
  const jsonWithSep = '{"text":"hello\u2028world\u2029end"}\n'
  const { lines, remaining } = extractLines(jsonWithSep)
  assert.equal(lines.length, 1)
  assert.equal(lines[0], '{"text":"hello\u2028world\u2029end"}')
  assert.equal(remaining, '')
})

test('extractLines: \\r\\n 处理（剥离行尾 \\r）', () => {
  const { lines, remaining } = extractLines('line1\r\nline2\r\n')
  assert.deepEqual(lines, ['line1', 'line2'])
  assert.equal(remaining, '')
})

test('extractLines: 空字符串返回空行', () => {
  const { lines, remaining } = extractLines('')
  assert.deepEqual(lines, [])
  assert.equal(remaining, '')
})

test('extractLines: 累积缓冲（多次调用模拟流式）', () => {
  // 模拟流式数据：第一次不完整，第二次补全。
  const r1 = extractLines('{"type":"response","id":1,"suc')
  assert.deepEqual(r1.lines, [])
  assert.equal(r1.remaining, '{"type":"response","id":1,"suc')
  const r2 = extractLines(r1.remaining + 'cess":true}\n')
  assert.equal(r2.lines.length, 1)
  assert.equal(r2.lines[0], '{"type":"response","id":1,"success":true}')
})

// ---- parseRpcLine 纯函数测试 ----

test('parseRpcLine: response 类型识别', () => {
  const result = parseRpcLine('{"id":1,"type":"response","command":"get_state","success":true}')
  assert.equal(result.kind, 'response')
  if (result.kind === 'response') {
    assert.equal(result.response.id, 1)
    assert.equal(result.response.success, true)
  }
})

test('parseRpcLine: event 类型识别', () => {
  const result = parseRpcLine('{"type":"agent_end"}')
  assert.equal(result.kind, 'event')
  if (result.kind === 'event') {
    assert.equal(result.event.type, 'agent_end')
  }
})

test('parseRpcLine: 坏行/非对象行 → skip', () => {
  assert.equal(parseRpcLine('').kind, 'skip')
  assert.equal(parseRpcLine('not json').kind, 'skip')
  assert.equal(parseRpcLine('42').kind, 'skip')
  assert.equal(parseRpcLine('null').kind, 'skip')
  assert.equal(parseRpcLine('"string"').kind, 'skip')
  assert.equal(parseRpcLine('[1,2,3]').kind, 'skip')
})

test('parseRpcLine: success:false 响应识别', () => {
  const result = parseRpcLine('{"id":2,"type":"response","command":"prompt","success":false,"error":"bad"}')
  assert.equal(result.kind, 'response')
  if (result.kind === 'response') {
    assert.equal(result.response.success, false)
    assert.equal(result.response.error, 'bad')
  }
})

// ---- createRpcConnection 集成测试 ----

import { Writable } from 'node:stream'

/** 创建模拟 child 进程（PassThrough 替代 stdout，立即消费 writable 替代 stdin）。 */
function mockChild(): { child: ChildProcess; stdout: PassThrough; stdin: Writable } {
  const stdout = new PassThrough()
  // 立即消费 writable：write 回调立即触发（模拟 pi 进程消费 stdin）。
  const stdin = new Writable({
    write(_chunk, _encoding, callback) {
      callback()
    },
  })
  const child = { stdout, stdin } as unknown as ChildProcess
  return { child, stdout, stdin }
}

test('createRpcConnection: response 按 id 关联', async () => {
  const { child, stdout } = mockChild()
  const conn = createRpcConnection(child)
  const promise = conn.sendCommand({ type: 'get_state' })
  // nextTick 确保响应在 promise then  handler 注册后到达。
  process.nextTick(() => {
    stdout.write('{"id":1,"type":"response","command":"get_state","success":true,"data":{"sessionId":"s1"}}\n')
  })
  const response = await promise
  assert.equal(response.success, true)
  assert.equal(response.data?.sessionId, 's1')
  conn.close()
})

test('createRpcConnection: success:false 抛错', async () => {
  const { child, stdout } = mockChild()
  const conn = createRpcConnection(child)
  const promise = conn.sendCommand({ type: 'prompt', message: 'test' })
  process.nextTick(() => {
    stdout.write('{"id":1,"type":"response","command":"prompt","success":false,"error":"invalid prompt"}\n')
  })
  await assert.rejects(promise, /invalid prompt/)
  conn.close()
})

test('createRpcConnection: 事件分发到回调', async () => {
  const { child, stdout } = mockChild()
  const events: Record<string, unknown>[] = []
  const conn = createRpcConnection(child, (event) => {
    events.push(event)
  })
  stdout.write('{"type":"agent_start"}\n')
  stdout.write('{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"hi"}]}}\n')
  stdout.write('{"type":"agent_end"}\n')
  // 异步等待事件处理。
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(events.length, 3)
  assert.equal(events[0]?.type, 'agent_start')
  assert.equal(events[2]?.type, 'agent_end')
  conn.close()
})

test('createRpcConnection: U+2028/U+2029 在 JSON 字符串内不分行', async () => {
  const { child, stdout } = mockChild()
  const conn = createRpcConnection(child)
  const promise = conn.sendCommand({ type: 'get_state' })
  // 响应 JSON 字符串内包含 U+2028/U+2029（不应被分行）。
  stdout.write('{"id":1,"type":"response","command":"get_state","success":true,"data":{"text":"hello\u2028world"}}\n')
  const response = await promise
  assert.equal(response.success, true)
  assert.equal(response.data?.text, 'hello\u2028world')
  conn.close()
})

test('createRpcConnection: end 冲刷（最后一行无 \\n）', async () => {
  const { child, stdout } = mockChild()
  const events: Record<string, unknown>[] = []
  const conn = createRpcConnection(child, (event) => {
    events.push(event)
  })
  // 写入无换行结尾的事件，然后 end。
  stdout.write('{"type":"agent_end"}')
  stdout.end()
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(events.length, 1)
  assert.equal(events[0]?.type, 'agent_end')
  conn.close()
})

test('createRpcConnection: close 后拒绝所有 pending', async () => {
  const { child } = mockChild()
  const conn = createRpcConnection(child)
  const promise = conn.sendCommand({ type: 'get_state' })
  conn.close()
  await assert.rejects(promise, /RPC connection closed/)
})
