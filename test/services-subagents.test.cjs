/**
 * @file 测试子任务相关预加载接口：task-notification 解析、listSubagents、readSubagent
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { loadPreload } = require('./helpers/load-preload.cjs')

const line = (obj) => JSON.stringify(obj)

// 仅需 parseSession（纯函数）：给一组不触碰 fs 的 mock
function pureEnv () {
  return loadPreload({ readdir: () => [], readFile: () => '', stat: () => ({ mtimeMs: 0, size: 0 }) })
}

test('parseSession: task-notification 并入对应 Agent 工具调用、不产出独立块', () => {
  const { services } = pureEnv()
  const notif = [
    '<task-notification>',
    '<task-id>a6fb3ce5f2e14c158</task-id>',
    '<tool-use-id>toolu_x</tool-use-id>',
    '<status>completed</status>',
    '<usage><subagent_tokens>40479</subagent_tokens><tool_uses>10</tool_uses><duration_ms>131950</duration_ms></usage>',
    '</task-notification>'
  ].join('\n')
  const jsonl = [
    line({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_x', name: 'Agent', input: { description: 'Do work' } }] } }),
    line({ type: 'user', message: { role: 'user', content: notif }, timestamp: 't1' })
  ].join('\n')
  const { blocks } = services.parseSession(jsonl)
  // 通知不产出独立块，仅把结果挂到对应 Agent 工具调用的 .subtask
  assert.equal(blocks.length, 1)
  assert.equal(blocks[0].kind, 'tool_use')
  const sub = blocks[0].subtask
  assert.equal(sub.agentId, 'a6fb3ce5f2e14c158')
  assert.equal(sub.status, 'completed')
  assert.equal(sub.tokens, 40479)
  assert.equal(sub.toolUses, 10)
  assert.equal(sub.durationMs, 131950)
})

test('parseSession: 普通用户消息不受影响', () => {
  const { services } = pureEnv()
  const jsonl = line({ type: 'user', message: { role: 'user', content: 'real question' } })
  const { blocks } = services.parseSession(jsonl)
  assert.equal(blocks[0].kind, 'user')
  assert.equal(blocks[0].text, 'real question')
})

test('parseSession: 含 <task-notification> 但不在开头仍按用户解析', () => {
  const { services } = pureEnv()
  const jsonl = line({ type: 'user', message: { role: 'user', content: 'see <task-notification><task-id>x</task-id></task-notification> above' } })
  const { blocks } = services.parseSession(jsonl)
  assert.equal(blocks[0].kind, 'user')
})

test('parseSession: 无匹配 tool_use 的 task-notification 被丢弃', () => {
  const { services } = pureEnv()
  const notif = '<task-notification>\n<task-id>z</task-id>\n<tool-use-id>nope</tool-use-id>\n<status>completed</status>\n</task-notification>'
  const { blocks } = services.parseSession(line({ type: 'user', message: { role: 'user', content: notif } }))
  assert.equal(blocks.length, 0)
})

const HOME = 'C:\\Users\\tester'
const PROJDIR = path.join(HOME, '.claude', 'projects', 'myproj')
const SUBDIR = path.join(PROJDIR, 'sess1', 'subagents')

function subEnv () {
  const metas = {
    'agent-aaa.meta.json': JSON.stringify({ agentType: 'general-purpose', description: 'Task A', toolUseId: 'tu_a', spawnDepth: 1 }),
    'agent-bbb.meta.json': JSON.stringify({ agentType: 'code-reviewer', description: 'Task B', toolUseId: 'tu_b', spawnDepth: 1 })
  }
  const jsonls = {
    'agent-aaa.jsonl': line({ type: 'user', message: { role: 'user', content: 'hi from A' }, timestamp: 't1' }),
    'agent-bbb.jsonl': line({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'B reply' }] }, timestamp: 't2' })
  }
  const mtimes = { 'agent-aaa.jsonl': 5000, 'agent-bbb.jsonl': 3000 }
  const readdir = (p) => (path.resolve(p) === path.resolve(SUBDIR) ? [...Object.keys(metas), ...Object.keys(jsonls)] : [])
  const readFile = (p) => {
    const b = path.basename(p)
    if (metas[b] != null) return metas[b]
    if (jsonls[b] != null) return jsonls[b]
    throw new Error('ENOENT ' + p)
  }
  const stat = (p) => ({ mtimeMs: mtimes[path.basename(p)] || 0, size: 10 })
  return loadPreload({ platform: 'win32', homedir: HOME, readdir, readFile, stat })
}

test('listSubagents: 返回字段并按 mtime 升序', () => {
  const { services } = subEnv()
  const list = [...services.listSubagents('myproj', 'sess1')]
  assert.equal(list.length, 2)
  // bbb(3000) 在 aaa(5000) 之前
  assert.equal(list[0].agentId, 'bbb')
  assert.equal(list[0].description, 'Task B')
  assert.equal(list[0].agentType, 'code-reviewer')
  assert.equal(list[0].mtime, 3000)
  assert.equal(list[1].agentId, 'aaa')
  assert.equal(list[1].toolUseId, 'tu_a')
})

test('listSubagents: 无子任务目录返回空数组', () => {
  const { services } = subEnv()
  assert.deepEqual([...services.listSubagents('myproj', 'nope')], [])
})

test('readSubagent: 解析指定子任务转录', () => {
  const { services } = subEnv()
  const parsed = services.readSubagent('myproj', 'sess1', 'aaa')
  assert.equal(parsed.blocks[0].kind, 'user')
  assert.equal(parsed.blocks[0].text, 'hi from A')
})

test('readSubagent: 非法 agentId 返回 null', () => {
  const { services } = subEnv()
  assert.equal(services.readSubagent('myproj', 'sess1', '../evil'), null)
})
