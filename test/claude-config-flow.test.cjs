const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

function loadSample () {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'claude-config.sample.json'), 'utf8'))
}

// 模拟 ClaudeConfig UI 的编辑→保存数据流：
// draft = 深拷贝；setAtPath 按 segments 写回；保存时经 validate + apply。
test('UI edit-save flow writes editable paths and preserves read-only ones', async () => {
  const { applyClaudeConfigDraft, validateClaudeConfigDraft } = await import('../src/ClaudeConfig/schema.js')
  const src = loadSample()
  const draft = JSON.parse(JSON.stringify(src))
  const setAtPath = (segs, next) => {
    let n = draft
    for (let i = 0; i < segs.length - 1; i++) {
      if (n[segs[i]] == null) n[segs[i]] = {}
      n = n[segs[i]]
    }
    n[segs[segs.length - 1]] = next
  }

  setAtPath(['showSpinnerTree'], false)
  setAtPath(['mcpServers', 'playwright', 'env', 'PLAYWRIGHT_TOKEN'], 'edited-token')
  setAtPath(['mcpServers', 'myNew'], { type: 'stdio', command: 'node', args: ['s.js'], env: { A: '1' } })
  delete draft.mcpServers.pencil
  setAtPath(['projects', 'D:/code/example-project', 'allowedTools'], ['Read', 'Write', 'Bash'])
  setAtPath(['machineID'], 'HACKED') // 只读，应被忽略

  assert.equal(validateClaudeConfigDraft(draft).valid, true)
  const out = applyClaudeConfigDraft(src, draft)

  assert.equal(out.showSpinnerTree, false)
  assert.equal(out.mcpServers.playwright.env.PLAYWRIGHT_TOKEN, 'edited-token')
  assert.deepEqual(out.mcpServers.myNew.args, ['s.js'])
  assert.equal(out.mcpServers.pencil, undefined)
  assert.deepEqual(out.projects['D:/code/example-project'].allowedTools, ['Read', 'Write', 'Bash'])
  // 只读字段保留源值
  assert.equal(out.machineID, src.machineID)
  assert.equal(out.oauthAccount.emailAddress, src.oauthAccount.emailAddress)
  assert.equal(out.toolUsage.Read, src.toolUsage.Read)
})
