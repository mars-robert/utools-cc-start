const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const { runNodeJson } = require('../public/preload/async-child.cjs')

const {
  HISTORY_SQL,
  LOG_SQL,
  THREAD_SQL,
  collectSessionFiles,
  computeActiveSessions,
  historyRowsForCwd,
  loadActiveSessions,
  loadHistoryRows,
  normalizePath,
  readSqliteRows,
  rowFromSessionFile,
  run,
} = require('../public/preload/codex-history-worker.cjs')

function directory(name) {
  return { name, isDirectory: () => true, isFile: () => false }
}

function file(name) {
  return { name, isDirectory: () => false, isFile: () => true }
}

test('normalizes cwd values and excludes exact subagent rows', () => {
  assert.equal(
    normalizePath('\\\\?\\UNC\\Server\\Share\\folder\\..\\Project', 'win32'),
    '\\\\server\\share\\project',
  )
  assert.equal(normalizePath('/Work/Alpha/../Beta', 'linux'), '/Work/Beta')

  const rows = [
    { id: 'drive', cwd: '\\\\?\\D:\\CODE\\alpha' },
    { id: 'subagent', cwd: 'D:\\code\\alpha', thread_source: 'subagent' },
    { id: 'normalized-subagent', cwd: 'D:\\code\\alpha', thread_source: ' SubAgent ' },
    { id: 'subagent-review', cwd: 'D:\\code\\alpha', thread_source: 'subagent_review' },
    { id: 'other', cwd: 'D:\\code\\beta' },
  ]

  assert.deepEqual(
    historyRowsForCwd(rows, 'd:\\code\\alpha', 'win32').map((row) => row.id),
    ['drive', 'subagent-review'],
  )
})

test('uses the latest log per process and filters by cwd, live pid, and session id', () => {
  const alive = new Set([101, 202])
  const sessions = computeActiveSessions({
    cwd: 'D:\\code\\alpha',
    platform: 'win32',
    threadRows: [
      { id: 'alpha-live', cwd: '\\\\?\\D:\\CODE\\alpha' },
      { id: 'alpha-old', cwd: 'D:\\code\\alpha' },
      { id: 'alpha-dead', cwd: 'D:\\code\\alpha' },
      { id: 'beta-live', cwd: 'D:\\code\\beta' },
      { id: 'alpha-subagent', cwd: 'D:\\code\\alpha', thread_source: 'subagent' },
    ],
    logRows: [
      { thread_id: 'alpha-old', process_uuid: 'pid:101:first', ts: '30', ts_nanos: '100' },
      { thread_id: 'alpha-live', process_uuid: 'pid:101:first', ts: '30', ts_nanos: '200' },
      { thread_id: 'alpha-live', process_uuid: 'pid:202:duplicate', ts: 20, ts_nanos: 0 },
      { thread_id: 'alpha-dead', process_uuid: 'pid:303:dead', ts: 20, ts_nanos: 0 },
      { thread_id: 'alpha-old', process_uuid: 'pid:404:changed-project', ts: 40, ts_nanos: 0 },
      { thread_id: 'beta-live', process_uuid: 'pid:404:changed-project', ts: 50, ts_nanos: 0 },
      { thread_id: 'alpha-subagent', process_uuid: 'pid:202:subagent', ts: 60, ts_nanos: 0 },
      { thread_id: 'alpha-live', process_uuid: 'not-a-pid', ts: 70, ts_nanos: 0 },
    ],
    isPidAlive: (pid) => alive.has(pid),
  })

  assert.deepEqual(sessions, [{ sessionId: 'alpha-live', status: 'running', pid: 101 }])
})

test('reads SQLite rows read-only and always closes an opened database', () => {
  const calls = []
  class DatabaseSync {
    constructor(dbPath, options) {
      calls.push(['open', dbPath, options])
    }

    prepare(sql) {
      calls.push(['prepare', sql])
      return { all: () => [{ id: 'one' }] }
    }

    close() {
      calls.push(['close'])
    }
  }

  assert.deepEqual(readSqliteRows('state.sqlite', 'select 1', { sqlite: { DatabaseSync } }), [
    { id: 'one' },
  ])
  assert.deepEqual(calls, [
    ['open', 'state.sqlite', { readOnly: true }],
    ['prepare', 'select 1'],
    ['close'],
  ])

  let closedAfterFailure = false
  assert.equal(
    readSqliteRows('state.sqlite', 'broken', {
      sqlite: {
        DatabaseSync: class {
          prepare() {
            throw new Error('query failed')
          }

          close() {
            closedAfterFailure = true
          }
        },
      },
    }),
    null,
  )
  assert.equal(closedAfterFailure, true)
  assert.equal(readSqliteRows('state.sqlite', 'select 1', { loadSqlite: () => { throw new Error('missing') } }), null)
})

test('falls back from unavailable SQLite to recursive JSONL metadata rows', () => {
  const sessionsDir = path.join('codex-home', 'sessions')
  const nestedDir = path.join(sessionsDir, '2026', '08', '03')
  const alphaFile = path.join(nestedDir, 'rollout-alpha.jsonl')
  const betaFile = path.join(nestedDir, 'rollout-beta.jsonl')
  const ignoredFile = path.join(nestedDir, 'notes.txt')
  const timestamp = '2026-08-03T02:03:04.000Z'
  const contents = {
    [alphaFile]: [
      '{malformed',
      JSON.stringify({
        type: 'session_meta',
        payload: {
          id: 'alpha',
          cwd: 'D:\\code\\alpha',
          timestamp,
          originator: 'codex_cli_rs',
          cli_version: '0.146.0',
          source: 'cli',
          model_provider: 'openai',
          git: { branch: 'main', commit_hash: 'abcdef1234567890' },
        },
      }),
      JSON.stringify({
        type: 'event_msg',
        payload: { type: 'user_message', message: '  first   user\nmessage  ' },
      }),
    ].join('\n'),
    [betaFile]: [
      JSON.stringify({ type: 'session_meta', payload: { id: 'beta', cwd: 'D:\\code\\beta', timestamp } }),
      JSON.stringify({ type: 'event_msg', payload: { type: 'user_message', message: 'beta title' } }),
    ].join('\n'),
  }
  const tree = {
    [sessionsDir]: [directory('2026')],
    [path.join(sessionsDir, '2026')]: [directory('08')],
    [path.join(sessionsDir, '2026', '08')]: [directory('03')],
    [nestedDir]: [file('rollout-alpha.jsonl'), file('rollout-beta.jsonl'), file('notes.txt')],
  }
  const fs = {
    readdirSync(filePath) {
      if (tree[filePath]) return tree[filePath]
      throw new Error(`ENOENT: ${filePath}`)
    },
    readFileSync(filePath) {
      if (contents[filePath]) return contents[filePath]
      throw new Error(`ENOENT: ${filePath}`)
    },
    statSync(filePath) {
      if (filePath === alphaFile) return { mtimeMs: 4567, size: contents[filePath].length }
      if (filePath === betaFile) return { mtimeMs: 5678, size: contents[filePath].length }
      throw new Error(`ENOENT: ${filePath}`)
    },
  }

  assert.deepEqual(collectSessionFiles(sessionsDir, { fs }).sort(), [alphaFile, betaFile].sort())
  assert.equal(rowFromSessionFile(ignoredFile, { fs }), null)

  const rows = loadHistoryRows(
    { cwd: 'd:\\CODE\\alpha', platform: 'win32', sessionsDir, stateDbPath: 'missing.sqlite' },
    { fs, loadSqlite: () => { throw new Error('node:sqlite unavailable') } },
  )

  assert.equal(rows.length, 1)
  assert.deepEqual(rows[0], {
    id: 'alpha',
    rollout_path: alphaFile,
    session_path: alphaFile,
    cwd: 'D:\\code\\alpha',
    title: 'first user message',
    first_user_message: 'first user message',
    preview: 'first user message',
    recency_at_ms: 4567,
    updated_at_ms: 4567,
    updated_at: 4.567,
    created_at_ms: Date.parse(timestamp),
    created_at: Date.parse(timestamp) / 1000,
    size: contents[alphaFile].length,
    originator: 'codex_cli_rs',
    cli_version: '0.146.0',
    source: 'cli',
    model_provider: 'openai',
    git_branch: 'main',
    git_sha: 'abcdef1234567890',
    model: '',
    reasoning_effort: '',
    tokens_used: 0,
    approval_mode: '',
    sandbox_policy: '',
    thread_source: '',
  })
})

test('prefers SQLite history rows and filters them before returning', () => {
  const sqlCalls = []
  const rows = loadHistoryRows(
    { cwd: '/work/alpha', platform: 'linux', sessionsDir: 'unused', stateDbPath: 'state.sqlite' },
    {
      readSqliteRows(dbPath, sql) {
        sqlCalls.push([dbPath, sql])
        return [
          { id: 'alpha', cwd: '/work/alpha' },
          { id: 'subagent', cwd: '/work/alpha', thread_source: 'subagent' },
          { id: 'beta', cwd: '/work/beta' },
        ]
      },
      collectSessionFiles() {
        throw new Error('JSONL fallback should not run')
      },
    },
  )

  assert.deepEqual(rows, [{ id: 'alpha', cwd: '/work/alpha' }])
  assert.deepEqual(sqlCalls, [['state.sqlite', HISTORY_SQL]])
})

test('loads active rows with the active SQL queries', () => {
  const calls = []
  const sessions = loadActiveSessions(
    {
      cwd: '/work/alpha',
      platform: 'linux',
      logsDbPath: 'logs.sqlite',
      stateDbPath: 'state.sqlite',
    },
    {
      readSqliteRows(dbPath, sql) {
        calls.push([dbPath, sql])
        if (sql === LOG_SQL) {
          return [{ thread_id: 'alpha', process_uuid: 'pid:1234:worker', ts: 1, ts_nanos: 0 }]
        }
        return [{ id: 'alpha', cwd: '/work/alpha' }]
      },
      isPidAlive: (pid) => pid === 1234,
    },
  )

  assert.deepEqual(sessions, [{ sessionId: 'alpha', status: 'running', pid: 1234 }])
  assert.deepEqual(calls, [
    ['logs.sqlite', LOG_SQL],
    ['state.sqlite', THREAD_SQL],
  ])
})

test('rejects active snapshots when either required database is unavailable', () => {
  const input = {
    cwd: '/work/alpha',
    platform: 'linux',
    logsDbPath: 'logs.sqlite',
    stateDbPath: 'state.sqlite',
  }

  for (const unavailableSql of [LOG_SQL, THREAD_SQL]) {
    assert.throws(
      () => loadActiveSessions(input, {
        readSqliteRows: (_dbPath, sql) => sql === unavailableSql ? null : [],
      }),
      /Codex active session database unavailable/,
    )
  }
})

test('returns an authoritative empty active snapshot when both queries succeed empty', () => {
  const calls = []
  const sessions = loadActiveSessions(
    { cwd: '/work/alpha', platform: 'linux', logsDbPath: 'logs.sqlite', stateDbPath: 'state.sqlite' },
    { readSqliteRows: (dbPath, sql) => { calls.push([dbPath, sql]); return [] } },
  )

  assert.deepEqual(sessions, [])
  assert.deepEqual(calls, [
    ['logs.sqlite', LOG_SQL],
    ['state.sqlite', THREAD_SQL],
  ])
})

test('run propagates active database failures without writing JSON', () => {
  const originalWrite = process.stdout.write
  let stdout = ''
  process.stdout.write = (chunk) => {
    stdout += String(chunk)
    return true
  }

  try {
    assert.throws(
      () => run(
        'active',
        { cwd: '/work/alpha', platform: 'linux', logsDbPath: 'logs.sqlite', stateDbPath: 'state.sqlite' },
        { readSqliteRows: () => null },
      ),
      /Codex active session database unavailable/,
    )
  } finally {
    process.stdout.write = originalWrite
  }

  assert.equal(stdout, '')
})

test('the async child runner rejects an active snapshot with missing databases', async () => {
  const workerPath = path.resolve(__dirname, '..', 'public', 'preload', 'codex-history-worker.cjs')
  const missingDir = path.join(__dirname, `missing-codex-worker-db-${process.pid}`)
  const input = {
    cwd: '/work/alpha',
    platform: 'linux',
    logsDbPath: path.join(missingDir, 'logs.sqlite'),
    stateDbPath: path.join(missingDir, 'state.sqlite'),
  }
  const script = `const worker=require(${JSON.stringify(workerPath)});worker.run('active',${JSON.stringify(input)})`

  await assert.rejects(
    runNodeJson(script, { timeoutMs: 5000 }),
    /Codex active session database unavailable/,
  )
})

test('exports SQL matching the existing Codex thread and log queries', () => {
  assert.equal(
    HISTORY_SQL,
    [
      'select id, rollout_path, cwd, title, first_user_message, preview,',
      'recency_at_ms, updated_at_ms, updated_at, created_at_ms, created_at,',
      'git_branch, git_sha, cli_version, model, reasoning_effort, tokens_used, approval_mode, sandbox_policy, thread_source',
      "from threads where cwd is not null and trim(cwd) <> ''",
    ].join(' '),
  )
  assert.equal(THREAD_SQL, "select id, cwd, thread_source from threads where cwd is not null and trim(cwd) <> ''")
  assert.equal(
    LOG_SQL,
    [
      'select thread_id, process_uuid, ts, ts_nanos',
      'from logs',
      "where thread_id is not null and trim(thread_id) <> ''",
      "and process_uuid is not null and process_uuid like 'pid:%'",
      'order by ts desc, ts_nanos desc',
      'limit 2000',
    ].join(' '),
  )
})

test('run writes only the final JSON result and rejects unknown modes', () => {
  const originalWrite = process.stdout.write
  let stdout = ''
  process.stdout.write = (chunk) => {
    stdout += String(chunk)
    return true
  }

  try {
    const result = run(
      'history',
      { cwd: '/work/alpha', platform: 'linux', sessionsDir: 'unused', stateDbPath: 'state.sqlite' },
      { readSqliteRows: () => [{ id: 'alpha', cwd: '/work/alpha' }] },
    )
    assert.deepEqual(result, [{ id: 'alpha', cwd: '/work/alpha' }])
  } finally {
    process.stdout.write = originalWrite
  }

  assert.equal(stdout, '[{"id":"alpha","cwd":"/work/alpha"}]')
  assert.throws(() => run('unknown', {}), /unknown/i)
})
