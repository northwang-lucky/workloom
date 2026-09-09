/**
 * adapter-pi 的 child 进程注册表（进程内活着表 + 落盘进程表）。
 *
 * 设计意图：
 * - 进程内表：sessionId → { connection, child, kind, root, taskRelPath,
 *   parentSessionId, status, startedAt }，派发时登记、settle 后保留至 child 退出；
 * - 落盘进程表：`.workloom/sessions/pi/registry.json`（pid + sessionId +
 *   startedAt 列表），原子写（复用 core file-atomic），child 退出即移除条目；
 * - 孤儿回收（R6）：扩展加载时读 registry.json——残留条目对应的 pid 若存活则
 *   SIGTERM（不收养），随后清空文件；主会话结束联动 SIGTERM 全部存活 child，
 *   未完成派发由 settle 回填 failed（摘要注明 host session ended）。
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ChildProcess } from 'node:child_process'

import { writeFileAtomic } from '@workloom-ai/core'

import type { RpcConnection } from './pi-rpc.ts'

/** child 进程在注册表中的信息（进程内表值）。 */
export interface ChildRegistryEntry {
  /** RPC 连接（provisional 阶段尚未建立，optional）。 */
  connection?: RpcConnection
  /** 子进程句柄 */
  child: ChildProcess
  /** executor 类型（research/implement/check/frontend） */
  kind: string
  /** 项目根 */
  root: string
  /** 任务目录相对 .workloom 的路径 */
  taskRelPath: string
  /** 主会话 id（回投报告用） */
  parentSessionId: string
  /**
   * 运行状态：
   * - starting = 槽位已预留（provisional），child 尚未就绪（计槽）；
   * - running = 在途执行中（计槽）；
   * - idle = 完工常驻（已 settle 成功，进程存活待续用，不计槽）。
   */
  status: 'starting' | 'running' | 'idle'
  /** 派发时间（ISO 字符串） */
  startedAt: string
  /** 扩展宿主 pi 进程 pid（owner 存活 = child 有主，cleanup 跳过）。registerChild 自动填充。 */
  ownerPid?: number
}

/** 落盘进程表条目（ownerPid + pid + sessionId + startedAt）。 */
interface PersistedEntry {
  /** 扩展宿主 pi 进程 pid（owner 存活 = child 有主，cleanup 跳过）。旧格式条目无此字段视为孤儿可回收。 */
  ownerPid?: number
  /** 子进程 pid */
  pid: number
  /** 会话 id（= childId） */
  sessionId: string
  /** 派发时间（ISO 字符串） */
  startedAt: string
}

/** 落盘进程表（条目列表）。 */
interface PersistedRegistry {
  entries: PersistedEntry[]
}

/** 进程内活着表（sessionId → 条目）。 */
const children = new Map<string, ChildRegistryEntry>()

/**
 * 获取会话存储目录（`.workloom/sessions/pi/`）。
 * @param root 项目根
 * @returns 会话存储目录绝对路径
 */
export function sessionsDir(root: string): string {
  return join(root, '.workloom', 'sessions', 'pi')
}

/**
 * 获取落盘进程表路径。
 * @param root 项目根
 * @returns registry.json 绝对路径
 */
export function registryPath(root: string): string {
  return join(sessionsDir(root), 'registry.json')
}

/** 自守护 .gitignore 文件名（sessions/pi 目录内）。 */
const SESSIONS_GUARD_FILE = '.gitignore'

/** 自守护 .gitignore 内容：忽略本目录全部运行时产物（含自身）。 */
const SESSIONS_GUARD_CONTENT = '*\n'

/**
 * 确保会话存储目录存在并落自守护 .gitignore（R2 兜底）：
 * init 模板条目只守护新 init 的项目，存量项目（.workloom/.gitignore 无 sessions/）
 * 依赖目录内自守护 .gitignore 保持 child 会话产物不入库。
 * @param root 项目根
 * @returns 会话存储目录绝对路径
 */
export function ensureSessionsDir(root: string): string {
  const dir = sessionsDir(root)
  mkdirSync(dir, { recursive: true })
  const guard = join(dir, SESSIONS_GUARD_FILE)
  if (!existsSync(guard)) writeFileSync(guard, SESSIONS_GUARD_CONTENT)
  return dir
}

/**
 * 登记一个 child 进程（派发时刻调用）：写入进程内表 + 落盘进程表。
 * ownerPid 自动取当前扩展宿主 pi 进程 pid。
 * @param sessionId 会话 id（= childId）
 * @param entry child 信息（ownerPid 自动填充）
 */
export function registerChild(sessionId: string, entry: ChildRegistryEntry): void {
  if (entry.ownerPid === undefined) entry.ownerPid = process.pid
  children.set(sessionId, entry)
  persistRegistry(entry.root)
}

/** provisional 槽位自增序号（同毫秒内区分多个预留）。 */
let provisionalCounter = 0

/**
 * 生成唯一 provisional 槽位 id（同 pid + 时间戳 + 序号，避开与真实 sessionId 碰撞）。
 * @returns provisional id（"prov-<pid>-<timestamp>-<counter>"）
 */
export function generateProvisionalId(): string {
  return `prov-${process.pid}-${Date.now()}-${++provisionalCounter}`
}

/**
 * 预留一个 provisional 槽位（容量闸放行后、spawn 成功时立即调用）：
 * 以 temp id 写入 starting 条目，使 readRunningFromRegistry 立即计槽，
 * 关闭并发派发的竞态窗口。ownerPid 自动取当前进程 pid。
 * @param provisionalId 预留槽位 id（generateProvisionalId 生成）
 * @param entry child 信息（status 会被强制为 'starting'）
 */
export function registerProvisionalEntry(provisionalId: string, entry: ChildRegistryEntry): void {
  if (entry.ownerPid === undefined) entry.ownerPid = process.pid
  children.set(provisionalId, { ...entry, status: 'starting' })
  persistRegistry(entry.root)
}

/**
 * 将 provisional 槽位提升为真实 sessionId（get_state 拿到 sessionId 后调用）：
 * 原子删除 temp key、写入真实 sessionId 条目（status 转为 'running' 并建立连接）。
 * 若 provisional 已被释放（不存在），则退化为普通 registerChild。
 * @param provisionalId 预留槽位 id
 * @param sessionId 真实 child sessionId（get_state 返回）
 * @param connection RPC 连接
 */
export function promoteProvisionalEntry(
  provisionalId: string,
  sessionId: string,
  connection: RpcConnection,
): void {
  const provisional = children.get(provisionalId)
  if (provisional === undefined) {
    // provisional 已被释放（失败路径先行移除），退化为不操作——调用方应已处理。
    return
  }
  children.delete(provisionalId)
  children.set(sessionId, { ...provisional, connection, status: 'running' })
  persistRegistry(provisional.root)
}

/**
 * 释放 provisional 槽位（所有失败路径调用）：从进程内表 + 落盘进程表删除 temp 条目，
 * 不留永久占位。
 * @param provisionalId 预留槽位 id
 */
export function releaseProvisionalEntry(provisionalId: string): void {
  const entry = children.get(provisionalId)
  if (entry === undefined) return
  children.delete(provisionalId)
  persistRegistry(entry.root)
}

/**
 * 移除一个 child 进程（child 退出时调用）：从进程内表 + 落盘进程表删除。
 * @param sessionId 会话 id（= childId）
 * @param expected 期望移除的条目引用（可选身份校验）：传入时仅当当前登记条目
 *   与之同引用才删除——防住「续用重启以同 sessionId 覆盖登记后，旧进程 close
 *   事件迟到误删新条目」的竞态。
 */
export function unregisterChild(sessionId: string, expected?: ChildRegistryEntry): void {
  const entry = children.get(sessionId)
  if (entry === undefined) return
  if (expected !== undefined && entry !== expected) return
  children.delete(sessionId)
  persistRegistry(entry.root)
}

/**
 * 更新注册表条目的状态（mutate + 落盘）。
 * - settle 成功后置 idle（完工常驻，不计槽）；
 * - 续用 idle child 时置回 running（重新占槽）。
 * 未找到条目时静默返回（可能已 unregister）。
 * @param sessionId 会话 id（= childId）
 * @param status 新状态
 */
export function updateChildStatus(sessionId: string, status: ChildRegistryEntry['status']): void {
  const entry = children.get(sessionId)
  if (entry === undefined) return
  entry.status = status
  persistRegistry(entry.root)
}

/**
 * 获取一个 child 进程的信息。
 * @param sessionId 会话 id（= childId）
 * @returns child 信息（未登记时 undefined）
 */
export function getChild(sessionId: string): ChildRegistryEntry | undefined {
  return children.get(sessionId)
}

/**
 * 获取全部存活 child 的列表。
 * @returns sessionId → 条目的只读视图
 */
export function getAllChildren(): ReadonlyMap<string, ChildRegistryEntry> {
  return children
}

/**
 * 读取落盘进程表（内部）：文件不存在时返回空表。
 * @param root 项目根
 * @returns 落盘条目列表
 */
function loadPersisted(root: string): PersistedEntry[] {
  const path = registryPath(root)
  if (!existsSync(path)) return []
  try {
    const text = readFileSync(path, 'utf8')
    const parsed = JSON.parse(text) as PersistedRegistry
    if (!Array.isArray(parsed.entries)) return []
    return parsed.entries
  } catch {
    return []
  }
}

/**
 * 原子写落盘进程表（内部）：从进程内表全量重建（简单可靠，避免增量同步 bug）。
 * @param root 项目根
 */
function persistRegistry(root: string): void {
  const entries: PersistedEntry[] = []
  for (const [sessionId, entry] of children) {
    entries.push({
      ownerPid: entry.ownerPid,
      pid: entry.child.pid ?? 0,
      sessionId,
      startedAt: entry.startedAt,
    })
  }
  const path = registryPath(root)
  ensureSessionsDir(root)
  writeFileAtomic(path, JSON.stringify({ entries }, null, 2))
}

/**
 * 孤儿回收（R6）：扩展加载时调用——读落盘进程表，只回收「ownerPid 已死」的条目
 *（owner 进程存活 = child 有主，跳过不杀；ownerPid 死亡 = 崩溃残留孤儿，
 * SIGTERM child pid + 移除条目）。无 ownerPid 的旧格式条目视为孤儿可回收。
 * @param root 项目根
 */
export function cleanupOrphans(root: string): void {
  const entries = loadPersisted(root)
  if (entries.length === 0) return
  const surviving: PersistedEntry[] = []
  for (const entry of entries) {
    // ownerPid 存活 → child 有主，保留条目（不 SIGTERM）。
    if (entry.ownerPid !== undefined && isPidAlive(entry.ownerPid)) {
      surviving.push(entry)
      continue
    }
    // ownerPid 已死或无 ownerPid（旧格式）→ 孤儿，SIGTERM child pid。
    if (entry.pid > 0) {
      try {
        process.kill(entry.pid, 'SIGTERM')
      } catch {
        // pid 已退出（ESRCH）→ 跳过
      }
    }
  }
  // 写回存活条目（原子写）。
  const path = registryPath(root)
  ensureSessionsDir(root)
  writeFileAtomic(path, JSON.stringify({ entries: surviving }, null, 2))
}

/** 判定 pid 是否存活（process.kill(pid, 0)：ESRCH = 死，其他 = 活）。 */
function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ESRCH') return false
    // EPERM 等视为活（进程存在但无权限）
    return true
  }
}

/**
 * 主会话结束联动（R6）：SIGTERM 全部存活 child，清空注册表。
 * 未完成派发由 settle 回填 failed（摘要注明 host session ended）。
 */
export function sigtermAllAlive(): void {
  for (const entry of children.values()) {
    const pid = entry.child.pid
    if (pid === undefined) continue
    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      // pid 已退出 → 跳过
    }
  }
  children.clear()
}

/** 注册表 WARNING 前缀（运行时文案英文）。 */
const REGISTRY_WARN_PREFIX = 'workloom pi-child-registry: WARNING:'

/**
 * 归档清理（R1）：按 childId 删除 `.workloom/sessions/pi/` 下关联的 pi 会话文件。
 * 对账逻辑：列出 sessions 目录全部文件，命中三种形态之一即删除——等于 childId、
 * 以 `<childId>.` 为前缀、或以 `_<childId>.jsonl` 为后缀（pi 真实落盘名为
 * `<时间戳>_<sessionId>.jsonl`，时间戳段形如 2026-09-09T09-05-18-150Z 不含
 * 下划线，后缀匹配精确）；未命中的保留；删除失败仅 WARNING 不抛错（不阻塞归档）。
 * @param root 项目根
 * @param childIds 被归档任务 dispatches 中的 childId 列表
 */
export function cleanupSessionFiles(root: string, childIds: string[]): void {
  if (childIds.length === 0) return
  const dir = sessionsDir(root)
  if (!existsSync(dir)) return
  let files: string[]
  try {
    files = readdirSync(dir)
  } catch (error) {
    console.warn(`${REGISTRY_WARN_PREFIX} failed to list session files: ${String(error)}`)
    return
  }
  for (const childId of childIds) {
    // 命中三形态：精确等于 childId / 前缀 `<childId>.` / 后缀 `_<childId>.jsonl`（pi 真实落盘名）。
    const matches = files.filter(
      (f) => f === childId || f.startsWith(`${childId}.`) || f.endsWith(`_${childId}.jsonl`),
    )
    for (const file of matches) {
      try {
        rmSync(join(dir, file), { force: true })
      } catch (error) {
        console.warn(
          `${REGISTRY_WARN_PREFIX} failed to remove session file ${file}: ${String(error)}`,
        )
      }
    }
  }
}

/**
 * 持久化空落盘进程表（R3）：把 registry.json 写为空表。
 * 供 shutdown 路径调用——sigtermAllAlive 清空进程内表后，落盘表同步清空，
 * 与重启 cleanupOrphans 构成双层防线。
 * 落盘失败仅 WARNING 不抛错：session_shutdown 监听路径上异常不能中断宿主关闭流程
 *（与归档清理 R1「失败仅 WARNING」同一纪律）。
 * @param root 项目根
 */
export function persistEmptyRegistry(root: string): void {
  try {
    ensureSessionsDir(root)
    writeFileAtomic(registryPath(root), JSON.stringify({ entries: [] }, null, 2))
  } catch (error) {
    console.warn(`${REGISTRY_WARN_PREFIX} failed to persist empty registry: ${String(error)}`)
  }
}
