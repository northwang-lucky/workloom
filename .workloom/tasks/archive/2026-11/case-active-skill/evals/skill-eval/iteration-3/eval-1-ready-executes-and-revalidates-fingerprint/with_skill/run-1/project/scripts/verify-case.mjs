import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// 项目根目录由本文件所在位置推导，保证从任意工作目录执行都能定位到任务材料。
const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TASK_DIR = join(PROJECT_ROOT, '.workloom', 'tasks', 'ready-case');

/**
 * 读取任务目录下的文本文件，并把 CRLF/CR 统一归一化成 LF，
 * 保证哈希计算在换行风格不同的机器上得到同一结果。
 */
function readTaskText(name) {
  return readFileSync(join(TASK_DIR, name), 'utf8').replace(/\r\n?/g, '\n');
}

test('prd.md 的 sha256 与 task.json 记录的 alignment.prdHash 一致', () => {
  const prdText = readTaskText('prd.md');
  const task = JSON.parse(readTaskText('task.json'));
  const prdHash = createHash('sha256').update(prdText, 'utf8').digest('hex');
  assert.equal(prdHash, task.alignment.prdHash);
});

test('plan.md 保留 ## Steps 小节与 步骤 1.1 verify 步骤', () => {
  const planText = readTaskText('plan.md');
  assert.match(planText, /^## Steps$/m);
  assert.match(planText, /^#### 步骤 1\.1 verify$/m);
});

test('case.md 包含六个必需小节以及 SR1/SR2/C1 标题', () => {
  const caseText = readTaskText('case.md');
  const sections = [
    '## References',
    '## Scope',
    '## Static Review',
    '## Runtime Cases',
    '## Coverage',
    '## Traceability',
  ];
  for (const section of sections) {
    assert.ok(caseText.includes(section), `case.md 缺少小节：${section}`);
  }
  for (const heading of ['### SR1', '### SR2', '### C1']) {
    assert.ok(caseText.includes(heading), `case.md 缺少标题：${heading}`);
  }
});
