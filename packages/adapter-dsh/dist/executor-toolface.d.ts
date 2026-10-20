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
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
/**
 * 工具面索引：按子代理 id 查允许清单，并记录已经扫描过的项目根，
 * 避免每次冷恢复都重复遍历任务目录。
 */
export interface ToolfaceIndex {
    /** 子代理 id → 允许清单（派发时直接登记，冷恢复时由任务记录补入）。 */
    byChild: Map<string, readonly string[]>;
    /** 已从任务记录扫描过的项目根。 */
    scannedRoots: Set<string>;
}
/** 创建空索引（每插件激活一份；重启后按项目懒重建）。 */
export declare function createToolfaceIndex(): ToolfaceIndex;
/**
 * 从项目任务记录重建子代理允许清单。
 * 遍历 `<root>/.workloom/tasks/` 下各任务目录（排除 archive），读取 dispatches
 * 中带 childId 与 toolsAllow 的记录。旧记录缺 toolsAllow 时跳过：那批会话在
 * 0.2.0 的 toolFilter 通道下创建，无法从记录反推白名单。
 * @param root 项目根
 * @returns 子代理 id → 允许清单
 */
export declare function rebuildToolfaceIndex(root: string): Map<string, readonly string[]>;
/**
 * 登记一次派发的工具白名单（派发前调用，失败派发由调用方撤销）。
 * @param index 工具面索引
 * @param childId 预分配的子代理 id
 * @param allow 允许清单
 */
export declare function registerToolface(index: ToolfaceIndex, childId: string, allow: readonly string[]): void;
/**
 * 撤销一次派发登记（派发启动失败时调用，避免 id 泄漏进索引）。
 * @param index 工具面索引
 * @param childId 预分配的子代理 id
 */
export declare function releaseToolface(index: ToolfaceIndex, childId: string): void;
/**
 * 按子代理自己的可见工具集求交后施加限制。
 *
 * 可见集必须按 agent 作用域视图取（`schemas(agent)`）：原生工具挂在 agent 自己的
 * scope 层上，无参全局视图只看得到全局层注册的工具（例如 lsp-actions 的 lsp_*），
 * 求交后会把整个执行面误判成不可见。
 * @param agent 刚创建完成的子代理
 * @param allow 允许清单
 * @throws 允许清单与可见集没有交集时抛错（配置严重不一致，拒绝静默放行）
 */
export declare function applyToolface(agent: Agent, allow: readonly string[]): void;
/**
 * 注册 agent/created 监听：命中索引就收窄工具面。
 * 该事件是串行事件，宿主会等待监听器完成；因此这里只做内存查表，文件扫描只发生
 * 在冷恢复且该项目的记录尚未扫描过时。
 * @param ctx 插件上下文
 */
export declare function registerExecutorToolface(ctx: Context): void;
/** 派发前登记子代理工具白名单（executor.ts 派发路径）。 */
export declare function registerExecutorToolfaceChild(childId: string, allow: readonly string[]): void;
/** 派发启动失败时撤销登记（executor.ts 异常路径）。 */
export declare function releaseExecutorToolfaceChild(childId: string): void;
