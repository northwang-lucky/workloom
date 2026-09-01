# CardX SSO Token 自动续期：代码事实研究（fixture 子集）

> ⚠️ 实施以 `design.md` 为准：本文为代码事实基线，部分方案已由设计决议覆盖并关闭。
> 已关闭项：`AuthStoreDir`/`WithExclusive`/`authgate` 共享件唯一 owner=本任务。

> 任务：`tasks/08-31-cardx-auth-refresh`（规划期研究，**只读代码，不改实现**）。
> 输出单一 Markdown，供 implement 子代理直接消费。

## 1. 调研范围与方法

阅读了任务 PRD、根 `AGENTS.md`、兄弟任务研究文档，并通读两仓关键代码（版本以工作区当前 checkout 为准）：

- CLI：`internal/cli/auth/{register.go,cmd/,core/,result/}`、`internal/store/`、`internal/cli/build.go`。
- API：`src/customs/{JWTService.ts,CasAuthHandler.ts}`、`src/controllers/UserController.ts`、`config/config.default.ts`。

结论：Access Token 今天已是 15 天（`jwtExpiresIn: 1_296_000` 秒）；Refresh Token、续期、401 恢复在现有代码中均不存在，但 CLI 侧零件齐备。

## 2. 现状事实基线

### 2.1 CLI 侧

| 主题 | 事实（带路径） |
| --- | --- |
| 认证存储 | `internal/store/auth.go`：`SetAuthToken/GetAuthToken/DeleteAuthToken` 只存
`{token, expires_at}`（`authTokenData`，JSON 一个 key `cardx:auth:token`）；无 refresh 字段 |
| 存储底座 | `internal/store/store.go`：`Open(dir)` 独占锁 / `OpenReadOnly(dir)` 共享锁；锁冲突映射 `STORE_LOCKED`（ExTempfail=75） |
| 只读命令机制 | `internal/cli/shared/storemode/storemode.go`：`root.go:58` `SetStoreMode`；
`appctx.GetStore()` 按模式懒打开主数据 store（`context.go:73-97`） |
| 错误码/退出码 | `internal/api/cardx/errcode.go`：`ErrCodeAuthNotLoggedIn` 已存在；`internal/type/error/error.go` 退出码 sysexits（ExTempfail=75 等） |

### 2.2 API 侧（cardx-api）

| 主题 | 事实（带路径） |
| --- | --- |
| JWT 签发 | `src/customs/JWTService.ts`：`signToken(userId)` → `utils/string/signJWT`（HS256） |
| 配置 | `config/config.default.ts:129-131`：`jwtSecret`、`jwtExpiresIn: 1_296_000`（=15 天） |
| JWT 校验 | `JWTService.parseJWT(token)`：签名→iss→exp 三步，任一失败返回 null |

## 5. 统一 token 入口与锁升级 seam

### 5.1 `store.WithExclusive`（共享 → 独占升级原语）

```go
// internal/store/lock.go
// WithExclusive 关闭本进程 authDir 的共享实例后以独占锁打开（最多等待 wait），
// 在 fn 内完成「二次读取 + 写回」，随后关闭独占实例；锁超时返回 ErrLockTimeout。
func WithExclusive(ctx context.Context, dir string, wait time.Duration, fn func(s *Store) error) error
```

实现要点（全部复用现有 `store` 机制，无新依赖）：

1. `store.Close` 幂等摘除单例（`store.go:158`），先关本进程共享实例（若有），避免「模式冲突」分支。
2. 循环 `store.Open(dir)`：`STORE_LOCKED`（`typerr.IsCLIErrorCode`）→ 按 wait 退避重试；其他错误直接透传。

## 6. 精确文件清单

### 6.1 CLI 新增（无锚点结论，应标 unverified）

```
internal/xdg/auth.go + auth_test.go
    AuthStoreDir() = dataHomePath("auth")（$XDG_DATA_HOME/cardx-cli/auth）
```

- 未带行号的路径引用（`internal/authgate/gate.go`）属于待确认建议，不是已验证事实。

## 9. 待确认项（供 Grilling）

1. `AUTH_REFRESH_FAILED` 的 ExitCode：建议 ExTempfail(75)（可重试语义）；是否接受？
2. auth 库实例管理位置：appctx 零改动（figma 兄弟任务文档提出 `appctx.GetAuthStore()` 方案）——按哪套落地？
