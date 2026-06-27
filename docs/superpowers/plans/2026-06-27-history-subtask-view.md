# 历史会话子任务查看与切换 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 历史详情页支持查看子任务（子代理）对话，并修正被误渲染为用户气泡的 `<task-notification>` 系统通知。

**Architecture:** 服务层新增读取 `<sessionId>/subagents/` 的接口并复用 `parseSession`；`parseSession` 把 `<task-notification>` 用户消息识别为系统通知块；前端用 `currentAgent` 状态在主任务/子任务间切换，仅替换 `sessionDetail`，复用全部既有渲染。

**Tech Stack:** Vue 3 `<script setup>` + Vite + TS（前端）；CommonJS 预加载 `public/preload/services.js`；测试用 `node --test` + `test/helpers/load-preload.cjs`（vm 沙箱 + mock `node:fs`）。

## Global Constraints

- 输出与文档默认中文（含代码注释）。
- 不新增运行时依赖。
- 服务层为 CommonJS；新接口须可被 `loadPreload`（mock `node:fs`：`readdir`/`stat`/`readFile`）单测。
- 路径安全：凡接受 `sessionId`/`agentId` 的服务函数必须 `isSafeSegment` 校验（拒绝含 `/`、`\`、`..`）。
- 子任务文件布局：`<projectDir>/<sessionId>/subagents/agent-<agentId>.jsonl` 与 `agent-<agentId>.meta.json`，meta 为 `{ agentType, description, toolUseId, spawnDepth }`。
- 提交信息用中文 conventional-commit，结尾必须有一行：`Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

## Task 1: parseSession 识别 task-notification（services.js）

**Files:**
- Modify: `public/preload/services.js`（新增 `parseTaskNotification`；在 `parseSession` 用户分支接入）
- Test: `test/services-subagents.test.cjs`（新建）

**Interfaces:**
- Consumes: 现有 `parseSession`、`parseCommand`。
- Produces: `parseSession` 对 `<task-notification>` 用户消息产出块 `{ kind:'system', subtype:'subtask_notice', text:<summary>, agentId:<task-id>, sidechain, ts }`（不再是 `kind:'user'`）。

- [ ] **Step 1: 写失败测试**

新建 `test/services-subagents.test.cjs`：

```javascript
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test`
Expected: FAIL —— 第一个用例断言 `blocks[0].kind` 期望 `'system'`，实际 `'user'`（当前把通知当用户）。

- [ ] **Step 3: 实现**

在 `public/preload/services.js` 的 `parseCommand` 函数之后（约第 1166 行 `parseCommand` 结束处）新增：

```javascript
// 解析 harness 注入的 <task-notification> 消息 → { agentId, summary }；非此类返回 null
function parseTaskNotification (text) {
  if (typeof text !== 'string' || text.replace(/^\s+/, '').indexOf('<task-notification>') !== 0) return null
  const pick = (tag) => {
    const m = text.match(new RegExp('<' + tag + '>([\\s\\S]*?)</' + tag + '>'))
    return m ? m[1].trim() : ''
  }
  return { agentId: pick('task-id'), summary: pick('summary') || pick('status') || '子任务事件' }
}
```

在 `parseSession` 的用户分支里接入（约第 1224-1230 行）。把：

```javascript
    if (type === 'user') {
      const rawText = typeof c === 'string'
        ? c
        : (Array.isArray(c) ? c.filter((b) => b && b.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('\n') : '')
      const cmd = parseCommand(rawText)
      if (cmd) { blocks.push({ kind: 'user', command: cmd, text: cmd.args || '', sidechain, ts }); meta.count++; continue }
    }
```

替换为：

```javascript
    if (type === 'user') {
      const rawText = typeof c === 'string'
        ? c
        : (Array.isArray(c) ? c.filter((b) => b && b.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('\n') : '')
      // 系统注入的子任务完成通知：非用户输入，作为系统提示块（带 agentId 供前端跳转）
      const notif = parseTaskNotification(rawText)
      if (notif) { blocks.push({ kind: 'system', subtype: 'subtask_notice', text: notif.summary, agentId: notif.agentId, sidechain, ts }); meta.count++; continue }
      const cmd = parseCommand(rawText)
      if (cmd) { blocks.push({ kind: 'user', command: cmd, text: cmd.args || '', sidechain, ts }); meta.count++; continue }
    }
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test`
Expected: PASS —— 两个新用例通过，既有套件保持绿色。

- [ ] **Step 5: 提交**

```bash
git add public/preload/services.js test/services-subagents.test.cjs
git commit -m "$(printf 'fix: parseSession 将 task-notification 识别为系统通知而非用户消息\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 2: listSubagents + readSubagent（services.js）

**Files:**
- Modify: `public/preload/services.js`（新增两函数 + `window.services` 导出）
- Test: `test/services-subagents.test.cjs`（追加用例）

**Interfaces:**
- Consumes: 现有 `getProjectDirSafe`、`isSafeSegment`、`parseSession`、`fs`、`path`。
- Produces:
  - `listSubagents(dirName, sessionId) => Array<{ agentId, agentType, description, toolUseId, spawnDepth, mtime }>`（按 mtime 升序；无目录/非法段返回 `[]`）。
  - `readSubagent(dirName, sessionId, agentId) => { blocks, meta } | null`。
  - 二者加入 `window.services`。

- [ ] **Step 1: 写失败测试**

在 `test/services-subagents.test.cjs` 末尾追加：

```javascript
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test`
Expected: FAIL —— `services.listSubagents is not a function`。

- [ ] **Step 3: 实现两函数**

在 `public/preload/services.js` 的 `statSession` 函数之后（约第 1284 行，`statSession` 结束的 `}` 之后）新增：

```javascript
// 列出某会话的子任务（子代理）：读 <sessionId>/subagents/agent-*.meta.json
function listSubagents (dirName, sessionId) {
  const projectDir = getProjectDirSafe(dirName)
  if (!projectDir) return []
  if (!isSafeSegment(sessionId)) return []
  const dir = path.join(projectDir, sessionId, 'subagents')
  let names
  try { names = fs.readdirSync(dir).filter((n) => /^agent-.+\.meta\.json$/.test(n)) } catch (_) { return [] }
  const out = []
  for (const name of names) {
    const agentId = name.replace(/^agent-/, '').replace(/\.meta\.json$/, '')
    if (!isSafeSegment(agentId)) continue
    let meta
    try { meta = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf-8')) } catch (_) { continue }
    let mtime = 0
    try { mtime = fs.statSync(path.join(dir, 'agent-' + agentId + '.jsonl')).mtimeMs } catch (_) { /* 无 jsonl 仍保留条目 */ }
    out.push({
      agentId,
      agentType: (meta && meta.agentType) || '',
      description: (meta && meta.description) || '',
      toolUseId: (meta && meta.toolUseId) || '',
      spawnDepth: (meta && meta.spawnDepth) || 0,
      mtime
    })
  }
  out.sort((a, b) => a.mtime - b.mtime)
  return out
}

// 读取并解析某子任务（子代理）转录 { blocks, meta }
function readSubagent (dirName, sessionId, agentId) {
  const projectDir = getProjectDirSafe(dirName)
  if (!projectDir) return null
  if (!isSafeSegment(sessionId) || !isSafeSegment(agentId)) return null
  try {
    const content = fs.readFileSync(path.join(projectDir, sessionId, 'subagents', 'agent-' + agentId + '.jsonl'), 'utf-8')
    return parseSession(content)
  } catch (_) { return null }
}
```

在 `window.services` 对象里、`statSession,`（约第 1454 行）之后新增导出：

```javascript
  // 列出某会话的子任务（子代理）摘要
  listSubagents,

  // 读取并解析某子任务转录 { blocks, meta }
  readSubagent,
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test`
Expected: PASS —— 4 个新用例通过；既有套件绿色。

- [ ] **Step 5: 提交**

```bash
git add public/preload/services.js test/services-subagents.test.cjs
git commit -m "$(printf 'feat: 服务层新增 listSubagents/readSubagent 读取子任务转录\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 3: 前端子任务切换器与通知渲染（index.vue）

**Files:**
- Modify: `src/ProjectHistory/index.vue`（脚本状态/方法、模板切换器与通知、头部徽标、MD 导出、CSS）

**Interfaces:**
- Consumes（来自 Task 1/2）：`window.services.listSubagents`、`window.services.readSubagent`、`window.services.readSession`、`window.services.sessionToMarkdown`、`window.services.writeTextFile`；`parseSession` 产出的 `{ kind:'system', subtype:'subtask_notice', agentId }` 块。
- Produces：前端内部状态与方法，无对外接口。

- [ ] **Step 1: 新增状态与辅助（脚本）**

在 `const detailLoading = ref(false)`（约第 21 行）之后插入：

```typescript
// ---- 子任务（子代理）查看与切换 ----
const subagents = ref<any[]>([])        // 当前会话的子任务列表
const currentAgent = ref<string | null>(null) // 当前视图：null=主任务 / agentId=某子任务
const showSubtasks = ref(false)         // 切换器下拉开关
const subagentById = (id: string | null) => (id ? subagents.value.find((a: any) => a.agentId === id) : null)
const subagentLabel = (b: any) => (subagentById(b.agentId)?.description) || b.text || '子任务'
const currentViewLabel = computed(() => (currentAgent.value ? (subagentById(currentAgent.value)?.description || currentAgent.value) : '主任务'))
```

- [ ] **Step 2: 新增 switchView（脚本）**

在 `selectItem` 定义之前（约第 748 行 `const selectItem = (item: any) =>` 上方）插入：

```typescript
// 在主任务/子任务间切换：仅替换 sessionDetail，复用全部既有渲染
const switchView = (agentId: string | null) => {
  if (!selectedSession.value) return
  showSubtasks.value = false
  if (currentAgent.value === agentId) return
  currentAgent.value = agentId
  findClose()
  showQuestions.value = false
  showJumpBottom.value = false
  hasNew.value = false
  newCount.value = 0
  curQ.value = 0
  highlightIdx.value = -1
  resetFilters()
  stopPoll()
  mdCache.clear()
  for (const k in blockEls) delete blockEls[k]
  const dn = props.project.dirName
  const sid = selectedSession.value.sessionId
  try {
    sessionDetail.value = agentId
      ? window.services.readSubagent(dn, sid, agentId)
      : window.services.readSession(dn, sid)
  } catch (err: any) {
    error.value = err && err.message ? err.message : String(err)
  }
  if (agentId) {
    // 子任务为静态记录：不轮询、不显示在线
    currentLive.value = false
    autoRefresh.value = false
  } else {
    lastSig = sessionSig(selectedSession.value)
    currentLive.value = isSessionLive(sid)
    autoRefresh.value = currentLive.value
    startPoll()
  }
  nextTick(() => {
    const el = scrollEl.value
    if (el) el.scrollTop = 0
    updateJumpBtn()
    seenQCount = userQuestions.value.length
  })
}
```

- [ ] **Step 3: selectSession / selectMemory 复位与加载子任务（脚本）**

在 `selectSession` 的复位段，`showQuestions.value = false`（约第 714 行）之后插入：

```typescript
  currentAgent.value = null
  showSubtasks.value = false
  subagents.value = []
```

在 `selectSession` 的 `try` 块里、`sessionDetail.value = window.services.readSession(props.project.dirName, s.sessionId)`（约第 728 行）之后插入：

```typescript
      subagents.value = window.services.listSubagents(props.project.dirName, s.sessionId) || []
```

在 `selectMemory` 的 `findClose()`（约第 700 行）之后插入：

```typescript
  currentAgent.value = null
  subagents.value = []
  showSubtasks.value = false
```

- [ ] **Step 4: turns() 增加 subtask_notice 分支（脚本）**

在 `turns` 计算属性里（约第 258-267 行），把：

```typescript
      if (b.kind === 'user' && isInterruptOnly(b.text)) {
        out.push({ type: 'notice', block: b, index: i }); cur = null
      } else if (b.kind === 'user') {
```

替换为：

```typescript
      if (b.kind === 'user' && isInterruptOnly(b.text)) {
        out.push({ type: 'notice', block: b, index: i }); cur = null
      } else if (b.kind === 'system' && b.subtype === 'subtask_notice') {
        out.push({ type: 'subtask_notice', block: b, index: i }); cur = null
      } else if (b.kind === 'user') {
```

- [ ] **Step 5: 切换器 UI（模板）**

在 `.ph-filterbar` 开标签（约第 1137 行 `<div v-if="sessionDetail && filterChips.length" class="ph-filterbar">`）之后、`.ph-chips` 之前插入：

```html
            <!-- 子任务切换器：仅当前会话存在子任务时显示，置于最左 -->
            <div v-if="subagents.length" class="ph-subtask-wrap">
              <button class="ph-subtask-btn" :class="{ on: showSubtasks }" :title="'子任务切换（' + subagents.length + '）'" @click="showSubtasks = !showSubtasks">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="2.4" /><circle cx="6" cy="18" r="2.4" /><circle cx="18" cy="12" r="2.4" /><path d="M8.2 6.6c5 .4 6.6 1.8 7.4 4.2M8.2 17.4c5-.4 6.6-1.8 7.4-4.2" /></svg>
                <span class="ph-subtask-cur">{{ currentViewLabel }}</span>
                <svg class="ph-subtask-caret" :class="{ open: showSubtasks }" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg>
              </button>
              <div v-if="showSubtasks" class="ph-subtask-backdrop" @click="showSubtasks = false"></div>
              <div class="ph-subtask-panel" :class="{ open: showSubtasks }">
                <div class="ph-subtask-item" :class="{ active: currentAgent === null }" @click="switchView(null)">
                  <span class="ph-subtask-main">主任务</span>
                  <span class="ph-subtask-mainsub">{{ selectedSession && (selectedSession.title || selectedSession.sessionId) }}</span>
                </div>
                <div
                  v-for="a in subagents"
                  :key="a.agentId"
                  class="ph-subtask-item"
                  :class="{ active: currentAgent === a.agentId }"
                  @click="switchView(a.agentId)"
                >
                  <div class="ph-subtask-row">
                    <span class="ph-subtask-desc">{{ a.description || a.agentId }}</span>
                    <span v-if="a.agentType" class="ph-subtask-type">{{ a.agentType }}</span>
                  </div>
                  <span v-if="formatTime(a.mtime)" class="ph-subtask-time">{{ formatTime(a.mtime) }}</span>
                </div>
              </div>
            </div>
```

- [ ] **Step 6: 子任务通知渲染（模板，可点击跳转）**

在「用户取消通知」块（约第 1248-1257 行 `t.type === 'notice'` 的 `</div>`）之后插入：

```html
                <!-- 子任务完成通知（系统注入，可点击跳到该子任务） -->
                <div
                  v-else-if="t.type === 'subtask_notice' && chipVisible('system')"
                  :ref="(el) => setBlockRef(el, t.index)"
                  class="chat-subtask-notice"
                  :class="{ 'blk-flash': highlightIdx === t.index, clickable: !!subagentById(t.block.agentId) }"
                  @click="subagentById(t.block.agentId) && switchView(t.block.agentId)"
                >
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
                  <span class="chat-subtask-text">子任务：{{ subagentLabel(t.block) }}</span>
                  <span v-if="subagentById(t.block.agentId)" class="chat-subtask-go">查看 ›</span>
                </div>
```

- [ ] **Step 7: 头部子任务徽标（模板）**

在会话详情头部标题块里（约第 1090-1093 行），把：

```html
              <div class="ph-detail-title">
                <span class="ph-detail-title-text">{{ selectedSession && (selectedSession.title || selectedSession.sessionId) }}</span>
                <span v-if="currentLive" class="ph-online-chip" title="该会话当前在终端中打开并在线">● 在线</span>
              </div>
```

替换为：

```html
              <div class="ph-detail-title">
                <span class="ph-detail-title-text">{{ selectedSession && (selectedSession.title || selectedSession.sessionId) }}</span>
                <span v-if="currentAgent" class="ph-subtask-badge" :title="'子任务：' + currentViewLabel">子任务 · {{ currentViewLabel }}</span>
                <span v-if="currentLive && !currentAgent" class="ph-online-chip" title="该会话当前在终端中打开并在线">● 在线</span>
              </div>
```

- [ ] **Step 8: MD 导出兼容子任务（脚本）**

把 `doExportMd`（约第 813-825 行）整体替换为：

```typescript
const doExportMd = () => {
  showExport.value = false
  if (!selectedSession.value) return
  const target = window.utools.showSaveDialog({
    title: '导出为 Markdown',
    defaultPath: safeFileBase() + '.md',
    filters: [{ name: 'Markdown', extensions: ['md'] }]
  })
  if (!target) return
  let r
  if (currentAgent.value) {
    // 子任务：从已加载模型生成 Markdown
    const md = window.services.sessionToMarkdown(sessionDetail.value, currentAgent.value)
    r = window.services.writeTextFile(target, md)
  } else {
    r = window.services.exportSessionToFile(props.project.dirName, selectedSession.value.sessionId, target)
  }
  if (r && r.success) showToast('已导出 Markdown')
  else error.value = (r && r.error) || '导出失败'
}
```

- [ ] **Step 9: 样式（CSS）**

在不带 scoped 的 `<style>`（与 `.ph-find` 同一块）末尾、`</style>` 之前追加：

```css
/* ---- 子任务切换器 ---- */
.ph-subtask-wrap { position: relative; flex: 0 0 auto; }
.ph-subtask-btn {
  display: flex; align-items: center; gap: 5px;
  height: 28px; max-width: 220px; padding: 0 8px;
  border: 1px solid var(--border-color); border-radius: 8px;
  background: var(--card-bg); color: var(--text-secondary);
  font-size: 12px; cursor: pointer;
}
.ph-subtask-btn:hover, .ph-subtask-btn.on { border-color: var(--primary-color); color: var(--primary-color); }
.ph-subtask-cur { max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ph-subtask-caret { transition: transform 0.15s ease; }
.ph-subtask-caret.open { transform: rotate(180deg); }
.ph-subtask-backdrop { position: fixed; inset: 0; z-index: 1500; }
.ph-subtask-panel {
  position: absolute; top: calc(100% + 4px); left: 0; z-index: 1600;
  width: 320px; max-height: 60vh; overflow-y: auto;
  display: none; flex-direction: column;
  background: var(--card-bg); border: 1px solid var(--border-color);
  border-radius: 10px; box-shadow: 0 6px 24px rgba(0, 0, 0, 0.18); padding: 6px;
}
.ph-subtask-panel.open { display: flex; }
.ph-subtask-item { display: flex; flex-direction: column; gap: 2px; padding: 7px 9px; border-radius: 7px; cursor: pointer; }
.ph-subtask-item:hover { background: var(--hover-bg, rgba(127, 127, 127, 0.12)); }
.ph-subtask-item.active { background: var(--primary-color); color: #fff; }
.ph-subtask-item.active .ph-subtask-mainsub, .ph-subtask-item.active .ph-subtask-type, .ph-subtask-item.active .ph-subtask-time { color: rgba(255, 255, 255, 0.8); }
.ph-subtask-main { font-weight: 600; font-size: 13px; }
.ph-subtask-mainsub { font-size: 11px; color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ph-subtask-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
.ph-subtask-desc { flex: 1 1 auto; min-width: 0; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ph-subtask-type { flex: 0 0 auto; font-size: 10px; padding: 1px 6px; border-radius: 999px; background: rgba(127, 127, 127, 0.16); color: var(--text-secondary); }
.ph-subtask-time { font-size: 11px; color: var(--text-tertiary); }
.ph-subtask-badge {
  flex: 0 0 auto; font-size: 11px; padding: 1px 8px; border-radius: 999px;
  border: 1px solid var(--primary-color); color: var(--primary-color); white-space: nowrap;
}

/* ---- 子任务完成通知（主会话流内）---- */
.chat-subtask-notice {
  display: flex; align-items: center; gap: 7px;
  margin: 6px 0; padding: 6px 12px;
  border: 1px dashed var(--border-color); border-radius: 8px;
  background: var(--card-bg); color: var(--text-secondary); font-size: 12.5px;
}
.chat-subtask-notice.clickable { cursor: pointer; }
.chat-subtask-notice.clickable:hover { border-color: var(--primary-color); color: var(--primary-color); }
.chat-subtask-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chat-subtask-go { margin-left: auto; flex: 0 0 auto; font-size: 12px; }
```

- [ ] **Step 10: 构建 + 手动验证**

Run: `npm run build`
Expected: 构建成功，无 TS/模板编译错误。

`npm run dev` 后打开含子任务的会话（如本会话 `a965a9ef-...`），逐项确认：
1. 筛选条最左出现子任务切换器，按钮显示「主任务」。
2. 点击展开下拉：第一条「主任务」+ 其下各子任务（description + agentType + 时间）。
3. 点击某子任务：右侧内容变为该子任务转录；切换器按钮与下拉高亮同步；标题旁出现「子任务 · …」徽标。
4. 点「主任务」切回：恢复主会话、在线/实时按原逻辑、徽标消失。
5. 主会话流中原先的 task-notification 不再是用户气泡，而是带 🔔 的紧凑通知；点击它跳到对应子任务（切换器同步）。
6. 在子任务视图里查找（Ctrl+F）正常；导出 Markdown 导出的是当前子任务内容。
7. 不含子任务的会话：切换器不显示，界面与原来一致。

- [ ] **Step 11: 提交**

```bash
git add src/ProjectHistory/index.vue
git commit -m "$(printf 'feat: 历史详情页子任务切换器与可点击的子任务通知\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Self-Review

**Spec coverage（对照 2026-06-27 子任务设计稿）：**
- §5.2 task-notification → system/subtask_notice 块 → Task 1。
- §5.1 listSubagents/readSubagent（含 mtime、安全校验、导出）→ Task 2。
- §5.3 currentAgent/switchView/选择复位 → Task 3 Step 1-3；turns 分支 → Step 4；切换器 UI → Step 5；通知可点击渲染 → Step 6；头部徽标 → Step 7；MD 导出 → Step 8；CSS → Step 9。
- §3 子任务下拉显示 description+agentType+时间 → Step 5；通知点击跳转 + 切换器同步 → Step 6（switchView 改 currentAgent，按钮/下拉绑定自动同步）。
- §7 测试：服务层单测 → Task 1/2；手动验证 → Task 3 Step 10。

**Placeholder scan：** 无 TBD/TODO；每个代码步骤含完整代码与确切命令/预期。

**Type consistency：** 块字段 `{ kind:'system', subtype:'subtask_notice', agentId, text }` 在 Task 1 产出、Task 3 Step 4/6 消费一致；`listSubagents` 返回字段 `{ agentId, agentType, description, toolUseId, spawnDepth, mtime }` 在 Task 2 定义、Step 5 模板使用一致；`switchView(agentId|null)`、`subagentById`、`subagentLabel`、`currentViewLabel`、`currentAgent`、`subagents`、`showSubtasks` 命名在 Step 1-9 间一致；服务名 `listSubagents`/`readSubagent`/`sessionToMarkdown`/`writeTextFile` 与 Task 2 及既有导出一致。
