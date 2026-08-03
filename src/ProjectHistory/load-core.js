export function createHistoryLoader (options) {
  let generation = 0
  let currentKey = ''
  let activeInFlight = null

  function isCurrent (key, token) {
    return currentKey === key && generation === token
  }

  function refreshActive () {
    if (!currentKey) return Promise.resolve(null)
    if (activeInFlight) return activeInFlight

    const key = currentKey
    const token = generation
    let request
    request = Promise.resolve()
      .then(() => options.listActive(key))
      .then((value) => {
        const active = value || []
        if (isCurrent(key, token)) options.onActive(active)
        return active
      })
      .catch(() => null)
      .finally(() => {
        if (activeInFlight === request) activeInFlight = null
      })

    activeInFlight = request
    return request
  }

  async function load (key) {
    const token = ++generation
    currentKey = key || ''
    const loadKey = currentKey
    if (!loadKey) return

    try {
      const sessions = await options.listSessions(loadKey)
      if (!isCurrent(loadKey, token)) return

      options.onSessions(sessions || [])
      await options.afterListRender()
      if (!isCurrent(loadKey, token)) return

      await refreshActive()
    } catch (error) {
      if (isCurrent(loadKey, token)) options.onListError?.(error)
    }
  }

  function invalidate () {
    generation += 1
    currentKey = ''
  }

  return { load, refreshActive, invalidate }
}
