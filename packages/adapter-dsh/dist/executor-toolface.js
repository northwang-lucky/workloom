/**
 * adapter-dsh 的 executor 子代理工具面收窄（机制强制面）。
 *
 * 设计意图：
 * - DSH 0.2.1 取消了按次传 toolFilter 的通道（官方把工具面归入 Agent Preset），
 *   但保留了 agent/created 串行事件与 agent.ctx.tools.restrict() 两个公开能力；
 *   本模块在子代理创建窗口内施加白名单，语义与旧的 toolFilter 一致：
 *   先继承父代理的工具面，再收窄到允许清单；
 * - agent/created 对进程内每个 agent 都会触发，命中判定必须精确：只处理登记过的
 *   子代理 id，未命中安静返回，绝不抛错（抛错会让宿主拒绝创建那个无关 agent）；
 * - 允许清单必须与子代理自己的可见工具有交集后才生效：restrict 遇到未知名字会
 *   抛错，抛错同样会让子代理创建失败、整次派发回滚；
 * - 冷恢复由界面直接触发时，内存索引里可能还没有该子代理：按子代理 cwd 定位项目
 *   根，从 task.json 的 dispatches 读回 toolsAllow 重建索引（每个项目只扫一次）。
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ERR_PREFIX, findWorkloomRoot } from '@workloom-ai/core';
/** 项目资产目录名（与 research 写守卫同一约定）。 */
const WORKLOOM_DIR = '.workloom';
/** 任务目录名。 */
const TASKS_DIR = 'tasks';
/** 归档目录名（重建时排除）。 */
const ARCHIVE_DIR = 'archive';
/** 创建空索引（每插件激活一份；重启后按项目懒重建）。 */
export function createToolfaceIndex() {
    return { byChild: new Map(), scannedRoots: new Set() };
}
/**
 * 从项目任务记录重建子代理允许清单。
 * 遍历 `<root>/.workloom/tasks/` 下各任务目录（排除 archive），读取 dispatches
 * 中带 childId 与 toolsAllow 的记录。旧记录缺 toolsAllow 时跳过：那批会话在
 * 0.2.0 的 toolFilter 通道下创建，无法从记录反推白名单。
 * @param root 项目根
 * @returns 子代理 id → 允许清单
 */
export function rebuildToolfaceIndex(root) {
    const rebuilt = new Map();
    const tasksDir = join(root, WORKLOOM_DIR, TASKS_DIR);
    let entries;
    try {
        entries = readdirSync(tasksDir, { withFileTypes: true });
    }
    catch {
        return rebuilt;
    }
    for (const entry of entries) {
        if (!entry.isDirectory() || entry.name === ARCHIVE_DIR)
            continue;
        let raw;
        try {
            raw = readFileSync(join(tasksDir, entry.name, 'task.json'), 'utf8');
        }
        catch {
            continue;
        }
        let task;
        try {
            task = JSON.parse(raw);
        }
        catch {
            continue;
        }
        const dispatches = task?.dispatches;
        if (!Array.isArray(dispatches))
            continue;
        for (const dispatch of dispatches) {
            const childId = dispatch?.childId;
            const toolsAllow = dispatch?.toolsAllow;
            if (typeof childId !== 'string' || childId === '')
                continue;
            if (!Array.isArray(toolsAllow) || toolsAllow.length === 0)
                continue;
            const names = toolsAllow.filter((name) => typeof name === 'string' && name !== '');
            if (names.length > 0)
                rebuilt.set(childId, names);
        }
    }
    return rebuilt;
}
/**
 * 登记一次派发的工具白名单（派发前调用，失败派发由调用方撤销）。
 * @param index 工具面索引
 * @param childId 预分配的子代理 id
 * @param allow 允许清单
 */
export function registerToolface(index, childId, allow) {
    index.byChild.set(childId, [...allow]);
}
/**
 * 撤销一次派发登记（派发启动失败时调用，避免 id 泄漏进索引）。
 * @param index 工具面索引
 * @param childId 预分配的子代理 id
 */
export function releaseToolface(index, childId) {
    index.byChild.delete(childId);
}
/**
 * 按子代理自己的可见工具集求交后施加限制。
 * @param agent 刚创建完成的子代理
 * @param allow 允许清单
 * @throws 允许清单与可见集没有交集时抛错（配置严重不一致，拒绝静默放行）
 */
export function applyToolface(agent, allow) {
    const visible = new Set(agent.ctx.tools.schemas().map((schema) => schema.name));
    const names = allow.filter((name) => visible.has(name));
    if (names.length === 0) {
        throw new Error(`${ERR_PREFIX.executor}: the executor tool whitelist names no tool visible to the child ` +
            `(${allow.join(', ')}); the deployment's tool surface does not match the configured whitelist`);
    }
    agent.ctx.tools.restrict({ allow: names });
}
/** 插件级索引（模块单例；派发登记与冷恢复重建共用）。 */
const pluginToolfaceIndex = createToolfaceIndex();
/**
 * 注册 agent/created 监听：命中索引就收窄工具面。
 * 该事件是串行事件，宿主会等待监听器完成；因此这里只做内存查表，文件扫描只发生
 * 在冷恢复且该项目的记录尚未扫描过时。
 * @param ctx 插件上下文
 */
export function registerExecutorToolface(ctx) {
    ctx.on('agent/created', ({ agent, source }) => {
        let allow = pluginToolfaceIndex.byChild.get(agent.id);
        if (allow === undefined) {
            // 新建时一定已登记；走到这里说明可能是界面直接触发的冷恢复。
            if (source !== 'resume')
                return undefined;
            const cwd = agent.session.header.cwd;
            if (cwd === undefined || cwd === '')
                return undefined;
            const found = findWorkloomRoot(cwd);
            if (found === null)
                return undefined;
            if (!pluginToolfaceIndex.scannedRoots.has(found.root)) {
                pluginToolfaceIndex.scannedRoots.add(found.root);
                for (const [childId, names] of rebuildToolfaceIndex(found.root)) {
                    if (!pluginToolfaceIndex.byChild.has(childId)) {
                        pluginToolfaceIndex.byChild.set(childId, names);
                    }
                }
            }
            allow = pluginToolfaceIndex.byChild.get(agent.id);
            if (allow === undefined)
                return undefined;
        }
        applyToolface(agent, allow);
        return undefined;
    });
}
/** 派发前登记子代理工具白名单（executor.ts 派发路径）。 */
export function registerExecutorToolfaceChild(childId, allow) {
    registerToolface(pluginToolfaceIndex, childId, allow);
}
/** 派发启动失败时撤销登记（executor.ts 异常路径）。 */
export function releaseExecutorToolfaceChild(childId) {
    releaseToolface(pluginToolfaceIndex, childId);
}
//# sourceMappingURL=executor-toolface.js.map