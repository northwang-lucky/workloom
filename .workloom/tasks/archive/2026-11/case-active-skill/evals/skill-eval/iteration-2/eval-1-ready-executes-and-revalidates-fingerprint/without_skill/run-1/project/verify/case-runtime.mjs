import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * Deterministic verification harness for the CASE of tasks/ready-case.
 * The confirmed CASE is the acceptance baseline: keep the exported names, the
 * check identifiers and the output line format stable so C1 stays decidable.
 */

const TASK_DIR = '.workloom/tasks/ready-case'
const PRD_PATH = `${TASK_DIR}/prd.md`
const PLAN_PATH = `${TASK_DIR}/plan.md`
const SPEC_PATH = '.workloom/spec/README.md'
const TASK_JSON_PATH = `${TASK_DIR}/task.json`
const OPEN_NODES_MARKER = '<!-- workloom:open-nodes=none -->'
const SPEC_PHRASE = 'deterministic local verification'
const HASH_PATTERN = /^[0-9a-f]{64}$/

/** Computes the SHA-256 hex digest of a text, used to compare the PRD against the recorded alignment hash. */
export function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/** Reads a text file; returns null when the file is missing or unreadable so a check reports a failure instead of aborting the run. */
function readTextFile(path) {
  try { return readFileSync(path, 'utf8') } catch { return null }
}

/** Normalizes line endings so a PRD written on any platform yields the same digest. */
function normalizeLineEndings(text) {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

/** Parses the task metadata; returns null when it cannot be read or parsed. */
function readTaskJson(root) {
  const raw = readTextFile(join(root, TASK_JSON_PATH))
  if (raw === null) return null
  try { return JSON.parse(raw) } catch { return null }
}

/** Reads the PRD hash recorded during alignment; returns null when it is absent or malformed. */
function readAlignedPrdHash(taskJson) {
  const hash = taskJson?.alignment?.prdHash
  return typeof hash === 'string' && HASH_PATTERN.test(hash) ? hash : null
}

/** Checks that the PRD declares both AC1 and AC2. */
function checkPrdPresent(root) {
  const text = readTextFile(join(root, PRD_PATH))
  const ok = text !== null && text.includes('AC1') && text.includes('AC2')
  const detail = ok ? `AC1 and AC2 are declared in ${PRD_PATH} (both acceptance ids present)` : `AC1 and AC2 are missing from ${PRD_PATH}`
  return { id: 'prd-present', ok, detail }
}

/** Checks that the PRD carries the open-nodes=none marker, meaning every acceptance node is aligned. */
function checkPrdClosed(root) {
  const text = readTextFile(join(root, PRD_PATH))
  const ok = text !== null && text.includes(OPEN_NODES_MARKER)
  const detail = ok ? `the open-nodes=none marker is in ${PRD_PATH}` : `the open-nodes=none marker is missing from ${PRD_PATH}`
  return { id: 'prd-closed', ok, detail }
}

/** Checks that the implementation plan exists and states its coverage relation. */
function checkPlanPresent(root) {
  const text = readTextFile(join(root, PLAN_PATH))
  const ok = text !== null && text.includes('Covers:')
  const detail = ok ? `Covers: is present in ${PLAN_PATH}` : `Covers: is missing from ${PLAN_PATH}`
  return { id: 'plan-present', ok, detail }
}

/** Checks that the spec states the deterministic local verification requirement. */
function checkSpecPresent(root) {
  const text = readTextFile(join(root, SPEC_PATH))
  const ok = text !== null && text.includes(SPEC_PHRASE)
  const detail = ok ? `"${SPEC_PHRASE}" is present in ${SPEC_PATH}` : `"${SPEC_PHRASE}" is missing from ${SPEC_PATH}`
  return { id: 'spec-present', ok, detail }
}

/** Checks that the PRD digest still matches the alignment.prdHash recorded in task.json. */
function checkAlignmentHash(root) {
  const expected = readAlignedPrdHash(readTaskJson(root))
  const text = readTextFile(join(root, PRD_PATH))
  const actual = text === null ? null : sha256(normalizeLineEndings(text))
  const ok = expected !== null && actual !== null && actual === expected
  const detail = ok ? `the prd.md sha256 ${actual} matches alignment.prdHash` : `the prd.md sha256 ${actual ?? 'unavailable'} does not match alignment.prdHash ${expected ?? 'unavailable'}`
  return { id: 'alignment-hash', ok, detail }
}

/** Runs every check and returns the overall verdict together with the per-check details. */
export function verifyTask(root) {
  const checks = [
    checkPrdPresent(root),
    checkPrdClosed(root),
    checkPlanPresent(root),
    checkSpecPresent(root),
    checkAlignmentHash(root),
  ]
  return { ok: checks.every((check) => check.ok), checks }
}

/** Prints one line per check plus the final result line and returns the process exit code. */
export function main(root) {
  const { ok, checks } = verifyTask(root)
  for (const check of checks) {
    console.log(`${check.ok ? 'ok' : 'fail'} ${check.id} ${check.detail}`)
  }
  console.log(`result: ${ok ? 'pass' : 'fail'}`)
  return ok ? 0 : 1
}

const entry = process.argv[1] === undefined ? null : pathToFileURL(resolve(process.argv[1])).href
if (entry !== null && entry === import.meta.url) {
  process.exitCode = main(process.cwd())
}
