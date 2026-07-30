<script lang="ts" setup>
import { onMounted, ref } from 'vue'

const isWindows = window.utools.isWindows ? window.utools.isWindows() : false

const launchCommands = ref<any[]>([])
const codexLaunchCommands = ref<any[]>([])
const terminals = ref<any[]>([])
const selectedLaunchId = ref('')
const selectedCodexLaunchId = ref('')
const selectedTerminalId = ref('')
const terminalPaths = ref<Record<string, string>>({})
const saved = ref(false)

// 管理弹窗状态
const showLaunchDialog = ref(false)
const showTerminalDialog = ref(false)
const editingLaunch = ref<any>(null)
const launchTarget = ref<'claude' | 'codex'>('claude')
const editingTerminal = ref<any>(null)
const launchForm = ref({ label: '', command: '' })
const terminalForm = ref({ label: '', path: '' })

const load = () => {
  const s = window.services.getLauncherSettings()
  launchCommands.value = s.launchCommands
  codexLaunchCommands.value = s.codexLaunchCommands || []
  terminals.value = s.terminals
  selectedLaunchId.value = s.selectedLaunchId
  selectedCodexLaunchId.value = s.selectedCodexLaunchId
  selectedTerminalId.value = s.selectedTerminalId

  // 初始化终端路径 map
  const paths: Record<string, string> = {}
  s.terminals.forEach((t: any) => {
    paths[t.id] = t.resolvedPath || ''
  })
  terminalPaths.value = paths
}

const flashSaved = () => {
  saved.value = true
  setTimeout(() => { saved.value = false }, 1500)
}

const selectLaunchCommand = (id: string) => {
  if (selectedLaunchId.value === id) return
  selectedLaunchId.value = id
  window.services.setSelectedLaunchId(id)
}

const selectCodexLaunchCommand = (id: string) => {
  if (selectedCodexLaunchId.value === id) return
  selectedCodexLaunchId.value = id
  window.services.setSelectedCodexLaunchId(id)
}

const selectTerminal = (id: string) => {
  if (selectedTerminalId.value === id) return
  selectedTerminalId.value = id
  window.services.setSelectedTerminalId(id)
  flashSaved()
}

const saveTerminalPaths = () => {
  terminals.value.forEach((t: any) => {
    if (t.builtin) {
      const s = window.services.getLauncherSettings()
      const defaultT = s.terminals.find((x: any) => x.id === t.id)
      const defaultPath = defaultT?.resolvedPath || ''
      const currentPath = terminalPaths.value[t.id] || ''

      // 如果用户修改了路径，保存覆盖
      if (currentPath && currentPath !== defaultPath) {
        window.services.setTerminalPathOverride(t.id, currentPath)
      }
    }
  })
  load() // 重新加载
  flashSaved()
}

const resetTerminalPath = (t: any) => {
  if (!t.builtin) return
  window.services.clearTerminalPathOverride(t.id)
  load()
  flashSaved()
}

const saveTerminalPath = (t: any) => {
  if (!t.builtin) return
  const s = window.services.getLauncherSettings()
  const defaultT = s.terminals.find((x: any) => x.id === t.id)
  const defaultPath = defaultT?.resolvedPath || ''
  const currentPath = terminalPaths.value[t.id] || ''

  // 如果用户修改了路径，保存覆盖
  if (currentPath && currentPath !== defaultPath) {
    window.services.setTerminalPathOverride(t.id, currentPath)
  } else if (!currentPath) {
    // 如果清空了路径，恢复默认
    window.services.clearTerminalPathOverride(t.id)
  }
  load()
  flashSaved()
}

// ---- 启动命令管理 ----
const openAddLaunch = (target: 'claude' | 'codex') => {
  launchTarget.value = target
  editingLaunch.value = null
  launchForm.value = { label: '', command: '' }
  showLaunchDialog.value = true
}

const openEditLaunch = (item: any, target: 'claude' | 'codex') => {
  launchTarget.value = target
  editingLaunch.value = item
  launchForm.value = { label: item.label, command: item.command }
  showLaunchDialog.value = true
}

const saveLaunch = () => {
  if (!launchForm.value.command.trim()) {
    window.utools.showNotification('启动命令不能为空')
    return
  }
  if (editingLaunch.value) {
    if (launchTarget.value === 'codex') {
      window.services.updateCodexLaunchCommand(editingLaunch.value.id, { ...launchForm.value })
    } else {
      window.services.updateLaunchCommand(editingLaunch.value.id, { ...launchForm.value })
    }
  } else {
    const created = launchTarget.value === 'codex'
      ? window.services.addCodexLaunchCommand({ ...launchForm.value })
      : window.services.addLaunchCommand({ ...launchForm.value })
    if (created && launchTarget.value === 'codex') {
      selectedCodexLaunchId.value = created.id
      window.services.setSelectedCodexLaunchId(created.id)
    } else if (created) {
      selectedLaunchId.value = created.id
      window.services.setSelectedLaunchId(created.id)
    }
  }
  showLaunchDialog.value = false
  load()
}

const deleteLaunch = (item: any, target: 'claude' | 'codex') => {
  if (item.builtin) return
  if (window.confirm(`确定删除启动命令 "${item.label}" 吗？`)) {
    if (target === 'codex') window.services.deleteCodexLaunchCommand(item.id)
    else window.services.deleteLaunchCommand(item.id)
    load()
  }
}

// ---- 终端管理 ----
const openAddTerminal = () => {
  editingTerminal.value = null
  terminalForm.value = { label: '', path: '' }
  showTerminalDialog.value = true
}

const openEditTerminal = (item: any) => {
  editingTerminal.value = item
  terminalForm.value = { label: item.label, path: item.path || '' }
  showTerminalDialog.value = true
}

const saveTerminal = () => {
  if (!terminalForm.value.path.trim()) {
    window.utools.showNotification('终端路径不能为空')
    return
  }
  if (editingTerminal.value) {
    window.services.updateTerminal(editingTerminal.value.id, { ...terminalForm.value })
  } else {
    const created = window.services.addTerminal({ ...terminalForm.value })
    if (created) selectedTerminalId.value = created.id
  }
  showTerminalDialog.value = false
  load()
  window.services.setSelectedTerminalId(selectedTerminalId.value)
}

const deleteTerminal = (item: any) => {
  if (item.builtin) return
  if (window.confirm(`确定删除终端 "${item.label}" 吗？`)) {
    window.services.deleteTerminal(item.id)
    load()
    selectedTerminalId.value = window.services.getLauncherSettings().selectedTerminalId
  }
}

// 工具函数：去除括号及括号中的内容
const removeBrackets = (text: string) => {
  if (!text) return ''
  return text.replace(/\s*[\(（].*?[\)）]\s*/g, '').trim()
}

// 获取显示名称（去除括号）
const getDisplayName = (item: any) => {
  const name = item.label || item.command
  return removeBrackets(name)
}

onMounted(load)
</script>

<template>
  <div class="conf">
    <!-- 启动命令 -->
    <div class="section">
      <div class="section-head">
        <div class="section-head-text">
          <h3 class="section-title">Claude 启动命令</h3>
          <p class="section-desc">选择 Claude 启动时的默认命令，点击卡片即可切换</p>
        </div>
        <button class="btn btn-primary" @click="openAddLaunch('claude')">+ 新增命令</button>
      </div>

      <div class="card-grid">
        <div
          v-for="c in launchCommands"
          :key="c.id"
          class="launch-card"
          :class="{ active: selectedLaunchId === c.id }"
          @click="selectLaunchCommand(c.id)"
        >
          <div class="card-top">
            <span class="card-name">{{ getDisplayName(c) }}</span>
            <span v-if="c.builtin" class="tag tag-gray">预设</span>
            <span v-else class="tag tag-blue">自定义</span>
            <div class="card-actions">
              <span v-if="selectedLaunchId === c.id" class="tag tag-on"><i class="dot"></i>已选中</span>
              <span v-else class="tag tag-off">未选中</span>
              <span v-if="!c.builtin" class="card-tools">
                <button class="tool" title="编辑" @click.stop="openEditLaunch(c, 'claude')">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                </button>
                <button class="tool tool-del" title="删除" @click.stop="deleteLaunch(c, 'claude')">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 6h18" />
                    <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6M14 11v6" />
                  </svg>
                </button>
              </span>
            </div>
          </div>
          <div class="card-body">
            <div class="kv command-line">
              <span class="ki" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="4 17 10 11 4 5" />
                  <line x1="12" y1="19" x2="20" y2="19" />
                </svg>
              </span>
              <code class="v command-text">{{ c.command }}</code>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Codex 启动命令 -->
    <div class="section">
      <div class="section-head">
        <div class="section-head-text">
          <h3 class="section-title">Codex 启动命令</h3>
          <p class="section-desc">选择 Codex 启动时的默认命令，点击卡片即可切换</p>
        </div>
        <button class="btn btn-primary" @click="openAddLaunch('codex')">+ 新增命令</button>
      </div>

      <div class="card-grid">
        <div
          v-for="c in codexLaunchCommands"
          :key="c.id"
          class="launch-card"
          :class="{ active: selectedCodexLaunchId === c.id }"
          @click="selectCodexLaunchCommand(c.id)"
        >
          <div class="card-top">
            <span class="card-name">{{ getDisplayName(c) }}</span>
            <span v-if="c.builtin" class="tag tag-gray">预设</span>
            <span v-else class="tag tag-blue">自定义</span>
            <div class="card-actions">
              <span v-if="selectedCodexLaunchId === c.id" class="tag tag-on"><i class="dot"></i>已选中</span>
              <span v-else class="tag tag-off">未选中</span>
              <span v-if="!c.builtin" class="card-tools">
                <button class="tool" title="编辑" @click.stop="openEditLaunch(c, 'codex')">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                </button>
                <button class="tool tool-del" title="删除" @click.stop="deleteLaunch(c, 'codex')">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 6h18" />
                    <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6M14 11v6" />
                  </svg>
                </button>
              </span>
            </div>
          </div>
          <div class="card-body">
            <div class="kv command-line">
              <span class="ki" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="4 17 10 11 4 5" />
                  <line x1="12" y1="19" x2="20" y2="19" />
                </svg>
              </span>
              <code class="v command-text">{{ c.command }}</code>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 终端 -->
    <div v-if="isWindows" class="section">
      <div class="section-head">
        <div class="section-head-text">
          <h3 class="section-title">终端配置</h3>
          <p class="section-desc">选择默认终端程序，点击卡片切换，可自定义路径</p>
        </div>
        <div class="section-actions">
          <button class="btn btn-primary" @click="openAddTerminal">+ 新增终端</button>
          <button class="btn btn-success" @click="saveTerminalPaths">
            保存终端路径
            <span v-if="saved" class="saved-badge">✓ 已保存</span>
          </button>
        </div>
      </div>

      <div class="terminal-list">
        <div
          v-for="t in terminals"
          :key="t.id"
          class="terminal-item"
          :class="{ active: selectedTerminalId === t.id }"
          @click="selectTerminal(t.id)"
        >
          <div class="terminal-header">
            <div class="terminal-info">
              <span class="terminal-name">{{ t.label }}</span>
              <span v-if="t.builtin" class="tag tag-gray">预设</span>
              <span v-else class="tag tag-blue">自定义</span>
            </div>
            <div class="terminal-status">
              <div class="card-actions">
                <span v-if="selectedTerminalId === t.id" class="tag tag-on"><i class="dot"></i>已选中</span>
                <span v-else class="tag tag-off">未选中</span>
                <span v-if="!t.builtin" class="card-tools">
                  <button class="tool" title="编辑" @click.stop="openEditTerminal(t)">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
                  </button>
                  <button class="tool tool-del" title="删除" @click.stop="deleteTerminal(t)">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M3 6h18" />
                      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      <path d="M10 11v6M14 11v6" />
                    </svg>
                  </button>
                </span>
              </div>
            </div>
          </div>
          <div class="terminal-body">
            <div v-if="t.builtin" class="path-edit-full">
              <div class="path-input-wrapper">
                <span class="path-icon-inner" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                </span>
                <input
                  v-model="terminalPaths[t.id]"
                  class="path-input-full"
                  placeholder="自定义路径（留空使用默认）"
                  @click.stop
                />
              </div>
              <button class="btn-update" @click.stop="saveTerminalPath(t)">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
                </svg>
                <span>更新</span>
              </button>
            </div>
            <div v-else class="path-display">
              <span class="path-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
              </span>
              <span class="path-text">{{ terminalPaths[t.id] || '使用系统默认路径' }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 启动命令弹窗 -->
    <div v-if="showLaunchDialog" class="dialog-overlay" @click="showLaunchDialog = false">
      <div class="dialog card" @click.stop>
        <h3>{{ editingLaunch ? '编辑' : '新增' }} {{ launchTarget === 'codex' ? 'Codex' : 'Claude' }} 启动命令</h3>
        <div class="form-field">
          <label>命令：</label>
          <input v-model="launchForm.command" :placeholder="launchTarget === 'codex' ? '例如：codex --full-auto' : '例如：claude --resume'" />
        </div>
        <div class="form-field">
          <label>显示名称（可选）：</label>
          <input v-model="launchForm.label" placeholder="便于识别的名称" />
        </div>
        <div class="dialog-actions">
          <button class="btn btn-primary" @click="saveLaunch">保存</button>
          <button class="btn" @click="showLaunchDialog = false">取消</button>
        </div>
      </div>
    </div>

    <!-- 终端弹窗 -->
    <div v-if="showTerminalDialog" class="dialog-overlay" @click="showTerminalDialog = false">
      <div class="dialog card" @click.stop>
        <h3>{{ editingTerminal ? '编辑终端' : '新增自定义终端' }}</h3>
        <div class="form-field">
          <label>终端路径：</label>
          <input v-model="terminalForm.path" placeholder="C:\\path\\to\\terminal.exe" />
        </div>
        <div class="form-field">
          <label>显示名称（可选）：</label>
          <input v-model="terminalForm.label" placeholder="便于识别的名称" />
        </div>
        <div class="dialog-actions">
          <button class="btn btn-primary" @click="saveTerminal">保存</button>
          <button class="btn" @click="showTerminalDialog = false">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.conf {
  padding: var(--spacing-md) var(--spacing-sm);
  max-width: 100%;
  overflow-x: hidden;
  box-sizing: border-box;
}

.section { margin-bottom: var(--spacing-lg); }

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--spacing-md);
  gap: var(--spacing-sm);
}
.section-head-text { flex: 1 1 auto; min-width: 0; }
.section-actions {
  display: flex;
  gap: var(--spacing-sm);
  flex: 0 0 auto;
}
.section-title {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--text-primary);
}
.section-desc {
  margin: 4px 0 0;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: var(--spacing-sm);
}

/* 终端配置使用列表布局，每项占满一行 */
.terminal-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.terminal-item {
  --active-color: #1976d2;
  --active-color-rgb: 25, 118, 210;
  --active-bg: #e3f2fd;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--card-radius);
  padding: 10px 12px;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, .08), 0 1px 2px rgba(0, 0, 0, .04);
  transition: border-color .18s ease, box-shadow .18s ease, transform .18s ease, background .18s ease;
}

.terminal-item:hover {
  border-color: var(--primary-color);
  box-shadow: 0 8px 22px rgba(0, 0, 0, .13), 0 3px 6px rgba(0, 0, 0, .07);
  transform: translateY(-2px);
}

.terminal-item.active {
  border-color: var(--active-color);
  background: var(--active-bg);
  box-shadow: 0 4px 14px rgba(var(--active-color-rgb), .22);
}

.terminal-item.active:hover {
  border-color: var(--active-color);
  background: #bbdefb;
  box-shadow: 0 8px 24px rgba(var(--active-color-rgb), .34);
  transform: translateY(-2px);
}

@media (prefers-color-scheme: dark) {
  .terminal-item {
    --active-color: #42a5f5;
    --active-color-rgb: 66, 165, 245;
    --active-bg: #0d2a42;
  }
  .terminal-item:hover {
    border-color: var(--primary-color);
    box-shadow: 0 10px 26px rgba(0, 0, 0, .55);
  }
  .terminal-item.active {
    box-shadow: 0 6px 20px rgba(var(--active-color-rgb), .35);
  }
  .terminal-item.active:hover {
    background: #103a5e;
    box-shadow: 0 10px 28px rgba(var(--active-color-rgb), .45);
  }
}

.terminal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
  margin-bottom: 8px;
}

.terminal-info {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  flex: 1 1 auto;
  min-width: 0;
}

.terminal-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.terminal-status {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  flex: 0 0 auto;
  overflow: hidden;
}

.terminal-body {
  padding-top: 8px;
  border-top: 1px solid var(--border-color);
}

/* 注意：uTools 老内核不支持 color-mix()，全部用 rgba/hex 兜底 */
.launch-card,
.terminal-card {
  --active-color: #1976d2;
  --active-color-rgb: 25, 118, 210;
  --active-bg: #e3f2fd;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--card-radius);
  padding: 10px 12px;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, .08), 0 1px 2px rgba(0, 0, 0, .04);
  transition: border-color .18s ease, box-shadow .18s ease, transform .18s ease, background .18s ease;
}

.launch-card:hover,
.terminal-card:hover {
  border-color: var(--primary-color);
  box-shadow: 0 8px 22px rgba(0, 0, 0, .13), 0 3px 6px rgba(0, 0, 0, .07);
  transform: translateY(-2px);
}

.launch-card.active,
.terminal-card.active {
  border-color: var(--active-color);
  background: var(--active-bg);
  box-shadow: 0 4px 14px rgba(var(--active-color-rgb), .22);
}

.launch-card.active:hover,
.terminal-card.active:hover {
  border-color: var(--active-color);
  background: #bbdefb;
  box-shadow: 0 8px 24px rgba(var(--active-color-rgb), .34);
  transform: translateY(-2px);
}

@media (prefers-color-scheme: dark) {
  .launch-card,
  .terminal-card {
    --active-color: #42a5f5;
    --active-color-rgb: 66, 165, 245;
    --active-bg: #0d2a42;
  }
  .launch-card:hover,
  .terminal-card:hover {
    border-color: var(--primary-color);
    box-shadow: 0 10px 26px rgba(0, 0, 0, .55);
  }
  .launch-card.active,
  .terminal-card.active {
    box-shadow: 0 6px 20px rgba(var(--active-color-rgb), .35);
  }
  .launch-card.active:hover,
  .terminal-card.active:hover {
    background: #103a5e;
    box-shadow: 0 10px 28px rgba(var(--active-color-rgb), .45);
  }
}

.card-top {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: nowrap;
  min-height: 28px;
}

.card-actions {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

/* 默认收起（宽度 0），负 margin 抵消父级 gap 让标签贴右；hover 展开推动标签左移 */
.card-tools {
  display: inline-flex;
  gap: 4px;
  max-width: 0;
  margin-left: -6px;
  opacity: 0;
  overflow: hidden;
  transition: max-width 0.28s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease, margin-left 0.28s ease;
}

.launch-card:hover .card-tools,
.terminal-item:hover .card-tools {
  max-width: 80px;
  margin-left: 0;
  opacity: 1;
}

.card-name {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tag {
  flex: 0 0 auto;
  font-size: 11px;
  line-height: 1;
  padding: 3px 7px;
  border-radius: 5px;
  font-weight: 500;
}
.tag-gray {
  background: var(--bg-hover);
  color: var(--text-tertiary);
}
.tag-blue {
  background: rgba(25, 118, 210, 0.14);
  color: #1976d2;
}
@media (prefers-color-scheme: dark) {
  .tag-blue {
    background: rgba(66, 165, 245, 0.18);
    color: #42a5f5;
  }
}
.tag-off {
  padding: 4px 9px;
  border-radius: 999px;
  background: var(--bg-hover);
  color: var(--text-tertiary);
  font-weight: 500;
}
.tag-on {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 9px;
  border-radius: 999px;
  background: rgba(var(--active-color-rgb), .18);
  color: var(--active-color);
  font-weight: 600;
}
.tag-on .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--active-color);
  box-shadow: 0 0 0 3px rgba(var(--active-color-rgb), .22);
}

.tool {
  width: 26px;
  height: 26px;
  border: 1px solid var(--border-color);
  background: var(--card-bg);
  border-radius: 6px;
  cursor: pointer;
  color: var(--text-tertiary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all .15s ease;
  padding: 0;
}
.tool:hover {
  background: var(--primary-color);
  border-color: var(--primary-color);
  color: #fff;
}
.tool-del:hover {
  background: #e53935;
  border-color: #e53935;
  color: #fff;
}

.card-body {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.kv {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-size: var(--font-size-sm);
}

.ki {
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: var(--bg-hover);
  color: var(--text-tertiary);
}

.v {
  flex: 1 1 auto;
  min-width: 0;
  color: var(--text-secondary);
  font-family: 'Consolas', 'Monaco', monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.path-edit-full {
  display: flex;
  gap: var(--spacing-sm);
  align-items: center;
}

.path-input-wrapper {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
}

.path-icon-inner {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  pointer-events: none;
  z-index: 1;
}

.path-input-full {
  width: 100%;
  padding: 6px 8px 6px 32px;
  font-size: var(--font-size-sm);
  font-family: 'Consolas', 'Monaco', monospace;
  border: none;
  border-radius: 6px;
  background: var(--bg-hover);
  color: var(--text-primary);
  outline: none;
  transition: background .15s ease;
  height: 32px;
  box-sizing: border-box;
}

.terminal-item:hover .path-input-full {
  background: rgba(25, 118, 210, 0.08);
}

.terminal-item.active .path-input-full {
  background: rgba(25, 118, 210, 0.12);
}

.path-input-full:focus {
  background: rgba(25, 118, 210, 0.15);
}

@media (prefers-color-scheme: dark) {
  .terminal-item:hover .path-input-full {
    background: rgba(66, 165, 245, 0.12);
  }
  .terminal-item.active .path-input-full {
    background: rgba(66, 165, 245, 0.16);
  }
  .path-input-full:focus {
    background: rgba(66, 165, 245, 0.2);
  }
}

.path-display {
  display: flex;
  gap: var(--spacing-sm);
  align-items: center;
  padding: 8px 10px;
  background: var(--bg-hover);
  border-radius: 6px;
}

.path-icon {
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: rgba(25, 118, 210, 0.1);
  color: var(--primary-color);
}

@media (prefers-color-scheme: dark) {
  .path-icon {
    background: rgba(66, 165, 245, 0.15);
  }
}

.path-text {
  flex: 1 1 auto;
  min-width: 0;
  color: var(--text-secondary);
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: var(--font-size-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.btn-update {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px;
  font-size: var(--font-size-sm);
  height: 32px;
  flex: 0 0 auto;
  background: var(--primary-color);
  color: #fff;
  border: 1px solid var(--primary-color);
  border-radius: 6px;
  cursor: pointer;
  transition: all .15s ease;
  font-weight: 500;
  box-sizing: border-box;
}
.btn-update:hover {
  opacity: 0.9;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(25, 118, 210, 0.3);
}
.btn-update svg {
  flex: 0 0 auto;
}
.btn-update span {
  flex: 0 0 auto;
}

.btn-success {
  background: #43a047;
  border-color: #43a047;
  color: #fff;
}
.btn-success:hover {
  background: #388e3c;
  border-color: #388e3c;
}

.command-line {
  padding: 6px 8px;
  background: var(--bg-hover);
  border-radius: 6px;
  transition: background .15s ease;
}

.launch-card:hover .command-line {
  background: rgba(25, 118, 210, 0.08);
}

.launch-card.active .command-line {
  background: rgba(25, 118, 210, 0.12);
}

@media (prefers-color-scheme: dark) {
  .launch-card:hover .command-line {
    background: rgba(66, 165, 245, 0.12);
  }
  .launch-card.active .command-line {
    background: rgba(66, 165, 245, 0.16);
  }
}

.command-text {
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.02em;
}

.btn-xs {
  padding: 4px 8px;
  font-size: 11px;
}

.saved-badge {
  margin-left: 6px;
  color: #fff;
  font-size: 12px;
  font-weight: 500;
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateX(-4px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.dialog-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,.5);
  display: flex; align-items: center; justify-content: center; z-index: 1000;
}
.dialog { width: 90%; max-width: 460px; }
.dialog h3 { margin: 0 0 var(--spacing-lg); color: var(--text-primary); }
.form-field { margin-bottom: var(--spacing-lg); }
.form-field label {
  display: block; margin-bottom: var(--spacing-xs);
  font-size: var(--font-size-sm); font-weight: 600; color: var(--text-primary);
}
.form-field input {
  width: 100%; padding: 8px; border: 1px solid var(--border-color);
  border-radius: 6px; font-size: var(--font-size-base);
  box-sizing: border-box; background: var(--card-bg); color: var(--text-primary);
}
.form-field input:focus { border-color: var(--primary-color); outline: none; }
.dialog-actions { display: flex; gap: var(--spacing-sm); justify-content: flex-end; margin-top: var(--spacing-lg); }
</style>
