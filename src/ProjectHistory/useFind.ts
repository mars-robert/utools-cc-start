import { nextTick, ref, watch, type Ref } from 'vue'
// @ts-ignore 纯匹配核心（JS 模块，无类型声明）
import { compileQuery, findInText } from './find-core.js'

export interface FindHost {
  scrollEl: Ref<HTMLElement | null>
  getWalkRoot?: () => HTMLElement | null // 查找遍历的根（双视图时为当前可见的 .ph-chat）；缺省用 scrollEl
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

  // 把当前命中滚入可见区：从命中所在元素到详情容器，逐级滚动每个「带自身滚动条」的祖先
  // （从内到外、每步重新测量）。这样命中即便藏在折叠 <pre> 的内部滚动条里也会被滚到可见处，
  // 而不只是滚动最外层详情容器。
  const scrollToCurrent = () => {
    const root = host.scrollEl.value
    const r = ranges[current.value]
    if (!root || !r) return
    const sc = r.startContainer
    let el = (sc.nodeType === 3 ? sc.parentElement : sc) as HTMLElement | null
    const scrollers: HTMLElement[] = []
    while (el) {
      if (el === root) { scrollers.push(el); break }
      const oy = getComputedStyle(el).overflowY
      if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1) scrollers.push(el)
      el = el.parentElement
    }
    // 从内到外依次居中：滚动内层会改变命中的视口位置，故每个滚动容器前都重新测量
    for (const s of scrollers) {
      const rect = r.getBoundingClientRect()
      if (!rect.height && !rect.width) continue
      const sRect = s.getBoundingClientRect()
      s.scrollTop += (rect.top - sRect.top) - (s.clientHeight - rect.height) / 2
    }
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
    const root = (host.getWalkRoot && host.getWalkRoot()) || host.scrollEl.value
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
