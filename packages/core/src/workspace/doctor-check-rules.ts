/**
 * doctor 检查规则（状态机重建后的五类，TypeScript）：
 * lifecycle-consistency / confirm-completeness / case-consistency / worktree / config。
 *
 * 设计意图：
 * - 全部检查只读，不写任何 `.workloom/` 文件；
 * - 任务级三类检查共享一次任务扫描（loadTaskNodes）：活跃区 + 归档区逐个任务
 *   目录做「物理读取 + 兼容读映射」，读取或值域映射失败本身即生命周期问题；
 * - 生命周期一致性以状态机为唯一事实源：readTaskView 的可判定错误、TRANSITIONS
 *   推导的模式合法阶段集、status 与 stage 双字段一致性；planReview 的 revising
 *   轮数只记录不判定（info 行输出）；
 * - 确认完整性对照 autonomy：manual/semi 过了对齐期必须有 PRD 确认记录，
 *   standard 非容器任务进入实现期必须有 PLAN 确认记录，自动记录必须携带
 *   autonomy 审计快照；
 * - CASE 一致性对照 case.phase 轨道与 dispatches/case-result.md 实况：
 *   light 无 CASE 轨道、designSession 须有 case-design 派发、approved 及之后
 *   须有执行派发、done 须有 RESULT 文档；
 * - worktree 与 config 两类维持原只读检查；
 * - 运行时 issue/message 文案英文；注释中文。
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'

import { loadConfig } from './config-load.ts'
import { insideWorkloom, WORKLOOM_DIR } from './locate.js'
import { scanWorktreeConsistencySync } from './worktree-integrate.ts'
import { makeIssue } from './doctor-tasks.ts'
import { readTaskRecord } from '../task/storage/index.ts'
import {
  CASE_PHASES,
  MODES,
  PLAN_REVIEW_PHASES,
  STAGES,
  TRANSITIONS,
  statusOfStage,
  toTaskView,
} from '../task/state/index.ts'
import { CASE_FILES, CASE_PURPOSES } from '../task/case-structure.ts'
import { EXECUTOR_ROLES } from '../dispatch/executor-roles.ts'

import type { DoctorIssue, DoctorTaskNode } from './doctor-types.ts'
import { ARCHIVE_DIR, TASK_DIR } from './doctor-types.ts'
import type { TaskModeValue, TaskStageValue } from '../task/state/index.ts'

/* ---------------- 任务扫描（三类任务级检查共享） ---------------- */

/** task.json 相对路径（issue 的 path 字段用）。 */
function taskJsonRelPath(taskRelPath: string): string {
  return join(WORKLOOM_DIR, taskRelPath, 'task.json')
}

/**
 * 扫描活跃区与归档区的全部任务目录：每个目录一条节点，物理读取或兼容读
 * 映射失败时 record/view 为 null 且 readError 携带可判定原因。
 * @param root 项目根
 * @returns 任务节点列表（活跃区在前、归档区在后）
 */
export function loadTaskNodes(root: string): DoctorTaskNode[] {
  const nodes: DoctorTaskNode[] = []
  const tasksDir = insideWorkloom(root, TASK_DIR)
  if (!existsSync(tasksDir)) return nodes
  /** @param relPath 任务目录相对 .workloom 的路径 */
  const push = (relPath: string, archived: boolean): void => {
    const name = basename(relPath)
    const [rawErr, record] = readTaskRecord(root, relPath)
    if (rawErr !== null || record === null) {
      nodes.push({
        name,
        relPath,
        archived,
        record: null,
        view: null,
        readError: rawErr?.message ?? 'task.json is unreadable',
      })
      return
    }
    // 兼容读单点：未映射的 mode/stage/status/轨道/自治度值转为可判定 readError。
    try {
      nodes.push({ name, relPath, archived, record, view: toTaskView(record, relPath), readError: null })
    } catch (error) {
      nodes.push({ name, relPath, archived, record, view: null, readError: messageOf(error) })
    }
  }
  for (const entry of readdirSync(tasksDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === ARCHIVE_DIR) continue
    push(join(TASK_DIR, entry.name), false)
  }
  const archiveDir = join(tasksDir, ARCHIVE_DIR)
  if (!existsSync(archiveDir)) return nodes
  for (const month of readdirSync(archiveDir, { withFileTypes: true })) {
    if (!month.isDirectory()) continue
    const monthDir = join(archiveDir, month.name)
    for (const taskEntry of readdirSync(monthDir, { withFileTypes: true })) {
      if (!taskEntry.isDirectory()) continue
      push(join(TASK_DIR, ARCHIVE_DIR, month.name, taskEntry.name), true)
    }
  }
  return nodes
}

/* ---------------- ① 生命周期一致性 ---------------- */

/**
 * 模式的合法主线阶段集（TRANSITIONS 单一事实源推导：全部边的起止阶段 +
 * 初始 aligning）。
 * @param mode 任务模式
 * @returns 合法阶段集合
 */
function allowedStagesForMode(mode: TaskModeValue): ReadonlySet<TaskStageValue> {
  const stages = new Set<TaskStageValue>([STAGES.ALIGNING])
  for (const entry of TRANSITIONS) {
    if (entry.mode !== mode) continue
    stages.add(entry.from)
    stages.add(entry.to)
  }
  return stages
}

/** 生命周期一致性检查产物（issues + info：revising 轮数只记录不判定）。 */
export interface LifecycleCheckResult {
  issues: DoctorIssue[]
  info: string[]
}

/**
 * 检查①生命周期一致性：任务记录可读且值域可映射、stage 与 mode 组合在迁移表
 * 合法集内、status 与 stage 双字段一致；planReview 的 revising 轮数经 info 行
 * 只记录不判定。
 * @param nodes 任务扫描节点
 * @returns issues 与 info 行
 */
export function checkLifecycleConsistency(nodes: DoctorTaskNode[]): LifecycleCheckResult {
  const issues: DoctorIssue[] = []
  const info: string[] = []
  for (const node of nodes) {
    if (node.view === null) {
      issues.push(
        makeIssue({
          code: 'lifecycle-consistency',
          title: 'Unreadable or invalid task record',
          severity: 'error',
          task: node.relPath,
          message: `task record is not readable through the state machine: ${node.readError ?? 'unknown error'}`,
          path: taskJsonRelPath(node.relPath),
          fixable: false,
          hint: 'Fix the corrupted task.json or migrate unmapped values to the state machine domains (mode/stage/status/casePhase/planReview/autonomy).',
        }),
      )
      continue
    }
    const view = node.view
    const allowed = allowedStagesForMode(view.mode)
    if (!allowed.has(view.stage)) {
      issues.push(
        makeIssue({
          code: 'lifecycle-consistency',
          title: 'Invalid stage for mode',
          severity: 'error',
          task: node.relPath,
          message: `stage "${view.stage}" is not a valid mainline stage for mode "${view.mode}" (allowed: ${[...allowed].join(', ')})`,
          path: taskJsonRelPath(node.relPath),
          fixable: false,
          hint: 'Repair task.json stage/mode so the pair matches the transition table of the task mode.',
        }),
      )
    }
    // status 与 stage 双字段一致性（视图 status 由 stage 反推；落盘原值不一致即手改痕迹）。
    if (node.record !== null) {
      const derived = statusOfStage(view.stage)
      if (node.record.status !== derived) {
        issues.push(
          makeIssue({
            code: 'lifecycle-consistency',
            title: 'Status/stage mismatch',
            severity: 'warn',
            task: node.relPath,
            message: `task.json status "${node.record.status}" does not match stage "${view.stage}" (expected status "${derived}")`,
            path: taskJsonRelPath(node.relPath),
            fixable: false,
            hint: 'Align task.json status with stage; lifecycle writes go through the state machine single write entry.',
          }),
        )
      }
    }
    // revising 轮数只记录不判定（info 行，轨道值合法性已由兼容读保证）。
    if (view.planReviewRevisions > 0) {
      info.push(
        `${node.relPath}: plan review revising rounds recorded: ${view.planReviewRevisions} (recorded, not judged)`,
      )
    }
  }
  return { issues, info }
}

/* ---------------- ② 确认记录完整性（对照 autonomy） ---------------- */

/** 已过对齐期的主线阶段（planning 及之后；archived 不追溯）。 */
const POST_ALIGNING_STAGES: readonly TaskStageValue[] = [
  STAGES.PLANNING,
  STAGES.IMPLEMENTING,
  STAGES.CHECKING,
  STAGES.ORCHESTRATING,
  STAGES.INTEGRATING,
]

/**
 * 检查②确认记录完整性：manual/semi 任务过了对齐期必须有 PRD 确认记录；
 * standard 非容器任务进入实现期必须有 PLAN 确认记录；自动记录的确认必须携带
 * autonomy 审计快照；PLAN 已确认但评审轨道停在 reviewing/revising 属矛盾态。
 * 归档任务不追溯（历史快照）。
 * @param nodes 任务扫描节点
 * @returns issue 列表
 */
export function checkConfirmCompleteness(nodes: DoctorTaskNode[]): DoctorIssue[] {
  const issues: DoctorIssue[] = []
  for (const node of nodes) {
    if (node.archived || node.view === null) continue
    const view = node.view
    // light 免对齐（与 prd-confirmed 守卫同口径）：只有 standard/parent 的
    // manual/semi 任务过了对齐期才要求 PRD 确认记录。
    if (
      view.alignment === null &&
      view.mode !== MODES.LIGHT &&
      (view.autonomy === 'manual' || view.autonomy === 'semi') &&
      POST_ALIGNING_STAGES.includes(view.stage)
    ) {
      issues.push(
        makeIssue({
          code: 'confirm-completeness',
          title: 'Missing PRD confirmation',
          severity: 'warn',
          task: node.relPath,
          message: `task passed aligning (stage: ${view.stage}, autonomy: ${view.autonomy}) without a PRD confirmation record`,
          path: taskJsonRelPath(node.relPath),
          fixable: false,
          hint: 'Record the PRD confirmation via workloom_task_align action=confirm, or inspect task.json overrides for a force bypass.',
        }),
      )
    }
    if (
      view.planConfirmation === null &&
      view.mode === MODES.STANDARD &&
      view.children.length === 0 &&
      (view.stage === STAGES.IMPLEMENTING || view.stage === STAGES.CHECKING)
    ) {
      issues.push(
        makeIssue({
          code: 'confirm-completeness',
          title: 'Missing PLAN confirmation',
          severity: 'warn',
          task: node.relPath,
          message: `task entered ${view.stage} without a PLAN confirmation record`,
          path: taskJsonRelPath(node.relPath),
          fixable: false,
          hint: 'Record the PLAN confirmation via workloom_task_align target=plan action=confirm after the Judger review track is clean.',
        }),
      )
    }
    // 自动记录的确认必须携带 autonomy 审计快照（决定 5；source 缺失属旧记录，容忍）。
    for (const [field, record] of [
      ['alignment', view.alignment],
      ['planConfirmation', view.planConfirmation],
    ] as const) {
      if (record !== null && record.source === 'auto' && (typeof record.autonomy !== 'string' || record.autonomy === '')) {
        issues.push(
          makeIssue({
            code: 'confirm-completeness',
            title: 'Auto confirmation missing autonomy snapshot',
            severity: 'warn',
            task: node.relPath,
            message: `${field} is auto-recorded but carries no autonomy snapshot`,
            path: taskJsonRelPath(node.relPath),
            fixable: false,
            hint: 'Auto-recorded confirmations must carry source and autonomy audit fields; re-record the confirmation.',
          }),
        )
      }
    }
    // PLAN 已确认但评审轨道未 clean/none：矛盾态（none 兼容轨道机制前的历史记录）。
    if (
      view.planConfirmation !== null &&
      view.planReview !== PLAN_REVIEW_PHASES.NONE &&
      view.planReview !== PLAN_REVIEW_PHASES.CLEAN
    ) {
      issues.push(
        makeIssue({
          code: 'confirm-completeness',
          title: 'PLAN confirmed while review track not clean',
          severity: 'warn',
          task: node.relPath,
          message: `planConfirmation is recorded but the plan review track is "${view.planReview}" (expected clean)`,
          path: taskJsonRelPath(node.relPath),
          fixable: false,
          hint: 'The PLAN confirmation requires the plan-review-clean guard; inspect the planReview track record.',
        }),
      )
    }
  }
  return issues
}

/* ---------------- ③ CASE 记录一致性 ---------------- */

/**
 * 检查③CASE 记录一致性：case.phase 轨道与模式、dispatches 与 RESULT 文档实况
 * 对照——light 无 CASE 轨道；designSession 必须有对应 case-design 派发记录；
 * approved 及之后必须有执行派发记录；done 必须有 case-result.md。
 * @param root 项目根
 * @param nodes 任务扫描节点
 * @returns issue 列表
 */
export function checkCaseConsistency(root: string, nodes: DoctorTaskNode[]): DoctorIssue[] {
  const issues: DoctorIssue[] = []
  for (const node of nodes) {
    if (node.view === null) continue
    const view = node.view
    if (view.mode === MODES.LIGHT && view.casePhase !== CASE_PHASES.NONE) {
      issues.push(
        makeIssue({
          code: 'case-consistency',
          title: 'Light task carries a CASE track value',
          severity: 'warn',
          task: node.relPath,
          message: `light task has casePhase "${view.casePhase}" but the light mode has no CASE track`,
          path: taskJsonRelPath(node.relPath),
          fixable: false,
          hint: 'Remove case.phase from the light task record or re-create the task in the right mode.',
        }),
      )
    }
    const caseRecord = view.case
    if (caseRecord !== null && typeof caseRecord.designSession === 'string' && caseRecord.designSession !== '') {
      const hasDesignDispatch = view.dispatches.some(
        (entry) =>
          entry.kind === EXECUTOR_ROLES.CHECKER &&
          (entry.purpose ?? CASE_PURPOSES.EXECUTION) === CASE_PURPOSES.DESIGN &&
          entry.childId === caseRecord.designSession,
      )
      if (!hasDesignDispatch) {
        issues.push(
          makeIssue({
            code: 'case-consistency',
            title: 'Design session without dispatch record',
            severity: 'warn',
            task: node.relPath,
            message: `case.designSession "${caseRecord.designSession}" has no matching case-design dispatch record`,
            path: taskJsonRelPath(node.relPath),
            fixable: false,
            hint: 'CASE design sessions are recorded by the case-design dispatch; inspect task.json dispatches.',
          }),
        )
      }
    }
    const approvedOrLater: readonly string[] = [CASE_PHASES.APPROVED, CASE_PHASES.EXECUTING, CASE_PHASES.DONE]
    if (approvedOrLater.includes(view.casePhase)) {
      const hasExecutionDispatch = view.dispatches.some(
        (entry) =>
          entry.kind === EXECUTOR_ROLES.CHECKER &&
          (entry.purpose ?? CASE_PURPOSES.EXECUTION) === CASE_PURPOSES.EXECUTION,
      )
      if (!hasExecutionDispatch) {
        issues.push(
          makeIssue({
            code: 'case-consistency',
            title: 'CASE track ahead of dispatch records',
            severity: 'warn',
            task: node.relPath,
            message: `casePhase is "${view.casePhase}" but no execution dispatch is recorded`,
            path: taskJsonRelPath(node.relPath),
            fixable: false,
            hint: 'The CASE track advances at the execution dispatch single point; inspect task.json dispatches.',
          }),
        )
      }
    }
    if (
      view.casePhase === CASE_PHASES.DONE &&
      !existsSync(join(insideWorkloom(root, node.relPath), CASE_FILES.result))
    ) {
      issues.push(
        makeIssue({
          code: 'case-consistency',
          title: 'CASE done without result document',
          severity: 'warn',
          task: node.relPath,
          message: `casePhase is "done" but ${CASE_FILES.result} is missing`,
          path: join(WORKLOOM_DIR, node.relPath, CASE_FILES.result),
          fixable: false,
          hint: 'The execution settlement only advances the track to done when the RESULT document is passed; restore case-result.md.',
        }),
      )
    }
  }
  return issues
}

/* ---------------- ④ worktree 一致性（维持原只读检查） ---------------- */

/**
 * 检查④worktree 一致性：
 * - `.workloom/.gitignore` 缺 `.runtime/` 条目（worktree 状态收敛在
 *   `.runtime/worktrees/`，存量项目不自动迁移 → 提示补条目）；
 * - `.workloom/.runtime/worktrees/` 目录与 git 注册不一致（目录在但未注册 /
 *   注册在但目录失或 prunable）→ 指引 `git worktree prune` + 人工检查。
 * 非 git 项目跳过注册比对（start 侧已 fail loud）；config 非法跳过（config 检查报告）。
 * @param root 项目根
 * @returns 检查出的 issue 列表
 */
export function checkWorktree(root: string): DoctorIssue[] {
  const issues: DoctorIssue[] = []
  // ① .gitignore 缺 .runtime/ 条目（文件整体缺失时跳过：init 骨架总会生成该文件）。
  const gitignorePath = join(root, WORKLOOM_DIR, '.gitignore')
  const gitignore = readIfExists(gitignorePath)
  if (
    gitignore !== null &&
    !gitignore.split(/\r?\n/).some((line) => line.trim() === '.runtime/')
  ) {
    issues.push(
      makeIssue({
        code: 'worktree',
        title: 'Missing runtime gitignore entry',
        severity: 'warn',
        task: null,
        message:
          '.workloom/.gitignore does not ignore .runtime/ (task worktrees under .runtime/worktrees show up as untracked and raise the main-repo dirty count).',
        path: join(WORKLOOM_DIR, '.gitignore'),
        fixable: false,
        hint: "Add a '.runtime/' line to .workloom/.gitignore (existing projects are not migrated automatically).",
      }),
    )
  }
  // ② 目录与 git 注册一致性（只读探测）。
  let config: ReturnType<typeof loadConfig>
  try {
    config = loadConfig(root)
  } catch {
    return issues // config 非法由 config 检查报告；无法解析 packages → 跳过比对
  }
  const [scanErr, scan] = scanWorktreeConsistencySync(root, config)
  if (scanErr !== null) {
    issues.push(
      makeIssue({
        code: 'worktree',
        title: 'Worktree inspection failed',
        severity: 'warn',
        task: null,
        message: `cannot inspect task worktrees: ${messageOf(scanErr)}`,
        path: null,
        fixable: false,
        hint: 'Inspect .workloom/.runtime/worktrees and `git worktree list` manually.',
      }),
    )
    return issues
  }
  if (scan === null) return issues
  for (const rel of scan.unregistered) {
    issues.push(
      makeIssue({
        code: 'worktree',
        title: 'Unregistered worktree directory',
        severity: 'warn',
        task: null,
        message: `${rel} exists but is not a registered worktree (an empty directory would be silently reused by git worktree add).`,
        path: rel,
        fixable: false,
        hint: `Inspect ${rel} and remove it manually; destructive cleanup is never automated.`,
      }),
    )
  }
  for (const rel of scan.missing) {
    issues.push(
      makeIssue({
        code: 'worktree',
        title: 'Stale worktree registration',
        severity: 'warn',
        task: null,
        message: `${rel} is registered as a worktree but its directory is missing or prunable.`,
        path: rel,
        fixable: false,
        hint: 'Inspect the registration with `git worktree list`, then run `git worktree prune` to drop stale metadata.',
      }),
    )
  }
  return issues
}

/* ---------------- ⑤ config（维持原只读检查） ---------------- */

/**
 * 检查⑤config：缺配置 / packages 空配置 / 配置非法三类提示。
 * @param root 项目根
 * @returns 检查出的 issue 列表
 */
export function checkConfig(root: string): DoctorIssue[] {
  const issues: DoctorIssue[] = []
  const workloomDir = join(root, WORKLOOM_DIR)
  const hasConfig = ['config.json', 'config.js'].some((name) =>
    existsSync(join(workloomDir, name)),
  )
  if (!hasConfig) {
    issues.push(
      makeIssue({
        code: 'config',
        title: 'Missing config file',
        severity: 'warn',
        task: null,
        message: 'No .workloom/config.json or config.js; using built-in defaults.',
        path: join(WORKLOOM_DIR, 'config.json'),
        fixable: false,
        hint: 'Create .workloom/config.json to customize hooks, packages and subagent_profiles.',
      }),
    )
  } else {
    try {
      const config = loadConfig(root)
      // packages 空配置：create 将拒绝一切任务 → 提前提示补配置。
      if (Object.keys(config.packages).length === 0) {
        issues.push(
          makeIssue({
            code: 'config',
            title: 'No packages configured',
            severity: 'warn',
            task: null,
            message:
              'packages is empty: workloom_task_create rejects every task until at least one package is declared.',
            path: join(WORKLOOM_DIR, 'config.json'),
            fixable: false,
            hint: 'Declare a packages entry in .workloom/config.json (run workloom-packages-scan to generate the list).',
          }),
        )
      }
    } catch (error) {
      issues.push(
        makeIssue({
          code: 'config',
          title: 'Invalid config file',
          severity: 'error',
          task: null,
          message: `config is invalid: ${messageOf(error)}`,
          path: join(WORKLOOM_DIR, 'config.json'),
          fixable: false,
          hint: 'Fix the config error in .workloom/config.json or config.js.',
        }),
      )
    }
  }
  return issues
}

/* ---------------- 辅助 ---------------- */

/** 读取文件文本（缺失返回 null，其他错误透传）。 */
function readIfExists(absPath: string): string | null {
  try {
    return readFileSync(absPath, 'utf8')
  } catch (error) {
    if (isEnoent(error)) return null
    throw error
  }
}

/** @param error 未知异常 @returns 消息文本。 */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** @param error 未知异常 @returns 是否文件不存在。 */
function isEnoent(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT'
}
