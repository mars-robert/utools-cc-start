/**
 * @file 当前打开 session 的精确检测。
 *   每个运行中的 claude 实例会在 ~/.claude/sessions/<pid>.json 写入
 *   { pid, sessionId, cwd, status, kind, ... }。据此精确判定「此刻真正
 *   打开的 session」——只要进程存活文件就在，与 jsonl 是否在写无关，
 *   故空闲会话也能判定。
 *
 *   抽成独立 CommonJS 模块（而非内联进 services.js），以便测试 runner
 *   能直接 require 真实代码（services.js 顶层引用 window，无法被 require）。
 */

const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

// 归一化 cwd 以便跨平台、跨写法比较：
// win32 忽略大小写、统一分隔符；两端去尾分隔符。
function normalizeCwd (p) {
  if (typeof p !== 'string') return ''
  let s = p.trim()
  if (process.platform === 'win32') {
    s = s.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
  } else {
    s = s.replace(/\/+$/, '')
  }
  return s
}

// 进程存活校验：signal 0 不发送信号，仅探测存在性。
// 不抛=存活；EPERM=存在但无权限（仍视为存活）；其余（ESRCH 等）=已退出。
function isPidAlive (pid) {
  if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return !!e && e.code === 'EPERM'
  }
}

// 从 sessions 记录中筛出活跃会话。
// records: [{pid, sessionId, cwd, status, kind}]；isAlive: (pid)=>bool；
// cwd: 传入则仅返回归一化后匹配该目录的会话（不传返回全部）。
function filterActiveSessions (records, isAlive, cwd) {
  if (!Array.isArray(records)) return []
  const want = cwd != null ? normalizeCwd(cwd) : null
  const out = []
  for (const r of records) {
    if (!r || typeof r !== 'object') continue
    if (r.kind !== 'interactive') continue
    if (!r.sessionId || typeof r.pid !== 'number') continue
    if (!isAlive(r.pid)) continue
    if (want !== null && normalizeCwd(r.cwd) !== want) continue
    out.push({ sessionId: r.sessionId, status: r.status || '', pid: r.pid })
  }
  return out
}

// 读取 ~/.claude/sessions 下全部 <pid>.json，返回当前活跃会话。
// cwd 传入则按项目目录过滤。纯只读，坏文件/缺目录安全降级为空数组。
function listActiveSessions (cwd) {
  const dir = path.join(os.homedir(), '.claude', 'sessions')
  let names
  try {
    names = fs.readdirSync(dir).filter((f) => f.endsWith('.json'))
  } catch (_) { return [] }
  const records = []
  for (const name of names) {
    try {
      records.push(JSON.parse(fs.readFileSync(path.join(dir, name), 'utf-8')))
    } catch (_) { /* 跳过坏文件 */ }
  }
  return filterActiveSessions(records, isPidAlive, cwd)
}

module.exports = { normalizeCwd, isPidAlive, filterActiveSessions, listActiveSessions }
