/**
 * config 加载编排（TypeScript）：三层流水线（全局 → 项目 → 本地）、层探测与
 * 求值、全局白名单、来源层 provenance 与逐字段合并校验。
 *
 * 设计意图：
 * - 对象层顶层 key 覆盖、deepMerge 废止；函数工厂接收低层合并结果（无则
 *   undefined）、同步返回本层最终文档（不再自动合并）；工厂入参逐层传递；
 * - 全局层仅消费项目无关字段（白名单校验）：subagent_profiles / session_auto_commit /
 *   prompt_injection / context_injection；packages / hooks 报"项目字段"专属错误，
 *   其余白名单外顶层字段报"全局配置不支持"；
 * - 遗留 subagents：接受 + 加载期一次性 deprecation WARNING（项目层同口径）；
 * - 解析失败显式抛错（fail loud），不静默回退，符合"无灰区"哲学；
 * - 结果挂载只读来源层字段 subagentProfilesSource / subagentsSource。
 */
import type { WorkloomConfig } from './config.d.ts';
/**
 * 从项目根加载配置（三层流水线）：
 * 全局 $HOME/.workloom/config → 项目 .workloom/config → 本地 .workloom/config.local；
 * 对象层顶层 key 覆盖、函数工厂逐层传递；全局层白名单校验；遗留 subagents WARNING。
 * 结果挂载只读来源层字段 subagentProfilesSource / subagentsSource（记录该 key 最后
 * 写入层；全程未出现时字段不定义、读取为 undefined）。
 * @param root 项目根目录
 * @param options 可选项：homeDir 覆盖全局层基准目录（测试/沙箱用，缺省取 os.homedir()）
 * @returns 合并默认后的配置对象（含来源层字段）
 */
export declare function loadConfig(root: string, options?: {
    homeDir?: string;
}): WorkloomConfig;
