import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const [, , taskDir, fingerprintLogPath] = process.argv

const fail = (reason) => {
  console.error(`BINDING=failed reason=${reason}`)
  process.exit(1)
}

try {
  if (taskDir === undefined || fingerprintLogPath === undefined) fail('usage')

  const task = JSON.parse(readFileSync(join(taskDir, 'task.json'), 'utf8'))
  const caseDocument = readFileSync(join(taskDir, 'case.md'), 'utf8')
  const resultDocument = readFileSync(join(taskDir, 'case-result.md'), 'utf8')
  const fingerprintLog = readFileSync(fingerprintLogPath, 'utf8')

  const frontMatter = (content) => {
    const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content)
    if (match === null) return {}
    const fields = {}
    for (const line of match[1].split('\n')) {
      const separator = line.indexOf(':')
      if (separator <= 0) continue
      const key = line.slice(0, separator).trim()
      let value = line.slice(separator + 1).trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      fields[key] = value
    }
    return fields
  }

  const caseHash = createHash('sha256')
    .update(caseDocument.replace(/\r\n/g, '\n').replace(/\r/g, '\n'), 'utf8')
    .digest('hex')
  const resultMeta = frontMatter(resultDocument)
  const fingerprintMatch = /codeFingerprint=([0-9a-f]{64})/.exec(fingerprintLog)
  const referenced = [...resultDocument.matchAll(/`(case-evidence\/[^`]+)`/g)].map((match) => match[1])

  const checks = [
    ['confirmed-case-hash-matches-case-document', task.case?.caseHash === caseHash],
    ['result-case-hash-matches-confirmed-case', resultMeta.caseHash === task.case?.caseHash],
    ['result-check-session-matches-design-session', resultMeta.checkSession === task.case?.designSession],
    ['result-code-baseline-carries-the-canonical-fingerprint', fingerprintMatch !== null && String(resultMeta.codeBaseline).includes(`codeFingerprint=${fingerprintMatch[1]}`)],
    ['result-status-is-passed', resultMeta.status === 'passed'],
    ['every-referenced-evidence-file-exists', referenced.length > 0 && referenced.every((path) => existsSync(join(taskDir, path)))],
  ]

  const failed = checks.filter(([, ok]) => !ok).map(([name]) => name)
  if (failed.length > 0) fail(`failed=${JSON.stringify(failed)}`)

  console.log(`BINDING=ok checks=${checks.length}`)
  process.exit(0)
} catch (error) {
  fail(String(error?.message ?? error))
}
