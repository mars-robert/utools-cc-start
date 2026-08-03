# Codex History Progressive Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the Codex history list without waiting for active-session detection and eliminate all periodic synchronous SQLite work from the Vue renderer thread.

**Architecture:** Add a tested asynchronous Node child-process runner and a standalone Codex history worker that performs SQLite access, file fallback, cwd filtering, and PID checks outside uTools' renderer. Expose Codex-only Promise APIs through preload, then route them through a small progressive-loading coordinator that serializes active refreshes and rejects stale results while leaving the Claude path unchanged.

**Tech Stack:** uTools preload CommonJS, Node child processes and `node:sqlite`, Vue 3 Composition API, Node built-in test runner, Vite.

---

## File Structure

- Create `public/preload/async-child.cjs`: bounded asynchronous `node -e` execution and JSON parsing.
- Create `public/preload/codex-history-worker.cjs`: child-side history discovery and active-session calculation.
- Modify `public/preload/services.js`: expose Promise-based Codex history APIs backed by the two new modules.
- Create `src/ProjectHistory/load-core.js`: framework-independent progressive loader with stale-result and in-flight protection.
- Modify `src/ProjectHistory/index.vue`: use the progressive loader for Codex only.
- Create `test/async-child.test.cjs`: process runner success and failure coverage.
- Create `test/codex-history-worker.test.cjs`: worker filtering, fallback, and liveness coverage.
- Modify `test/services-codex-history.test.cjs`: preload API contract coverage.
- Create `test/history-load-core.test.cjs`: deterministic loading-order and concurrency coverage.
- Create `test/project-history-progressive-loading.test.cjs`: Vue wiring contract that prevents synchronous Codex APIs from returning.

### Task 1: Bounded Async Child-Process Runner

**Files:**
- Create: `public/preload/async-child.cjs`
- Create: `test/async-child.test.cjs`

- [ ] **Step 1: Write failing runner tests**

Create a fake child with `EventEmitter` plus `PassThrough` streams and cover success, non-zero exit, malformed JSON, output overflow, and timeout:

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { PassThrough } = require('node:stream')
const { runNodeJson } = require('../public/preload/async-child.cjs')

function childThat ({ stdout = '', stderr = '', code = 0, close = true } = {}) {
  const child = new EventEmitter()
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.killed = false
  child.kill = () => { child.killed = true; child.emit('close', null, 'SIGTERM') }
  queueMicrotask(() => {
    if (stdout) child.stdout.write(stdout)
    if (stderr) child.stderr.write(stderr)
    child.stdout.end()
    child.stderr.end()
    if (close) child.emit('close', code, null)
  })
  return child
}

test('runNodeJson parses successful JSON output', async () => {
  const value = await runNodeJson('script', {
    spawn: () => childThat({ stdout: '{"ok":true}' })
  })
  assert.deepEqual(value, { ok: true })
})

test('runNodeJson rejects non-zero exit and malformed JSON', async () => {
  await assert.rejects(() => runNodeJson('script', {
    spawn: () => childThat({ code: 2, stderr: 'failed' })
  }), /failed|code 2/)
  await assert.rejects(() => runNodeJson('script', {
    spawn: () => childThat({ stdout: 'not json' })
  }), /JSON/)
})

test('runNodeJson kills output overflow and timeout', async () => {
  const overflow = childThat({ stdout: 'x'.repeat(65) })
  await assert.rejects(() => runNodeJson('script', {
    spawn: () => overflow,
    maxOutputBytes: 64
  }), /output/i)
  assert.equal(overflow.killed, true)

  const hanging = childThat({ close: false })
  await assert.rejects(() => runNodeJson('script', {
    spawn: () => hanging,
    timeoutMs: 5
  }), /timed out/i)
  assert.equal(hanging.killed, true)
})
```

- [ ] **Step 2: Run the runner tests and verify RED**

Run: `node --test test/async-child.test.cjs`

Expected: FAIL with `Cannot find module '../public/preload/async-child.cjs'`.

- [ ] **Step 3: Implement the minimal bounded runner**

Create `public/preload/async-child.cjs`:

```js
const { spawn: defaultSpawn } = require('node:child_process')

function runNodeJson (script, options) {
  const opts = options || {}
  const spawn = opts.spawn || defaultSpawn
  const timeoutMs = opts.timeoutMs || 3000
  const maxOutputBytes = opts.maxOutputBytes || 1024 * 1024

  return new Promise((resolve, reject) => {
    let child
    try {
      child = spawn('node', ['-e', script], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      })
    } catch (error) {
      reject(error)
      return
    }

    let stdout = ''
    let stderr = ''
    let settled = false
    let timer
    const finish = (error, value) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      if (error) reject(error)
      else resolve(value)
    }
    const append = (target, chunk) => {
      const next = target + String(chunk || '')
      if (Buffer.byteLength(next, 'utf8') > maxOutputBytes) {
        finish(new Error('Child process output exceeded limit'))
        try { child.kill() } catch (_) { /* ignore */ }
        return target
      }
      return next
    }

    if (!child || !child.stdout || !child.stderr) {
      finish(new Error('Child process streams unavailable'))
      return
    }
    child.stdout.on('data', (chunk) => { stdout = append(stdout, chunk) })
    child.stderr.on('data', (chunk) => { stderr = append(stderr, chunk) })
    child.once('error', (error) => finish(error))
    child.once('close', (code, signal) => {
      if (settled) return
      if (code !== 0) {
        finish(new Error(stderr.trim() || `Child process exited with code ${code}${signal ? ` (${signal})` : ''}`))
        return
      }
      try { finish(null, JSON.parse(stdout)) } catch (error) { finish(error) }
    })
    timer = setTimeout(() => {
      finish(new Error(`Child process timed out after ${timeoutMs}ms`))
      try { child.kill() } catch (_) { /* ignore */ }
    }, timeoutMs)
  })
}

module.exports = { runNodeJson }
```

- [ ] **Step 4: Run the runner tests and verify GREEN**

Run: `node --test test/async-child.test.cjs`

Expected: 3 tests pass, 0 fail.

- [ ] **Step 5: Commit the runner**

```bash
git add public/preload/async-child.cjs test/async-child.test.cjs
git commit -m "feat: add bounded async node runner"
```

### Task 2: Child-Side Codex History Worker

**Files:**
- Create: `public/preload/codex-history-worker.cjs`
- Create: `test/codex-history-worker.test.cjs`

- [ ] **Step 1: Write failing worker tests**

Cover normalized cwd filtering, subagent exclusion, latest-thread-per-process behavior, dead PID filtering, and the JSONL fallback:

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const worker = require('../public/preload/codex-history-worker.cjs')

test('historyRowsForCwd normalizes cwd and excludes subagents', () => {
  const rows = worker.historyRowsForCwd([
    { id: 'main', cwd: '\\\\?\\D:\\code\\alpha', thread_source: 'user', recency_at_ms: 1 },
    { id: 'sub', cwd: 'D:\\code\\alpha', thread_source: 'subagent', recency_at_ms: 2 },
    { id: 'other', cwd: 'D:\\code\\beta', thread_source: 'user', recency_at_ms: 3 }
  ], 'D:\\code\\alpha', 'win32')
  assert.deepEqual(rows.map((row) => row.id), ['main'])
})

test('computeActiveSessions keeps latest alive thread for each process', () => {
  const active = worker.computeActiveSessions({
    cwd: 'D:\\code\\alpha',
    platform: 'win32',
    threadRows: [
      { id: 'old', cwd: 'D:\\code\\alpha' },
      { id: 'live', cwd: '\\\\?\\D:\\code\\alpha' },
      { id: 'dead', cwd: 'D:\\code\\alpha' },
      { id: 'other', cwd: 'D:\\code\\beta' }
    ],
    logRows: [
      { thread_id: 'old', process_uuid: 'pid:10:x', ts: 1, ts_nanos: 0 },
      { thread_id: 'live', process_uuid: 'pid:10:x', ts: 2, ts_nanos: 0 },
      { thread_id: 'dead', process_uuid: 'pid:20:y', ts: 3, ts_nanos: 0 },
      { thread_id: 'other', process_uuid: 'pid:30:z', ts: 4, ts_nanos: 0 }
    ],
    isPidAlive: (pid) => pid === 10 || pid === 30
  })
  assert.deepEqual(active, [{ sessionId: 'live', status: 'running', pid: 10 }])
})

test('loadHistoryRows scans JSONL files when sqlite is unavailable', () => {
  const root = 'C:\\Users\\tester\\.codex\\sessions'
  const file = path.join(root, '2026', '08', '03', 'rollout-main.jsonl')
  const jsonl = [
    JSON.stringify({ type: 'session_meta', payload: { id: 'main', cwd: 'D:\\code\\alpha', timestamp: '2026-08-03T00:00:00Z' } }),
    JSON.stringify({ type: 'event_msg', payload: { type: 'user_message', message: 'First prompt' } })
  ].join('\n')
  const rows = worker.loadHistoryRows({
    cwd: 'D:\\code\\alpha', sessionsDir: root, platform: 'win32'
  }, {
    readSqliteRows: () => null,
    collectFiles: () => [file],
    readFile: () => jsonl,
    statFile: () => ({ mtimeMs: 123, size: jsonl.length })
  })
  assert.equal(rows[0].id, 'main')
  assert.equal(rows[0].title, 'First prompt')
})
```

- [ ] **Step 2: Run worker tests and verify RED**

Run: `node --test test/codex-history-worker.test.cjs`

Expected: FAIL with `Cannot find module '../public/preload/codex-history-worker.cjs'`.

- [ ] **Step 3: Implement the standalone worker**

Implement these exact public functions in `public/preload/codex-history-worker.cjs`:

```js
const fs = require('node:fs')
const path = require('node:path')

function normalizePath (cwd, platform) {
  let value = typeof cwd === 'string' ? cwd.trim() : ''
  if ((platform || process.platform) === 'win32') {
    if (value.startsWith('\\\\?\\UNC\\')) value = '\\\\' + value.slice(8)
    else if (value.startsWith('\\\\?\\')) value = value.slice(4)
  }
  value = path.normalize(value)
  return (platform || process.platform) === 'win32' ? value.toLowerCase() : value
}

function historyRowsForCwd (rows, cwd, platform) {
  const target = normalizePath(cwd, platform)
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row && normalizePath(row.cwd, platform) === target)
    .filter((row) => String(row.thread_source || '').trim().toLowerCase() !== 'subagent')
}

function pidFromProcessUuid (value) {
  const match = String(value || '').match(/^pid:(\d+):/)
  return match ? Number(match[1]) : 0
}

function computeActiveSessions ({ cwd, platform, threadRows, logRows, isPidAlive }) {
  const allowed = new Set(historyRowsForCwd(threadRows, cwd, platform).map((row) => String(row.id || '')))
  const latest = new Map()
  for (const row of Array.isArray(logRows) ? logRows : []) {
    if (!row || !row.process_uuid) continue
    const ts = Number(row.ts) || 0
    const tsNanos = Number(row.ts_nanos) || 0
    const previous = latest.get(row.process_uuid)
    if (!previous || ts > previous.ts || (ts === previous.ts && tsNanos > previous.tsNanos)) {
      latest.set(row.process_uuid, { ...row, ts, tsNanos })
    }
  }
  const active = []
  const seen = new Set()
  for (const row of latest.values()) {
    const sessionId = String(row.thread_id || '').trim()
    const pid = pidFromProcessUuid(row.process_uuid)
    if (!sessionId || !allowed.has(sessionId) || seen.has(sessionId) || !isPidAlive(pid)) continue
    seen.add(sessionId)
    active.push({ sessionId, status: 'running', pid })
  }
  return active
}
```

Add the database and file fallback helpers:

```js
const HISTORY_SQL = [
  'select id, rollout_path, cwd, title, first_user_message, preview,',
  'recency_at_ms, updated_at_ms, updated_at, created_at_ms, created_at,',
  'git_branch, git_sha, cli_version, model, reasoning_effort, tokens_used, approval_mode, sandbox_policy, thread_source',
  "from threads where cwd is not null and trim(cwd) <> ''"
].join(' ')
const THREAD_SQL = "select id, cwd, thread_source from threads where cwd is not null and trim(cwd) <> ''"
const LOG_SQL = [
  'select thread_id, process_uuid, ts, ts_nanos from logs',
  "where thread_id is not null and trim(thread_id) <> ''",
  "and process_uuid is not null and process_uuid like 'pid:%'",
  'order by ts desc, ts_nanos desc limit 2000'
].join(' ')

function readSqliteRows (filePath, sql) {
  let sqlite
  try { sqlite = require('node:sqlite') } catch (_) { return null }
  let db
  try {
    db = new sqlite.DatabaseSync(filePath, { readOnly: true })
    return db.prepare(sql).all()
  } catch (_) {
    return null
  } finally {
    if (db) try { db.close() } catch (_) { /* ignore */ }
  }
}

function collectSessionFiles (root) {
  const files = []
  const pending = [root]
  while (pending.length) {
    const current = pending.pop()
    let entries = []
    try { entries = fs.readdirSync(current, { withFileTypes: true }) } catch (_) { continue }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) pending.push(fullPath)
      else if (entry.isFile() && entry.name.endsWith('.jsonl')) files.push(fullPath)
    }
  }
  return files
}

function rowFromSessionFile (filePath, content, stat) {
  const lines = String(content || '').split(/\r?\n/)
  let meta = null
  let title = ''
  for (const line of lines) {
    if (!line) continue
    let record
    try { record = JSON.parse(line) } catch (_) { continue }
    const payload = record && record.payload
    if (!meta && record.type === 'session_meta' && payload) meta = payload
    if (!title && record.type === 'event_msg' && payload && payload.type === 'user_message') {
      title = String(payload.message || payload.text || '').replace(/\s+/g, ' ').trim().slice(0, 80)
    }
    if (meta && title) break
  }
  if (!meta || !(meta.id || meta.session_id) || !meta.cwd) return null
  return {
    id: String(meta.id || meta.session_id),
    rollout_path: filePath,
    cwd: meta.cwd,
    title,
    recency_at_ms: Number(stat && stat.mtimeMs) || Date.parse(meta.timestamp || '') || 0,
    size: Number(stat && stat.size) || 0,
    thread_source: meta.thread_source || (meta.source && meta.source.subagent ? 'subagent' : ''),
    git_branch: meta.git_branch || '',
    git_sha: meta.git_sha || '',
    cli_version: meta.cli_version || '',
    model: meta.model || '',
    reasoning_effort: meta.reasoning_effort || '',
    tokens_used: Number(meta.tokens_used) || 0,
    approval_mode: meta.approval_mode || '',
    sandbox_policy: meta.sandbox_policy || ''
  }
}

function loadHistoryRows (input, dependencies) {
  const deps = dependencies || {}
  const query = deps.readSqliteRows || readSqliteRows
  let rows = query(input.stateDbPath, HISTORY_SQL)
  if (!Array.isArray(rows)) {
    const collect = deps.collectFiles || collectSessionFiles
    const readFile = deps.readFile || ((filePath) => fs.readFileSync(filePath, 'utf8'))
    const statFile = deps.statFile || ((filePath) => fs.statSync(filePath))
    rows = []
    for (const filePath of collect(input.sessionsDir)) {
      try {
        const row = rowFromSessionFile(filePath, readFile(filePath), statFile(filePath))
        if (row) rows.push(row)
      } catch (_) { /* skip unreadable sessions */ }
    }
  }
  return historyRowsForCwd(rows, input.cwd, input.platform)
}

function isPidAlive (pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try { process.kill(pid, 0); return true } catch (error) { return !!error && error.code === 'EPERM' }
}

function loadActiveSessions (input, dependencies) {
  const deps = dependencies || {}
  const query = deps.readSqliteRows || readSqliteRows
  const logRows = query(input.logsDbPath, LOG_SQL)
  const threadRows = query(input.stateDbPath, THREAD_SQL)
  if (!Array.isArray(logRows) || !Array.isArray(threadRows)) return []
  return computeActiveSessions({
    cwd: input.cwd,
    platform: input.platform,
    logRows,
    threadRows,
    isPidAlive: deps.isPidAlive || isPidAlive
  })
}
```

Implement `run(mode, input)` so `history` prints `loadHistoryRows(input)` and `active` opens both databases, calls `computeActiveSessions`, and prints only the final active array:

```js
function run (mode, input) {
  let result
  if (mode === 'history') result = loadHistoryRows(input)
  else if (mode === 'active') result = loadActiveSessions(input)
  else throw new Error('Unknown Codex history worker mode: ' + mode)
  process.stdout.write(JSON.stringify(result))
}

module.exports = {
  normalizePath,
  historyRowsForCwd,
  computeActiveSessions,
  loadHistoryRows,
  loadActiveSessions,
  run
}
```

- [ ] **Step 4: Run worker tests and verify GREEN**

Run: `node --test test/codex-history-worker.test.cjs`

Expected: 3 tests pass, 0 fail.

- [ ] **Step 5: Commit the worker**

```bash
git add public/preload/codex-history-worker.cjs test/codex-history-worker.test.cjs
git commit -m "feat: isolate codex history queries in worker"
```

### Task 3: Promise-Based Preload APIs

**Files:**
- Modify: `public/preload/services.js:1-12,619-952,3186-3202`
- Modify: `test/services-codex-history.test.cjs:1-150,256-365`

- [ ] **Step 1: Write failing async preload API tests**

Change exactly the `makeServices` signature and module-map initialization:

```diff
-function makeServices ({ rows = [], logRows = [], files = {}, mtimes = {}, existing = [], readdir, readFile, stat, sqlite = true, alivePids = [], spawnSync } = {}) {
+function makeServices ({ rows = [], logRows = [], files = {}, mtimes = {}, existing = [], readdir, readFile, stat, sqlite = true, alivePids = [], spawnSync, runNodeJson } = {}) {
   const alivePidSet = new Set(alivePids)
   const modules = {}
+  if (runNodeJson) modules['./async-child.cjs'] = { runNodeJson }
   if (sqlite) {
```

Add API behavior tests:

```js
test('listCodexProjectSessionsAsync maps worker rows without sync fallback', async () => {
  const alpha = 'D:\\code\\alpha'
  const calls = []
  const { services } = makeServices({
    sqlite: false,
    spawnSync: () => { throw new Error('sync fallback must not run') },
    runNodeJson: async (script) => {
      calls.push(script)
      return [{ id: 'alpha', cwd: alpha, title: 'Alpha', recency_at_ms: 20, rollout_path: '' }]
    }
  })
  const sessions = await services.listCodexProjectSessionsAsync(alpha)
  assert.equal(sessions[0].sessionId, 'alpha')
  assert.equal(calls.length, 1)
})

test('listActiveCodexSessionsAsync returns final worker result', async () => {
  const expected = [{ sessionId: 'live', status: 'running', pid: 123 }]
  const { services } = makeServices({ runNodeJson: async () => expected })
  assert.deepEqual(JSON.parse(JSON.stringify(
    await services.listActiveCodexSessionsAsync('D:\\code\\alpha')
  )), expected)
})

test('async Codex APIs reject worker failures without sync retries', async () => {
  let syncCalls = 0
  const { services } = makeServices({
    sqlite: false,
    spawnSync: () => { syncCalls++; return { status: 1, stdout: '' } },
    runNodeJson: async () => { throw new Error('worker failed') }
  })
  await assert.rejects(() => services.listCodexProjectSessionsAsync('D:\\code\\alpha'), /worker failed/)
  await assert.rejects(() => services.listActiveCodexSessionsAsync('D:\\code\\alpha'), /worker failed/)
  assert.equal(syncCalls, 0)
})
```

- [ ] **Step 2: Run async preload tests and verify RED**

Run: `node --test test/services-codex-history.test.cjs`

Expected: FAIL because `listCodexProjectSessionsAsync` and `listActiveCodexSessionsAsync` do not exist.

- [ ] **Step 3: Implement and export the async APIs**

Add lazy runner loading and a worker-script builder in `services.js`:

```js
function loadAsyncChildRunner () {
  return require('./async-child.cjs')
}

function codexHistoryWorkerScript (mode, cwd) {
  const workerPath = path.join(__dirname, 'codex-history-worker.cjs')
  const input = {
    cwd,
    platform: process.platform,
    stateDbPath: getCodexStateDbPath(),
    logsDbPath: getCodexLogsDbPath(),
    sessionsDir: getCodexSessionsDir()
  }
  return `require(${JSON.stringify(workerPath)}).run(${JSON.stringify(mode)}, ${JSON.stringify(input)})`
}

async function listCodexProjectSessionsAsync (cwd) {
  if (typeof cwd !== 'string' || !cwd.trim()) return []
  const rows = await loadAsyncChildRunner().runNodeJson(codexHistoryWorkerScript('history', cwd))
  const sessions = []
  for (const row of Array.isArray(rows) ? rows : []) {
    const item = codexSessionFromThreadRow(row)
    if (item) sessions.push(item)
  }
  sessions.sort((a, b) => b.mtime - a.mtime)
  return sessions
}

async function listActiveCodexSessionsAsync (cwd) {
  if (typeof cwd !== 'string' || !cwd.trim()) return []
  const result = await loadAsyncChildRunner().runNodeJson(codexHistoryWorkerScript('active', cwd))
  return Array.isArray(result) ? result : []
}
```

Expose both functions next to the existing synchronous Codex APIs in `window.services`:

```diff
   listCodexProjects,
   listCodexProjectSessions,
+  listCodexProjectSessionsAsync,
   readCodexSession,
   statCodexSession,
   listActiveCodexSessions,
+  listActiveCodexSessionsAsync,
```

The focused regression command in Step 4 proves the existing synchronous Codex and Claude exports remain unchanged.

- [ ] **Step 4: Run preload tests and verify GREEN**

Run: `node --test test/services-codex-history.test.cjs test/services-history.test.cjs`

Expected: all Codex and Claude history service tests pass.

- [ ] **Step 5: Commit the preload APIs**

```bash
git add public/preload/services.js test/services-codex-history.test.cjs
git commit -m "feat: expose async codex history services"
```

### Task 4: Progressive Loading Coordinator

**Files:**
- Create: `src/ProjectHistory/load-core.js`
- Create: `test/history-load-core.test.cjs`

- [ ] **Step 1: Write failing coordinator tests**

Use deferred Promises to prove ordering, stale-result rejection, active-request serialization, and failure preservation:

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const { createHistoryLoader } = require('../src/ProjectHistory/load-core.js')

function deferred () {
  let resolve
  let reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

test('history list is applied before active status completes', async () => {
  const active = deferred()
  const events = []
  const loader = createHistoryLoader({
    listSessions: async () => ['session'],
    listActive: () => active.promise,
    afterListRender: async () => { events.push('paint') },
    onSessions: () => { events.push('sessions') },
    onActive: () => { events.push('active') }
  })
  const loading = loader.load('cwd')
  await Promise.resolve()
  await Promise.resolve()
  assert.deepEqual(events, ['sessions', 'paint'])
  active.resolve(['live'])
  await loading
  assert.deepEqual(events, ['sessions', 'paint', 'active'])
})

test('active refresh is serialized and stale project results are ignored', async () => {
  const firstActive = deferred()
  let activeCalls = 0
  const applied = []
  const loader = createHistoryLoader({
    listSessions: async (key) => [key],
    listActive: () => { activeCalls++; return firstActive.promise },
    afterListRender: async () => {},
    onSessions: (value) => applied.push(['sessions', value]),
    onActive: (value) => applied.push(['active', value])
  })
  const first = loader.load('a')
  await Promise.resolve(); await Promise.resolve()
  const duplicate = loader.refreshActive()
  assert.equal(activeCalls, 1)
  const second = loader.load('b')
  firstActive.resolve(['old'])
  await Promise.all([first, duplicate, second])
  assert.equal(applied.some(([type, value]) => type === 'active' && value[0] === 'old'), false)
  assert.deepEqual(applied.filter(([type]) => type === 'sessions').at(-1), ['sessions', ['b']])
})

test('active failure preserves the last applied value', async () => {
  const applied = []
  let fail = false
  const loader = createHistoryLoader({
    listSessions: async () => [],
    listActive: async () => { if (fail) throw new Error('failed'); return ['live'] },
    afterListRender: async () => {},
    onSessions: () => {},
    onActive: (value) => applied.push(value)
  })
  await loader.load('cwd')
  fail = true
  await loader.refreshActive()
  assert.deepEqual(applied, [['live']])
})
```

- [ ] **Step 2: Run coordinator tests and verify RED**

Run: `node --test test/history-load-core.test.cjs`

Expected: FAIL with `Cannot find module '../src/ProjectHistory/load-core.js'`.

- [ ] **Step 3: Implement the coordinator**

Create `src/ProjectHistory/load-core.js`:

```js
export function createHistoryLoader (options) {
  let generation = 0
  let currentKey = ''
  let activeInFlight = null

  const isCurrent = (key, token) => currentKey === key && generation === token

  const refreshActive = () => {
    if (!currentKey) return Promise.resolve(null)
    if (activeInFlight) return activeInFlight
    const key = currentKey
    const token = generation
    const request = Promise.resolve()
      .then(() => options.listActive(key))
      .then((value) => {
        if (isCurrent(key, token)) options.onActive(value || [])
        return value
      })
      .catch(() => null)
      .finally(() => { if (activeInFlight === request) activeInFlight = null })
    activeInFlight = request
    return request
  }

  const load = async (key) => {
    const token = ++generation
    currentKey = key || ''
    if (!currentKey) return
    try {
      const value = await options.listSessions(currentKey)
      if (!isCurrent(key, token)) return
      options.onSessions(value || [])
      await options.afterListRender()
      if (!isCurrent(key, token)) return
      await refreshActive()
    } catch (error) {
      if (isCurrent(key, token) && options.onListError) options.onListError(error)
    }
  }

  const invalidate = () => { generation++; currentKey = '' }
  return { load, refreshActive, invalidate }
}
```

- [ ] **Step 4: Run coordinator tests and verify GREEN**

Run: `node --test test/history-load-core.test.cjs`

Expected: 3 tests pass, 0 fail.

- [ ] **Step 5: Commit the coordinator**

```bash
git add src/ProjectHistory/load-core.js test/history-load-core.test.cjs
git commit -m "feat: coordinate progressive history loading"
```

### Task 5: Route the Codex History Page Through Async APIs

**Files:**
- Modify: `src/ProjectHistory/index.vue:1-5,364-388,790-820,1187-1204`
- Create: `test/project-history-progressive-loading.test.cjs`

- [ ] **Step 1: Write a failing Vue wiring contract test**

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'ProjectHistory', 'index.vue'), 'utf8')

test('Codex history uses progressive async services without sync Codex calls', () => {
  assert.match(source, /createHistoryLoader/)
  assert.match(source, /listCodexProjectSessionsAsync/)
  assert.match(source, /listActiveCodexSessionsAsync/)
  assert.doesNotMatch(source, /window\.services\.listCodexProjectSessions\(/)
  assert.doesNotMatch(source, /window\.services\.listActiveCodexSessions\(/)
  assert.match(source, /window\.services\.listProjectSessions\(/)
  assert.match(source, /window\.services\.listActiveSessions\(/)
})
```

- [ ] **Step 2: Run the wiring test and verify RED**

Run: `node --test test/project-history-progressive-loading.test.cjs`

Expected: FAIL because the Vue component still calls synchronous Codex APIs.

- [ ] **Step 3: Wire the coordinator into `index.vue`**

Import the coordinator:

```ts
import { createHistoryLoader } from './load-core'
```

Extract the existing active-state application body so both Claude and Codex results share UI behavior:

```ts
const applyActiveSessions = (list: any[]) => {
  activeIds.value = new Set((list || []).map((a: any) => a.sessionId))
  const ids = new Set(sessions.value.map((s: any) => s.sessionId))
  if ([...activeIds.value].some((id) => !ids.has(id))) reloadSessions()
  const s = selectedSession.value
  if (s && selected.value?.type === 'session' && !currentAgent.value) {
    const live = isSessionLive(s.sessionId)
    if (live !== currentLive.value) {
      currentLive.value = live
      autoRefresh.value = live
      if (live) { startPoll(); refreshSession() } else stopPoll()
    }
  }
}
```

Create the loader lazily so `load`, `reloadSessions`, and `applyActiveSessions` can refer to one another without initialization-order coupling:

```ts
let codexHistoryLoader: ReturnType<typeof createHistoryLoader> | null = null
function getCodexHistoryLoader () {
  if (!codexHistoryLoader) {
    codexHistoryLoader = createHistoryLoader({
      listSessions: (cwd: string) => window.services.listCodexProjectSessionsAsync(cwd),
      listActive: (cwd: string) => window.services.listActiveCodexSessionsAsync(cwd),
      afterListRender: () => nextTick().then(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))),
      onSessions: (list: any[]) => {
        sessions.value = list
        if (narrow.value && list.length) requestAnimationFrame(() => { if (!selected.value) showList.value = true })
      },
      onActive: applyActiveSessions,
      onListError: (err: any) => { error.value = err?.message || String(err) }
    })
  }
  return codexHistoryLoader
}
```

Route only Codex through it:

```ts
const load = () => {
  error.value = ''
  stopPoll()
  selected.value = null
  memoryDetail.value = null
  sessionDetail.value = null
  mainDetail.value = null
  subDetail.value = null
  selectedSession.value = null
  const p = props.project
  if (!p || (isCodexHistory.value ? !p.cwd : !p.dirName)) {
    codexHistoryLoader?.invalidate()
    memories.value = []
    sessions.value = []
    return
  }
  if (isCodexHistory.value) {
    memories.value = []
    void getCodexHistoryLoader().load(p.cwd)
    return
  }
  try {
    memories.value = window.services.listProjectMemories(p.dirName) || []
    sessions.value = window.services.listProjectSessions(p.dirName) || []
    refreshActive()
  } catch (err: any) {
    error.value = err?.message || String(err)
  }
}
```

Change `reloadSessions` and `refreshActive` so the Codex branch schedules the loader and returns immediately, while the Claude branch retains its current synchronous APIs:

```ts
const reloadSessions = () => {
  const p = props.project
  if (!p || (isCodexHistory.value ? !p.cwd : !p.dirName)) return
  if (isCodexHistory.value) { void getCodexHistoryLoader().load(p.cwd); return }
  try { sessions.value = window.services.listProjectSessions(p.dirName) || [] } catch (_) { /* keep current list */ }
}

const refreshActive = () => {
  if (isCodexHistory.value) { void getCodexHistoryLoader().refreshActive(); return }
  try { applyActiveSessions(window.services.listActiveSessions(props.project?.cwd) || []) } catch (_) { /* keep current state */ }
}
```

Call `codexHistoryLoader?.invalidate()` during `onUnmounted`. The wiring contract and focused regression tests enforce that session-detail polling, Claude history APIs, and the 2.5-second timer remain unchanged.

- [ ] **Step 4: Run focused tests and build**

Run: `node --test test/project-history-progressive-loading.test.cjs test/history-load-core.test.cjs test/services-codex-history.test.cjs test/services-history.test.cjs`

Expected: all focused tests pass.

Run: `npm run build`

Expected: Vite build succeeds and copies both new preload `.cjs` files to `dist/preload`.

- [ ] **Step 5: Run full regression verification**

Run: `npm test`

Expected: all repository tests pass with 0 failures.

Run: `git diff --check`

Expected: no whitespace errors.

- [ ] **Step 6: Measure the real worker path**

Run the built worker through external Node against the current project and record elapsed time and output size:

```powershell
$worker = Join-Path (Get-Location) 'dist\preload\codex-history-worker.cjs'
$input = @{ cwd = (Get-Location).Path; platform = 'win32'; stateDbPath = (Join-Path $env:USERPROFILE '.codex\state_5.sqlite'); logsDbPath = (Join-Path $env:USERPROFILE '.codex\logs_2.sqlite'); sessionsDir = (Join-Path $env:USERPROFILE '.codex\sessions') } | ConvertTo-Json -Compress
$script = "require($([Management.Automation.Language.CodeGeneration]::QuoteArgument($worker))).run('active',$input)"
Measure-Command { node -e $script | Out-Null }
```

Expected: the history worker typically completes within 300 ms on the current dataset, the active worker completes below the 3-second timeout, and both emit only their final arrays. In uTools, verify that the list paints before the active marker and that scrolling remains responsive across multiple 2.5-second refresh cycles.

- [ ] **Step 7: Commit the page integration**

```bash
git add src/ProjectHistory/index.vue test/project-history-progressive-loading.test.cjs
git commit -m "perf: load codex history without renderer blocking"
```
