<script lang="ts" setup>
import { ref, onMounted } from 'vue'

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
    <ul class="command-list">
      <li v-for="cmd in commands" :key="cmd.id">
        <div class="command-info">
          <div class="command-name">
            {{ cmd.name }}
            <span v-if="cmd.type === 'custom'" class="badge">自定义</span>
            <span v-else-if="cmd.modified" class="badge modified">已修改</span>
            <span v-else class="badge builtin">内置</span>
          </div>
          <div class="command-text">{{ cmd.command }}</div>
          <div v-if="cmd.description" class="command-desc">{{ cmd.description }}</div>
        </div>
        <div class="command-actions">
          <button @click="openEditDialog(cmd)">编辑</button>
          <button v-if="cmd.modified" @click="resetCommand(cmd)">恢复默认</button>
          <button @click="deleteCommand(cmd)" class="danger">删除</button>
        </div>
      </li>
    </ul>

    <button class="add-btn" @click="openAddDialog">+ 添加命令</button>

    <!-- 添加/编辑对话框 -->
    <div v-if="showAddDialog" class="dialog-overlay" @click="closeDialog">
      <div class="dialog" @click.stop>
        <h3>{{ editingCommand ? '编辑命令' : '添加命令' }}</h3>

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

        <div class="form-field checkbox">
          <label>
            <input type="checkbox" v-model="formData.needsProjectDir" />
            需要在项目目录中执行
          </label>
        </div>

        <div class="dialog-actions">
          <button @click="saveCommand" class="primary">保存</button>
          <button @click="closeDialog">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.command-manage {
  max-width: 800px;
  margin: 0 auto;
}

.badge {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
  background: #e8f0ff;
  color: var(--primary-color);
  margin-left: 6px;
  font-weight: 400;
}

.badge.builtin { background: var(--bg-hover); color: var(--text-tertiary); }
.badge.modified { background: #fff3e0; color: #ef6c00; }

h2 {
  font-size: var(--font-size-lg);
  margin-bottom: var(--spacing-xl);
  color: var(--text-primary);
}

.empty {
  text-align: center;
  padding: 40px 20px;
  color: var(--text-tertiary);
}

.command-list {
  list-style: none;
  padding: 0;
  margin: 0 0 var(--spacing-xl) 0;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.command-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-lg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--card-bg);
  transition: all 0.2s ease;
}

.command-list li:hover {
  box-shadow: var(--card-shadow);
  border-color: var(--primary-color);
}

.command-info {
  flex: 1;
  min-width: 0;
}

.command-name {
  font-weight: 600;
  margin-bottom: var(--spacing-xs);
  color: var(--text-primary);
}

.command-text {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  margin-bottom: var(--spacing-xs);
}

.command-desc {
  font-size: 11px;
  color: var(--text-tertiary);
}

.command-actions {
  display: flex;
  gap: var(--spacing-sm);
  flex: 0 0 auto;
}

button {
  padding: 3px 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--card-bg);
  color: var(--text-primary);
  cursor: pointer;
  font-size: 11px;
  transition: all 0.2s ease;
}

button:hover {
  background: var(--bg-hover);
}

button.danger {
  color: #e53935;
  border-color: #e53935;
}

button.danger:hover {
  background: #ffebee;
}

.add-btn {
  width: 100%;
  padding: 8px;
  font-size: 13px;
  background: var(--primary-color);
  color: #fff;
  border: none;
  border-radius: 6px;
}

.add-btn:hover {
  background: var(--primary-hover);
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
  background: var(--card-bg);
  border-radius: var(--card-radius);
  padding: var(--spacing-xl);
  width: 90%;
  max-width: 500px;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: var(--card-hover-shadow);
  color: var(--text-primary);
}

.dialog h3 {
  margin-top: 0;
  margin-bottom: var(--spacing-lg);
}

.form-field {
  margin-bottom: var(--spacing-lg);
}

.form-field label {
  display: block;
  margin-bottom: var(--spacing-xs);
  font-size: var(--font-size-sm);
  font-weight: 600;
}

.form-field input[type="text"],
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

.form-field input:focus { border-color: var(--primary-color); outline: none; }

.form-field.checkbox label {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-weight: normal;
}

.form-field.checkbox input[type="checkbox"] {
  width: auto;
}

.dialog-actions {
  display: flex;
  gap: var(--spacing-sm);
  justify-content: flex-end;
  margin-top: var(--spacing-xl);
}

.dialog-actions button.primary {
  background: var(--primary-color);
  color: #fff;
  border-color: var(--primary-color);
}

.dialog-actions button.primary:hover {
  background: var(--primary-hover);
}
</style>
