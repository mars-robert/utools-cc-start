<script lang="ts" setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'

defineProps({
  enterAction: {
    type: Object,
    required: true
  }
})

const commands = ref<any[]>([])
const query = ref('')
const activeIndex = ref(0)
const error = ref('')
const itemRefs = ref<HTMLElement[]>([])
const listRef = ref<HTMLElement | null>(null)
const containerRef = ref<HTMLElement | null>(null)

const filteredCommands = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return commands.value
  return commands.value.filter(cmd =>
    cmd.name.toLowerCase().includes(q) ||
    cmd.command.toLowerCase().includes(q) ||
    (cmd.description && cmd.description.toLowerCase().includes(q))
  )
})

// 平滑滚动逻辑（与 ProjectLauncher 一致）
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

const loadCommands = () => {
  try {
    commands.value = window.services.getAllCommands()
  } catch (err: any) {
    error.value = err && err.message ? err.message : String(err)
  }
}

const executeCommand = (cmd: any) => {
  error.value = ''
  const settings = window.services.getLauncherSettings()

  // 在预加载层解析工作目录并执行（渲染层无 process 能力）
  const result = window.services.runCommand(cmd.command, {
    needsProjectDir: cmd.needsProjectDir,
    powershellPath: settings.powershellPath
  })

  if (result && result.success) {
    window.utools.outPlugin()
  } else {
    error.value = (result && result.error) || '命令执行失败'
  }
}

const onKeydown = (e: KeyboardEvent) => {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (activeIndex.value < filteredCommands.value.length - 1) setActive(activeIndex.value + 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (activeIndex.value > 0) setActive(activeIndex.value - 1)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const cmd = filteredCommands.value[activeIndex.value]
    if (cmd) {
      executeCommand(cmd)
    }
  }
}

const onQueryInput = (text: string) => {
  query.value = text
  itemRefs.value = []
  activeIndex.value = 0
  scrollActiveIntoView()
}

onMounted(() => {
  loadCommands()
  window.addEventListener('keydown', onKeydown)

  // 使用 uTools 搜索框
  if (window.utools && typeof window.utools.setSubInput === 'function') {
    window.utools.setSubInput(({ text }: { text: string }) => {
      onQueryInput(text)
    }, '搜索命令...')
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
  <div ref="containerRef" class="command-list" tabindex="0">
    <div v-if="error" class="command-error">{{ error }}</div>

    <div v-if="filteredCommands.length === 0" class="command-empty">
      没有找到匹配的命令
    </div>

    <ul v-else ref="listRef" class="command-list-items">
      <li
        v-for="(cmd, index) in filteredCommands"
        :key="cmd.id"
        :ref="(el) => { if (el) itemRefs[index] = el as HTMLElement }"
        :class="{
          'command-item': true,
          active: index === activeIndex,
          builtin: cmd.type === 'builtin',
          custom: cmd.type === 'custom'
        }"
        @click="executeCommand(cmd)"
        @mouseenter="activeIndex = index"
      >
        <div class="command-header">
          <span class="command-icon">{{ cmd.needsProjectDir ? '📂' : '⚡' }}</span>
          <span class="command-name">{{ cmd.name }}</span>
          <span v-if="cmd.type === 'custom'" class="badge">自定义</span>
        </div>
        <div class="command-text">{{ cmd.command }}</div>
        <div v-if="cmd.description" class="command-desc">{{ cmd.description }}</div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.command-list {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  outline: none;
}

.command-error {
  margin-bottom: 8px;
  color: #e53935;
  font-size: 13px;
}

.command-empty {
  margin-top: 24px;
  text-align: center;
  color: #888;
  font-size: 14px;
}

.command-list-items {
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

.command-item {
  padding: 8px 12px;
  border-radius: 5px;
  cursor: pointer;
}

.command-item.active {
  background-color: var(--primary-color);
  color: #fff;
}

.command-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.command-icon {
  font-size: 16px;
}

.command-name {
  font-weight: 600;
  font-size: 14px;
  flex: 1;
}

.badge {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.1);
}

.commands li.active .badge {
  background: rgba(255, 255, 255, 0.25);
}

.command-text {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
  color: #666;
  opacity: 0.75;
  margin-top: 2px;
}

.command-item.active .command-text {
  color: #fff;
}

.command-desc {
  font-size: 11px;
  color: #999;
  opacity: 0.75;
  margin-top: 2px;
}

.command-item.active .command-desc {
  color: #fff;
}

@media (prefers-color-scheme: dark) {
  .command-text {
    color: #aaa;
  }

  .command-desc {
    color: #888;
  }
}
</style>
