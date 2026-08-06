# Codex History ASAR Worker Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the installed uTools ASAR package load Codex history and active sessions without asking the external Node process to require a file inside the ASAR archive.

**Architecture:** Extend the existing bounded Node runner with optional stdin support. The ASAR-aware preload reads the standalone worker source and sends it over stdin to a fixed CommonJS bootstrap, preserving the worker module and all existing output, timeout, and error contracts.

**Tech Stack:** uTools preload CommonJS, Node `child_process`, Node streams, `node:test`, Vite.

---

## File Map

- Modify `public/preload/async-child.cjs`: optionally pipe trusted text to a Node child through stdin.
- Modify `test/async-child.test.cjs`: prove stdin is piped while the existing no-stdin spawn contract remains unchanged.
- Modify `public/preload/services.js`: read the Codex worker through ASAR-aware preload `fs` and create a stdin bootstrap request.
- Modify `test/services-codex-history.test.cjs`: reproduce the ASAR boundary failure and verify both async Codex APIs use source transfer.
- Verify `public/preload/codex-history-worker.cjs`: no behavior change; its existing unit tests remain the worker contract.

### Task 1: Add Optional Stdin to the Bounded Node Runner

**Files:**
- Modify: `test/async-child.test.cjs`
- Modify: `public/preload/async-child.cjs`

- [ ] **Step 1: Write the failing stdin regression test**

Keep the existing `createChild` helper unchanged so no-stdin tests continue to model ignored stdin. Add this test after the successful-child test:

```javascript
test('pipes optional stdin to the child', async () => {
  const child = createChild()
  child.stdin = new PassThrough()
  child.stdin.setEncoding('utf8')
  let input = ''
  child.stdin.on('data', (chunk) => { input += chunk })
  let spawnArgs

  const resultPromise = runNodeJson('process.stdout.write("[]")', {
    stdin: 'trusted worker source',
    spawn(...args) {
      spawnArgs = args
      return child
    },
  })

  child.stdout.end('[]')
  child.stderr.end()
  child.emit('close', 0, null)

  assert.deepEqual(await resultPromise, [])
  assert.equal(input, 'trusted worker source')
  assert.deepEqual(spawnArgs, [
    'node',
    ['-e', 'process.stdout.write("[]")'],
    { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
  ])
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --test test/async-child.test.cjs
```

Expected: FAIL because the current runner spawns with `stdio[0] === 'ignore'` and never writes `options.stdin`.

- [ ] **Step 3: Implement the minimal stdin behavior**

In `runNodeJson`, detect whether the caller supplied the `stdin` option:

```javascript
const hasStdin = Object.prototype.hasOwnProperty.call(options, 'stdin')
const stdin = hasStdin ? String(options.stdin) : null
```

Use it in the spawn options:

```javascript
child = spawn('node', ['-e', script], {
  windowsHide: true,
  stdio: [hasStdin ? 'pipe' : 'ignore', 'pipe', 'pipe'],
})
```

Extend the child stream validation without changing the existing stdout/stderr requirements:

```javascript
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
```

After registering stdout, stderr, child error, and child close handlers, register the stdin error handler and end stdin. Catch synchronous stream failures as well:

```javascript
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
```

- [ ] **Step 4: Run the runner tests and verify GREEN**

Run:

```powershell
node --test test/async-child.test.cjs
```

Expected: all tests PASS, including the unchanged assertion that callers without stdin use `['ignore', 'pipe', 'pipe']`.

- [ ] **Step 5: Commit the runner change**

```powershell
git add public/preload/async-child.cjs test/async-child.test.cjs
git commit -m "feat: support stdin in async Node runner"
```

### Task 2: Transfer the Codex Worker Source Across the ASAR Boundary

**Files:**
- Modify: `test/services-codex-history.test.cjs`
- Modify: `public/preload/services.js`

- [ ] **Step 1: Add worker fixtures to the preload test**

At the top of `test/services-codex-history.test.cjs`, add the imports and constants used by the regression test:

```javascript
const fs = require('node:fs')
const { EventEmitter } = require('node:events')

const WORKER_PATH = path.resolve(__dirname, '..', 'public', 'preload', 'codex-history-worker.cjs')
const WORKER_SOURCE = fs.readFileSync(WORKER_PATH, 'utf8')
```

Update the default `readFile` callback in `makeServices` so unrelated async API tests can read the real packaged worker fixture:

```javascript
readFile: readFile || ((p) => {
  const key = String(p)
  if (key === WORKER_PATH) return WORKER_SOURCE
  if (Object.prototype.hasOwnProperty.call(files, key)) return files[key]
  throw new Error('ENOENT: ' + key)
}),
```

- [ ] **Step 2: Replace the history async test with an ASAR-safe request test**

In `listCodexProjectSessionsAsync runs the history worker and maps rows by descending recency`, retain the existing rows and result assertions. Replace the runner setup and old `modulePath` assertion with:

```javascript
const workerSource = 'module.exports.run = (mode, input) => { globalThis.workerCall = { mode, input } }'
let workerRequest
let workerSandbox
const { services } = makeServices({
  readFile: (filePath) => {
    assert.equal(String(filePath), WORKER_PATH)
    return workerSource
  },
  runNodeJson: async (script, options) => {
    runnerCalls++
    workerRequest = { script, options }
    const stdin = new EventEmitter()
    stdin.setEncoding = () => {}
    workerSandbox = { process: { stdin }, require }
    vm.runInNewContext(script, workerSandbox)
    stdin.emit('data', options.stdin)
    stdin.emit('end')
    return rows
  }
})
```

After calling the service, assert the source is transferred and the bootstrap invokes the worker without a child-side worker require:

```javascript
assert.equal(runnerCalls, 1)
assert.equal(workerRequest.options.stdin, workerSource)
assert.doesNotMatch(workerRequest.script, /require\([^\n]*codex-history-worker\.cjs/)
assert.equal(workerSandbox.injected, undefined)
assert.equal(workerSandbox.workerCall.mode, 'history')
assert.deepEqual(JSON.parse(JSON.stringify(workerSandbox.workerCall.input)), {
  cwd,
  platform: 'win32',
  stateDbPath: STATE_DB,
  logsDbPath: LOGS_DB,
  sessionsDir: path.join(HOME, '.codex', 'sessions')
})
```

- [ ] **Step 3: Update the active async test for the same transport**

Use a capture-only runner in `listActiveCodexSessionsAsync returns the active worker array`:

```javascript
let workerRequest
const { services } = makeServices({
  runNodeJson: async (script, options) => {
    workerRequest = { script, options }
    return active
  }
})

const sessions = await services.listActiveCodexSessionsAsync('D:\\code\\alpha')

assert.equal(workerRequest.options.stdin, WORKER_SOURCE)
assert.match(workerRequest.script, /module\.exports\.run\("active"/)
assert.doesNotMatch(workerRequest.script, /require\([^\n]*codex-history-worker\.cjs/)
assert.deepEqual(JSON.parse(JSON.stringify(sessions)), active)
```

- [ ] **Step 4: Run the preload tests and verify RED**

Run:

```powershell
node --test test/services-codex-history.test.cjs
```

Expected: the two updated async tests FAIL because `runNodeJson` currently receives no options and the child script still contains `require(<worker path>)`.

- [ ] **Step 5: Implement the ASAR-safe worker request**

Replace `codexHistoryWorkerScript` in `public/preload/services.js` with:

```javascript
function codexHistoryWorkerRequest (mode, cwd) {
  const workerPath = path.resolve(__dirname, 'codex-history-worker.cjs')
  const workerSource = fs.readFileSync(workerPath, 'utf8')
  const input = {
    cwd,
    platform: process.platform,
    stateDbPath: getCodexStateDbPath(),
    logsDbPath: getCodexLogsDbPath(),
    sessionsDir: getCodexSessionsDir()
  }
  const script = [
    'const chunks = []',
    "process.stdin.setEncoding('utf8')",
    "process.stdin.on('data', (chunk) => chunks.push(chunk))",
    "process.stdin.on('end', () => {",
    '  const module = { exports: {} }',
    "  const load = Function('exports', 'require', 'module', '__filename', '__dirname', chunks.join(''))",
    `  load(module.exports, require, module, ${JSON.stringify(workerPath)}, ${JSON.stringify(path.dirname(workerPath))})`,
    `  module.exports.run(${JSON.stringify(mode)}, ${JSON.stringify(input)})`,
    '})'
  ].join('\n')
  return { script, stdin: workerSource }
}
```

Update both async call sites:

```javascript
const request = codexHistoryWorkerRequest('history', cwd)
const rows = await loadAsyncChildRunner().runNodeJson(request.script, { stdin: request.stdin })
```

```javascript
const request = codexHistoryWorkerRequest('active', cwd)
const sessions = await loadAsyncChildRunner().runNodeJson(request.script, { stdin: request.stdin })
```

- [ ] **Step 6: Run focused Codex tests and verify GREEN**

Run:

```powershell
node --test test/services-codex-history.test.cjs test/codex-history-worker.test.cjs
```

Expected: all tests PASS. The preload tests prove the source transport and input encoding; the worker tests prove the unchanged worker behavior.

- [ ] **Step 7: Commit the ASAR boundary fix**

```powershell
git add public/preload/services.js test/services-codex-history.test.cjs
git commit -m "fix: run Codex history worker from ASAR source"
```

### Task 3: End-to-End Verification

**Files:**
- Verify: `public/preload/async-child.cjs`
- Verify: `public/preload/codex-history-worker.cjs`
- Verify: `public/preload/services.js`

- [ ] **Step 1: Run the full test suite**

Run:

```powershell
npm test
```

Expected: all Node tests PASS with no unhandled stream errors.

- [ ] **Step 2: Build the production package**

Run:

```powershell
npm run build
```

Expected: Vite exits with code 0 and `dist/preload` contains `services.js`, `async-child.cjs`, and `codex-history-worker.cjs`.

- [ ] **Step 3: Run an external Node smoke test through stdin**

Run a small Node script that imports `runNodeJson`, reads `public/preload/codex-history-worker.cjs`, uses the same bootstrap shape, and invokes an unknown worker mode. The child must load the worker source successfully and fail with `Unknown Codex history worker mode`, not `MODULE_NOT_FOUND`.

```powershell
node -e 'const fs=require("node:fs");const path=require("node:path");const {runNodeJson}=require("./public/preload/async-child.cjs");const workerPath=path.resolve("public/preload/codex-history-worker.cjs");const workerSource=fs.readFileSync(workerPath,"utf8");const script=["const chunks = []","process.stdin.setEncoding(\"utf8\")","process.stdin.on(\"data\", (chunk) => chunks.push(chunk))","process.stdin.on(\"end\", () => {","const module = { exports: {} }","const load = Function(\"exports\", \"require\", \"module\", \"__filename\", \"__dirname\", chunks.join(\"\"))","load(module.exports, require, module, "+JSON.stringify(workerPath)+", "+JSON.stringify(path.dirname(workerPath))+")","module.exports.run(\"smoke\", {})","})"].join("\n");runNodeJson(script,{stdin:workerSource}).then(()=>process.exit(2),(error)=>{console.log(error.message);process.exit(/Unknown Codex history worker mode/.test(error.message)?0:1)})'
```

Expected: exit code 0; output mentions `Unknown Codex history worker mode` and does not mention `MODULE_NOT_FOUND`.

- [ ] **Step 4: Inspect the final diff**

Run:

```powershell
git diff HEAD~2 --check
git diff HEAD~2 --stat
git status --short
```

Expected: no whitespace errors; only the four planned source/test files differ across the implementation commits; the worktree is clean.
