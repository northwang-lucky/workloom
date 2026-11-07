/**
 * task-storage：任务记录存储层（TypeScript，自旧 task-store 拆分）。
 *
 * 设计意图：
 * - 本模块只承载 task.json 的物理读写：读取（结构化归一，不解释 mode/stage
 *   值域）、列表、创建、归档物理移动、hooks 与 file-atomic 原子写锁；
 * - 值域解释与兼容读归 state-machine 的 readTaskView 单点；生命周期迁移判断
 *   归状态机与编排层（task-ops）；派发记录与 override 留痕归 dispatch-records；
 * - 数据布局约定：.workloom/tasks/{MM-DD-slug}/task.json（snake_case 字段）；
 * - 公开函数返回 [err, value] 命名元组，内部错误统一转换为 Error；
 * - hooks 与 git 失败只收集 WARNING（console.warn），不阻塞主操作；
 * - 路径一律经 locate.insideWorkloom 防越界。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync, } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { writeFileAtomic } from '../workspace/file-atomic.js';
import { findWorkloomRoot, insideWorkloom } from '../workspace/locate.js';
import { loadConfig } from "../workspace/config-load.js";
import { PRD_SECTIONS } from "./prd-structure.js";
import { createCaseRecord } from "./case-structure.js";
/** 错误消息前缀。 */
const ERR_PREFIX = 'workloom task';
/** slug 最大长度（目录名的一部分）。 */
const SLUG_MAX_LENGTH = 40;
/** 显式 slug 的合法形态：小写字母数字段以单连字符相连，首尾不带连字符。 */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/**
 * slug 自带日期前缀的形态（MM-DD，月 01-12、日 01-31，后接连字符或到此为止）。
 * 目录名的日期段由 createTask 生成，slug 再带一段就得到 `10-30-10-30-x` 这种双前缀。
 */
const SLUG_DATE_PREFIX_PATTERN = /^(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])(?:-|$)/;
/** 两位数字补零宽度。 */
const PAD_WIDTH = 2;
/** task.json 写入缩进。 */
const JSON_INDENT = 2;
/** hooks 注入的 task.json 环境变量名。 */
const TASK_JSON_ENV = 'TASK_JSON_PATH';
/** 活动任务目录名的日期前缀（MM-DD-）；归档目录名只保留其后的 slug（task.name）。 */
const TASK_DIR_DATE_PREFIX = /^(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])-/;
/** 目录名常量。 */
export const DIR_NAMES = Object.freeze({
    tasks: 'tasks',
    archive: 'archive',
});
/** 文件名常量。 */
export const FILE_NAMES = Object.freeze({
    taskJson: 'task.json',
    prd: 'prd.md',
    plan: 'plan.md',
    implementLog: 'implement.jsonl',
    checkLog: 'check.jsonl',
});
/** hooks 事件名（task.json.hooks 的键；旧格式任务缺省时统一补齐为空数组）。 */
const HOOK_KEYS = Object.freeze(['after_create', 'after_start', 'after_finish', 'after_archive']);
/**
 * 任务状态枚举（task.json.status 取值）。
 */
export const TaskStatus = Object.freeze({
    PLANNING: 'planning',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
});
/**
 * 优先级枚举（task.json.priority 取值）。
 */
export const TaskPriority = Object.freeze({
    P0: 'P0',
    P1: 'P1',
    P2: 'P2',
    P3: 'P3',
});
/** 默认优先级。 */
const DEFAULT_PRIORITY = TaskPriority.P2;
/** 合法优先级集合（校验用）。 */
const PRIORITY_SET = new Set(Object.values(TaskPriority));
/* ---------------- 读取与写入（物理层） ---------------- */
/**
 * 解析并校验项目根（向上查找 .workloom）。
 * @param root 起始目录（项目根或其子目录）
 * @returns 项目根绝对路径
 */
export function requireProjectRoot(root) {
    const found = findWorkloomRoot(root);
    if (!found) {
        throw new Error(`${ERR_PREFIX}: no .workloom directory found (searched up from ${root})`);
    }
    return found.root;
}
/**
 * 读取任务原始记录：task.json 缺失或损坏返回 err；成功时对象附带 taskRelPath。
 * 结构化归一只补默认值；mode/stage/status 值域解释归 state-machine 的兼容读。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @returns [err, record]
 */
export function readTaskRecord(root, taskRelPath) {
    try {
        return [null, requireTaskRecord(root, taskRelPath)];
    }
    catch (error) {
        return [toError(error), null];
    }
}
/**
 * 读取任务原始记录并确保非空（失败抛错；存储层与编排层共用的读取入口）。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @returns 归一后的原始记录（含 taskRelPath）
 */
export function requireTaskRecord(root, taskRelPath) {
    const file = join(insideWorkloom(root, taskRelPath), FILE_NAMES.taskJson);
    let raw;
    try {
        raw = readFileSync(file, 'utf8');
    }
    catch (error) {
        if (isEnoent(error)) {
            throw new Error(`${ERR_PREFIX}: task.json missing: ${taskRelPath}`, { cause: error });
        }
        throw error;
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch (error) {
        throw new Error(`${ERR_PREFIX}: failed to parse task.json: ${taskRelPath}: ${String(error)}`, {
            cause: error,
        });
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error(`${ERR_PREFIX}: task.json is not an object: ${taskRelPath}`);
    }
    return normalizeTaskRecord(parsed, taskRelPath);
}
/**
 * 归一化 task.json 记录：旧格式任务缺 hooks 字段时补齐空数组，
 * 保证 create/start/finish/archive 各 hook 调用点对旧数据安全；
 * 缺 check/overrides/dispatches 字段时补 null/空数组，保证门禁读取对旧数据安全；
 * mode/stage/status 保持落盘原值（缺省与旧值的映射归 readTaskView 兼容读单点）。
 * @param parsed task.json 解析结果
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @returns 归一化后的记录
 */
function normalizeTaskRecord(parsed, taskRelPath) {
    const rawHooks = parsed.hooks;
    const hooks = {
        after_create: [],
        after_start: [],
        after_finish: [],
        after_archive: [],
    };
    for (const key of HOOK_KEYS) {
        const value = rawHooks?.[key];
        hooks[key] = Array.isArray(value) ? value : [];
    }
    const rawCase = parsed.case;
    return {
        // 旧 grilling 等历史字段经展开原样透传（惰性历史数据，不参与新语义、不迁移）；
        // 旧凭据里的 prdHash 在下一次 confirm 覆盖时自然丢弃（读时容忍，不迁移）。
        ...parsed,
        status: typeof parsed.status === 'string' ? parsed.status : '',
        priority: typeof parsed.priority === 'string' ? parsed.priority : '',
        ...(typeof parsed.mode === 'string' ? { mode: parsed.mode } : {}),
        ...(typeof parsed.stage === 'string' ? { stage: parsed.stage } : {}),
        hooks,
        check: parsed.check ?? null,
        alignment: parsed.alignment ?? null,
        planConfirmation: parsed.planConfirmation ?? null,
        // CASE 生命周期记录：缺字段读 null；有记录补默认键并原样保留历史字段。
        case: typeof rawCase === 'object' && rawCase !== null
            ? createCaseRecord(rawCase.required === true, rawCase)
            : null,
        overrides: Array.isArray(parsed.overrides) ? parsed.overrides : [],
        // 派发记录归一化：存量无 status 字段视为 completed（读取视图，不迁移落盘）。
        dispatches: Array.isArray(parsed.dispatches)
            ? parsed.dispatches.map(normalizeDispatchRecord)
            : [],
        // parent/children 兜底：旧任务缺字段时补 null/空数组，保证父子校验与联动对旧数据安全。
        parent: parsed.parent ?? null,
        children: Array.isArray(parsed.children) ? parsed.children : [],
        planReview: parsed.planReview,
        autonomy: parsed.autonomy,
        // 自治度切换留痕：缺字段/形状非法补空数组（只读视图，不写回）。
        autonomyLog: Array.isArray(parsed.autonomyLog) ? parsed.autonomyLog : [],
        taskRelPath,
    };
}
/**
 * 归一化单条派发记录（内部）：存量无 status 字段的旧记录读取时视为 completed
 * （不迁移落盘——只改读取视图，不改文件）；有 status 的按原样保留。
 */
function normalizeDispatchRecord(entry) {
    if (entry === null || typeof entry !== 'object' || entry.status !== undefined) {
        return entry;
    }
    return { ...entry, status: 'completed' };
}
/**
 * 序列化并原子写入 task.json（常规写口；file-atomic 临时文件 + rename 替换，
 * 并发写串行化由原子替换保证）。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param record 任务记录（可含 taskRelPath，落盘前剔除）
 */
export function writeTaskRecord(root, taskRelPath, record) {
    writeFileAtomic(join(insideWorkloom(root, taskRelPath), FILE_NAMES.taskJson), serializeTask(record));
}
/**
 * 序列化并原子写入指定目录内的 task.json（归档位置写回等目录已知的场景）。
 * @param taskDir 任务目录绝对路径
 * @param record 任务记录
 */
export function writeTaskRecordToDir(taskDir, record) {
    writeFileAtomic(join(taskDir, FILE_NAMES.taskJson), serializeTask(record));
}
/**
 * 序列化任务记录为落盘文本（内部；剔除运行时附带的 taskRelPath）。
 * @param record 任务记录
 * @returns task.json 全文（含尾换行）
 */
function serializeTask(record) {
    return `${JSON.stringify(stripTaskPath(record), null, JSON_INDENT)}\n`;
}
/**
 * 剔除记录上附带的 taskRelPath，得到可落盘的纯记录（内部）。
 * @param task 任务记录
 * @returns 纯记录
 */
function stripTaskPath(task) {
    const { taskRelPath: _dropped, ...record } = task;
    return record;
}
/**
 * 读取任务目录内文件内容（缺失返回 null，其他错误透传；守卫与编排层共用）。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param fileName 文件名
 * @returns 文件全文或 null
 */
export function readTaskFileOrNull(root, taskRelPath, fileName) {
    try {
        return readFileSync(join(insideWorkloom(root, taskRelPath), fileName), 'utf8');
    }
    catch (error) {
        if (isEnoent(error))
            return null;
        throw error;
    }
}
/* ---------------- slug 与创建 ---------------- */
/**
 * 由标题生成 kebab-case slug：非字母数字转连字符、去首尾连字符、全小写、截断 40 字符。
 * @param title 任务标题
 * @returns slug
 */
export function slugify(title) {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, SLUG_MAX_LENGTH);
}
/**
 * 校验创建任务用的 slug，不合法即抛错（与 assertPriority/assertTaskMode 同风格）。
 *
 * 设计意图：目录名恒为 `{MM-DD}-{slug}`，日期段归工具，所以 slug 自带日期前缀一律
 * 拒绝而不是静默剥离——剥离会误改 `12-25-release-notes` 这类合法命名，报错则把改写
 * 决定留给调用方。显式 slug 另需满足 kebab-case 与长度上限（超长不截断，截断会让
 * 调用方拿到的目录名与传入值不一致）；标题派生的 slug 已由 slugify 归一字符集与长度，
 * 只查日期前缀，文案指向「改传显式 slug」。
 * @param slug 待校验 slug（调用前已保证非空）
 * @param explicit true 表示调用方显式传入，false 表示由标题派生
 */
function assertValidSlug(slug, explicit) {
    if (explicit && slug.length > SLUG_MAX_LENGTH) {
        throw new Error(`${ERR_PREFIX}: slug is longer than ${SLUG_MAX_LENGTH} characters ` +
            `(${slug.length}): ${JSON.stringify(slug)}`);
    }
    if (explicit && !SLUG_PATTERN.test(slug)) {
        throw new Error(`${ERR_PREFIX}: slug must be kebab-case (lowercase letters and digits joined by ` +
            `single hyphens, no leading or trailing hyphen): ${JSON.stringify(slug)}`);
    }
    if (SLUG_DATE_PREFIX_PATTERN.test(slug)) {
        const hint = explicit ? 'pass the slug without that prefix' : 'pass an explicit slug instead';
        throw new Error(`${ERR_PREFIX}: slug must not carry a MM-DD date prefix, the task directory already ` +
            `gets one: ${JSON.stringify(slug)}; ${hint}`);
    }
}
/** 创建任务的缺省模式（值域单源在 state-machine 的 MODES.STANDARD，类型钉住字面量）。 */
const DEFAULT_CREATE_MODE = 'standard';
/** 新建任务的初始主线阶段（值域单源在 state-machine 的 STAGES.ALIGNING）。 */
const INITIAL_STAGE = 'aligning';
/** 创建缺省自治度（值域单源在 state-machine 的 AUTONOMY.MANUAL，类型钉住字面量）。 */
const DEFAULT_AUTONOMY = 'manual';
/** 合法自治度集合（值域单源在 state-machine 的 AUTONOMY；Record 形态由 tsc 守护漂移）。 */
const AUTONOMY_VALUE_SET = Object.freeze({
    manual: true,
    semi: true,
    auto: true,
});
/** 合法创建模式集合（值域单源在 state-machine 的 MODES；Record 形态由 tsc 守护漂移）。 */
const CREATE_MODE_VALUES = Object.freeze({
    light: true,
    standard: true,
    parent: true,
});
/** 生成 {MM-DD} 目录前缀（月份从 0 起，需 +1）。 */
function formatMonthDay(date) {
    return `${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}
/** 生成 {YYYY-MM} 归档前缀。 */
export function formatYearMonth(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}
/** @param value 数字 @returns 补零到两位 */
function pad2(value) {
    return String(value).padStart(PAD_WIDTH, '0');
}
/**
 * 组装新任务记录（task.json 数据，hooks 从配置播种）。
 * @param input 组装入参
 * @returns 新任务记录
 */
function buildTaskRecord(input) {
    const task = {
        id: randomUUID(),
        name: input.slug,
        title: input.params.title,
        description: input.params.description ?? '',
        status: TaskStatus.PLANNING,
        priority: input.params.priority ?? DEFAULT_PRIORITY,
        // 任务模式在创建时定死（light/standard/parent，缺省 standard），后续没有转换通道。
        mode: input.params.mode ?? DEFAULT_CREATE_MODE,
        creator: input.creator,
        assignee: '',
        // package 归属（create 传入时落值，存量直调面缺省 null；成员校验在 createTaskInternal）。
        package: input.params.package ?? null,
        branch: '',
        base_branch: '',
        createdAt: input.now,
        completedAt: null,
        parent: input.params.parent ?? null,
        children: [],
        subtasks: [],
        scope: '',
        commit: '',
        pr_url: '',
        worktree_path: '',
        relatedFiles: [],
        notes: '',
        meta: {},
        check: null,
        // CASE 生命周期（required/designSession/phase）：新建任务落 null；
        // start 完整任务时才转换（旧任务保留既有确认数据）。
        case: null,
        // PRD 内容确认（passedAt/summary）：planning 阶段经确认入口原子写入；
        // 新建任务仅落 null（旧 grilling 不再写入新任务）。
        alignment: null,
        // PLAN 内容确认（passedAt/summary）：PLAN 复核后经 target=plan confirm 写入。
        planConfirmation: null,
        overrides: [],
        // 主线阶段：新建任务显式落盘 aligning（Phase 1.1 对齐期起点）。
        stage: INITIAL_STAGE,
        // 自治度：创建参数指定，缺省 manual（切换留痕见 autonomyLog）。
        autonomy: input.params.autonomy ?? DEFAULT_AUTONOMY,
        autonomyLog: [],
        dispatches: [],
        hooks: {
            after_create: input.config.hooks.afterCreate,
            after_start: input.config.hooks.afterStart,
            after_finish: input.config.hooks.afterFinish,
            after_archive: input.config.hooks.afterArchive,
        },
    };
    return task;
}
/**
 * 生成 prd.md 骨架内容：以 `# <任务 title>` 一级标题开头，后接既有小节顺序。
 * 骨架常量 PRD_SECTIONS 在 prd-structure（placeholder 判定与骨架生成共享）。
 * @param title 任务标题（prd 首行 H1）
 * @returns prd.md 骨架全文
 */
function buildPrdContent(title) {
    return (`# ${title}\n\n` +
        PRD_SECTIONS.map((section) => `## ${section.heading}\n\n${section.placeholder}`).join('\n\n') +
        '\n');
}
/** implement/check 日志的 seed 行（无 file 字段，消费者自动跳过）。 */
const LOG_SEEDS = Object.freeze({
    implement: '{"_example": "implement event log: one JSON object per line; lines without a file field are skipped automatically"}',
    check: '{"_example": "check event log: one JSON object per line; lines without a file field are skipped automatically"}',
});
/**
 * 归一化 parent 参数为 parentRelPath（内部）。
 * 接受 `tasks/08-29-xxx`（原样）或 `08-29-xxx`（补 `tasks/` 前缀）两种形式；
 * null/undefined/空串视同未传，返回 null。
 * @param parent 原始 parent 参数
 * @returns 归一后的 parentRelPath，或 null（未传）
 */
function normalizeParentRelPath(parent) {
    if (parent === undefined || parent === null || parent === '')
        return null;
    if (parent.startsWith('tasks/'))
        return parent;
    return join(DIR_NAMES.tasks, parent);
}
/**
 * 校验 parent 任务（顺序固定，任一失败抛错，均不产生写入）。
 * ① 存在性：task.json 可读且非空；
 * ② 自引用：parentRelPath ≠ childRelPath；
 * ③ 状态：parent.status ∈ {planning, in_progress}，completed 拒绝；
 * ④ 逃逸防护：readTaskRecord 经 insideWorkloom 解析路径，越界自动抛错。
 * @param root 项目根
 * @param parentRelPath 归一后的 parentRelPath
 * @param childRelPath 新任务的 taskRelPath
 * @returns 校验通过的 parent 记录
 */
function validateParent(root, parentRelPath, childRelPath) {
    const [parentErr, parent] = readTaskRecord(root, parentRelPath);
    if (parentErr) {
        // 不可读/损坏/越界均在此拦截（readTaskRecord 经 insideWorkloom 防越界）。
        throw new Error(`${ERR_PREFIX}: parent task not found: ${parentRelPath}: ${parentErr.message}`);
    }
    if (!parent) {
        throw new Error(`${ERR_PREFIX}: parent task not found: ${parentRelPath}`);
    }
    if (parentRelPath === childRelPath) {
        throw new Error(`${ERR_PREFIX}: task cannot be its own parent: ${parentRelPath}`);
    }
    if (parent.status !== TaskStatus.PLANNING && parent.status !== TaskStatus.IN_PROGRESS) {
        throw new Error(`${ERR_PREFIX}: parent task must be planning or in_progress (current: ${parent.status})`);
    }
    return parent;
}
/** 被指向父任务归一后的 mode 值（值域单源在 state-machine 的 MODES.PARENT）。 */
const PARENT_MODE_VALUE = 'parent';
/**
 * children 反向联动（内部）：子任务创建成功后，把 childRelPath 追加到父任务
 * children（去重）、把父任务 mode 归一为 parent（写路径认定，读路径的兜底推断
 * 在 readTaskView），一次写回。父任务不可读或写回失败时抛错（消息指明「子任务
 * 已创建、父 children 未更新」，不做回滚）。
 * @param root 项目根
 * @param parentRelPath 父任务 taskRelPath
 * @param childRelPath 子任务 taskRelPath
 */
function linkChildToParent(root, parentRelPath, childRelPath) {
    const [parentErr, parent] = readTaskRecord(root, parentRelPath);
    if (parentErr || !parent) {
        throw new Error(`${ERR_PREFIX}: child task created but parent children not updated: parent task unreadable: ${parentRelPath}`);
    }
    if (!parent.children.includes(childRelPath)) {
        parent.children.push(childRelPath);
    }
    // parent 认定双路的写路径：被指向的父任务 mode 归一为 parent（旧值 full 一并升级）。
    parent.mode = PARENT_MODE_VALUE;
    try {
        writeTaskRecord(root, parentRelPath, parent);
    }
    catch (error) {
        throw new Error(`${ERR_PREFIX}: child task created but parent children not updated: ${toError(error).message}`, { cause: error });
    }
}
/**
 * 创建任务：建目录、写 task.json/prd.md/两个 jsonl，执行 after_create hooks。
 * 会话指针绑定归编排层（executeCreateTask），存储层不消费 contextKey。
 * @param root 项目根（或根下任意目录）
 * @param params 创建参数
 * @returns [err, result]
 */
export async function createTask(root, params) {
    try {
        return [null, await createTaskInternal(root, params)];
    }
    catch (error) {
        return [toError(error), null];
    }
}
/**
 * 创建任务（内部实现，失败抛错由外层转元组）。
 * @param root 项目根
 * @param params 创建参数
 * @returns 创建结果
 */
async function createTaskInternal(root, params) {
    const projectRoot = requireProjectRoot(root);
    // 显式 slug 与标题派生 slug 共用同一校验入口；空值按来源分别报错（显式空串不再
    // 误报成「标题无法派生」）。校验全部前置于任何写盘，失败即零部分状态。
    const hasExplicitSlug = params.slug !== undefined && params.slug !== null;
    const slug = hasExplicitSlug ? String(params.slug) : slugify(params.title);
    if (slug.length === 0) {
        throw new Error(hasExplicitSlug
            ? `${ERR_PREFIX}: slug cannot be empty`
            : `${ERR_PREFIX}: title cannot produce a valid slug: ${JSON.stringify(params.title)}`);
    }
    assertValidSlug(slug, hasExplicitSlug);
    // 单次取 now：目录前缀与 createdAt 时间戳共用同一时刻，避免跨日/跨月不一致。
    const now = new Date();
    const taskRelPath = join(DIR_NAMES.tasks, `${formatMonthDay(now)}-${slug}`);
    const taskDir = insideWorkloom(projectRoot, taskRelPath);
    assertPriority(params.priority);
    assertTaskMode(params.mode);
    assertAutonomy(params.autonomy);
    // parent 归一与校验：任一失败在写入前抛错（不产生任何目录/文件写入）。
    // 自引用（parent 与新任务路径一致）由校验 ② 拦截，故校验先于 existsSync 目录冲突检查。
    const parentRelPath = normalizeParentRelPath(params.parent);
    if (parentRelPath !== null) {
        validateParent(projectRoot, parentRelPath, taskRelPath);
    }
    // 目录冲突检查：置于 parent 校验之后，避免自引用被误报为「目录已存在」。
    if (existsSync(taskDir)) {
        throw new Error(`${ERR_PREFIX}: task directory already exists: ${taskRelPath}`);
    }
    // 身份能力退役：.developer 读取整体去除，creator 恒为空串（字段保留保数据布局兼容）。
    const creator = '';
    const config = loadConfig(projectRoot);
    // package 归属校验：传入即校验 ∈ config.packages，未知值 fail loud
    // （文案列已声明包 + 指引 workloom-packages-scan）；置于任何写盘（mkdirSync）
    // 之前 → 零部分状态。直调面 package 可选（存量 createTask 调用不下沉必填；
    // executeCreateTask 层另行强制非空）。
    if (params.package !== undefined && params.package !== null) {
        if (typeof params.package !== 'string' || config.packages[params.package] === undefined) {
            const declared = Object.keys(config.packages);
            throw new Error(`${ERR_PREFIX}: unknown package ${JSON.stringify(params.package)} ` +
                `(declared: ${declared.length > 0 ? declared.join(', ') : 'none'}); ` +
                'declare it under "packages" in .workloom/config.json ' +
                '(run workloom-packages-scan to generate the list)');
        }
    }
    // 子任务落盘 parent 用归一后的 parentRelPath（tasks/ 规范形），保证两种输入格式存储一致。
    const recordParams = { ...params, parent: parentRelPath };
    const task = buildTaskRecord({
        params: recordParams,
        slug,
        creator,
        config,
        now: now.toISOString(),
    });
    mkdirSync(taskDir, { recursive: true });
    writeTaskRecordToDir(taskDir, task);
    writeFileSync(join(taskDir, FILE_NAMES.prd), buildPrdContent(task.title));
    writeFileSync(join(taskDir, FILE_NAMES.implementLog), `${LOG_SEEDS.implement}\n`);
    writeFileSync(join(taskDir, FILE_NAMES.checkLog), `${LOG_SEEDS.check}\n`);
    // children 联动：子任务创建成功后才执行；写回失败抛错（子任务已创建、父 children 未更新）。
    if (parentRelPath !== null) {
        linkChildToParent(projectRoot, parentRelPath, taskRelPath);
    }
    const warnings = await runTaskHooks(projectRoot, join(taskDir, FILE_NAMES.taskJson), task.hooks.after_create);
    logWarnings(warnings);
    return { taskRelPath, task };
}
/**
 * 校验优先级（内部）。
 * @param priority 创建入参优先级
 */
function assertPriority(priority) {
    if (priority !== undefined && !PRIORITY_SET.has(priority)) {
        throw new Error(`${ERR_PREFIX}: invalid priority: ${priority} (must be one of P0/P1/P2/P3)`);
    }
}
/**
 * 校验任务模式（内部）：缺省 standard；显式值必须是合法枚举（fail loud，写入前拦截）。
 * @param mode 创建入参模式
 */
function assertTaskMode(mode) {
    if (mode !== undefined && !Object.hasOwn(CREATE_MODE_VALUES, mode)) {
        throw new Error(`${ERR_PREFIX}: invalid mode: ${JSON.stringify(mode)} (must be one of light/standard/parent)`);
    }
}
/**
 * 校验任务自治度（内部）：缺省 manual；显式值必须是合法枚举（fail loud，
 * 非法值在 schema 校验报可判定错误，写入前拦截）。
 * @param autonomy 创建入参自治度
 */
function assertAutonomy(autonomy) {
    if (autonomy !== undefined && !Object.hasOwn(AUTONOMY_VALUE_SET, autonomy)) {
        throw new Error(`${ERR_PREFIX}: invalid autonomy: ${JSON.stringify(autonomy)} (must be one of manual/semi/auto)`);
    }
}
/* ---------------- hooks ---------------- */
/**
 * 执行 hooks：注入 TASK_JSON_PATH 环境变量；单个失败收集为 WARNING，不抛错。
 * @param root 项目根（作为 hooks 的工作目录）
 * @param taskJsonPath task.json 绝对路径
 * @param commands shell 命令列表
 * @returns WARNING 消息列表（空数组表示全部成功）
 */
export async function runTaskHooks(root, taskJsonPath, commands) {
    const warnings = [];
    for (const command of commands) {
        const error = await runHookOnce(root, taskJsonPath, command);
        if (error) {
            warnings.push(`hook failed (${command}): ${error.message}`);
        }
    }
    return warnings;
}
/**
 * 执行单条 hook 命令（内部）。
 * @param root 工作目录
 * @param taskJsonPath task.json 绝对路径
 * @param command shell 命令
 * @returns 失败错误（成功为 null）
 */
function runHookOnce(root, taskJsonPath, command) {
    return new Promise((resolve) => {
        execFile('/bin/sh', ['-c', command], { cwd: root, env: { ...process.env, [TASK_JSON_ENV]: taskJsonPath } }, (error) => resolve(error ?? null));
    });
}
/**
 * 非阻塞告警统一出口（内部；编排层共用）。
 * @param warnings WARNING 消息列表
 */
export function logWarnings(warnings) {
    for (const warning of warnings) {
        console.warn(`${ERR_PREFIX}: WARNING: ${warning}`);
    }
}
/* ---------------- 列表与归档物理写 ---------------- */
/**
 * 列出任务摘要（不含 archive/），可按状态过滤；缺失或损坏的目录跳过。
 * @param root 项目根
 * @param params 过滤参数
 * @returns [err, summaries]
 */
export function listTasks(root, params = {}) {
    try {
        return [null, listTasksInternal(root, params)];
    }
    catch (error) {
        return [toError(error), null];
    }
}
/**
 * 列出任务摘要（内部实现）：活跃区固定枚举；includeArchived 时追加 archive 的
 * 月份分层目录（tasks/archive/<YYYY-MM>/<name>）。两区各自保持目录遍历序
 * （活跃区在前、归档区在后）；缺失或损坏的目录不阻塞列表。
 * @param root 项目根
 * @param params 过滤参数
 * @returns 摘要列表
 */
function listTasksInternal(root, params) {
    const projectRoot = requireProjectRoot(root);
    const tasksDir = insideWorkloom(projectRoot, DIR_NAMES.tasks);
    if (!existsSync(tasksDir))
        return [];
    const summaries = [];
    /** @param taskRelPath 任务目录相对 .workloom 的路径 */
    const collect = (taskRelPath) => {
        const [taskErr, task] = readTaskRecord(projectRoot, taskRelPath);
        if (taskErr || !task)
            return; // 缺失或损坏的目录不阻塞列表
        if (params.status !== undefined && task.status !== params.status)
            return;
        summaries.push({
            name: task.name,
            title: task.title,
            status: task.status,
            priority: task.priority,
            createdAt: task.createdAt,
            parent: task.parent ?? null,
            taskRelPath,
        });
    };
    for (const entry of readdirSync(tasksDir, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name === DIR_NAMES.archive)
            continue;
        collect(join(DIR_NAMES.tasks, entry.name));
    }
    if (params.includeArchived !== true)
        return summaries;
    const archiveDir = join(tasksDir, DIR_NAMES.archive);
    if (!existsSync(archiveDir))
        return summaries;
    for (const month of readdirSync(archiveDir, { withFileTypes: true })) {
        if (!month.isDirectory())
            continue;
        const monthDir = join(archiveDir, month.name);
        for (const taskEntry of readdirSync(monthDir, { withFileTypes: true })) {
            if (!taskEntry.isDirectory())
                continue;
            collect(join(DIR_NAMES.tasks, DIR_NAMES.archive, month.name, taskEntry.name));
        }
    }
    return summaries;
}
/**
 * 计算归档目标相对路径（tasks/archive/<YYYY-MM>/<task.name>）。
 * @param taskName 任务 slug（task.name）
 * @param now 归档时刻
 * @returns 归档相对路径
 */
export function archiveRelPathOf(taskName, now) {
    return join(DIR_NAMES.tasks, DIR_NAMES.archive, formatYearMonth(now), taskName);
}
/**
 * 归档物理移动（内部写口）：目标冲突先查（避免半完成态），mkdir 父目录后
 * renameSync 整体移动任务目录；不做状态写与指针清理（归编排层）。
 * @param root 项目根
 * @param taskRelPath 任务目录相对 .workloom 的路径
 * @param archiveRel 归档目标相对路径
 * @returns [err, 归档目录绝对路径]
 */
export function moveTaskToArchive(root, taskRelPath, archiveRel) {
    try {
        const archiveDir = insideWorkloom(root, archiveRel);
        if (existsSync(archiveDir)) {
            throw new Error(`${ERR_PREFIX}: archive target already exists: ${archiveRel}`);
        }
        mkdirSync(dirname(archiveDir), { recursive: true });
        renameSync(insideWorkloom(root, taskRelPath), archiveDir);
        return [null, archiveDir];
    }
    catch (error) {
        return [toError(error), null];
    }
}
/**
 * 按任务名在 tasks/archive/<YYYY-MM>/ 下查找归档目录，返回最新月份的归档任务相对路径。
 * 供归档兼容解析使用：子任务归档后 task.children 仍指向归档前路径，
 * 读子任务材料（如 plan.md）时应先用原路径，缺失时回退到本函数结果。
 * @param root 项目根
 * @param taskRelPath 任务相对路径（如 tasks/<name>）
 * @returns 归档任务相对路径；未归档或无归档目录时返回 null
 */
export function findArchivedTaskPath(root, taskRelPath) {
    const archiveDir = insideWorkloom(root, join(DIR_NAMES.tasks, DIR_NAMES.archive));
    let months;
    try {
        months = readdirSync(archiveDir, { withFileTypes: true });
    }
    catch (error) {
        if (isEnoent(error))
            return null;
        throw error;
    }
    const name = basename(taskRelPath);
    // 月份目录按名降序：同名归档（跨月重名）取最新月份，结果保持确定性。
    const monthsDesc = months
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort()
        .reverse();
    // 活动目录名可带 MM-DD- 日期前缀而归档目录名是 slug：先精确匹配原名，再匹配去前缀形态。
    const candidates = [name];
    const slug = name.replace(TASK_DIR_DATE_PREFIX, '');
    if (slug !== name)
        candidates.push(slug);
    for (const candidate of candidates) {
        for (const month of monthsDesc) {
            const archiveRel = join(DIR_NAMES.tasks, DIR_NAMES.archive, month, candidate);
            if (existsSync(insideWorkloom(root, archiveRel)))
                return archiveRel;
        }
    }
    return null;
}
/* ---------------- 辅助 ---------------- */
/** @param value 未知异常 @returns 归一化 Error */
function toError(value) {
    return value instanceof Error ? value : new Error(String(value));
}
/** @param error 未知异常 @returns 是否文件不存在 */
function isEnoent(error) {
    return error?.code === 'ENOENT';
}
//# sourceMappingURL=task-storage.js.map