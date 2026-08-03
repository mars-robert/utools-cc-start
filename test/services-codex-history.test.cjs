const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const vm = require('node:vm')
const { loadPreload } = require('./helpers/load-preload.cjs')

const HOME = 'C:\\Users\\tester'
const STATE_DB = path.join(HOME, '.codex', 'state_5.sqlite')
const LOGS_DB = path.join(HOME, '.codex', 'logs_2.sqlite')

function codexLine (obj) {
  return JSON.stringify(obj)
}

function codexSession ({ id, cwd, threadSource }) {
  const payload = { id, session_id: id, timestamp: '2026-07-31T01:00:00.000Z', cwd, cli_version: '0.42.0' }
  if (threadSource) payload.thread_source = threadSource
  return [
    codexLine({
      timestamp: '2026-07-31T01:00:00.000Z',
      type: 'session_meta',
      payload
    }),
    codexLine({
      timestamp: '2026-07-31T01:01:00.000Z',
      type: 'event_msg',
      payload: { type: 'user_message', message: 'hello codex' }
    }),
    codexLine({
      timestamp: '2026-07-31T01:02:00.000Z',
      type: 'response_item',
      payload: { type: 'reasoning', summary: [{ type: 'summary_text', text: 'thinking out loud' }] }
    }),
    codexLine({
      timestamp: '2026-07-31T01:03:00.000Z',
      type: 'response_item',
      payload: { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'shell_command', arguments: '{"command":"pwd"}' }
    }),
    codexLine({
      timestamp: '2026-07-31T01:04:00.000Z',
      type: 'response_item',
      payload: { type: 'function_call_output', call_id: 'call_1', output: 'D:\\code\\alpha' }
    }),
    codexLine({
      timestamp: '2026-07-31T01:05:00.000Z',
      type: 'response_item',
      payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'answer from codex' }] }
    })
  ].join('\n')
}

function codexEventSession ({ id, cwd }) {
  return [
    codexLine({
      timestamp: '2026-07-31T01:00:00.000Z',
      type: 'session_meta',
      payload: { id, session_id: id, timestamp: '2026-07-31T01:00:00.000Z', cwd, cli_version: '0.42.0' }
    }),
    codexLine({
      timestamp: '2026-07-31T01:00:10.000Z',
      type: 'response_item',
      payload: { type: 'message', role: 'assistant', content: [{ type: 'input_text', text: '<environment_context>noise</environment_context>' }] }
    }),
    codexLine({
      timestamp: '2026-07-31T01:01:00.000Z',
      type: 'event_msg',
      payload: { type: 'user_message', message: 'real user prompt' }
    }),
    codexLine({
      timestamp: '2026-07-31T01:02:00.000Z',
      type: 'event_msg',
      payload: { type: 'agent_message', message: 'real codex answer' }
    }),
    codexLine({
      timestamp: '2026-07-31T01:02:01.000Z',
      type: 'response_item',
      payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'real codex answer' }] }
    })
  ].join('\n')
}

function codexSessionWithInjectedContext ({ id, cwd }) {
  return [
    codexLine({
      timestamp: '2026-07-31T01:00:00.000Z',
      type: 'session_meta',
      payload: { id, session_id: id, timestamp: '2026-07-31T01:00:00.000Z', cwd, cli_version: '0.42.0' }
    }),
    codexLine({
      timestamp: '2026-07-31T01:00:10.000Z',
      type: 'response_item',
      payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '<environment_context>noise</environment_context>' }] }
    }),
    codexLine({
      timestamp: '2026-07-31T01:01:00.000Z',
      type: 'event_msg',
      payload: { type: 'user_message', message: 'real list title' }
    })
  ].join('\n')
}

function makeServices ({ rows = [], logRows = [], files = {}, mtimes = {}, existing = [], readdir, readFile, stat, sqlite = true, alivePids = [], spawnSync, runNodeJson } = {}) {
  const alivePidSet = new Set(alivePids)
  const modules = {}
  if (runNodeJson) modules['./async-child.cjs'] = { runNodeJson }
  if (sqlite) {
    modules['node:sqlite'] = {
      DatabaseSync: class {
        constructor (filePath, options) {
          assert.ok([STATE_DB, LOGS_DB].includes(filePath))
          assert.equal(options.readOnly, true)
          this.filePath = filePath
        }

        prepare (sql) {
          if (this.filePath === STATE_DB) {
            assert.match(sql, /from threads/i)
            return { all: () => rows }
          }
          assert.match(sql, /from logs/i)
          return { all: () => logRows }
        }

        close () {}
      }
    }
  }

  return loadPreload({
    homedir: HOME,
    exists: (p) => String(p) === STATE_DB || (sqlite && String(p) === LOGS_DB) || existing.includes(String(p)) || Object.prototype.hasOwnProperty.call(files, String(p)),
    readFile: readFile || ((p) => {
      const key = String(p)
      if (Object.prototype.hasOwnProperty.call(files, key)) return files[key]
      throw new Error('ENOENT: ' + key)
    }),
    stat: stat || ((p) => {
      const key = String(p)
      return { mtimeMs: mtimes[key] || 0, size: (files[key] || '').length }
    }),
    kill: (pid) => {
      if (alivePidSet.has(pid)) return
      const err = new Error('not alive')
      err.code = 'ESRCH'
      throw err
    },
    ...(spawnSync ? { spawnSync } : {}),
    ...(readdir ? { readdir } : {}),
    modules
  })
}

test('listCodexProjectSessionsAsync runs the history worker and maps rows by descending recency', async () => {
  const cwd = "D:\\code\\alpha';globalThis.injected=true;//"
  const oldFile = path.join(HOME, '.codex', 'sessions', '2026', '07', '30', 'rollout-old.jsonl')
  const newFile = path.join(HOME, '.codex', 'sessions', '2026', '07', '31', 'rollout-new.jsonl')
  const workerCalls = []
  let runnerCalls = 0
  const rows = [
    { id: 'old', rollout_path: oldFile, title: 'Old', recency_at_ms: 1000 },
    null,
    { id: '', rollout_path: oldFile, title: 'Missing id', recency_at_ms: 3000 },
    {
      id: 'new',
      rollout_path: newFile,
      title: 'New title',
      recency_at_ms: 4000,
      git_branch: 'main',
      git_sha: 'abcdef1234567890',
      cli_version: '0.146.0',
      model: 'gpt-5.5',
      reasoning_effort: 'high',
      tokens_used: 1234567,
      approval_mode: 'never',
      sandbox_policy: '{"type":"disabled"}'
    }
  ]
  let workerSandbox
  const { services } = makeServices({
    runNodeJson: async (script) => {
      runnerCalls++
      workerSandbox = {
        require: (modulePath) => ({
          run: (mode, input) => workerCalls.push({ modulePath, mode, input })
        })
      }
      vm.runInNewContext(script, workerSandbox)
      return rows
    }
  })

  const sessions = await services.listCodexProjectSessionsAsync(cwd)

  assert.equal(runnerCalls, 1)
  assert.equal(workerCalls.length, 1)
  assert.equal(workerCalls[0].modulePath, path.resolve(__dirname, '..', 'public', 'preload', 'codex-history-worker.cjs'))
  assert.equal(workerCalls[0].mode, 'history')
  assert.deepEqual(JSON.parse(JSON.stringify(workerCalls[0].input)), {
    cwd,
    platform: 'win32',
    stateDbPath: STATE_DB,
    logsDbPath: LOGS_DB,
    sessionsDir: path.join(HOME, '.codex', 'sessions')
  })
  assert.equal(workerSandbox.injected, undefined)
  assert.deepEqual(JSON.parse(JSON.stringify(sessions)), [
    {
      sessionId: 'new',
      title: 'New title',
      mtime: 4000,
      size: 0,
      rolloutPath: newFile,
      gitBranch: 'main',
      gitSha: 'abcdef1234567890',
      version: '0.146.0',
      model: 'gpt-5.5',
      reasoningEffort: 'high',
      tokensUsed: 1234567,
      approvalMode: 'never',
      sandboxPolicy: '{"type":"disabled"}'
    },
    {
      sessionId: 'old',
      title: 'Old',
      mtime: 1000,
      size: 0,
      rolloutPath: oldFile,
      gitBranch: '',
      gitSha: '',
      version: '',
      model: '',
      reasoningEffort: '',
      tokensUsed: 0,
      approvalMode: '',
      sandboxPolicy: ''
    }
  ])
})

test('listActiveCodexSessionsAsync returns the active worker array', async () => {
  const active = [{ sessionId: 'alpha-live', status: 'running', pid: 1234 }]
  const workerCalls = []
  const { services } = makeServices({
    runNodeJson: async (script) => {
      vm.runInNewContext(script, {
        require: () => ({
          run: (mode, input) => workerCalls.push({ mode, input })
        })
      })
      return active
    }
  })

  const sessions = await services.listActiveCodexSessionsAsync('D:\\code\\alpha')

  assert.equal(workerCalls.length, 1)
  assert.equal(workerCalls[0].mode, 'active')
  assert.deepEqual(JSON.parse(JSON.stringify(sessions)), active)
})

test('async Codex history APIs propagate runner failures without synchronous fallback', async () => {
  const failure = new Error('worker failed')
  let syncCalls = 0
  const { services } = makeServices({
    runNodeJson: async () => { throw failure },
    spawnSync: () => {
      syncCalls++
      return { status: 0, stdout: '[]', stderr: '' }
    }
  })

  await assert.rejects(services.listCodexProjectSessionsAsync('D:\\code\\alpha'), failure)
  await assert.rejects(services.listActiveCodexSessionsAsync('D:\\code\\alpha'), failure)
  assert.equal(syncCalls, 0)
})

test('async Codex history APIs return empty for blank cwd without launching the worker', async () => {
  let runnerCalls = 0
  const { services } = makeServices({
    runNodeJson: async () => {
      runnerCalls++
      return [{ unexpected: true }]
    }
  })

  assert.deepEqual(JSON.parse(JSON.stringify(await services.listCodexProjectSessionsAsync('  '))), [])
  assert.deepEqual(JSON.parse(JSON.stringify(await services.listActiveCodexSessionsAsync(null))), [])
  assert.equal(runnerCalls, 0)
})

test('listCodexProjectSessions groups real threads by cwd and sorts by recency', () => {
  const alpha = 'D:\\code\\alpha'
  const alphaNew = path.join(HOME, '.codex', 'sessions', '2026', '07', '31', 'rollout-alpha-new.jsonl')
  const alphaOld = path.join(HOME, '.codex', 'sessions', '2026', '07', '30', 'rollout-alpha-old.jsonl')
  const beta = path.join(HOME, '.codex', 'sessions', '2026', '07', '31', 'rollout-beta.jsonl')
  const { services } = makeServices({
    rows: [
      { id: 'alpha-old', rollout_path: alphaOld, cwd: '\\\\?\\D:\\code\\alpha', title: '', first_user_message: 'old first prompt', preview: '', recency_at_ms: 1000, updated_at_ms: 1100, updated_at: 1 },
      { id: 'beta', rollout_path: beta, cwd: 'D:\\code\\beta', title: 'Beta title', first_user_message: 'beta first', preview: '', recency_at_ms: 3000, updated_at_ms: 3100, updated_at: 3 },
      {
        id: 'alpha-new',
        rollout_path: alphaNew,
        cwd: alpha,
        title: 'Alpha Title',
        first_user_message: 'alpha first',
        preview: 'alpha preview',
        recency_at_ms: 4000,
        updated_at_ms: 4100,
        updated_at: 4,
        model: 'gpt-5.5',
        reasoning_effort: 'high',
        git_branch: 'main',
        git_sha: 'abcdef1234567890',
        cli_version: '0.146.0',
        tokens_used: 1234567,
        approval_mode: 'never',
        sandbox_policy: '{"type":"disabled"}'
      }
    ],
    files: {
      [alphaNew]: codexSession({ id: 'alpha-new', cwd: alpha }),
      [alphaOld]: codexSession({ id: 'alpha-old', cwd: alpha }),
      [beta]: codexSession({ id: 'beta', cwd: 'D:\\code\\beta' })
    }
  })

  const sessions = services.listCodexProjectSessions(alpha)

  assert.equal(sessions.length, 2)
  assert.equal(sessions[0].sessionId, 'alpha-new')
  assert.equal(sessions[0].title, 'Alpha Title')
  assert.equal(sessions[0].mtime, 4000)
  assert.equal(sessions[0].model, 'gpt-5.5')
  assert.equal(sessions[0].reasoningEffort, 'high')
  assert.equal(sessions[0].gitBranch, 'main')
  assert.equal(sessions[0].gitSha, 'abcdef1234567890')
  assert.equal(sessions[0].version, '0.146.0')
  assert.equal(sessions[0].tokensUsed, 1234567)
  assert.equal(sessions[0].approvalMode, 'never')
  assert.equal(sessions[0].sandboxPolicy, '{"type":"disabled"}')
  assert.equal(sessions[1].sessionId, 'alpha-old')
  assert.equal(sessions[1].title, 'old first prompt')
})

test('listCodexProjectSessions uses sqlite metadata without touching rollout files', () => {
  const alpha = 'D:\\code\\alpha'
  const alphaNew = path.join(HOME, '.codex', 'sessions', '2026', '07', '31', 'rollout-alpha-new.jsonl')
  const alphaOld = path.join(HOME, '.codex', 'sessions', '2026', '07', '30', 'rollout-alpha-old.jsonl')
  const touched = []
  const { services } = makeServices({
    rows: [
      { id: 'alpha-old', rollout_path: alphaOld, cwd: alpha, title: 'Old', recency_at_ms: 1000 },
      { id: 'alpha-new', rollout_path: alphaNew, cwd: alpha, title: 'New', recency_at_ms: 4000 }
    ],
    files: {
      [alphaNew]: codexSession({ id: 'alpha-new', cwd: alpha }),
      [alphaOld]: codexSession({ id: 'alpha-old', cwd: alpha })
    },
    existing: [alphaNew, alphaOld],
    stat: (p) => {
      touched.push('stat:' + String(p))
      throw new Error('unexpected stat: ' + p)
    },
    readFile: (p) => {
      touched.push('read:' + String(p))
      throw new Error('unexpected read: ' + p)
    }
  })

  const sessions = services.listCodexProjectSessions(alpha)

  assert.deepEqual(JSON.parse(JSON.stringify(sessions.map((session) => session.sessionId))), ['alpha-new', 'alpha-old'])
  assert.deepEqual(touched, [])
})

test('listCodexProjectSessions excludes subagent threads from the top-level history list', () => {
  const alpha = 'D:\\code\\alpha'
  const parentFile = path.join(HOME, '.codex', 'sessions', '2026', '07', '31', 'rollout-parent.jsonl')
  const subagentFile = path.join(HOME, '.codex', 'sessions', '2026', '07', '31', 'rollout-subagent.jsonl')
  const { services } = makeServices({
    rows: [
      { id: 'parent', rollout_path: parentFile, cwd: alpha, title: 'Parent thread', thread_source: 'user', recency_at_ms: 1000 },
      { id: 'subagent', rollout_path: subagentFile, cwd: alpha, title: 'Subagent thread', thread_source: ' SubAgent ', recency_at_ms: 2000 }
    ],
    files: {
      [parentFile]: codexSession({ id: 'parent', cwd: alpha }),
      [subagentFile]: codexSession({ id: 'subagent', cwd: alpha })
    }
  })

  const sessions = services.listCodexProjectSessions(alpha)

  assert.deepEqual(JSON.parse(JSON.stringify(sessions.map((session) => session.sessionId))), ['parent'])
})

test('listCodexProjectSessions falls back to external node threads when preload sqlite is unavailable', () => {
  const alpha = 'D:\\code\\alpha'
  const parentFile = path.join(HOME, '.codex', 'sessions', '2026', '07', '31', 'rollout-parent.jsonl')
  const subagentFile = path.join(HOME, '.codex', 'sessions', '2026', '07', '31', 'rollout-subagent.jsonl')
  const { services } = makeServices({
    sqlite: false,
    spawnSync: (command, args) => {
      assert.equal(command, 'node')
      assert.equal(args[0], '-e')
      return {
        status: 0,
        stdout: JSON.stringify({
          threads: [
            { id: 'parent', rollout_path: parentFile, cwd: alpha, title: 'Parent thread', thread_source: 'user', recency_at_ms: 1000 },
            { id: 'subagent', rollout_path: subagentFile, cwd: alpha, title: 'Subagent thread', thread_source: 'subagent', recency_at_ms: 2000 }
          ]
        }),
        stderr: ''
      }
    }
  })

  const sessions = services.listCodexProjectSessions(alpha)

  assert.deepEqual(JSON.parse(JSON.stringify(sessions.map((session) => session.sessionId))), ['parent'])
  assert.equal(sessions[0].title, 'Parent thread')
})

test('readCodexSession parses Codex JSONL and refuses sessions from another cwd', () => {
  const alpha = 'D:\\code\\alpha'
  const alphaFile = path.join(HOME, '.codex', 'sessions', '2026', '07', '31', 'rollout-alpha.jsonl')
  const betaFile = path.join(HOME, '.codex', 'sessions', '2026', '07', '31', 'rollout-beta.jsonl')
  const { services } = makeServices({
    rows: [
      { id: 'alpha', rollout_path: alphaFile, cwd: alpha, title: 'Alpha', recency_at_ms: 2000 },
      { id: 'beta', rollout_path: betaFile, cwd: 'D:\\code\\beta', title: 'Beta', recency_at_ms: 3000 }
    ],
    files: {
      [alphaFile]: codexSession({ id: 'alpha', cwd: alpha }),
      [betaFile]: codexSession({ id: 'beta', cwd: 'D:\\code\\beta' })
    }
  })

  const parsed = services.readCodexSession(alpha, 'alpha')

  assert.deepEqual([...parsed.blocks.map((b) => b.kind)], ['user', 'thinking', 'tool_use', 'assistant'])
  assert.equal(parsed.blocks[0].text, 'hello codex')
  assert.equal(parsed.blocks[1].text, 'thinking out loud')
  assert.equal(parsed.blocks[2].name, 'shell_command')
  assert.equal(parsed.blocks[2].result.text, 'D:\\code\\alpha')
  assert.equal(parsed.blocks[3].text, 'answer from codex')
  assert.equal(parsed.meta.version, '0.42.0')
  assert.equal(parsed.meta.count, 4)
  assert.equal(services.readCodexSession(alpha, 'beta'), null)
})

test('readCodexSession reuses parsed content while the file signature is unchanged', () => {
  const alpha = 'D:\\code\\alpha'
  const alphaFile = path.join(HOME, '.codex', 'sessions', '2026', '07', '31', 'rollout-alpha.jsonl')
  const readCounts = {}
  const { services } = makeServices({
    rows: [
      { id: 'alpha', rollout_path: alphaFile, cwd: alpha, title: 'Alpha', recency_at_ms: 2000 }
    ],
    files: {
      [alphaFile]: codexSession({ id: 'alpha', cwd: alpha })
    },
    mtimes: {
      [alphaFile]: 2000
    },
    readFile: (p) => {
      const key = String(p)
      readCounts[key] = (readCounts[key] || 0) + 1
      if (key === alphaFile) return codexSession({ id: 'alpha', cwd: alpha })
      throw new Error('ENOENT: ' + key)
    }
  })

  const first = services.readCodexSession(alpha, 'alpha')
  const second = services.readCodexSession(alpha, 'alpha')

  assert.equal(first.blocks.length, 4)
  assert.equal(second.blocks.length, 4)
  assert.equal(readCounts[alphaFile], 1)
})

test('parseCodexSession uses event_msg chat records and skips injected response input_text', () => {
  const { services } = makeServices()

  const parsed = services.parseCodexSession(codexEventSession({ id: 'event-only', cwd: 'D:\\code\\alpha' }))

  assert.deepEqual([...parsed.blocks.map((b) => b.kind)], ['user', 'assistant'])
  assert.equal(parsed.blocks[0].text, 'real user prompt')
  assert.equal(parsed.blocks[1].text, 'real codex answer')
  assert.equal(parsed.blocks.some((b) => String(b.text || '').includes('environment_context')), false)
})

test('listCodexProjectSessions falls back to session files when sqlite is unavailable', () => {
  const alpha = 'D:\\code\\alpha'
  const alphaFile = path.join(HOME, '.codex', 'sessions', '2026', '07', '31', 'rollout-alpha.jsonl')
  const betaFile = path.join(HOME, '.codex', 'sessions', '2026', '07', '31', 'rollout-beta.jsonl')
  const subagentFile = path.join(HOME, '.codex', 'sessions', '2026', '07', '31', 'rollout-subagent.jsonl')
  const sessionsDir = path.join(HOME, '.codex', 'sessions')
  const dir = (name) => ({ name, isDirectory: () => true, isFile: () => false })
  const file = (name) => ({ name, isDirectory: () => false, isFile: () => true })
  const { services } = makeServices({
    sqlite: false,
    files: {
      [alphaFile]: codexSessionWithInjectedContext({ id: 'alpha', cwd: alpha }),
      [betaFile]: codexSession({ id: 'beta', cwd: 'D:\\code\\beta' }),
      [subagentFile]: codexSession({ id: 'subagent', cwd: alpha, threadSource: 'subagent' })
    },
    mtimes: {
      [alphaFile]: 4000,
      [betaFile]: 5000,
      [subagentFile]: 6000
    },
    existing: [sessionsDir],
    readdir: (p) => {
      const key = String(p)
      if (key === sessionsDir) return [dir('2026')]
      if (key === path.join(sessionsDir, '2026')) return [dir('07')]
      if (key === path.join(sessionsDir, '2026', '07')) return [dir('31')]
      if (key === path.join(sessionsDir, '2026', '07', '31')) return [file('rollout-alpha.jsonl'), file('rollout-beta.jsonl'), file('rollout-subagent.jsonl')]
      return []
    }
  })

  const sessions = services.listCodexProjectSessions(alpha)

  assert.equal(sessions.length, 1)
  assert.equal(sessions[0].sessionId, 'alpha')
  assert.equal(sessions[0].title, 'real list title')
  assert.equal(sessions[0].mtime, 4000)
})

test('listActiveCodexSessions reads Codex logs and filters by alive pid and cwd', () => {
  const alpha = 'D:\\code\\alpha'
  const beta = 'D:\\code\\beta'
  const { services } = makeServices({
    rows: [
      { id: 'alpha-live', rollout_path: '', cwd: '\\\\?\\D:\\code\\alpha', title: 'Alpha live', recency_at_ms: 3000 },
      { id: 'alpha-old-same-pid', rollout_path: '', cwd: alpha, title: 'Alpha old', recency_at_ms: 2500 },
      { id: 'alpha-dead', rollout_path: '', cwd: alpha, title: 'Alpha dead', recency_at_ms: 2000 },
      { id: 'beta-live', rollout_path: '', cwd: beta, title: 'Beta live', recency_at_ms: 1000 }
    ],
    logRows: [
      { thread_id: 'alpha-old-same-pid', process_uuid: 'pid:1234:alive', ts: 30, ts_nanos: 100 },
      { thread_id: 'alpha-live', process_uuid: 'pid:1234:alive', ts: 30, ts_nanos: 200 },
      { thread_id: 'alpha-dead', process_uuid: 'pid:5678:dead', ts: 20, ts_nanos: 0 },
      { thread_id: 'beta-live', process_uuid: 'pid:1234:alive', ts: 10, ts_nanos: 0 },
      { thread_id: '', process_uuid: 'pid:1234:alive', ts: 5, ts_nanos: 0 },
      { thread_id: 'missing', process_uuid: 'bad', ts: 1, ts_nanos: 0 }
    ],
    alivePids: [1234]
  })

  const sessions = services.listActiveCodexSessions(alpha)

  assert.deepEqual(JSON.parse(JSON.stringify(sessions)), [{ sessionId: 'alpha-live', status: 'running', pid: 1234 }])
})

test('listActiveCodexSessions returns empty when Codex logs sqlite is unavailable', () => {
  const { services } = makeServices({ sqlite: false })

  assert.deepEqual(JSON.parse(JSON.stringify(services.listActiveCodexSessions('D:\\code\\alpha'))), [])
})

test('listActiveCodexSessions falls back to external node when preload sqlite is unavailable', () => {
  const alpha = 'D:\\code\\alpha'
  const { services } = makeServices({
    sqlite: false,
    alivePids: [1234],
    spawnSync: (command, args) => {
      assert.equal(command, 'node')
      assert.equal(args[0], '-e')
      return {
        status: 0,
        stdout: JSON.stringify({
          logs: [
            { thread_id: 'alpha-live', process_uuid: 'pid:1234:alive', ts: 30, ts_nanos: 200 },
            { thread_id: 'alpha-old-same-pid', process_uuid: 'pid:1234:alive', ts: 30, ts_nanos: 100 }
          ],
          threads: [
            { id: 'alpha-live', cwd: alpha },
            { id: 'alpha-old-same-pid', cwd: alpha }
          ]
        }),
        stderr: ''
      }
    }
  })

  const sessions = services.listActiveCodexSessions(alpha)

  assert.deepEqual(JSON.parse(JSON.stringify(sessions)), [{ sessionId: 'alpha-live', status: 'running', pid: 1234 }])
})

test('readCodexSession refuses unsafe rollout paths and mismatched session ids', () => {
  const alpha = 'D:\\code\\alpha'
  const mismatchedFile = path.join(HOME, '.codex', 'sessions', '2026', '07', '31', 'rollout-alpha.jsonl')
  const unsafeFile = path.join(HOME, '.codex', 'outside.jsonl')
  const { services } = makeServices({
    rows: [
      { id: 'alpha', rollout_path: mismatchedFile, cwd: alpha, title: 'Alpha', recency_at_ms: 2000 },
      { id: 'unsafe', rollout_path: unsafeFile, cwd: alpha, title: 'Unsafe', recency_at_ms: 1000 }
    ],
    files: {
      [mismatchedFile]: codexSession({ id: 'other-session', cwd: alpha }),
      [unsafeFile]: codexSession({ id: 'unsafe', cwd: alpha })
    }
  })

  assert.equal(services.readCodexSession(alpha, 'alpha'), null)
  assert.equal(services.statCodexSession(alpha, 'alpha'), null)
  assert.equal(services.readCodexSession(alpha, 'unsafe'), null)
})

test('exportCodexSession labels assistant turns as Codex', () => {
  const alpha = 'D:\\code\\alpha'
  const alphaFile = path.join(HOME, '.codex', 'sessions', '2026', '07', '31', 'rollout-alpha.jsonl')
  const { services } = makeServices({
    rows: [
      { id: 'alpha', rollout_path: alphaFile, cwd: alpha, title: 'Alpha', recency_at_ms: 2000 }
    ],
    files: {
      [alphaFile]: codexSession({ id: 'alpha', cwd: alpha })
    }
  })

  const markdown = services.exportCodexSession(alpha, 'alpha')

  assert.match(markdown, /## 🤖 Codex/)
  assert.doesNotMatch(markdown, /## 🤖 Claude/)
})

test('resumeCodexSession launches codex resume without touching Claude resume', () => {
  const alpha = 'D:\\code\\alpha'
  const alphaFile = path.join(HOME, '.codex', 'sessions', '2026', '07', '31', 'rollout-alpha.jsonl')
  const { services, spawns } = makeServices({
    rows: [
      { id: 'alpha', rollout_path: alphaFile, cwd: alpha, title: 'Alpha', recency_at_ms: 2000 }
    ],
    files: {
      [alphaFile]: codexSession({ id: 'alpha', cwd: alpha })
    },
    existing: [alpha]
  })

  const result = services.resumeCodexSession(alpha, 'alpha')

  assert.equal(result.success, true)
  assert.equal(spawns.length, 1)
  assert.match(JSON.stringify(spawns[0].args), /codex resume alpha/)
})

test('resumeCodexSession rejects unknown and shell-unsafe session ids', () => {
  const alpha = 'D:\\code\\alpha'
  const alphaFile = path.join(HOME, '.codex', 'sessions', '2026', '07', '31', 'rollout-alpha.jsonl')
  const unsafeFile = path.join(HOME, '.codex', 'outside.jsonl')
  const { services, spawns } = makeServices({
    rows: [
      { id: 'alpha', rollout_path: alphaFile, cwd: alpha, title: 'Alpha', recency_at_ms: 2000 },
      { id: 'unsafe', rollout_path: unsafeFile, cwd: alpha, title: 'Unsafe', recency_at_ms: 1000 }
    ],
    files: {
      [alphaFile]: codexSession({ id: 'alpha', cwd: alpha }),
      [unsafeFile]: codexSession({ id: 'unsafe', cwd: alpha })
    },
    existing: [alpha]
  })

  assert.equal(services.resumeCodexSession(alpha, 'missing').success, false)
  assert.equal(services.resumeCodexSession(alpha, 'alpha; calc').success, false)
  assert.equal(services.resumeCodexSession(alpha, 'unsafe').success, false)
  assert.equal(spawns.length, 0)
})
