/**
 * workloom configuration — factory form (EXAMPLE ONLY, not read by loadConfig).
 *
 * loadConfig merges three layers: global $HOME/.workloom/config.json|js →
 * project .workloom/config.json|js → local .workloom/config.local.json|js.
 * An object export is merged by top-level key ({...base, ...doc}); a factory
 * receives the merged lower layers (undefined for the global layer) and returns
 * this layer's final document (no further merging). Deep merge was removed.
 *
 * The global layer only consumes project-independent fields (subagent_profiles,
 * session_auto_commit, session_commit_message, max_journal_lines,
 * prompt_injection, context_injection); packages/hooks and other fields there
 * fail loudly. The legacy subagents field is still parsed with a deprecation
 * warning; prefer subagent_profiles. tools under a profile entry extends/
 * removes tool names (including lsp_* prefixes) from the default allow list.
 *
 * Copy what you need into config.json; use config.local.json|js for per-machine
 * overrides only. Use the factory form when a layer needs the lower layers'
 * merged result to compute its own document.
 */
module.exports = (base) => ({
  ...base,
  session_commit_message: 'chore: record journal',
  max_journal_lines: 2000,
  session_auto_commit: true,
  context_injection: {
    max_file_bytes: 32768,
    max_artifact_bytes: 65536,
    max_total_bytes: 131072,
  },
  prompt_injection: { skip_keyword: 'no-workloom' },
  hooks: {
    after_create: ['echo task created'],
    after_start: ['echo task started'],
    after_finish: ['echo task finished'],
    after_archive: ['echo task archived'],
  },
  packages: { cli: { path: 'packages/cli' } },
  subagent_profiles: [
    {
      whenMain: 'kimi-coding/k3',
      subagents: { research: { model: 'deepseek-v4-flash', effort: 'high' } },
    },
    {
      subagents: {
        check: {
          model: 'kimi-coding/k3',
          effort: 'max',
          tools: { includes: ['lsp_diagnostics', 'lsp_*'], excludes: ['web_fetch'] },
        },
      },
    },
  ],
})
