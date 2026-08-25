import { defineConfig } from 'eslint/config'
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'
import globals from 'globals'

export default defineConfig([
  {
    ignores: [
      '**/dist/**',
      'node_modules/**',
      '.agents/**',
      '.claude/**',
      'docs/**',
      'pnpm-lock.yaml',
      'skills-lock.json',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // 含 .mjs：包内 node 脚本（如 adapter-pi 的 sync-skills.mjs）同样需要 node globals。
    files: ['**/*.{js,mjs}'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['**/*.{js,ts}'],
    rules: {
      // 下划线前缀的参数/变量表示“骨架阶段占位，暂未消费”，允许其未使用。
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  prettier,
])
