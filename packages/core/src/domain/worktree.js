/**
 * 任务 worktree 生命周期编排（domain 纯 JS + JSDoc，err 元组、无 shell）。
 *
 * 设计意图（design §3）：
 * - start 侧 createTaskWorktree：package→仓解析 → unborn/detached 探测 → base
 *   分支（子任务取父任务已有分支，否则当前分支）→ 渲染分支名并过
 *   check-ref-format → 残留前置探测（prune + list，空目录也不放过——add 会静默
 *   复用空目录，§A1/§A3）→ 分支复用或新建（`add -b` 失败回滚游离分支，§A1）；
 *   任一失败返回 err，调用方在 status 写盘前中止 → 零部分状态；
 * - archive 侧 cleanupTaskWorktree：脏检查无条件（调用方不传 force，结构上无
 *   旁路）→ merge 模式（主检出 HEAD==base 校验、祖先判定跳过合并、以 MERGE_HEAD
 *   判别冲突并 abort、submodule gitlink 以 `HEAD:<path>` vs 子仓 HEAD 幂等联动
 *   ——禁用 `rev-parse <path>` 原样回显陷阱，§A6）→ worktree remove →
 *   merge-delete-branch 才删分支（顺序必须 remove 先于 branch -D，§A2 互锁）；
 * - 本模块所有 git 动作经 git.js 原语（execFile 无 shell、err.code/err.stderr
 *   消费约定见 git.js 文件头）；错误文案英文，前缀 `workloom worktree:`。
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, join, relative, resolve, sep } from 'node:path'

import {
  gitAddCommit,
  gitBranchDelete,
  gitBranchExists,
  gitCheckRefFormat,
  gitConfig,
  gitHasMergeHead,
  gitIsAncestor,
  gitMerge,
  gitMergeAbort,
  gitRevParse,
  gitStatusSync,
  gitWorktreeAdd,
  gitWorktreeList,
  gitWorktreeListSync,
  gitWorktreePrune,
  gitWorktreeRemove,
} from './git.js'
import { WORKLOOM_DIR } from './locate.js'

/** 错误消息前缀（运行时文案英文）。 */
const ERR_PREFIX = 'workloom worktree'

/** worktree 根目录名（项目根下，`.workloom/worktree/…`）。 */
const WORKTREE_DIR = 'worktree'

/** archive 清理中的合并模式（design §3.4 步 4 的适用范围）。 */
const MERGE_MODES = new Set(['merge-keep-branch', 'merge-delete-branch'])

/**
 * 组装 worktree 错误（内部）。
 * @param {string} message 英文文案（不含前缀）
 * @returns {Error}
 */
function wtErr(message) {
  return new Error(`${ERR_PREFIX}: ${message}`)
}

/**
 * 提取 git 失败的可读文案（内部）：优先 stderr（git 原始 fatal 文案），
 * 否则回退 Error.message。
 * @param {Error & {stderr?: string | Buffer}} error git 原语返回的 err
 * @returns {string}
 */
function errText(error) {
  const stderr = typeof error.stderr === 'string' ? error.stderr.trim() : ''
  return stderr !== '' ? stderr : error.message
}

/**
 * 提取 git 失败的退出码（内部）：spawn 失败（如 ENOENT）时无数字码。
 * @param {Error & {code?: unknown}} error git 原语返回的 err
 * @returns {string}
 */
function errCode(error) {
  return typeof error.code === 'number' ? `exit ${error.code}` : `code ${String(error.code)}`
}

/**
 * 解析任务 package 所属仓（design §3.1）。
 * - `config.packages[pkg]` 必须存在（调用方已校验，防御性再查，未知值 fail loud）；
 * - `entry.git === true` → 子仓：先校验候选目录确为 git 仓（配置标注与磁盘
 *   不符即 err），再以超级仓根 `.gitmodules` 注册表判定是否 submodule
 *   （`git config -f .gitmodules --get-regexp '\.path$'`，§A5；`submodule status`
 *   无输出不可用作判定）；
 * - 其余（含 `git` 缺省/false）→ 项目根仓，须 `--is-inside-work-tree` 校验
 *   （非 git → err，PRD 7b，附 `worktree.enabled=false` 退出指引）。
 * @param {string} root 项目根
 * @param {import('./config.d.ts').WorkloomConfig} config 项目配置
 * @param {string} pkg package 名（task.package）
 * @returns {Promise<[Error | null, import('./worktree.d.ts').TaskRepoResolution | null]>}
 */
export async function resolveTaskRepo(root, config, pkg) {
  const entry = config.packages[pkg]
  if (entry === undefined) {
    const declared = Object.keys(config.packages)
    return [
      wtErr(
        `unknown package ${JSON.stringify(pkg)} (declared: ${declared.length > 0 ? declared.join(', ') : 'none'}); ` +
          'declare it under "packages" in .workloom/config.json (run workloom-packages-scan to generate the list)',
      ),
      null,
    ]
  }
  const candidate = resolve(root, entry.path)
  if (entry.git === true) {
    const [insideErr, inside] = await gitRevParse(candidate, ['--is-inside-work-tree'])
    if (insideErr !== null || inside !== 'true') {
      return [
        wtErr(
          `package ${JSON.stringify(pkg)} is declared git: true but ${entry.path} is not a git working tree ` +
            '(fix the packages entry in .workloom/config.json)',
        ),
        null,
      ]
    }
    const subPath = relative(root, candidate)
    const [cfgErr, matches] = await gitConfig(root, [
      '-f',
      '.gitmodules',
      '--get-regexp',
      '\\.path$',
    ])
    if (cfgErr !== null) return [wtErr(`cannot read .gitmodules: ${errText(cfgErr)}`), null]
    if (matches === null) return [wtErr('cannot read .gitmodules: empty output'), null]
    const registered = matches
      .split('\n')
      .some((line) => line !== '' && line.slice(line.indexOf(' ') + 1).trim() === subPath)
    return [null, { repoRoot: candidate, kind: registered ? 'submodule' : 'sub', subPath }]
  }
  const [rootInsideErr, rootInside] = await gitRevParse(root, ['--is-inside-work-tree'])
  if (rootInsideErr !== null || rootInside !== 'true') {
    return [
      wtErr(
        `project is not a git working tree at ${root}; start created no worktree — ` +
          'set worktree.enabled=false to opt out',
      ),
      null,
    ]
  }
  return [null, { repoRoot: root, kind: 'root' }]
}

/**
 * 渲染分支名并校验（design §3.2）：占位符白名单替换（`<task-id>` /
 * `<task-slug>` / `<date>`，加载期已在 config 校验模板本身）后过
 * `git check-ref-format --branch`；非法 → err（文案含渲染结果与模板）。
 * @param {string} template 分支名模板（config.worktree.branchTemplate）
 * @param {import('./worktree.d.ts').BranchNameContext} ctx 渲染上下文
 * @param {string} [root] check-ref-format 执行目录（命令本身 cwd 无关）
 * @returns {Promise<[Error | null, string | null]>}
 */
export async function renderBranchName(template, ctx, root = process.cwd()) {
  const name = template
    .replaceAll('<task-id>', ctx.taskId)
    .replaceAll('<task-slug>', ctx.taskSlug)
    .replaceAll('<date>', ctx.dateYYYYMMDD)
  const [refErr] = await gitCheckRefFormat(root, name)
  if (refErr !== null) {
    return [
      wtErr(
        `branch name ${JSON.stringify(name)} rendered from template ${JSON.stringify(template)} ` +
          `is not a valid git ref: ${errText(refErr)}`,
      ),
      null,
    ]
  }
  return [null, name]
}

/**
 * start 侧创建任务 worktree（design §3.3）：任一失败返回 err，调用方在 status
 * 写盘前中止（零部分状态）；成功结果的 worktreePath 为项目根相对路径（S1-Q1）。
 * @param {string} root 项目根
 * @param {import('./task-store.d.ts').TaskRecord} task 任务记录（package/parent/createdAt/name）
 * @param {string} taskRelPath 任务目录相对 .workloom 的路径
 * @param {import('./config.d.ts').WorkloomConfig} config 项目配置
 * @returns {Promise<[Error | null, import('./worktree.d.ts').CreateTaskWorktreeResult | null]>}
 */
export async function createTaskWorktree(root, task, taskRelPath, config) {
  // 1. package → 仓解析（非 git / 配置与磁盘不符 → 直接拒绝）。
  const [repoErr, repo] = await resolveTaskRepo(
    root,
    config,
    /** @type {string} */ (task.package),
  )
  if (repoErr !== null || repo === null) {
    return [repoErr ?? wtErr('package resolution returned no repository'), null]
  }
  const repoRoot = repo.repoRoot

  // 2. unborn 探测：`rev-parse --verify HEAD` exit 128 = 仓库还没有任何 commit（§A8）。
  const [headErr] = await gitRevParse(repoRoot, ['--verify', 'HEAD'])
  if (headErr !== null) {
    if (headErr.code === 128) {
      return [wtErr(`repository has no commits at ${repoRoot}`), null]
    }
    return [wtErr(`cannot read HEAD at ${repoRoot}: ${errText(headErr)}`), null]
  }

  // 3. detached 探测：`--abbrev-ref HEAD` 输出 HEAD 即 detached（§A8；不能只用
  // branch --show-current——unborn 场景它返回分支名）。
  const [curErr, currentBranch] = await gitRevParse(repoRoot, ['--abbrev-ref', 'HEAD'])
  if (curErr !== null || currentBranch === null) {
    return [
      wtErr(
        curErr !== null
          ? `cannot determine current branch at ${repoRoot}: ${errText(curErr)}`
          : `cannot determine current branch at ${repoRoot}: empty rev-parse output`,
      ),
      null,
    ]
  }
  if (currentBranch === 'HEAD') {
    return [wtErr(`HEAD is detached at ${repoRoot}; check out a branch before start`), null]
  }

  // 4. base 分支：子任务优先取父任务已有分支（stacked，容器 R1-Q6），否则当前分支。
  let baseBranch = currentBranch
  if (typeof task.parent === 'string' && task.parent !== '') {
    let parentJson
    try {
      parentJson = JSON.parse(
        readFileSync(join(root, WORKLOOM_DIR, task.parent, 'task.json'), 'utf8'),
      )
    } catch (error) {
      return [wtErr(`cannot read parent task ${JSON.stringify(task.parent)} task.json: ${String(error)}`), null]
    }
    if (typeof parentJson.branch === 'string' && parentJson.branch !== '') {
      baseBranch = parentJson.branch
    }
  }

  // 5. 分支名渲染 + ref 校验（非法渲染结果 fail loud，R5-Q3）。
  const taskId = basename(taskRelPath)
  const dateYYYYMMDD = utcDateCompact(task.createdAt)
  if (dateYYYYMMDD === null) {
    return [wtErr(`task createdAt is not a valid date: ${JSON.stringify(task.createdAt)}`), null]
  }
  const [renderErr, branch] = await renderBranchName(
    config.worktree.branchTemplate,
    { taskId, taskSlug: task.name, dateYYYYMMDD },
    root,
  )
  if (renderErr !== null) return [renderErr, null]
  if (branch === null) return [wtErr('branch rendering returned no name'), null]

  // 6. worktree 目标：root 仓 → `.workloom/worktree/<task-id>`；子仓/submodule →
  //    再嵌套 package 名（布局为 PRD R4 裁定）。
  const relWorktreePath = join(
    WORKLOOM_DIR,
    WORKTREE_DIR,
    taskId,
    ...(repo.kind === 'root' ? [] : [String(task.package)]),
  )
  const targetAbs = resolve(root, relWorktreePath)

  // 7. 残留前置探测（§A1/§A3）：add 会静默复用空目录、prune 不删目录——不能依赖
  //    add 退出码。目录存在 → prune 元数据 → 查注册：命中本任务分支则幂等复用。
  if (existsSync(targetAbs)) {
    const [pruneErr] = await gitWorktreePrune(repoRoot)
    if (pruneErr !== null) return [wtErr(`worktree prune failed: ${errText(pruneErr)}`), null]
    const [listErr, entries] = await gitWorktreeList(repoRoot)
    if (listErr !== null) return [wtErr(`worktree list failed: ${errText(listErr)}`), null]
    if (entries === null) return [wtErr('worktree list returned no entries'), null]
    const entry = entries.find((item) => resolve(item.path) === targetAbs)
    if (entry !== undefined) {
      if (entry.branch === branch) {
        return [null, { branch, baseBranch, worktreePath: relWorktreePath }]
      }
      return [
        wtErr(
          `target path ${JSON.stringify(relWorktreePath)} is already a registered worktree on branch ` +
            `${JSON.stringify(entry.branch ?? '(detached)')}, expected ${JSON.stringify(branch)}; ` +
            'inspect and remove it manually',
        ),
        null,
      ]
    }
    return [
      wtErr(
        `target path ${JSON.stringify(relWorktreePath)} exists but is not a registered worktree; ` +
          'inspect and remove it manually',
      ),
      null,
    ]
  }

  // 8. 分支处置：已存在 → 复用 add（被其他 worktree 检出时 git 报 already checked
  //    out，文案透传）；不存在 → `add -b <branch> <path> <base>` 新建。
  const [branchCheckErr, branchExistsNow] = await gitBranchExists(repoRoot, branch)
  if (branchCheckErr !== null) {
    return [wtErr(`cannot check branch ${JSON.stringify(branch)}: ${errText(branchCheckErr)}`), null]
  }
  const [addErr] =
    branchExistsNow === true
      ? await gitWorktreeAdd(repoRoot, targetAbs, branch)
      : await gitWorktreeAdd(repoRoot, targetAbs, branch, baseBranch)

  // 9. 失败回滚（§A1 硬事实）：`add -b` 在校验目标路径之前就创建分支，失败会遗留
  //    游离分支 → 仅当分支由本次 add 新建时 `branch -D` 兜底删除，err 附回滚说明。
  if (addErr !== null) {
    if (branchExistsNow !== true) {
      const [recheckErr, residual] = await gitBranchExists(repoRoot, branch)
      if (recheckErr === null && residual === true) {
        const [delErr] = await gitBranchDelete(repoRoot, branch)
        if (delErr === null) {
          return [
            wtErr(
              `worktree add failed (${errCode(addErr)}): ${errText(addErr)}; ` +
                `rollback: deleted residual branch ${JSON.stringify(branch)} created by the failed add`,
            ),
            null,
          ]
        }
        return [
          wtErr(
            `worktree add failed (${errCode(addErr)}): ${errText(addErr)}; ` +
              `rollback of residual branch ${JSON.stringify(branch)} also failed: ${errText(delErr)}`,
          ),
          null,
        ]
      }
    }
    return [wtErr(`worktree add failed (${errCode(addErr)}): ${errText(addErr)}`), null]
  }
  return [null, { branch, baseBranch, worktreePath: relWorktreePath }]
}

/**
 * archive 侧清理任务 worktree（design §3.4）：失败即阻断归档（调用方不落档）；
 * 结果并入 archive 回执（merged/gitlinkCommitted/worktreeRemoved/branchDeleted/skipped）。
 * 中段失败容忍（R5-Q2）：本函数成功后的 rename 失败接受为中间态，重跑时
 * 已 merged 跳过合并、gitlink 无 diff 跳过提交、无注册跳过 remove（幂等续做）。
 * @param {string} root 项目根
 * @param {import('./task-store.d.ts').TaskRecord} task 任务记录
 * @param {import('./config.d.ts').WorkloomConfig} config 项目配置
 * @returns {Promise<[Error | null, import('./worktree.d.ts').CleanupTaskWorktreeResult | null]>}
 */
export async function cleanupTaskWorktree(root, task, config) {
  // 1. 无 worktree 任务（存量/关闭态）→ no-op。
  if (typeof task.worktree_path !== 'string' || task.worktree_path === '') {
    return [null, emptyResult('no-worktree')]
  }
  // 2. manual 策略 → 不动 worktree/分支。
  if (config.worktree.cleanup === 'manual') {
    return [null, emptyResult('manual')]
  }
  // 3. 仓解析 + 脏检查：无条件拒绝（force 不豁免——调用方不传 force，结构上无旁路）。
  const [repoErr, repo] = await resolveTaskRepo(root, config, /** @type {string} */ (task.package))
  if (repoErr !== null || repo === null) {
    return [repoErr ?? wtErr('package resolution returned no repository'), null]
  }
  const repoRoot = repo.repoRoot
  const wtAbs = resolve(root, task.worktree_path)
  const result = emptyResult(null)
  if (existsSync(wtAbs)) {
    const [statusErr, status] = gitStatusSync(wtAbs)
    if (statusErr !== null) {
      return [wtErr(`cannot read worktree status at ${wtAbs}: ${errText(statusErr)}`), null]
    }
    if (status !== '') {
      return [
        wtErr(
          `worktree ${JSON.stringify(task.worktree_path)} has uncommitted changes; ` +
            'commit or discard them first (no force bypass)',
        ),
        null,
      ]
    }
  }

  if (MERGE_MODES.has(config.worktree.cleanup)) {
    // 4a. 主检出 HEAD == base_branch 校验（git 自身不拦 detached，§A7.3 → 唯一防线）。
    const [headErr, headBranch] = await gitRevParse(repoRoot, ['--abbrev-ref', 'HEAD'])
    if (headErr !== null) {
      return [wtErr(`cannot determine current branch at ${repoRoot}: ${errText(headErr)}`), null]
    }
    if (headBranch !== task.base_branch) {
      return [
        wtErr(
          `main checkout HEAD is ${JSON.stringify(headBranch)}, expected base branch ` +
            `${JSON.stringify(task.base_branch)} at ${repoRoot}; align the checkout before re-running archive`,
        ),
        null,
      ]
    }
    // 4b. 已合并判定（祖先关系与 ff/非 ff 无关，S1-Q2）→ 幂等重跑直接跳过合并。
    const [ancErr, alreadyMerged] = await gitIsAncestor(repoRoot, task.branch, 'HEAD')
    if (ancErr !== null) {
      return [wtErr(`cannot check merge state of ${JSON.stringify(task.branch)}: ${errText(ancErr)}`), null]
    }
    if (alreadyMerged !== true) {
      // 4c. 合并 + 三态判别：exit code 不可靠（冲突/untracked 同为 1），以 MERGE_HEAD
      //     为唯一判据——存在 → 冲突，abort 恢复现场后返回冲突通知（不落档）；
      //     不存在 → untracked/脏拒绝或身份缺失（§A7.1/A7.5），现场原样保留。
      const [mergeErr] = await gitMerge(repoRoot, task.branch)
      if (mergeErr !== null) {
        const [mhErr, inMerge] = await gitHasMergeHead(repoRoot)
        if (mhErr !== null) {
          return [wtErr(`cannot probe MERGE_HEAD at ${repoRoot}: ${errText(mhErr)}`), null]
        }
        if (inMerge === true) {
          const [abortErr] = await gitMergeAbort(repoRoot)
          if (abortErr !== null) {
            return [
              wtErr(
                `merge conflict while merging ${JSON.stringify(task.branch)} but abort failed at ` +
                  `${repoRoot}: ${errText(abortErr)}`,
              ),
              null,
            ]
          }
          return [
            wtErr(
              `merge conflict while merging ${JSON.stringify(task.branch)} into ` +
                `${JSON.stringify(task.base_branch)} at ${repoRoot}; resolve manually: ` +
                `git merge ${task.branch} in ${repoRoot}, then re-run archive`,
            ),
            null,
          ]
        }
        return [
          wtErr(
            `merge of ${JSON.stringify(task.branch)} failed at ${repoRoot} (${errCode(mergeErr)}): ` +
              `${errText(mergeErr)}`,
          ),
          null,
        ]
      }
      result.merged = true
    }
    // 4d. submodule gitlink 联动（仅注册 submodule；probe 幂等，与 4b 是否跳过合并
    //     无关——覆盖「合并成功但提交失败」的重跑）。权威对：根仓 `HEAD:<path>` vs
    //     子仓主检出 HEAD（禁用 `rev-parse <path>`，原样回显陷阱 §A6）。
    if (repo.kind === 'submodule') {
      const [linkErr, committed] = await syncGitlink(root, repo, task)
      if (linkErr !== null || committed === null) {
        return [linkErr ?? wtErr('gitlink sync returned no result'), null]
      }
      result.gitlinkCommitted = committed
    }
  }

  // 5. worktree 删除：先确认注册再 remove（未注册但目录存在 → 残留非法，人工处理；
  //    目录与注册均无 → 跳过，中段失败重跑幂等，R5-Q2）。locked → err 透传（不自动 -f -f）。
  const [listErr, entries] = await gitWorktreeList(repoRoot)
  if (listErr !== null) return [wtErr(`worktree list failed: ${errText(listErr)}`), null]
  if (entries === null) return [wtErr('worktree list returned no entries'), null]
  const entry = entries.find((item) => resolve(item.path) === wtAbs)
  if (entry !== undefined) {
    const [removeErr] = await gitWorktreeRemove(repoRoot, wtAbs)
    if (removeErr !== null) {
      return [
        wtErr(`worktree remove failed for ${JSON.stringify(task.worktree_path)}: ${errText(removeErr)}`),
        null,
      ]
    }
    result.worktreeRemoved = true
  } else if (existsSync(wtAbs)) {
    return [
      wtErr(
        `path ${JSON.stringify(task.worktree_path)} exists but is not a registered worktree; ` +
          'inspect and remove it manually',
      ),
      null,
    ]
  }

  // 6. merge-delete-branch 才删分支；顺序必须在 remove 之后（分支被检出时删除互锁，§A2）。
  if (config.worktree.cleanup === 'merge-delete-branch') {
    const [delErr] = await gitBranchDelete(repoRoot, task.branch)
    if (delErr !== null) {
      return [wtErr(`branch delete failed for ${JSON.stringify(task.branch)}: ${errText(delErr)}`), null]
    }
    result.branchDeleted = true
  }
  return [null, result]
}

/**
 * submodule gitlink 幂等联动（内部，design §3.4 步 4d）：根仓记录的 gitlink sha
 * 与 submodule 主检出 HEAD 不等 → 窄暂存 submodule 路径一条并提交（复用
 * gitAddCommit 纪律）；提交失败 fail loud（**不复用 autoCommitIfEnabled**——
 * 其「失败只 WARNING」契约相反）。
 * @param {string} root 项目根（= 根仓工作目录）
 * @param {import('./worktree.d.ts').TaskRepoResolution} repo 仓解析结果（submodule）
 * @param {import('./task-store.d.ts').TaskRecord} task 任务记录
 * @returns {Promise<[Error | null, boolean | null]>} true = 本次提交了 gitlink 更新
 */
async function syncGitlink(root, repo, task) {
  if (repo.subPath === undefined) {
    return [wtErr('repo resolution is missing subPath for gitlink sync'), null]
  }
  const [recordedErr, recorded] = await gitRevParse(root, [`HEAD:${repo.subPath}`])
  if (recordedErr !== null) {
    return [wtErr(`cannot read recorded gitlink for ${JSON.stringify(repo.subPath)}: ${errText(recordedErr)}`), null]
  }
  const [subErr, actual] = await gitRevParse(repo.repoRoot, ['HEAD'])
  if (subErr !== null) {
    return [wtErr(`cannot read submodule HEAD at ${repo.repoRoot}: ${errText(subErr)}`), null]
  }
  if (recorded === actual) return [null, false]
  const [commitErr] = await gitAddCommit(
    root,
    `chore: update gitlink ${repo.subPath} for task ${task.name}`,
    [repo.subPath],
  )
  if (commitErr !== null) {
    return [wtErr(`gitlink commit failed for ${JSON.stringify(repo.subPath)}: ${errText(commitErr)}`), null]
  }
  return [null, true]
}

/**
 * 组装清理结果（内部）：统一四个布尔字段，skipped 仅在提前跳过时携带。
 * @param {'no-worktree' | 'manual' | null} skipped 提前跳过原因（未跳过传 null）
 * @returns {import('./worktree.d.ts').CleanupTaskWorktreeResult}
 */
function emptyResult(skipped) {
  /** @type {import('./worktree.d.ts').CleanupTaskWorktreeResult} */
  const result = {
    merged: false,
    gitlinkCommitted: false,
    worktreeRemoved: false,
    branchDeleted: false,
  }
  if (skipped !== null) result.skipped = skipped
  return result
}

/**
 * `task.createdAt` → UTC YYYYMMDD（`<date>` 占位符值，创建日而非 start 时刻，
 * 容器 R2-Q3 + research B10-4 裁定）。
 * @param {string} iso createdAt ISO 时间戳
 * @returns {string | null} 非法日期返回 null
 */
function utcDateCompact(iso) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${date.getUTCFullYear()}${month}${day}`
}

/**
 * worktree 目录与 git 注册一致性探测（doctor 只读消费，design §7/§1）：
 * 扫描 `.workloom/worktree/` 两层布局（`<task-id>/` 与 `<task-id>/<pkg>/`），
 * 与根仓及配置声明 git 子仓的 `git worktree list --porcelain` 注册集比对。
 * 同步（doctor 收集链同步）；非 git 项目返回空结果（worktree 生命周期不可用，
 * 由 config/start 检查负责）。只读：不 prune、不删除任何路径。
 * @param {string} root 项目根
 * @param {import('./config.d.ts').WorkloomConfig} config 项目配置（声明 git 子仓）
 * @returns {[Error | null, {unregistered: string[], missing: string[]} | null]}
 *   unregistered = 目录在但未注册（项目根相对路径）；
 *   missing = 注册在但目录失或 prunable（项目根相对路径）
 */
export function scanWorktreeConsistencySync(root, config) {
  /** @type {Map<string, {prunable: boolean}>} 注册集（resolve 后的绝对路径 → 状态） */
  const registered = new Map()
  const [rootListErr, rootEntries] = gitWorktreeListSync(root)
  if (rootListErr !== null || rootEntries === null) {
    const detail = errText(/** @type {Error & {stderr?: string}} */ (rootListErr ?? new Error('empty worktree list')))
    if (/not a git repository/.test(detail)) {
      // 非 git 项目：worktree 生命周期不可用，一致性检查无意义 → 空结果跳过。
      return [null, { unregistered: [], missing: [] }]
    }
    return [wtErr(`cannot list worktrees at ${root}: ${detail}`), null]
  }
  for (const entry of rootEntries) {
    registered.set(resolve(entry.path), { prunable: entry.prunable })
  }
  // 配置声明的 git 子仓（sub/submodule）的 worktree 注册在子仓自身列表下（§A5）。
  for (const pkg of Object.values(config.packages)) {
    if (pkg.git !== true) continue
    const pkgDir = resolve(root, pkg.path)
    if (!existsSync(pkgDir)) continue
    const [pkgErr, pkgEntries] = gitWorktreeListSync(pkgDir)
    if (pkgErr !== null || pkgEntries === null) continue // 子仓探测失败不阻断（start 侧 fail loud）
    for (const entry of pkgEntries) {
      registered.set(resolve(entry.path), { prunable: entry.prunable })
    }
  }

  const wtRoot = resolve(root, WORKLOOM_DIR, WORKTREE_DIR)
  /** @type {string[]} */
  const unregistered = []
  /** @type {string[]} */
  const missing = []
  /**
   * 项目根相对路径（展示用）。
   * @param {string} absPath 绝对路径
   * @returns {string}
   */
  const toRel = (absPath) => relative(root, absPath) || '.'

  // 注册在但目录失 / git 标记 prunable → 提示人工 `git worktree prune`（不自动修）。
  for (const [absPath, state] of registered) {
    if (absPath !== wtRoot && !absPath.startsWith(wtRoot + sep)) continue
    if (state.prunable || !existsSync(absPath)) missing.push(toRel(absPath))
  }

  // 目录在但未注册：两层布局扫描。level1 已注册 = root 布局 worktree（不再下钻，
  // 其检出子目录天然不注册）；level1 未注册时按容器（子级为 package worktree）或
  // 残留目录判定——任一子级已注册则 level1 视为容器不报。
  if (existsSync(wtRoot)) {
    if (!isDirectory(wtRoot)) {
      // `.workloom/worktree` 是普通文件等异常占位 → 直接报未注册。
      unregistered.push(toRel(wtRoot))
    } else {
      for (const name of readdirSync(wtRoot)) {
        const level1 = join(wtRoot, name)
        if (!isDirectory(level1)) {
          // 顶层残留文件（如 worktree 路径被文件占用）→ 未注册。
          unregistered.push(toRel(level1))
          continue
        }
        if (registered.has(resolve(level1))) continue // root 布局：整棵已注册
        const children = listSubdirectories(level1)
        const childRegistered = children.some((child) => registered.has(resolve(level1, child)))
        if (!childRegistered) {
          // 空目录 / 无任何已注册子级 → 残留（含空目录，§A1 的 add 静默复用盲区）。
          unregistered.push(toRel(level1))
        }
        for (const child of children) {
          if (!registered.has(resolve(level1, child))) unregistered.push(toRel(join(level1, child)))
        }
      }
    }
  }
  return [null, { unregistered, missing }]
}

/**
 * 目录判定（内部，doctor 探测用）：stat 失败（不存在/竞态）按非目录处理。
 * @param {string} target 路径
 * @returns {boolean}
 */
function isDirectory(target) {
  try {
    return statSync(target).isDirectory()
  } catch {
    return false
  }
}

/**
 * 列出子目录名（内部，doctor 探测用）：读取失败返回空数组。
 * @param {string} dir 目录
 * @returns {string[]}
 */
function listSubdirectories(dir) {
  try {
    return readdirSync(dir).filter((child) => isDirectory(join(dir, child)))
  } catch {
    return []
  }
}
