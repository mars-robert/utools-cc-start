<script lang="ts" setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { marked } from 'marked'

const props = defineProps<{
  project: any
  filter: string
}>()

const emit = defineEmits<{ (e: 'back'): void }>()

const memories = ref<any[]>([])
const sessions = ref<any[]>([])
const error = ref('')
const toast = ref('')

const selected = ref<{ type: string; id: string } | null>(null)
const memoryDetail = ref<{ frontmatter: any; body: string } | null>(null)
const sessionDetail = ref<{ blocks: any[]; meta: any } | null>(null)
const selectedSession = ref<any>(null)
const detailLoading = ref(false)

// ---- 实时刷新：打开会话即轮询文件变更，增量重读并贴底跟随 ----
const autoRefresh = ref(true) // 默认开启，可暂停
const scrollEl = ref<HTMLElement | null>(null)
const showJumpBottom = ref(false) // 不在底部 → 显示「滚动到底部」按钮
const hasNew = ref(false) // 在上方翻看时底部来了新消息 → 触发绿色高亮
const newCount = ref(0) // hasNew 期间累计的新增提问数，用于「N 条新提问」
let seenQCount = 0 // 用户「看到底部」时的提问数基线，与当前提问数之差即新提问数
const POLL_MS = 800 // 检测间隔：仅一次 statSync，变化才重读，故可提频降延迟而不增成本
const NEAR_BOTTOM_PX = 80
let pollTimer: number | null = null
let lastSig = '' // 上次已加载文件的签名（mtime:size），用于跳过无变化的轮询

// 提问导航：收集所有用户提问，支持上下跳转与列表跳转
const blockEls: Record<number, HTMLElement> = {}
const setBlockRef = (el: any, i: number) => { if (el) blockEls[i] = el as HTMLElement }
const showQuestions = ref(false)
const curQ = ref(0)
const highlightIdx = ref(-1)
// 用户中断/取消标记：整条仅为标记 → 视为取消通知；嵌在真实消息中 → 仅清除标记
const isInterruptOnly = (text: string) => /^\s*\[Request interrupted by user[^\]]*\]\s*$/.test(text || '')
const cleanInterrupt = (text: string) => (text || '')
  .replace(/\[Request interrupted by user[^\]]*\]/g, '')
  .replace(/[ \t]{2,}/g, ' ')
  .replace(/\n{3,}/g, '\n\n')
  .trim()
const interruptLabel = (text: string) => (/for tool use/.test(text || '') ? '用户已取消工具调用' : '用户已取消')

const userQuestions = computed(() => {
  const out: { index: number; text: string; ts: string }[] = []
  if (sessionDetail.value) {
    sessionDetail.value.blocks.forEach((b: any, i: number) => {
      if (b.kind === 'user' && !isInterruptOnly(b.text)) {
        const text = b.command ? (b.command.name + (b.command.args ? ' ' + b.command.args : '')) : cleanInterrupt(b.text)
        out.push({ index: i, text, ts: b.ts || '' })
      }
    })
  }
  return out
})
const previewText = (t: string) => (t || '').replace(/\s+/g, ' ').trim().slice(0, 60)
const jumpToBlock = (i: number) => {
  armSpySuppress() // 显式跳转：锁住 scrollspy，避免平滑滚动把刚选定的序号覆盖
  const el = blockEls[i]
  if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  highlightIdx.value = i
  setTimeout(() => { if (highlightIdx.value === i) highlightIdx.value = -1 }, 1200)
}
const jumpToQuestion = (n: number) => {
  const qs = userQuestions.value
  if (!qs.length) return
  curQ.value = (n + qs.length) % qs.length
  jumpToBlock(qs[curQ.value].index)
}
const openQuestion = (q: any, n: number) => {
  curQ.value = n
  showQuestions.value = false
  jumpToBlock(q.index)
}

// 折叠状态（思考 / 大体量工具结果默认折叠）
const expandedKeys = reactive<Record<string, boolean>>({})
const forceExpand = ref(false) // HTML 导出时临时全部展开，保证内容完整
const isOpen = (key: string) => forceExpand.value || !!expandedKeys[key]
const toggle = (key: string) => { expandedKeys[key] = !expandedKeys[key] }

// 记忆类型 → 标签 + 配色 class
const MEM_TYPE: Record<string, string> = {
  user: '用户', feedback: '反馈', project: '项目', reference: '引用'
}
const memTypeLabel = (t: string) => MEM_TYPE[t] || t || '记忆'

// 会话内容块类型 → 标签 + 配色 class
const KIND: Record<string, { label: string; cls: string }> = {
  user: { label: '用户', cls: 'k-user' },
  assistant: { label: '助手', cls: 'k-assistant' },
  thinking: { label: '思考', cls: 'k-thinking' },
  tool_use: { label: '工具调用', cls: 'k-tool' },
  tool_result: { label: '工具结果', cls: 'k-result' },
  system: { label: '系统', cls: 'k-system' },
  attachment: { label: '附件', cls: 'k-attach' }
}
const kindMeta = (k: string) => KIND[k] || { label: k, cls: 'k-system' }

// 类型筛选：默认显示对话内容，附件（hook/权限/提醒等系统附加）默认隐藏
const FILTER_KINDS = ['user', 'assistant', 'thinking', 'tool_use', 'tool_result', 'system', 'attachment']
const visibleKinds = reactive<Record<string, boolean>>({})
const resetFilters = () => { FILTER_KINDS.forEach((k) => { visibleKinds[k] = k !== 'attachment' }) }
resetFilters()
const kindCounts = computed(() => {
  const c: Record<string, number> = {}
  if (sessionDetail.value) for (const b of sessionDetail.value.blocks) c[b.kind] = (c[b.kind] || 0) + 1
  return c
})
const filterChips = computed(() => FILTER_KINDS.filter((k) => (kindCounts.value[k] || 0) > 0))

// ---- 对话框辅助信息：完整时间 / 模型 / token 用量 ----
const fmtDateTime = (ts: string) => {
  if (!ts) return ''
  const d = new Date(ts)
  if (isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
const fmtNum = (n: number) => (n || 0).toLocaleString('en-US')
// 缩略形式（标题栏小灰字用），完整信息放进 title 悬浮
const fmtClock = (ts: string) => {
  if (!ts) return ''
  const d = new Date(ts)
  if (isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}
const shortModel = (m: string) => {
  if (!m) return ''
  const fam = (m.match(/opus|sonnet|haiku|fable/i) || [])[0]
  return fam ? fam.charAt(0).toUpperCase() + fam.slice(1) : m.replace(/^claude-/, '')
}
const fmtTokK = (n: number) => (!n ? '0' : (n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n)))

// 聚合一个 Claude 回合的辅助信息（usage 按引用去重，避免同一条消息重复计数）
const claudeMeta = (items: any[]) => {
  let ts = ''; let model = ''
  let inputTok = 0; let cacheRead = 0; let cacheCreate = 0; let outputTok = 0
  const seen = new Set<any>()
  for (const it of items) {
    if (it.block.ts) ts = it.block.ts
    if (!model && it.block.model) model = it.block.model
    const u = it.block.usage
    if (u && !seen.has(u)) {
      seen.add(u)
      inputTok += u.input_tokens || 0
      cacheRead += u.cache_read_input_tokens || 0
      cacheCreate += u.cache_creation_input_tokens || 0
      outputTok += u.output_tokens || 0
    }
  }
  return { ts, model, inputTok, cacheRead, cacheCreate, outputTok }
}

// 标题栏缩略信息 + 悬浮完整信息
const claudeHeadMeta = (m: any) => {
  if (!m) return ''
  const parts: string[] = []
  if (m.ts) parts.push(fmtDateTime(m.ts))
  if (m.model) parts.push(m.model)
  if (m.outputTok) parts.push('↓' + fmtTokK(m.outputTok))
  return parts.join(' · ')
}
const claudeHeadTitle = (m: any) => {
  if (!m) return ''
  const parts: string[] = []
  if (m.ts) parts.push(fmtDateTime(m.ts))
  if (m.model) parts.push(m.model)
  if (m.inputTok) parts.push('输入 ' + fmtNum(m.inputTok))
  if (m.cacheRead) parts.push('缓存读 ' + fmtNum(m.cacheRead))
  if (m.cacheCreate) parts.push('缓存写 ' + fmtNum(m.cacheCreate))
  if (m.outputTok) parts.push('输出 ' + fmtNum(m.outputTok))
  return parts.join(' · ')
}

// 对话模式分组：用户提问为独立卡片，其后连续的非用户块聚合为一个 Claude 回复大卡片
const turns = computed(() => {
  const out: any[] = []
  let cur: any = null
  if (sessionDetail.value) {
    sessionDetail.value.blocks.forEach((b: any, i: number) => {
      if (b.kind === 'user' && isInterruptOnly(b.text)) {
        out.push({ type: 'notice', block: b, index: i }); cur = null
      } else if (b.kind === 'user') {
        out.push({ type: 'user', block: b, index: i }); cur = null
      } else {
        if (!cur) { cur = { type: 'claude', items: [] }; out.push(cur) }
        cur.items.push({ block: b, index: i })
      }
    })
  }
  for (const t of out) { if (t.type === 'claude') t.meta = claudeMeta(t.items) }
  return out
})
const claudeVisible = (t: any) => t.items.some((it: any) => visibleKinds[it.block.kind])

// 用户提问始终显示；其余类型按筛选显隐
const chipVisible = (k: string) => (k === 'user' ? true : visibleKinds[k])
// 点击「用户」胶囊弹出提问下拉框；其余胶囊切换显隐
const onChipClick = (k: string) => {
  if (k === 'user') { showQuestions.value = !showQuestions.value; return }
  visibleKinds[k] = !visibleKinds[k]
}

const filteredMemories = computed(() => {
  const q = (props.filter || '').trim().toLowerCase()
  if (!q) return memories.value
  return memories.value.filter((m) =>
    (m.description && m.description.toLowerCase().includes(q)) ||
    (m.name && m.name.toLowerCase().includes(q))
  )
})

const filteredSessions = computed(() => {
  const q = (props.filter || '').trim().toLowerCase()
  if (!q) return sessions.value
  return sessions.value.filter((s) => (s.title && s.title.toLowerCase().includes(q)))
})

const flatItems = computed(() => [
  ...filteredMemories.value.map((m) => ({ type: 'memory', id: m.fileName, raw: m })),
  ...filteredSessions.value.map((s) => ({ type: 'session', id: s.sessionId, raw: s }))
])

const load = () => {
  error.value = ''
  stopPoll()
  selected.value = null
  memoryDetail.value = null
  sessionDetail.value = null
  selectedSession.value = null
  const p = props.project
  if (!p || !p.dirName) { memories.value = []; sessions.value = []; return }
  try {
    memories.value = window.services.listProjectMemories(p.dirName) || []
    sessions.value = window.services.listProjectSessions(p.dirName) || []
  } catch (err: any) {
    error.value = err && err.message ? err.message : String(err)
  }
}

const formatTime = (ms: number) => {
  if (!ms) return ''
  const d = new Date(ms)
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  if (d.toDateString() === now.toDateString()) return `今天 ${hm}`
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${hm}`
}

const formatSize = (bytes: number) => {
  if (!bytes) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}

// ---- markdown 渲染（最小净化，防止工具输出中的 HTML/脚本被执行）----
const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const sanitize = (html: string) => html
  .replace(/<\s*(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
  .replace(/<\s*(script|style|iframe|object|embed)[^>]*\/?>/gi, '')
  .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
  .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
  .replace(/javascript:/gi, '')

// 按文本缓存渲染结果：会话为 append-only，刷新时旧块文本不变 → 命中缓存，
// 只对新增/正在增长的块跑 marked，避免每次刷新重渲染整段对话造成卡顿。
const mdCache = new Map<string, string>()
const renderMarkdown = (text: string) => {
  const key = text || ''
  const cached = mdCache.get(key)
  if (cached !== undefined) return cached
  let html: string
  try { html = sanitize(marked.parse(key, { breaks: true }) as string) }
  catch (_) { html = escapeHtml(key) }
  if (mdCache.size > 1500) mdCache.clear() // 长流式会话兜底，防止无界增长
  mdCache.set(key, html)
  return html
}

const big = (text: string) => !!text && (text.length > 400 || text.split('\n').length > 10)
const toolSummary = (input: any) => {
  if (!input || typeof input !== 'object') return ''
  return input.command || input.file_path || input.path || input.pattern || input.description || ''
}
const stringifyInput = (input: any) => {
  if (typeof input === 'string') return input
  try { return JSON.stringify(input, null, 2) } catch (_) { return String(input) }
}
// 工具调用折叠行文本：优先 description，回退命令/路径/工具名
const toolDesc = (b: any) => {
  const inp = b.input || {}
  return inp.description || toolSummary(inp) || b.name || '工具调用'
}
const toolCommand = (b: any) => {
  const inp = b.input || {}
  return typeof inp.command === 'string' ? inp.command : ''
}
// 思考折叠预览（单行，CSS 省略号截断）
const thinkPreview = (b: any) => (b.text || '').replace(/\s+/g, ' ').trim()
// 思考 / 工具调用 折叠头的开合 key 与状态
const headKey = (it: any) => (it.block.kind === 'thinking' ? 't' : 'tu') + it.index
const headOpen = (it: any) => isOpen(headKey(it))
const toggleHead = (it: any) => toggle(headKey(it))
// Edit 工具：含 old_string/new_string，按 git 风格展示文本变更
const hasDiff = (b: any) => b && b.name === 'Edit' && b.input &&
  typeof b.input.old_string === 'string' && typeof b.input.new_string === 'string'
// 基于 LCS 的逐行 diff：返回 { t: 'add'|'del'|'ctx', text } 列表
const lineDiff = (oldStr: string, newStr: string) => {
  const a = (oldStr || '').split('\n')
  const b = (newStr || '').split('\n')
  const m = a.length; const n = b.length
  // 大输入回退：避免 O(m*n) 过大，退化为「整段删除 + 整段新增」
  if (m * n > 200000) {
    return [...a.map((t) => ({ t: 'del', text: t })), ...b.map((t) => ({ t: 'add', text: t }))]
  }
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const out: { t: string; text: string }[] = []
  let i = 0; let j = 0
  while (i < m && j < n) {
    if (a[i] === b[j]) { out.push({ t: 'ctx', text: a[i] }); i++; j++ } else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ t: 'del', text: a[i] }); i++ } else { out.push({ t: 'add', text: b[j] }); j++ }
  }
  while (i < m) { out.push({ t: 'del', text: a[i] }); i++ }
  while (j < n) { out.push({ t: 'add', text: b[j] }); j++ }
  return out
}

// ---- 选择与详情加载 ----
const isNearBottom = () => {
  const el = scrollEl.value
  if (!el) return true
  return el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX
}
const scrollToBottom = (smooth = false) => {
  const el = scrollEl.value
  if (el) {
    // 用户点击「回到底部」平滑滚动；轮询自动跟随用瞬时，避免与流式刷新互相打架
    if (smooth && el.scrollTo) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    else el.scrollTop = el.scrollHeight
  }
  showJumpBottom.value = false
  markSeen()
}
// 到达底部：清除新消息提示，并把当前提问数记为已读基线
const markSeen = () => {
  hasNew.value = false
  newCount.value = 0
  seenQCount = userQuestions.value.length
}
// 按钮文案：未读则提示新提问数（无新提问时仅「有新消息」），否则「回到底部」
const jumpLabel = computed(() => {
  if (!hasNew.value) return '回到底部'
  return newCount.value > 0 ? `${newCount.value} 条新提问` : '有新消息'
})
// 不在底部时常驻显示「滚动到底部」按钮，贴底时隐藏；随滚动实时更新
const updateJumpBtn = () => {
  const el = scrollEl.value
  const away = !!el && (el.scrollHeight - el.scrollTop - el.clientHeight > NEAR_BOTTOM_PX)
  showJumpBottom.value = away
  if (!away) markSeen() // 滚到底即视为新消息已读
}
// 显式跳转期间锁定 scrollspy，跳转动画结束(滚动停止)后才恢复，避免覆盖用户刚选定的序号
let spySuppressed = false
let spyTimer = 0
const armSpySuppress = () => {
  spySuppressed = true
  if (spyTimer) clearTimeout(spyTimer)
  spyTimer = window.setTimeout(() => { spySuppressed = false }, 200)
}
// scrollspy：按滚动位置反推当前命中的提问，驱动顶部计数与左侧高亮跟随
const updateActiveQuestion = () => {
  const el = scrollEl.value
  const qs = userQuestions.value
  if (!el || !qs.length) return
  // 已滚到底部：直接高亮最后一条（末尾几条无法顶到视口顶，按判定线会偏前一位）
  if (el.scrollTop > 0 && el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX) {
    if (curQ.value !== qs.length - 1) curQ.value = qs.length - 1
    return
  }
  const line = el.getBoundingClientRect().top + 8 // 容差，与点击定位 block:'start' 对齐
  let active = 0
  for (let i = 0; i < qs.length; i++) {
    const bEl = blockEls[qs[i].index]
    if (!bEl) continue
    if (bEl.getBoundingClientRect().top <= line) active = i
    else break // 提问按先后排列，一旦越过判定线，后续必然更靠下
  }
  if (curQ.value !== active) curQ.value = active
}
let spyRaf = 0
const onDetailScroll = () => {
  updateJumpBtn()
  if (spySuppressed) { armSpySuppress(); return } // 跳转动画持续期间不断续期，停止后才放行
  if (spyRaf) return
  spyRaf = requestAnimationFrame(() => { spyRaf = 0; updateActiveQuestion() })
}
const sessionSig = (s: any) => {
  try {
    const st = window.services.statSession(props.project.dirName, s.sessionId)
    return st ? st.mtime + ':' + st.size : ''
  } catch (_) { return '' }
}
// 轮询触发：文件变化才重读，贴底则跟随到底，否则提示有新内容
const refreshSession = () => {
  const s = selectedSession.value
  if (!s || detailLoading.value) return
  const sig = sessionSig(s)
  if (!sig || sig === lastSig) return
  const wasNearBottom = isNearBottom()
  try {
    const next = window.services.readSession(props.project.dirName, s.sessionId)
    if (next) { sessionDetail.value = next; lastSig = sig }
  } catch (_) { return }
  nextTick(() => {
    if (wasNearBottom) { scrollToBottom() }
    else {
      // 在上方翻看 → 标记有未读，并按基线算出新增了几条提问
      updateJumpBtn()
      hasNew.value = true
      newCount.value = Math.max(0, userQuestions.value.length - seenQCount)
    }
  })
}
const stopPoll = () => {
  if (pollTimer !== null) { clearInterval(pollTimer); pollTimer = null }
}
const startPoll = () => {
  stopPoll()
  if (autoRefresh.value && selected.value && selected.value.type === 'session') {
    pollTimer = window.setInterval(refreshSession, POLL_MS)
  }
}
const toggleAutoRefresh = () => {
  autoRefresh.value = !autoRefresh.value
  if (autoRefresh.value) { startPoll(); refreshSession() } else stopPoll()
}

const selectMemory = (m: any) => {
  stopPoll()
  mdCache.clear()
  selected.value = { type: 'memory', id: m.fileName }
  sessionDetail.value = null
  selectedSession.value = null
  memoryDetail.value = window.services.readMemory(props.project.dirName, m.fileName)
}

const selectSession = (s: any) => {
  selected.value = { type: 'session', id: s.sessionId }
  memoryDetail.value = null
  selectedSession.value = s
  detailLoading.value = true
  showQuestions.value = false
  showJumpBottom.value = false
  hasNew.value = false
  newCount.value = 0
  curQ.value = 0
  highlightIdx.value = -1
  resetFilters()
  stopPoll()
  mdCache.clear()
  lastSig = ''
  for (const k in blockEls) delete blockEls[k]
  setTimeout(() => {
    try {
      sessionDetail.value = window.services.readSession(props.project.dirName, s.sessionId)
      lastSig = sessionSig(s)
    } catch (err: any) {
      error.value = err && err.message ? err.message : String(err)
    } finally {
      detailLoading.value = false
      startPoll()
      // 打开会话停在顶部，按当前位置决定是否显示「滚动到底部」按钮
      nextTick(() => {
        const el = scrollEl.value
        if (el) el.scrollTop = 0
        updateJumpBtn()
        seenQCount = userQuestions.value.length // 打开时已有的提问视为已读，仅后续流入计入新提问
      })
    }
  }, 0)
}

const selectItem = (item: any) => {
  if (item.type === 'memory') selectMemory(item.raw)
  else selectSession(item.raw)
}

const isActive = (type: string, id: string) =>
  selected.value && selected.value.type === type && selected.value.id === id

const selectedMemoryType = computed(() =>
  memoryDetail.value?.frontmatter?.metadata?.type || '')

const originSessionExists = computed(() => {
  const oid = memoryDetail.value?.frontmatter?.metadata?.originSessionId
  return oid && sessions.value.some((s) => s.sessionId === oid)
})
const gotoOriginSession = () => {
  const oid = memoryDetail.value?.frontmatter?.metadata?.originSessionId
  const s = sessions.value.find((x) => x.sessionId === oid)
  if (s) selectSession(s)
}

// ---- 终端 / 恢复 / 导出 ----
const showToast = (msg: string) => {
  toast.value = msg
  setTimeout(() => { if (toast.value === msg) toast.value = '' }, 2000)
}

const openTerminal = () => {
  const p = props.project
  if (!p || !p.available) { error.value = '项目工作目录不存在，无法打开终端'; return }
  error.value = ''
  const settings = window.services.getLauncherSettings()
  const r = window.services.launchProject(p.cwd, settings.launchCommand, {
    powershellPath: settings.powershellPath,
    terminalType: settings.terminalType
  })
  if (r && r.success) {
    window.services.saveLastProjectDir(p.cwd)
    window.utools.outPlugin()
  } else {
    error.value = (r && r.error) || '终端打开失败'
  }
}

const doResume = () => {
  if (!selectedSession.value) return
  error.value = ''
  const r = window.services.resumeSession(props.project.cwd, selectedSession.value.sessionId)
  if (r && r.success) window.utools.outPlugin()
  else error.value = (r && r.error) || '恢复失败'
}

const showExport = ref(false)
const safeFileBase = () => {
  const s = selectedSession.value
  return (((s && (s.title || s.sessionId)) || 'session') as string).replace(/[\\/:*?"<>|]/g, '_').slice(0, 60)
}

const doExportMd = () => {
  showExport.value = false
  if (!selectedSession.value) return
  const target = window.utools.showSaveDialog({
    title: '导出为 Markdown',
    defaultPath: safeFileBase() + '.md',
    filters: [{ name: 'Markdown', extensions: ['md'] }]
  })
  if (!target) return
  const r = window.services.exportSessionToFile(props.project.dirName, selectedSession.value.sessionId, target)
  if (r && r.success) showToast('已导出 Markdown')
  else error.value = (r && r.error) || '导出失败'
}

// 收集页面全部 CSS，使导出的 HTML 与详情页样式一致
const collectCss = () => {
  let css = ''
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from((sheet as CSSStyleSheet).cssRules)) css += rule.cssText + '\n'
    } catch (_) { /* 跨域样式跳过 */ }
  }
  return css
}

const doExportHtml = async () => {
  showExport.value = false
  if (!selectedSession.value) return
  const target = window.utools.showSaveDialog({
    title: '导出为 HTML',
    defaultPath: safeFileBase() + '.html',
    filters: [{ name: 'HTML', extensions: ['html'] }]
  })
  if (!target) return
  // 临时全部展开后截取实际渲染的 DOM，保证内容完整且效果与详情页一致
  forceExpand.value = true
  await nextTick()
  const chat = document.querySelector('.ph-detail-scroll .ph-chat')
  const inner = chat ? chat.outerHTML : ''
  forceExpand.value = false
  const title = String((selectedSession.value.title || selectedSession.value.sessionId) || '会话记录')
  const html = `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
${collectCss()}
body { margin: 0; background: var(--card-bg); color: var(--text-primary); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif; }
.ph-export { max-width: 920px; margin: 0 auto; padding: 24px 20px; }
.ph-export-title { font-size: 18px; margin: 0 0 18px; }
.ph-export .tool-caret, .ph-export .ph-chip-eye { display: none; }
</style>
</head>
<body>
<div class="ph-export">
<h1 class="ph-export-title">${escapeHtml(title)}</h1>
${inner}
</div>
</body>
</html>`
  const r = window.services.writeTextFile(target, html)
  if (r && r.success) showToast('已导出 HTML')
  else error.value = (r && r.error) || '导出失败'
}

// ---- 键盘 ----
const onKeydown = (e: KeyboardEvent) => {
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

onMounted(() => {
  load()
  window.addEventListener('keydown', onKeydown)
})
onUnmounted(() => { window.removeEventListener('keydown', onKeydown); stopPoll() })
watch(() => props.project, load)
</script>

<template>
  <div class="ph">
    <!-- 顶部：项目信息栏 -->
    <header class="ph-topbar">
      <button class="ph-back" title="返回 (Esc)" @click="emit('back')">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
          stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6" /></svg>
      </button>
      <div class="ph-proj">
        <div class="ph-proj-name">
          <span class="ph-proj-name-text">{{ project && project.displayName }}</span>
          <span
            v-if="project && project.branch"
            class="launcher-badge launcher-badge-branch"
            :title="'当前分支：' + project.branch"
          >
            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="6" cy="6" r="2.4" />
              <circle cx="6" cy="18" r="2.4" />
              <circle cx="18" cy="8" r="2.4" />
              <path d="M6 8.4v7.2M18 10.4c0 4-3.5 4.6-6 5" />
            </svg>
            {{ project.branch }}
          </span>
        </div>
        <div class="ph-proj-path">{{ project && (project.cwd || project.dirName) }}</div>
      </div>
      <button class="ph-terminal" :disabled="project && !project.available"
        title="在终端打开该项目" @click="openTerminal">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
          stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m4 17 6-6-6-6" /><path d="M12 19h8" />
        </svg>
        <span>终端</span>
      </button>
    </header>

    <div v-if="error" class="ph-error">{{ error }}</div>

    <!-- 下方：左右布局 -->
    <div class="ph-main">
      <!-- 左侧列表 -->
      <aside class="ph-left">
        <div v-if="filteredMemories.length" class="ph-group">
          <div class="ph-group-title">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
            <span>记忆</span>
            <span class="ph-group-count">{{ filteredMemories.length }}</span>
          </div>
          <div
            v-for="m in filteredMemories"
            :key="'m-' + m.fileName"
            class="ph-item"
            :class="{ active: isActive('memory', m.fileName) }"
            @click="selectMemory(m)"
          >
            <span class="ph-tag" :data-type="m.type">{{ memTypeLabel(m.type) }}</span>
            <span class="ph-item-title">{{ m.description || m.name }}</span>
          </div>
        </div>

        <div v-if="filteredSessions.length" class="ph-group">
          <div class="ph-group-title">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
            <span>历史会话</span>
            <span class="ph-group-count">{{ filteredSessions.length }}</span>
          </div>
          <div
            v-for="s in filteredSessions"
            :key="'s-' + s.sessionId"
            class="ph-item ph-item-session"
            :class="{ active: isActive('session', s.sessionId) }"
            @click="selectSession(s)"
          >
            <div class="ph-item-title">{{ s.title || '(无标题会话)' }}</div>
            <div class="ph-item-sub">
              <span>{{ formatTime(s.mtime) }}</span>
              <span v-if="s.size" class="ph-size">{{ formatSize(s.size) }}</span>
            </div>
          </div>
        </div>

        <div v-if="!filteredMemories.length && !filteredSessions.length" class="ph-empty-left">
          {{ filter ? '没有匹配的内容' : '该项目暂无记忆或历史会话' }}
        </div>
      </aside>

      <!-- 右侧详情 -->
      <section class="ph-right">
        <div v-if="!selected" class="ph-placeholder">从左侧选择一条记忆或历史会话查看</div>

        <!-- 记忆详情 -->
        <template v-else-if="selected.type === 'memory'">
          <div class="ph-detail-head">
            <div class="ph-detail-titlewrap">
              <div class="ph-detail-title">{{ memoryDetail && (memoryDetail.frontmatter.description || memoryDetail.frontmatter.name) }}</div>
              <div class="ph-detail-meta">
                <span class="ph-tag" :data-type="selectedMemoryType">{{ memTypeLabel(selectedMemoryType) }}</span>
                <span v-if="memoryDetail && memoryDetail.frontmatter.name" class="mem-slug">{{ memoryDetail.frontmatter.name }}</span>
              </div>
            </div>
            <button v-if="originSessionExists" class="ph-act-icon" title="跳转到该记忆的来源会话" @click="gotoOriginSession">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7" /><path d="M7 7h10v10" /></svg>
              来源会话
            </button>
          </div>
          <div class="ph-detail-scroll">
            <div v-if="memoryDetail" class="mem-card" :class="'mem-' + (selectedMemoryType || 'default')">
              <div class="ph-md mem-body" v-html="renderMarkdown(memoryDetail.body)"></div>
            </div>
            <div v-else class="ph-placeholder">记忆读取失败</div>
          </div>
        </template>

        <!-- 会话详情 -->
        <template v-else>
          <div class="ph-detail-head">
            <div class="ph-detail-titlewrap">
              <div class="ph-detail-title">{{ selectedSession && (selectedSession.title || selectedSession.sessionId) }}</div>
              <div v-if="sessionDetail && sessionDetail.meta" class="ph-detail-meta">
                <span v-if="sessionDetail.meta.gitBranch">⎇ {{ sessionDetail.meta.gitBranch }}</span>
                <span v-if="sessionDetail.meta.version">v{{ sessionDetail.meta.version }}</span>
                <span v-if="sessionDetail.meta.count">{{ sessionDetail.meta.count }} 条</span>
                <span v-if="selectedSession && selectedSession.size">{{ formatSize(selectedSession.size) }}</span>
              </div>
            </div>
            <div class="ph-actions">
              <button
                class="ph-act-live"
                :class="{ on: autoRefresh }"
                :title="autoRefresh ? '实时刷新中，有更新自动跟随，点击暂停' : '已暂停，点击开启实时刷新'"
                @click="toggleAutoRefresh"
              >
                <span class="ph-live-dot"></span>
                {{ autoRefresh ? '实时' : '暂停' }}
              </button>
              <button class="ph-act-term" title="在终端恢复此会话" @click="doResume">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m4 17 6-6-6-6" /><path d="M12 19h8" /></svg>
                恢复会话
              </button>
              <div class="ph-export-wrap">
                <button class="ph-act-icon" :class="{ on: showExport }" title="导出会话" @click="showExport = !showExport">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></svg>
                  导出
                  <svg class="ph-export-caret" :class="{ open: showExport }" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                </button>
                <div v-if="showExport" class="ph-export-backdrop" @click="showExport = false"></div>
                <div v-if="showExport" class="ph-export-menu">
                  <button class="ph-export-item" @click="doExportMd"><span class="ph-export-fmt">MD</span> 导出为 Markdown</button>
                  <button class="ph-export-item" @click="doExportHtml"><span class="ph-export-fmt">HTML</span> 导出为 HTML</button>
                </div>
              </div>
            </div>
          </div>

          <div v-if="sessionDetail && filterChips.length" class="ph-filterbar">
            <div class="ph-chips">
              <button
                v-for="k in filterChips"
                :key="k"
                class="ph-chip"
                :class="[kindMeta(k).cls, { off: !chipVisible(k), 'is-user': k === 'user' }]"
                :title="k === 'user' ? '查看我的提问' : (visibleKinds[k] ? '点击隐藏' : '点击显示')"
                @click="onChipClick(k)"
              >
                <span class="ph-chip-n">
                  <template v-if="k === 'user'">{{ curQ + 1 }}/{{ userQuestions.length }}</template>
                  <template v-else>{{ kindCounts[k] }}</template>
                </span>
                <span class="ph-chip-label">{{ kindMeta(k).label }}</span>
                <template v-if="k !== 'user'">
                  <svg v-if="visibleKinds[k]" class="ph-chip-eye" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>
                  <svg v-else class="ph-chip-eye" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 7 10 7a13.2 13.2 0 0 1-1.67 2.68" /><path d="M6.61 6.61A13.5 13.5 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.39-1.61" /><line x1="2" y1="2" x2="22" y2="22" /></svg>
                </template>
              </button>
            </div>
            <div v-if="userQuestions.length" class="ph-qnav">
              <button class="ph-qbtn" title="上一个提问" @click="jumpToQuestion(curQ - 1)">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6" /></svg>
              </button>
              <button class="ph-qbtn" title="下一个提问" @click="jumpToQuestion(curQ + 1)">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg>
              </button>
            </div>

            <div v-if="showQuestions" class="ph-qbackdrop" @click="showQuestions = false"></div>
            <div v-if="showQuestions" class="ph-qpanel">
              <div class="ph-qpanel-title">我的提问 · {{ userQuestions.length }}</div>
              <div class="ph-qpanel-list">
                <div
                  v-for="(q, n) in userQuestions"
                  :key="q.index"
                  class="ph-qitem"
                  :class="{ active: n === curQ }"
                  @click="openQuestion(q, n)"
                >
                  <span class="ph-qnum">{{ n + 1 }}</span>
                  <div class="ph-qbody">
                    <div class="ph-qtext">{{ previewText(q.text) }}</div>
                    <div v-if="fmtDateTime(q.ts)" class="ph-qtime">{{ fmtDateTime(q.ts) }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div ref="scrollEl" class="ph-detail-scroll" @scroll="onDetailScroll">
            <div v-if="detailLoading" class="ph-placeholder">解析会话中…</div>

            <div v-else-if="sessionDetail" class="ph-chat">
              <template v-for="(t, ti) in turns" :key="ti">
                <!-- 用户提问卡片 -->
                <div
                  v-if="t.type === 'user' && visibleKinds.user"
                  :ref="(el) => setBlockRef(el, t.index)"
                  class="chat-user"
                  :class="{ 'blk-flash': highlightIdx === t.index }"
                >
                  <span class="chat-ava chat-ava-user">我</span>
                  <div class="chat-col">
                    <div class="chat-head">
                      <span class="chat-name chat-name-user">用户</span>
                      <span v-if="fmtDateTime(t.block.ts)" class="chat-headmeta">{{ fmtDateTime(t.block.ts) }}</span>
                    </div>
                    <div v-if="t.block.command" class="chat-bubble-user chat-bubble-cmd">
                      <div class="cmd-name">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m4 17 6-6-6-6" /><path d="M12 19h8" /></svg>
                        {{ t.block.command.name }}
                      </div>
                      <div v-if="t.block.command.args" class="cmd-args">{{ t.block.command.args }}</div>
                    </div>
                    <div v-else class="chat-bubble-user ph-md" v-html="renderMarkdown(cleanInterrupt(t.block.text))"></div>
                  </div>
                </div>

                <!-- 用户取消通知（非对话气泡形式） -->
                <div
                  v-else-if="t.type === 'notice'"
                  :ref="(el) => setBlockRef(el, t.index)"
                  class="chat-notice"
                  :class="{ 'blk-flash': highlightIdx === t.index }"
                >
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><path d="m5.6 5.6 12.8 12.8" /></svg>
                  <span>{{ interruptLabel(t.block.text) }}</span>
                </div>

                <!-- Claude 回复（对话框形式，与用户一致：头像 + 气泡） -->
                <div v-else-if="t.type === 'claude' && claudeVisible(t)" class="chat-claude">
                  <span class="chat-ava chat-ava-ai">AI</span>
                  <div class="chat-col">
                    <div class="chat-head">
                      <span class="chat-name chat-name-ai">Claude</span>
                      <span v-if="claudeHeadMeta(t.meta)" class="chat-headmeta" :title="claudeHeadTitle(t.meta)">{{ claudeHeadMeta(t.meta) }}</span>
                    </div>
                    <div class="chat-bubble-claude">
                    <template v-for="it in t.items" :key="it.index">
                      <!-- 助手正文：主回复，无标签 -->
                      <div
                        v-if="it.block.kind === 'assistant' && visibleKinds.assistant"
                        :ref="(el) => setBlockRef(el, it.index)"
                        class="sub-text ph-md"
                        :class="{ 'blk-flash': highlightIdx === it.index }"
                        v-html="renderMarkdown(it.block.text)"
                      ></div>

                      <!-- 其它类型：带类型标签的小卡 -->
                      <div
                        v-else-if="it.block.kind !== 'assistant' && visibleKinds[it.block.kind]"
                        :ref="(el) => setBlockRef(el, it.index)"
                        class="sub"
                        :class="[kindMeta(it.block.kind).cls, {
                          'blk-flash': highlightIdx === it.index,
                          'tool-error': it.block.kind === 'tool_use' && it.block.result && it.block.result.isError
                        }]"
                      >
                        <div
                          class="sub-head"
                          :class="{ 'tool-head': it.block.kind === 'tool_use' || it.block.kind === 'thinking' }"
                          @click="(it.block.kind === 'tool_use' || it.block.kind === 'thinking') ? toggleHead(it) : null"
                        >
                          <span class="sub-tag">{{ kindMeta(it.block.kind).label }}</span>
                          <span v-if="it.block.kind === 'tool_use'" class="blk-toolname">{{ it.block.name }}</span>
                          <span v-if="it.block.kind === 'tool_use'" class="tool-line-text">{{ toolDesc(it.block) }}</span>
                          <span v-else-if="it.block.kind === 'thinking'" class="tool-line-text">{{ thinkPreview(it.block) }}</span>
                          <span v-if="it.block.sidechain" class="blk-side">子任务</span>
                          <svg v-if="it.block.kind === 'tool_use' || it.block.kind === 'thinking'" class="tool-caret" :class="{ open: headOpen(it) }" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                        </div>

                        <!-- 思考：默认折叠（头部一行预览），展开看全文 -->
                        <template v-if="it.block.kind === 'thinking'">
                          <pre v-if="isOpen('t' + it.index)" class="blk-pre think-pre">{{ it.block.text }}</pre>
                        </template>

                        <!-- 工具调用：展开后依次显示 描述 / 命令 / 结果 -->
                        <template v-else-if="it.block.kind === 'tool_use'">
                          <div v-if="isOpen('tu' + it.index)" class="tool-detail">
                            <div v-if="it.block.input && it.block.input.description" class="tool-sec">
                              <span class="tool-sec-label">描述</span>
                              <div class="tool-sec-text">{{ it.block.input.description }}</div>
                            </div>
                            <div v-if="hasDiff(it.block)" class="tool-sec">
                              <span class="tool-sec-label">变更</span>
                              <div class="diff">
                                <div
                                  v-for="(ln, k) in lineDiff(it.block.input.old_string, it.block.input.new_string)"
                                  :key="k"
                                  class="diff-line"
                                  :class="'diff-' + ln.t"
                                ><span class="diff-sign">{{ ln.t === 'add' ? '+' : (ln.t === 'del' ? '−' : '') }}</span><span class="diff-text">{{ ln.text }}</span></div>
                              </div>
                            </div>
                            <div v-else-if="toolCommand(it.block)" class="tool-sec">
                              <span class="tool-sec-label">命令</span>
                              <pre class="blk-pre">{{ toolCommand(it.block) }}</pre>
                            </div>
                            <div v-else-if="it.block.input" class="tool-sec">
                              <span class="tool-sec-label">参数</span>
                              <pre class="blk-pre">{{ stringifyInput(it.block.input) }}</pre>
                            </div>
                            <div v-if="it.block.result" class="tool-sec">
                              <span class="tool-sec-label">{{ it.block.result.isError ? '结果（错误）' : '结果' }}</span>
                              <pre class="blk-pre" :class="{ 'pre-err': it.block.result.isError }">{{ it.block.result.text }}</pre>
                            </div>
                          </div>
                        </template>

                        <!-- 未配对工具结果 -->
                        <template v-else-if="it.block.kind === 'tool_result'">
                          <pre v-if="!big(it.block.text) || isOpen('tr' + it.index)" class="blk-pre">{{ it.block.text }}</pre>
                          <div v-if="big(it.block.text)" class="blk-toggle" @click="toggle('tr' + it.index)">{{ isOpen('tr' + it.index) ? '收起' : '展开全部' }}</div>
                        </template>

                        <!-- 附件 -->
                        <div v-else-if="it.block.kind === 'attachment'" class="blk-attach">
                          <code class="blk-attach-sub">{{ it.block.subtype }}</code>
                          <template v-if="it.block.text">
                            <pre v-if="!big(it.block.text) || isOpen('at' + it.index)" class="blk-pre">{{ it.block.text }}</pre>
                            <span v-if="big(it.block.text)" class="blk-toggle" @click="toggle('at' + it.index)">{{ isOpen('at' + it.index) ? '收起' : '展开' }}</span>
                          </template>
                        </div>

                        <!-- 系统 -->
                        <div v-else class="blk-sys-text">{{ it.block.text }}</div>
                      </div>
                    </template>
                    </div>
                  </div>
                </div>
              </template>
            </div>

            <div v-else class="ph-placeholder">会话读取失败</div>
          </div>

          <button
            v-if="showJumpBottom"
            class="ph-jump-bottom"
            :class="{ 'has-new': hasNew }"
            :title="hasNew ? jumpLabel + '，点击查看最新' : '滚动到底部'"
            @click="scrollToBottom(true)"
          >
            <svg class="ph-jump-arrow" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 6 5 5 5-5" /><path d="m7 13 5 5 5-5" /></svg>
            <span class="ph-jump-text">{{ jumpLabel }}</span>
          </button>
        </template>
      </section>
    </div>

    <div v-if="toast" class="ph-toast">{{ toast }}</div>
  </div>
</template>

<style>
.ph {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  box-sizing: border-box;
}

/* ===== 顶部项目信息栏 ===== */
.ph-topbar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-color);
  background: var(--card-bg);
}
.ph-back {
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-hover);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}
.ph-back:hover { background: var(--primary-color); border-color: var(--primary-color); color: #fff; }
.ph-proj { flex: 1 1 auto; min-width: 0; }
.ph-proj-name { display: flex; align-items: center; min-width: 0; }
.ph-proj-name-text { min-width: 0; font-weight: 600; font-size: 14px; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ph-proj-path { font-size: 12px; color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 1px; }
.ph-terminal {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 11px;
  border: 1px solid #3a3f4b;
  border-radius: 6px;
  background: #1e2128;
  color: #4ec9b0;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s ease;
}
.ph-terminal:hover { background: #2b2f38; }
.ph-terminal:disabled { opacity: 0.45; cursor: not-allowed; }

.ph-error { flex: 0 0 auto; color: #e53935; font-size: 13px; padding: 6px 14px; }

/* ===== 下方左右布局 ===== */
.ph-main { flex: 1 1 auto; display: flex; overflow: hidden; }

/* 左侧列表 */
.ph-left {
  flex: 0 0 270px;
  width: 270px;
  overflow-y: auto;
  border-right: 1px solid var(--border-color);
  padding: 8px;
}
.ph-group { margin-bottom: 8px; }
.ph-group-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
  padding: 9px 6px 7px;
  position: sticky;
  top: 0;
  background: var(--card-bg);
  z-index: 1;
}
.ph-group-title svg { color: var(--primary-color); flex: 0 0 auto; }
.ph-group-count {
  margin-left: auto;
  font-size: 11px; font-weight: 700;
  min-width: 18px; text-align: center;
  padding: 1px 7px; border-radius: 9px;
  background: var(--bg-hover); color: var(--text-tertiary);
}
.ph-item {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 9px;
  border-radius: 7px;
  cursor: pointer;
  font-size: 13px;
  border: 1px solid transparent;
}
.ph-item:hover { background: #2b2b2b; border-color: #2b2b2b; }
.ph-item.active,
.ph-item.active:hover {
  background: var(--primary-color);
  border-color: var(--primary-color);
}
.ph-item:hover .ph-item-title,
.ph-item.active .ph-item-title { color: #fff; }
.ph-item:hover .ph-item-sub,
.ph-item.active .ph-item-sub { color: rgba(255, 255, 255, 0.85); }
.ph-item-session { display: block; }
.ph-item-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-primary); }
.ph-item-session .ph-item-title { white-space: normal; line-height: 1.35; font-weight: 500; }
.ph-item-sub {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--text-tertiary);
  margin-top: 4px;
}
.ph-size {
  padding: 0 5px;
  border-radius: 3px;
  background: var(--bg-hover);
  border: 1px solid var(--border-color);
}
.ph-item:hover .ph-size,
.ph-item.active .ph-size { background: rgba(255, 255, 255, 0.18); border-color: transparent; color: #fff; }

.ph-empty-left { padding: 30px 12px; text-align: center; font-size: 13px; color: var(--text-tertiary); }

/* 类型标签（记忆） */
.ph-tag {
  flex: 0 0 auto;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  background: #e6e8ec;
  color: #5a6470;
  white-space: nowrap;
}
.ph-tag[data-type="feedback"] { background: #fff0d9; color: #b06f06; }
.ph-tag[data-type="user"] { background: #e2edff; color: #2563d6; }
.ph-tag[data-type="project"] { background: #def5e6; color: #1d8a4c; }
.ph-tag[data-type="reference"] { background: #f0e2fd; color: #7c39c4; }

/* ===== 右侧详情 ===== */
.ph-right { flex: 1 1 auto; display: flex; flex-direction: column; overflow: hidden; position: relative; }
.ph-placeholder { margin: 60px auto 0; text-align: center; color: var(--text-tertiary); font-size: 14px; }

/* 详情标题固定顶部 */
.ph-detail-head {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  background: var(--card-bg);
  position: relative;
}

/* 我的提问导航：上下箭头分段控件 */
.ph-qnav {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
  background: var(--card-bg);
}
.ph-qbtn {
  width: 28px; height: 24px;
  display: flex; align-items: center; justify-content: center;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.12s ease;
}
.ph-qbtn:first-child { border-right: 1px solid var(--border-color); }
.ph-qbtn:hover { background: var(--primary-color); color: #fff; }
.ph-qlabel {
  height: 26px; padding: 0 10px;
  border: 1px solid var(--primary-color); border-radius: 6px;
  background: var(--card-bg); color: var(--primary-color);
  font-size: 12px; cursor: pointer; white-space: nowrap;
}
.ph-qlabel:hover, .ph-qlabel.on { background: var(--primary-color); color: #fff; }

.ph-qbackdrop { position: fixed; inset: 0; z-index: 1500; }
.ph-qpanel {
  position: absolute;
  top: calc(100% + 4px);
  left: 16px;
  right: auto;
  z-index: 1600;
  width: 320px;
  max-height: 60vh;
  display: flex;
  flex-direction: column;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-top: 3px solid var(--primary-color);
  border-radius: 10px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.18);
  overflow: hidden;
}
.ph-qpanel-title {
  flex: 0 0 auto;
  padding: 10px 14px;
  font-size: 12px; font-weight: 600; color: var(--text-secondary);
  border-bottom: 1px solid var(--border-color);
}
.ph-qpanel-list { flex: 1 1 auto; overflow-y: auto; padding: 6px; }
.ph-qitem {
  display: flex; align-items: flex-start; gap: 8px;
  padding: 8px 9px; border-radius: 7px; cursor: pointer; font-size: 13px;
  color: var(--text-primary);
}
.ph-qitem:hover { background: var(--bg-hover); }
.ph-qitem.active { background: #eef4ff; }
.ph-qnum {
  flex: 0 0 auto;
  min-width: 18px; height: 18px; padding: 0 4px;
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--primary-color); color: #fff;
  font-size: 11px; font-weight: 700; border-radius: 5px; margin-top: 1px;
}
.ph-qbody { flex: 1 1 auto; min-width: 0; }
.ph-qtext { line-height: 1.4; word-break: break-word; }
.ph-qtime { margin-top: 3px; font-size: 11px; color: var(--text-tertiary); font-variant-numeric: tabular-nums; }
.ph-detail-titlewrap { flex: 1 1 auto; min-width: 0; }
.ph-detail-title { font-weight: 600; font-size: 14px; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ph-detail-meta { display: flex; gap: 10px; font-size: 11px; color: var(--text-tertiary); margin-top: 3px; }
.ph-link-btn {
  margin-left: auto; flex: 0 0 auto;
  font-size: 12px; background: none;
  border: 1px solid var(--border-color); border-radius: 6px;
  padding: 4px 9px; cursor: pointer; color: var(--primary-color);
}
.ph-link-btn:hover { background: var(--bg-hover); }

.ph-actions { flex: 0 0 auto; display: flex; gap: 6px; }
.ph-act-term {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 5px 12px; border-radius: 6px;
  border: 1px solid #3a3f4b; background: #1e2128; color: #4ec9b0;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 12px; cursor: pointer; transition: background 0.15s ease;
}
.ph-act-term:hover { background: #2b2f38; }
.ph-act-icon {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 5px 10px; border-radius: 6px;
  border: 1px solid var(--border-color); background: var(--card-bg); color: var(--text-secondary);
  font-size: 12px; cursor: pointer; transition: all 0.15s ease;
}
.ph-act-icon:hover, .ph-act-icon.on { background: var(--bg-hover); color: var(--primary-color); border-color: var(--primary-color); }

/* 实时刷新开关 */
.ph-act-live {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 5px 11px; border-radius: 6px;
  border: 1px solid var(--border-color); background: var(--card-bg); color: var(--text-secondary);
  font-size: 12px; cursor: pointer; transition: all 0.15s ease;
}
.ph-act-live:hover { background: var(--bg-hover); }
.ph-act-live.on { color: #20bf6b; border-color: rgba(32, 191, 107, 0.5); }
.ph-live-dot { flex: 0 0 auto; width: 7px; height: 7px; border-radius: 50%; background: var(--text-tertiary); }
.ph-act-live.on .ph-live-dot { background: #20bf6b; animation: ph-live-pulse 1.6s ease-in-out infinite; }
@keyframes ph-live-pulse {
  0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(32, 191, 107, 0.5); }
  50% { opacity: 0.55; box-shadow: 0 0 0 4px rgba(32, 191, 107, 0); }
}

/* 回底浮动按钮（底部居中胶囊）：空闲态中性玻璃幽灵，有新消息态绿色高亮 */
.ph-jump-bottom {
  position: absolute; left: 50%; bottom: 18px;
  transform: translateX(-50%);
  z-index: 20;
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 14px;
  border: 1px solid var(--border-color); border-radius: 999px; cursor: pointer;
  background: rgba(255, 255, 255, 0.6);
  -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);
  color: var(--text-secondary);
  font-size: 12.5px; line-height: 1; white-space: nowrap;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);
  transition: color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
}
.ph-jump-bottom:hover { color: var(--text-primary); box-shadow: 0 3px 12px rgba(0, 0, 0, 0.12); }
.ph-jump-arrow { display: block; transition: transform 0.18s ease; }
.ph-jump-bottom:hover .ph-jump-arrow { transform: translateY(2px); }
.ph-jump-text { font-weight: 500; }

/* 有新消息：绿色高亮 + 轻微脉冲 */
.ph-jump-bottom.has-new {
  border-color: transparent;
  background: #22c55e; color: #fff;
  box-shadow: 0 4px 14px rgba(34, 197, 94, 0.38);
  animation: ph-jump-pulse 1.8s ease-in-out infinite;
}
.ph-jump-bottom.has-new:hover {
  color: #fff; background: #1eb853;
  box-shadow: 0 5px 16px rgba(34, 197, 94, 0.45);
}
@keyframes ph-jump-pulse {
  0%, 100% { box-shadow: 0 4px 14px rgba(34, 197, 94, 0.38); }
  50% { box-shadow: 0 4px 14px rgba(34, 197, 94, 0.38), 0 0 0 5px rgba(34, 197, 94, 0.16); }
}

/* 导出浮动下拉 */
.ph-export-wrap { position: relative; flex: 0 0 auto; }
.ph-export-caret { transition: transform 0.15s ease; }
.ph-export-caret.open { transform: rotate(180deg); }
.ph-export-backdrop { position: fixed; inset: 0; z-index: 1500; }
.ph-export-menu {
  position: absolute; top: calc(100% + 5px); right: 0; z-index: 1600;
  min-width: 168px;
  display: flex; flex-direction: column; gap: 2px;
  padding: 5px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 9px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
}
.ph-export-item {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 9px; border: none; border-radius: 6px;
  background: transparent; color: var(--text-primary);
  font-size: 12.5px; text-align: left; cursor: pointer;
}
.ph-export-item:hover { background: var(--bg-hover); }
.ph-export-fmt {
  flex: 0 0 auto;
  font-size: 9.5px; font-weight: 700; letter-spacing: 0.5px;
  padding: 1px 5px; border-radius: 4px;
  background: var(--primary-color); color: #fff;
}

/* 滚动内容区 */
.ph-detail-scroll { flex: 1 1 auto; overflow-y: auto; padding: 14px 16px; }

/* ===== 记忆详情：类型色条文档卡片 ===== */
.mem-slug {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 11px; color: var(--text-tertiary);
}
.mem-card {
  --mem-accent: #8895a8;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-left: 4px solid var(--mem-accent);
  border-radius: 10px;
  padding: 16px 22px;
  box-shadow: var(--card-shadow);
}
.mem-card.mem-feedback { --mem-accent: #e0a23d; }
.mem-card.mem-user { --mem-accent: #4f8cff; }
.mem-card.mem-project { --mem-accent: #20bf6b; }
.mem-card.mem-reference { --mem-accent: #a55eea; }
.mem-body { font-size: 13.5px; line-height: 1.78; }
.mem-body > :first-child { margin-top: 0; }
.mem-body > :last-child { margin-bottom: 0; }

/* ===== 多彩内容块 ===== */
.ph-blocks { display: flex; flex-direction: column; gap: 12px; }
.blk {
  border: 1px solid var(--border-color);
  border-left: 3px solid var(--k-accent, var(--border-color));
  border-radius: 8px;
  background: var(--k-bg, var(--card-bg));
  padding: 9px 12px 11px;
}
.blk-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.blk-ava {
  flex: 0 0 auto;
  width: 22px; height: 22px; border-radius: 6px;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 700; color: #fff;
  background: var(--k-accent);
}
.blk-tag {
  font-size: 10px; font-weight: 700; letter-spacing: 0.3px;
  padding: 2px 8px; border-radius: 4px;
  background: var(--k-accent); color: #fff;
}
.blk-toolname {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 12px; font-weight: 600; color: var(--k-accent);
}
.blk-side {
  font-size: 10px; padding: 1px 6px; border-radius: 4px;
  background: var(--bg-hover); color: var(--text-tertiary); border: 1px solid var(--border-color);
}
.blk-body { font-size: 13px; line-height: 1.65; color: var(--text-primary); }
.blk-sys-text { color: var(--text-secondary); font-style: italic; }
.blk-summary {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 12.5px; color: var(--k-accent); word-break: break-all; margin-bottom: 4px;
}
.blk-fold { font-size: 12px; }
.blk-fold summary { cursor: pointer; color: var(--text-tertiary); }
.blk-result { margin-top: 8px; }
.blk-result-label { font-size: 11px; color: var(--text-tertiary); margin-bottom: 3px; }
.blk-result.err .blk-pre { border-color: #f0b4b4; }
.blk-toggle {
  font-size: 12px; color: var(--k-accent); cursor: pointer; user-select: none; margin-top: 4px;
}
.blk-pre {
  margin: 4px 0 0;
  padding: 8px 10px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 12px; line-height: 1.5;
  white-space: pre-wrap; word-break: break-word;
  max-height: 380px; overflow: auto;
}

/* 各类型配色（取自项目预设色板，协调多彩） */
.k-user { --k-accent: #4f8cff; --k-bg: #e9f1ff; }
.k-assistant { --k-accent: #20bf6b; --k-bg: #f4faf6; }
.k-thinking { --k-accent: #a55eea; --k-bg: #f6eefe; }
.k-tool { --k-accent: #fa8231; --k-bg: #fff4ec; }
.k-result { --k-accent: #0fb9b1; --k-bg: #e8faf8; }
.k-system { --k-accent: #8395a7; --k-bg: #f2f5f8; }
.k-attach { --k-accent: #a87b4f; --k-bg: #f6efe6; }

/* ===== 对话模式：用户卡片 + Claude 大卡片 ===== */
.ph-chat { display: flex; flex-direction: column; gap: 16px; }
.chat-ava {
  flex: 0 0 auto;
  width: 28px; height: 28px; border-radius: 8px;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700; color: #fff;
}
.chat-ava-user { background: #4f8cff; }
.chat-ava-ai { background: #20bf6b; }

/* 用户提问 */
.chat-user { display: flex; gap: 10px; align-items: flex-start; scroll-margin-top: 8px; border-radius: 12px; }
/* 头像右侧的列：标题行（名称 + 缩略信息）+ 气泡 */
.chat-col { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
.chat-col > .chat-bubble-user,
.chat-col > .chat-bubble-claude { align-self: stretch; }
.chat-head { display: flex; align-items: baseline; gap: 8px; padding: 0 2px; max-width: 100%; }
.chat-name { flex: 0 0 auto; font-size: 12.5px; font-weight: 700; }
.chat-name-user { color: #3b7bf0; }
.chat-name-ai { color: #178a4e; }
.chat-headmeta {
  min-width: 0; word-break: break-word;
  font-size: 10.5px; color: var(--text-tertiary); cursor: default;
}

.chat-bubble-user {
  background: #eef4ff; border: 1px solid #d4e3ff;
  border-radius: 10px; padding: 10px 14px;
  font-size: 14px; font-weight: 500; line-height: 1.6; color: var(--text-primary);
}

/* 斜杠命令：命令名 + 参数，命令行风格 */
.chat-bubble-cmd { display: flex; flex-direction: column; gap: 6px; }
.cmd-name {
  display: flex; align-items: center; gap: 6px;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 13px; font-weight: 700; color: var(--primary-color);
}
.cmd-name svg { flex: 0 0 auto; }
.cmd-args {
  font-size: 13px; font-weight: 400; line-height: 1.6;
  color: var(--text-primary); white-space: pre-wrap; word-break: break-word;
}

/* 用户取消通知：居中分隔提示，区别于对话气泡 */
.chat-notice {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-tertiary);
  margin: -3px 0;
}
.chat-notice svg { flex: 0 0 auto; color: #e0883d; }
.chat-notice::before,
.chat-notice::after {
  content: '';
  flex: 0 1 70px;
  height: 1px;
  background: var(--border-color);
}

/* Claude 回复：与用户一致的头像 + 气泡 */
.chat-claude { display: flex; gap: 10px; align-items: flex-start; }
.chat-bubble-claude {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 11px 14px;
  display: flex; flex-direction: column; gap: 10px;
}

/* Claude 正文（主回复，无标签） */
.sub-text { font-size: 13.5px; line-height: 1.7; color: var(--text-primary); scroll-margin-top: 8px; }

/* Claude 内部其它类型小卡 */
.sub {
  border: 1px solid var(--border-color);
  border-left: 3px solid var(--k-accent, var(--border-color));
  border-radius: 7px;
  background: var(--k-bg, var(--card-bg));
  padding: 7px 10px 9px;
  scroll-margin-top: 8px;
}
.sub.k-attach { padding: 7px 10px; }
.sub-head { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; }
.sub-tag {
  font-size: 10px; font-weight: 700; letter-spacing: 0.3px;
  padding: 2px 7px; border-radius: 4px;
  background: var(--k-accent); color: #fff;
  flex: 0 0 auto;
}

/* 工具调用：一行 description + 三角，折叠/展开 */
.sub-head.tool-head { margin-bottom: 0; cursor: pointer; user-select: none; }
.tool-line-text {
  flex: 1 1 auto; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 12.5px; color: var(--text-secondary);
}
.tool-caret { flex: 0 0 auto; color: var(--k-accent); transition: transform 0.15s ease; }
.tool-caret.open { transform: rotate(90deg); }
.think-pre { color: var(--text-secondary); font-style: italic; }

/* 工具执行报错：整卡红色系，折叠态即可识别失败 */
.sub.tool-error { --k-accent: #e53935; --k-bg: #fdeceb; }
.sub.tool-error .tool-line-text { color: #e53935; }

/* Edit 工具：git 风格逐行变更，新增绿 / 删除红 / 上下文中性 */
.diff {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: auto;
  max-height: 420px;
  background: var(--card-bg);
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.5;
}
.diff-line { display: flex; gap: 6px; padding: 0 10px; white-space: pre-wrap; word-break: break-word; }
.diff-sign { flex: 0 0 auto; width: 10px; text-align: center; user-select: none; color: var(--text-tertiary); }
.diff-text { flex: 1 1 auto; min-width: 0; }
.diff-add { background: rgba(32, 191, 107, 0.13); }
.diff-add .diff-sign { color: #1d8a4c; }
.diff-add .diff-text { color: #136c3a; }
.diff-del { background: rgba(229, 57, 53, 0.11); }
.diff-del .diff-sign { color: #c0392b; }
.diff-del .diff-text { color: #a32820; }
.diff-ctx .diff-text { color: var(--text-secondary); }
.tool-detail { margin-top: 8px; display: flex; flex-direction: column; gap: 8px; }
.tool-sec-label {
  display: inline-block; margin-bottom: 3px;
  font-size: 10px; font-weight: 700; color: var(--k-accent);
}
.tool-sec-text {
  font-size: 12.5px; line-height: 1.55; color: var(--text-primary);
  white-space: pre-wrap; word-break: break-word;
}
.blk-pre.pre-err { border-color: #f0b4b4; }

/* 类型筛选条（含我的提问导航） */
.ph-filterbar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 16px;
  border-bottom: 1px solid var(--border-color);
  background: var(--card-bg);
  position: relative;
}
.ph-chips { flex: 1 1 auto; display: flex; flex-wrap: wrap; gap: 6px; }
.ph-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 7px 5px 7px;
  border: 1px solid var(--k-accent);
  border-radius: 999px;
  background: var(--k-bg);
  color: var(--k-accent);
  font-size: 11px;
  font-weight: 600;
  line-height: 1.5;
  cursor: pointer;
  transition: opacity 0.12s ease;
}
.ph-chip-n {
  font-size: 10px;
  font-weight: 700;
  padding: 0 5px;
  min-width: 15px;
  text-align: center;
  border-radius: 999px;
  background: var(--k-accent);
  color: #fff;
}
.ph-chip-label { white-space: nowrap; }
.ph-chip-eye { flex: 0 0 auto; opacity: 0.7; }
.ph-chip.is-user { font-weight: 700; }
.ph-chip.off {
  border-color: var(--border-color);
  background: transparent;
  color: var(--text-tertiary);
}
.ph-chip.off .ph-chip-n { background: var(--text-tertiary); }

/* 附件块（紧凑） */
.blk.k-attach { padding: 7px 10px; }
.blk-attach { display: flex; flex-direction: column; gap: 4px; }
.blk-attach-sub {
  align-self: flex-start;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 11.5px; color: var(--k-accent);
  background: var(--card-bg); border: 1px solid var(--border-color);
  padding: 1px 6px; border-radius: 4px;
}

/* 用户提问：重点突出，便于快速识别与定位 */
/* 跳转到提问时闪烁高亮 */
@keyframes blkFlash {
  0% { box-shadow: 0 0 0 3px var(--k-accent, #4f8cff); }
  100% { box-shadow: 0 0 0 0 transparent; }
}
.blk-flash { animation: blkFlash 1.2s ease-out; border-radius: 10px; }

/* 记忆详情头部左色条 */
.ph-detail-head.m-feedback { border-bottom-color: #f0b86b; }
.ph-detail-head.m-user { border-bottom-color: #6fa0f0; }
.ph-detail-head.m-project { border-bottom-color: #5cc585; }
.ph-detail-head.m-reference { border-bottom-color: #a877e0; }

/* ===== markdown 容器 ===== */
.ph-md { word-break: break-word; line-height: 1.7; }
.ph-md > :first-child { margin-top: 0; }
.ph-md > :last-child { margin-bottom: 0; }
.ph-md p { margin: 8px 0; }

/* 标题层级 */
.ph-md h1, .ph-md h2, .ph-md h3, .ph-md h4, .ph-md h5, .ph-md h6 {
  line-height: 1.35; font-weight: 700; color: var(--text-primary);
}
.ph-md h1 { font-size: 18px; margin: 16px 0 9px; padding-bottom: 5px; border-bottom: 1px solid var(--border-color); }
.ph-md h2 { font-size: 16px; margin: 15px 0 8px; padding-bottom: 4px; border-bottom: 1px solid var(--border-color); }
.ph-md h3 { font-size: 14.5px; margin: 13px 0 6px; }
.ph-md h4 { font-size: 13px; margin: 11px 0 5px; }
.ph-md h5, .ph-md h6 { font-size: 12.5px; margin: 10px 0 5px; color: var(--text-secondary); }

/* 正文修饰 */
.ph-md strong { font-weight: 700; color: var(--text-primary); }
.ph-md em { font-style: italic; }
.ph-md a { color: var(--primary-color); text-decoration: none; }
.ph-md a:hover { text-decoration: underline; }
.ph-md hr { border: none; border-top: 1px solid var(--border-color); margin: 14px 0; }
.ph-md img { max-width: 100%; border-radius: 6px; }

/* 列表 */
.ph-md ul, .ph-md ol { padding-left: 22px; margin: 8px 0; }
.ph-md li { margin: 3px 0; }
.ph-md li > ul, .ph-md li > ol { margin: 2px 0; }

/* 引用 */
.ph-md blockquote {
  margin: 8px 0; padding: 4px 12px;
  border-left: 3px solid var(--primary-color);
  background: var(--bg-hover); border-radius: 0 6px 6px 0;
  color: var(--text-secondary);
}
.ph-md blockquote p { margin: 4px 0; }

/* 代码 */
.ph-md pre {
  background: var(--bg-hover); border: 1px solid var(--border-color);
  padding: 10px 12px; border-radius: 8px; overflow: auto;
  font-size: 12px; line-height: 1.5; margin: 8px 0;
}
.ph-md code { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px; }
.ph-md :not(pre) > code {
  background: rgba(0, 0, 0, 0.06); padding: 1.5px 5px; border-radius: 4px;
  font-size: 0.9em; color: #c0392b;
}

/* 表格：清晰边框 + 表头底色 + 斑马纹 + 宽表横向滚动 */
.ph-md table {
  display: block;
  width: max-content;
  max-width: 100%;
  overflow-x: auto;
  border-collapse: collapse;
  margin: 10px 0;
  font-size: 12.5px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
}
.ph-md th, .ph-md td {
  border: 1px solid var(--border-color);
  padding: 6px 11px; text-align: left; vertical-align: top;
  line-height: 1.5;
}
.ph-md thead th { background: var(--bg-hover); font-weight: 700; color: var(--text-primary); white-space: nowrap; }
.ph-md tbody tr:nth-child(even) { background: rgba(0, 0, 0, 0.025); }

.ph-toast {
  position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.82); color: #fff;
  padding: 8px 16px; border-radius: 8px; font-size: 13px; z-index: 2000;
}

@media (prefers-color-scheme: dark) {
  .ph-tag { background: #3a3f46; color: #c4cad2; }
  .ph-tag[data-type="feedback"] { background: #4a3413; color: #e8b873; }
  .ph-tag[data-type="user"] { background: #1c3251; color: #8fb6f5; }
  .ph-tag[data-type="project"] { background: #173b27; color: #82d6a3; }
  .ph-tag[data-type="reference"] { background: #34204d; color: #c49bf0; }

  .k-user { --k-bg: rgba(79, 140, 255, 0.13); }
  .k-assistant { --k-bg: rgba(32, 191, 107, 0.13); }
  .k-thinking { --k-bg: rgba(165, 94, 234, 0.14); }
  .k-tool { --k-bg: rgba(250, 130, 49, 0.13); }
  .k-result { --k-bg: rgba(15, 185, 177, 0.13); }
  .k-system { --k-bg: rgba(131, 149, 167, 0.13); }
  .k-attach { --k-bg: rgba(168, 123, 79, 0.14); }

  .blk-pre, .ph-md pre { background: rgba(0, 0, 0, 0.25); }
  .ph-md :not(pre) > code { background: rgba(255, 255, 255, 0.1); }

  .ph-qitem.active { background: rgba(79, 140, 255, 0.16); }

  /* 暗色：左列黑色 hover 在深底上不可见，改用偏亮灰 */
  .ph-item:hover { background: #3d434f; border-color: #3d434f; }

  /* 暗色：对话卡片底色 */
  .chat-bubble-user { background: rgba(79, 140, 255, 0.14); border-color: rgba(79, 140, 255, 0.3); }
  .chat-name-user { color: #6fa3f5; }
  .chat-name-ai { color: #5fcf8d; }

  /* 暗色：markdown 行内代码与表格斑马纹 */
  .ph-md :not(pre) > code { background: rgba(255, 255, 255, 0.1); color: #f3a08c; }
  .ph-md tbody tr:nth-child(even) { background: rgba(255, 255, 255, 0.035); }

  /* 暗色：工具报错红卡 */
  .sub.tool-error { --k-accent: #ff6b66; --k-bg: rgba(229, 57, 53, 0.14); }
  .sub.tool-error .tool-line-text { color: #ff8a85; }

  /* 暗色：Edit diff 配色 */
  .diff-add { background: rgba(32, 191, 107, 0.18); }
  .diff-add .diff-text { color: #7fe0a6; }
  .diff-del { background: rgba(229, 57, 53, 0.18); }
  .diff-del .diff-text { color: #f3a39b; }

  /* 暗色：回底按钮空闲态玻璃底改用深色卡片色调 */
  .ph-jump-bottom { background: rgba(42, 42, 42, 0.6); }
}
</style>
