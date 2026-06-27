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

test('parseSession: <task-notification> 识别为系统通知块而非用户', () => {
  const { services } = pureEnv()
  const notif = [
    '<task-notification>',
    '<task-id>a6fb3ce5f2e14c158</task-id>',
    '<tool-use-id>toolu_x</tool-use-id>',
    '<status>completed</status>',
    '<summary>Agent "Review Task 1" finished</summary>',
    '<result>Approved</result>',
    '</task-notification>'
  ].join('\n')
  const jsonl = line({ type: 'user', message: { role: 'user', content: notif }, timestamp: 't1' })
  const { blocks } = services.parseSession(jsonl)
  assert.equal(blocks.length, 1)
  assert.equal(blocks[0].kind, 'system')
  assert.equal(blocks[0].subtype, 'subtask_notice')
  assert.equal(blocks[0].agentId, 'a6fb3ce5f2e14c158')
  assert.equal(blocks[0].text, 'Agent "Review Task 1" finished')
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
