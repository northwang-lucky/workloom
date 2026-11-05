import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"

const dir = ".workloom/tasks/batch-b"
const sha256 = (text) => createHash("sha256").update(text.replace(/\r\n|\r/g, "\n"), "utf8").digest("hex")
const task = JSON.parse(readFileSync(`${dir}/task.json`, "utf8"))
const prd = readFileSync(`${dir}/prd.md`, "utf8")
const plan = readFileSync(`${dir}/plan.md`, "utf8")
const spec = readFileSync(".workloom/spec/README.md", "utf8")
const checks = {
  "spec-entry": spec.includes("deterministic local verification"),
  "prd-requirements": /^- R1:/m.test(prd) && /^- R2:/m.test(prd),
  "prd-criteria": /^- AC1:/m.test(prd) && /^- AC2:/m.test(prd),
  "plan-coverage": plan.includes("AC1, AC2"),
  "alignment-hash": sha256(prd) === task.alignment.prdHash,
  "case-required": task.case.required === true,
}
for (const [name, ok] of Object.entries(checks)) console.log(`${name}: ${ok ? "ok" : "mismatch"}`)
const ok = Object.values(checks).every(Boolean)
console.log(`result: ${ok ? "passed" : "failed"}`)
process.exit(ok ? 0 : 1)
