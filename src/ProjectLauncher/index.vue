<script lang="ts" setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import ProjectHistory from '../ProjectHistory/index.vue'

defineProps({
  enterAction: {
    type: Object,
    required: true
  }
})

const projects = ref<any[]>([])
const dirExists = ref(true)
const query = ref('')
const activeIndex = ref(0)
const error = ref('')
const loading = ref(true)
const itemRefs = ref<HTMLElement[]>([])
const listRef = ref<HTMLElement | null>(null)
const containerRef = ref<HTMLElement | null>(null)
// 待删除确认的失效项目（为 null 时不显示确认弹窗）
const confirmTarget = ref<any>(null)
// 确认弹窗当前聚焦的按钮：'confirm'（默认）| 'cancel'
const confirmFocus = ref<'confirm' | 'cancel'>('confirm')

// 视图：项目列表 / 历史页面
const view = ref<'list' | 'history'>('list')
const selectedProject = ref<any>(null)
const historyQuery = ref('')
// 当前高亮行内的焦点目标：'item'（启动）| 'history'（历史按钮）
const rowFocus = ref<'item' | 'history'>('item')

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return projects.value

  const matched = projects.value.filter((p) =>
    (p.displayName && p.displayName.toLowerCase().includes(q)) ||
    (p.cwd && p.cwd.toLowerCase().includes(q))
  )

  // 如果没有匹配项且输入内容是有效路径，添加临时项目选项
  if (matched.length === 0 && query.value.trim()) {
    const inputPath = query.value.trim()
    if (window.services.pathExists(inputPath)) {
      const pathName = inputPath.split(/[/\\]/).pop() || inputPath
      return [{
        id: '__temp__',
        dirName: '__temp__',
        cwd: inputPath,
        displayName: pathName,
        decoded: false,
        recency: Date.now(),
        available: true,
        isTemp: true
      }]
    }
  }

  return matched
})

// 让当前高亮项滚动到可见区域：用原生 scrollIntoView 以尊重 CSS scroll-padding（底部留白）
// 慢速单按平滑滚动，快速连按即时跟随（避免动画排队导致延迟/滚出屏幕）
let lastNavAt = 0
const scrollActiveIntoView = () => {
  const now = Date.now()
  const fast = now - lastNavAt < 120
  lastNavAt = now
  nextTick(() => {
    const el = itemRefs.value[activeIndex.value]
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest', behavior: fast ? 'auto' : 'smooth' })
    }
  })
}

const setActive = (i: number) => {
  activeIndex.value = i
  rowFocus.value = 'item'
  scrollActiveIntoView()
}

const loadProjects = () => {
  loading.value = true
  error.value = ''
  try {
    const result = window.services.listClaudeProjects()
    dirExists.value = result.dirExists
    projects.value = result.projects || []
    activeIndex.value = 0
  } catch (err: any) {
    error.value = err && err.message ? err.message : String(err)
  } finally {
    loading.value = false
  }
}

const launch = (project: any) => {
  if (!project) return
  if (!project.available) {
    // 失效项目（工作目录不存在）：弹窗询问是否删除该项目记录
    confirmTarget.value = project
    confirmFocus.value = 'confirm'
    return
  }
  error.value = ''
  const settings = window.services.getLauncherSettings()
  const result = window.services.launchProject(project.cwd, settings.launchCommand, {
    powershellPath: settings.powershellPath
  })
  if (result && result.success) {
    // 记录最后使用的项目目录，供 ccrun 使用
    window.services.saveLastProjectDir(project.cwd)
    window.utools.outPlugin()
  } else {
    error.value = (result && result.error) || '启动失败'
  }
}

// 确认删除失效项目记录
const confirmDelete = () => {
  const target = confirmTarget.value
  if (!target) return
  const result = window.services.deleteClaudeProject(target.dirName)
  confirmTarget.value = null
  if (result && result.success) {
    error.value = ''
    loadProjects()
  } else {
    error.value = (result && result.error) || '删除失败'
  }
}

// 取消删除
const cancelDelete = () => {
  confirmTarget.value = null
}

// ===== 历史页面视图切换 =====

// 列表视图：uTools 搜索框用于过滤项目
const applyListSubInput = () => {
  if (window.utools && typeof window.utools.setSubInput === 'function') {
    window.utools.setSubInput(({ text }: { text: string }) => {
      if (view.value === 'list') onQueryInput(text)
    }, '搜索项目名称或路径直接启动…')
  }
}

// 历史视图：uTools 搜索框用于过滤记忆与会话
const applyHistorySubInput = () => {
  if (window.utools && typeof window.utools.setSubInput === 'function') {
    window.utools.setSubInput(({ text }: { text: string }) => {
      historyQuery.value = text
    }, '搜索记忆或会话…')
  }
}

const clearSubInputValue = () => {
  const u = window.utools as any
  if (u && typeof u.setSubInputValue === 'function') u.setSubInputValue('')
}

const enterHistory = (project: any) => {
  if (!project || project.isTemp) return
  selectedProject.value = project
  historyQuery.value = ''
  view.value = 'history'
  applyHistorySubInput()
  clearSubInputValue()
}

const exitHistory = () => {
  view.value = 'list'
  selectedProject.value = null
  applyListSubInput()
  clearSubInputValue()
}

const clampActive = () => {
  const max = filtered.value.length - 1
  if (activeIndex.value > max) activeIndex.value = Math.max(0, max)
  if (activeIndex.value < 0) activeIndex.value = 0
}

const onKeydown = (e: KeyboardEvent) => {
  // 历史页面自行处理键盘事件（含 Esc 返回）
  if (view.value === 'history') return
  // 确认弹窗打开时：拦截键盘，左右键切换按钮，Enter 执行当前聚焦项（默认确认删除），Esc 取消
  if (confirmTarget.value) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      confirmFocus.value = confirmFocus.value === 'confirm' ? 'cancel' : 'confirm'
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (confirmFocus.value === 'confirm') confirmDelete()
      else cancelDelete()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancelDelete()
    }
    return
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (activeIndex.value < filtered.value.length - 1) setActive(activeIndex.value + 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (activeIndex.value > 0) setActive(activeIndex.value - 1)
  } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    // 左右键在「启动」与「历史按钮」之间切换当前行焦点（临时项无历史按钮）
    const p = filtered.value[activeIndex.value]
    if (p && !p.isTemp) {
      e.preventDefault()
      rowFocus.value = e.key === 'ArrowRight' ? 'history' : 'item'
    }
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const p = filtered.value[activeIndex.value]
    if (rowFocus.value === 'history' && p && !p.isTemp) enterHistory(p)
    else launch(p)
  } else if (e.altKey && /^Digit[1-9]$/.test(e.code)) {
    // Alt+数字 快捷启动（用 e.code 判定物理按键）
    e.preventDefault()
    const idx = Number(e.code.slice(5)) - 1
    if (idx < filtered.value.length) {
      setActive(idx)
      launch(filtered.value[idx])
    }
  }
}

// 主搜索框输入即动态过滤
const onQueryInput = (text: string) => {
  query.value = text
  itemRefs.value = []
  activeIndex.value = 0
  clampActive()
  scrollActiveIntoView()
}

onMounted(() => {
  loadProjects()
  window.addEventListener('keydown', onKeydown)
  // 复用 uTools 主搜索框作为搜索输入（列表视图过滤项目）
  applyListSubInput()
  // 让容器获得焦点以接收键盘事件
  nextTick(() => {
    containerRef.value?.focus()
  })
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  if (window.utools && typeof window.utools.removeSubInput === 'function') {
    window.utools.removeSubInput()
  }
})
</script>

<template>
  <ProjectHistory
    v-if="view === 'history'"
    :project="selectedProject"
    :filter="historyQuery"
    @back="exitHistory"
  />
  <div v-else ref="containerRef" class="launcher" tabindex="0">
    <div v-if="error" class="launcher-error">{{ error }}</div>

    <template v-if="!loading">
      <div v-if="!dirExists" class="launcher-empty">
        未找到 Claude Code 项目目录（~/.claude/projects）。
      </div>
      <div v-else-if="projects.length === 0" class="launcher-empty">
        ~/.claude/projects 下没有任何 Claude Code 项目。
      </div>
      <div v-else-if="filtered.length === 0" class="launcher-empty">
        没有匹配的项目。
      </div>

      <ul v-else ref="listRef" class="launcher-list">
        <li
          v-for="(p, i) in filtered"
          :key="p.id"
          :ref="(el) => { if (el) itemRefs[i] = el as HTMLElement }"
          class="launcher-item"
          @mouseenter="activeIndex = i"
        >
          <div
            class="launcher-item-body"
            :class="{
              active: i === activeIndex && rowFocus === 'item',
              current: i === activeIndex,
              unavailable: !p.available
            }"
            @click="launch(p)"
            @mouseenter="rowFocus = 'item'"
          >
            <div class="launcher-item-main">
              <div class="launcher-item-name">
                {{ p.displayName }}
                <span v-if="p.isTemp" class="launcher-badge launcher-badge-temp">直接启动 Claude Code</span>
                <span v-else-if="!p.available" class="launcher-badge">不可用</span>
                <span
                  v-else-if="p.branch"
                  class="launcher-badge launcher-badge-branch"
                  :title="'当前分支：' + p.branch"
                >
                  <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor"
                    stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <circle cx="6" cy="6" r="2.4" />
                    <circle cx="6" cy="18" r="2.4" />
                    <circle cx="18" cy="8" r="2.4" />
                    <path d="M6 8.4v7.2M18 10.4c0 4-3.5 4.6-6 5" />
                  </svg>
                  {{ p.branch }}
                </span>
              </div>
              <div class="launcher-item-path">{{ p.cwd || p.dirName }}</div>
            </div>
            <span v-if="i < 9" class="launcher-shortcut">Alt+{{ i + 1 }}</span>
          </div>
          <button
            v-if="!p.isTemp"
            class="launcher-history-btn"
            :class="{ focused: i === activeIndex && rowFocus === 'history' }"
            title="查看历史会话与记忆"
            @click.stop="enterHistory(p)"
            @mouseenter="rowFocus = 'history'"
          >
            <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor"
              stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7.5V12l3 1.8" />
            </svg>
          </button>
        </li>
      </ul>
    </template>

    <!-- 失效项目删除确认弹窗 -->
    <div v-if="confirmTarget" class="launcher-dialog-overlay" @click="cancelDelete">
      <div class="launcher-dialog" @click.stop>
        <div class="launcher-dialog-text">
          项目工作目录
          <div class="launcher-dialog-path">{{ confirmTarget.cwd || confirmTarget.dirName }}</div>
          不存在，无法启动。是否删除当前项目 claude 缓存？
        </div>
        <div class="launcher-dialog-actions">
          <button
            class="launcher-dialog-btn"
            :class="{ focused: confirmFocus === 'cancel' }"
            @click="cancelDelete"
            @mouseenter="confirmFocus = 'cancel'"
          >取消</button>
          <button
            class="launcher-dialog-btn primary"
            :class="{ focused: confirmFocus === 'confirm' }"
            @click="confirmDelete"
            @mouseenter="confirmFocus = 'confirm'"
          >确认删除</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
.launcher {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  outline: none;
}

.launcher-error {
  margin-bottom: 8px;
  color: #e53935;
  font-size: 13px;
}

.launcher-empty {
  margin-top: 24px;
  text-align: center;
  color: #888;
  font-size: 14px;
}

.launcher-list {
  list-style: none;
  margin: 0;
  padding: 0 10px 10px;
  flex: 1 1 auto;
  overflow-y: auto;
  position: relative;
  /* 行之间留出间隙 */
  display: flex;
  flex-direction: column;
  gap: 6px;
  /* 滚动定位时上下各保留安全边距，使越界项不贴边、底部露出留白 */
  scroll-padding-top: 10px;
  scroll-padding-bottom: 10px;
}

/* 行容器：透明，固定高度，仅负责把「项目按钮」与「历史按钮」并排隔开 */
.launcher-item {
  display: flex;
  align-items: stretch;
  gap: 10px;
  height: 52px;
  flex: 0 0 auto;
}

/* 项目按钮（启动）：独立元素，自带高亮，不包含历史按钮 */
.launcher-item-body {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  border-radius: 6px;
  cursor: pointer;
  overflow: hidden;
}

.launcher-item-body.current {
  background-color: var(--bg-hover);
}

.launcher-item-body.active {
  background-color: var(--primary-color);
  color: #fff;
}

.launcher-item-body.unavailable {
  opacity: 0.5;
  cursor: not-allowed;
}

.launcher-item-main {
  flex: 1 1 auto;
  min-width: 0;
}

.launcher-item-name {
  font-weight: 600;
  font-size: 14px;
  display: flex;
  align-items: center;
}

.launcher-item-path {
  font-size: 12px;
  opacity: 0.75;
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.launcher-shortcut {
  flex: 0 0 auto;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background-color: rgba(0, 0, 0, 0.08);
  color: #666;
  white-space: nowrap;
}

.launcher-item-body.active .launcher-shortcut {
  background-color: rgba(255, 255, 255, 0.25);
  color: #fff;
}

/* 历史按钮：与项目按钮等高的独立正方形（与行高一致，宽=高=52px） */
.launcher-history-btn {
  flex: 0 0 auto;
  width: 52px;
  height: 52px;
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

.launcher-history-btn:hover,
.launcher-history-btn.focused {
  background: var(--primary-color);
  border-color: var(--primary-color);
  color: #fff;
}

.launcher-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 6px;
  font-size: 11px;
  font-weight: 400;
  border-radius: 4px;
  background-color: #e0e0e0;
  color: #666;
}

.launcher-badge-temp {
  background-color: var(--primary-color);
  color: #fff;
}

/* 分支徽章：图标 + 完整分支名，与标题在同一行垂直居中对齐，不缩略 */
.launcher-badge-branch {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  flex: 0 0 auto;
  white-space: nowrap;
  background-color: rgba(0, 0, 0, 0.06);
  color: #4b5563;
}

.launcher-badge-branch svg {
  flex: 0 0 auto;
}

/* 失效项目删除确认弹窗 */
.launcher-dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.launcher-dialog {
  background: var(--card-bg);
  border: 1px solid #f0b4b4;
  border-top: 3px solid #e53935;
  border-radius: var(--card-radius);
  padding: var(--spacing-xl);
  width: 90%;
  max-width: 420px;
  box-shadow: 0 4px 16px rgba(229, 57, 53, 0.25);
  color: var(--text-primary);
}

.launcher-dialog-text {
  font-size: var(--font-size-base);
  line-height: 1.6;
}

.launcher-dialog-path {
  margin: var(--spacing-sm) 0;
  padding: var(--spacing-sm);
  background: #fdecea;
  border: 1px solid #f5c6c2;
  border-radius: 6px;
  font-size: var(--font-size-sm);
  word-break: break-all;
  color: #c0392b;
}

.launcher-dialog-actions {
  display: flex;
  gap: var(--spacing-sm);
  justify-content: flex-end;
  margin-top: var(--spacing-xl);
}

.launcher-dialog-btn {
  padding: 6px 16px;
  border-radius: 6px;
  font-size: var(--font-size-base);
  cursor: pointer;
  border: 1px solid var(--border-color);
  background: var(--card-bg);
  color: var(--text-primary);
  transition: all 0.2s ease;
}

.launcher-dialog-btn:hover {
  background: var(--bg-hover);
}

.launcher-dialog-btn.primary {
  background: #e53935;
  border-color: #e53935;
  color: #fff;
}

.launcher-dialog-btn.primary:hover {
  background: #c62828;
  border-color: #c62828;
}

/* 键盘聚焦态：左右键切换时高亮当前按钮 */
.launcher-dialog-btn.focused {
  box-shadow: 0 0 0 2px var(--card-bg), 0 0 0 4px #e53935;
}

@media (prefers-color-scheme: dark) {
  .launcher-shortcut {
    background-color: rgba(255, 255, 255, 0.12);
    color: #ccc;
  }

  .launcher-badge {
    background-color: #555;
    color: #ccc;
  }

  .launcher-badge-branch {
    background-color: rgba(255, 255, 255, 0.1);
    color: #cbd5e1;
  }

  .launcher-dialog {
    border-color: #5a2a2a;
    border-top-color: #e53935;
  }

  .launcher-dialog-path {
    background: #3a2020;
    border-color: #5a2a2a;
    color: #ef9a9a;
  }
}
</style>
