# Claude Config Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a schema-driven Claude config editor for `~/.claude.json` that can read, classify, validate, back up, and write the current known structure safely without turning into a generic JSON editor.

**Architecture:** A pure schema module defines which paths are editable, read-only, or masked. The preload layer owns file I/O, parse errors, and atomic backups. The Vue UI renders a recursive editor from the schema, keeps unknown fields intact in memory, and writes the full object back through the preload API.

**Tech Stack:** Vue 3, Node `fs`/`path` in preload, `node:test`, existing uTools preload bridge, existing Vue app shell.

---

### Task 1: Freeze the real Claude config contract in pure helpers

**Files:**
- Create: `test/fixtures/claude-config.sample.json`
- Create: `src/ClaudeConfig/schema.js`
- Create: `test/claude-config-schema.test.cjs`

This task locks the current JSON shape into a sanitized fixture and a pure schema module so the rest of the implementation has a stable contract to target.

- [ ] **Step 1: Write the failing tests**

```js
const assert = require('node:assert/strict')
const fs = require('node:fs')
const test = require('node:test')

test('Claude config model classifies editable, read-only, and masked nodes', async () => {
  const { buildClaudeConfigModel } = await import('../src/ClaudeConfig/schema.js')
  const sample = JSON.parse(fs.readFileSync('test/fixtures/claude-config.sample.json', 'utf8'))
  const model = buildClaudeConfigModel(sample)

  assert.equal(model.editable.some((n) => n.path === 'installMethod'), true)
  assert.equal(model.readOnly.some((n) => n.path === 'toolUsage'), true)
  assert.equal(model.masked.some((n) => n.path === 'oauthAccount.emailAddress'), true)
  assert.equal(model.masked.some((n) => n.path.startsWith('projects.') && n.path.endsWith('.mcpServers')), true)
})
```

Add a second test that proves the helper understands the real tree shape instead of flattening everything:

```js
test('projects and mcpServers are treated as nested trees', async () => {
  const { buildClaudeConfigModel } = await import('../src/ClaudeConfig/schema.js')
  const sample = JSON.parse(fs.readFileSync('test/fixtures/claude-config.sample.json', 'utf8'))
  const model = buildClaudeConfigModel(sample)

  assert.equal(model.trees.projects.kind, 'map')
  assert.equal(model.trees.mcpServers.kind, 'map')
  assert.ok(model.trees.projects.children.length > 0)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/claude-config-schema.test.cjs`

Expected: fail because `src/ClaudeConfig/schema.js` does not exist yet.

- [ ] **Step 3: Implement the minimal pure schema module**

Implement `src/ClaudeConfig/schema.js` with these exports:

```js
export const CLAUDE_CONFIG_SECTIONS = [...]
export function buildClaudeConfigModel(source) { ... }
export function validateClaudeConfigDraft(draft) { ... }
export function applyClaudeConfigDraft(source, draft) { ... }
```

The first version must:

- mark `installMethod` and a small whitelist of safe preference fields as editable
- mark `tipsHistory`, `toolUsage`, `skillUsage`, `cachedGrowthBookFeatures`, `pluginUsage`, `groveConfigCache`, `overageCreditGrantCache`, `machineID`, and other counters/cache fields as read-only
- mask `oauthAccount.emailAddress`, project-level `mcpServers.*.env`, and global `mcpServers.*.env`
- preserve unknown fields in `applyClaudeConfigDraft()` by only patching supported paths into the original object

- [ ] **Step 4: Re-run the test to verify it passes**

Run: `node --test test/claude-config-schema.test.cjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ClaudeConfig/schema.js test/fixtures/claude-config.sample.json test/claude-config-schema.test.cjs
git commit -m "feat: define claude config schema"
```

---

### Task 2: Add safe Claude config file I/O to preload

**Files:**
- Create: `public/preload/claude-config.js`
- Modify: `public/preload/services.js`
- Create: `test/helpers/load-preload.cjs`
- Create: `test/claude-config-storage.test.cjs`

This task adds file read/write helpers with parse errors, backup handling, and atomic save semantics. The preload layer should stay ignorant of schema details and only deal with raw JSON objects and file paths.

- [ ] **Step 1: Write the failing tests**

```js
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { loadPreload } = require('./helpers/load-preload.cjs')

test('readClaudeConfigFile reports missing file cleanly', () => {
  const { services } = loadPreload({ exists: () => false })
  const state = services.readClaudeConfigFile()

  assert.equal(state.exists, false)
  assert.equal(state.parseError, null)
  assert.equal(state.data, null)
})

test('saveClaudeConfigFile creates a backup and preserves unknown fields', () => {
  const store = {
    file: JSON.stringify({ numStartups: 1, installMethod: 'global', unknownThing: { a: 1 } }, null, 2)
  }
  const { services, writes } = loadPreload({
    readFile: () => store.file,
    writeFile: (p, content) => { writes.push({ p, content }) },
    exists: () => true
  })

  const next = { numStartups: 1, installMethod: 'local', unknownThing: { a: 1 } }
  const result = services.saveClaudeConfigFile(next)

  assert.equal(result.success, true)
  assert.equal(writes.length >= 1, true)
  assert.equal(JSON.parse(writes.at(-1).content).installMethod, 'local')
})
```

Add a parse-error test that feeds invalid JSON and expects the raw error to be returned instead of crashing.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/claude-config-storage.test.cjs`

Expected: fail because `loadPreload()` and the Claude config service functions do not exist yet.

- [ ] **Step 3: Implement the minimal preload helpers**

Implement `public/preload/claude-config.js` with file-scoped helpers:

```js
function getClaudeConfigPath () { ... }
function readClaudeConfigFile () { ... }
function backupClaudeConfigFile () { ... }
function writeClaudeConfigFile (nextData) { ... }
```

Then wire them through `public/preload/services.js` as:

```js
window.services.readClaudeConfigFile = readClaudeConfigFile
window.services.saveClaudeConfigFile = writeClaudeConfigFile
window.services.backupClaudeConfigFile = backupClaudeConfigFile
window.services.getClaudeConfigPath = getClaudeConfigPath
```

Implementation requirements:

- read from `path.join(os.homedir(), '.claude.json')`
- return `{ exists, rawText, data, parseError }` instead of throwing
- create a timestamped backup before overwriting an existing file
- write atomically through a temp file and rename
- leave the caller responsible for schema-level merging so unknown fields stay intact

- [ ] **Step 4: Re-run the test to verify it passes**

Run: `node --test test/claude-config-storage.test.cjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add public/preload/claude-config.js public/preload/services.js test/helpers/load-preload.cjs test/claude-config-storage.test.cjs
git commit -m "feat: add claude config file io"
```

---

### Task 3: Build the recursive Claude config editor UI

**Files:**
- Create: `src/ClaudeConfig/index.vue`
- Create: `src/ClaudeConfig/components/ConfigSection.vue`
- Create: `src/ClaudeConfig/components/FieldEditor.vue`
- Modify: `src/styles/variables.css`

This task builds the actual UI. The page should render the schema as grouped sections, support nested objects and arrays, show read-only and masked fields distinctly, and keep unsaved changes in local component state until save.

- [ ] **Step 1: Write the failing build-level checks**

Because this repo does not have a browser test runner, use `vite build` as the verification gate for the new Vue files. Start by adding the component imports in a way that will fail until the new files exist.

Expected structure in `src/UnifiedConfig/index.vue`:

```vue
<script setup>
import ClaudeConfig from '../ClaudeConfig/index.vue'
</script>

<template>
  <ClaudeConfig v-show="activeTab === 'claude'" />
</template>
```

- [ ] **Step 2: Implement the page shell**

`src/ClaudeConfig/index.vue` should:

- load the file once on mount through `window.services.readClaudeConfigFile()`
- derive a local draft from the parsed object
- render left navigation groups for `基础偏好`, `账号与授权`, `项目配置`, `MCP 与插件`, and `状态与缓存`
- show a top status strip for `已加载`, `未保存`, `解析错误`, or `缺失文件`
- expose bottom actions for `恢复上次保存`, `恢复默认项`, and `保存`

`src/ClaudeConfig/components/FieldEditor.vue` should render recursively for:

- `string`
- `number`
- `boolean`
- `enum`
- `array`
- `object`
- `map`
- `secret`

`src/ClaudeConfig/components/ConfigSection.vue` should own the section card layout and keep the editor tree readable.

The UI must use the current app styles instead of introducing a second visual system. If the existing variables are not enough, extend `src/styles/variables.css` with a few form and warning tokens only.

- [ ] **Step 3: Wire edit, reset, and validation behavior**

The editor should:

- keep the original parsed object in memory so unsupported keys survive a round-trip
- patch only supported paths when a field changes
- validate immediately on blur/change for required, enum, path, and numeric constraints
- disable save when the draft is invalid
- treat `恢复默认项` as resetting only the supported editable paths, not the read-only state cache
- mask secret values by default, with explicit reveal only when a field is marked safe to edit

- [ ] **Step 4: Re-run the Vue build**

Run: `npm run build`

Expected: build passes and the new editor is reachable from the existing config shell.

- [ ] **Step 5: Commit**

```bash
git add src/ClaudeConfig/index.vue src/ClaudeConfig/components/ConfigSection.vue src/ClaudeConfig/components/FieldEditor.vue src/styles/variables.css src/UnifiedConfig/index.vue
git commit -m "feat: add claude config editor ui"
```

---

### Task 4: Integrate, smoke test, and document the behavior

**Files:**
- Modify: `src/UnifiedConfig/index.vue`
- Modify: `README.md`
- Optional: `public/plugin.json` only if a new entry point is added later

This task ties the editor into the existing unified config screen and validates the end-to-end save flow against the real local file.

- [ ] **Step 1: Verify the integration points**

Confirm that:

- `src/App.vue` does not need a new route because `ccstartconf` already opens `UnifiedConfig`
- `public/plugin.json` does not need a new feature code for the first version
- the new tab label is `Claude 配置`

- [ ] **Step 2: Smoke test the real file flow**

Run:

```bash
npm test
npm run build
```

Then open the plugin and verify with the real `C:\Users\<you>\.claude.json` file that:

- the file loads without crashing
- read-only fields render but are not editable
- a supported editable field writes back successfully
- a backup file is created before overwrite
- unknown fields are preserved after save
- parse errors surface in the UI instead of crashing the app

- [ ] **Step 3: Update the README**

Add a short note explaining:

- where the new Claude config editor lives
- that the editor is schema-driven rather than a generic JSON editor
- that backups are created automatically on save

- [ ] **Step 4: Commit**

```bash
git add src/UnifiedConfig/index.vue README.md
git commit -m "docs: finish claude config editor integration"
```

---

### Verification checklist

- `node --test test/claude-config-schema.test.cjs`
- `node --test test/claude-config-storage.test.cjs`
- `npm test`
- `npm run build`
- Manual smoke test against the real `~/.claude.json`

