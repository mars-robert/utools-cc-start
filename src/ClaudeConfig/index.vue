<script lang="ts" setup>
import { onMounted, reactive, ref, computed } from 'vue'
import { applyClaudeConfigDraft, validateClaudeConfigDraft } from './schema.js'
import ConfigField from './ConfigField.vue'

type State = 'loading' | 'ready' | 'notExists' | 'parseError'
type Tab = 'mcpServers' | 'projects'

const state = ref<State>('loading')
const configPath = ref('')
const sourceData = ref<any>(null)
const parseErrorText = ref('')
const activeTab = ref<Tab>('mcpServers')

const draft = reactive<{ data: any }>({ data: {} })
const selected = reactive<Record<Tab, string | null>>({ mcpServers: null, projects: null })
const adding = reactive<Record<Tab, boolean>>({ mcpServers: false, projects: false })
const newKey = reactive<Record<Tab, string>>({ mcpServers: '', projects: '' })

const saving = ref(false)
const saveMessage = ref('')
const saveError = ref('')
const launching = ref(false)

function deepClone (v: any) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)) }

const serverKeys = computed(() => Object.keys(draft.data?.mcpServers || {}))
const projectKeys = computed(() => Object.keys(draft.data?.projects || {}))
const keysOf = (tab: Tab) => (tab === 'mcpServers' ? serverKeys.value : projectKeys.value)

function setAtPath (segments: string[], next: any) {
  if (!segments.length) return
  let node = draft.data
  for (let i = 0; i < segments.length - 1; i++) {
    const k = segments[i]
    if (node[k] === undefined || node[k] === null) node[k] = {}
    node = node[k]
  }
  node[segments[segments.length - 1]] = next
}

// 单条目下需渲染的可编辑子字段（projects 过滤掉只读统计，只留 allowedTools / mcpServers）
function entryFields (tab: Tab, key: string): string[] {
  const entry = draft.data?.[tab]?.[key]
  if (!entry || typeof entry !== 'object') return []
  if (tab === 'projects') {
    return Object.keys(entry).filter((k) => k === 'allowedTools' || k === 'mcpServers')
  }
  return Object.keys(entry)
}

function selectEntry (tab: Tab, key: string) {
  selected[tab] = selected[tab] === key ? null : key
}

function startAdd (tab: Tab) {
  adding[tab] = true
  newKey[tab] = ''
}

function confirmAdd (tab: Tab) {
  const name = newKey[tab].trim()
  if (!name) return
  if (!draft.data[tab]) draft.data[tab] = {}
  if (Object.prototype.hasOwnProperty.call(draft.data[tab], name)) {
    saveError.value = `已存在同名条目：${name}`
    return
  }
  draft.data[tab][name] = tab === 'mcpServers'
    ? { type: 'stdio', command: '', args: [], env: {} }
    : { allowedTools: [] }
  adding[tab] = false
  selected[tab] = name
  saveError.value = ''
}

function cancelAdd (tab: Tab) { adding[tab] = false; newKey[tab] = '' }

function removeEntry (tab: Tab, key: string) {
  if (draft.data?.[tab]) delete draft.data[tab][key]
  if (selected[tab] === key) selected[tab] = null
}

function load () {
  saveMessage.value = ''
  saveError.value = ''
  state.value = 'loading'
  const res = window.services.readClaudeConfigFile()
  configPath.value = window.services.getClaudeConfigPath()
  if (!res.exists) { state.value = 'notExists'; return }
  if (res.parseError) {
    parseErrorText.value = res.parseError.message || String(res.parseError)
    state.value = 'parseError'; return
  }
  sourceData.value = res.data
  draft.data = deepClone(res.data)
  if (!draft.data.mcpServers) draft.data.mcpServers = {}
  if (!draft.data.projects) draft.data.projects = {}
  selected.mcpServers = null
  selected.projects = null
  state.value = 'ready'
}

function resetForm () {
  draft.data = deepClone(sourceData.value)
  if (!draft.data.mcpServers) draft.data.mcpServers = {}
  if (!draft.data.projects) draft.data.projects = {}
  selected.mcpServers = null
  selected.projects = null
  saveMessage.value = ''
  saveError.value = ''
}


function handleFirstLaunch () {
  launching.value = true
  saveError.value = ''
  saveMessage.value = ''
  
  const settings = window.services.getLauncherSettings()
  const lastUsedDir = window.services.getLastUsedProjectDir()
  const homedir = require('os').homedir()
  const cwd = lastUsedDir || homedir
  
  const result = window.services.launchProject(
    cwd,
    settings.launchCommand || 'claude',
    {
      powershellPath: settings.powershellPath,
      terminalType: settings.terminalType
    }
  )
  
  launching.value = false
  
  if (result.success) {
    saveMessage.value = 'Claude 已启动，配置文件将自动生成。请在终端中完成首次设置后刷新此页面。'
  } else {
    saveError.value = result.error || '启动失败'
  }
}
function save () {
  saving.value = true
  saveMessage.value = ''
  saveError.value = ''
  try {
    const validation = validateClaudeConfigDraft(draft.data)
    if (!validation.valid) {
      saveError.value = validation.errors.map((e: any) => e.message).join('；')
      saving.value = false; return
    }
    const nextData = applyClaudeConfigDraft(sourceData.value, draft.data)
    const result = window.services.saveClaudeConfigFile(nextData)
    if (!result || !result.success) {
      saveError.value = (result && result.error) || '写入失败'
      saving.value = false; return
    }
    load()
    saveMessage.value = '已保存（原文件已备份）'
  } catch (err: any) {
    saveError.value = err && err.message ? err.message : String(err)
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="claude-config">
    <div v-if="state === 'loading'" class="hint">读取中…</div>

    <div v-else-if="state === 'notExists'" class="hint">
      <div>未找到配置文件：<code>{{ configPath }}</code></div>
      <div class="hint-sub">配置文件将在首次运行 Claude Code CLI 时自动生成。</div>
      <button 
        class="btn btn-primary" 
        :disabled="launching"
        @click="handleFirstLaunch"
        style="margin-top: 12px;"
      >
        {{ launching ? '启动中…' : '首次启动 Claude' }}
      </button>
      <div v-if="saveMessage" class="save-ok" style="margin-top: 8px;">{{ saveMessage }}</div>
      <div v-if="saveError" class="save-err" style="margin-top: 8px;">{{ saveError }}</div>
    </div>

    <div v-else-if="state === 'parseError'" class="hint hint-error">
      配置文件无法解析（JSON 格式错误），为安全起见不提供编辑。
      <div class="hint-sub">{{ parseErrorText }}</div>
      <div class="hint-sub">文件路径：<code>{{ configPath }}</code></div>
    </div>

    <template v-else>
      <div class="tabs">
        <button class="tab" :class="{ active: activeTab === 'mcpServers' }" @click="activeTab = 'mcpServers'">
          MCP 服务（{{ serverKeys.length }}）
        </button>
        <button class="tab" :class="{ active: activeTab === 'projects' }" @click="activeTab = 'projects'">
          项目（{{ projectKeys.length }}）
        </button>
      </div>

      <div class="toolbar">
        <code class="path-value">{{ configPath }}</code>
        <button class="btn cfg-mini" @click="startAdd(activeTab)">
          + 新增{{ activeTab === 'mcpServers' ? ' MCP 服务' : '项目' }}
        </button>
      </div>

      <div v-if="adding[activeTab]" class="add-row">
        <input
          class="cfg-input"
          :placeholder="activeTab === 'mcpServers' ? '服务名称，如 playwright' : '项目路径，如 D:/code/app'"
          v-model="newKey[activeTab]"
          @keyup.enter="confirmAdd(activeTab)"
        />
        <button class="btn btn-primary cfg-mini" @click="confirmAdd(activeTab)">确定</button>
        <button class="btn cfg-mini" @click="cancelAdd(activeTab)">取消</button>
      </div>

      <div v-if="!keysOf(activeTab).length" class="hint-sub empty">
        暂无{{ activeTab === 'mcpServers' ? ' MCP 服务' : '项目' }}，点击上方按钮新增。
      </div>

      <div v-for="key in keysOf(activeTab)" :key="key" class="card entry">
        <div class="entry-head">
          <span class="entry-name" @click="selectEntry(activeTab, key)">
            <span class="entry-caret">{{ selected[activeTab] === key ? '▾' : '▸' }}</span>
            {{ key }}
          </span>
          <button class="btn btn-danger cfg-mini" @click="removeEntry(activeTab, key)">删除</button>
        </div>
        <div v-show="selected[activeTab] === key" class="entry-body">
          <ConfigField
            v-for="f in entryFields(activeTab, key)"
            :key="f"
            :path="`${activeTab}.${key}.${f}`"
            :segments="[activeTab, key, f]"
            :key-name="f"
            :value="draft.data[activeTab][key][f]"
            :on-change="setAtPath"
          />
        </div>
      </div>

      <div class="actions">
        <button class="btn" :disabled="saving" @click="resetForm">重置</button>
        <button class="btn btn-primary" :disabled="saving" @click="save">
          {{ saving ? '保存中…' : '保存' }}
        </button>
        <span v-if="saveMessage" class="save-ok">{{ saveMessage }}</span>
        <span v-if="saveError" class="save-err">{{ saveError }}</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.claude-config { display: flex; flex-direction: column; gap: var(--spacing-md); padding: var(--spacing-lg) 0; }
.hint { padding: var(--spacing-xl); color: var(--text-secondary); font-size: var(--font-size-base); }
.hint-error { color: #e53935; }
.hint-sub { margin-top: var(--spacing-sm); color: var(--text-tertiary); font-size: var(--font-size-sm); }
.empty { padding: var(--spacing-lg); text-align: center; }

.tabs { display: flex; gap: var(--spacing-sm); border-bottom: 1px solid var(--border-color); }
.tab {
  padding: 8px 16px; border: none; background: transparent; cursor: pointer;
  color: var(--text-secondary); font-size: var(--font-size-base);
  border-bottom: 2px solid transparent; margin-bottom: -1px;
}
.tab:hover { color: var(--text-primary); }
.tab.active { color: var(--primary-color); border-bottom-color: var(--primary-color); font-weight: 500; }

.toolbar { display: flex; align-items: center; justify-content: space-between; gap: var(--spacing-md); }
.path-value { color: var(--text-tertiary); font-size: var(--font-size-sm); word-break: break-all; }
.cfg-mini { padding: 2px 12px; width: fit-content; }

.add-row { display: flex; align-items: center; gap: var(--spacing-sm); }
.cfg-input {
  flex: 1; max-width: 420px; padding: 6px 10px;
  border: 1px solid var(--border-color); border-radius: 6px;
  background: var(--card-bg); color: var(--text-primary); font-size: var(--font-size-base);
}

.entry { display: flex; flex-direction: column; gap: var(--spacing-sm); }
.entry-head { display: flex; align-items: center; justify-content: space-between; gap: var(--spacing-md); }
.entry-name {
  display: inline-flex; align-items: center; gap: var(--spacing-sm); cursor: pointer;
  font-family: monospace; font-size: var(--font-size-base); color: var(--text-primary);
  font-weight: 600; word-break: break-all;
}
.entry-caret { color: var(--text-tertiary); }
.entry-body { padding-top: var(--spacing-sm); border-top: 1px solid var(--border-color); }

.actions { display: flex; align-items: center; gap: var(--spacing-md); margin-top: var(--spacing-sm); }
.save-ok { color: #43a047; font-size: var(--font-size-sm); }
.save-err { color: #e53935; font-size: var(--font-size-sm); }
</style>
