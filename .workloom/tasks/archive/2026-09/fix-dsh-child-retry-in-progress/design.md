# 设计：移除 DSH 写入硬门禁

## 1. 背景与决策

当前 adapter-dsh 在 `tools/pre-execute` 上拦截 `write/edit`，并通过进程内 Set 临时豁免 `workloom_execute` 子会话。continuable 子会话异常结束后，豁免随工具结算注销；使用原生续跑入口时会被误判。该机制同时无法覆盖 bash 写入，因此不再承担可靠的权限边界。

本任务不修补身份生命周期，而是完整删除运行时硬门禁。实现分工继续由共享 workflow 与 executor prompt 约束。

## 2. 删除边界

### 2.1 adapter-dsh

- plugin 不再注册写入 gate。
- executor 不再登记或注销临时写入豁免。
- 删除 gate 模块及其专用测试。
- 删除 executor 测试中依赖 gate 的跨轮豁免用例，保留 continuable 续跑本身的测试。

### 2.2 core 配置与 doctor

- `DEFAULT_CONFIG.executor` 不再包含 `gate`，配置类型同步删除该字段。
- 配置解析器不再读取或校验 `executor.gate`；旧字段按未知字段自然忽略。
- 初始化模板不再输出 gate 配置或说明。
- doctor 保留配置缺失、配置损坏等检查，删除 gate 关闭告警。
- 仓库自身 `.workloom/config.yaml` 删除已废弃字段。

### 2.3 Agent 提示

- 共享 workflow 保留 implement executor 分工硬提示。
- 保留 check 阶段主会话可修复、修复后必须重派 check 的例外。
- 仅删除 DSH `executor.gate`、运行时阻断和关闭开关的陈述。

## 3. TDD 策略

按公共行为纵向推进，每个切片先改或新增测试得到红灯，再做最小删除转绿：

1. 配置接缝：默认值无 gate，旧字段可加载且不出现在结果中。
2. 初始化接缝：新配置不输出 gate。
3. doctor 接缝：旧 gate 字段不产生 issue，其他配置错误仍报告。
4. plugin 接缝：Workloom 激活不再注册文件写入预执行监听；随后移除 gate 与豁免代码。
5. workflow 接缝：分工提示和 check 例外仍存在，DSH 门禁描述消失。

测试只观察公开配置、doctor 输出、plugin 注册行为和 workflow 契约，不测试私有函数或源码文本布局。

## 4. 兼容与风险

- 旧项目可保留 `executor.gate`，加载时静默忽略；不提供迁移脚本。
- 删除后所有会话均可调用文件写入工具；Agent 违反分工时不再有运行时兜底，这是已接受风险。
- 不改变 DSH subagent、continuable、followup、429 处理或 Workloom task gate。

## 5. 部署

删除源码后先清空 core 与 adapter-dsh 的 `dist/` 再构建，防止 TypeScript 增量构建残留 `gate.*`。验证工作区无旧产物后，对 profile 执行 rsync dry-run，再运行既有同步脚本；利用 `--delete` 清除 profile 中旧文件，不重启 DSH Web。