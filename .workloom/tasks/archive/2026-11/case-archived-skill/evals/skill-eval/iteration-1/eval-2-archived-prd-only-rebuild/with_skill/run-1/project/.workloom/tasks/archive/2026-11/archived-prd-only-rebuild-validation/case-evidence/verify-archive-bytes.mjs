import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const [, , archiveDir, manifestPath] = process.argv

const fail = (reason) => {
  console.error(`ARCHIVE_BYTES=failed reason=${reason}`)
  process.exit(1)
}

try {
  if (archiveDir === undefined || manifestPath === undefined) fail('usage')

  const walk = (dir) => {
    const files = []
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) files.push(...walk(path))
      else files.push({ path, regular: entry.isFile() })
    }
    return files
  }

  const entries = walk(archiveDir).sort((left, right) => left.path.localeCompare(right.path))
  const unsupported = entries.filter((entry) => !entry.regular).map((entry) => relative(archiveDir, entry.path))
  if (unsupported.length > 0) fail(`unsupported-entries=${JSON.stringify(unsupported)}`)

  const actual = {}
  for (const entry of entries) {
    actual[relative(archiveDir, entry.path)] = createHash('sha256').update(readFileSync(entry.path)).digest('hex')
  }

  const expected = JSON.parse(readFileSync(manifestPath, 'utf8')).files
  const expectedPaths = Object.keys(expected).sort()
  const actualPaths = Object.keys(actual).sort()
  const missing = expectedPaths.filter((path) => actual[path] === undefined)
  const extra = actualPaths.filter((path) => expected[path] === undefined)
  const mismatched = expectedPaths.filter(
    (path) => actual[path] !== undefined && actual[path] !== expected[path],
  )

  if (missing.length > 0 || extra.length > 0 || mismatched.length > 0) {
    fail(`missing=${JSON.stringify(missing)} extra=${JSON.stringify(extra)} mismatched=${JSON.stringify(mismatched)}`)
  }

  console.log(`ARCHIVE_BYTES=ok files=${actualPaths.length} manifest=${manifestPath}`)
  process.exit(0)
} catch (error) {
  fail(String(error?.message ?? error))
}
