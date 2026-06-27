/**
 * @file 测试 active-sessions.cjs：当前打开 session 的精确检测核心
 *   - filterActiveSessions：从 ~/.claude/sessions/<pid>.json 记录中筛出
 *     「进程存活 + interactive + cwd 匹配」的活跃会话
 *   - normalizeCwd：跨平台 cwd 归一化（用于匹配项目目录）
 *   - isPidAlive：进程存活校验
 */

const { filterActiveSessions, normalizeCwd, isPidAlive } = require('../public/preload/active-sessions.cjs')

// ---- 迷你测试骨架（与 services-decode.test.cjs 一致）----
function test (name, fn) {
  try {
    fn()
    console.log(`✓ ${name}`)
  } catch (err) {
    console.error(`✗ ${name}`)
    console.error('  ', err.message)
    process.exitCode = 1
  }
}

function assertEquals (actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || 'Assertion failed'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

const alive = () => true
const dead = () => false

console.log('\n=== 活跃会话检测测试 ===\n')

// ---- filterActiveSessions ----

test('filterActiveSessions: 保留存活的 interactive 会话', () => {
  const recs = [{ pid: 100, sessionId: 's1', cwd: '/proj', status: 'busy', kind: 'interactive' }]
  const out = filterActiveSessions(recs, alive)
  assertEquals(out.length, 1)
  assertEquals(out[0].sessionId, 's1')
  assertEquals(out[0].status, 'busy')
  assertEquals(out[0].pid, 100)
})

test('filterActiveSessions: 剔除死进程', () => {
  const recs = [{ pid: 100, sessionId: 's1', cwd: '/proj', status: 'busy', kind: 'interactive' }]
  assertEquals(filterActiveSessions(recs, dead).length, 0)
})

test('filterActiveSessions: 剔除非 interactive', () => {
  const recs = [{ pid: 100, sessionId: 's1', cwd: '/proj', kind: 'sdk' }]
  assertEquals(filterActiveSessions(recs, alive).length, 0)
})

test('filterActiveSessions: 跳过坏记录（null / 缺字段 / pid 非数字）', () => {
  const recs = [
    null,
    {},
    { pid: 'x', sessionId: 's', kind: 'interactive' },
    { pid: 1, kind: 'interactive' }
  ]
  assertEquals(filterActiveSessions(recs, alive).length, 0)
})

test('filterActiveSessions: 按 cwd 过滤，仅返回匹配项目的会话', () => {
  const recs = [
    { pid: 1, sessionId: 'a', cwd: '/proj/x', kind: 'interactive' },
    { pid: 2, sessionId: 'b', cwd: '/proj/y', kind: 'interactive' }
  ]
  const out = filterActiveSessions(recs, alive, '/proj/x')
  assertEquals(out.length, 1)
  assertEquals(out[0].sessionId, 'a')
})

test('filterActiveSessions: 不传 cwd 返回全部存活 interactive', () => {
  const recs = [
    { pid: 1, sessionId: 'a', cwd: '/p1', kind: 'interactive' },
    { pid: 2, sessionId: 'b', cwd: '/p2', kind: 'interactive' }
  ]
  assertEquals(filterActiveSessions(recs, alive).length, 2)
})

test('filterActiveSessions: 同项目多个会话（多终端）都返回', () => {
  const recs = [
    { pid: 1, sessionId: 'a', cwd: '/p', kind: 'interactive' },
    { pid: 2, sessionId: 'b', cwd: '/p', kind: 'interactive' }
  ]
  assertEquals(filterActiveSessions(recs, alive, '/p').length, 2)
})

// ---- isPidAlive ----

test('isPidAlive: 当前进程存活', () => {
  assertEquals(isPidAlive(process.pid), true)
})

test('isPidAlive: 不存在的 pid 返回 false', () => {
  assertEquals(isPidAlive(2147483646), false)
})

// ---- normalizeCwd（平台相关）----

if (process.platform === 'win32') {
  test('normalizeCwd: win32 大小写/斜杠/尾分隔符归一', () => {
    assertEquals(normalizeCwd('D:\\Code\\X'), normalizeCwd('d:/code/x/'))
  })
  test('filterActiveSessions: win32 cwd 大小写与斜杠差异仍匹配', () => {
    const recs = [{ pid: 1, sessionId: 'a', cwd: 'D:\\code\\utools\\claudecode\\claude', kind: 'interactive' }]
    const out = filterActiveSessions(recs, alive, 'd:/code/utools/claudecode/claude')
    assertEquals(out.length, 1)
  })
} else {
  test('normalizeCwd: posix 去尾斜杠', () => {
    assertEquals(normalizeCwd('/proj/'), '/proj')
  })
}
