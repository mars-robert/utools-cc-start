<script lang="ts" setup>
import { onMounted, ref } from 'vue'

const isWindows = window.utools.isWindows ? window.utools.isWindows() : false

const launchCommands = ref<any[]>([])
const terminals = ref<any[]>([])
const selectedLaunchId = ref('')
const selectedTerminalId = ref('')
const terminalPaths = ref<Record<string, string>>({})
const saved = ref(false)

// 管理弹窗状态
const showLaunchDialog = ref(false)
const showTerminalDialog = ref(false)
const editingLaunch = ref<any>(null)
const editingTerminal = ref<any>(null)
const launchForm = ref({ label: '', command: '' })
const terminalForm = ref({ label: '', path: '' })

const load = () => {
  const s = window.services.getLauncherSettings()
  launchCommands.value = s.launchCommands
  terminals.value = s.terminals
  selectedLaunchId.value = s.selectedLaunchId
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

const onSelectLaunch = () => {
  window.services.setSelectedLaunchId(selectedLaunchId.value)
  flashSaved()
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
const openAddLaunch = () => {
  editingLaunch.value = null
  launchForm.value = { label: '', command: '' }
  showLaunchDialog.value = true
}

const openEditLaunch = (item: any) => {
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
    window.services.updateLaunchCommand(editingLaunch.value.id, { ...launchForm.value })
  } else {
    const created = window.services.addLaunchCommand({ ...launchForm.value })
    if (created) selectedLaunchId.value = created.id
  }
  showLaunchDialog.value = false
  load()
  window.services.setSelectedLaunchId(selectedLaunchId.value)
}

const deleteLaunch = (item: any) => {
  if (item.builtin) return
  if (window.confirm(`确定删除启动命令 "${item.label}" 吗？`)) {
    window.services.deleteLaunchCommand(item.id)
    load()
    selectedLaunchId.value = window.services.getLauncherSettings().selectedLaunchId
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

onMounted(load)
</script>

<template>
  <div class="conf">
    <!-- 启动命令 -->
    <div class="section card">
      <h3 class="section-title">启动命令</h3>
      <div class="radio-list">
        <div v-for="c in launchCommands" :key="c.id" class="radio-item" :class="{ selected: selectedLaunchId === c.id }">
          <input
            type="radio"
            :id="'lc-' + c.id"
            :value="c.id"
            v-model="selectedLaunchId"
            @change="onSelectLaunch"
          />
          <label :for="'lc-' + c.id">
            <div class="radio-content">
              <code class="radio-detail">{{ c.command }}</code>
              <span class="radio-label">{{ c.label }}</span>
            </div>
            <span v-if="!c.builtin" class="badge">自定义</span>
          </label>
          <div class="radio-actions">
            <button v-if="!c.builtin" class="btn btn-sm" @click="openEditLaunch(c)">编辑</button>
            <button v-if="!c.builtin" class="btn btn-sm btn-danger" @click="deleteLaunch(c)">删除</button>
          </div>
        </div>
      </div>
      <button class="btn btn-primary" @click="openAddLaunch">+ 新增启动命令</button>
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
        <h3>{{ editingLaunch ? '编辑启动命令' : '新增启动命令' }}</h3>
        <div class="form-field">
          <label>命令：</label>
          <input v-model="launchForm.command" placeholder="例如：claude --resume" />
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
</style>


