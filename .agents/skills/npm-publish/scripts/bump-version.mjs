#!/usr/bin/env node
// 同步 bump 两个 workspace 包的版本号，打印新版本。

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../../../..');
const PACKAGES = ['packages/core/package.json', 'packages/dsh-workloom/package.json'];

// 只接受普通三段版本，避免预发布元数据让 bump 结果不可预期。
function parseVersion(raw) {
  if (!/^\d+\.\d+\.\d+$/.test(raw)) {
    throw new Error(`不支持的版本格式: ${raw}`);
  }
  return raw.split('.').map(Number);
}

// 按 bump 类型或显式版本算出目标版本。
function nextVersion(current, arg) {
  const [major, minor, patch] = parseVersion(current);
  if (/^\d+\.\d+\.\d+$/.test(arg)) return arg;
  if (arg === 'major') return `${major + 1}.0.0`;
  if (arg === 'minor') return `${major}.${minor + 1}.0`;
  if (arg === 'patch') return `${major}.${minor}.${patch + 1}`;
  throw new Error(`参数必须是 major/minor/patch 或 x.y.z，收到: ${arg}`);
}

// 读取两个包的版本，要求彼此一致。
function readVersions() {
  return PACKAGES.map((rel) => {
    const path = resolve(ROOT, rel);
    const pkg = JSON.parse(readFileSync(path, 'utf8'));
    return { rel, path, pkg, version: pkg.version };
  });
}

function main() {
  const arg = process.argv[2];
  if (!arg) {
    throw new Error('用法: node bump-version.mjs <major|minor|patch|x.y.z>');
  }

  const packages = readVersions();
  const current = packages[0].version;
  if (packages.some((p) => p.version !== current)) {
    const detail = packages.map((p) => `${p.rel}=${p.version}`).join(', ');
    throw new Error(`包版本不一致: ${detail}`);
  }

  const next = nextVersion(current, arg);
  if (next === current) {
    throw new Error(`目标版本与当前版本相同: ${current}`);
  }

  for (const { path, pkg } of packages) {
    pkg.version = next;
    writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`);
  }
  console.log(next);
}

main();
