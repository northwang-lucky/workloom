/**
 * adapter-pi 的 Extension 入口（jiti 直载，无需构建）。
 * Phase 2 填充：session_start/before_agent_start 注入、registerCommand、
 * registerTool、pi-subagents 三 agent 注册与派发。
 */
export default function workloomExtension(pi: unknown): void {
  void pi // Phase 2 实现
}
