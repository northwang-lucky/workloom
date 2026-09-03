/**
 * executor-profiles 单测：renderExecutorProfilesSection 画像小节纯函数（临时项目目录）。
 *
 * 覆盖：whenMain/fallback/legacy 三种命中行的来源标注与层取值；未配置行；
 * mainModel 缺省（whenMain 跳过、兜底照常）；tools 摘要截断与省略规则。
 * 画像解析复用 resolveSubagentDefaults（config.js），本节只做展示不造第二套。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { loadConfig } from '../src/legacy/config.js'
import { renderExecutorProfilesSection } from '../src/legacy/executor-profiles.js'

/** 创建临时项目根。 */
function makeRoot() {
  return mkdtempSync(join(tmpdir(), 'workloom-profile-'))
}

/** 创建临时 home 目录（全局配置层隔离用）。 */
function makeHome() {
  return mkdtempSync(join(tmpdir(), 'workloom-profile-home-'))
}

/** 写入项目 .workloom 下的配置文件（对象 → JSON；字符串 → JS 原文）。 */
function writeProjectFile(root, name, value) {
  const dir = join(root, '.workloom')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, name), typeof value === 'string' ? value : JSON.stringify(value, null, 2))
}

/** 清理一组临时目录。 */
function cleanup(...paths) {
  for (const path of paths) rmSync(path, { recursive: true, force: true })
}

/** 从临时目录加载配置并渲染画像小节（便捷封装）。 */
function renderOf(root, mainModel) {
  const config = loadConfig(root, { homeDir: makeHome() })
  return renderExecutorProfilesSection(config, { mainModel }).join('\n')
}

test('whenMain 命中行：model/effort/tools 摘要 + project 层来源，tools 超 4 项截断留计数', () => {
  const root = makeRoot()
  writeProjectFile(root, 'config.json', {
    subagent_profiles: [
      {
        whenMain: 'kimi-coding/k3',
        subagents: {
          implement: {
            model: 'deepseek/deepseek-v4-pro',
            effort: 'max',
            tools: {
              includes: [
                'lsp_diagnostics',
                'lsp_symbols',
                'lsp_completion',
                'lsp_signature',
                'lsp_code_action',
                'lsp_inlay_hints',
              ],
              excludes: ['web_fetch'],
            },
          },
        },
      },
    ],
  })
  try {
    assert.equal(
      renderOf(root, 'kimi-coding/k3'),
      [
        'Executor profiles (main model kimi-coding/k3):',
        '  research: not configured (inherits parent session model)',
        '  implement: deepseek/deepseek-v4-pro | effort max | tools: includes [lsp_diagnostics, lsp_symbols, lsp_completion, lsp_signature, … +2], excludes [web_fetch] | source: project config (whenMain match)',
        '  check: not configured (inherits parent session model)',
        '  frontend: not configured (inherits parent session model)',
      ].join('\n'),
    )
  } finally {
    cleanup(root)
  }
})

test('fallback 与 legacy 行：来源层分别取 profiles/subagents 最后写入层', () => {
  const root = makeRoot()
  writeProjectFile(root, 'config.json', {
    subagent_profiles: [
      {
        subagents: {
          implement: {
            model: 'deepseek/deepseek-v4-pro',
            effort: 'medium',
            tools: { includes: ['lsp_*'] },
          },
        },
      },
    ],
  })
  writeProjectFile(root, 'config.local.json', {
    subagents: {
      check: { model: 'deepseek-official/deepseek-v4-flash', effort: 'low' },
      research: { effort: 'high' },
    },
  })
  try {
    assert.equal(
      renderOf(root, 'kimi-coding/k3'),
      [
        'Executor profiles (main model kimi-coding/k3):',
        '  research: effort high | source: local config (legacy subagents)',
        '  implement: deepseek/deepseek-v4-pro | effort medium | tools: includes [lsp_*] | source: project config (fallback entry)',
        '  check: deepseek-official/deepseek-v4-flash | effort low | source: local config (legacy subagents)',
        '  frontend: not configured (inherits parent session model)',
      ].join('\n'),
    )
  } finally {
    cleanup(root)
  }
})

test('mainModel 缺省：标题标注 unknown、whenMain 条目跳过、兜底/legacy 照常解析', () => {
  const root = makeRoot()
  writeProjectFile(root, 'config.json', {
    subagent_profiles: [
      {
        whenMain: 'kimi-coding/k3',
        subagents: {
          research: { model: 'deepseek/deepseek-v4-flash', effort: 'high' },
        },
      },
      {
        subagents: {
          implement: { model: 'deepseek/deepseek-v4-pro', tools: { includes: ['lsp_*'] } },
        },
      },
    ],
    subagents: { check: { effort: 'medium' } },
  })
  try {
    assert.equal(
      renderOf(root, undefined),
      [
        'Executor profiles (main model unknown; whenMain entries skipped):',
        '  research: not configured (inherits parent session model)',
        '  implement: deepseek/deepseek-v4-pro | tools: includes [lsp_*] | source: project config (fallback entry)',
        '  check: effort medium | source: project config (legacy subagents)',
        '  frontend: not configured (inherits parent session model)',
      ].join('\n'),
    )
    // whenMain 命中条件与未知 mainModel 互斥：已知 mainModel 时 whenMain 条目恢复
    const config = loadConfig(root, { homeDir: makeHome() })
    const section = renderExecutorProfilesSection(config, { mainModel: 'kimi-coding/k3' })
    assert.ok(section.some((line) => line.includes('research: deepseek/deepseek-v4-flash')))
    assert.ok(section.some((line) => line.includes('(whenMain match)')))
  } finally {
    cleanup(root)
  }
})

test('tools 摘要：单侧配置只出单段；两侧为空省略 tools 段；excludes 超 4 项同样截断', () => {
  const root = makeRoot()
  writeProjectFile(root, 'config.json', {
    subagent_profiles: [
      {
        subagents: {
          research: {
            tools: { excludes: ['e1', 'e2', 'e3', 'e4', 'e5', 'e6'] },
          },
          implement: { model: 'deepseek/deepseek-v4-pro' },
          check: {
            effort: 'low',
            tools: { includes: [], excludes: [] },
          },
        },
      },
    ],
  })
  try {
    assert.equal(
      renderOf(root, 'kimi-coding/k3'),
      [
        'Executor profiles (main model kimi-coding/k3):',
        '  research: tools: excludes [e1, e2, e3, e4, … +2] | source: project config (fallback entry)',
        '  implement: deepseek/deepseek-v4-pro | source: project config (fallback entry)',
        '  check: effort low | source: project config (fallback entry)',
        '  frontend: not configured (inherits parent session model)',
      ].join('\n'),
    )
  } finally {
    cleanup(root)
  }
})

test('model 命中且 tools 未配置：行不含 tools 段，来源随 model（whenMain 优先于 effort/legacy）', () => {
  const root = makeRoot()
  writeProjectFile(root, 'config.json', {
    subagents: { implement: { effort: 'high' } },
    subagent_profiles: [
      {
        whenMain: 'kimi-coding/k3',
        subagents: {
          implement: { model: 'deepseek/deepseek-v4-pro', effort: 'max' },
        },
      },
    ],
  })
  try {
    assert.equal(
      renderOf(root, 'kimi-coding/k3'),
      [
        'Executor profiles (main model kimi-coding/k3):',
        '  research: not configured (inherits parent session model)',
        '  implement: deepseek/deepseek-v4-pro | effort max | source: project config (whenMain match)',
        '  check: not configured (inherits parent session model)',
        '  frontend: not configured (inherits parent session model)',
      ].join('\n'),
    )
  } finally {
    cleanup(root)
  }
})

test('配置文件为空时四 kind 全部 not configured（未配置回退文案）', () => {
  const root = makeRoot()
  try {
    assert.equal(
      renderOf(root, 'kimi-coding/k3'),
      [
        'Executor profiles (main model kimi-coding/k3):',
        '  research: not configured (inherits parent session model)',
        '  implement: not configured (inherits parent session model)',
        '  check: not configured (inherits parent session model)',
        '  frontend: not configured (inherits parent session model)',
      ].join('\n'),
    )
  } finally {
    cleanup(root)
  }
})

test('来源标注：global 层 profiles 写入时行标 global config', () => {
  const root = makeRoot()
  const home = makeHome()
  const homeDir = join(home, '.workloom')
  mkdirSync(homeDir, { recursive: true })
  writeFileSync(
    join(homeDir, 'config.json'),
    JSON.stringify({
      subagent_profiles: [
        { subagents: { implement: { model: 'deepseek/deepseek-v4-pro', effort: 'high' } } },
      ],
    }),
  )
  try {
    const config = loadConfig(root, { homeDir: home })
    const section = renderExecutorProfilesSection(config, { mainModel: 'kimi-coding/k3' })
    assert.equal(config.subagentProfilesSource, 'global')
    assert.ok(section.some((line) => line.includes('source: global config (fallback entry)')))
  } finally {
    cleanup(root, home)
  }
})
