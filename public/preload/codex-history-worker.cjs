const fs = require('node:fs')
const path = require('node:path')

const HISTORY_SQL = [
  'select id, rollout_path, cwd, title, first_user_message, preview,',
  'recency_at_ms, updated_at_ms, updated_at, created_at_ms, created_at,',
  'git_branch, git_sha, cli_version, model, reasoning_effort, tokens_used, approval_mode, sandbox_policy, thread_source',
  "from threads where cwd is not null and trim(cwd) <> ''",
].join(' ')

const THREAD_SQL = "select id, cwd, thread_source from threads where cwd is not null and trim(cwd) <> ''"

const LOG_SQL = [
  'select thread_id, process_uuid, ts, ts_nanos',
  'from logs',
  "where thread_id is not null and trim(thread_id) <> ''",
  "and process_uuid is not null and process_uuid like 'pid:%'",
  'order by ts desc, ts_nanos desc',
  'limit 2000',
].join(' ')

function normalizePath(cwd, platform) {
  if (typeof cwd !== 'string' || !cwd.trim()) return ''
  let value = cwd.trim()
  const pathApi = platform === 'win32' ? path.win32 : path.posix

  if (platform === 'win32') {
    const upper = value.toUpperCase()
    if (upper.startsWith('\\\\?\\UNC\\')) value = '\\\\' + value.slice(8)
    else if (upper.startsWith('\\\\?\\')) value = value.slice(4)
  }

  const normalized = pathApi.normalize(value)
  return platform === 'win32' ? normalized.toLowerCase() : normalized
}

function normalizeSessionId(id) {
  return typeof id === 'string' ? id.trim() : ''
}

function historyRowsForCwd(rows, cwd, platform) {
  if (!Array.isArray(rows)) return []
  const target = normalizePath(cwd, platform)
  if (!target) return []
  return rows.filter((row) => (
    row &&
    !(
      typeof row.thread_source === 'string' &&
      row.thread_source.trim().toLowerCase() === 'subagent'
    ) &&
    normalizePath(row.cwd, platform) === target
  ))
}

function pidFromProcessUuid(processUuid) {
  if (typeof processUuid !== 'string') return null
  const match = processUuid.match(/^pid:(\d+):/)
  if (!match) return null
  const pid = Number(match[1])
  return Number.isSafeInteger(pid) && pid > 0 ? pid : null
}

function numericTimestamp(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function computeActiveSessions({ cwd, platform, threadRows, logRows, isPidAlive }) {
  const allowedIds = new Set(
    historyRowsForCwd(threadRows, cwd, platform)
      .map((row) => normalizeSessionId(row.id))
      .filter(Boolean),
  )
  const latestByProcess = new Map()

  for (const row of Array.isArray(logRows) ? logRows : []) {
    if (!row || typeof row.process_uuid !== 'string' || !row.process_uuid) continue
    const ts = numericTimestamp(row.ts)
    const tsNanos = numericTimestamp(row.ts_nanos)
    const previous = latestByProcess.get(row.process_uuid)
    if (!previous || ts > previous.ts || (ts === previous.ts && tsNanos > previous.tsNanos)) {
      latestByProcess.set(row.process_uuid, { row, ts, tsNanos })
    }
  }

  const bySession = new Map()
  for (const latest of latestByProcess.values()) {
    const row = latest.row
    const sessionId = normalizeSessionId(row.thread_id)
    if (!sessionId || !allowedIds.has(sessionId) || bySession.has(sessionId)) continue
    const pid = pidFromProcessUuid(row.process_uuid)
    if (pid === null || typeof isPidAlive !== 'function') continue
    let alive = false
    try { alive = isPidAlive(pid) } catch (_) { /* treat probe failures as dead */ }
    if (!alive) continue
    bySession.set(sessionId, { sessionId, status: 'running', pid })
  }

  return [...bySession.values()]
}

function readSqliteRows(dbPath, sql, deps = {}) {
  let sqlite
  try {
    if (Object.prototype.hasOwnProperty.call(deps, 'sqlite')) sqlite = deps.sqlite
    else if (typeof deps.loadSqlite === 'function') sqlite = deps.loadSqlite()
    else sqlite = require('node:sqlite')
    if (!sqlite || typeof sqlite.DatabaseSync !== 'function') return null
  } catch (_) {
    return null
  }

  let db
  try {
    db = new sqlite.DatabaseSync(dbPath, { readOnly: true })
    return db.prepare(sql).all()
  } catch (_) {
    return null
  } finally {
    if (db && typeof db.close === 'function') {
      try { db.close() } catch (_) { /* ignore close failures */ }
    }
  }
}

function collectSessionFiles(sessionsDir, deps = {}) {
  const fileSystem = deps.fs || fs
  const files = []
  const pending = [sessionsDir]

  while (pending.length > 0) {
    const current = pending.pop()
    let entries
    try { entries = fileSystem.readdirSync(current, { withFileTypes: true }) } catch (_) { continue }
    for (const entry of entries) {
      const filePath = path.join(current, entry.name)
      if (entry.isDirectory()) pending.push(filePath)
      else if (entry.isFile() && entry.name.endsWith('.jsonl')) files.push(filePath)
    }
  }

  return files
}

function payloadText(value) {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (typeof item === 'string') return item
      if (!item || typeof item !== 'object') return ''
      if (typeof item.text === 'string') return item.text
      if (typeof item.content === 'string') return item.content
      return ''
    }).filter(Boolean).join('\n')
  }
  if (value && typeof value === 'object') {
    if (typeof value.text === 'string') return value.text
    if (typeof value.message === 'string') return value.message
    if (value.content !== undefined) return payloadText(value.content)
  }
  return ''
}

function sessionIdFromFileName(filePath) {
  const base = path.basename(filePath || '', '.jsonl')
  const uuid = base.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i)
  return uuid ? uuid[1] : base.replace(/^rollout-[^-]+-/, '')
}

function rowFromSessionFile(filePath, deps = {}) {
  const fileSystem = deps.fs || fs
  let content
  try { content = fileSystem.readFileSync(filePath, 'utf8') } catch (_) { return null }
  if (Buffer.isBuffer(content)) content = content.toString('utf8')
  if (typeof content !== 'string') return null

  let metaRecord = null
  let title = ''
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue
    let record
    try { record = JSON.parse(line.replace(/^\uFEFF/, '')) } catch (_) { continue }
    if (!metaRecord && record && record.type === 'session_meta' && record.payload) metaRecord = record
    if (!title && record && record.type === 'event_msg' && record.payload && record.payload.type === 'user_message') {
      title = payloadText(record.payload.message || record.payload.text || record.payload)
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80)
    }
  }

  const payload = metaRecord && metaRecord.payload
  if (!payload || typeof payload.cwd !== 'string' || !payload.cwd.trim()) return null
  const id = normalizeSessionId(payload.id || payload.session_id || sessionIdFromFileName(filePath))
  if (!id) return null

  const parsedTimestamp = Date.parse(payload.timestamp || metaRecord.timestamp || '')
  const createdAtMs = Number.isFinite(parsedTimestamp) ? parsedTimestamp : 0
  let mtimeMs = createdAtMs
  let size = 0
  try {
    const stat = fileSystem.statSync(filePath)
    if (Number.isFinite(stat.mtimeMs) && stat.mtimeMs > 0) mtimeMs = stat.mtimeMs
    size = Number(stat.size) || 0
  } catch (_) {
    // Session timestamp remains the recency fallback.
  }

  const git = payload.git && typeof payload.git === 'object' ? payload.git : {}
  const source = payload.source || ''
  const threadSource = payload.thread_source || (
    source && typeof source === 'object' && source.subagent ? 'subagent' : ''
  )

  return {
    id,
    rollout_path: filePath,
    session_path: filePath,
    cwd: payload.cwd.trim(),
    title,
    first_user_message: title,
    preview: title,
    recency_at_ms: mtimeMs,
    updated_at_ms: mtimeMs,
    updated_at: mtimeMs / 1000,
    created_at_ms: createdAtMs,
    created_at: createdAtMs / 1000,
    size,
    originator: payload.originator || '',
    cli_version: payload.cli_version || '',
    source,
    model_provider: payload.model_provider || '',
    git_branch: payload.git_branch || git.branch || '',
    git_sha: payload.git_sha || git.commit_hash || git.sha || '',
    model: payload.model || '',
    reasoning_effort: payload.reasoning_effort || '',
    tokens_used: Number(payload.tokens_used) || 0,
    approval_mode: payload.approval_mode || '',
    sandbox_policy: payload.sandbox_policy || '',
    thread_source: threadSource,
  }
}

function loadHistoryRows(input = {}, deps = {}) {
  const readRows = deps.readSqliteRows || readSqliteRows
  let rows = readRows(input.stateDbPath, HISTORY_SQL, deps)

  if (rows === null) {
    const collect = deps.collectSessionFiles || collectSessionFiles
    const rowFromFile = deps.rowFromSessionFile || rowFromSessionFile
    rows = collect(input.sessionsDir, deps)
      .map((filePath) => rowFromFile(filePath, deps))
      .filter(Boolean)
  }

  return historyRowsForCwd(rows, input.cwd, input.platform || process.platform)
}

function defaultIsPidAlive(pid, kill) {
  try {
    kill(pid, 0)
    return true
  } catch (error) {
    return !!error && error.code === 'EPERM'
  }
}

function loadActiveSessions(input = {}, deps = {}) {
  const readRows = deps.readSqliteRows || readSqliteRows
  const logRows = readRows(input.logsDbPath, LOG_SQL, deps)
  const threadRows = readRows(input.stateDbPath, THREAD_SQL, deps)
  if (logRows === null || threadRows === null) return []

  const kill = deps.kill || process.kill.bind(process)
  const isPidAlive = deps.isPidAlive || ((pid) => defaultIsPidAlive(pid, kill))
  return computeActiveSessions({
    cwd: input.cwd,
    platform: input.platform || process.platform,
    threadRows,
    logRows,
    isPidAlive,
  })
}

function run(mode, input, deps = {}) {
  let result
  if (mode === 'history') result = loadHistoryRows(input, deps)
  else if (mode === 'active') result = loadActiveSessions(input, deps)
  else throw new Error(`Unknown Codex history worker mode: ${mode}`)
  process.stdout.write(JSON.stringify(result))
  return result
}

module.exports = {
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
}
