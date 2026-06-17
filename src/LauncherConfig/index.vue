<script lang="ts" setup>
import { onMounted, ref } from 'vue'

defineProps({
  enterAction: {
    type: Object,
    required: true
  }
})

const launchCommand = ref('')
const powershellPath = ref('')
const saved = ref(false)
const psWarning = ref('')

const isWindows = window.utools.isWindows ? window.utools.isWindows() : false

const validatePsPath = () => {
  if (!isWindows) {
    psWarning.value = ''
    return
  }
  const p = powershellPath.value.trim()
  if (!p) {
    psWarning.value = ''
    return
  }
  // 仅当看起来是绝对路径时才校验文件是否存在（允许 powershell.exe 这类 PATH 命令）
  const looksLikePath = /[\\/]/.test(p)
  if (looksLikePath && !window.services.pathExists(p)) {
    psWarning.value = '该 PowerShell 路径不存在'
  } else {
    psWarning.value = ''
  }
}

const load = () => {
  const settings = window.services.getLauncherSettings()
  launchCommand.value = settings.launchCommand || ''
  powershellPath.value = settings.powershellPath || ''
  validatePsPath()
}

const save = () => {
  validatePsPath()
  window.services.saveLauncherSettings({
    launchCommand: launchCommand.value.trim() || 'claude',
    powershellPath: powershellPath.value.trim()
  })
  saved.value = true
  setTimeout(() => { saved.value = false }, 2000)
}

onMounted(load)
</script>

<template>
  <div class="conf">
    <h2 class="conf-title">Claude Code 启动器配置</h2>

    <div class="conf-field">
      <label class="conf-label">自定义启动命令</label>
      <input
        v-model="launchCommand"
        class="conf-input"
        type="text"
        placeholder="claude"
      />
      <div class="conf-hint">在项目终端中运行的命令，默认 claude。需能在终端 shell 中被解析到。</div>
    </div>

    <div v-if="isWindows" class="conf-field">
      <label class="conf-label">终端路径（PowerShell / Windows Terminal）</label>
      <input
        v-model="powershellPath"
        class="conf-input"
        type="text"
        placeholder="C:\\Program Files\\PowerShell\\7\\pwsh.exe"
        @input="validatePsPath"
      />
      <div class="conf-hint">
        支持 PowerShell 或 Windows Terminal。<br>
        示例：<br>
        • PowerShell: <code>C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe</code><br>
        • Windows Terminal: <code>C:\terminal-1.24.10921.0\WindowsTerminal.exe</code> 或 <code>wt.exe</code>
      </div>
      <div v-if="psWarning" class="conf-warning">{{ psWarning }}</div>
    </div>

    <button class="conf-save" @click="save">保存</button>
    <span v-if="saved" class="conf-saved">已保存 ✓</span>
  </div>
</template>

<style>
.conf {
  padding: 16px 20px;
  box-sizing: border-box;
}

.conf-title {
  font-size: 16px;
  margin: 0 0 16px;
}

.conf-field {
  margin-bottom: 16px;
}

.conf-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 6px;
}

.conf-input {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  font-size: 14px;
  border: 1px solid #ccc;
  border-radius: 6px;
  outline: none;
}

.conf-input:focus {
  border-color: #4f8cff;
}

.conf-hint {
  font-size: 12px;
  color: #888;
  margin-top: 4px;
  line-height: 1.5;
}

.conf-hint code {
  background-color: #f0f0f0;
  padding: 2px 4px;
  border-radius: 3px;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 11px;
}

.conf-warning {
  font-size: 12px;
  color: #e53935;
  margin-top: 4px;
}

.conf-save {
  padding: 8px 20px;
  font-size: 14px;
  border: none;
  border-radius: 6px;
  background-color: #4f8cff;
  color: #fff;
  cursor: pointer;
}

.conf-save:hover {
  background-color: #3b78f0;
}

.conf-saved {
  margin-left: 10px;
  color: #43a047;
  font-size: 13px;
}

@media (prefers-color-scheme: dark) {
  .conf-input {
    background-color: #2a2a2a;
    color: #eee;
    border-color: #555;
  }

  .conf-hint code {
    background-color: #3a3a3a;
    color: #eee;
  }
}
</style>
