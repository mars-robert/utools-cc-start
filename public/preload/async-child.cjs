const { spawn: defaultSpawn } = require('node:child_process')

const DEFAULT_TIMEOUT_MS = 3000
const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024

function runNodeJson(script, options = {}) {
  const spawn = options.spawn || defaultSpawn
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES
  const hasStdin = Object.prototype.hasOwnProperty.call(options, 'stdin')
  const stdin = hasStdin ? String(options.stdin) : null

  return new Promise((resolve, reject) => {
    let child
    let timer
    let settled = false
    let outputBytes = 0
    const stdout = []
    const stderr = []

    const settle = (error, value) => {
      if (settled) return false
      settled = true
      if (timer) clearTimeout(timer)
      if (error) reject(error)
      else resolve(value)
      return true
    }

    const killWithError = (error) => {
      if (!settle(error)) return
      try {
        child?.kill()
      } catch {
        // The original bounded-runner error is more useful than a kill failure.
      }
    }

    const capture = (chunks) => (chunk) => {
      if (settled) return
      const buffer = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(String(chunk), 'utf8')
      outputBytes += buffer.length
      if (outputBytes > maxOutputBytes) {
        killWithError(
          new Error(`Node child process output limit exceeded (${maxOutputBytes} bytes)`),
        )
        return
      }
      chunks.push(buffer)
    }

    try {
      child = spawn('node', ['-e', script], {
        windowsHide: true,
        stdio: [hasStdin ? 'pipe' : 'ignore', 'pipe', 'pipe'],
      })
    } catch (error) {
      settle(error instanceof Error ? error : new Error(String(error)))
      return
    }

    if (
      !child ||
      typeof child.once !== 'function' ||
      !child.stdout ||
      typeof child.stdout.on !== 'function' ||
      !child.stderr ||
      typeof child.stderr.on !== 'function' ||
      (hasStdin && (
        !child.stdin ||
        typeof child.stdin.on !== 'function' ||
        typeof child.stdin.end !== 'function'
      ))
    ) {
      killWithError(new Error('Node child process did not provide the required stdio streams'))
      return
    }

    timer = setTimeout(() => {
      killWithError(new Error(`Node child process timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    child.stdout.on('data', capture(stdout))
    child.stderr.on('data', capture(stderr))

    child.once('error', (error) => {
      settle(error instanceof Error ? error : new Error(String(error)))
    })

    child.once('close', (code, signal) => {
      if (settled) return

      if (code !== 0) {
        const reason = code == null
          ? `abnormally${signal ? ` with signal ${signal}` : ''}`
          : `with code ${code}`
        const detail = Buffer.concat(stderr).toString('utf8').trim()
        settle(
          new Error(
            `Node child process exited ${reason}${detail ? `: ${detail}` : ''}`,
          ),
        )
        return
      }

      const output = Buffer.concat(stdout).toString('utf8')
      try {
        settle(null, JSON.parse(output))
      } catch (error) {
        const parseError = new Error(`Node child process returned malformed JSON: ${error.message}`)
        parseError.cause = error
        settle(parseError)
      }
    })

    if (hasStdin) {
      child.stdin.on('error', (error) => {
        settle(error instanceof Error ? error : new Error(String(error)))
      })
      try {
        child.stdin.end(stdin)
      } catch (error) {
        settle(error instanceof Error ? error : new Error(String(error)))
      }
    }
  })
}

module.exports = { runNodeJson }
