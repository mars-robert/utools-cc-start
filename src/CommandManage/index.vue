<script lang="ts" setup>
import { ref, onMounted } from 'vue'

defineProps({
  enterAction: {
    type: Object,
    required: true
  }
})

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
  commands.value = window.services.getCustomCommands()
}

const openAddDialog = () => {
  editingCommand.value = null
  formData.value = {
    name: '',
    command: '',
    description: '',
    needsProjectDir: false
  }
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
    // 更新
    window.services.updateCustomCommand(editingCommand.value.id, formData.value)
  } else {
    // 添加
    window.services.addCustomCommand(formData.value)
  }

  showAddDialog.value = false
  loadCommands()
}

const deleteCommand = (cmd: any) => {
  // 使用简单的确认方式
  const confirmed = window.confirm(`确定删除命令 "${cmd.name}" 吗？`)
  if (confirmed) {
    window.services.deleteCustomCommand(cmd.id)
    loadCommands()
  }
}

const closeDialog = () => {
  showAddDialog.value = false
}

onMounted(() => {
  loadCommands()
})
</script>

<template>
  <div class="command-manage">
    <h2>管理自定义命令</h2>

    <div v-if="commands.length === 0" class="empty">
      还没有自定义命令，点击下方按钮添加
    </div>

    <ul v-else class="command-list">
      <li v-for="cmd in commands" :key="cmd.id">
        <div class="command-info">
          <div class="command-name">
            {{ cmd.needsProjectDir ? '📂' : '⚡' }} {{ cmd.name }}
          </div>
          <div class="command-text">{{ cmd.command }}</div>
          <div v-if="cmd.description" class="command-desc">{{ cmd.description }}</div>
        </div>
        <div class="command-actions">
          <button @click="openEditDialog(cmd)">编辑</button>
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
  padding: 20px;
  max-width: 800px;
  margin: 0 auto;
}

h2 {
  font-size: 18px;
  margin-bottom: 20px;
}

.empty {
  text-align: center;
  padding: 40px 20px;
  color: #999;
}

.command-list {
  list-style: none;
  padding: 0;
  margin: 0 0 20px 0;
}

.command-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  margin-bottom: 8px;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
}

.command-info {
  flex: 1;
}

.command-name {
  font-weight: 600;
  margin-bottom: 4px;
}

.command-text {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
  color: #666;
  margin-bottom: 4px;
}

.command-desc {
  font-size: 11px;
  color: #999;
}

.command-actions {
  display: flex;
  gap: 8px;
}

button {
  padding: 6px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  font-size: 12px;
}

button:hover {
  background: #f5f5f5;
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
  padding: 12px;
  font-size: 14px;
  background: #4f8cff;
  color: #fff;
  border: none;
}

.add-btn:hover {
  background: #3b78f0;
}

.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog {
  background: #fff;
  border-radius: 8px;
  padding: 20px;
  width: 90%;
  max-width: 500px;
  max-height: 80vh;
  overflow-y: auto;
}

.dialog h3 {
  margin-top: 0;
  margin-bottom: 16px;
}

.form-field {
  margin-bottom: 16px;
}

.form-field label {
  display: block;
  margin-bottom: 4px;
  font-size: 13px;
  font-weight: 600;
}

.form-field input[type="text"],
.form-field input:not([type="checkbox"]) {
  width: 100%;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  box-sizing: border-box;
}

.form-field.checkbox label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: normal;
}

.form-field.checkbox input[type="checkbox"] {
  width: auto;
}

.dialog-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 20px;
}

.dialog-actions button.primary {
  background: #4f8cff;
  color: #fff;
  border-color: #4f8cff;
}

.dialog-actions button.primary:hover {
  background: #3b78f0;
}

@media (prefers-color-scheme: dark) {
  .command-manage {
    color: #e0e0e0;
  }

  .command-list li {
    border-color: #3a3a3a;
  }

  .command-text {
    color: #aaa;
  }

  .command-desc {
    color: #888;
  }

  button {
    background: #2a2a2a;
    border-color: #3a3a3a;
    color: #e0e0e0;
  }

  button:hover {
    background: #3a3a3a;
  }

  .dialog {
    background: #1e1e1e;
    color: #e0e0e0;
  }

  .form-field input {
    background: #2a2a2a;
    border-color: #3a3a3a;
    color: #e0e0e0;
  }
}
</style>
