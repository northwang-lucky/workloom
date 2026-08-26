# verify

Full verification before every commit.

- rule: run `pnpm lint`, `pnpm -r typecheck`, `pnpm -r build`, and the affected packages' tests; all green before committing
- rule: core tests run with `node --test` against `dist/`, so build before testing; adapter-pi tests run with `bun test`
- counter-example: committing after tests pass but lint reports an unused variable
