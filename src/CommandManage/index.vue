<script lang="ts" setup>
import { ref, onMounted, computed } from 'vue'

const commands = ref<any[]>([])
const showAddDialog = ref(false)
const editingCommand = ref<any>(null)

const formData = ref({
  name: '',
  command: '',
  description: '',
  needsProjectDir: false
})

const loadCommands = () => {
  commands.value = window.services.getAllCommands()
}

// 按类别和优先级分组命令
const groupedCommands = computed(() => {
  const groups = {
    claude: { title: 'Claude CLI', icon: 'claude', commands: [] as any[] },
    openspec: { title: 'OpenSpec', icon: 'openspec', commands: [] as any[] },
    npm: { title: 'NPM', icon: 'npm', commands: [] as any[] },
    git: { title: 'Git', icon: 'git', commands: [] as any[] },
    custom: { title: '自定义命令', icon: 'custom', commands: [] as any[] }
  }

  commands.value.forEach((cmd: any) => {
    if (cmd.type === 'custom') {
      groups.custom.commands.push(cmd)
    } else if (cmd.id.startsWith('claude-')) {
      groups.claude.commands.push(cmd)
    } else if (cmd.id.startsWith('openspec-')) {
      groups.openspec.commands.push(cmd)
    } else if (cmd.id.startsWith('npm-')) {
      groups.npm.commands.push(cmd)
    } else if (cmd.id.startsWith('git-')) {
      groups.git.commands.push(cmd)
    }
  })

  // 只返回有命令的分组，按优先级排序
  return Object.entries(groups)
    .filter(([_, group]) => group.commands.length > 0)
    .map(([key, group]) => ({ key, ...group }))
})

const isBuiltin = (cmd: any) => cmd.type === 'builtin'

const openAddDialog = () => {
  editingCommand.value = null
  formData.value = { name: '', command: '', description: '', needsProjectDir: false }
  showAddDialog.value = true
}

const openEditDialog = (cmd: any) => {
  editingCommand.value = cmd
  formData.value = {
    name: cmd.name,
    command: cmd.command,
    description: cmd.description || '',
    needsProjectDir: cmd.needsProjectDir || false
  }
  showAddDialog.value = true
}

const saveCommand = () => {
  if (!formData.value.name || !formData.value.command) {
    window.utools.showNotification('名称和命令不能为空')
    return
  }
  if (editingCommand.value) {
    if (isBuiltin(editingCommand.value)) {
      window.services.updateBuiltinCommand(editingCommand.value.id, { ...formData.value })
    } else {
      window.services.updateCustomCommand(editingCommand.value.id, { ...formData.value })
    }
  } else {
    window.services.addCustomCommand({ ...formData.value })
  }
  showAddDialog.value = false
  loadCommands()
}

const deleteCommand = (cmd: any) => {
  if (!window.confirm(`确定删除命令 "${cmd.name}" 吗？`)) return
  if (isBuiltin(cmd)) {
    window.services.deleteBuiltinCommand(cmd.id)
  } else {
    window.services.deleteCustomCommand(cmd.id)
  }
  loadCommands()
}

const resetCommand = (cmd: any) => {
  window.services.resetBuiltinCommand(cmd.id)
  loadCommands()
}

const closeDialog = () => { showAddDialog.value = false }

onMounted(loadCommands)
</script>

<template>
  <div class="command-manage">
    <div class="page-header">
      <div class="header-text">
        <h2 class="page-title">快捷命令</h2>
        <p class="page-desc">管理常用的开发命令，快速执行日常任务</p>
      </div>
      <button class="btn btn-primary" @click="openAddDialog">+ 新增命令</button>
    </div>

    <!-- 按分组展示命令 -->
    <div v-for="group in groupedCommands" :key="group.key" class="command-section">
      <div class="section-header">
        <span class="section-icon">
          <svg v-if="group.key === 'claude'" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <svg v-else-if="group.key === 'openspec'" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="12" y1="18" x2="12" y2="12" />
            <line x1="9" y1="15" x2="15" y2="15" />
          </svg>
          <svg v-else-if="group.key === 'npm'" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
            <line x1="7" y1="7" x2="7.01" y2="7" />
          </svg>
          <svg v-else-if="group.key === 'git'" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
            <path d="M9 18c-4.51 2-5-2-7-2" />
          </svg>
          <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </span>
        <h3 class="section-title">{{ group.title }}</h3>
        <span class="section-count">{{ group.commands.length }}</span>
      </div>

      <div class="command-grid">
        <div
          v-for="cmd in group.commands"
          :key="cmd.id"
          class="command-card"
        >
          <div class="card-header">
            <span class="command-name">{{ cmd.name }}</span>
            <span v-if="cmd.type === 'custom'" class="tag tag-blue">自定义</span>
            <span v-else-if="cmd.modified" class="tag tag-orange">已修改</span>
            <span v-else class="tag tag-gray">内置</span>
            <div class="card-actions">
              <span class="card-tools">
                <button class="tool" title="编辑" @click="openEditDialog(cmd)">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                </button>
                <button v-if="cmd.modified" class="tool tool-reset" title="恢复默认" @click="resetCommand(cmd)">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
                  </svg>
                </button>
                <button class="tool tool-del" title="删除" @click="deleteCommand(cmd)">
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
            <div class="command-line">
              <span class="command-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="4 17 10 11 4 5" />
                  <line x1="12" y1="19" x2="20" y2="19" />
                </svg>
              </span>
              <code class="command-text">{{ cmd.command }}</code>
            </div>
            <div v-if="cmd.description" class="command-desc">
              <span class="desc-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
              </span>
              <span class="desc-text">{{ cmd.description }}</span>
            </div>
            <div v-if="cmd.needsProjectDir" class="command-badge">
              <span class="badge-icon">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
                </svg>
              </span>
              <span class="badge-text">需要项目目录</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 添加/编辑对话框 -->
    <div v-if="showAddDialog" class="dialog-overlay" @click="closeDialog">
      <div class="dialog card" @click.stop>
        <h3>{{ editingCommand ? '编辑命令' : '新增命令' }}</h3>

        <div class="form-field">
          <label>名称：</label>
          <input v-model="formData.name" placeholder="例如：启动开发服务器" />
        </div>

        <div class="form-field">
          <label>命令：</label>
          <input v-model="formData.command" placeholder="例如：npm run dev" />
        </div>

        <div class="form-field">
          <label>描述（可选）：</label>
          <input v-model="formData.description" placeholder="简短描述这个命令的作用" />
        </div>

        <div class="form-field checkbox-field">
          <label>
            <input type="checkbox" v-model="formData.needsProjectDir" />
            <span>需要在项目目录中执行</span>
          </label>
        </div>

        <div class="dialog-actions">
          <button class="btn btn-primary" @click="saveCommand">保存</button>
          <button class="btn" @click="closeDialog">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.command-manage {
  padding: var(--spacing-md) var(--spacing-sm);
  max-width: 100%;
  overflow-x: hidden;
  box-sizing: border-box;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--spacing-lg);
  gap: var(--spacing-sm);
}

.header-text {
  flex: 1 1 auto;
  min-width: 0;
}

.page-title {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--text-primary);
}

.page-desc {
  margin: 4px 0 0;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.command-section {
  margin-bottom: var(--spacing-lg);
}

.section-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-md);
  padding-bottom: 6px;
  border-bottom: 2px solid var(--border-color);
}

.section-icon {
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: var(--primary-color);
  color: #ffffff;
}

.section-title {
  flex: 1 1 auto;
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.section-count {
  flex: 0 0 auto;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-tertiary);
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--bg-hover);
}

.command-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--spacing-sm);
}

.command-card {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--card-radius);
  padding: 10px 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, .08), 0 1px 2px rgba(0, 0, 0, .04);
  transition: border-color .18s ease, box-shadow .18s ease, transform .18s ease;
}

.command-card:hover {
  border-color: var(--primary-color);
  box-shadow: 0 8px 22px rgba(0, 0, 0, .13), 0 3px 6px rgba(0, 0, 0, .07);
  transform: translateY(-2px);
}

@media (prefers-color-scheme: dark) {
  .command-card:hover {
    box-shadow: 0 10px 26px rgba(0, 0, 0, .55);
  }
}

.card-header {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: nowrap;
  min-height: 28px;
  margin-bottom: 8px;
}

.command-name {
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

.tag-orange {
  background: rgba(239, 108, 0, 0.14);
  color: #ef6c00;
}

@media (prefers-color-scheme: dark) {
  .tag-blue {
    background: rgba(66, 165, 245, 0.18);
    color: #42a5f5;
  }
  .tag-orange {
    background: rgba(255, 167, 38, 0.18);
    color: #ffa726;
  }
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

.command-card:hover .card-tools {
  max-width: 80px;
  margin-left: 0;
  opacity: 1;
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

.tool-reset:hover {
  background: #43a047;
  border-color: #43a047;
  color: #fff;
}

.tool-del:hover {
  background: #e53935;
  border-color: #e53935;
  color: #fff;
}

.card-body {
  padding-top: 8px;
  border-top: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.command-line {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 7px;
  background: var(--bg-hover);
  border-radius: 6px;
  transition: background .15s ease;
}

.command-card:hover .command-line {
  background: rgba(25, 118, 210, 0.08);
}

@media (prefers-color-scheme: dark) {
  .command-card:hover .command-line {
    background: rgba(66, 165, 245, 0.12);
  }
}

.command-icon {
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: rgba(25, 118, 210, 0.1);
  color: var(--primary-color);
}

@media (prefers-color-scheme: dark) {
  .command-icon {
    background: rgba(66, 165, 245, 0.15);
  }
}

.command-text {
  flex: 1 1 auto;
  min-width: 0;
  color: var(--text-secondary);
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.02em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.command-desc {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 12px;
  color: var(--text-tertiary);
  line-height: 1.5;
}

.desc-icon {
  flex: 0 0 auto;
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-top: 2px;
}

.desc-text {
  flex: 1 1 auto;
  min-width: 0;
}

.command-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 7px;
  border-radius: 5px;
  background: rgba(25, 118, 210, 0.1);
  color: var(--primary-color);
  font-size: 11px;
  font-weight: 500;
  align-self: flex-start;
}

@media (prefers-color-scheme: dark) {
  .command-badge {
    background: rgba(66, 165, 245, 0.15);
  }
}

.badge-icon {
  flex: 0 0 auto;
  width: 14px;
  height: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.badge-text {
  flex: 0 0 auto;
}

.btn {
  padding: 8px 16px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--card-bg);
  color: var(--text-primary);
  cursor: pointer;
  font-size: var(--font-size-sm);
  font-weight: 500;
  transition: all 0.2s ease;
}

.btn:hover {
  background: var(--bg-hover);
}

.btn-primary {
  background: var(--primary-color);
  color: #fff;
  border-color: var(--primary-color);
}

.btn-primary:hover {
  background: var(--primary-hover);
  border-color: var(--primary-hover);
}

.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog {
  width: 90%;
  max-width: 460px;
}

.dialog h3 {
  margin: 0 0 var(--spacing-lg);
  color: var(--text-primary);
}

.form-field {
  margin-bottom: var(--spacing-lg);
}

.form-field label {
  display: block;
  margin-bottom: var(--spacing-xs);
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--text-primary);
}

.form-field input:not([type="checkbox"]) {
  width: 100%;
  padding: 8px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: var(--font-size-base);
  box-sizing: border-box;
  background: var(--card-bg);
  color: var(--text-primary);
}

.form-field input:focus {
  border-color: var(--primary-color);
  outline: none;
}

.checkbox-field label {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-weight: normal;
  cursor: pointer;
}

.checkbox-field input[type="checkbox"] {
  width: auto;
  cursor: pointer;
}

.dialog-actions {
  display: flex;
  gap: var(--spacing-sm);
  justify-content: flex-end;
  margin-top: var(--spacing-lg);
}
</style>
