// C1 配置探针：rotate_on_busy 五形态解析、全局层、resolve 透出与白名单联动。
// 隔离 HOME/TMPDIR，全部夹具建在 mkdtemp 下并自清理；只读 worktree 代码。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const WORKTREE = '/data00/home/wangyubo.1219/workbench/code-src/github/workloom/.workloom/worktree/11-08-rotate-on-busy'
const { loadConfig, resolveSubagentDefaults, WorkloomConfigError } = await import(
  `${WORKTREE}/packages/core/src/index.ts`
)

const base = mkdtempSync(join(tmpdir(), 'workloom-case-c1-'))
const home = join(base, 'home')
mkdirSync(join(home, '.workloom'), { recursive: true })
process.env.HOME = home
process.env.TMPDIR = base

let failures = 0
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra === '' ? '' : ` — ${extra}`}`)
  if (!cond) failures++
}

/** 建一个临时项目根，写入给定配置对象。 */
function makeRoot(name, configDoc) {
  const root = join(base, name)
  mkdirSync(join(root, '.workloom'), { recursive: true })
  writeFileSync(join(root, '.workloom', 'config.json'), JSON.stringify(configDoc, null, 2))
  return root
}

/** 以单角色 developer 条目构造配置。 */
function singleRole(roleValue) {
  return { subagent_profiles: [{ roles: { developer: { rotate_on_busy: roleValue } } }] }
}

try {
  // ---------- 形态 1：true 落字段并透出 ----------
  {
    const root = makeRoot('true', singleRole(true))
    const config = loadConfig(root, { homeDir: home })
    const entry = config.subagentProfiles[0].roles.developer
    check('true: 条目 rotateOnBusy === true', entry.rotateOnBusy === true, String(entry.rotateOnBusy))
    check('true: 条目含 rotateOnBusy 属性', 'rotateOnBusy' in entry)
    const result = resolveSubagentDefaults(config, 'developer', {}, 'p/main')
    check('true: resolve 透出 rotateOnBusy === true', result.rotateOnBusy === true, String(result.rotateOnBusy))
    check('true: configSources 形状未扩展 rotateOnBusy', !('rotateOnBusy' in result.configSources), JSON.stringify(result.configSources))
  }

  // ---------- 形态 2：false 不落字段、不透出 ----------
  {
    const root = makeRoot('false', singleRole(false))
    const config = loadConfig(root, { homeDir: home })
    const entry = config.subagentProfiles[0].roles.developer
    check('false: 条目不含 rotateOnBusy 属性', !('rotateOnBusy' in entry), JSON.stringify(entry))
    const result = resolveSubagentDefaults(config, 'developer', {}, 'p/main')
    check('false: resolve 不含 rotateOnBusy 属性', !('rotateOnBusy' in result), JSON.stringify(result.rotateOnBusy))
  }

  // ---------- 形态 3/4：字符串与数字布尔 fail loud，field 含完整路径 ----------
  for (const [label, bad] of [
    ['字符串 "true"', 'true'],
    ['数字 1', 1],
    ['null', null],
  ]) {
    try {
      loadConfig(makeRoot(`bad-${label.replaceAll(' ', '-')}`, singleRole(bad)), { homeDir: home })
      check(`${label}: 抛 WorkloomConfigError`, false, '未抛错')
    } catch (error) {
      check(`${label}: 抛 WorkloomConfigError`, error instanceof WorkloomConfigError, error?.constructor?.name ?? 'unknown')
      check(
        `${label}: field 为 subagent_profiles[0].roles.developer.rotate_on_busy`,
        error?.field === 'subagent_profiles[0].roles.developer.rotate_on_busy',
        String(error?.field),
      )
      check(`${label}: 文案含 must be a boolean`, /must be a boolean/.test(error?.message ?? ''), String(error?.message))
    }
  }

  // ---------- 形态 5：缺省不落字段、不透出 ----------
  {
    const root = makeRoot('absent', { subagent_profiles: [{ roles: { developer: { model: 'p/m' } } }] })
    const config = loadConfig(root, { homeDir: home })
    const entry = config.subagentProfiles[0].roles.developer
    check('缺省: 条目不含 rotateOnBusy 属性', !('rotateOnBusy' in entry), JSON.stringify(entry))
    const result = resolveSubagentDefaults(config, 'developer', {}, 'p/main')
    check('缺省: resolve 不含 rotateOnBusy 属性', !('rotateOnBusy' in result), JSON.stringify(result.rotateOnBusy))
  }

  // ---------- 全局层：用户全局四角色配置的加载场景 ----------
  {
    writeFileSync(
      join(home, '.workloom', 'config.json'),
      JSON.stringify({ subagent_profiles: [{ roles: { developer: { rotate_on_busy: true } } }] }, null, 2),
    )
    const root = join(base, 'global-project')
    mkdirSync(join(root, '.workloom'), { recursive: true })
    const config = loadConfig(root, { homeDir: home })
    check(
      '全局层: rotate_on_busy true 解析通过',
      config.subagentProfiles[0].roles.developer.rotateOnBusy === true,
      JSON.stringify(config.subagentProfiles[0].roles.developer),
    )
  }

  // ---------- 白名单联动：未知字段文案 allowed 清单含 rotate_on_busy ----------
  {
    const root = makeRoot('unknown-field', {
      subagent_profiles: [{ roles: { developer: { rotate_on_busy: true, foo: 1 } } }],
    })
    try {
      loadConfig(root, { homeDir: home })
      check('未知字段: 抛 WorkloomConfigError', false, '未抛错')
    } catch (error) {
      check('未知字段: 抛 WorkloomConfigError', error instanceof WorkloomConfigError)
      check(
        '未知字段: field 为 subagent_profiles[0].roles.developer.foo',
        error?.field === 'subagent_profiles[0].roles.developer.foo',
        String(error?.field),
      )
      check(
        '未知字段: allowed 清单含 rotate_on_busy',
        /allowed:.*rotate_on_busy/.test(error?.message ?? ''),
        String(error?.message),
      )
    }
  }
} finally {
  rmSync(base, { recursive: true, force: true })
}

console.log(failures === 0 ? 'C1 PROBE: ALL PASS' : `C1 PROBE: ${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
