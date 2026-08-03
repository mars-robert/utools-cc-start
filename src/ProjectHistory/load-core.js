export function createHistoryLoader (options) {
  let generation = 0
  let currentKey = ''
  let activeInFlight = null
  let queuedActive = null

  function isCurrent (key, token) {
    return currentKey === key && generation === token
  }

  function createPendingActive (key, token) {
    let resolve
    const promise = new Promise((resolvePromise) => { resolve = resolvePromise })
    return { key, token, promise, resolve }
  }

  function cancelQueuedActive () {
    if (!queuedActive) return
    const request = queuedActive
    queuedActive = null
    request.resolve(null)
  }

  function startQueuedActive () {
    if (!queuedActive) return
    const request = queuedActive
    queuedActive = null
    if (!isCurrent(request.key, request.token)) {
      request.resolve(null)
      return
    }
    startActive(request)
  }

  function startActive (request = createPendingActive(currentKey, generation)) {
    activeInFlight = request
    let result = null

    Promise.resolve()
      .then(() => options.listActive(request.key))
      .then((value) => {
        result = value || []
        if (isCurrent(request.key, request.token)) options.onActive(result)
      })
      .catch(() => { result = null })
      .finally(() => {
        if (activeInFlight === request) {
          activeInFlight = null
          startQueuedActive()
        }
        request.resolve(result)
      })

    return request.promise
  }

  function refreshActive () {
    if (!currentKey) return Promise.resolve(null)

    const key = currentKey
    const token = generation
    if (!activeInFlight) return startActive(createPendingActive(key, token))
    if (isCurrent(activeInFlight.key, activeInFlight.token)) return activeInFlight.promise
    if (queuedActive && isCurrent(queuedActive.key, queuedActive.token)) return queuedActive.promise

    cancelQueuedActive()
    queuedActive = createPendingActive(key, token)
    return queuedActive.promise
  }

  async function loadSessions (key, token, includeActive) {
    try {
      const sessions = await options.listSessions(key)
      if (!isCurrent(key, token)) return

      options.onSessions(sessions || [])
      await options.afterListRender()
      if (!isCurrent(key, token)) return

      if (includeActive) await refreshActive()
    } catch (error) {
      if (isCurrent(key, token)) options.onListError?.(error)
    }
  }

  function load (key) {
    const token = ++generation
    currentKey = key || ''
    cancelQueuedActive()
    if (!currentKey) return Promise.resolve()
    return loadSessions(currentKey, token, true)
  }

  function refreshSessions () {
    const token = ++generation
    cancelQueuedActive()
    if (!currentKey) return Promise.resolve()
    return loadSessions(currentKey, token, false)
  }

  function invalidate () {
    generation += 1
    currentKey = ''
    cancelQueuedActive()
  }

  return { load, refreshSessions, refreshActive, invalidate }
}
