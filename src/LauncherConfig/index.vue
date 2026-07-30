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

const onSelectTerminal = () => {
  window.services.setSelectedTerminalId(selectedTerminalId.value)
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
    <div v-if="isWindows" class="section card">
      <h3 class="section-title">终端</h3>
      <div class="radio-list">
        <div v-for="t in terminals" :key="t.id" class="radio-item" :class="{ selected: selectedTerminalId === t.id }">
          <input
            type="radio"
            :id="'bt-' + t.id"
            :value="t.id"
            v-model="selectedTerminalId"
            @change="onSelectTerminal"
          />
          <label :for="'bt-' + t.id">
            <span class="radio-label">{{ t.label }}</span>
            <span v-if="t.builtin" class="badge-preset">预设</span>
            <span v-else class="badge">自定义</span>
          </label>
          <div class="path-input-group">
            <input
              v-model="terminalPaths[t.id]"
              class="path-input"
              :placeholder="t.builtin ? '系统默认路径' : '可执行文件路径'"
              :disabled="!t.builtin && !t.id.startsWith('bt-custom')"
            />
            <button v-if="t.builtin" class="btn btn-sm" @click="resetTerminalPath(t)">恢复默认</button>
            <button v-if="!t.builtin" class="btn btn-sm" @click="openEditTerminal(t)">编辑</button>
            <button v-if="!t.builtin" class="btn btn-sm btn-danger" @click="deleteTerminal(t)">删除</button>
          </div>
        </div>
      </div>
      <div class="actions-row">
        <button class="btn btn-primary" @click="saveTerminalPaths">
          保存路径
          <span v-if="saved" class="saved-badge">✓ 已保存</span>
        </button>
        <button class="btn" @click="openAddTerminal">+ 新增自定义终端</button>
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

<style scoped><style scoped>
.conf { box-sizing: border-box; }

.section { margin-bottom: var(--spacing-xl); }
.section-title {
  margin: 0 0 var(--spacing-lg);
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--text-primary);
}

.radio-list { display: flex; flex-direction: column; gap: var(--spacing-sm); margin-bottom: var(--spacing-lg); }

.radio-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-md);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  transition: all 0.2s ease;
  flex-wrap: wrap;
}
.radio-item:hover { background: var(--bg-hover); }
.radio-item.selected {
  background: color-mix(in srgb, var(--primary-color) 8%, transparent);
  border-color: var(--primary-color);
}

.radio-item input[type="radio"] {
  appearance: none;
  -webkit-appearance: none;
  width: 18px; height: 18px;
  border: 2px solid var(--border-color);
  border-radius: 50%;
  cursor: pointer;
  flex: 0 0 auto;
  position: relative;
  transition: border-color 0.2s ease;
}
.radio-item input[type="radio"]:checked {
  border-color: var(--primary-color);
}
.radio-item input[type="radio"]:checked::after {
  content: '';
  position: absolute;
  inset: 3px;
  background: var(--primary-color);
  border-radius: 50%;
}

.radio-item label {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  cursor: pointer;
  flex: 1 1 auto;
  min-width: 0;
}

.radio-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1 1 auto;
  min-width: 0;
}

.radio-label {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 400;
}

.radio-detail {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: var(--font-size-base);
  color: var(--text-primary);
  font-weight: 500;
}

.badge {
  font-size: 11px; padding: 1px 6px; border-radius: 4px;
  background: color-mix(in srgb, var(--primary-color) 14%, transparent); color: var(--primary-color); font-weight: 400;
}
.badge-preset {
  font-size: 11px; padding: 1px 6px; border-radius: 4px;
  background: var(--bg-hover); color: var(--text-tertiary);
}

.radio-actions { display: flex; gap: var(--spacing-xs); flex: 0 0 auto; }

.path-input-group {
  display: flex;
  gap: var(--spacing-sm);
  align-items: center;
  flex: 1 1 100%;
  margin-top: var(--spacing-sm);
}
.path-input {
  flex: 1 1 auto;
  min-width: 0;
  padding: 8px 10px;
  font-size: var(--font-size-sm);
  font-family: 'Consolas', 'Monaco', monospace;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--card-bg);
  color: var(--text-primary);
  outline: none;
}
.path-input:focus { border-color: var(--primary-color); }
.path-input:disabled { opacity: 0.6; cursor: not-allowed; }

.btn-sm { padding: 2px 6px; font-size: 11px; }

.actions-row { display: flex; gap: var(--spacing-sm); }

.saved-indicator {
  display: inline-block;
  color: #43a047;
  font-size: var(--font-size-sm);
  font-weight: 500;
}

.saved-badge {
  margin-left: 6px;
  color: #fff;
  font-size: 12px;
  font-weight: 500;
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateX(-4px); }
  to { opacity: 1; transform: translateX(0); }
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


.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-md);
}
.section-head-text { flex: 1 1 auto; min-width: 0; }
.section-desc {
  margin: 4px 0 0;
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: var(--spacing-sm);
}
.launch-card {
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--card-bg);
  cursor: pointer;
  transition: border-color .18s ease, background .18s ease, box-shadow .18s ease;
}
.launch-card:hover { border-color: var(--primary-color); }
.launch-card.active {
  border-color: var(--primary-color);
  background: rgba(25, 118, 210, .08);
  box-shadow: 0 0 0 1px rgba(25, 118, 210, .18);
}
.card-top {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
}
.card-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  color: var(--text-primary);
  font-size: var(--font-size-base);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.card-actions,
.card-tools {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 4px;
}
.tag {
  flex: 0 0 auto;
  padding: 3px 6px;
  border-radius: 4px;
  font-size: 11px;
  line-height: 1;
}
.tag-gray,
.tag-off { background: var(--bg-hover); color: var(--text-tertiary); }
.tag-blue,
.tag-on { background: rgba(25, 118, 210, .14); color: var(--primary-color); }
.tag-on { display: inline-flex; align-items: center; gap: 4px; }
.tag-on .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--primary-color);
}
.tool {
  width: 26px;
  height: 26px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--card-bg);
  color: var(--text-secondary);
  cursor: pointer;
}
.tool:hover { border-color: var(--primary-color); color: var(--primary-color); }
.tool-del:hover { border-color: #e53935; color: #e53935; }
.card-body {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border-color);
}
.command-line { display: flex; align-items: center; gap: 8px; min-width: 0; }
.ki {
  width: 22px;
  height: 22px;
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: var(--bg-hover);
  color: var(--text-tertiary);
}
.command-text {
  min-width: 0;
  overflow: hidden;
  color: var(--text-secondary);
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 13px;
  letter-spacing: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}
@media (max-width: 620px) {
  .section-head { align-items: flex-start; }
  .card-grid { grid-template-columns: 1fr; }
  .card-top { flex-wrap: wrap; }
  .card-actions { width: 100%; justify-content: flex-end; }
}

</style>
