/**
 * CASE 确定性本地校验脚本。
 *
 * 定位：本次 CASE 的校验脚手架，不是产品代码。
 *
 * 约束：
 * - 只读，绝不写入、删除或派生任何进程；
 * - 零依赖，不引入 package.json 与锁文件；
 * - 不使用时钟、随机数与网络，同一棵输入目录树每次运行结果一致；
 * - 项目根目录由 import.meta.url 推导，可在任意 cwd 下执行。
 * - 字节稳定：本文件是 CASE 的测量基线，任何字节改动都会使已记录 RESULT 的
 *   codeFingerprint 失效，触发一次完整的 SR/C/覆盖率重跑。
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

/** 脚本位于 scripts/ 下，项目根目录是它的上级目录。 */
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 本次 CASE 的任务材料目录。 */
const TASK_DIR = path.join(PROJECT_ROOT, '.workloom', 'tasks', 'ready-case');

/** 固定装置规范文件，声明本地校验方式。 */
const SPEC_FILE = path.join(PROJECT_ROOT, '.workloom', 'spec', 'README.md');

/**
 * 统一换行为 LF。
 *
 * 不同平台写入的 CRLF 与 CR 会改变字节内容，先归一化再做哈希与文本匹配。
 */
function normalizeLf(text) {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/** 读取文本文件，并归一化换行符。 */
function readText(filePath) {
  return normalizeLf(readFileSync(filePath, 'utf8'));
}

/** 计算文本的 sha256 十六进制摘要。 */
function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** 读取任务材料目录下的 JSON 文件。 */
function readTaskJson(name) {
  return JSON.parse(readText(path.join(TASK_DIR, name)));
}

test('prd.md 的 sha256 与 task.json 的 alignment.prdHash 一致', () => {
  const prd = readText(path.join(TASK_DIR, 'prd.md'));
  const task = readTaskJson('task.json');
  assert.equal(sha256(prd), task.alignment.prdHash);
});

test('plan.md 保留 ## Steps 标题与步骤 1.1 verify 标题', () => {
  const plan = readText(path.join(TASK_DIR, 'plan.md'));
  assert.match(plan, /^## Steps[ \t]*$/m);
  assert.match(plan, /^#### 步骤 1\.1 verify[ \t]*$/m);
});

test('task.json 保留 status=in_progress、mode=full 与 case.required=true', () => {
  const task = readTaskJson('task.json');
  assert.equal(task.status, 'in_progress');
  assert.equal(task.mode, 'full');
  assert.equal(task.case.required, true);
});

test('规范文件声明了确定性的本地校验方式', () => {
  const spec = readText(SPEC_FILE);
  assert.match(spec, /deterministic\s+local\s+verification/i);
});
