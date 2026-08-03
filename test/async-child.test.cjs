const { EventEmitter } = require('node:events')
const { PassThrough } = require('node:stream')
const assert = require('node:assert/strict')
const test = require('node:test')

const { runNodeJson } = require('../public/preload/async-child.cjs')

function createChild({ closeOnKill = false } = {}) {
  const child = new EventEmitter()
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.killed = false
  child.kill = () => {
    child.killed = true
    if (closeOnKill) child.emit('close', null, 'SIGTERM')
    return true
  }
  return child
}

test('parses JSON stdout from a successful child', async () => {
  const child = createChild()
  let spawnArgs
  const resultPromise = runNodeJson('process.stdout.write("{}")', {
    spawn(...args) {
      spawnArgs = args
      return child
    },
  })

  child.stdout.end('{"ok":true}')
  child.stderr.end()
  child.emit('close', 0, null)

  assert.deepEqual(await resultPromise, { ok: true })
  assert.deepEqual(spawnArgs, [
    'node',
    ['-e', 'process.stdout.write("{}")'],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
  ])
})

test('rejects a non-zero exit with stderr and the exit code', async () => {
  const child = createChild()
  const resultPromise = runNodeJson('ignored', { spawn: () => child })

  child.stderr.end('database failed')
  child.stdout.end()
  child.emit('close', 7, null)

  await assert.rejects(resultPromise, (error) => {
    assert.match(error.message, /7/)
    assert.match(error.message, /database failed/)
    return true
  })
})

test('rejects malformed JSON output', async () => {
  const child = createChild()
  const resultPromise = runNodeJson('ignored', { spawn: () => child })

  child.stdout.end('not json')
  child.stderr.end()
  child.emit('close', 0, null)

  await assert.rejects(resultPromise, /JSON/i)
})

test('kills the child and rejects when output exceeds the byte limit', async () => {
  const child = createChild({ closeOnKill: true })
  const resultPromise = runNodeJson('ignored', {
    spawn: () => child,
    maxOutputBytes: 4,
  })

  child.stdout.write('12345')

  await assert.rejects(resultPromise, /output limit/i)
  assert.equal(child.killed, true)
})

test('kills the child and rejects when it does not close before the timeout', async () => {
  const child = createChild({ closeOnKill: true })

  await assert.rejects(
    runNodeJson('ignored', { spawn: () => child, timeoutMs: 10 }),
    /timed out/i,
  )
  assert.equal(child.killed, true)
})
