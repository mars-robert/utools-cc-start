<script lang="ts" setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { marked } from 'marked'

defineProps({ enterAction: { type: Object, required: true } })

type Tab = 'installed' | 'marketplaces' | 'discover'

const activeTab = ref<Tab>('installed')
const query = ref('')
const error = ref('')
const toast = ref('')
const cliAvailable = ref(true)

const installed = ref<any[]>([])
const marketplaces = ref<any[]>([])
const mpDetail = ref<any>(null)
const hot = ref<any>({ marketplaces: [], recommended: [], source: '', fetchedAt: '' })
const discoverLoading = ref(false)
const catFilter = ref('全部')

const busy = ref<Record<string, boolean>>({})
const confirmTarget = ref<any>(null)
const showAddMp = ref(false)
const addMpInput = ref('')
const detail = ref<any>(null)
const showReadme = ref(true)

const activeIndex = ref(0)
const itemRefs = ref<HTMLElement[]>([])
const containerRef = ref<HTMLElement | null>(null)

// 导航滑动下划线：测量激活 tab 的位置/宽度，指示条平滑移动过去
const tabEls: Record<string, HTMLElement> = {}
const indicator = ref({ left: 0, width: 0 })
const BAR_W = 24 // 短指示条固定宽度，居中于激活 tab 下方
const updateIndicator = () => {
  nextTick(() => { const el = tabEls[activeTab.value]; if (el) indicator.value = { left: Math.round(el.offsetLeft + (el.offsetWidth - BAR_W) / 2), width: BAR_W } })
}

const SOURCE_LABEL: Record<string, string> = { live: '实时', cache: '缓存', offline: '离线' }

let toastTimer: number | null = null
const showToast = (m: string) => { toast.value = m; if (toastTimer !== null) clearTimeout(toastTimer); toastTimer = window.setTimeout(() => { toast.value = '' }, 2200) }
const isBusy = (id: string) => !!busy.value[id]
const fmtStars = (n: number) => (n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(n || 0))
const fmtTime = (iso: string) => (iso ? iso.slice(0, 16).replace('T', ' ') : '')
const fmtDate = (iso: string) => (iso ? iso.slice(0, 10) : '—')
const capsOf = (c: any) => {
  if (!c) return []
  const out: any[] = []
  if (c.skills) out.push({ k: 'skill', n: c.skills, label: 'skills' })
  if (c.commands) out.push({ k: 'cmd', n: c.commands, label: 'commands' })
  if (c.agents) out.push({ k: 'agent', n: c.agents, label: 'agents' })
  if (c.hooks) out.push({ k: 'hook', n: '', label: 'hooks' })
  if (c.mcp) out.push({ k: 'mcp', n: '', label: 'MCP' })
  return out
}
const openExternal = (url: string) => { const u = window.utools as any; if (url && u?.shellOpenExternal) u.shellOpenExternal(url) }
const openPath = (p: string) => { const u = window.utools as any; if (p && u?.shellOpenPath) u.shellOpenPath(p) }

// 卡片光标特效：聚光灯跟随（--mx/--my）+ 轻微 3D 倾斜上浮（尊重 reduced-motion）
const reduceMotion = typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
const onCardMove = (e: MouseEvent) => {
  const el = e.currentTarget as HTMLElement
  const r = el.getBoundingClientRect()
  const px = (e.clientX - r.left) / r.width
  const py = (e.clientY - r.top) / r.height
  el.style.setProperty('--mx', (px * 100).toFixed(1) + '%')
  el.style.setProperty('--my', (py * 100).toFixed(1) + '%')
  if (!reduceMotion) el.style.transform = `perspective(720px) rotateX(${((0.5 - py) * 5).toFixed(2)}deg) rotateY(${((px - 0.5) * 5).toFixed(2)}deg) translateY(-3px)`
}
const onCardLeave = (e: MouseEvent) => { (e.currentTarget as HTMLElement).style.transform = '' }

// 回到顶部：监听当前活跃滚动容器，滚过阈值浮现按钮
const scrollTop = ref(0)
const scrollEl = ref<HTMLElement | null>(null)
const showBackTop = computed(() => scrollTop.value > 320)
const onScroll = (e: Event) => { const el = e.target as HTMLElement; scrollEl.value = el; scrollTop.value = el.scrollTop }
const backToTop = () => { scrollEl.value?.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' }) }

// README 渲染：marked 转 HTML + 轻量 sanitize（本地可信内容，主要防脚本/事件注入）
const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const sanitize = (html: string) => html
  .replace(/<\s*(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
  .replace(/<\s*(script|style|iframe|object|embed)[^>]*\/?>/gi, '')
  .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
  .replace(/(href|src)\s*=\s*("|')?\s*javascript:[^"'>\s]*/gi, '$1="#"')
const readmeHtml = computed(() => {
  const md = detail.value && detail.value.readme
  if (!md) return ''
  try { return sanitize(marked.parse(md, { breaks: true }) as string) } catch (_) { return escapeHtml(md) }
})

const q = () => query.value.trim().toLowerCase()
const filteredInstalled = computed(() => installed.value.filter((p) => { const s = q(); return !s || p.name.toLowerCase().includes(s) || (p.marketplace || '').toLowerCase().includes(s) || (p.description || '').toLowerCase().includes(s) }))
const filteredMarkets = computed(() => marketplaces.value.filter((m) => { const s = q(); return !s || m.name.toLowerCase().includes(s) || (m.sourceLabel || '').toLowerCase().includes(s) }))
const discMarkets = computed(() => (hot.value.marketplaces || []).filter((m: any) => { const s = q(); return !s || m.name.toLowerCase().includes(s) || (m.description || '').toLowerCase().includes(s) }))
const catChips = computed(() => {
  const counts: Record<string, number> = {}
  for (const p of (hot.value.recommended || [])) { const c = p.category || '其他'; counts[c] = (counts[c] || 0) + 1 }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8)
  return [{ key: '全部', count: (hot.value.recommended || []).length }, ...sorted.map(([key, count]) => ({ key, count }))]
})
// 数据驱动的「优秀」信号：官方目录来源 → 「官方」；所属商城 star 达阈值 → 「热门」。不再靠硬编码名单。
const HOT_STARS = 1000
const isOfficial = (p: any) => !!p.official
const isHot = (p: any) => (p.stars || 0) >= HOT_STARS
const discRecs = computed(() => {
  const s = q()
  const list = (hot.value.recommended || []).filter((p: any) => {
    const catOk = catFilter.value === '全部' || (p.category || '其他') === catFilter.value
    const qOk = !s || (p.plugin || '').toLowerCase().includes(s) || (p.description || '').toLowerCase().includes(s) || (p.author || '').toLowerCase().includes(s) || (p.marketplace || '').toLowerCase().includes(s)
    return catOk && qOk
  })
  // 按热度（所属商城 star）降序：官方目录 star 最高自然置顶，其余多源插件按各自商城热度跟随
  return list.slice().sort((a: any, b: any) => (b.stars || 0) - (a.stars || 0))
})
const currentList = computed<any[]>(() => {
  if (activeTab.value === 'installed') return filteredInstalled.value
  if (activeTab.value === 'marketplaces') return filteredMarkets.value
  return [...discMarkets.value, ...discRecs.value]
})

const loadInstalled = () => { try { installed.value = window.services.listInstalledPlugins() } catch (e: any) { error.value = e?.message || String(e) } }
const loadMarkets = () => { try { marketplaces.value = window.services.listKnownMarketplaces() } catch (e: any) { error.value = e?.message || String(e) } }
const loadDiscover = () => { try { hot.value = window.services.getHotList() } catch (e: any) { error.value = e?.message || String(e) } }
const refreshDiscover = () => {
  discoverLoading.value = true; error.value = ''
  window.services.refreshHotList()
    .then((h: any) => { hot.value = h; if (h.source !== 'live') showToast(h.source === 'cache' ? '联网失败，显示缓存' : '联网失败，暂无数据') })
    .catch((e: any) => { error.value = e?.message || String(e) })
    .finally(() => { discoverLoading.value = false; updateIndicator() })
}
const reloadAfterMutation = () => {
  loadInstalled(); loadMarkets()
  if (mpDetail.value) { try { mpDetail.value = { ...mpDetail.value, plugins: window.services.listMarketplacePlugins(mpDetail.value.name) } } catch (_) { /* 忽略 */ } }
  loadDiscover()
  if (recDetail.value) { const np = (hot.value.recommended || []).find((x: any) => x.id === recDetail.value.id); if (np) recDetail.value = np }
  if (detail.value) { try { detail.value = window.services.getInstalledPluginDetail(detail.value.id) } catch (_) { /* 忽略 */ } }
}

const runMutation = async (id: string, fn: () => Promise<any>, okMsg: string) => {
  if (!cliAvailable.value) { showToast('未检测到 claude CLI'); return }
  error.value = ''
  busy.value = { ...busy.value, [id]: true }
  try {
    const r = await fn()
    if (r && r.success) { showToast(okMsg); reloadAfterMutation() }
    else { error.value = (r && (r.stderr || r.stdout || '').toString().trim()) || '操作失败' }
  } catch (e: any) { error.value = e?.message || String(e) } finally { const b = { ...busy.value }; delete b[id]; busy.value = b }
}
const toggleEnable = (p: any) => p.enabled
  ? runMutation(p.id, () => window.services.disablePlugin(p.id), '已停用 ' + p.name)
  : runMutation(p.id, () => window.services.enablePlugin(p.id), '已启用 ' + p.name)
const doUpdate = (p: any) => runMutation(p.id, () => window.services.updatePlugin(p.id), '已更新 ' + p.name + '（重启会话后生效）')
const askUninstall = (p: any) => { confirmTarget.value = { kind: 'uninstall', id: p.id, label: p.id } }

const openDetail = (p: any) => { try { detail.value = window.services.getInstalledPluginDetail(p.id); showReadme.value = true } catch (e: any) { error.value = e?.message || String(e) } }
const closeDetail = () => { detail.value = null }

// 推荐插件详情（未安装：展示官方目录已有信息 + GitHub 入口 + 安装）
const recDetail = ref<any>(null)
const openRecDetail = (p: any) => { recDetail.value = p }
const closeRecDetail = () => { recDetail.value = null }
const recRepoUrl = (p: any) => {
  if (p.repo) return 'https://github.com/' + p.repo
  const mp = (hot.value.marketplaces || []).find((m: any) => m.name === p.marketplace)
  if (mp && mp.url) return mp.url
  return p.marketplace === 'claude-plugins-official' ? 'https://github.com/anthropics/claude-plugins-official' : ''
}

const openMp = (m: any) => {
  let plugins: any[] = []
  try { plugins = window.services.listMarketplacePlugins(m.name) } catch (e: any) { error.value = e?.message || String(e) }
  mpDetail.value = { ...m, plugins }
}
const closeMp = () => { mpDetail.value = null }
// 热门商城详情：该商城未必已添加到本地，用发现数据里它的插件做只读预览 + 提供「添加商城」入口
const openHotMp = (m: any) => {
  const plugins = (hot.value.recommended || [])
    .filter((p: any) => p.marketplace === m.name)
    .map((p: any) => ({ name: p.plugin, description: p.description, category: p.category, installed: p.installed }))
  mpDetail.value = { name: m.name, sourceLabel: m.repo, plugins, hot: true, repo: m.repo, url: m.url, stars: m.stars, known: m.known }
}
const askRemoveMp = (m: any) => { confirmTarget.value = { kind: 'removeMp', name: m.name, label: m.name } }
const installFromMp = (p: any, mp: string) => runMutation(p.name + '@' + mp, () => window.services.installPlugin(p.name, mp), '已安装 ' + p.name)
const openAddMp = () => { addMpInput.value = ''; showAddMp.value = true; nextTick(() => (document.getElementById('addmp-input') as HTMLInputElement)?.focus()) }
const submitAddMp = () => { const s = addMpInput.value.trim(); if (!s) return; runMutation('addmp:' + s, () => window.services.addMarketplace(s), '已添加商城'); showAddMp.value = false }
const addMpFromHot = (m: any) => { if (m.repo) runMutation('addmp:' + m.repo, () => window.services.addMarketplace(m.repo), '已添加商城 ' + m.name) }
const installRec = (p: any) => runMutation(p.id, () => window.services.installPlugin(p.plugin, p.marketplace), '已安装 ' + p.plugin)

const confirmYes = () => {
  const t = confirmTarget.value; confirmTarget.value = null
  if (!t) return
  if (t.kind === 'uninstall') runMutation(t.id, () => window.services.uninstallPlugin(t.id), '已卸载 ' + t.label)
  else if (t.kind === 'removeMp') runMutation('rmmp:' + t.name, () => window.services.removeMarketplace(t.name), '已移除商城 ' + t.label)
}
const confirmNo = () => { confirmTarget.value = null }

const TABS: { id: Tab; label: string }[] = [
  { id: 'installed', label: '已装插件' },
  { id: 'marketplaces', label: '商城' },
  { id: 'discover', label: '发现' }
]
const tabCount = (t: Tab) => t === 'installed' ? installed.value.length : t === 'marketplaces' ? marketplaces.value.length : ((hot.value.marketplaces || []).length + (hot.value.recommended || []).length)
const switchTab = (t: Tab) => {
  if (activeTab.value === t) return
  activeTab.value = t
  query.value = ''; activeIndex.value = 0; itemRefs.value = []; scrollTop.value = 0
  const u = window.utools as any
  if (u && typeof u.setSubInputValue === 'function') u.setSubInputValue('')
  if (t === 'discover' && hot.value.source === 'offline') refreshDiscover()
}

let lastNavAt = 0
const scrollActiveIntoView = () => {
  const now = Date.now(); const fast = now - lastNavAt < 120; lastNavAt = now
  nextTick(() => { const el = itemRefs.value[activeIndex.value]; if (el?.scrollIntoView) el.scrollIntoView({ block: 'nearest', behavior: fast ? 'auto' : 'smooth' }) })
}
const setActive = (i: number) => { activeIndex.value = i; scrollActiveIntoView() }
const onEnterItem = () => {
  const i = activeIndex.value
  if (activeTab.value === 'installed') { const p = filteredInstalled.value[i]; if (p) openDetail(p) }
  else if (activeTab.value === 'marketplaces') { const m = filteredMarkets.value[i]; if (m) openMp(m) }
  else {
    const nMp = discMarkets.value.length
    if (i < nMp) { const m = discMarkets.value[i]; if (m) openHotMp(m) }
    else { const p = discRecs.value[i - nMp]; if (p) openRecDetail(p) }
  }
}
const onKeydown = (e: KeyboardEvent) => {
  if (recDetail.value) { if (e.key === 'Escape') { e.preventDefault(); closeRecDetail() } return }
  if (detail.value) { if (e.key === 'Escape') { e.preventDefault(); closeDetail() } return }
  if (mpDetail.value) { if (e.key === 'Escape') { e.preventDefault(); closeMp() } return }
  if (showAddMp.value) { if (e.key === 'Escape') { e.preventDefault(); showAddMp.value = false } else if (e.key === 'Enter') { e.preventDefault(); submitAddMp() } return }
  if (confirmTarget.value) { if (e.key === 'Escape') { e.preventDefault(); confirmNo() } else if (e.key === 'Enter') { e.preventDefault(); confirmYes() } return }
  if (e.key === 'ArrowDown') { e.preventDefault(); if (activeIndex.value < currentList.value.length - 1) setActive(activeIndex.value + 1) }
  else if (e.key === 'ArrowUp') { e.preventDefault(); if (activeIndex.value > 0) setActive(activeIndex.value - 1) }
  else if (e.key === 'Enter') { e.preventDefault(); onEnterItem() }
  else if (e.key === 'Tab') { e.preventDefault(); const idx = TABS.findIndex((t) => t.id === activeTab.value); switchTab(TABS[(idx + (e.shiftKey ? TABS.length - 1 : 1)) % TABS.length].id) }
}

watch(activeTab, updateIndicator)

onMounted(() => {
  loadInstalled(); loadMarkets(); loadDiscover()
  if (hot.value.source === 'offline') refreshDiscover()
  Promise.resolve(window.services.detectClaudeCli()).then((ok: boolean) => { cliAvailable.value = ok }).catch(() => { cliAvailable.value = false })
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', updateIndicator)
  if (window.utools?.setSubInput) window.utools.setSubInput(({ text }: { text: string }) => { query.value = text; activeIndex.value = 0 }, '搜索插件 / 商城 / 功能…')
  nextTick(() => { containerRef.value?.focus(); updateIndicator() })
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', updateIndicator)
  if (toastTimer !== null) clearTimeout(toastTimer)
  if (window.utools?.removeSubInput) window.utools.removeSubInput()
})
</script>

<template>
  <div ref="containerRef" class="pc" tabindex="0">
    <!-- 导航 -->
    <header class="pc-nav">
      <nav class="pc-tabs">
        <button v-for="t in TABS" :key="t.id" :ref="(el) => { if (el) tabEls[t.id] = el as HTMLElement }" class="pc-tab" :class="{ on: activeTab === t.id }" @click="switchTab(t.id)">
          <span class="pc-tab-ico">
            <svg v-if="t.id === 'installed'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2" pathLength="1"/><polyline points="2 17 12 22 22 17" pathLength="1"/><polyline points="2 12 12 17 22 12" pathLength="1"/></svg>
            <svg v-else-if="t.id === 'marketplaces'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l1.6-5h14.8L21 9" pathLength="1"/><path d="M4.5 9v10.5a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1V9" pathLength="1"/><path d="M9.5 20.5V14h5v6.5" pathLength="1"/></svg>
            <svg v-else viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.5l2 5.6 5.6 2-5.6 2-2 5.6-2-5.6-5.6-2 5.6-2z" pathLength="1"/><path d="M19 14l.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9z" pathLength="1"/></svg>
          </span>
          <span class="pc-tab-label">{{ t.label }}</span>
          <span class="pc-tab-n">{{ tabCount(t.id) }}</span>
        </button>
        <span class="pc-tab-bar" :style="{ transform: `translateX(${indicator.left}px)`, width: indicator.width + 'px' }" />
      </nav>
      <div class="pc-nav-act">
        <button v-if="activeTab === 'marketplaces'" class="btn btn-primary pc-btn pc-navbtn" :disabled="!cliAvailable" @click="openAddMp">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          <span>添加商城</span>
        </button>
        <button v-if="activeTab === 'discover'" class="pc-refresh" :class="{ spinning: discoverLoading }" :disabled="discoverLoading" title="联网刷新热门" @click="refreshDiscover">
          <svg class="pc-refresh-ico" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          <span>{{ discoverLoading ? '刷新中' : '刷新' }}</span>
        </button>
      </div>
    </header>

    <div v-if="!cliAvailable" class="pc-note">未检测到 <code>claude</code> CLI，当前仅可浏览。安装 Claude Code 后即可启停 / 安装 / 增删。</div>
    <div v-if="error" class="pc-err">{{ error }}</div>
    <transition name="pc-fade"><div v-if="toast" class="pc-toast">{{ toast }}</div></transition>

    <!-- ===== 已装插件（卡片网格）===== -->
    <main v-if="activeTab === 'installed'" class="pc-scroll" @scroll="onScroll">
      <div v-if="filteredInstalled.length === 0" class="pc-empty">
        <svg class="pc-empty-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
        <p>{{ query ? '没有匹配的插件' : '还没有安装任何插件' }}</p>
        <button v-if="!query" class="btn btn-primary pc-btn" @click="switchTab('discover')">去发现插件</button>
      </div>
      <div v-else class="pc-grid pc-grid-inst">
        <article v-for="(p, i) in filteredInstalled" :key="p.id" :ref="(el) => { if (el) itemRefs[i] = el as HTMLElement }"
          class="pc-pcard" :class="{ on: i === activeIndex, off: !p.enabled }" @mouseenter="activeIndex = i" @mousemove="onCardMove" @mouseleave="onCardLeave" @click="openDetail(p)">
          <div class="pc-pcard-top">
            <div class="pc-pcard-name" :title="p.name">{{ p.name }}</div>
            <div class="pc-ops" @click.stop v-if="cliAvailable">
              <button class="pc-sw" :class="{ on: p.enabled }" :disabled="isBusy(p.id)" :title="p.enabled ? '点击停用' : '点击启用'" @click="toggleEnable(p)"><span /></button>
              <button class="pc-ico accent" title="更新" :disabled="isBusy(p.id)" @click="doUpdate(p)"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg></button>
              <button class="pc-ico danger" title="卸载" :disabled="isBusy(p.id)" @click="askUninstall(p)"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
            </div>
          </div>
          <div class="pc-pcard-desc">{{ p.description || '（该插件未提供描述）' }}</div>
          <div v-if="capsOf(p.components).length" class="pc-caps">
            <span v-for="cap in capsOf(p.components)" :key="cap.k" class="pc-cap" :class="'cap-' + cap.k"><b v-if="cap.n" class="pc-mono">{{ cap.n }}</b>{{ cap.label }}</span>
          </div>
          <div class="pc-pcard-foot">
            <span class="pc-mono pc-muted">{{ p.marketplace }}</span>
            <span class="pc-mono pc-muted" v-if="p.version">v{{ p.version }}</span>
          </div>
        </article>
      </div>
    </main>

    <!-- ===== 商城管理（卡片网格）===== -->
    <main v-else-if="activeTab === 'marketplaces'" class="pc-scroll" @scroll="onScroll">
      <div v-if="filteredMarkets.length === 0" class="pc-empty">
        <svg class="pc-empty-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l1.6-5h14.8L21 9"/><path d="M4.5 9v10.5a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1V9"/><path d="M9.5 20.5V14h5v6.5"/></svg>
        <p>{{ query ? '没有匹配的商城' : '还没有添加任何商城' }}</p>
        <button v-if="!query && cliAvailable" class="btn btn-primary pc-btn" @click="openAddMp">＋ 添加商城</button>
      </div>
      <div v-else class="pc-grid pc-grid-inst">
        <article v-for="(m, i) in filteredMarkets" :key="m.name" :ref="(el) => { if (el) itemRefs[i] = el as HTMLElement }"
          class="pc-pcard" :class="{ on: i === activeIndex }" @mouseenter="activeIndex = i" @mousemove="onCardMove" @mouseleave="onCardLeave" @click="openMp(m)">
          <div class="pc-pcard-top">
            <div class="pc-pcard-name" :title="m.name">{{ m.name }}</div>
            <div class="pc-ops" @click.stop v-if="cliAvailable">
              <button class="pc-ico danger" title="移除商城" :disabled="isBusy('rmmp:' + m.name)" @click="askRemoveMp(m)"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
            </div>
          </div>
          <div class="pc-mp-src pc-mono pc-muted" :title="m.sourceLabel">{{ m.sourceLabel || '—' }}</div>
          <div class="pc-pcard-foot">
            <span class="pc-cnt"><b class="pc-mono">{{ m.pluginCount }}</b> plugins</span>
            <span class="pc-mono pc-muted" v-if="m.lastUpdated">{{ fmtDate(m.lastUpdated) }}</span>
          </div>
        </article>
      </div>
    </main>

    <!-- ===== 热门发现 ===== -->
    <main v-else class="pc-scroll" @scroll="onScroll">
      <div class="pc-meta">
        <span class="pc-src-badge" :class="hot.source">{{ SOURCE_LABEL[hot.source] || '—' }}</span>
        <span v-if="hot.fetchedAt" class="pc-mono pc-muted">更新 {{ fmtTime(hot.fetchedAt) }}</span>
        <span class="pc-muted">· 数据实时来自 GitHub</span>
      </div>
      <template v-if="discoverLoading && !discMarkets.length && !discRecs.length">
        <div class="pc-grid"><div v-for="n in 6" :key="n" class="pc-card skeleton" /></div>
      </template>
      <template v-else-if="hot.source === 'offline' && !discMarkets.length && !discRecs.length">
        <div class="pc-empty">
          <svg class="pc-empty-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
          <p>需要联网获取热门内容</p>
          <button class="btn btn-primary pc-btn" @click="refreshDiscover">联网刷新</button>
        </div>
      </template>
      <template v-else>
        <section v-if="discMarkets.length" class="pc-sec">
          <div class="pc-sec-h"><span class="pc-eyebrow">热门商城</span><span class="pc-muted">GitHub · 按 Star 排序</span></div>
          <div class="pc-grid">
            <article v-for="(m, i) in discMarkets" :key="m.repo" :ref="(el) => { if (el) itemRefs[i] = el as HTMLElement }" class="pc-card pc-mpcard" :class="{ on: i === activeIndex }" @mouseenter="activeIndex = i" @mousemove="onCardMove" @mouseleave="onCardLeave" @click="openHotMp(m)">
              <div class="pc-card-title"><span v-if="i < 3" class="pc-rank" :class="'r' + (i + 1)">#{{ i + 1 }}</span>{{ m.name }}</div>
              <div class="pc-card-meta"><span class="pc-mono pc-star">★ {{ fmtStars(m.stars) }}</span><span v-if="m.pluginCount" class="pc-mono pc-muted">· {{ m.pluginCount }} 插件</span></div>
              <div class="pc-card-desc">{{ m.description || m.repo }}</div>
              <div class="pc-card-foot">
                <span class="pc-mono pc-muted pc-repo">{{ m.repo }}</span>
                <span v-if="m.known" class="pc-badge-ok">已添加</span>
                <button v-else-if="cliAvailable" class="btn btn-primary pc-btn" :class="{ loading: isBusy('addmp:' + m.repo) }" :disabled="isBusy('addmp:' + m.repo)" @click.stop="addMpFromHot(m)">添加</button>
              </div>
            </article>
          </div>
        </section>
        <section v-if="hot.recommended && hot.recommended.length" class="pc-sec">
          <div class="pc-sec-h"><span class="pc-eyebrow">插件推荐</span><span class="pc-muted">多源聚合 · {{ hot.recommended.length }} 款 · 按热度排序</span></div>
          <div class="pc-chips">
            <button v-for="c in catChips" :key="c.key" class="pc-fchip" :class="{ on: catFilter === c.key }" @click="catFilter = c.key; activeIndex = discMarkets.length">
              {{ c.key }}<span class="pc-mono pc-fchip-n">{{ c.count }}</span>
            </button>
          </div>
          <div v-if="discRecs.length === 0" class="pc-empty sm"><p>该分类下暂无匹配插件</p></div>
          <div v-else class="pc-grid">
            <article v-for="(p, j) in discRecs" :key="p.id" :ref="(el) => { if (el) itemRefs[discMarkets.length + j] = el as HTMLElement }" class="pc-card pc-reccard" :class="{ on: discMarkets.length + j === activeIndex, feat: isOfficial(p) }" @mouseenter="activeIndex = discMarkets.length + j" @mousemove="onCardMove" @mouseleave="onCardLeave" @click="openRecDetail(p)">
              <div class="pc-card-title"><span v-if="isOfficial(p)" class="pc-tag-off">官方</span><span v-else-if="isHot(p)" class="pc-tag-hot">🔥 热门</span>{{ p.plugin }}</div>
              <div class="pc-card-meta"><span v-if="p.stars" class="pc-mono pc-star">★ {{ fmtStars(p.stars) }}</span><span v-if="p.category" class="pc-cat">{{ p.category }}</span><span v-if="p.author" class="pc-muted">{{ p.author }}</span></div>
              <div class="pc-card-desc">{{ p.description }}</div>
              <div class="pc-card-foot">
                <span class="pc-mono pc-muted pc-repo" :title="p.marketplace">{{ p.marketplace }}</span>
                <span v-if="p.installed" class="pc-badge-ok">已安装</span>
                <button v-else-if="cliAvailable" class="btn btn-primary pc-btn" :class="{ loading: isBusy(p.id) }" :disabled="isBusy(p.id)" @click.stop="installRec(p)">安装</button>
              </div>
            </article>
          </div>
        </section>
      </template>
    </main>

    <!-- 回到顶部 -->
    <transition name="pc-bt">
      <button v-show="showBackTop" class="pc-backtop" title="回到顶部" @click="backToTop">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
      </button>
    </transition>

    <!-- ===== 商城详情 sheet：可安装插件清单 ===== -->
    <transition name="pc-pop">
    <div v-if="mpDetail" class="pc-mask" @click.self="closeMp">
      <div class="pc-sheet">
        <div class="pc-sheet-h">
          <div>
            <div class="pc-sheet-name">{{ mpDetail.name }}</div>
            <div class="pc-mono pc-muted pc-sheet-id">{{ mpDetail.sourceLabel || '—' }} · {{ mpDetail.plugins.length }} plugins<span v-if="mpDetail.hot && mpDetail.stars" class="pc-star"> · ★ {{ fmtStars(mpDetail.stars) }}</span></div>
          </div>
          <button class="pc-ico" title="关闭" @click="closeMp"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>
        <div class="pc-sheet-body">
          <div v-if="mpDetail.hot" class="pc-hotmp-bar">
            <span class="pc-muted">来自 GitHub 发现 · 添加商城后可在「商城」安装其插件</span>
            <div class="pc-hotmp-act">
              <a v-if="mpDetail.url" class="pc-link" @click="openExternal(mpDetail.url)">GitHub ↗</a>
              <span v-if="mpDetail.known" class="pc-badge-ok">已添加</span>
              <button v-else-if="cliAvailable" class="btn btn-primary pc-btn" :class="{ loading: isBusy('addmp:' + mpDetail.repo) }" :disabled="isBusy('addmp:' + mpDetail.repo)" @click="addMpFromHot({ repo: mpDetail.repo, name: mpDetail.name })">＋ 添加商城</button>
            </div>
          </div>
          <div v-if="mpDetail.plugins.length === 0" class="pc-nested-empty">{{ mpDetail.hot ? '该商城暂无可预览的插件。' : '该商城无可安装插件，或清单尚未克隆到本地。' }}</div>
          <div v-else class="pc-mplist">
            <div v-for="p in mpDetail.plugins" :key="p.name" class="pc-nested-item">
              <div class="pc-ni-main">
                <div class="pc-ni-title">{{ p.name }}<span v-if="p.category" class="pc-cat">{{ p.category }}</span></div>
                <div class="pc-ni-desc">{{ p.description }}</div>
              </div>
              <span v-if="p.installed" class="pc-badge-ok">已安装</span>
              <button v-else-if="!mpDetail.hot && cliAvailable" class="btn btn-primary pc-btn" :class="{ loading: isBusy(p.name + '@' + mpDetail.name) }" :disabled="isBusy(p.name + '@' + mpDetail.name)" @click="installFromMp(p, mpDetail.name)">安装</button>
            </div>
          </div>
        </div>
      </div>
    </div>
    </transition>

    <!-- ===== 推荐插件详情 sheet（未安装：官方目录信息 + GitHub + 安装）===== -->
    <transition name="pc-pop">
    <div v-if="recDetail" class="pc-mask" @click.self="closeRecDetail">
      <div class="pc-sheet pc-sheet-sm">
        <div class="pc-sheet-h">
          <div>
            <div class="pc-sheet-name">{{ recDetail.plugin }}<span v-if="isOfficial(recDetail)" class="pc-tag-off">官方</span><span v-else-if="isHot(recDetail)" class="pc-tag-hot">🔥 热门</span></div>
            <div class="pc-mono pc-muted pc-sheet-id">{{ recDetail.marketplace }}</div>
          </div>
          <button class="pc-ico" title="关闭" @click="closeRecDetail"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>
        <div class="pc-sheet-body">
          <p class="pc-sheet-desc">{{ recDetail.description || '（该插件未提供描述）' }}</p>
          <dl class="pc-metagrid">
            <div v-if="recDetail.category"><dt>分类</dt><dd>{{ recDetail.category }}</dd></div>
            <div v-if="recDetail.author"><dt>作者</dt><dd>{{ recDetail.author }}</dd></div>
            <div><dt>所属商城</dt><dd>{{ recDetail.marketplace }}</dd></div>
            <div v-if="recDetail.stars"><dt>商城热度</dt><dd class="pc-mono pc-star">★ {{ fmtStars(recDetail.stars) }}</dd></div>
            <div><dt>来源</dt><dd>{{ recDetail.official ? '官方目录' : '热门商城' }}</dd></div>
            <div><dt>状态</dt><dd>{{ recDetail.installed ? '已安装' : '未安装' }}</dd></div>
          </dl>
          <p class="pc-muted pc-rec-hint">README 与能力清单需安装后查看。</p>
          <div v-if="recRepoUrl(recDetail)" class="pc-path-row">
            <a class="pc-link" @click="openExternal(recRepoUrl(recDetail))">在 GitHub 查看该商城 ↗</a>
          </div>
        </div>
        <div class="pc-sheet-f" v-if="cliAvailable">
          <span class="pc-muted pc-sw-label">{{ recDetail.official ? '来自官方目录' : '来自 ' + recDetail.marketplace }}</span>
          <div class="pc-sheet-f-r">
            <span v-if="recDetail.installed" class="pc-badge-ok">已安装</span>
            <button v-else class="btn btn-primary pc-btn" :class="{ loading: isBusy(recDetail.id) }" :disabled="isBusy(recDetail.id)" @click="installRec(recDetail)">安装</button>
          </div>
        </div>
      </div>
    </div>
    </transition>

    <!-- ===== 详情弹窗 ===== -->
    <transition name="pc-pop">
    <div v-if="detail" class="pc-mask" @click.self="closeDetail">
      <div class="pc-sheet">
        <div class="pc-sheet-h">
          <div>
            <div class="pc-sheet-name">{{ detail.name }}<span class="pc-status" :class="detail.enabled ? 'on' : 'off'">{{ detail.enabled ? '启用中' : '已停用' }}</span></div>
            <div class="pc-mono pc-muted pc-sheet-id">{{ detail.marketplace }} · v{{ detail.version || '—' }}</div>
          </div>
          <button class="pc-ico" title="关闭" @click="closeDetail"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>
        <div class="pc-sheet-body">
          <p class="pc-sheet-desc">{{ detail.description || '（该插件未提供描述）' }}</p>
          <div v-if="detail.keywords && detail.keywords.length" class="pc-kw">
            <span v-for="k in detail.keywords" :key="k" class="pc-cat">{{ k }}</span>
          </div>
          <dl class="pc-metagrid">
            <div><dt>范围</dt><dd>{{ detail.scope || '—' }}</dd></div>
            <div><dt>安装于</dt><dd class="pc-mono">{{ fmtDate(detail.installedAt) }}</dd></div>
            <div><dt>更新于</dt><dd class="pc-mono">{{ fmtDate(detail.lastUpdated) }}</dd></div>
            <div v-if="detail.author"><dt>作者</dt><dd>{{ detail.author }}</dd></div>
            <div v-if="detail.license"><dt>许可证</dt><dd>{{ detail.license }}</dd></div>
            <div v-if="detail.homepage"><dt>主页</dt><dd><a class="pc-link" @click="openExternal(detail.homepage)">{{ detail.homepage }}</a></dd></div>
          </dl>

          <div v-if="detail.skills.length" class="pc-comp"><div class="pc-comp-h">Skills <span class="pc-mono">{{ detail.skills.length }}</span></div><div class="pc-comp-list"><span v-for="n in detail.skills" :key="n" class="pc-name">{{ n }}</span></div></div>
          <div v-if="detail.commands.length" class="pc-comp"><div class="pc-comp-h">Commands <span class="pc-mono">{{ detail.commands.length }}</span></div><div class="pc-comp-list"><span v-for="n in detail.commands" :key="n" class="pc-name">/{{ n }}</span></div></div>
          <div v-if="detail.agents.length" class="pc-comp"><div class="pc-comp-h">Agents <span class="pc-mono">{{ detail.agents.length }}</span></div><div class="pc-comp-list"><span v-for="n in detail.agents" :key="n" class="pc-name">{{ n }}</span></div></div>
          <div class="pc-comp" v-if="detail.components.hooks || detail.components.mcp"><div class="pc-comp-h">Capabilities</div><div class="pc-comp-list"><span v-if="detail.components.hooks" class="pc-name">hooks</span><span v-if="detail.components.mcp" class="pc-name">MCP servers</span></div></div>

          <div v-if="readmeHtml" class="pc-readme">
            <button class="pc-readme-h" @click="showReadme = !showReadme">
              <svg class="pc-readme-caret" :class="{ open: showReadme }" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              <span>README</span>
            </button>
            <div v-show="showReadme" class="pc-readme-body md" v-html="readmeHtml"></div>
          </div>

          <div v-if="detail.installPath" class="pc-path-row">
            <span class="pc-path pc-mono" :title="detail.installPath">{{ detail.installPath }}</span>
            <button class="pc-ico" title="打开目录" @click="openPath(detail.installPath)"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></button>
          </div>
        </div>
        <div class="pc-sheet-f" v-if="cliAvailable">
          <button class="pc-sw" :class="{ on: detail.enabled }" :disabled="isBusy(detail.id)" @click="toggleEnable(detail)"><span /></button>
          <span class="pc-muted pc-sw-label">{{ detail.enabled ? '启用中' : '已停用' }}</span>
          <div class="pc-sheet-f-r">
            <button class="btn pc-btn pc-accent" :disabled="isBusy(detail.id)" @click="doUpdate(detail)">更新</button>
            <button class="btn pc-btn pc-danger" :disabled="isBusy(detail.id)" @click="askUninstall(detail)">卸载</button>
          </div>
        </div>
      </div>
    </div>
    </transition>

    <!-- 确认弹窗 -->
    <transition name="pc-pop">
    <div v-if="confirmTarget" class="pc-mask" @click.self="confirmNo">
      <div class="pc-modal">
        <div class="pc-modal-t">{{ confirmTarget.kind === 'uninstall' ? '卸载插件' : '移除商城' }}</div>
        <div class="pc-modal-b">确定要{{ confirmTarget.kind === 'uninstall' ? '卸载' : '移除' }} <b class="pc-mono">{{ confirmTarget.label }}</b> 吗？</div>
        <div class="pc-modal-a"><button class="btn pc-btn pc-ghost" @click="confirmNo">取消</button><button class="btn pc-btn pc-danger" @click="confirmYes">确定</button></div>
      </div>
    </div>
    </transition>

    <!-- 添加商城 -->
    <transition name="pc-pop">
    <div v-if="showAddMp" class="pc-mask" @click.self="showAddMp = false">
      <div class="pc-modal">
        <div class="pc-modal-t">添加商城</div>
        <input id="addmp-input" v-model="addMpInput" class="pc-input pc-mono" placeholder="owner/repo 或 git URL" @keydown.stop.enter="submitAddMp" @keydown.stop.esc="showAddMp = false" />
        <div class="pc-modal-a"><button class="btn pc-btn pc-ghost" @click="showAddMp = false">取消</button><button class="btn btn-primary pc-btn" @click="submitAddMp">添加</button></div>
      </div>
    </div>
    </transition>
  </div>
</template>

<style scoped>
.pc {
  --mono: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  /* 光谱五色（五彩斑斓的来源，仅作「光」使用）*/
  --pc-iris-1: #ff3d8b; --pc-iris-2: #9d5cff; --pc-iris-3: #21d4fd; --pc-iris-4: #2bffb6; --pc-iris-5: #ffd23f;
  /* 覆盖既有令牌 → 全页黑曜化（本页锁定深色，不跟随系统明暗）*/
  --card-bg: #0e0e1a; --primary-color: #a86bff; --primary-hover: #c08cff;
  --text-primary: #f1edf9; --text-secondary: #b8b3cc; --text-tertiary: #7d7994;
  --border-color: rgba(255, 255, 255, .09); --bg-hover: rgba(255, 255, 255, .055);
  box-sizing: border-box; display: flex; flex-direction: column; height: 100vh; overflow: hidden; outline: none; color: var(--text-primary);
  background:
    radial-gradient(900px 520px at 6% -8%, rgba(255,61,139,.2), transparent 60%),
    radial-gradient(840px 540px at 110% 10%, rgba(33,212,253,.17), transparent 58%),
    radial-gradient(760px 640px at 50% 118%, rgba(157,92,255,.22), transparent 62%),
    #07070c;
  background-attachment: fixed;
}
.pc-mono { font-family: var(--mono); }
.pc-muted { color: var(--text-tertiary); }

/* 导航：居中标签 + 滑动下划线指示 + 激活态动态图标 */
.pc-nav { position: relative; display: flex; align-items: stretch; justify-content: center; padding: 0 18px; height: 52px; border-bottom: 1px solid var(--border-color); flex-shrink: 0; }
.pc-tabs { position: relative; display: flex; align-items: stretch; gap: 2px; }
.pc-tab { position: relative; display: inline-flex; align-items: center; padding: 0 16px; background: transparent; color: var(--text-secondary); font-size: 13.5px; font-weight: 500; transition: color .15s ease; }
.pc-tab:hover { color: var(--text-primary); text-shadow: 0 0 14px rgba(157,92,255,.65); }
.pc-tab.on { color: var(--text-primary); font-weight: 600; }
.pc-tab-label { line-height: 1; }
/* 非激活隐藏图标：仅激活 tab 显示图标。用 display 切换（瞬时、不 tween 宽度，指示条测量才准）*/
.pc-tab-ico { display: none; align-items: center; margin-right: 7px; color: var(--text-primary); }
.pc-tab.on .pc-tab-ico { display: inline-flex; animation: pc-icoin .28s ease; }
/* 出现时：容器淡入 + 轻微放大，图标描边再自我"绘制"一次，流畅无循环 */
.pc-tab.on .pc-tab-ico :is(path, polyline, polygon) { stroke-dasharray: 1; stroke-dashoffset: 1; animation: pc-draw .62s cubic-bezier(.65,0,.35,1) forwards; }
@keyframes pc-icoin { from { opacity: 0; transform: scale(.7); } to { opacity: 1; transform: none; } }
@keyframes pc-draw { to { stroke-dashoffset: 0; } }
.pc-tab-n { margin-left: 7px; font-family: var(--mono); font-size: 11px; padding: 1px 6px; border-radius: 8px; background: var(--bg-hover); color: var(--text-tertiary); }
.pc-tab.on .pc-tab-n { background: rgba(168,107,255,.14); color: var(--text-secondary); }
.pc-tab-bar { position: absolute; bottom: 0; left: 0; height: 3px; border-radius: 3px 3px 0 0; background: linear-gradient(90deg, var(--pc-iris-1), var(--pc-iris-2), var(--pc-iris-3), var(--pc-iris-4), var(--pc-iris-1)); background-size: 200% 100%; box-shadow: 0 0 10px rgba(157,92,255,.75), 0 0 20px rgba(33,212,253,.45); transition: transform .34s cubic-bezier(.5, 0, .15, 1); animation: pc-flow 5s linear infinite; }
.pc-nav-act { position: absolute; right: 18px; top: 0; height: 100%; display: flex; align-items: center; }

.pc-btn { line-height: 1.9; padding: 0 13px; white-space: nowrap; flex-shrink: 0; font-size: 12px; border-radius: 7px; }
/* 工具栏主按钮：与同槽的「刷新」ghost 按钮尺寸对齐（等高 / 等圆角 / 图标+文字），仅保留主色渐变强调 */
.pc-navbtn { box-sizing: border-box; display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 14px; line-height: 1; border-radius: 8px; }
.pc-navbtn svg { flex-shrink: 0; }
.pc-ghost { background: transparent; border-color: var(--border-color); color: var(--text-secondary); }
.pc-ghost:hover:not(:disabled) { background: var(--bg-hover); color: var(--text-primary); }
.pc-danger { background: transparent; border-color: rgba(229,72,77,.5); color: #e5484d; }
.pc-danger:hover:not(:disabled) { background: #e5484d; border-color: #e5484d; color: #fff; }
.pc-ok { background: transparent; border-color: var(--border-color); color: var(--text-secondary); }
.pc-ok:hover:not(:disabled) { background: #16a34a; border-color: #16a34a; color: #fff; }
.pc-accent { background: transparent; border-color: var(--border-color); color: var(--text-secondary); }
.pc-accent:hover:not(:disabled) { background: var(--primary-color); border-color: var(--primary-color); color: #fff; }

.pc-note { margin: 12px 18px 0; padding: 7px 12px; border-radius: 8px; font-size: 12px; color: #9a7b28; background: rgba(247,183,49,.14); }
.pc-note code { font-family: var(--mono); }
.pc-err { margin: 12px 18px 0; padding: 7px 12px; border-radius: 8px; font-size: 12px; color: #e5484d; background: rgba(229,72,77,.1); white-space: pre-wrap; }
.pc-toast { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); z-index: 60; padding: 7px 16px; border-radius: 18px; font-size: 12px; color: #fff; background: rgba(30,32,38,.92); box-shadow: 0 6px 20px rgba(0,0,0,.28); }
.pc-fade-enter-active, .pc-fade-leave-active { transition: opacity .2s, transform .2s; }
.pc-fade-enter-from, .pc-fade-leave-to { opacity: 0; transform: translate(-50%, -6px); }

/* 覆盖层入场：遮罩淡入，面板轻微上浮 + 缩放（premium 收尾）*/
.pc-pop-enter-active { transition: opacity .2s ease; }
.pc-pop-leave-active { transition: opacity .14s ease; }
.pc-pop-enter-from, .pc-pop-leave-to { opacity: 0; }
.pc-pop-enter-active .pc-sheet, .pc-pop-enter-active .pc-modal { transition: transform .24s cubic-bezier(.2, .75, .25, 1), opacity .24s ease; }
.pc-pop-enter-from .pc-sheet, .pc-pop-enter-from .pc-modal { opacity: 0; transform: translateY(12px) scale(.97); }

.pc-scroll { flex: 1 1 auto; overflow-y: auto; padding: 16px 18px 22px; scroll-padding: 16px; animation: pc-tabin .26s cubic-bezier(.2, .7, .2, 1); }
/* 切换分区时内容轻微淡入上浮，让页面流转更顺滑 */
@keyframes pc-tabin { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: none; } }

/* 卡片网格 */
.pc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(268px, 1fr)); gap: 12px; }
.pc-grid-inst { grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); }

/* 已装插件卡 */
.pc-pcard { display: flex; flex-direction: column; gap: 8px; padding: 14px 15px; border-radius: 12px; background: var(--card-bg); border: 1px solid var(--border-color); cursor: pointer; transition: border-color .15s, background .15s; }
.pc-pcard:hover, .pc-pcard.on { border-color: rgba(168,107,255,.55); background: #141223; }
.pc-pcard.off { opacity: .68; }
.pc-pcard-top { display: flex; align-items: flex-start; gap: 10px; }
.pc-pcard-name { flex: 1; min-width: 0; font-size: 14.5px; font-weight: 650; letter-spacing: .01em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pc-ops { display: flex; align-items: center; gap: 6px; flex-shrink: 0; cursor: default; }
.pc-pcard-desc { font-size: 12.5px; color: var(--text-secondary); line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; min-height: 2.9em; }
.pc-pcard-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 11px; margin-top: auto; }

/* 开关 */
.pc-sw { position: relative; width: 34px; height: 20px; border-radius: 20px; background: var(--border-color); border: none; padding: 0; cursor: pointer; transition: background .2s; flex-shrink: 0; }
.pc-sw.on { background: linear-gradient(120deg, var(--pc-iris-4), var(--pc-iris-3)); box-shadow: 0 0 12px rgba(43,255,182,.6); }
.pc-sw span { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.3); transition: transform .2s; }
.pc-sw.on span { transform: translateX(14px); }
.pc-sw:disabled { opacity: .5; cursor: default; }

/* 图标按钮 */
.pc-ico { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 24px; border-radius: 6px; background: transparent; border: 1px solid transparent; color: var(--text-tertiary); cursor: pointer; transition: all .15s; }
.pc-ico:hover:not(:disabled) { background: var(--bg-hover); color: var(--text-primary); }
.pc-ico.accent:hover:not(:disabled) { background: var(--primary-color); color: #fff; }
.pc-ico.danger:hover:not(:disabled) { background: #e5484d; color: #fff; }
.pc-ico:disabled { opacity: .4; cursor: default; }

/* 能力 chips（黑白：中性底 + 主色数字）*/
.pc-caps { display: flex; flex-wrap: wrap; gap: 6px; }
.pc-cap { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; padding: 2px 9px; border-radius: 6px; color: var(--text-secondary); background: var(--bg-hover); border: 1px solid var(--border-color); }
.pc-cap b { color: var(--text-primary); font-size: 11.5px; }

/* 商城卡片：来源 + 插件数（复用 .pc-pcard 卡片壳）*/
.pc-mp-src { font-size: 11.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pc-cnt { font-size: 11px; color: var(--text-secondary); }
.pc-cnt b { color: var(--text-primary); margin-right: 3px; }

/* 商城 sheet 内可安装插件清单 */
.pc-mplist { display: flex; flex-direction: column; gap: 8px; }
.pc-nested-empty { font-size: 12.5px; color: var(--text-tertiary); padding: 8px 0; }
.pc-nested-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 9px; background: var(--bg-hover); border: 1px solid transparent; transition: border-color .15s; }
.pc-nested-item:hover { border-color: var(--border-color); }
.pc-ni-main { flex: 1; min-width: 0; }
.pc-ni-title { font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 7px; }
.pc-ni-desc { font-size: 11.5px; color: var(--text-secondary); margin-top: 3px; line-height: 1.45; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

/* 徽标 / 分类（黑白：中性）*/
.pc-badge-ok { font-size: 11px; padding: 2px 10px; border-radius: 20px; white-space: nowrap; color: var(--text-tertiary); background: var(--bg-hover); border: 1px solid var(--border-color); }
.pc-cat { font-size: 10px; font-weight: 500; padding: 1px 7px; border-radius: 5px; color: var(--text-secondary); background: var(--bg-hover); border: 1px solid var(--border-color); }
.pc-status { margin-left: 8px; font-size: 11px; font-weight: 600; padding: 2px 9px; border-radius: 20px; vertical-align: middle; }
.pc-status.on { color: #16a34a; background: rgba(34,197,94,.16); }
.pc-status.off { color: var(--text-tertiary); background: var(--bg-hover); }

/* 发现区 */
.pc-meta { display: flex; align-items: center; gap: 9px; margin-bottom: 14px; font-size: 11px; }
.pc-src-badge { font-weight: 700; padding: 2px 9px; border-radius: 7px; }
.pc-src-badge.live { color: #16a34a; background: rgba(34,197,94,.16); }
.pc-src-badge.cache { color: #9a7b28; background: rgba(247,183,49,.16); }
.pc-src-badge.offline { color: var(--text-tertiary); background: var(--bg-hover); }
.pc-sec { margin-bottom: 22px; }
.pc-sec-h { display: flex; align-items: baseline; gap: 10px; margin-bottom: 12px; font-size: 11px; }
.pc-eyebrow { font-size: 13px; font-weight: 700; letter-spacing: .02em; color: var(--text-primary); position: relative; padding-left: 11px; }
.pc-eyebrow::before { content: ''; position: absolute; left: 0; top: 50%; transform: translateY(-50%); width: 3px; height: 13px; border-radius: 2px; background: linear-gradient(var(--pc-iris-2), var(--pc-iris-1)); box-shadow: 0 0 8px rgba(157,92,255,.6); }
.pc-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
.pc-fchip { display: inline-flex; align-items: center; gap: 5px; padding: 3px 11px; border-radius: 15px; font-size: 12px; background: var(--bg-hover); color: var(--text-secondary); border: 1px solid transparent; transition: all .15s; }
.pc-fchip:hover:not(.on) { color: var(--text-primary); border-color: rgba(157,92,255,.45); box-shadow: 0 0 12px -2px rgba(157,92,255,.4); }
.pc-fchip.on { background: linear-gradient(120deg, var(--pc-iris-2), var(--pc-iris-1)); color: #fff; border-color: transparent; font-weight: 600; box-shadow: 0 3px 14px -3px rgba(255,61,139,.6); }
.pc-fchip-n { font-size: 10px; opacity: .75; }

.pc-card { display: flex; flex-direction: column; gap: 6px; padding: 13px 14px; border-radius: 11px; background: var(--card-bg); border: 1px solid var(--border-color); transition: border-color .15s, background .15s; }
.pc-card:hover, .pc-card.on { border-color: rgba(168,107,255,.45); background: #141223; }
.pc-card-title { font-size: 13.5px; font-weight: 650; }
.pc-card-meta { display: flex; align-items: center; gap: 8px; font-size: 11px; }
.pc-star { font-weight: 700; color: #d9932a; }
.pc-card-desc { font-size: 12px; color: var(--text-secondary); line-height: 1.45; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; min-height: 2.9em; }
.pc-card-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 2px; }
.pc-repo { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pc-card.skeleton { height: 128px; background: linear-gradient(100deg, var(--card-bg) 30%, var(--bg-hover) 50%, var(--card-bg) 70%); background-size: 220% 100%; animation: pc-shimmer 1.2s infinite; }
@keyframes pc-shimmer { 0% { background-position: 180% 0; } 100% { background-position: -80% 0; } }

.pc-empty { display: flex; flex-direction: column; align-items: center; gap: 13px; padding-top: 60px; color: var(--text-tertiary); font-size: 13.5px; }
.pc-empty.sm { padding-top: 20px; }
.pc-empty p { margin: 0; }
.pc-empty-ico { width: 46px; height: 46px; opacity: .5; margin-bottom: 1px; }

/* 详情 sheet */
.pc-mask { position: fixed; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.42); padding: 24px; }
.pc-sheet { width: 100%; max-width: 540px; max-height: 84vh; display: flex; flex-direction: column; border-radius: 14px; background: var(--card-bg); border: 1px solid var(--border-color); box-shadow: 0 18px 54px rgba(0,0,0,.36); overflow: hidden; }
.pc-sheet-h { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 18px 18px 14px; border-bottom: 1px solid var(--border-color); }
.pc-sheet-name { font-size: 17px; font-weight: 700; }
.pc-sheet-id { font-size: 11.5px; margin-top: 4px; }
.pc-sheet-body { padding: 16px 18px; overflow-y: auto; }
.pc-sheet-desc { margin: 0 0 12px; font-size: 13px; line-height: 1.6; color: var(--text-secondary); }
.pc-kw { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
.pc-metagrid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px 20px; margin: 0 0 16px; }
.pc-metagrid div { min-width: 0; }
.pc-metagrid dt { font-size: 10.5px; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: .04em; }
.pc-metagrid dd { margin: 2px 0 0; font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pc-link { color: var(--text-secondary); cursor: pointer; text-decoration: underline; }
.pc-link:hover { color: var(--text-primary); }
.pc-comp { margin-bottom: 14px; }
.pc-comp-h { font-size: 12px; font-weight: 700; margin-bottom: 7px; display: flex; align-items: center; gap: 6px; }
.pc-comp-h .pc-mono { font-weight: 600; color: var(--text-primary); }
.pc-comp-list { display: flex; flex-wrap: wrap; gap: 5px; }
.pc-name { font-family: var(--mono); font-size: 11px; padding: 2px 8px; border-radius: 6px; background: var(--bg-hover); color: var(--text-secondary); border: 1px solid var(--border-color); }
/* README 预览（折叠 + 滚动，markdown 由 marked 渲染）*/
.pc-readme { margin-bottom: 14px; border: 1px solid var(--border-color); border-radius: 10px; overflow: hidden; }
.pc-readme-h { display: flex; align-items: center; gap: 6px; width: 100%; padding: 9px 12px; background: var(--bg-hover); font-size: 12px; font-weight: 700; color: var(--text-primary); cursor: pointer; border: none; }
.pc-readme-caret { color: var(--text-tertiary); transition: transform .2s; }
.pc-readme-caret.open { transform: rotate(90deg); }
.pc-readme-body { max-height: 320px; overflow-y: auto; padding: 12px 14px; font-size: 12.5px; line-height: 1.6; color: var(--text-secondary); border-top: 1px solid var(--border-color); }
.pc-readme-body :deep(h1), .pc-readme-body :deep(h2), .pc-readme-body :deep(h3) { color: var(--text-primary); font-weight: 700; margin: 13px 0 6px; line-height: 1.3; }
.pc-readme-body :deep(h1) { font-size: 15.5px; } .pc-readme-body :deep(h2) { font-size: 14px; } .pc-readme-body :deep(h3) { font-size: 12.8px; }
.pc-readme-body :deep(> :first-child) { margin-top: 0; }
.pc-readme-body :deep(p) { margin: 6px 0; }
.pc-readme-body :deep(ul), .pc-readme-body :deep(ol) { margin: 6px 0; padding-left: 20px; }
.pc-readme-body :deep(li) { margin: 2px 0; }
.pc-readme-body :deep(a) { color: var(--primary-color); text-decoration: none; }
.pc-readme-body :deep(a:hover) { text-decoration: underline; }
.pc-readme-body :deep(code) { font-family: var(--mono); font-size: 11.5px; padding: 1px 5px; border-radius: 4px; background: var(--bg-hover); color: var(--text-primary); }
.pc-readme-body :deep(pre) { margin: 8px 0; padding: 10px 12px; border-radius: 8px; background: var(--bg-hover); overflow-x: auto; }
.pc-readme-body :deep(pre code) { padding: 0; background: none; font-size: 11px; }
.pc-readme-body :deep(img) { max-width: 100%; }
.pc-readme-body :deep(blockquote) { margin: 8px 0; padding-left: 12px; border-left: 3px solid var(--border-color); color: var(--text-tertiary); }
.pc-readme-body :deep(table) { border-collapse: collapse; margin: 8px 0; font-size: 11.5px; display: block; overflow-x: auto; }
.pc-readme-body :deep(th), .pc-readme-body :deep(td) { border: 1px solid var(--border-color); padding: 4px 8px; }
.pc-readme-body :deep(hr) { border: none; border-top: 1px solid var(--border-color); margin: 12px 0; }

.pc-path-row { display: flex; align-items: center; gap: 8px; padding-top: 10px; border-top: 1px dashed var(--border-color); }
.pc-path { flex: 1; min-width: 0; font-size: 10.5px; color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pc-sheet-f { display: flex; align-items: center; gap: 8px; padding: 13px 18px; border-top: 1px solid var(--border-color); background: var(--bg-hover); }
.pc-sw-label { font-size: 12px; }
.pc-sheet-f-r { margin-left: auto; display: flex; gap: 8px; }

.pc-modal { width: 300px; padding: 18px; border-radius: 13px; background: var(--card-bg); box-shadow: 0 16px 48px rgba(0,0,0,.34); border: 1px solid var(--border-color); }
.pc-modal-t { font-weight: 700; font-size: 15px; margin-bottom: 12px; }
.pc-modal-b { font-size: 13px; color: var(--text-secondary); margin-bottom: 16px; word-break: break-all; line-height: 1.5; }
.pc-modal-a { display: flex; justify-content: flex-end; gap: 8px; }
.pc-input { width: 100%; box-sizing: border-box; padding: 8px 10px; margin-bottom: 16px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-hover); color: var(--text-primary); font-size: 12.5px; }
.pc-input:focus { outline: none; border-color: var(--primary-color); box-shadow: 0 0 0 3px rgba(168,107,255,.18); }

/* ============ 五彩斑斓的黑 · 极光黑曜签名特效 ============ */
@keyframes pc-flow { to { background-position: 200% 0; } }

/* 卡片：聚光灯跟随 + 流光全息描边 + 悬浮辉光（.pc-pcard 已装/商城卡；.pc-card 发现卡）*/
.pc-pcard, .pc-card {
  position: relative; isolation: isolate; overflow: hidden; will-change: transform;
  transition: transform .2s ease, box-shadow .28s ease, background .2s ease, border-color .2s ease;
}
.pc-pcard > *, .pc-card > * { position: relative; z-index: 1; }
/* 聚光灯层：跟随光标（--mx/--my 由 JS 写入）*/
.pc-pcard::before, .pc-card::before {
  content: ''; position: absolute; inset: 0; z-index: 0; border-radius: inherit; pointer-events: none;
  background: radial-gradient(230px circle at var(--mx, 50%) var(--my, 50%), rgba(157,92,255,.32), transparent 62%);
  opacity: 0; transition: opacity .28s ease;
}
.pc-pcard:hover::before, .pc-pcard.on::before, .pc-card:hover::before, .pc-card.on::before { opacity: 1; }
/* 流光全息描边层：彩虹沿边流动（mask 只保留 1px 边环）*/
.pc-pcard::after, .pc-card::after {
  content: ''; position: absolute; inset: 0; z-index: 2; border-radius: inherit; padding: 1px; pointer-events: none;
  background: linear-gradient(120deg, var(--pc-iris-1), var(--pc-iris-2), var(--pc-iris-3), var(--pc-iris-4), var(--pc-iris-1));
  background-size: 200% 100%;
  -webkit-mask: linear-gradient(#000, #000) content-box, linear-gradient(#000, #000);
  -webkit-mask-composite: xor; mask: linear-gradient(#000, #000) content-box, linear-gradient(#000, #000); mask-composite: exclude;
  opacity: 0; transition: opacity .3s ease; animation: pc-flow 4.5s linear infinite; animation-play-state: paused;
}
.pc-pcard:hover::after, .pc-pcard.on::after, .pc-card:hover::after, .pc-card.on::after { opacity: 1; animation-play-state: running; }
/* 悬浮辉光（覆盖既有 hover 的 border/background）*/
.pc-pcard:hover, .pc-pcard.on, .pc-card:hover, .pc-card.on {
  border-color: transparent;
  background: #19142c;
  box-shadow: 0 12px 36px -10px rgba(157,92,255,.6), 0 0 24px -14px rgba(33,212,253,.7);
}

/* 能力标签按类型配色（色彩承载信息：skills=青 commands=紫 agents=品红 hooks=琥珀 mcp=薄荷）*/
.pc-cap { transition: color .18s, border-color .18s, box-shadow .18s, background .18s; }
.pc-cap b { color: inherit; }
.pc-cap.cap-skill { color: var(--pc-iris-3); border-color: rgba(33,212,253,.38); background: rgba(33,212,253,.09); }
.pc-cap.cap-cmd   { color: var(--pc-iris-2); border-color: rgba(157,92,255,.38); background: rgba(157,92,255,.09); }
.pc-cap.cap-agent { color: var(--pc-iris-1); border-color: rgba(255,61,139,.38); background: rgba(255,61,139,.09); }
.pc-cap.cap-hook  { color: var(--pc-iris-5); border-color: rgba(255,210,63,.38); background: rgba(255,210,63,.09); }
.pc-cap.cap-mcp   { color: var(--pc-iris-4); border-color: rgba(43,255,182,.38); background: rgba(43,255,182,.09); }
.pc-pcard:hover .pc-cap, .pc-pcard.on .pc-cap { box-shadow: 0 0 12px -4px currentColor; }

/* 主按钮：光谱渐变 + 辉光 */
.btn-primary { background: linear-gradient(120deg, var(--pc-iris-2), var(--pc-iris-1)); background-size: 170% 100%; border: none; color: #fff; box-shadow: 0 4px 16px -5px rgba(255,61,139,.6); transition: background-position .4s ease, box-shadow .25s ease, transform .15s ease; }
.btn-primary:hover:not(:disabled) { background-position: 100% 0; box-shadow: 0 7px 24px -4px rgba(157,92,255,.78); transform: translateY(-1px); }

/* 图标 / 幽灵按钮 hover 辉光 */
.pc-ico.accent:hover:not(:disabled) { background: linear-gradient(120deg, var(--pc-iris-2), var(--pc-iris-1)); box-shadow: 0 0 14px -3px rgba(157,92,255,.7); }
.pc-ico.danger:hover:not(:disabled) { box-shadow: 0 0 14px -3px rgba(229, 72, 77, .7); }
.pc-accent:hover:not(:disabled) { background: linear-gradient(120deg, var(--pc-iris-2), var(--pc-iris-1)); border-color: transparent; box-shadow: 0 0 16px -4px rgba(157,92,255,.7); }
.pc-danger:hover:not(:disabled) { box-shadow: 0 0 16px -4px rgba(229, 72, 77, .65); }
.pc-ok:hover:not(:disabled) { box-shadow: 0 0 16px -4px rgba(43,255,182,.65); }

/* sheet 内嵌插件行 hover */
.pc-nested-item:hover { border-color: rgba(157,92,255,.4); background: rgba(157,92,255,.1); box-shadow: 0 0 18px -8px rgba(157,92,255,.6); }

/* 弹层：玻璃拟态 + 顶部流光条 */
.pc-mask { background: rgba(4, 4, 8, .58); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); }
.pc-sheet, .pc-modal { position: relative; background: rgba(14, 14, 26, .9); -webkit-backdrop-filter: blur(22px) saturate(1.25); backdrop-filter: blur(22px) saturate(1.25); box-shadow: 0 26px 74px -14px rgba(0, 0, 0, .74), 0 0 0 1px rgba(255, 255, 255, .05), 0 0 70px -22px rgba(157,92,255,.55); }
.pc-sheet::before, .pc-modal::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px; z-index: 3; background: linear-gradient(90deg, var(--pc-iris-1), var(--pc-iris-2), var(--pc-iris-3), var(--pc-iris-4), var(--pc-iris-1)); background-size: 200% 100%; animation: pc-flow 5s linear infinite; }

/* 滚动条：光谱着色 */
.pc-scroll::-webkit-scrollbar-thumb, .pc-sheet-body::-webkit-scrollbar-thumb, .pc-readme-body::-webkit-scrollbar-thumb { background-color: rgba(157,92,255,.55); }
.pc-scroll::-webkit-scrollbar-thumb:hover, .pc-sheet-body::-webkit-scrollbar-thumb:hover, .pc-readme-body::-webkit-scrollbar-thumb:hover { background-color: rgba(157,92,255,.85); }

/* ============ 发现页优化：刷新按钮 / 商城热度 / 精选 / 推荐详情 ============ */
/* 刷新按钮：极光幽灵底 + hover 紫辉光 + 加载旋转 */
.pc-refresh { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 13px; border-radius: 8px; font-size: 12px; color: var(--text-secondary); background: rgba(255,255,255,.04); border: 1px solid var(--border-color); transition: color .18s, border-color .18s, box-shadow .18s, background .18s; }
.pc-refresh:hover:not(:disabled) { color: #fff; border-color: rgba(157,92,255,.5); background: rgba(157,92,255,.12); box-shadow: 0 0 16px -4px rgba(157,92,255,.6); }
.pc-refresh:disabled { cursor: default; opacity: .85; }
.pc-refresh-ico { transition: transform .2s; }
.pc-refresh.spinning .pc-refresh-ico { animation: pc-spin .8s linear infinite; }
@keyframes pc-spin { to { transform: rotate(360deg); } }

/* 热门商城：Top3 排名徽章（金/银/铜）+ star 火焰 */
.pc-rank { display: inline-flex; align-items: center; justify-content: center; min-width: 22px; height: 18px; padding: 0 5px; margin-right: 7px; border-radius: 6px; font-family: var(--mono); font-size: 11px; font-weight: 700; vertical-align: middle; }
.pc-rank.r1 { color: #1a1206; background: linear-gradient(120deg, #ffe08a, #ffb23f); box-shadow: 0 0 12px -2px rgba(255,178,63,.7); }
.pc-rank.r2 { color: #14161c; background: linear-gradient(120deg, #eef1f6, #c2c8d4); }
.pc-rank.r3 { color: #1a0f06; background: linear-gradient(120deg, #f0b98a, #d08a54); }
.pc-star { color: #ffd23f; text-shadow: 0 0 10px rgba(255,178,63,.6); }

/* 插件精选：徽章 + 精选卡金边 + 可点手型 */
.pc-reccard, .pc-mpcard { cursor: pointer; }
.pc-reccard.feat { border-color: rgba(157,92,255,.4); }
/* 热门商城详情：顶部说明 + 添加商城 / GitHub 入口 */
.pc-hotmp-bar { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; padding: 9px 12px; border-radius: 9px; background: rgba(157,92,255,.08); border: 1px solid rgba(157,92,255,.18); font-size: 11.5px; }
.pc-hotmp-act { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
/* 主按钮加载态：点安装/添加即时反馈——文字隐去、居中白色旋转 spinner，完成后切回按钮/徽章 */
.pc-btn.loading { color: transparent !important; position: relative; pointer-events: none; }
.pc-btn.loading:disabled { filter: none; opacity: 1; }
.pc-btn.loading::after { content: ''; position: absolute; top: 50%; left: 50%; width: 13px; height: 13px; margin: -7px 0 0 -7px; border: 2px solid rgba(255,255,255,.4); border-top-color: #fff; border-radius: 50%; animation: pc-spin .6s linear infinite; }
.pc-tag-off { display: inline-flex; align-items: center; margin-right: 7px; padding: 1px 8px; border-radius: 6px; font-size: 10.5px; font-weight: 700; color: #fff; background: linear-gradient(120deg, #9d5cff, #6f3dff); box-shadow: 0 0 10px -3px rgba(157,92,255,.6); vertical-align: middle; }
.pc-tag-hot { display: inline-flex; align-items: center; gap: 2px; margin-right: 7px; padding: 1px 8px; border-radius: 6px; font-size: 10.5px; font-weight: 700; color: #1a1206; background: linear-gradient(120deg, #ffd23f, #ff7a3f); box-shadow: 0 0 10px -3px rgba(255,122,63,.6); vertical-align: middle; }
.pc-sheet-name .pc-tag-off, .pc-sheet-name .pc-tag-hot { font-size: 11px; }

/* 推荐详情 sheet：窄一档 + 说明 */
.pc-sheet-sm { max-width: 420px; }
.pc-rec-hint { font-size: 11.5px; margin: 0 0 14px; }

/* 回到顶部：右下极光圆钮（z-index 低于弹层遮罩，弹层打开时自然被盖住）*/
.pc-backtop { position: fixed; right: 20px; bottom: 20px; z-index: 40; display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 50%; color: #fff; background: linear-gradient(135deg, rgba(157,92,255,.95), rgba(255,61,139,.9)); border: 1px solid rgba(255,255,255,.14); box-shadow: 0 8px 24px -6px rgba(157,92,255,.7), 0 0 0 1px rgba(255,255,255,.05); cursor: pointer; transition: transform .16s ease, box-shadow .2s ease; }
.pc-backtop:hover { transform: translateY(-2px) scale(1.06); box-shadow: 0 12px 30px -6px rgba(255,61,139,.7); }
.pc-backtop:active { transform: scale(.96); }
.pc-bt-enter-active, .pc-bt-leave-active { transition: opacity .2s ease, transform .2s ease; }
.pc-bt-enter-from, .pc-bt-leave-to { opacity: 0; transform: translateY(8px) scale(.9); }

@media (prefers-reduced-motion: reduce) {
  .pc-card, .pc-pcard, .pc-sw span, .pc-fchip, .pc-ico, .pc-tab-bar { transition: none; }
  .pc-refresh.spinning .pc-refresh-ico, .pc-btn.loading::after { animation-duration: 1.4s; }
  .pc-pcard, .pc-card { transform: none !important; }
  .pc-tab-bar, .pc-pcard::after, .pc-card::after, .pc-sheet::before, .pc-modal::before, .btn-primary { animation: none !important; }
  .pc-card:hover, .pc-card.on, .pc-pcard:hover, .pc-pcard.on { transform: none; }
  .pc-card.skeleton, .pc-scroll { animation: none; }
  .pc-tab.on .pc-tab-ico, .pc-tab.on .pc-tab-ico :is(path, polyline, polygon) { animation: none; stroke-dashoffset: 0; }
  .pc-pop-enter-active .pc-sheet, .pc-pop-enter-active .pc-modal { transition: none; }
  .pc-pop-enter-from .pc-sheet, .pc-pop-enter-from .pc-modal { transform: none; }
}
</style>
