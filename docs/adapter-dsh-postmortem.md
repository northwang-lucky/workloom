# adapter-dsh 工具注册缺陷复盘

> 2026-08-25 首次部署 `@workloom/adapter-dsh` 到 dsh web profile 后连续暴露的三类问题，
> 涉及工具 schema 契约、TypeScript 类型兼容、以及本地部署产物同步。

## 背景

`@workloom/adapter-dsh` 是 workloom 适配 DeepSeek Harness 的 Cordis 插件，
通过 `ctx.tools.register()` 向宿主注册两个工具（`workloom_execute`、`workloom_step`），
由宿主把工具定义原样转发给 DeepSeek API 完成 function calling。

## 问题一：输出 schema 非法类型

### 现象

启动时宿主拒绝加载插件：

```
unsupported JSON schema: schema.type must be one of
object/array/string/number/integer/boolean/null
```

### 根因

工具定义的 `output.schema` 写了 `{ type: 'json' }`——`json` 不是 JSON Schema
规范类型。宿主 `dsh-tools` 的 schema 校验器严格按 RFC 枚举拒绝。

### 修复

`{ type: 'json' }` → `{ type: 'object' }`（4 处：`executor.ts` 运行时 + 接口注解、
`skills.ts` 运行时 + 接口注解）。

注意 `{}` 也不可行：宿主把 output schema 发给 API 时要求顶层 `type: 'object'`，
空对象被 API 解析为 `type: null`，触发运行时 `INVALID_REQUEST`。

## 问题二：参数 schema 缺少标准信封

### 现象

插件加载成功，但模型调用 `workloom_execute` 时 API 返回：

```
Invalid schema for function 'workloom_execute':
schema must be a JSON Schema of type: 'object', got 'type: null'
```

### 根因

宿主把工具的 `parameters` **原样转发**给 API，不做包装。adapter 用的是属性简写格式：

```ts
parameters: {
  kind:   { type: 'string', required: true, description: '...' },
  prompt: { type: 'string', required: true, description: '...' },
}
```

缺少顶层 `{ type: 'object', properties: {...}, required: [...] }`，
API 解析出 `type: null` 后拒绝请求。

### 修复

两个工具的 `parameters` 改为标准 JSON Schema：

```ts
parameters: {
  type: 'object',
  properties: {
    kind:   { type: 'string', description: '...' },
    prompt: { type: 'string', description: '...' },
  },
  required: ['kind', 'prompt'],
  additionalProperties: false,
}
```

`required` 字段从各属性的 `required: true` 提升到顶层数组；属性内部不再保留
`required`（JSON Schema 规范中 `required` 是 object 级关键字）。

## 问题三：TypeScript 参数逆变不兼容

### 现象

`pnpm run build` 报错：

```
Argument of type 'ToolRunContext' is not assignable to parameter of type 'ToolExec'
```

### 根因

adapter 声明了本地最小接口 `ToolExec`（`{ agent?: MinimalAgent; signal: AbortSignal }`），
用于 `executeTool()` 的参数类型。宿主 `tools.register()` 的 `execute` 回调
参数类型是 `ToolRunContext`（字段更多）。TypeScript 对函数参数做逆变检查：
回调的 `exec` 声明为 `ToolExec`，宿主传入的 `ToolRunContext` 无法赋给它。

### 修复

接口 `MinimalToolDefinition.execute` 的 `exec` 参数放宽为 `unknown`；
register 回调处用 `exec as ToolExec` 转回，保持 `executeTool()` 内部的类型安全。

## 问题四：profile 产物不跟随工作区重建

### 现象

工作区新增源文件并重建后，dsh 启动报 `ERR_MODULE_NOT_FOUND: command-ops.js`。

### 根因

profile 通过 `file:` 协议引用工作区包，但 pnpm 安装后生成的是**硬拷贝**
（非 symlink）。工作区 `pnpm run build` 产出的新 dist 文件不会自动同步到
profile 的 `node_modules/@workloom/*/dist/`。

### 修复

编写 `~/dsh/bin/dsh-sync-workloom`：rsync 工作区 dist 到 profile + 重启 dshweb。
工作区每次重建后手动执行。

## 要点总结

| 维度 | 宿主要求 | 踩坑写法 | 正确写法 |
|------|---------|---------|---------|
| output schema | `type` 必须为标准 JSON Schema 类型 | `{ type: 'json' }` | `{ type: 'object' }` |
| output schema | 顶层必须有 `type` | `{}` | `{ type: 'object' }` |
| parameters | 必须是完整 JSON Schema，含顶层 `type: 'object'` | 属性简写 `{ kind: {...} }` | `{ type: 'object', properties: {...}, required: [...] }` |
| execute 参数 | 宿主传入 `ToolRunContext` | 本地 `ToolExec` 窄类型 | `unknown` + `as ToolExec` |
| 部署同步 | `file:` 依赖是硬拷贝 | 重建即生效（假设 symlink） | 显式 rsync 或脚本同步 |
