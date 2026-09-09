/**
 * adapter-pi 的 RPC 连接（严格 \n 分帧）。
 *
 * 设计意图：
 * - pi --mode rpc 常驻子进程 JSON 协议（stdin 命令 / stdout 事件）；
 * - 严格 \n 分帧：StringDecoder + buffer 手写 reader（官方 rpc.md 明示
 *   Node readline 不合规——U+2028/U+2029 会错切 JSON 字符串）；
 * - sendCommand 自动生成递增 id 并按 response.id 关联，success: false 抛错；
 * - 事件回调逐行 parse，坏行静默跳过（沿用 pi-events 的容错口径）。
 */

import { StringDecoder } from 'node:string_decoder'
import type { ChildProcess } from 'node:child_process'

import { ERR_PREFIX } from '@workloom-ai/core'

/** RPC 命令类型（最小集：prompt/steer/abort/get_state） */
export type RpcCommandType = 'prompt' | 'steer' | 'abort' | 'get_state'

/** RPC 命令（id 由 sendCommand 自动生成） */
export interface RpcCommand {
  /** 请求 id（自动生成，response 原样回传用于关联） */
  id: number
  /** 命令类型 */
  type: RpcCommandType
  /** prompt/steer 的消息体 */
  message?: string
  /** prompt 的流式行为（steer = 当前回合后注入，followUp = 下回合注入） */
  streamingBehavior?: 'steer' | 'followUp'
}

/** RPC 响应 */
export interface RpcResponse {
  /** 请求 id（与命令对应，用于关联） */
  id?: number
  /** 恒为 "response" */
  type: 'response'
  /** 命令类型 */
  command: string
  /** 是否成功 */
  success: boolean
  /** 失败时的错误文案 */
  error?: string
  /** 响应数据（如 get_state 的 sessionId） */
  data?: Record<string, unknown>
}

/** RPC 事件（非 response 的 JSON 行） */
export type RpcEvent = Record<string, unknown>

/** 事件回调 */
export type RpcEventCallback = (event: RpcEvent) => void

/** RPC 连接（pi-rpc 模块的外部接口） */
export interface RpcConnection {
  /** 发送命令并等待响应（自动生成 id、按 response.id 关联） */
  sendCommand(cmd: Omit<RpcCommand, 'id'>): Promise<RpcResponse>
  /** 注册事件回调 */
  onEvent(cb: RpcEventCallback): void
  /** 关闭连接（停止读取、拒绝所有 pending 请求） */
  close(): void
}

/** 行解析结果（内部） */
type ParsedLine =
  | { kind: 'response'; response: RpcResponse }
  | { kind: 'event'; event: RpcEvent }
  | { kind: 'skip' }

/**
 * 从 buffer 中提取完整的行（严格 \n 分帧，处理尾部 \r）。
 * 纯函数，可单测。
 * @param buffer 累计缓冲区
 * @returns 完整行列表 + 剩余不完整段
 */
export function extractLines(buffer: string): { lines: string[]; remaining: string } {
  const lines: string[] = []
  let start = 0
  let newlineIndex: number
  while ((newlineIndex = buffer.indexOf('\n', start)) !== -1) {
    // 严格 \n 分帧：行尾 \r 剥离（兼容 \r\n），U+2028/U+2029 不分行。
    lines.push(buffer.slice(start, newlineIndex).replace(/\r$/, ''))
    start = newlineIndex + 1
  }
  return { lines, remaining: buffer.slice(start) }
}

/**
 * 解析单行 JSON（纯函数）：response → { kind: 'response' }，其他对象 →
 * { kind: 'event' }，坏行/非对象 → { kind: 'skip' }。
 * @param line 单行原始文本
 * @returns 解析结果
 */
export function parseRpcLine(line: string): ParsedLine {
  if (line.trim() === '') return { kind: 'skip' }
  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch {
    return { kind: 'skip' }
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { kind: 'skip' }
  }
  const obj = parsed as Record<string, unknown>
  if (obj.type === 'response') {
    return { kind: 'response', response: obj as unknown as RpcResponse }
  }
  return { kind: 'event', event: obj }
}

/**
 * 创建 RPC 连接（严格 \n 分帧 reader）。
 * @param child 已 spawn 的 child pi
 * @param onEvent 事件回调（可选，可经返回值的 onEvent 方法后设）
 */
export function createRpcConnection(child: ChildProcess, onEvent?: RpcEventCallback): RpcConnection {
  const stdout = child.stdout
  if (stdout === null) {
    throw new Error(`${ERR_PREFIX.executor}: child pi stdout is not available`)
  }

  const decoder = new StringDecoder('utf8')
  let buffer = ''
  let nextId = 1
  const pending = new Map<number, { resolve: (r: RpcResponse) => void; reject: (e: Error) => void }>()
  let callback: RpcEventCallback | undefined = onEvent
  let closed = false

  /** 分发单行（response 关联 pending，event 回调，skip 静默） */
  const dispatchLine = (line: string): void => {
    const parsed = parseRpcLine(line)
    if (parsed.kind === 'response') {
      const response = parsed.response
      const id = response.id
      if (id !== undefined) {
        const entry = pending.get(id)
        if (entry !== undefined) {
          pending.delete(id)
          if (response.success) {
            entry.resolve(response)
          } else {
            entry.reject(
              new Error(`${ERR_PREFIX.executor}: RPC command failed: ${response.error ?? 'unknown error'}`),
            )
          }
        }
      }
    } else if (parsed.kind === 'event') {
      // 回调未注册时静默丢弃（settle 注册前的事件不消费）。
      if (callback !== undefined) {
        callback(parsed.event)
      }
    }
    // skip: 坏行静默跳过
  }

  /** stdout data 事件：解码 → 缓冲 → 按 \n 分行 → 逐行分发 */
  const onData = (chunk: Buffer | string): void => {
    buffer += typeof chunk === 'string' ? chunk : decoder.write(chunk)
    let newlineIndex: number
    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newlineIndex).replace(/\r$/, '')
      buffer = buffer.slice(newlineIndex + 1)
      dispatchLine(line)
    }
  }

  /** stdout end 事件：冲刷剩余缓冲（处理最后一行无 \n 的情况） */
  const onEnd = (): void => {
    buffer += decoder.end()
    if (buffer.trim() !== '') {
      dispatchLine(buffer)
    }
    buffer = ''
  }

  /** 连接终结（内部）：停止读取、拒绝全部 pending——显式 close 与 child 进程退出共用。 */
  const shutdown = (message: string): void => {
    if (closed) return
    closed = true
    stdout.off('data', onData)
    stdout.off('end', onEnd)
    for (const [, entry] of pending) {
      entry.reject(new Error(`${ERR_PREFIX.executor}: ${message}`))
    }
    pending.clear()
  }

  stdout.on('data', onData)
  stdout.on('end', onEnd)
  // 进程退出即连接终结（design §2.1）：get_state/prompt/steer 飞行中崩溃/被杀时
  // pending 立即落定 fail loud，防工具调用永久挂起（容器 check P1）。
  child.once('close', () => shutdown('child pi process exited'))

  return {
    sendCommand(cmd) {
      const id = nextId++
      const command = { ...cmd, id }
      return new Promise<RpcResponse>((resolve, reject) => {
        if (closed) {
          reject(new Error(`${ERR_PREFIX.executor}: RPC connection closed`))
          return
        }
        pending.set(id, { resolve, reject })
        const stdin = child.stdin
        if (stdin === null || stdin.destroyed) {
          pending.delete(id)
          reject(new Error(`${ERR_PREFIX.executor}: child pi stdin is not available`))
          return
        }
        stdin.write(`${JSON.stringify(command)}\n`, (writeErr) => {
          if (writeErr !== null && writeErr !== undefined) {
            pending.delete(id)
            reject(
              new Error(`${ERR_PREFIX.executor}: failed to write RPC command: ${writeErr.message}`),
            )
          }
        })
      })
    },
    onEvent(cb) {
      callback = cb
    },
    close() {
      shutdown('RPC connection closed')
    },
  }
}
