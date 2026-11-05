set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

cat > "$WORK_DIR/run-runtime-cases.mjs" <<'EOF'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const workDir = process.argv[2] ?? ''
const caseText = readFileSync('.workloom/tasks/batch-b/case.md', 'utf8')
const runtimePart = caseText.split(/^## Coverage\r?$/m)[0] ?? ''
const fence = String.fromCharCode(96).repeat(3)
const pattern = new RegExp(`^${fence}bash\\r?\\n([\\s\\S]*?)^${fence}\\r?$`, 'gm')
const blocks = [...runtimePart.matchAll(pattern)].map((m) => m[1] ?? '')
if (blocks.length === 0) {
console.error('FAIL case.md declares no bash block under Runtime Cases')
process.exit(1)
}
for (const [index, block] of blocks.entries()) {
const script = `${workDir}/runtime-case-${index + 1}.sh`
writeFileSync(script, block)
try {
execFileSync('bash', [script], { stdio: 'inherit' })
} catch {
console.error(`FAIL runtime case block ${index + 1} exited non-zero`)
process.exit(1)
}
}
console.log(`PASS aggregate command executed ${blocks.length} runtime case block(s)`)
EOF

node "$WORK_DIR/run-runtime-cases.mjs" "$WORK_DIR"
