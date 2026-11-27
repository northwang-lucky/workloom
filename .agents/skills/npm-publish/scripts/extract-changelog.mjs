#!/usr/bin/env node
// 从 CHANGELOG.md 提取指定版本的段落，作为 GitHub Release notes。

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../../../..');
const version = process.argv[2];
if (!version) {
  throw new Error('用法: node extract-changelog.mjs <version>');
}

const lines = readFileSync(resolve(ROOT, 'CHANGELOG.md'), 'utf8').split('\n');
const start = lines.findIndex((line) => line.startsWith(`## [${version}]`));
if (start < 0) {
  throw new Error(`CHANGELOG.md 中没有版本 ${version}`);
}

const end = lines.findIndex((line, i) => i > start && line.startsWith('## ['));
const body = lines.slice(start + 1, end < 0 ? undefined : end).join('\n').trim();
if (!body) {
  throw new Error(`版本 ${version} 的 CHANGELOG 段落为空`);
}
console.log(body);
