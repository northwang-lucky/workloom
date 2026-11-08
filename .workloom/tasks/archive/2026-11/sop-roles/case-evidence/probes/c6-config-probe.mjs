// C6 配置探针：根层级 subagents 退役、roles 内层字段、两层解析链、画像节直出
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadConfig, resolveSubagentDefaults, WorkloomConfigError, assembleSessionContext } from '/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/worktree/11-06-sop-roles/packages/core/src/index.ts'

const baseHome = mkdtempSync(join(tmpdir(), 'workloom-case-c6-'))
process.env.HOME = baseHome
process.env.TMPDIR = baseHome
let failures = 0
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`)
  if (!cond) failures++
}
const home = join(baseHome, 'home')
mkdirSync(home, { recursive: true })
const root = join(baseHome, 'proj')
mkdirSync(join(root, '.workloom'), { recursive: true })
const cfgPath = join(root, '.workloom', 'config.json')
const writeConfig = (obj) => writeFileSync(cfgPath, JSON.stringify(obj, null, 2))

// 1. 根层级 subagents → 抛错含迁移指引
writeConfig({ subagents: { researcher: { model: 'm' } } })
let e1 = null
try { loadConfig(root, { homeDir: home }) } catch (e) { e1 = e }
check('根层级 subagents 抛 WorkloomConfigError', e1 instanceof WorkloomConfigError, e1?.message ?? '未抛错')
check('错误 field 为 subagents', e1?.field === 'subagents', String(e1?.field))
check('文案含 no longer supported 与 subagent_profiles 迁移指引', /no longer supported/.test(e1?.message ?? '') && /migrate to subagent_profiles/.test(e1?.message ?? ''))

// 2. 与 subagent_profiles 并存 → 先报根层级退役错误
writeConfig({ subagents: { researcher: { model: 'm' } }, subagent_profiles: [{ roles: { researcher: { model: 'm2' } } }] })
let e2 = null
try { loadConfig(root, { homeDir: home }) } catch (e) { e2 = e }
check('并存时先报根层级退役错误（field=subagents）', e2 instanceof WorkloomConfigError && e2.field === 'subagents', e2?.message ?? '未抛错')

// 3. roles 条目缺 checker 角色键 → 继承宿主默认
writeConfig({ subagent_profiles: [{ roles: { developer: { model: 'p/m', effort: 'high' } } }] })
const cfg = loadConfig(root, { homeDir: home })
const r1 = resolveSubagentDefaults(cfg, 'checker', {}, 'p/main')
check('缺角色键 model 为 undefined（继承父会话默认）', r1.model === undefined, String(r1.model))
check('缺角色键 effort 为 undefined', r1.effort === undefined, String(r1.effort))
const r2 = resolveSubagentDefaults(cfg, 'developer', {}, 'p/main')
check('有配置角色返回 model/effort', r2.model === 'p/m' && r2.effort === 'high', JSON.stringify([r2.model, r2.effort]))
check('来源标注 fallback（无 whenMain 兜底条目）', r2.configSources?.model === 'fallback', String(r2.configSources?.model))

// 4. 条目内层旧字段名 subagents → 抛错含 roles 迁移指引
writeConfig({ subagent_profiles: [{ subagents: { developer: { model: 'm' } } }] })
let e4 = null
try { loadConfig(root, { homeDir: home }) } catch (e) { e4 = e }
check('条目内旧字段名 subagents 抛错', e4 instanceof WorkloomConfigError, e4?.message ?? '未抛错')
check('文案含 roles 改名迁移指引', /rename the field to roles/.test(e4?.message ?? ''), e4?.message ?? '')

// 5. roles 条目内旧角色键 → 一次性 WARNING 不抛错
writeConfig({ subagent_profiles: [{ roles: { implement: { model: 'm-legacy' } } }] })
const warns = []
const origWarn = console.warn
console.warn = (m) => warns.push(String(m))
let cfg5 = null, e5 = null
try { cfg5 = loadConfig(root, { homeDir: home }) } catch (e) { e5 = e }
console.warn = origWarn
check('旧角色键不抛错', e5 === null && cfg5 !== null, e5?.message ?? '')
check('旧角色键输出 WARNING 且指向新键名', warns.some((w) => /legacy executor kind key/.test(w)), JSON.stringify(warns))

// 6. whenMain 命中与跳过
writeConfig({ subagent_profiles: [{ whenMain: 'p/main', roles: { developer: { model: 'p/when' } } }, { roles: { developer: { model: 'p/fb' } } }] })
const cfg6 = loadConfig(root, { homeDir: home })
const rw = resolveSubagentDefaults(cfg6, 'developer', {}, 'p/main')
check('whenMain 命中取 p/when 且来源 whenMain', rw.model === 'p/when' && rw.configSources?.model === 'whenMain', JSON.stringify([rw.model, rw.configSources?.model]))
const rw2 = resolveSubagentDefaults(cfg6, 'developer', {}, undefined)
check('mainModel 缺失（undefined，正规通道归一形态）时 whenMain 跳过、回退兜底条目', rw2.model === 'p/fb' && rw2.configSources?.model === 'fallback', JSON.stringify([rw2.model, rw2.configSources?.model]))

// 7. 画像节直出
writeConfig({ subagent_profiles: [{ roles: { developer: { model: 'p/m', effort: 'high' } } }] })
const cfg7 = loadConfig(root, { homeDir: home })
const [, text] = assembleSessionContext({ root, workflowSteps: [], config: cfg7, mainModel: 'p/main' })
check('节头逐字（mainModel 在位）', text.includes('Executor profiles (main model p/main):'))
check('无配置角色 info 行逐字', text.includes('  checker: not configured (inherits parent session model)'))
check('有配置角色行含 model', / {2}developer: .*p\/m/.test(text), (text.split('\n').find((l) => l.trim().startsWith('developer:')) ?? ''))
const [, text2] = assembleSessionContext({ root, workflowSteps: [], config: cfg7, mainModel: null })
check('节头逐字（mainModel 缺失）', text2.includes('Executor profiles (main model unknown; whenMain entries skipped):'))
const [, text3] = assembleSessionContext({ root, workflowSteps: [], config: null })
check('config 加载失败画像节整节降级不渲染', !text3.includes('Executor profiles'))

rmSync(baseHome, { recursive: true, force: true })
console.log(failures === 0 ? 'C6 RESULT: ALL PASS' : `C6 RESULT: ${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
