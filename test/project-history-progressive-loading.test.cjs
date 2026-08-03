const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'ProjectHistory', 'index.vue'), 'utf8')

test('ProjectHistory routes only Codex list and active loading through the async coordinator', () => {
  assert.match(source, /import\s+\{\s*createHistoryLoader\s*\}\s+from\s+['"]\.\/load-core['"]/)
  assert.match(source, /createHistoryLoader\s*\(/)
  assert.match(source, /window\.services\.listCodexProjectSessionsAsync\s*\(/)
  assert.match(source, /window\.services\.listActiveCodexSessionsAsync\s*\(/)

  assert.doesNotMatch(source, /window\.services\.listCodexProjectSessions\s*\(/)
  assert.doesNotMatch(source, /window\.services\.listActiveCodexSessions\s*\(/)

  assert.match(source, /window\.services\.listProjectMemories\s*\(/)
  assert.match(source, /window\.services\.listProjectSessions\s*\(/)
  assert.match(source, /window\.services\.listActiveSessions\s*\(/)

  assert.match(source, /const\s+LIVE_MS\s*=\s*2500\b/)
  assert.match(source, /setInterval\s*\(\s*refreshActive\s*,\s*LIVE_MS\s*\)/)
  assert.match(source, /const\s+POLL_MS\s*=\s*800\b/)
  assert.match(source, /setInterval\s*\(\s*refreshSession\s*,\s*POLL_MS\s*\)/)
  assert.match(source, /window\.services\.readCodexSession\s*\(/)
  assert.match(source, /window\.services\.readSession\s*\(/)

  assert.match(source, /onUnmounted\s*\(\s*\(\)\s*=>\s*\{[\s\S]*?codexHistoryLoader\?\.invalidate\s*\(\s*\)/)
})
