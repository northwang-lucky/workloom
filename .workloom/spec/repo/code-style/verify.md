# verify

每次提交前的完整验证。

- rule: 跑 `pnpm lint`、`pnpm -r typecheck`、`pnpm -r build` 与受影响包的测试；全绿才提交
- rule: 测试经 `node --test` 直跑 TS 测试文件（Node 原生 type stripping），不前置 build；tsc 只负责 typecheck 与构建产物
- counter-example: 测试通过但 lint 报未使用变量就提交
