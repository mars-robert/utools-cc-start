const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

function loadSample () {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'claude-config.sample.json'), 'utf8'))
}

test('Claude config model classifies editable, read-only, and masked nodes', async () => {
  const { buildClaudeConfigModel } = await import('../src/ClaudeConfig/schema.js')
  const sample = loadSample()
  const model = buildClaudeConfigModel(sample)

  assert.equal(model.editable.some((n) => n.path === 'installMethod'), true)
  assert.equal(model.editable.some((n) => n.path === 'showSpinnerTree'), true)
  assert.equal(model.readOnly.some((n) => n.path === 'toolUsage'), true)
  assert.equal(model.readOnly.some((n) => n.path === 'toolUsage.Read'), true)
  assert.equal(model.readOnly.some((n) => n.path === 'skillUsage'), true)
  assert.equal(model.readOnly.some((n) => n.path === 'tipsHistory.plan-mode-for-complex-tasks'), true)
  assert.equal(model.readOnly.some((n) => n.path === 'cachedGrowthBookFeatures'), true)
  assert.equal(model.readOnly.some((n) => n.path === 'pluginUsage'), true)
  assert.equal(model.readOnly.some((n) => n.path === 'groveConfigCache'), true)
  assert.equal(model.readOnly.some((n) => n.path === 'overageCreditGrantCache'), true)
  assert.equal(model.readOnly.some((n) => n.path === 'machineID'), true)
  assert.equal(model.masked.some((n) => n.path === 'oauthAccount.emailAddress'), true)
  // env 现在可编辑（不再脱敏）
  assert.equal(model.editable.some((n) => n.path === 'mcpServers.playwright.env'), true)
  assert.equal(model.editable.some((n) => n.path === 'projects.D:/code/example-project.mcpServers.project-mcp.env'), true)
})

test('mcpServers tree and project subtrees are editable; project stats stay read-only', async () => {
  const { buildClaudeConfigModel } = await import('../src/ClaudeConfig/schema.js')
  const sample = loadSample()
  const model = buildClaudeConfigModel(sample)

  assert.equal(model.editable.some((n) => n.path === 'mcpServers.playwright.command'), true)
  assert.equal(model.editable.some((n) => n.path === 'projects.D:/code/example-project.allowedTools'), true)
  assert.equal(model.editable.some((n) => n.path === 'projects.D:/code/example-project.mcpServers.project-mcp.command'), true)
  assert.equal(model.readOnly.some((n) => n.path === 'projects.D:/code/example-project.lastTotalInputTokens'), true)
})

test('section metadata is cloned per model', async () => {
  const { CLAUDE_CONFIG_SECTIONS, buildClaudeConfigModel } = await import('../src/ClaudeConfig/schema.js')
  const sample = loadSample()
  const model = buildClaudeConfigModel(sample)

  model.sections[0].title = 'Mutated'
  assert.notEqual(CLAUDE_CONFIG_SECTIONS[0].title, 'Mutated')
  assert.equal(buildClaudeConfigModel(sample).sections[0].title, CLAUDE_CONFIG_SECTIONS[0].title)
})

test('non-editable, non-masked top-level keys are classified read-only', async () => {
  const { buildClaudeConfigModel } = await import('../src/ClaudeConfig/schema.js')
  const model = buildClaudeConfigModel({ hash: true, hasSeenTasksHint: true, installMethod: 'global' })

  assert.equal(model.readOnly.some((n) => n.path === 'hash'), true)
  assert.equal(model.readOnly.some((n) => n.path === 'hasSeenTasksHint'), true)
  assert.equal(model.editable.some((n) => n.path === 'installMethod'), true)
})

test('applyClaudeConfigDraft patches only supported paths and preserves unknown fields', async () => {
  const { applyClaudeConfigDraft } = await import('../src/ClaudeConfig/schema.js')
  const source = {
    installMethod: 'global',
    showSpinnerTree: true,
    machineID: 'keep-me',
    unknownThing: { keep: true },
    projects: {
      'D:/code/example-project': {
        allowedTools: ['Read'],
        lastTotalInputTokens: 5
      }
    },
    mcpServers: {
      old: { command: 'npx', args: ['a'] }
    }
  }
  const draft = {
    installMethod: 'local',
    showSpinnerTree: false,
    machineID: 'tampered',
    unknownThing: { keep: false },
    projects: {
      'D:/code/example-project': {
        allowedTools: ['Write'],
        lastTotalInputTokens: 999
      }
    },
    mcpServers: {
      added: { command: 'node', args: ['x'], env: { K: 'v' } }
    }
  }

  const next = applyClaudeConfigDraft(source, draft)

  // 可编辑项被写回
  assert.equal(next.installMethod, 'local')
  assert.equal(next.showSpinnerTree, false)
  assert.deepEqual(next.projects['D:/code/example-project'].allowedTools, ['Write'])
  // mcpServers 整棵覆盖：删除 old、新增 added
  assert.equal(next.mcpServers.old, undefined)
  assert.deepEqual(next.mcpServers.added, { command: 'node', args: ['x'], env: { K: 'v' } })
  // 只读项保留源值，不被 draft 篡改
  assert.equal(next.machineID, 'keep-me')
  assert.deepEqual(next.unknownThing, { keep: true })
  assert.equal(next.projects['D:/code/example-project'].lastTotalInputTokens, 5)
})

test('validateClaudeConfigDraft flags malformed mcpServers entries', async () => {
  const { validateClaudeConfigDraft } = await import('../src/ClaudeConfig/schema.js')
  assert.equal(validateClaudeConfigDraft({ mcpServers: { s: { args: 'nope' } } }).valid, false)
  assert.equal(validateClaudeConfigDraft({ mcpServers: { s: { env: [] } } }).valid, false)
  assert.equal(validateClaudeConfigDraft({ mcpServers: { s: { command: 'npx', args: ['x'], env: { A: '1' } } } }).valid, true)
})
