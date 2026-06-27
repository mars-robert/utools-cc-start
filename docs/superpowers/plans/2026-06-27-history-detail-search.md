# 历史详情页内查找（VS Code 风格）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在历史详情页（`src/ProjectHistory/index.vue`）的会话视图中加入 VS Code 风格页内查找：`Ctrl/Cmd+F` 或搜索图标打开，高亮全部匹配、逐个跳转、命中折叠块自动展开、关闭复原。

**Architecture:** 三层拆分——纯匹配核心 `find-core.cjs`（CommonJS，可被 `node --test` 直接 require 并单测）；DOM/交互 composable `useFind.ts`（用 CSS Custom Highlight API 建 `Range` 高亮、不改 DOM）；`index.vue` 仅接线（键盘、搜索框 UI、展开状态回调、实时刷新重应用）。

**Tech Stack:** Vue 3 `<script setup>` + TS、Vite、marked；CSS Custom Highlight API（`CSS.highlights` / `window.Highlight` / `::highlight()`）；测试用 Node 内置 `node --test`，纯 CJS + 迷你断言骨架。

## Global Constraints

- 输出与文档默认中文（含代码注释）。
- 不新增运行时依赖（仅用现有 `vue`/`marked` 与浏览器 API）。
- 纯逻辑必须可被 `node --test "test/**/*.test.cjs"` 直接 `require`：采用 CommonJS（`module.exports`），沿用 `public/preload/active-sessions.cjs` 模式。
- 测试骨架沿用现有 `test/services-active.test.cjs` 中的 `test()` / `assertEquals()`（不引入测试框架）。
- 仅 `selected.type === 'session'` 详情启用查找；记忆详情不接。
- 被筛选胶囊隐藏的类别（`visibleKinds[kind] === false`，如默认隐藏的 `attachment`）不参与搜索。
- 提交信息用仓库既有中文 conventional-commit 风格，结尾加：
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

## Task 1: 纯匹配核心 find-core.cjs（TDD）

**Files:**
- Create: `src/ProjectHistory/find-core.cjs`
- Test: `test/history-find-core.test.cjs`

**Interfaces:**
- Consumes: 无。
- Produces:
  - `escapeRegExp(s: string) => string` — 转义正则元字符。
  - `compileQuery(query: string, opts: { caseSensitive?: boolean, wholeWord?: boolean, useRegex?: boolean }) => { re: RegExp | null, error: string }` — 编译为全局正则；空查询 `re=null,error=''`；非法正则 `re=null,error=<msg>`。
  - `findInText(text: string, re: RegExp | null) => Array<[number, number]>` — 单段文本所有匹配区间 `[start,end)`；忽略零宽匹配且不死循环。

- [ ] **Step 1: 写失败测试**

创建 `test/history-find-core.test.cjs`：

```javascript
/**
 * @file 测试 find-core.cjs：历史详情页内查找的纯匹配核心
 *   - escapeRegExp：转义正则元字符
 *   - compileQuery：按 大小写/全字/正则 选项编译全局正则
 *   - findInText：单段文本求所有匹配区间，零宽不死循环
 */

const { escapeRegExp, compileQuery, findInText } = require('../src/ProjectHistory/find-core.cjs')

// ---- 迷你测试骨架（与 services-active.test.cjs 一致）----
function test (name, fn) {
  try {
    fn()
    console.log(`✓ ${name}`)
  } catch (err) {
    console.error(`✗ ${name}`)
    console.error('  ', err.message)
    process.exitCode = 1
  }
}

function assertEquals (actual, expected, message) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a !== e) {
    throw new Error(`${message || 'Assertion failed'}: expected ${e}, got ${a}`)
  }
}

// escapeRegExp
test('escapeRegExp 转义元字符', () => {
  assertEquals(escapeRegExp('a.b*c'), 'a\\.b\\*c', 'should escape . and *')
})

// compileQuery：字面量
test('compileQuery 字面量将 . 视为普通字符', () => {
  const { re } = compileQuery('a.b', {})
  assertEquals(findInText('xa.byaxb', re), [[1, 4]], 'literal a.b matches only a.b not axb')
})

test('compileQuery 默认大小写不敏感', () => {
  const { re } = compileQuery('cat', {})
  assertEquals(findInText('Cat cat', re).length, 2, 'case-insensitive matches both')
})

test('compileQuery caseSensitive 区分大小写', () => {
  const { re } = compileQuery('cat', { caseSensitive: true })
  assertEquals(findInText('Cat cat', re), [[4, 7]], 'only lowercase cat')
})

test('compileQuery wholeWord 全字匹配', () => {
  const { re } = compileQuery('cat', { wholeWord: true })
  assertEquals(findInText('cat category cat.', re), [[0, 3], [13, 16]], 'whole-word only')
})

test('compileQuery useRegex 正则模式', () => {
  const { re } = compileQuery('a\\d+', { useRegex: true })
  assertEquals(findInText('a12 b a3', re), [[0, 3], [6, 8]], 'regex digit runs')
})

test('compileQuery 非法正则返回 error', () => {
  const { re, error } = compileQuery('a(', { useRegex: true })
  assertEquals(re, null, 're is null on invalid')
  assertEquals(error.length > 0, true, 'error message present')
})

test('compileQuery 空查询返回空', () => {
  const { re, error } = compileQuery('', {})
  assertEquals(re, null, 'empty query re null')
  assertEquals(error, '', 'no error')
})

// findInText
test('findInText 无匹配返回空数组', () => {
  const { re } = compileQuery('zzz', {})
  assertEquals(findInText('abc', re), [], 'no match')
})

test('findInText null re 返回空数组', () => {
  assertEquals(findInText('abc', null), [], 'null re')
})

test('findInText 零宽匹配不死循环且被忽略', () => {
  const { re } = compileQuery('x*', { useRegex: true })
  assertEquals(findInText('abc', re), [], 'zero-width yields no ranges and terminates')
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test`
Expected: FAIL —— `Cannot find module '../src/ProjectHistory/find-core.cjs'`。

- [ ] **Step 3: 实现 find-core.cjs**

创建 `src/ProjectHistory/find-core.cjs`：

```javascript
'use strict'

// 历史详情页内查找的纯匹配核心。CommonJS，便于 node --test 直接 require。

// 转义正则元字符，使字面量查询不被当作正则
function escapeRegExp (s) {
  return String(s == null ? '' : s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// 编译查找条件为「全局」正则；空查询返回 re=null；非法正则返回 error
function compileQuery (query, opts) {
  const q = query == null ? '' : String(query)
  if (!q) return { re: null, error: '' }
  const o = opts || {}
  let pattern = o.useRegex ? q : escapeRegExp(q)
  if (o.wholeWord) pattern = '\\b(?:' + pattern + ')\\b'
  let flags = 'g'
  if (!o.caseSensitive) flags += 'i'
  try {
    return { re: new RegExp(pattern, flags), error: '' }
  } catch (e) {
    return { re: null, error: (e && e.message) || '正则无效' }
  }
}

// 求 text 中所有匹配区间 [start,end)；忽略零宽匹配并防死循环
function findInText (text, re) {
  const out = []
  const s = typeof text === 'string' ? text : ''
  if (!re || !s) return out
  re.lastIndex = 0
  let m
  while ((m = re.exec(s)) !== null) {
    const start = m.index
    const end = start + m[0].length
    if (m[0].length > 0) out.push([start, end])
    re.lastIndex = end > start ? end : start + 1
  }
  return out
}

module.exports = { escapeRegExp, compileQuery, findInText }
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test`
Expected: PASS —— 新增用例全部 `✓`，`process.exitCode` 为 0。

- [ ] **Step 5: 提交**

```bash
git add src/ProjectHistory/find-core.cjs test/history-find-core.test.cjs
git commit -m "$(printf 'feat: 历史详情页内查找匹配核心 find-core\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 2: useFind composable + index.vue 接线、搜索框 UI、高亮样式

**Files:**
- Create: `src/ProjectHistory/useFind.ts`
- Modify: `src/ProjectHistory/index.vue`（`<script setup>` 插入接线、模板加搜索框与图标、`<style>` 加样式）

**Interfaces:**
- Consumes（来自 Task 1）：`compileQuery`、`findInText`（from `./find-core.cjs`）。
- Produces：
  - `useFind(host: FindHost) => { supported, visible, query, caseSensitive, wholeWord, useRegex, count, current, invalid, open, close, next, prev, refresh }`
  - `FindHost`：`{ scrollEl: Ref<HTMLElement|null>, getBlocks: () => any[]|undefined, isKindVisible: (kind:string)=>boolean, blockSearchText: (b:any)=>string, keyForBlock: (i:number)=>string, isExpanded: (i:number)=>boolean, setExpanded: (i:number, v:boolean)=>void }`
  - `open(prefill?: string): void`、`close(): void`、`next(): void`、`prev(): void`、`refresh(): void`。
  - `visible/invalid` 为 `Ref<boolean>`；`query` 为 `Ref<string>`；`caseSensitive/wholeWord/useRegex` 为 `Ref<boolean>`；`count/current` 为 `Ref<number>`（`current` 0 基，显示 `current+1`）；`supported` 为 `boolean`。

- [ ] **Step 1: 创建 useFind.ts**

创建 `src/ProjectHistory/useFind.ts`：

```typescript
import { nextTick, ref, watch, type Ref } from 'vue'
// @ts-ignore 纯 CJS 匹配核心，无类型声明
import { compileQuery, findInText } from './find-core.cjs'

export interface FindHost {
  scrollEl: Ref<HTMLElement | null>
  getBlocks: () => any[] | undefined
  isKindVisible: (kind: string) => boolean
  blockSearchText: (block: any) => string
  keyForBlock: (i: number) => string // '' 表示该块不可折叠（恒在 DOM 中）
  isExpanded: (i: number) => boolean
  setExpanded: (i: number, v: boolean) => void
}

// VS Code 风格页内查找：CSS Custom Highlight API 建 Range 高亮，不改 DOM。
export function useFind (host: FindHost) {
  const C: any = typeof CSS !== 'undefined' ? CSS : null
  const HighlightCtor: any = typeof window !== 'undefined' ? (window as any).Highlight : null
  const supported = !!(C && C.highlights && HighlightCtor)

  const visible = ref(false)
  const query = ref('')
  const caseSensitive = ref(false)
  const wholeWord = ref(false)
  const useRegex = ref(false)
  const count = ref(0)
  const current = ref(0)
  const invalid = ref(false)

  let ranges: Range[] = []
  const autoExpanded = new Set<number>() // 仅为搜索而展开的块下标，关闭/失配时复原
  let debounceTimer = 0

  const clearHighlights = () => {
    if (supported) { C.highlights.delete('ph-find'); C.highlights.delete('ph-find-current') }
    ranges = []
  }

  const restoreExpanded = () => {
    for (const i of autoExpanded) host.setExpanded(i, false)
    autoExpanded.clear()
  }

  const paint = () => {
    if (!supported) return
    C.highlights.delete('ph-find')
    C.highlights.delete('ph-find-current')
    if (!ranges.length) return
    C.highlights.set('ph-find', new HighlightCtor(...ranges))
    const cur = ranges[current.value]
    if (cur) {
      const ch = new HighlightCtor(cur)
      ch.priority = 1
      C.highlights.set('ph-find-current', ch)
    }
  }

  const scrollToCurrent = () => {
    const root = host.scrollEl.value
    const r = ranges[current.value]
    if (!root || !r) return
    const rect = r.getBoundingClientRect()
    if (!rect.height && !rect.width) return
    const c = root.getBoundingClientRect()
    root.scrollTop += (rect.top - c.top) - (c.height - rect.height) / 2
  }

  const run = async () => {
    if (!supported || !visible.value) return
    const { re, error } = compileQuery(query.value, {
      caseSensitive: caseSensitive.value,
      wholeWord: wholeWord.value,
      useRegex: useRegex.value
    })
    invalid.value = !!error

    // 1) 数据层预扫：跳过被筛选隐藏的类别，得命中块下标
    const blocks = host.getBlocks() || []
    const hit = new Set<number>()
    if (re) {
      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i]
        if (!host.isKindVisible(b.kind)) continue
        if (findInText(host.blockSearchText(b), re).length) hit.add(i)
      }
    }
    // 2) 同步展开：命中且折叠的展开并记录；之前为搜索展开、现已失配的复原
    for (const i of hit) {
      const k = host.keyForBlock(i)
      if (k && !host.isExpanded(i)) { host.setExpanded(i, true); autoExpanded.add(i) }
    }
    for (const i of [...autoExpanded]) {
      if (!hit.has(i)) { host.setExpanded(i, false); autoExpanded.delete(i) }
    }

    await nextTick()

    // 3) 遍历 DOM 文本节点建 Range（折叠/隐藏内容天然不在 DOM 中）
    ranges = []
    const root = host.scrollEl.value
    if (re && root) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      let node: Node | null
      while ((node = walker.nextNode())) {
        const spans = findInText(node.nodeValue || '', re)
        for (const [s, e] of spans) {
          const rg = document.createRange()
          rg.setStart(node, s)
          rg.setEnd(node, e)
          ranges.push(rg)
        }
      }
    }
    count.value = ranges.length
    if (current.value > count.value - 1) current.value = 0
    paint()
    if (count.value) scrollToCurrent()
  }

  const schedule = () => {
    if (!visible.value) return
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = window.setTimeout(run, 120)
  }

  watch([query, caseSensitive, wholeWord, useRegex], schedule)

  const open = (prefill?: string) => {
    if (!supported) return
    visible.value = true
    if (prefill && !query.value) query.value = prefill.slice(0, 200)
    run()
  }
  const close = () => {
    if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = 0 }
    clearHighlights()
    restoreExpanded()
    visible.value = false
    count.value = 0
    current.value = 0
    invalid.value = false
  }
  const next = () => {
    if (!count.value) return
    current.value = (current.value + 1) % count.value
    paint(); scrollToCurrent()
  }
  const prev = () => {
    if (!count.value) return
    current.value = (current.value - 1 + count.value) % count.value
    paint(); scrollToCurrent()
  }
  const refresh = () => { if (visible.value) run() }

  return { supported, visible, query, caseSensitive, wholeWord, useRegex, count, current, invalid, open, close, next, prev, refresh }
}
```

- [ ] **Step 2: 在 index.vue 接入 composable（脚本）**

在 `src/ProjectHistory/index.vue` 顶部 import 处（第 2 行 `import { computed, ... } from 'vue'` 之后）新增：

```typescript
import { useFind } from './useFind'
```

在 `filterChips` 计算属性之后（约第 140 行，`const filterChips = computed(...)` 那一行下面）插入查找接线块：

```typescript
// ---- 页内查找（VS Code 风格）----
const findInput = ref<HTMLInputElement | null>(null)
// 选区文本作为打开时的预填
const selText = () => {
  try { return window.getSelection ? String(window.getSelection()) : '' } catch (_) { return '' }
}
// 块下标 → 折叠展开键（仅 思考/工具调用 可折叠；其余恒在 DOM 中返回 ''）
const keyForBlock = (i: number) => {
  const b = sessionDetail.value && sessionDetail.value.blocks[i]
  if (!b) return ''
  if (b.kind === 'thinking') return 't' + i
  if (b.kind === 'tool_use') return 'tu' + i
  return ''
}
// 块的可搜文本：正文 + 命令 + 工具名/入参/结果
const blockSearchText = (b: any) => {
  if (!b) return ''
  let s = b.text || ''
  if (b.command) s += ' ' + (b.command.name || '') + ' ' + (b.command.args || '')
  if (b.kind === 'tool_use') {
    s += ' ' + (b.name || '')
    try { s += ' ' + JSON.stringify(b.input || '') } catch (_) { /* 入参不可序列化则跳过 */ }
    if (b.result) s += ' ' + (b.result.text || '')
  }
  return s
}
const {
  supported: findSupported, visible: findVisible, query: findQuery,
  caseSensitive: findCase, wholeWord: findWord, useRegex: findRegex,
  count: findCount, current: findCurrent, invalid: findInvalid,
  open: findOpen, close: findClose, next: findNext, prev: findPrev, refresh: findRefresh
} = useFind({
  scrollEl,
  getBlocks: () => sessionDetail.value?.blocks,
  isKindVisible: (k: string) => !!visibleKinds[k],
  blockSearchText,
  keyForBlock,
  isExpanded: (i: number) => { const k = keyForBlock(i); return k ? isOpen(k) : true },
  setExpanded: (i: number, v: boolean) => { const k = keyForBlock(i); if (k) expandedKeys[k] = v }
})
// 打开后聚焦并全选输入框
watch(findVisible, (v) => { if (v) nextTick(() => { findInput.value?.focus(); findInput.value?.select() }) })
```

- [ ] **Step 3: 接入键盘（拦截 Esc / 方向键 + 新接 Ctrl/Cmd+F）**

把 `onKeydown`（约第 864 行）整体替换为：

```typescript
const onKeydown = (e: KeyboardEvent) => {
  // 查找框打开时：Esc 关闭查找；屏蔽列表方向键；其余交给输入框，不走列表逻辑
  if (findVisible.value) {
    if (e.key === 'Escape') { e.preventDefault(); findClose() }
    return
  }
  // Ctrl/Cmd+F：仅会话详情、且环境支持时启用页内查找
  if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
    if (findSupported && selected.value && selected.value.type === 'session') {
      e.preventDefault(); findOpen(selText()); return
    }
  }
  if (e.key === 'Escape') { e.preventDefault(); emit('back'); return }
  const items = flatItems.value
  if (!items.length) return
  const curIdx = selected.value
    ? items.findIndex((it) => it.type === selected.value!.type && it.id === selected.value!.id)
    : -1
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    selectItem(items[Math.min(curIdx + 1, items.length - 1)] || items[0])
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (curIdx > 0) selectItem(items[curIdx - 1])
  }
}
```

- [ ] **Step 4: 实时刷新后重应用、切换/卸载时复位**

在 `refreshSession` 的 `nextTick(...)` 回调里（约第 596–604 行），在分支逻辑末尾追加重应用。把该 `nextTick` 块替换为：

```typescript
  nextTick(() => {
    if (wasNearBottom) { scrollToBottom() }
    else {
      // 在上方翻看 → 标记有未读，并按基线算出新增了几条提问
      updateJumpBtn()
      hasNew.value = true
      newCount.value = Math.max(0, userQuestions.value.length - seenQCount)
    }
    if (findVisible.value) findRefresh() // 内容重渲染后旧 Range 失效，重建高亮
  })
```

在 `selectSession`（约第 660 行）开头的复位区，紧接 `showQuestions.value = false` 之后加入：

```typescript
  findClose()
```

在 `selectMemory`（约第 650 行）的 `stopPoll()` 之后加入：

```typescript
  findClose()
```

在 `onUnmounted`（约第 887 行）的 `stopPoll(); stopLiveTimer()` 之后加入：

```typescript
  findClose()
```

- [ ] **Step 5: 搜索图标按钮（模板，置于上下按钮左侧）**

在 `.ph-qnav`（约第 1097 行 `<div v-if="userQuestions.length" class="ph-qnav">`）内、第一个 `.ph-qbtn`（上一个提问）之前插入搜索图标按钮：

```html
              <button v-if="findSupported" class="ph-qbtn ph-qbtn-find" title="查找 (Ctrl+F)" @click="findOpen(selText())">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
              </button>
```

- [ ] **Step 6: 查找框浮层（模板）**

在 `.ph-filterbar` 闭合 `</div>`（即 `<div ref="scrollEl" class="ph-detail-scroll" ...>` 之前，约第 1126–1127 行之间）插入查找框浮层：

```html
          <div v-if="findSupported && findVisible" class="ph-find">
            <input
              ref="findInput"
              v-model="findQuery"
              class="ph-find-input"
              :class="{ invalid: findInvalid }"
              type="text"
              placeholder="查找"
              spellcheck="false"
              @keydown.enter.exact.prevent="findNext()"
              @keydown.enter.shift.prevent="findPrev()"
            />
            <span class="ph-find-count">{{ findCount ? (findCurrent + 1) + '/' + findCount : '0/0' }}</span>
            <button class="ph-find-btn" title="上一个 (Shift+Enter)" :disabled="!findCount" @click="findPrev()">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6" /></svg>
            </button>
            <button class="ph-find-btn" title="下一个 (Enter)" :disabled="!findCount" @click="findNext()">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg>
            </button>
            <span class="ph-find-sep"></span>
            <button class="ph-find-btn ph-find-toggle" :class="{ on: findCase }" title="区分大小写" @click="findCase = !findCase">Aa</button>
            <button class="ph-find-btn ph-find-toggle" :class="{ on: findWord }" title="全字匹配" @click="findWord = !findWord">&#9474;ab&#9474;</button>
            <button class="ph-find-btn ph-find-toggle" :class="{ on: findRegex }" title="正则表达式" @click="findRegex = !findRegex">.*</button>
            <button class="ph-find-btn" title="关闭 (Esc)" @click="findClose()">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>

```

- [ ] **Step 7: 样式（搜索图标分隔线 + 查找框 + 高亮）**

在 `.ph-qbtn:hover` 规则（约第 1704 行）之后插入搜索图标的分隔线规则：

```css
.ph-qbtn-find { border-right: 1px solid var(--border-color); }
.ph-qnav .ph-qbtn-find + .ph-qbtn { border-right: 1px solid var(--border-color); }
```

在不带 scoped 的 `<style>`（第 1454 行）末尾（`</style>` 之前）追加查找框与高亮样式：

```css
/* ---- 页内查找浮层 ---- */
.ph-find {
  position: absolute;
  top: 8px; right: 18px;
  z-index: 1700;
  display: flex; align-items: center; gap: 2px;
  padding: 4px 6px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18);
}
.ph-find-input {
  width: 180px; height: 26px;
  padding: 0 8px;
  border: 1px solid var(--border-color); border-radius: 6px;
  background: var(--card-bg); color: var(--text-primary);
  font-size: 13px; outline: none;
}
.ph-find-input:focus { border-color: var(--primary-color); }
.ph-find-input.invalid { border-color: #e5534b; }
.ph-find-count {
  min-width: 44px; padding: 0 4px;
  text-align: center; font-size: 12px; color: var(--text-secondary);
  white-space: nowrap;
}
.ph-find-sep { width: 1px; height: 18px; margin: 0 2px; background: var(--border-color); }
.ph-find-btn {
  width: 26px; height: 24px;
  display: flex; align-items: center; justify-content: center;
  border: none; border-radius: 5px;
  background: transparent; color: var(--text-secondary);
  font-size: 12px; cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;
}
.ph-find-btn:hover:not(:disabled) { background: var(--primary-color); color: #fff; }
.ph-find-btn:disabled { opacity: 0.4; cursor: default; }
.ph-find-toggle { font-weight: 600; }
.ph-find-toggle.on { background: var(--primary-color); color: #fff; }

/* ---- 查找命中高亮（CSS Custom Highlight API）---- */
::highlight(ph-find) { background-color: rgba(250, 204, 21, 0.45); }
::highlight(ph-find-current) { background-color: rgba(249, 115, 22, 0.9); color: #1a1a1a; }
```

- [ ] **Step 8: 构建确认通过**

Run: `npm run build`
Expected: 构建成功，无 TS / 模板编译错误。

- [ ] **Step 9: 手动验证**

`npm run dev`（或在 uTools 内加载构建产物）打开一个历史会话，逐项确认：

1. `Ctrl+F` 弹出右上角查找框并自动聚焦；`.ph-qnav` 上下按钮左侧出现放大镜图标，点击同样弹出。
2. 输入关键词：全部匹配淡黄高亮，当前项橙色；计数显示 `1/N`。
3. `Enter`/下一个、`Shift+Enter`/上一个：当前项切换并居中滚入视口，计数同步。
4. 命中藏在折叠「思考」或「工具调用」块内的关键词时，该块自动展开并高亮。
5. 关闭查找（`Esc` 或 ✕）：高亮清除，且第 4 步中「仅为搜索而展开」的块复原折叠。
6. `Aa`/全字/`.*` 三开关切换后结果即时更新；输入非法正则（如 `a(`）时输入框标红、无高亮、计数 `0/0`。
7. 把某类别（如「工具调用」）用筛选胶囊隐藏后，其内容搜不到（计数不含它）。
8. 对「在线」会话保持查找打开，待有新消息实时刷新后，高亮按新内容重建、不报错。
9. 切换到另一会话或返回列表（`Esc`）后查找已复位、无残留高亮。

- [ ] **Step 10: 提交**

```bash
git add src/ProjectHistory/useFind.ts src/ProjectHistory/index.vue
git commit -m "$(printf 'feat: 历史详情页内查找（VS Code 风格）\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Self-Review

**Spec coverage（对照 2026-06-27 设计稿）：**
- §3 完整版查找框（计数/上下/Aa/全字/正则/关闭）→ Task 2 Step 6。
- §3 命中折叠块自动展开 → useFind `run()` 展开同步（Task 2 Step 1）+ host 回调（Step 2）。
- §3 关闭复原折叠 → `restoreExpanded()` + `close()`（Step 1）。
- §3 筛选隐藏类别不参与 → `isKindVisible` 预扫过滤（Step 1/2）。
- §3 查找框右上浮层 → Step 6 + Step 7 `.ph-find` 绝对定位于 `.ph-right`。
- §4 CSS Custom Highlight API + 不支持兜底 → `supported` 判定、图标/Ctrl+F 均 gated（Step 1/2/3/5）。
- §5 三层模块边界 → find-core.cjs（Task 1）/ useFind.ts（Step 1）/ index.vue 接线（Step 2-7）。
- §6 流程 6 步 → `run()`。
- §7 交互（双触发/Enter/Shift+Enter/Esc/实时刷新重应用/切会话复位/空查询）→ Step 3/4/6。
- §9 测试（compileQuery/findInText 单测 + 手动清单）→ Task 1 Step 1、Task 2 Step 9。

**Placeholder scan：** 无 TBD/TODO；所有代码步骤均含完整代码与确切命令、预期输出。

**Type consistency：** `FindHost` 字段（`scrollEl/getBlocks/isKindVisible/blockSearchText/keyForBlock/isExpanded/setExpanded`）在 Task 2 Step 1 定义、Step 2 实参一致；解构出的 `findSupported/findVisible/findQuery/findCase/findWord/findRegex/findCount/findCurrent/findInvalid/findOpen/findClose/findNext/findPrev/findRefresh` 在 Step 2-6 模板与脚本中用法一致；`compileQuery/findInText` 签名与 Task 1 一致。
