// Deterministic local verification for the ready-case evaluation fixture.
// The fixture spec (.workloom/spec/README.md) requires a deterministic local
// verification. Every assertion below reads committed task artifacts only, so
// repeated runs produce identical results.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export function readArtifact(...segments) {
  return readFileSync(join(projectRoot, ...segments), 'utf8')
}

export function acceptanceCriteria(prd) {
  return [...new Set(prd.match(/AC\d+/g) ?? [])].sort()
}

test('fixture spec declares a deterministic local verification', () => {
  const spec = readArtifact('.workloom', 'spec', 'README.md')
  assert.match(spec, /deterministic local verification/)
  assert.ok(spec.trim().length > 0, 'fixture spec must not be empty')
})

test('prd keeps R1, R2 and both acceptance criteria', () => {
  const prd = readArtifact('.workloom', 'tasks', 'ready-case', 'prd.md')
  assert.match(prd, /- R1:/)
  assert.match(prd, /- R2:/)
  assert.deepEqual(acceptanceCriteria(prd), ['AC1', 'AC2'])
})

test('plan covers both acceptance criteria', () => {
  const prd = readArtifact('.workloom', 'tasks', 'ready-case', 'prd.md')
  const plan = readArtifact('.workloom', 'tasks', 'ready-case', 'plan.md')
  for (const ac of acceptanceCriteria(prd)) {
    assert.ok(plan.includes(ac), `plan is missing ${ac}`)
  }
})

test('repeated reads of the same artifact are byte identical', () => {
  const first = readArtifact('.workloom', 'spec', 'README.md')
  const second = readArtifact('.workloom', 'spec', 'README.md')
  assert.equal(first, second)
})

// CASE revalidation probe: harmless trailing comment, no behavioral change.
