// 最小 bun:test 类型声明（仅供 tsc 编译通过，运行时由 bun test 提供）
declare module 'bun:test' {
  export const mock: {
    <T extends object>(moduleName: string, factory: () => T): void
    module: <T extends object>(moduleName: string, factory: () => T) => void
  }
}
