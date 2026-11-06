import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
const read = (p) => readFileSync(p, 'utf8')
const baselineWorkflow = execSync('git show main:packages/assets/workflow/workflow.md', { encoding: 'utf8', maxBuffer: 1024 * 1024 })
let failures = 0
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` | ${detail}` : ''}`); if (!ok) failures += 1 }

// step1 workflow.md
const wf = read('packages/assets/workflow/workflow.md')
const bar = wf.split('\n').find((l) => l.startsWith('Authoring bar for plan.md'))
check('step1 1.4 bar 含五字段顺序句', bar.includes('five protocol fields in order — Input, Output, Preconditions, Procedure, Failure'))
check('step1 1.4 bar 含 none 语义', bar.includes('`none` written when a field has no content'))
check('step1 1.4 bar 含锚点边界（仅定位）', bar.includes('only as a unique locating anchor'))
check('step1 1.4 bar 禁完整实现', bar.includes('complete modified code or a new file\'s full implementation is forbidden'))
check('step1 1.4 bar 无旧逐字要求', !bar.includes('exact before/after code') && !bar.includes('carries its full content'))
const crumb = wf.split('\n').find((l) => l.startsWith('The task is in planning.'))
check('step1 面包屑改伪代码门槛', crumb.includes('five-field pseudocode protocol in Edit') && !crumb.includes('exact code change'))
check('step1 version 25', wf.includes('version: 25'))
for (const marker of ['Load in layers: read the plan artifact', 'batch the questions']) {
  const seg = (t) => { const i = t.indexOf(marker); return i === -1 ? null : t.slice(i, t.indexOf('\n', i)) }
  check(`step1 保留句逐字一致：${marker.slice(0, 24)}…`, seg(baselineWorkflow) !== null && seg(baselineWorkflow) === seg(wf))
}
const stepIds = (t) => (t.match(/^#### .+$/gm) ?? []).join('|')
check('step1 步骤 id 集合不变', stepIds(baselineWorkflow) === stepIds(wf))

// step2 plan-authoring.md
const pa = read('packages/assets/skills/workloom-alignment/references/plan-authoring.md')
check('step2 五字段模板按序齐全', pa.indexOf('Input:') < pa.indexOf('Output:') && pa.indexOf('Output:') < pa.indexOf('Preconditions:') && pa.indexOf('Preconditions:') < pa.indexOf('Procedure:') && pa.indexOf('Procedure:') < pa.indexOf('Failure:'))
check('step2 none 语义', pa.includes('write none when nothing special applies') && pa.includes('write none when the step has no failure path'))
check('step2 锚点仅定位边界', pa.includes('unique locating anchor'))
check('step2 禁完整实现要求', pa.includes("never write the complete modified code or a new file's full implementation"))
check('step2 无终稿代码措辞', !pa.includes('before-snippet') && !pa.includes('after-snippet') && !pa.includes('final content'))
check('step2 Covers/(internal)/AC 判据保留', pa.includes('- **Covers** —') && pa.includes('`(internal)`') && pa.includes("every AC in prd.md appears in at least one step's Covers list"))

// step3 alignment SKILL + migrate-plan
const skill = read('packages/assets/skills/workloom-alignment/SKILL.md')
check('step3 alignment 指针改伪代码门槛', skill.includes('five protocol fields in order (Input, Output, Preconditions, Procedure, Failure)') && !skill.includes('exact code change'))
const mp = read('packages/assets/skills/workloom-migrate-plan/SKILL.md')
check('step3 migrate-plan 五字段句', mp.includes('five protocol fields in order (Input, Output, Preconditions, Procedure, Failure)'))
for (const title of ['## Step 1: Scan', '## Step 2: Rewrite prd.md', '## Step 3: Rewrite the plan as plan.md', '## Step 4: Confirm, then remove the originals']) {
  check(`step3 migrate-plan 标题保留：${title.slice(0, 16)}…`, mp.includes(title))
}

// step4 evals.json
const evals = JSON.parse(read('packages/assets/skills/workloom-alignment/evals/evals.json'))
const pseudo = evals.evals.find((e) => e.id === 'align-plan-pseudocode')
check('step4 伪代码场景存在', pseudo !== undefined)
const pseudoText = JSON.stringify(pseudo)
check('step4 场景接受合法伪代码', pseudoText.includes('passes the authoring bar'))
// 「不要求终稿代码」的否定句是合法出现：唯一出现必须挂在 without demanding 之下
check('step4 终稿代码仅出现在否定句中', (pseudoText.match(/before\/after final code/g) ?? []).length === 1 && pseudoText.includes('without demanding before/after final code'))
check('step4 缺输入输出/异常被列为问题', pseudoText.includes('missing input/output fields and a missing failure path'))
check('step4 五字段顺序断言', pseudoText.includes('Input, Output, Preconditions, Procedure, Failure'))
check('step4 无场景要求完整代码', !evals.evals.some((e) => /full implementation|verbatim final code/.test(JSON.stringify(e))))

// step5 语言扫描
const cjk = /[\u3400-\u9fff]/
const assetFiles = ['packages/assets/workflow/workflow.md', 'packages/assets/skills/workloom-alignment/SKILL.md', 'packages/assets/skills/workloom-alignment/references/plan-authoring.md', 'packages/assets/skills/workloom-migrate-plan/SKILL.md', 'packages/assets/skills/workloom-alignment/evals/evals.json']
check('step5 资产无 CJK', assetFiles.every((f) => !cjk.test(read(f))))

console.log(failures === 0 ? 'C4 ASSETS: ALL PASS' : `C4 ASSETS: ${failures} FAILURE(S)`)
process.exitCode = failures === 0 ? 0 : 1
