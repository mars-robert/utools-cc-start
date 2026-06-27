<script lang="ts" setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { marked } from 'marked'
import { useFind } from './useFind'

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

// ---- 子任务（子代理）查看与切换 ----
const subagents = ref<any[]>([])        // 当前会话的子任务列表
const currentAgent = ref<string | null>(null) // 当前视图：null=主任务 / agentId=某子任务
const showSubtasks = ref(false)         // 切换器下拉开关
const returnToIndex = ref<number | null>(null) // 经通知跳进子任务时记下来源块下标，用于返回定位
const subagentById = (id: string | null) => (id ? subagents.value.find((a: any) => a.agentId === id) : null)
const subagentLabel = (b: any) => (subagentById(b.agentId)?.description) || b.text || '子任务'
const currentViewLabel = computed(() => (currentAgent.value ? (subagentById(currentAgent.value)?.description || currentAgent.value) : '主任务'))

// 窄屏（<900px）下左侧列表收为左上角弹窗
const narrow = ref(false)
const showList = ref(false)
const suppressAnim = ref(false) // 宽窄切换瞬间禁用弹窗过渡，避免从侧栏态淡出造成"一闪"
const applyNarrow = (suppress: boolean) => {
  const n = window.innerWidth < 900
  if (n === narrow.value) return
  narrow.value = n
  if (!n) showList.value = false
  if (suppress) {
    suppressAnim.value = true
    requestAnimationFrame(() => requestAnimationFrame(() => { suppressAnim.value = false }))
  }
}
const updateNarrow = () => applyNarrow(false) // 初始：元素首次创建不触发过渡，无需抑制
const onResize = () => applyNarrow(true)       // 缩放：抑制宽窄切换的瞬间过渡

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

// 活跃会话：精确识别「正在运行的 claude 实例打开的 session」，只对其实时刷新
const activeIds = ref<Set<string>>(new Set()) // 本项目当前活跃 session id 集合
const currentLive = ref(false) // 当前打开的会话是否活跃（决定实时刷新 / 跟随 UI）
const isSessionLive = (id: string) => activeIds.value.has(id)
const LIVE_MS = 2500 // 活跃集刷新间隔
let liveTimer: number | null = null

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
  if (b.kind === 'tool_result' && big(b.text)) return 'tr' + i
  if (b.kind === 'attachment' && big(b.text)) return 'at' + i
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
// 毫秒 → 紧凑时长（s / m s / h m），用于子任务通知用量
const fmtDuration = (ms: number) => {
  if (!ms) return ''
  const s = Math.round(ms / 1000)
  if (s < 60) return s + 's'
  const m = Math.floor(s / 60)
  if (m < 60) return m + 'm' + (s % 60 ? (s % 60) + 's' : '')
  return Math.floor(m / 60) + 'h' + (m % 60 ? (m % 60) + 'm' : '')
}

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
      } else if (b.kind === 'system' && b.subtype === 'subtask_notice') {
        out.push({ type: 'subtask_notice', block: b, index: i }); cur = null
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
    refreshActive()
  } catch (err: any) {
    error.value = err && err.message ? err.message : String(err)
  }
  // 窄屏进入且尚未选择 → 默认弹出列表（延一帧以触发进入动画）
  if (narrow.value && (memories.value.length || sessions.value.length)) {
    requestAnimationFrame(() => { if (!selected.value) showList.value = true })
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

// ---- 工具调用的专用渲染 ----
// 识别需要定制展示的工具类型，其余回退到通用渲染
const toolKind = (b: any) => {
  const n = (b && b.name) || ''
  if (n === 'Skill') return 'skill'
  if (n === 'ToolSearch') return 'toolsearch'
  if (n === 'AskUserQuestion') return 'ask'
  if (n === 'Write') return 'write'
  if (n === 'Read') return 'read'
  if (n === 'Grep') return 'grep'
  if (/codegraph/i.test(n)) return 'codegraph'
  return ''
}
// Read 的读取行范围标注
const readRange = (b: any) => {
  const inp = b.input || {}
  const off = inp.offset; const lim = inp.limit
  if (off && lim) return `第 ${off}–${off + lim - 1} 行`
  if (off) return `从第 ${off} 行起`
  if (lim) return `前 ${lim} 行`
  return ''
}
// 去掉 cat -n 行号前缀（用于 .md 阅读模式渲染）
const stripLineNos = (text: string) => (text || '').replace(/^[ \t]*\d+\t/gm, '')

// ---- Grep 专用解析 ----
const grepMode = (b: any) => (b.input && b.input.output_mode) || 'files_with_matches'
// 检索范围/选项 → 标签胶囊
const grepScope = (b: any) => {
  const i = b.input || {}
  const chips: { k: string; v: string }[] = []
  if (i.path) chips.push({ k: '路径', v: i.path })
  if (i.glob) chips.push({ k: 'glob', v: i.glob })
  if (i.type) chips.push({ k: '类型', v: i.type })
  const flags: string[] = []
  if (i['-i']) flags.push('忽略大小写')
  if (i['-C']) flags.push('上下文 ' + i['-C'] + ' 行')
  else { if (i['-B']) flags.push('前 ' + i['-B'] + ' 行'); if (i['-A']) flags.push('后 ' + i['-A'] + ' 行') }
  if (i.head_limit) flags.push('限 ' + i.head_limit + ' 条')
  if (flags.length) chips.push({ k: '选项', v: flags.join('、') })
  return chips
}
// files_with_matches 结果 → { head, files }
const grepFiles = (b: any) => {
  const lines = ((b.result && b.result.text) || '').split('\n').map((s: string) => s.trim()).filter(Boolean)
  let head = ''
  if (lines.length && /^Found\s+\d+\s+files?/i.test(lines[0])) head = lines.shift()
  return { head, files: lines }
}
// content 结果 → 逐行分类：hit(命中) / ctx(上下文) / sep(分隔) / raw(带路径前缀，原样)
const grepContentLines = (b: any) => {
  return ((b.result && b.result.text) || '').split('\n').map((line: string) => {
    if (line === '--') return { t: 'sep', no: '', text: '' }
    const m = line.match(/^(\d+)([:-])(.*)$/)
    if (m) return { t: m[2] === ':' ? 'hit' : 'ctx', no: m[1], text: m[3] }
    return { t: 'raw', no: '', text: line }
  })
}
// Skill 直接在折叠行展示结果，无需展开
const toolExpandable = (b: any) => toolKind(b) !== 'skill'
// codegraph / ToolSearch 的查询语句
const toolQuery = (b: any) => {
  const inp = b.input || {}
  return inp.query || inp.question || toolSummary(inp) || ''
}
// 折叠行文案：按工具类型选取最有信息量的一行
const toolHeadText = (b: any) => {
  switch (toolKind(b)) {
    case 'skill': return (b.result && b.result.text) || (b.input && b.input.skill) || toolDesc(b)
    case 'toolsearch':
    case 'codegraph': return toolQuery(b) || toolDesc(b)
    case 'ask': return askSummary(b)
    case 'grep': return (b.input && b.input.pattern) || toolDesc(b)
    default: return toolDesc(b)
  }
}
// ToolSearch 结果解析为工具列表：优先 <function>{json}</function>，回退纯工具名列表
const toolSearchItems = (b: any) => {
  const txt = (b.result && b.result.text) || ''
  const items: { name: string; desc: string }[] = []
  const re = /<function>(\{[\s\S]*?\})<\/function>/g
  let m
  while ((m = re.exec(txt))) {
    try { const o = JSON.parse(m[1]); items.push({ name: o.name || '', desc: o.description || '' }) } catch (_) { /* 跳过坏块 */ }
  }
  if (items.length) return items
  return txt.split('\n').map((s) => s.trim()).filter(Boolean).map((name) => ({ name, desc: '' }))
}
// AskUserQuestion 结果文本里解析「问题=答案」对
const askAnswerMap = (b: any) => {
  const txt = (b.result && b.result.text) || ''
  const map: Record<string, string> = {}
  const re = /"([^"]*)"\s*=\s*"([^"]*)"/g
  let m
  while ((m = re.exec(txt))) { map[m[1]] = m[2] }
  return map
}
const askSummary = (b: any) => {
  const vals = Object.values(askAnswerMap(b))
  return vals.length ? vals.join('；') : ((b.result && b.result.text) || toolDesc(b))
}
// 某问题的某选项是否被选中（按标签匹配，兼容多选）
const askIsChosen = (b: any, q: any, opt: any) => {
  const ans = askAnswerMap(b)[(q && q.question) || ''] || ''
  return !!opt && !!opt.label && ans.includes(opt.label)
}
const isMarkdownPath = (p: any) => typeof p === 'string' && /\.(md|markdown)$/i.test(p)

// ---- 系统消息 ----
const SYS_LABEL: Record<string, string> = {
  away_summary: '会话回顾',
  local_command: '命令',
  compact_boundary: '上下文压缩',
  api_error: '接口错误'
}
// 头部已有「系统」标签，未知子类型不再重复
const sysLabel = (b: any) => SYS_LABEL[b.subtype] || ''
// 无可展示文本则整卡不渲染，杜绝空白卡
const sysVisible = (b: any) => !!sysText(b)
// 清洗系统文本：去 recap 尾巴、解开 local-command 输出、斜杠命令回显归一为 /cmd
const sysText = (b: any) => {
  let t = (b.text || '').trim()
  t = t.replace(/\s*\(disable recaps in \/config\)\s*$/i, '').trim()
  let m = t.match(/^<local-command-(stdout|stderr)>([\s\S]*)<\/local-command-\1>$/)
  if (m) return (m[2] || '').trim()
  m = t.match(/<command-name>([\s\S]*?)<\/command-name>/)
  if (m) {
    const args = ((t.match(/<command-args>([\s\S]*?)<\/command-args>/) || [])[1] || '').trim()
    return (m[1].trim() + (args ? ' ' + args : '')).trim()
  }
  return t
}
// Markdown 结果的「阅读模式 / 源码」切换状态，默认阅读模式
const srcKeys = reactive<Record<string, boolean>>({})
const isSrc = (key: string) => !!srcKeys[key]
const setSrc = (key: string, v: boolean) => { srcKeys[key] = v }

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
  if (!s || detailLoading.value || currentAgent.value) return
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
    if (findVisible.value) findRefresh() // 内容重渲染后旧 Range 失效，重建高亮
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
// 仅重载会话列表（不触碰当前选中/详情/轮询），供新会话出现时增量刷新
const reloadSessions = () => {
  const p = props.project
  if (!p || !p.dirName) return
  try { sessions.value = window.services.listProjectSessions(p.dirName) || [] } catch (_) { /* 失败则保持原列表 */ }
}

// 刷新本项目活跃 session 集合；若当前打开会话的存活态翻转则联动启停实时刷新
const refreshActive = () => {
  try {
    const list = window.services.listActiveSessions(props.project?.cwd) || []
    activeIds.value = new Set(list.map((a: any) => a.sessionId))
  } catch (_) { activeIds.value = new Set() }
  // 启动新会话时活跃集会先于列表更新：出现列表中尚无的活跃 session → 重载列表使其自动出现
  const ids = new Set(sessions.value.map((s: any) => s.sessionId))
  if ([...activeIds.value].some((id) => !ids.has(id))) reloadSessions()
  const s = selectedSession.value
  if (s && selected.value && selected.value.type === 'session' && !currentAgent.value) {
    const live = isSessionLive(s.sessionId)
    if (live !== currentLive.value) {
      // 在线↔离线切换：默认联动实时刷新（上线→开，下线→暂停）；切换间用户的手动开关仍被尊重
      currentLive.value = live
      autoRefresh.value = live
      if (live) { startPoll(); refreshSession() } else stopPoll()
    }
  }
}
const stopLiveTimer = () => {
  if (liveTimer !== null) { clearInterval(liveTimer); liveTimer = null }
}

const selectMemory = (m: any) => {
  showList.value = false
  stopPoll()
  findClose()
  currentAgent.value = null
  subagents.value = []
  showSubtasks.value = false
  mdCache.clear()
  selected.value = { type: 'memory', id: m.fileName }
  sessionDetail.value = null
  selectedSession.value = null
  memoryDetail.value = window.services.readMemory(props.project.dirName, m.fileName)
}

const selectSession = (s: any) => {
  showList.value = false
  selected.value = { type: 'session', id: s.sessionId }
  memoryDetail.value = null
  selectedSession.value = s
  detailLoading.value = true
  showQuestions.value = false
  currentAgent.value = null
  showSubtasks.value = false
  subagents.value = []
  findClose()
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
      subagents.value = window.services.listSubagents(props.project.dirName, s.sessionId) || []
      lastSig = sessionSig(s)
    } catch (err: any) {
      error.value = err && err.message ? err.message : String(err)
    } finally {
      detailLoading.value = false
      currentLive.value = isSessionLive(s.sessionId)
      autoRefresh.value = currentLive.value // 在线会话默认实时，离线（历史）会话默认暂停
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

// 在主任务/子任务间切换：仅替换 sessionDetail，复用全部既有渲染
const switchView = (agentId: string | null, fromIndex: number | null = null) => {
  if (!selectedSession.value) return
  showSubtasks.value = false
  returnToIndex.value = agentId ? fromIndex : null
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
  for (const k in expandedKeys) delete expandedKeys[k]
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

// 从子任务返回主任务；若经通知跳转进来，回到来源通知位置并高亮
const returnToMain = () => {
  const idx = returnToIndex.value
  switchView(null)
  if (idx != null) nextTick(() => jumpToBlock(idx))
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
// 复制当前会话的 session ID（用于 claude --resume 等）
const copyId = () => {
  const id = selectedSession.value && selectedSession.value.sessionId
  if (!id) return
  try { if (window.utools && window.utools.copyText) window.utools.copyText(id) } catch (_) { /* 忽略 */ }
  showToast('已复制 session ID')
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
  let r
  if (currentAgent.value) {
    // 子任务：从已加载模型生成 Markdown
    const md = window.services.sessionToMarkdown(sessionDetail.value, currentViewLabel.value)
    r = window.services.writeTextFile(target, md)
  } else {
    r = window.services.exportSessionToFile(props.project.dirName, selectedSession.value.sessionId, target)
  }
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
  // 顶部辅助信息：项目 / 大小 / 模型 / 分支 / 版本 / 消息数
  const meta = (sessionDetail.value && sessionDetail.value.meta) || {}
  const sess = selectedSession.value || {}
  let model = ''
  for (const b of (sessionDetail.value && sessionDetail.value.blocks) || []) { if (b.model) model = b.model }
  const metaItems: [string, string][] = [
    ['项目', (props.project && props.project.displayName) || ''],
    ['路径', (props.project && (props.project.cwd || props.project.dirName)) || ''],
    ['大小', sess.size ? formatSize(sess.size) : ''],
    ['模型', model],
    ['分支', meta.gitBranch || ''],
    ['版本', meta.version ? 'v' + meta.version : ''],
    ['消息数', meta.count ? meta.count + ' 条' : '']
  ]
  const metaHtml = metaItems
    .filter(([, v]) => v)
    .map(([k, v]) => `<div class="ph-export-meta-item"><span class="ph-export-meta-k">${escapeHtml(k)}</span><span class="ph-export-meta-v">${escapeHtml(String(v))}</span></div>`)
    .join('')
  const html = `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
${collectCss()}
body { margin: 0; background: var(--card-bg); color: var(--text-primary); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif; }
.ph-export { max-width: 920px; margin: 0 auto; padding: 28px 22px; }
.ph-export-head { margin: 0 0 24px; padding: 0 0 18px; border-bottom: 1px solid var(--border-color); }
.ph-export-title {
  font-size: 21px; font-weight: 700; line-height: 1.35;
  margin: 0 0 14px; color: var(--text-primary); word-break: break-word;
}
.ph-export-meta {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 9px 26px;
}
.ph-export-meta-item { display: flex; align-items: baseline; gap: 10px; font-size: 13px; min-width: 0; }
.ph-export-meta-k { flex: 0 0 auto; min-width: 42px; font-weight: 600; color: var(--text-secondary); }
.ph-export-meta-v { min-width: 0; color: var(--text-primary); word-break: break-all; }
.ph-export .tool-caret, .ph-export .ph-chip-eye { display: none; }
</style>
</head>
<body>
<div class="ph-export">
<header class="ph-export-head">
<h1 class="ph-export-title">${escapeHtml(title)}</h1>
${metaHtml ? `<div class="ph-export-meta">${metaHtml}</div>` : ''}
</header>
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

onMounted(() => {
  updateNarrow()
  load()
  liveTimer = window.setInterval(refreshActive, LIVE_MS)
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', onResize)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', onResize)
  stopPoll(); stopLiveTimer()
  findClose()
})
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
      <button v-if="narrow" class="ph-list-toggle" :class="{ on: showList }" :title="showList ? '收起列表' : '记忆与会话列表'" @click="showList = !showList">
        <svg class="ph-lt-ico ph-lt-menu" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
          stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
        <svg class="ph-lt-ico ph-lt-close" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
          stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="14" height="14" rx="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>
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
    <div class="ph-main" :class="{ 'ph-main--narrow': narrow }">
      <!-- 窄屏：列表弹窗的背景遮罩 -->
      <div v-if="narrow && showList" class="ph-list-backdrop" @click="showList = false"></div>
      <!-- 左侧列表（窄屏下为左上角弹窗） -->
      <aside class="ph-left" :class="{ 'ph-left--pop': narrow, open: showList, 'ph-no-anim': suppressAnim }">
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
              <span v-if="isSessionLive(s.sessionId)" class="ph-live-tag" title="正在运行中">● 进行中</span>
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
        <div v-if="!selected" class="ph-empty-detail">
          <svg viewBox="0 0 24 24" width="46" height="46" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 12h-6l-2 3h-4l-2-3H2" />
            <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
          </svg>
          <div class="ph-empty-text">请选择一条记忆或历史会话</div>
        </div>

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
              <div class="ph-detail-title">
                <span class="ph-detail-title-text">{{ selectedSession && (selectedSession.title || selectedSession.sessionId) }}</span>
                <span v-if="currentAgent" class="ph-subtask-badge" :title="'子任务：' + currentViewLabel">子任务 · {{ currentViewLabel }}</span>
                <span v-if="currentLive && !currentAgent" class="ph-online-chip" title="该会话当前在终端中打开并在线">● 在线</span>
              </div>
              <div v-if="sessionDetail && sessionDetail.meta" class="ph-detail-meta">
                <span v-if="sessionDetail.meta.gitBranch">⎇ {{ sessionDetail.meta.gitBranch }}</span>
                <span v-if="sessionDetail.meta.version">v{{ sessionDetail.meta.version }}</span>
                <span v-if="sessionDetail.meta.count">{{ sessionDetail.meta.count }} 条</span>
                <span v-if="selectedSession && selectedSession.size">{{ formatSize(selectedSession.size) }}</span>
                <span v-if="selectedSession" class="ph-detail-id" title="点击复制 session ID" @click="copyId">{{ selectedSession.sessionId }}</span>
              </div>
            </div>
            <div class="ph-actions">
              <button v-if="currentAgent" class="ph-act-term ph-act-back" title="返回主任务" @click="returnToMain()">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></svg>
                返回主任务
              </button>
              <button
                v-if="!currentAgent"
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
                  <button class="ph-export-item" @click="doExportMd">
                    <span class="ph-export-ico"><svg viewBox="0 0 208 128" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="14" stroke-linejoin="round" d="M14 7h180a7 7 0 0 1 7 7v100a7 7 0 0 1-7 7H14a7 7 0 0 1-7-7V14a7 7 0 0 1 7-7z" /><path fill="currentColor" d="M30 98V32h19l20 24 20-24h19v66H89V60L69 84 49 60v38zm123 0-29-32h18V32h22v34h18z" /></svg></span>
                    导出为 Markdown
                  </button>
                  <button class="ph-export-item" @click="doExportHtml">
                    <span class="ph-export-ico"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M1.5 0h21l-1.91 21.563L11.977 24l-8.564-2.438L1.5 0zm7.031 9.75l-.232-2.718 10.059.003.23-2.622L5.412 4.41l.698 8.01h9.126l-.326 3.426-2.91.804-2.955-.81-.188-2.11H6.248l.33 4.171L12 19.351l5.379-1.443.744-8.157H8.531z" /></svg></span>
                    导出为 HTML
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div v-if="sessionDetail && filterChips.length" class="ph-filterbar">
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
              <button v-if="findSupported" class="ph-qbtn ph-qbtn-find" title="查找 (Ctrl+F)" @click="findOpen(selText())">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
              </button>
              <button class="ph-qbtn" title="上一个提问" @click="jumpToQuestion(curQ - 1)">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6" /></svg>
              </button>
              <button class="ph-qbtn" title="下一个提问" @click="jumpToQuestion(curQ + 1)">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg>
              </button>
            </div>

            <div v-if="showQuestions" class="ph-qbackdrop" @click="showQuestions = false"></div>
            <div class="ph-qpanel" :class="{ open: showQuestions }">
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
            <!-- 查找框：浮于筛选条/搜索按钮下方（VS Code 风格） -->
            <div v-if="findSupported && findVisible" class="ph-find">
              <div class="ph-find-box" :class="{ invalid: findInvalid }">
                <input
                  ref="findInput"
                  v-model="findQuery"
                  class="ph-find-input"
                  type="text"
                  placeholder="查找"
                  spellcheck="false"
                  @keydown.enter.exact.prevent="findNext()"
                  @keydown.enter.shift.prevent="findPrev()"
                />
                <button class="ph-find-toggle" :class="{ on: findCase }" title="区分大小写" @click="findCase = !findCase">Aa</button>
                <button class="ph-find-toggle" :class="{ on: findWord }" title="全字匹配" @click="findWord = !findWord">&#9474;ab&#9474;</button>
                <button class="ph-find-toggle" :class="{ on: findRegex }" title="正则表达式" @click="findRegex = !findRegex">.*</button>
              </div>
              <span class="ph-find-count">{{ findCount ? (findCurrent + 1) + '/' + findCount : '0/0' }}</span>
              <button class="ph-find-btn" title="上一个 (Shift+Enter)" :disabled="!findCount" @click="findPrev()">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
              </button>
              <button class="ph-find-btn" title="下一个 (Enter)" :disabled="!findCount" @click="findNext()">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12l7 7 7-7" /></svg>
              </button>
              <button class="ph-find-btn" title="关闭 (Esc)" @click="findClose()">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
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

                <!-- 子任务完成通知（系统注入，可点击跳到该子任务） -->
                <div
                  v-else-if="t.type === 'subtask_notice' && chipVisible('system')"
                  :ref="(el) => setBlockRef(el, t.index)"
                  class="chat-subtask-notice"
                  :class="{ 'blk-flash': highlightIdx === t.index, clickable: !!subagentById(t.block.agentId) }"
                  @click="subagentById(t.block.agentId) && switchView(t.block.agentId, t.index)"
                >
                  <span class="csn-ico">
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="2.4" /><circle cx="6" cy="18" r="2.4" /><circle cx="18" cy="12" r="2.4" /><path d="M8.2 6.6c5 .4 6.6 1.8 7.4 4.2M8.2 17.4c5-.4 6.6-1.8 7.4-4.2" /></svg>
                  </span>
                  <div class="csn-body">
                    <div class="csn-title">{{ subagentLabel(t.block) }}</div>
                    <div class="csn-meta">
                      <span v-if="t.block.status" class="csn-status" :class="'st-' + t.block.status">{{ t.block.status }}</span>
                      <span v-if="t.block.tokens">↑ {{ fmtTokK(t.block.tokens) }} tok</span>
                      <span v-if="t.block.toolUses">{{ t.block.toolUses }} 调用</span>
                      <span v-if="fmtDuration(t.block.durationMs)">{{ fmtDuration(t.block.durationMs) }}</span>
                      <span v-if="subagentById(t.block.agentId) && subagentById(t.block.agentId).agentType" class="csn-type">{{ subagentById(t.block.agentId).agentType }}</span>
                    </div>
                  </div>
                  <span v-if="subagentById(t.block.agentId)" class="csn-go">查看 ›</span>
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
                        v-else-if="it.block.kind !== 'assistant' && visibleKinds[it.block.kind] && (it.block.kind !== 'system' || sysVisible(it.block))"
                        :ref="(el) => setBlockRef(el, it.index)"
                        class="sub"
                        :class="[kindMeta(it.block.kind).cls, {
                          'blk-flash': highlightIdx === it.index,
                          'tool-error': it.block.kind === 'tool_use' && it.block.result && it.block.result.isError
                        }]"
                      >
                        <div
                          class="sub-head"
                          :class="{ 'tool-head': (it.block.kind === 'tool_use' && toolExpandable(it.block)) || it.block.kind === 'thinking' }"
                          @click="((it.block.kind === 'tool_use' && toolExpandable(it.block)) || it.block.kind === 'thinking') ? toggleHead(it) : null"
                        >
                          <span class="sub-tag">{{ kindMeta(it.block.kind).label }}</span>
                          <span v-if="it.block.kind === 'tool_use'" class="blk-toolname">{{ it.block.name }}</span>
                          <span v-if="it.block.kind === 'tool_use'" class="tool-line-text">{{ toolHeadText(it.block) }}</span>
                          <span v-else-if="it.block.kind === 'thinking'" class="tool-line-text">{{ thinkPreview(it.block) }}</span>
                          <span v-else-if="it.block.kind === 'system' && sysLabel(it.block)" class="tool-line-text">· {{ sysLabel(it.block) }}</span>
                          <span v-if="it.block.sidechain" class="blk-side">子任务</span>
                          <svg v-if="(it.block.kind === 'tool_use' && toolExpandable(it.block)) || it.block.kind === 'thinking'" class="tool-caret" :class="{ open: headOpen(it) }" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                        </div>

                        <!-- 思考：默认折叠（头部一行预览），展开看全文 -->
                        <template v-if="it.block.kind === 'thinking'">
                          <pre v-if="isOpen('t' + it.index)" class="blk-pre think-pre">{{ it.block.text }}</pre>
                        </template>

                        <!-- 工具调用：按工具类型定制展开内容（Skill 已在折叠行直出结果，无展开） -->
                        <template v-else-if="it.block.kind === 'tool_use'">
                          <div v-if="toolExpandable(it.block) && isOpen('tu' + it.index)" class="tool-detail">

                            <!-- ToolSearch：解析为查询到的工具列表 -->
                            <template v-if="toolKind(it.block) === 'toolsearch'">
                              <div class="tool-sec">
                                <span class="tool-sec-label">查询</span>
                                <div class="tool-sec-text">{{ toolQuery(it.block) }}</div>
                              </div>
                              <div class="tool-sec">
                                <span class="tool-sec-label">匹配工具（{{ toolSearchItems(it.block).length }}）</span>
                                <div class="ts-list">
                                  <div v-for="(ts, k) in toolSearchItems(it.block)" :key="k" class="ts-item">
                                    <code class="ts-name">{{ ts.name }}</code>
                                    <span v-if="ts.desc" class="ts-desc">{{ ts.desc }}</span>
                                  </div>
                                </div>
                              </div>
                            </template>

                            <!-- codegraph：查询 + Markdown 结果（阅读模式 / 源码 切换） -->
                            <template v-else-if="toolKind(it.block) === 'codegraph'">
                              <div class="tool-sec">
                                <span class="tool-sec-label">查询</span>
                                <div class="tool-sec-text">{{ toolQuery(it.block) }}</div>
                              </div>
                              <div v-if="it.block.result" class="tool-sec">
                                <div class="md-bar">
                                  <span class="tool-sec-label">{{ it.block.result.isError ? '结果（错误）' : '结果' }}</span>
                                  <div class="md-toggle">
                                    <span class="md-tab" :class="{ active: !isSrc('s' + it.index) }" @click="setSrc('s' + it.index, false)">阅读模式</span>
                                    <span class="md-tab" :class="{ active: isSrc('s' + it.index) }" @click="setSrc('s' + it.index, true)">源码</span>
                                  </div>
                                </div>
                                <pre v-if="isSrc('s' + it.index)" class="blk-pre" :class="{ 'pre-err': it.block.result.isError }">{{ it.block.result.text }}</pre>
                                <div v-else class="ph-md md-render" v-html="renderMarkdown(it.block.result.text)"></div>
                              </div>
                            </template>

                            <!-- AskUserQuestion：渲染成问答卡，与工具内容明显区分 -->
                            <template v-else-if="toolKind(it.block) === 'ask'">
                              <div class="ask-detail">
                                <div v-for="(q, qi) in (it.block.input && it.block.input.questions) || []" :key="qi" class="ask-q">
                                  <div class="ask-q-head">
                                    <span class="ask-q-badge">问</span>
                                    <span v-if="q.header" class="ask-q-tag">{{ q.header }}</span>
                                  </div>
                                  <div class="ask-q-text">{{ q.question }}</div>
                                  <div class="ask-opts">
                                    <div
                                      v-for="(opt, oi) in q.options"
                                      :key="oi"
                                      class="ask-opt"
                                      :class="{ chosen: askIsChosen(it.block, q, opt) }"
                                    >
                                      <span class="ask-opt-mark">{{ askIsChosen(it.block, q, opt) ? '✓' : '' }}</span>
                                      <div class="ask-opt-body">
                                        <div class="ask-opt-label-row">
                                          <span class="ask-opt-label">{{ opt.label }}</span>
                                          <span v-if="askIsChosen(it.block, q, opt)" class="ask-opt-badge">已选</span>
                                        </div>
                                        <div v-if="opt.description" class="ask-opt-desc">{{ opt.description }}</div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </template>

                            <!-- Write：文件路径 + 内容（.md 支持阅读模式 / 源码 切换） -->
                            <template v-else-if="toolKind(it.block) === 'write'">
                              <div class="tool-sec">
                                <span class="tool-sec-label">文件</span>
                                <div class="tool-sec-text wr-path">{{ it.block.input && it.block.input.file_path }}</div>
                              </div>
                              <div class="tool-sec">
                                <div class="md-bar">
                                  <span class="tool-sec-label">内容</span>
                                  <div v-if="isMarkdownPath(it.block.input && it.block.input.file_path)" class="md-toggle">
                                    <span class="md-tab" :class="{ active: !isSrc('s' + it.index) }" @click="setSrc('s' + it.index, false)">阅读模式</span>
                                    <span class="md-tab" :class="{ active: isSrc('s' + it.index) }" @click="setSrc('s' + it.index, true)">源码</span>
                                  </div>
                                </div>
                                <div
                                  v-if="isMarkdownPath(it.block.input && it.block.input.file_path) && !isSrc('s' + it.index)"
                                  class="ph-md md-render"
                                  v-html="renderMarkdown((it.block.input && it.block.input.content) || '')"
                                ></div>
                                <pre v-else class="blk-pre">{{ (it.block.input && it.block.input.content) || '' }}</pre>
                              </div>
                              <div v-if="it.block.result" class="tool-sec">
                                <span class="tool-sec-label">{{ it.block.result.isError ? '结果（错误）' : '结果' }}</span>
                                <div class="tool-sec-text wr-res">{{ it.block.result.text }}</div>
                              </div>
                            </template>

                            <!-- Read：文件路径(+行范围) + 内容（.md 支持阅读模式 / 源码 切换） -->
                            <template v-else-if="toolKind(it.block) === 'read'">
                              <div class="tool-sec">
                                <span class="tool-sec-label">文件</span>
                                <div class="tool-sec-text wr-path">
                                  <span>{{ it.block.input && it.block.input.file_path }}</span>
                                  <span v-if="readRange(it.block)" class="read-range">{{ readRange(it.block) }}</span>
                                </div>
                              </div>
                              <div v-if="it.block.result" class="tool-sec">
                                <div class="md-bar">
                                  <span class="tool-sec-label">{{ it.block.result.isError ? '结果（错误）' : '内容' }}</span>
                                  <div v-if="isMarkdownPath(it.block.input && it.block.input.file_path) && !it.block.result.isError" class="md-toggle">
                                    <span class="md-tab" :class="{ active: !isSrc('s' + it.index) }" @click="setSrc('s' + it.index, false)">阅读模式</span>
                                    <span class="md-tab" :class="{ active: isSrc('s' + it.index) }" @click="setSrc('s' + it.index, true)">源码</span>
                                  </div>
                                </div>
                                <div
                                  v-if="isMarkdownPath(it.block.input && it.block.input.file_path) && !it.block.result.isError && !isSrc('s' + it.index)"
                                  class="ph-md md-render"
                                  v-html="renderMarkdown(stripLineNos(it.block.result.text))"
                                ></div>
                                <pre v-else class="blk-pre" :class="{ 'pre-err': it.block.result.isError }">{{ it.block.result.text }}</pre>
                              </div>
                            </template>

                            <!-- Grep：匹配模式 + 检索范围 + 结果（文件列表 / 命中高亮内容） -->
                            <template v-else-if="toolKind(it.block) === 'grep'">
                              <div class="tool-sec">
                                <span class="tool-sec-label">匹配模式</span>
                                <div class="grep-pattern">{{ it.block.input && it.block.input.pattern }}</div>
                                <div v-if="grepScope(it.block).length" class="grep-scope">
                                  <span v-for="(c, k) in grepScope(it.block)" :key="k" class="grep-chip"><span class="grep-chip-k">{{ c.k }}</span>{{ c.v }}</span>
                                </div>
                              </div>
                              <div v-if="it.block.result" class="tool-sec">
                                <!-- files_with_matches：文件列表 -->
                                <template v-if="grepMode(it.block) === 'files_with_matches' && !it.block.result.isError">
                                  <span class="tool-sec-label">{{ grepFiles(it.block).head || ('匹配文件（' + grepFiles(it.block).files.length + '）') }}</span>
                                  <div class="ts-list">
                                    <div v-for="(fp, k) in grepFiles(it.block).files" :key="k" class="grep-file"><code>{{ fp }}</code></div>
                                  </div>
                                </template>
                                <!-- content：命中行高亮 -->
                                <template v-else-if="grepMode(it.block) === 'content' && !it.block.result.isError">
                                  <span class="tool-sec-label">匹配内容</span>
                                  <div class="grep-lines">
                                    <div v-for="(ln, k) in grepContentLines(it.block)" :key="k" class="grep-line" :class="'grep-' + ln.t">
                                      <span v-if="ln.t === 'hit' || ln.t === 'ctx'" class="grep-no">{{ ln.no }}</span>
                                      <span class="grep-text">{{ ln.t === 'sep' ? '⋯⋯' : ln.text }}</span>
                                    </div>
                                  </div>
                                </template>
                                <!-- count / 错误 / 兜底 -->
                                <template v-else>
                                  <span class="tool-sec-label">{{ it.block.result.isError ? '结果（错误）' : '结果' }}</span>
                                  <pre class="blk-pre" :class="{ 'pre-err': it.block.result.isError }">{{ it.block.result.text }}</pre>
                                </template>
                              </div>
                            </template>

                            <!-- 其它工具：保持原有 描述 / 变更 / 命令 / 参数 / 结果 -->
                            <template v-else>
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
                            </template>

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

                        <!-- 系统：按子类型呈现（会话回顾 Markdown / 命令输出代码块） -->
                        <!-- 系统：极简朴素，一行文本 -->
                        <div v-else class="blk-sys-text">{{ sysText(it.block) }}</div>
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
.ph-list-toggle {
  flex: 0 0 auto;
  width: 34px; height: 34px;
  display: grid; place-items: center;
  border: 1px solid var(--border-color); border-radius: 8px;
  background: var(--bg-hover); color: var(--text-secondary);
  cursor: pointer; transition: all 0.15s ease;
}
.ph-list-toggle:hover, .ph-list-toggle.on { background: var(--primary-color); border-color: var(--primary-color); color: #fff; }
.ph-list-toggle:active { transform: scale(0.92); }
/* ☰ ↔ ✕ 交叉淡入淡出（两个图标叠放于同一网格单元） */
.ph-lt-ico { grid-area: 1 / 1; transition: opacity 0.18s ease, transform 0.18s ease; }
.ph-lt-close { opacity: 0; transform: scale(0.6); }
.ph-list-toggle.on .ph-lt-menu { opacity: 0; transform: scale(0.6); }
.ph-list-toggle.on .ph-lt-close { opacity: 1; transform: none; }
.ph-proj { flex: 1 1 auto; min-width: 0; }
.ph-proj-name { display: flex; align-items: center; min-width: 0; }
.ph-proj-name-text { min-width: 0; font-weight: 600; font-size: 14px; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ph-proj-path { font-size: 12px; color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 1px; }
.ph-terminal {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border: 1px solid #3a3f4b;
  border-radius: 6px;
  background: #1e2128;
  color: #4ec9b0;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 11px;
  cursor: pointer;
  transition: background 0.15s ease;
}
.ph-terminal:hover { background: #2b2f38; }
.ph-terminal:disabled { opacity: 0.45; cursor: not-allowed; }

.ph-error { flex: 0 0 auto; color: #e53935; font-size: 13px; padding: 6px 14px; }

/* ===== 下方左右布局 ===== */
/* grid 左列宽可过渡：宽窄切换时左列 287↔0 平滑收放，详情区跟随滑动，避免硬跳 */
.ph-main {
  flex: 1 1 auto;
  display: grid;
  grid-template-columns: 287px 1fr;
  overflow: hidden;
  position: relative;
  transition: grid-template-columns 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
/* 窄屏：左列收为 0，详情平滑铺满；列表另以左上角弹窗（绝对定位）叠加，不占列 */
.ph-main--narrow { grid-template-columns: 0px 1fr; }

/* 左侧列表（在流侧栏宽度由 grid 左列决定，box-border 使内容宽与原先一致） */
.ph-left {
  grid-column: 1;
  box-sizing: border-box;
  min-width: 0;
  overflow-y: auto;
  overflow-x: hidden;
  border-right: 1px solid var(--border-color);
  padding: 8px;
}
/* 窄屏（<900px）：左侧列表收为左上角弹窗，形式仿「我的提问」浮层 */
.ph-left--pop {
  position: absolute;
  top: 8px; left: 8px;
  z-index: 1600;
  flex: none;
  width: 280px;
  max-width: calc(100% - 16px);
  /* 用视口单位约束高度（% 在 flex 项里可能不解析导致撑满），留出顶栏 + 上下边距 */
  max-height: calc(100vh - 100px);
  padding-top: 0; /* 去掉顶部留白，粘性分组标题贴顶吸附，不露出下方滚动内容 */
  border: 1px solid var(--border-color);
  border-top: 3px solid var(--primary-color);
  border-radius: 10px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.18);
  background: var(--card-bg);
  opacity: 0;
  transform: translateY(-6px) scale(0.96);
  transform-origin: top left;
  pointer-events: none;
  /* 退出：稍长 + 缓入缓出，柔和滑出，避免生硬 */
  transition: opacity 0.26s ease, transform 0.26s cubic-bezier(0.4, 0, 0.2, 1);
}
/* 进入：弹出缓出，干脆 */
.ph-left--pop.open { opacity: 1; transform: none; pointer-events: auto; transition: opacity 0.2s ease, transform 0.22s cubic-bezier(0.22, 1, 0.36, 1); }
/* 宽窄切换瞬间禁用过渡，避免侧栏态→弹窗隐藏态的淡出"一闪" */
.ph-left.ph-no-anim { transition: none; }
.ph-list-backdrop { position: absolute; inset: 0; z-index: 1500; }
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
.ph-live-tag { color: #20bf6b; font-weight: 600; white-space: nowrap; }
.ph-item.active .ph-live-tag { color: #b6f5d0; }

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
.ph-right { grid-column: 2; min-width: 0; flex: 1 1 auto; display: flex; flex-direction: column; overflow: hidden; position: relative; }
.ph-placeholder { margin: 60px auto 0; text-align: center; color: var(--text-tertiary); font-size: 14px; }
/* 未选择时的空状态：居中图标 + 提示 */
.ph-empty-detail {
  flex: 1 1 auto;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 12px; color: var(--text-tertiary);
}
.ph-empty-detail svg { opacity: 0.45; }
.ph-empty-text { font-size: 14px; }

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
.ph-qbtn-find { border-right: 1px solid var(--border-color); }
.ph-qnav .ph-qbtn-find + .ph-qbtn { border-right: 1px solid var(--border-color); }
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
  opacity: 0;
  transform: translateY(-6px) scale(0.96);
  transform-origin: top left;
  pointer-events: none;
  /* 退出：稍长 + 缓入缓出，柔和滑出，避免生硬 */
  transition: opacity 0.26s ease, transform 0.26s cubic-bezier(0.4, 0, 0.2, 1);
}
/* 进入：弹出缓出，干脆 */
.ph-qpanel.open { opacity: 1; transform: none; pointer-events: auto; transition: opacity 0.2s ease, transform 0.22s cubic-bezier(0.22, 1, 0.36, 1); }
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
.ph-detail-title { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 14px; color: var(--text-primary); }
.ph-detail-title-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.ph-detail-meta { display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: 11px; color: var(--text-tertiary); margin-top: 3px; }
.ph-detail-id { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; cursor: pointer; }
.ph-detail-id:hover { color: var(--text-secondary); text-decoration: underline; }
.ph-link-btn {
  margin-left: auto; flex: 0 0 auto;
  font-size: 12px; background: none;
  border: 1px solid var(--border-color); border-radius: 6px;
  padding: 4px 9px; cursor: pointer; color: var(--primary-color);
}
.ph-link-btn:hover { background: var(--bg-hover); }

.ph-actions { flex: 0 0 auto; display: flex; gap: 6px; }
/* 操作/终端按钮的图标统一收到 12px，与筛选胶囊一致 */
.ph-terminal svg, .ph-act-term svg, .ph-act-icon svg { width: 12px; height: 12px; }
.ph-act-term {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 3px 8px; border-radius: 6px;
  border: 1px solid #3a3f4b; background: #1e2128; color: #4ec9b0;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 11px; cursor: pointer; transition: background 0.15s ease;
}
.ph-act-term:hover { background: #2b2f38; }
.ph-act-icon {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 3px 8px; border-radius: 6px;
  border: 1px solid var(--border-color); background: var(--card-bg); color: var(--text-secondary);
  font-size: 11px; cursor: pointer; transition: all 0.15s ease;
}
.ph-act-icon:hover, .ph-act-icon.on { background: var(--bg-hover); color: var(--primary-color); border-color: var(--primary-color); }

/* 实时刷新开关 */
.ph-act-live {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 3px 8px; border-radius: 6px;
  border: 1px solid var(--border-color); background: var(--card-bg); color: var(--text-secondary);
  font-size: 11px; cursor: pointer; transition: all 0.15s ease;
}
.ph-act-live:hover { background: var(--bg-hover); }
.ph-act-live.on { color: #20bf6b; border-color: rgba(32, 191, 107, 0.5); }
.ph-online-chip { flex: 0 0 auto; display: inline-flex; align-items: center; font-size: 12px; font-weight: 600; color: #20bf6b; white-space: nowrap; }
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
  position: absolute; top: calc(100% + 4px); right: 0; z-index: 1600;
  min-width: 0;
  display: flex; flex-direction: column; gap: 1px;
  padding: 4px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
}
.ph-export-item {
  display: flex; align-items: center; gap: 8px;
  padding: 5px 10px; border: none; border-radius: 5px;
  background: transparent; color: var(--text-primary);
  font-size: 11px; text-align: left; white-space: nowrap; cursor: pointer;
}
.ph-export-item:hover { background: var(--bg-hover); }
.ph-export-ico {
  flex: 0 0 14px; width: 14px; height: 14px;
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--text-secondary);
}
.ph-export-ico svg { width: 100%; height: 100%; }

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
  flex: 0 0 auto; white-space: nowrap;
  font-size: 10px; padding: 1px 6px; border-radius: 4px;
  background: var(--bg-hover); color: var(--text-tertiary); border: 1px solid var(--border-color);
}
.blk-body { font-size: 13px; line-height: 1.65; color: var(--text-primary); }
.blk-sys-text { font-size: 12.5px; color: var(--text-secondary); white-space: pre-wrap; word-break: break-word; }
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

/* ===== 工具调用定制渲染 ===== */
/* ToolSearch：匹配到的工具列表 */
.ts-list { display: flex; flex-direction: column; gap: 4px; margin-top: 2px; }
.ts-item {
  display: flex; flex-direction: column; gap: 2px;
  padding: 6px 9px; border-radius: 6px;
  background: var(--card-bg); border: 1px solid var(--border-color);
}
.ts-name {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 12px; font-weight: 600; color: var(--k-accent);
  word-break: break-all;
}
.ts-desc { font-size: 12px; color: var(--text-secondary); line-height: 1.45; word-break: break-word; }

/* Markdown 结果：阅读模式 / 源码 切换条 */
.md-bar { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 3px; }
.md-toggle {
  display: inline-flex; flex: 0 0 auto;
  border: 1px solid var(--border-color); border-radius: 6px; overflow: hidden;
}
.md-tab {
  padding: 2px 9px; font-size: 11px; cursor: pointer; user-select: none;
  color: var(--text-secondary); background: var(--card-bg); transition: all 0.12s ease;
}
.md-tab + .md-tab { border-left: 1px solid var(--border-color); }
.md-tab:hover { color: var(--text-primary); }
.md-tab.active { background: var(--k-accent); color: #fff; }
.md-render {
  margin: 4px 0 0;
  padding: 8px 12px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 12.5px;
  max-height: 460px; overflow: auto;
}

/* AskUserQuestion：渲染成问答卡，与工具内容明显区分（蓝=问题 / 绿=已选） */
.ask-detail { display: flex; flex-direction: column; gap: 10px; }
.ask-q {
  padding: 12px 13px;
  border-radius: 10px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
}
.ask-q-head { display: flex; align-items: center; gap: 8px; margin-bottom: 7px; }
.ask-q-badge {
  flex: 0 0 auto; width: 20px; height: 20px; border-radius: 6px;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 700; color: #fff; background: #4f8cff;
}
.ask-q-tag {
  flex: 0 0 auto;
  font-size: 10px; font-weight: 700; letter-spacing: 0.3px;
  padding: 2px 8px; border-radius: 4px;
  color: #4f8cff; background: rgba(79, 140, 255, 0.12);
}
.ask-q-text {
  font-size: 13.5px; font-weight: 600; line-height: 1.6;
  color: var(--text-primary); margin-bottom: 10px;
}
.ask-opts { display: flex; flex-direction: column; gap: 7px; }
.ask-opt {
  display: flex; gap: 10px; align-items: flex-start;
  padding: 9px 11px; border-radius: 8px;
  background: var(--bg-hover); border: 1px solid var(--border-color);
  opacity: 0.7;
}
.ask-opt.chosen {
  opacity: 1;
  border-color: #20bf6b;
  background: rgba(32, 191, 107, 0.09);
  box-shadow: 0 0 0 1px rgba(32, 191, 107, 0.32);
}
.ask-opt-mark {
  flex: 0 0 auto; width: 18px; height: 18px; margin-top: 1px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  border: 1.5px solid var(--text-tertiary); color: transparent;
  font-size: 11px; font-weight: 700; line-height: 1; box-sizing: border-box;
}
.ask-opt.chosen .ask-opt-mark { border-color: #20bf6b; background: #20bf6b; color: #fff; }
.ask-opt-body { flex: 1 1 auto; min-width: 0; }
.ask-opt-label-row { display: flex; align-items: center; gap: 8px; }
.ask-opt-label { font-size: 12.5px; font-weight: 600; color: var(--text-primary); }
.ask-opt.chosen .ask-opt-label { color: #16a34a; }
.ask-opt-badge {
  flex: 0 0 auto; font-size: 10px; font-weight: 700;
  padding: 1px 8px; border-radius: 999px;
  color: #fff; background: #20bf6b;
}
.ask-opt-desc { margin-top: 3px; font-size: 12px; color: var(--text-secondary); line-height: 1.55; }

/* Write：文件路径 + 结果 */
.wr-path {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 12px; color: var(--k-accent); word-break: break-all;
}
.wr-res { font-size: 12px; color: var(--text-secondary); }

/* Read：读取行范围标注 */
.read-range {
  margin-left: 8px;
  font-family: inherit; font-size: 11px; font-weight: 600;
  padding: 1px 7px; border-radius: 999px;
  color: var(--text-secondary); background: var(--bg-hover); border: 1px solid var(--border-color);
}

/* Grep：匹配模式 + 范围 + 命中高亮 */
.grep-pattern {
  margin-top: 2px;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 12.5px; font-weight: 600; color: var(--text-primary);
  background: var(--bg-hover); border: 1px solid var(--border-color);
  border-radius: 6px; padding: 6px 9px; word-break: break-all;
}
.grep-scope { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.grep-chip {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 11px; color: var(--text-secondary);
  background: var(--card-bg); border: 1px solid var(--border-color);
  border-radius: 999px; padding: 1px 8px; word-break: break-all;
}
.grep-chip-k { color: var(--text-tertiary); margin-right: 5px; font-weight: 600; }
.grep-file { padding: 4px 9px; border-radius: 6px; background: var(--card-bg); border: 1px solid var(--border-color); }
.grep-file code {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 12px; color: var(--k-accent); word-break: break-all;
}
.grep-lines {
  margin-top: 2px;
  border: 1px solid var(--border-color); border-radius: 6px; overflow: auto;
  max-height: 460px; background: var(--card-bg);
  font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px; line-height: 1.55;
}
.grep-line { display: flex; gap: 8px; padding: 0 10px; white-space: pre-wrap; word-break: break-word; }
.grep-no { flex: 0 0 auto; min-width: 40px; text-align: right; color: var(--text-tertiary); user-select: none; }
.grep-text { flex: 1 1 auto; min-width: 0; }
.grep-hit { background: rgba(250, 130, 49, 0.10); }
.grep-hit .grep-no { color: #fa8231; font-weight: 700; }
.grep-hit .grep-text { color: var(--text-primary); }
.grep-ctx .grep-text { color: var(--text-secondary); }
.grep-raw .grep-text { color: var(--text-secondary); }
.grep-sep { justify-content: center; color: var(--text-tertiary); }

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

  /* 暗色：AskUserQuestion 问答卡配色 */
  .ask-q-tag { color: #8fb6f5; background: rgba(79, 140, 255, 0.18); }
  .ask-opt.chosen .ask-opt-label { color: #5fcf8d; }

  /* 暗色：Edit diff 配色 */
  .diff-add { background: rgba(32, 191, 107, 0.18); }
  .diff-add .diff-text { color: #7fe0a6; }
  .diff-del { background: rgba(229, 57, 53, 0.18); }
  .diff-del .diff-text { color: #f3a39b; }

  /* 暗色：回底按钮空闲态玻璃底改用深色卡片色调 */
  .ph-jump-bottom { background: rgba(42, 42, 42, 0.6); }
}

/* ---- 页内查找浮层 ---- */
.ph-find {
  position: absolute;
  top: calc(100% + 4px); right: 16px;
  z-index: 1700;
  display: flex; align-items: center; gap: 1px;
  padding: 3px 5px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18);
}
/* 输入框 + 内嵌大小写/全字/正则开关，整体视作一个搜索框 */
.ph-find-box {
  display: flex; align-items: center; gap: 2px;
  height: 28px; padding: 0 4px 0 8px;
  border: 1px solid var(--border-color); border-radius: 6px;
  background: var(--card-bg);
}
.ph-find-box:focus-within { border-color: var(--primary-color); }
.ph-find-box.invalid { border-color: #e5534b; }
.ph-find-input {
  width: 160px; height: 24px;
  border: none; background: transparent; color: var(--text-primary);
  font-size: 13px; outline: none;
}
/* 筛选开关：选中态为描边、无底色 */
.ph-find-toggle {
  width: 24px; height: 22px;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid transparent; border-radius: 4px;
  background: transparent; color: var(--text-secondary);
  font-size: 12px; font-weight: 600; cursor: pointer;
  transition: border-color 0.12s ease, color 0.12s ease;
}
.ph-find-toggle:hover { color: var(--text-primary); }
.ph-find-toggle.on { border-color: var(--primary-color); color: var(--primary-color); background: transparent; }
.ph-find-count {
  min-width: 34px; padding: 0 4px;
  text-align: center; font-size: 12px; color: var(--text-secondary);
  white-space: nowrap;
}
.ph-find-btn {
  width: 22px; height: 24px;
  display: flex; align-items: center; justify-content: center;
  border: none; border-radius: 5px;
  background: transparent; color: var(--text-secondary);
  font-size: 12px; cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;
}
.ph-find-btn:hover:not(:disabled) { background: var(--primary-color); color: #fff; }
.ph-find-btn:disabled { opacity: 0.4; cursor: default; }

/* ---- 查找命中高亮（CSS Custom Highlight API）----
   用不透明背景 + 固定文字色，避免半透明在复杂代码/diff 底色上混色发灰看不清。
   当前焦点用亮黄最醒目；其它命中用青色冷色，避免与橙色的「工具调用」强调色撞色。 */
::highlight(ph-find) { background-color: #22d3ee; color: #0a2b33; }
::highlight(ph-find-current) { background-color: #ffe100; color: #000; }

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
  display: flex; align-items: center; gap: 10px;
  margin: 8px 0; padding: 9px 12px;
  border: 1px solid var(--border-color); border-radius: 10px;
  background: var(--bg-hover);
}
.chat-subtask-notice.clickable { cursor: pointer; transition: border-color 0.12s ease, background 0.12s ease; }
.chat-subtask-notice.clickable:hover { border-color: var(--primary-color); background: var(--card-bg); }
.csn-ico {
  flex: 0 0 auto; width: 26px; height: 26px; border-radius: 7px;
  display: flex; align-items: center; justify-content: center;
  background: var(--primary-color); color: #fff;
}
.csn-body { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.csn-title { font-size: 13px; font-weight: 600; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.csn-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 3px 10px; font-size: 11px; color: var(--text-tertiary); }
.csn-status { padding: 0 6px; border-radius: 999px; background: rgba(127, 127, 127, 0.16); color: var(--text-secondary); text-transform: capitalize; }
.csn-status.st-completed { background: rgba(92, 197, 133, 0.16); color: #3aa564; }
.csn-type { padding: 0 6px; border-radius: 999px; background: rgba(127, 127, 127, 0.16); color: var(--text-secondary); }
.csn-go { flex: 0 0 auto; align-self: center; font-size: 12px; color: var(--primary-color); }
.ph-act-back { border-color: var(--primary-color); color: var(--primary-color); }
.ph-act-back:hover { background: var(--primary-color); color: #fff; }
</style>
