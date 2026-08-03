const assert = require('node:assert/strict')
const test = require('node:test')

const { createHistoryLoader } = require('../src/ProjectHistory/load-core.js')

function deferred () {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

test('paints sessions before applying active sessions', async () => {
  const paint = deferred()
  const paintStarted = deferred()
  const active = deferred()
  const activeStarted = deferred()
  const events = []
  let activeRequestStarted = false
  const loader = createHistoryLoader({
    listSessions: async (key) => {
      assert.equal(key, 'alpha')
      return ['session-alpha']
    },
    onSessions: (sessions) => events.push(['sessions', sessions]),
    afterListRender: () => {
      events.push(['paint'])
      paintStarted.resolve()
      return paint.promise
    },
    listActive: (key) => {
      activeRequestStarted = true
      events.push(['active-start', key])
      activeStarted.resolve()
      return active.promise
    },
    onActive: (sessions) => events.push(['active', sessions]),
  })

  const loading = loader.load('alpha')
  await paintStarted.promise
  await Promise.resolve()

  assert.deepEqual(events, [
    ['sessions', ['session-alpha']],
    ['paint'],
  ])
  assert.equal(activeRequestStarted, false)

  paint.resolve()
  await activeStarted.promise

  assert.deepEqual(events, [
    ['sessions', ['session-alpha']],
    ['paint'],
    ['active-start', 'alpha'],
  ])
  assert.equal(events.some(([event]) => event === 'active'), false)

  active.resolve(['active-alpha'])
  await loading

  assert.deepEqual(events.at(-1), ['active', ['active-alpha']])
})

test('serializes repeated active refreshes with the same promise', async () => {
  const sessions = deferred()
  const active = deferred()
  const activeStarted = deferred()
  let activeCalls = 0
  const loader = createHistoryLoader({
    listSessions: () => sessions.promise,
    onSessions: () => {},
    afterListRender: () => {},
    listActive: () => {
      activeCalls += 1
      activeStarted.resolve()
      return active.promise
    },
    onActive: () => {},
  })

  const loading = loader.load('alpha')
  const first = loader.refreshActive()
  const second = loader.refreshActive()

  assert.strictEqual(second, first)
  await activeStarted.promise
  assert.equal(activeCalls, 1)

  active.resolve(['active-alpha'])
  assert.deepEqual(await first, ['active-alpha'])

  loader.invalidate()
  sessions.resolve([])
  await loading
  assert.equal(activeCalls, 1)
})

test('a newer project prevents an unresolved old list from applying', async () => {
  const alphaSessions = deferred()
  const appliedSessions = []
  const appliedActive = []
  const activeKeys = []
  const loader = createHistoryLoader({
    listSessions: (key) => key === 'alpha' ? alphaSessions.promise : Promise.resolve(['session-beta']),
    onSessions: (sessions) => appliedSessions.push(sessions),
    afterListRender: () => {},
    listActive: async (key) => {
      activeKeys.push(key)
      return [`active-${key}`]
    },
    onActive: (sessions) => appliedActive.push(sessions),
  })

  const alphaLoad = loader.load('alpha')
  const betaLoad = loader.load('beta')
  await betaLoad

  alphaSessions.resolve(['session-alpha'])
  await alphaLoad

  assert.deepEqual(appliedSessions, [['session-beta']])
  assert.deepEqual(appliedActive, [['active-beta']])
  assert.deepEqual(activeKeys, ['beta'])
})

test('queues the new project active refresh behind stale in-flight work', async () => {
  const alphaActive = deferred()
  const alphaActiveStarted = deferred()
  const betaActive = deferred()
  const betaActiveStarted = deferred()
  const betaSessionsApplied = deferred()
  const activeKeys = []
  const appliedActive = []
  let concurrentActive = 0
  let maxConcurrentActive = 0
  const loader = createHistoryLoader({
    listSessions: async (key) => [`session-${key}`],
    onSessions: (sessions) => {
      if (sessions[0] === 'session-beta') betaSessionsApplied.resolve()
    },
    afterListRender: () => {},
    listActive: (key) => {
      activeKeys.push(key)
      concurrentActive += 1
      maxConcurrentActive = Math.max(maxConcurrentActive, concurrentActive)
      const request = key === 'alpha' ? alphaActive : betaActive
      if (key === 'alpha') alphaActiveStarted.resolve()
      if (key === 'beta') betaActiveStarted.resolve()
      return request.promise.finally(() => { concurrentActive -= 1 })
    },
    onActive: (sessions) => appliedActive.push(sessions),
  })

  const alphaLoad = loader.load('alpha')
  await alphaActiveStarted.promise

  const betaLoad = loader.load('beta')
  await betaSessionsApplied.promise
  await Promise.resolve()

  assert.deepEqual(activeKeys, ['alpha'])
  alphaActive.resolve(['active-alpha'])
  await alphaLoad

  assert.deepEqual(activeKeys, ['alpha', 'beta'])
  await betaActiveStarted.promise
  assert.deepEqual(appliedActive, [])
  assert.equal(maxConcurrentActive, 1)

  betaActive.resolve(['active-beta'])
  await betaLoad

  assert.deepEqual(appliedActive, [['active-beta']])
  assert.equal(maxConcurrentActive, 1)
})

test('supersedes a queued active refresh with the latest project', async () => {
  const alphaActive = deferred()
  const alphaActiveStarted = deferred()
  const betaSessionsApplied = deferred()
  const charlieSessionsApplied = deferred()
  const charlieActive = deferred()
  const charlieActiveStarted = deferred()
  const activeKeys = []
  const appliedActive = []
  let concurrentActive = 0
  let maxConcurrentActive = 0
  const loader = createHistoryLoader({
    listSessions: async (key) => [`session-${key}`],
    onSessions: (sessions) => {
      if (sessions[0] === 'session-beta') betaSessionsApplied.resolve()
      if (sessions[0] === 'session-charlie') charlieSessionsApplied.resolve()
    },
    afterListRender: () => {},
    listActive: (key) => {
      activeKeys.push(key)
      concurrentActive += 1
      maxConcurrentActive = Math.max(maxConcurrentActive, concurrentActive)
      const request = key === 'alpha' ? alphaActive : charlieActive
      if (key === 'alpha') alphaActiveStarted.resolve()
      if (key === 'charlie') charlieActiveStarted.resolve()
      return request.promise.finally(() => { concurrentActive -= 1 })
    },
    onActive: (sessions) => appliedActive.push(sessions),
  })

  const alphaLoad = loader.load('alpha')
  await alphaActiveStarted.promise

  const betaLoad = loader.load('beta')
  await betaSessionsApplied.promise
  await Promise.resolve()
  const queuedBeta = loader.refreshActive()
  assert.strictEqual(loader.refreshActive(), queuedBeta)
  let queuedBetaSettled = false
  let queuedBetaResult
  queuedBeta.then((value) => {
    queuedBetaSettled = true
    queuedBetaResult = value
  })

  const charlieLoad = loader.load('charlie')
  await charlieSessionsApplied.promise
  await Promise.resolve()
  const queuedCharlie = loader.refreshActive()
  assert.strictEqual(loader.refreshActive(), queuedCharlie)

  assert.equal(queuedBetaSettled, true)
  assert.equal(queuedBetaResult, null)
  assert.deepEqual(activeKeys, ['alpha'])

  alphaActive.resolve(['active-alpha'])
  await alphaLoad
  await charlieActiveStarted.promise
  assert.deepEqual(activeKeys, ['alpha', 'charlie'])
  assert.deepEqual(appliedActive, [])
  assert.equal(maxConcurrentActive, 1)

  charlieActive.resolve(['active-charlie'])
  await Promise.all([betaLoad, charlieLoad, queuedCharlie])

  assert.deepEqual(appliedActive, [['active-charlie']])
  assert.equal(maxConcurrentActive, 1)
})

test('invalidate settles queued active work without launching it', async () => {
  const alphaActive = deferred()
  const alphaActiveStarted = deferred()
  const betaSessionsApplied = deferred()
  const activeKeys = []
  const loader = createHistoryLoader({
    listSessions: async (key) => [`session-${key}`],
    onSessions: (sessions) => {
      if (sessions[0] === 'session-beta') betaSessionsApplied.resolve()
    },
    afterListRender: () => {},
    listActive: (key) => {
      activeKeys.push(key)
      if (key === 'alpha') alphaActiveStarted.resolve()
      return alphaActive.promise
    },
    onActive: () => {},
  })

  const alphaLoad = loader.load('alpha')
  await alphaActiveStarted.promise
  const betaLoad = loader.load('beta')
  await betaSessionsApplied.promise
  await Promise.resolve()
  const queuedBeta = loader.refreshActive()
  let queuedBetaSettled = false
  let queuedBetaResult
  queuedBeta.then((value) => {
    queuedBetaSettled = true
    queuedBetaResult = value
  })

  loader.invalidate()
  await Promise.resolve()
  assert.equal(queuedBetaSettled, true)
  assert.equal(queuedBetaResult, null)

  alphaActive.resolve(['active-alpha'])
  await Promise.all([alphaLoad, betaLoad])
  assert.deepEqual(activeKeys, ['alpha'])
})

test('preserves the previous active state when a refresh fails', async () => {
  const failedActive = deferred()
  const failureStarted = deferred()
  let activeCalls = 0
  let activeState = []
  let appliedCount = 0
  const loader = createHistoryLoader({
    listSessions: async () => [],
    onSessions: () => {},
    afterListRender: () => {},
    listActive: () => {
      activeCalls += 1
      if (activeCalls === 1) return Promise.resolve(['existing-active'])
      failureStarted.resolve()
      return failedActive.promise
    },
    onActive: (sessions) => {
      appliedCount += 1
      activeState = sessions
    },
  })

  await loader.load('alpha')
  assert.deepEqual(activeState, ['existing-active'])

  const refreshing = loader.refreshActive()
  await failureStarted.promise
  failedActive.reject(new Error('active unavailable'))

  assert.equal(await refreshing, null)
  assert.deepEqual(activeState, ['existing-active'])
  assert.equal(appliedCount, 1)
})

test('invalidate prevents outstanding list and active results from applying', async () => {
  const staleList = deferred()
  const staleActive = deferred()
  const activeStarted = deferred()
  const appliedSessions = []
  const appliedActive = []
  const loader = createHistoryLoader({
    listSessions: (key) => key === 'list-pending' ? staleList.promise : Promise.resolve(['current-session']),
    onSessions: (sessions) => appliedSessions.push(sessions),
    afterListRender: () => {},
    listActive: () => {
      activeStarted.resolve()
      return staleActive.promise
    },
    onActive: (sessions) => appliedActive.push(sessions),
  })

  const listLoad = loader.load('list-pending')
  loader.invalidate()
  staleList.resolve(['stale-session'])
  await listLoad
  assert.deepEqual(appliedSessions, [])

  const activeLoad = loader.load('active-pending')
  await activeStarted.promise
  loader.invalidate()
  staleActive.resolve(['stale-active'])
  await activeLoad

  assert.deepEqual(appliedSessions, [['current-session']])
  assert.deepEqual(appliedActive, [])
})

test('does not launch work for a blank key', async () => {
  let listCalls = 0
  let activeCalls = 0
  const loader = createHistoryLoader({
    listSessions: () => { listCalls += 1 },
    onSessions: () => {},
    afterListRender: () => {},
    listActive: () => { activeCalls += 1 },
    onActive: () => {},
  })

  await loader.load('')
  await loader.refreshSessions()

  assert.equal(await loader.refreshActive(), null)
  assert.equal(listCalls, 0)
  assert.equal(activeCalls, 0)
})

test('refreshes sessions from an active callback without recursive active work', async () => {
  const appliedSessions = []
  let listCalls = 0
  let activeCalls = 0
  let reconciliation
  let loader
  loader = createHistoryLoader({
    listSessions: async () => {
      listCalls += 1
      return [`sessions-${listCalls}`]
    },
    onSessions: (sessions) => appliedSessions.push(sessions),
    afterListRender: () => {},
    listActive: async () => {
      activeCalls += 1
      return ['missing-session']
    },
    onActive: () => {
      reconciliation = loader.refreshSessions()
    },
  })

  assert.equal(typeof loader.refreshSessions, 'function')
  await loader.load('alpha')
  await reconciliation

  assert.equal(listCalls, 2)
  assert.equal(activeCalls, 1)
  assert.deepEqual(appliedSessions, [['sessions-1'], ['sessions-2']])
})

test('refreshSessions updates the current list without starting active work', async () => {
  let listCalls = 0
  let activeCalls = 0
  const loader = createHistoryLoader({
    listSessions: async () => {
      listCalls += 1
      return []
    },
    onSessions: () => {},
    afterListRender: () => {},
    listActive: async () => {
      activeCalls += 1
      return []
    },
    onActive: () => {},
  })

  await loader.load('alpha')
  await loader.refreshSessions()

  assert.equal(listCalls, 2)
  assert.equal(activeCalls, 1)
})

test('reports only current list and paint errors', async () => {
  const currentListError = new Error('list failed')
  const currentPaintError = new Error('paint failed')
  const staleList = deferred()
  const errors = []
  const loader = createHistoryLoader({
    listSessions: (key) => {
      if (key === 'list-error') return Promise.reject(currentListError)
      if (key === 'stale') return staleList.promise
      return Promise.resolve([])
    },
    onSessions: () => {},
    afterListRender: () => {
      if (errors.length === 1) throw currentPaintError
    },
    listActive: async () => [],
    onActive: () => {},
    onListError: (error) => errors.push(error),
  })

  await loader.load('list-error')
  await loader.load('paint-error')

  const staleLoad = loader.load('stale')
  await loader.load('current')
  staleList.reject(new Error('stale failure'))
  await staleLoad

  assert.deepEqual(errors, [currentListError, currentPaintError])
})

test('normalizes missing session and active values to empty arrays', async () => {
  let sessions
  let active
  const loader = createHistoryLoader({
    listSessions: async () => null,
    onSessions: (value) => { sessions = value },
    afterListRender: () => {},
    listActive: async () => undefined,
    onActive: (value) => { active = value },
  })

  await loader.load('alpha')

  assert.deepEqual(sessions, [])
  assert.deepEqual(active, [])
})
