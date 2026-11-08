/**
 * worktree 生命周期编排（TypeScript）：任务 worktree 的创建（含幂等复用）、
 * 归档清理（merge/rebase 整合 + gitlink 联动 + 注册删除）与仓解析、分支名渲染。
 *
 * 设计意图：
 * - 与整合原语（worktree-integrate）和 setup 配置执行器（setup-executor）拆分：
 *   本模块只编排「何时做」，原语层的「怎么做」在 integrate，命令执行在 setup 执行器；
 * - start 侧任一步失败即中止（零部分状态）；archive 清理失败即阻断归档，
 *   中段失败容忍（已 rebase 跳过 rebase、已 merged 跳过合并，幂等续做）；
 * - 运行时文案英文；注释中文。
 */
import { existsSync, readFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
// git 查询面与集成操作面已拆分（git-query / git-ops）。
import { gitBranchExists, gitCheckRefFormat, gitConfig, gitHasMergeHead, gitHasRebaseHead, gitIsAncestor, gitRevParse, gitStatusSync, gitWorktreeList, } from "./git-query.js";
import { gitBranchDelete, gitMerge, gitMergeAbort, gitMergeFfOnly, gitRebase, gitRebaseAbort, gitWorktreeAdd, gitWorktreePrune, gitWorktreeRemove, } from "./git-ops.js";
import { WORKLOOM_DIR } from './locate.js';
import { runPackageSetup } from "./setup-executor.js";
import { DELETE_BRANCH_MODES, INTEGRATE_MODES, MERGE_MODES, REBASE_MODES, WORKTREE_DIR, assertMainHeadOnBaseBranch, errCode, errText, syncGitlink, wtErr, } from "./worktree-integrate.js";
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
    const entry = config.packages[pkg];
    if (entry === undefined) {
        const declared = Object.keys(config.packages);
        return [
            wtErr(`unknown package ${JSON.stringify(pkg)} (declared: ${declared.length > 0 ? declared.join(', ') : 'none'}); ` +
                'declare it under "packages" in .workloom/config.json (run workloom-packages-scan to generate the list)'),
            null,
        ];
    }
    const candidate = resolve(root, entry.path);
    if (entry.git === true) {
        const [insideErr, inside] = await gitRevParse(candidate, ['--is-inside-work-tree']);
        if (insideErr !== null || inside !== 'true') {
            return [
                wtErr(`package ${JSON.stringify(pkg)} is declared git: true but ${entry.path} is not a git working tree ` +
                    '(fix the packages entry in .workloom/config.json)'),
                null,
            ];
        }
        const subPath = relative(root, candidate);
        const [cfgErr, matches] = await gitConfig(root, [
            '-f',
            '.gitmodules',
            '--get-regexp',
            '\\.path$',
        ]);
        if (cfgErr !== null)
            return [wtErr(`cannot read .gitmodules: ${errText(cfgErr)}`), null];
        if (matches === null)
            return [wtErr('cannot read .gitmodules: empty output'), null];
        const registered = matches
            .split('\n')
            .some((line) => line !== '' && line.slice(line.indexOf(' ') + 1).trim() === subPath);
        return [null, { repoRoot: candidate, kind: registered ? 'submodule' : 'sub', subPath }];
    }
    const [rootInsideErr, rootInside] = await gitRevParse(root, ['--is-inside-work-tree']);
    if (rootInsideErr !== null || rootInside !== 'true') {
        return [
            wtErr(`project is not a git working tree at ${root}; start created no worktree — ` +
                'set worktree.enabled=false to opt out'),
            null,
        ];
    }
    return [null, { repoRoot: root, kind: 'root' }];
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
        .replaceAll('<date>', ctx.dateYYYYMMDD);
    const [refErr] = await gitCheckRefFormat(root, name);
    if (refErr !== null) {
        return [
            wtErr(`branch name ${JSON.stringify(name)} rendered from template ${JSON.stringify(template)} ` +
                `is not a valid git ref: ${errText(refErr)}`),
            null,
        ];
    }
    return [null, name];
}
/**
 * start 侧创建任务 worktree（design §3.3）：任一失败返回 err，调用方在 status
 * 写盘前中止（零部分状态）；成功结果的 worktreePath 为项目根相对路径（S1-Q1）。
 * worktree 创建或幂等复用成功后执行 packages.<name>.setup（PRD R3-R6），失败即
 * 中止 start 并保留现场；重跑 start 走复用路径重新准备以自愈。
 * @param {string} root 项目根
 * @param {import('../task/storage/index.ts').TaskRecord} task 任务记录（package/parent/createdAt/name）
 * @param {string} taskRelPath 任务目录相对 .workloom 的路径
 * @param {import('./config.d.ts').WorkloomConfig} config 项目配置
 * @returns {Promise<[Error | null, import('./worktree.d.ts').CreateTaskWorktreeResult | null]>}
 */
export async function createTaskWorktree(root, task, taskRelPath, config) {
    const pkg = task.package;
    // 1. package → 仓解析（非 git / 配置与磁盘不符 → 直接拒绝）。
    const [repoErr, repo] = await resolveTaskRepo(root, config, pkg);
    if (repoErr !== null || repo === null) {
        return [repoErr ?? wtErr('package resolution returned no repository'), null];
    }
    const repoRoot = repo.repoRoot;
    // 2. unborn 探测：`rev-parse --verify HEAD` exit 128 = 仓库还没有任何 commit（§A8）。
    const [headErr] = await gitRevParse(repoRoot, ['--verify', 'HEAD']);
    if (headErr !== null) {
        if (headErr.code === 128) {
            return [wtErr(`repository has no commits at ${repoRoot}`), null];
        }
        return [wtErr(`cannot read HEAD at ${repoRoot}: ${errText(headErr)}`), null];
    }
    // 3. detached 探测：`--abbrev-ref HEAD` 输出 HEAD 即 detached（§A8；不能只用
    // branch --show-current——unborn 场景它返回分支名）。
    const [curErr, currentBranch] = await gitRevParse(repoRoot, ['--abbrev-ref', 'HEAD']);
    if (curErr !== null || currentBranch === null) {
        return [
            wtErr(curErr !== null
                ? `cannot determine current branch at ${repoRoot}: ${errText(curErr)}`
                : `cannot determine current branch at ${repoRoot}: empty rev-parse output`),
            null,
        ];
    }
    if (currentBranch === 'HEAD') {
        return [wtErr(`HEAD is detached at ${repoRoot}; check out a branch before start`), null];
    }
    // 4. base 分支：子任务优先取父任务已有分支（stacked，容器 R1-Q6），否则当前分支。
    let baseBranch = currentBranch;
    if (typeof task.parent === 'string' && task.parent !== '') {
        let parentJson;
        try {
            parentJson = JSON.parse(readFileSync(join(root, WORKLOOM_DIR, task.parent, 'task.json'), 'utf8'));
        }
        catch (error) {
            return [wtErr(`cannot read parent task ${JSON.stringify(task.parent)} task.json: ${String(error)}`), null];
        }
        if (typeof parentJson.branch === 'string' && parentJson.branch !== '') {
            baseBranch = parentJson.branch;
        }
    }
    // 5. 分支名渲染 + ref 校验（非法渲染结果 fail loud，R5-Q3）。
    const taskId = basename(taskRelPath);
    const dateYYYYMMDD = utcDateCompact(task.createdAt);
    if (dateYYYYMMDD === null) {
        return [wtErr(`task createdAt is not a valid date: ${JSON.stringify(task.createdAt)}`), null];
    }
    const [renderErr, branch] = await renderBranchName(config.worktree.branchTemplate, { taskId, taskSlug: task.name, dateYYYYMMDD }, root);
    if (renderErr !== null)
        return [renderErr, null];
    if (branch === null)
        return [wtErr('branch rendering returned no name'), null];
    // 6. worktree 目标：root 仓 → `.workloom/.runtime/worktrees/<task-id>`；子仓/submodule →
    //    再嵌套 package 名（布局为 PRD R4 裁定）。
    const relWorktreePath = join(WORKLOOM_DIR, WORKTREE_DIR, taskId, ...(repo.kind === 'root' ? [] : [String(task.package)]));
    const targetAbs = resolve(root, relWorktreePath);
    // 依赖准备参数：命令 cwd 与 <worktree> 取 worktree 根；<source-checkout> 取
    // 仓解析结果（root 布局 = 项目根，sub/submodule = package 目录）。
    const setupOptions = { pkg, config, worktreeAbs: targetAbs, sourceCheckout: repoRoot };
    // 7. 残留前置探测（§A1/§A3）：add 会静默复用空目录、prune 不删目录——不能依赖
    //    add 退出码。目录存在 → prune 元数据 → 查注册：命中本任务分支则幂等复用。
    if (existsSync(targetAbs)) {
        const [pruneErr] = await gitWorktreePrune(repoRoot);
        if (pruneErr !== null)
            return [wtErr(`worktree prune failed: ${errText(pruneErr)}`), null];
        const [listErr, entries] = await gitWorktreeList(repoRoot);
        if (listErr !== null)
            return [wtErr(`worktree list failed: ${errText(listErr)}`), null];
        if (entries === null)
            return [wtErr('worktree list returned no entries'), null];
        const entry = entries.find((item) => resolve(item.path) === targetAbs);
        if (entry !== undefined) {
            if (entry.branch === branch) {
                // 幂等复用同样执行 setup（PRD R3）：否则首次准备失败后重跑永远无法自愈。
                const setupErr = await runPackageSetup(setupOptions);
                if (setupErr !== null)
                    return [setupErr, null];
                return [null, { branch, baseBranch, worktreePath: relWorktreePath }];
            }
            return [
                wtErr(`target path ${JSON.stringify(relWorktreePath)} is already a registered worktree on branch ` +
                    `${JSON.stringify(entry.branch ?? '(detached)')}, expected ${JSON.stringify(branch)}; ` +
                    'inspect and remove it manually'),
                null,
            ];
        }
        return [
            wtErr(`target path ${JSON.stringify(relWorktreePath)} exists but is not a registered worktree; ` +
                'inspect and remove it manually'),
            null,
        ];
    }
    // 8. 分支处置：已存在 → 复用 add（被其他 worktree 检出时 git 报 already checked
    //    out，文案透传）；不存在 → `add -b <branch> <path> <base>` 新建。
    const [branchCheckErr, branchExistsNow] = await gitBranchExists(repoRoot, branch);
    if (branchCheckErr !== null) {
        return [wtErr(`cannot check branch ${JSON.stringify(branch)}: ${errText(branchCheckErr)}`), null];
    }
    const [addErr] = branchExistsNow === true
        ? await gitWorktreeAdd(repoRoot, targetAbs, branch)
        : await gitWorktreeAdd(repoRoot, targetAbs, branch, baseBranch);
    // 9. 失败回滚（§A1 硬事实）：`add -b` 在校验目标路径之前就创建分支，失败会遗留
    //    游离分支 → 仅当分支由本次 add 新建时 `branch -D` 兜底删除，err 附回滚说明。
    if (addErr !== null) {
        if (branchExistsNow !== true) {
            const [recheckErr, residual] = await gitBranchExists(repoRoot, branch);
            if (recheckErr === null && residual === true) {
                const [delErr] = await gitBranchDelete(repoRoot, branch);
                if (delErr === null) {
                    return [
                        wtErr(`worktree add failed (${errCode(addErr)}): ${errText(addErr)}; ` +
                            `rollback: deleted residual branch ${JSON.stringify(branch)} created by the failed add`),
                        null,
                    ];
                }
                return [
                    wtErr(`worktree add failed (${errCode(addErr)}): ${errText(addErr)}; ` +
                        `rollback of residual branch ${JSON.stringify(branch)} also failed: ${errText(delErr)}`),
                    null,
                ];
            }
        }
        return [wtErr(`worktree add failed (${errCode(addErr)}): ${errText(addErr)}`), null];
    }
    // 10. 依赖准备（PRD R3-R6）：新建路径同样在返回成功前执行；失败即中止 start，
    //     但保留 worktree 与分支（现场供排查，重跑走复用路径自愈）。
    const setupErr = await runPackageSetup(setupOptions);
    if (setupErr !== null)
        return [setupErr, null];
    return [null, { branch, baseBranch, worktreePath: relWorktreePath }];
}
/**
 * archive 侧清理任务 worktree（design §3.4）：失败即阻断归档（调用方不落档）；
 * 结果并入 archive 回执（rebased/merged/gitlinkCommitted/worktreeRemoved/branchDeleted/skipped）。
 * 中段失败容忍（R5-Q2）：本函数成功后的 rename 失败接受为中间态，重跑时
 * 已 rebase 跳过 rebase、已 merged 跳过合并、gitlink 无 diff 跳过提交、无注册
 * 跳过 remove（幂等续做）。
 * @param {string} root 项目根
 * @param {import('../task/storage/index.ts').TaskRecord} task 任务记录
 * @param {import('./config.d.ts').WorkloomConfig} config 项目配置
 * @returns {Promise<[Error | null, import('./worktree.d.ts').CleanupTaskWorktreeResult | null]>}
 */
export async function cleanupTaskWorktree(root, task, config) {
    // 1. 无 worktree 任务（存量/关闭态）→ no-op。
    if (typeof task.worktree_path !== 'string' || task.worktree_path === '') {
        return [null, emptyResult('no-worktree')];
    }
    // 2. manual 策略 → 不动 worktree/分支。
    if (config.worktree.cleanup === 'manual') {
        return [null, emptyResult('manual')];
    }
    // 3. 仓解析 + 脏检查：无条件拒绝（force 不豁免——调用方不传 force，结构上无旁路）。
    const [repoErr, repo] = await resolveTaskRepo(root, config, task.package);
    if (repoErr !== null || repo === null) {
        return [repoErr ?? wtErr('package resolution returned no repository'), null];
    }
    const repoRoot = repo.repoRoot;
    const wtAbs = resolve(root, task.worktree_path);
    const result = emptyResult(null);
    if (existsSync(wtAbs)) {
        const [statusErr, status] = gitStatusSync(wtAbs);
        if (statusErr !== null) {
            return [wtErr(`cannot read worktree status at ${wtAbs}: ${errText(statusErr)}`), null];
        }
        if (status !== '') {
            return [
                wtErr(`worktree ${JSON.stringify(task.worktree_path)} has uncommitted changes; ` +
                    'commit or discard them first (no force bypass)'),
                null,
            ];
        }
    }
    // 4. 主检出 HEAD == base_branch 校验（merge 与 rebase 整合路径共用；git 自身不拦
    //    detached，§A7.3 → 唯一防线）。
    if (INTEGRATE_MODES.has(config.worktree.cleanup)) {
        const headCheckErr = await assertMainHeadOnBaseBranch(repoRoot, task);
        if (headCheckErr !== null)
            return [headCheckErr, null];
    }
    if (MERGE_MODES.has(config.worktree.cleanup)) {
        // 4a. 已合并判定（祖先关系与 ff/非 ff 无关，S1-Q2）→ 幂等重跑直接跳过合并。
        const [ancErr, alreadyMerged] = await gitIsAncestor(repoRoot, task.branch, 'HEAD');
        if (ancErr !== null) {
            return [wtErr(`cannot check merge state of ${JSON.stringify(task.branch)}: ${errText(ancErr)}`), null];
        }
        if (alreadyMerged !== true) {
            // 4b. 合并 + 三态判别：exit code 不可靠（冲突/untracked 同为 1），以 MERGE_HEAD
            //     为唯一判据——存在 → 冲突，abort 恢复现场后返回冲突通知（不落档）；
            //     不存在 → untracked/脏拒绝或身份缺失（§A7.1/A7.5），现场原样保留。
            const [mergeErr] = await gitMerge(repoRoot, task.branch);
            if (mergeErr !== null) {
                const [mhErr, inMerge] = await gitHasMergeHead(repoRoot);
                if (mhErr !== null) {
                    return [wtErr(`cannot probe MERGE_HEAD at ${repoRoot}: ${errText(mhErr)}`), null];
                }
                if (inMerge === true) {
                    const [abortErr] = await gitMergeAbort(repoRoot);
                    if (abortErr !== null) {
                        return [
                            wtErr(`merge conflict while merging ${JSON.stringify(task.branch)} but abort failed at ` +
                                `${repoRoot}: ${errText(abortErr)}`),
                            null,
                        ];
                    }
                    return [
                        wtErr(`merge conflict while merging ${JSON.stringify(task.branch)} into ` +
                            `${JSON.stringify(task.base_branch)} at ${repoRoot}; resolve manually: ` +
                            `git merge ${task.branch} in ${repoRoot}, then re-run archive`),
                        null,
                    ];
                }
                return [
                    wtErr(`merge of ${JSON.stringify(task.branch)} failed at ${repoRoot} (${errCode(mergeErr)}): ` +
                        `${errText(mergeErr)}`),
                    null,
                ];
            }
            result.merged = true;
        }
    }
    if (REBASE_MODES.has(config.worktree.cleanup)) {
        // 5a. 已 rebase 判定（base 已是任务分支祖先，含相等）→ 幂等重跑跳过 rebase。
        const [rebasedErr, alreadyRebased] = await gitIsAncestor(repoRoot, task.base_branch, task.branch);
        if (rebasedErr !== null) {
            return [
                wtErr(`cannot check rebase state of ${JSON.stringify(task.branch)} against ` +
                    `${JSON.stringify(task.base_branch)}: ${errText(rebasedErr)}`),
                null,
            ];
        }
        if (alreadyRebased !== true) {
            // 5b. 任务 worktree 内 rebase 到 base 之上（任务分支检出于此，git 不允许跨检出
            //     rebase）。失败三态判别：exit code 不可靠（冲突/untracked 拒绝同为 1），以
            //     REBASE_HEAD 中断态为唯一判据——存在 → 冲突，abort 恢复现场后返回手工解决
            //     通知（不落档）；不存在 → 身份缺失等非中断失败（§A7.5），现场原样保留。
            const [rebaseErr] = await gitRebase(wtAbs, task.base_branch);
            if (rebaseErr !== null) {
                const [rhErr, interrupted] = await gitHasRebaseHead(wtAbs);
                if (rhErr !== null) {
                    return [wtErr(`cannot probe REBASE_HEAD at ${wtAbs}: ${errText(rhErr)}`), null];
                }
                if (interrupted === true) {
                    const [abortErr] = await gitRebaseAbort(wtAbs);
                    if (abortErr !== null) {
                        return [
                            wtErr(`rebase conflict while rebasing ${JSON.stringify(task.branch)} but abort failed at ` +
                                `${wtAbs}: ${errText(abortErr)}`),
                            null,
                        ];
                    }
                    return [
                        wtErr(`rebase conflict while rebasing ${JSON.stringify(task.branch)} onto ` +
                            `${JSON.stringify(task.base_branch)}; resolve manually: run ` +
                            `\`git rebase ${task.base_branch}\` in the task worktree ${wtAbs}, ` +
                            'continue it, then re-run archive'),
                        null,
                    ];
                }
                return [
                    wtErr(`rebase of ${JSON.stringify(task.branch)} failed at ${wtAbs} (${errCode(rebaseErr)}): ` +
                        `${errText(rebaseErr)}`),
                    null,
                ];
            }
            result.rebased = true;
        }
        // 5c. 已合入判定（任务分支已是主检出 HEAD 祖先）→ 幂等重跑跳过 ff 合并。
        const [mergedErr, alreadyMerged] = await gitIsAncestor(repoRoot, task.branch, 'HEAD');
        if (mergedErr !== null) {
            return [wtErr(`cannot check merge state of ${JSON.stringify(task.branch)}: ${errText(mergedErr)}`), null];
        }
        if (alreadyMerged !== true) {
            // 5d. 主检出 ff-only 合入（线性历史）：失败 fail loud 透传（ff 拒绝不建合并态，
            //     不 abort 不重试——重跑归档重判祖先关系并再次 rebase，天然自愈）。
            const [ffErr] = await gitMergeFfOnly(repoRoot, task.branch);
            if (ffErr !== null) {
                return [
                    wtErr(`fast-forward merge of ${JSON.stringify(task.branch)} failed at ${repoRoot} (${errCode(ffErr)}): ` +
                        `${errText(ffErr)}`),
                    null,
                ];
            }
            result.merged = true;
        }
    }
    // 5e. submodule gitlink 联动（仅注册 submodule；merge 与 rebase 整合路径共用；
    //     probe 幂等，与是否跳过整合无关——覆盖「整合成功但提交失败」的重跑）。
    //     权威对：根仓 `HEAD:<path>` vs 子仓主检出 HEAD（禁用 `rev-parse <path>`，
    //     原样回显陷阱 §A6）。
    if (repo.kind === 'submodule' && INTEGRATE_MODES.has(config.worktree.cleanup)) {
        const [linkErr, committed] = await syncGitlink(root, repo, task);
        if (linkErr !== null || committed === null) {
            return [linkErr ?? wtErr('gitlink sync returned no result'), null];
        }
        result.gitlinkCommitted = committed;
    }
    // 6. worktree 删除：先确认注册再 remove（未注册但目录存在 → 残留非法，人工处理；
    //    目录与注册均无 → 跳过，中段失败重跑幂等，R5-Q2）。locked → err 透传（不自动 -f -f）。
    const [listErr, entries] = await gitWorktreeList(repoRoot);
    if (listErr !== null)
        return [wtErr(`worktree list failed: ${errText(listErr)}`), null];
    if (entries === null)
        return [wtErr('worktree list returned no entries'), null];
    const entry = entries.find((item) => resolve(item.path) === wtAbs);
    if (entry !== undefined) {
        const [removeErr] = await gitWorktreeRemove(repoRoot, wtAbs);
        if (removeErr !== null) {
            return [
                wtErr(`worktree remove failed for ${JSON.stringify(task.worktree_path)}: ${errText(removeErr)}`),
                null,
            ];
        }
        result.worktreeRemoved = true;
    }
    else if (existsSync(wtAbs)) {
        return [
            wtErr(`path ${JSON.stringify(task.worktree_path)} exists but is not a registered worktree; ` +
                'inspect and remove it manually'),
            null,
        ];
    }
    // 7. delete 语义模式（merge-delete-branch / rebase-delete-branch）才删分支；顺序必须
    //    在 remove 之后（分支被检出时删除互锁，§A2）。
    if (DELETE_BRANCH_MODES.has(config.worktree.cleanup)) {
        const [delErr] = await gitBranchDelete(repoRoot, task.branch);
        if (delErr !== null) {
            return [wtErr(`branch delete failed for ${JSON.stringify(task.branch)}: ${errText(delErr)}`), null];
        }
        result.branchDeleted = true;
    }
    return [null, result];
}
/**
 * 组装清理结果（内部）：统一五个布尔字段，skipped 仅在提前跳过时携带。
 * @param {'no-worktree' | 'manual' | null} skipped 提前跳过原因（未跳过传 null）
 * @returns {import('./worktree.d.ts').CleanupTaskWorktreeResult}
 */
function emptyResult(skipped) {
    const result = {
        rebased: false,
        merged: false,
        gitlinkCommitted: false,
        worktreeRemoved: false,
        branchDeleted: false,
    };
    if (skipped !== null)
        result.skipped = skipped;
    return result;
}
/**
 * `task.createdAt` → UTC YYYYMMDD（`<date>` 占位符值，创建日而非 start 时刻，
 * 容器 R2-Q3 + research B10-4 裁定）。
 * @param {string} iso createdAt ISO 时间戳
 * @returns {string | null} 非法日期返回 null
 */
function utcDateCompact(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime()))
        return null;
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${date.getUTCFullYear()}${month}${day}`;
}
//# sourceMappingURL=worktree-lifecycle.js.map