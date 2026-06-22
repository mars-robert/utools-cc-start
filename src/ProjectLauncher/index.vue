<script lang="ts" setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'

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
    error.value = `项目工作目录不存在，无法启动：${project.cwd || project.dirName}`
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

const clampActive = () => {
  const max = filtered.value.length - 1
  if (activeIndex.value > max) activeIndex.value = Math.max(0, max)
  if (activeIndex.value < 0) activeIndex.value = 0
}

const onKeydown = (e: KeyboardEvent) => {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (activeIndex.value < filtered.value.length - 1) setActive(activeIndex.value + 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (activeIndex.value > 0) setActive(activeIndex.value - 1)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    launch(filtered.value[activeIndex.value])
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
  // 复用 uTools 主搜索框作为搜索输入
  if (window.utools && typeof window.utools.setSubInput === 'function') {
    window.utools.setSubInput(({ text }: { text: string }) => {
      onQueryInput(text)
    }, '搜索项目名称或路径直接启动…')
  }
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
  <div ref="containerRef" class="launcher" tabindex="0">
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
          :class="{ active: i === activeIndex, unavailable: !p.available }"
          @click="launch(p)"
          @mouseenter="activeIndex = i"
        >
          <div class="launcher-item-main">
            <div class="launcher-item-name">
              {{ p.displayName }}
              <span v-if="p.isTemp" class="launcher-badge launcher-badge-temp">直接启动 Claude Code</span>
              <span v-else-if="!p.available" class="launcher-badge">不可用</span>
            </div>
            <div class="launcher-item-path">{{ p.cwd || p.dirName }}</div>
          </div>
          <span v-if="i < 9" class="launcher-shortcut">Alt+{{ i + 1 }}</span>
        </li>
      </ul>
    </template>
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
  /* 滚动定位时上下各保留安全边距，使越界项不贴边、底部露出留白 */
  scroll-padding-top: 10px;
  scroll-padding-bottom: 10px;
}

.launcher-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 5px;
  cursor: pointer;
}

.launcher-item.active {
  background-color: var(--primary-color);
  color: #fff;
}

.launcher-item.unavailable {
  cursor: not-allowed;
  opacity: 0.5;
}

.launcher-item-main {
  flex: 1 1 auto;
  min-width: 0;
}

.launcher-item-name {
  font-weight: 600;
  font-size: 14px;
}

.launcher-item-path {
  font-size: 12px;
  opacity: 0.75;
  margin-top: 2px;
  word-break: break-all;
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

.launcher-item.active .launcher-shortcut {
  background-color: rgba(255, 255, 255, 0.25);
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

@media (prefers-color-scheme: dark) {
  .launcher-shortcut {
    background-color: rgba(255, 255, 255, 0.12);
    color: #ccc;
  }

  .launcher-badge {
    background-color: #555;
    color: #ccc;
  }
}
</style>
