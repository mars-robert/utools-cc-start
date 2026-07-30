## Context

统一配置中心 `src/UnifiedConfig/index.vue` 是 cconf 命令的入口，采用侧边栏 + 内容区结构，目前有 3 个 tab（启动配置 / 快捷命令 / 主题配置，`.claude.json 配置` 被注释）。

Claude Code 启动时从 `~/.claude/settings.json` 读取 `env` 字段作为环境变量注入。用户要用不同 API 后端（官方 / 中转 / 代理）时只能手动编辑该文件。

现有相关设施（已核实）：
- `public/preload/claude-config.js`：读写 `~/.claude.json`（备份 `.bak` + 原子写 tmp→rename），已稳定运行。
- `public/preload/services.js:1545`：`getClaudeSettingsPath()` 返回 `~/.claude/settings.json` 路径，但只有只读 `readJsonSafe`，无写入。
- `src/LauncherConfig/index.vue`：启动命令 + 终端的单选+增删改范式，数据存 `utools.dbStorage`。
- uTools 的 `dbStorage` / `dbCryptoStorage` 都会在用户开启同步时备份到云端——不符合"仅本地"需求。

关键事实：
- `settings.json` 的 `env` 是 **Claude Code 官方读取环境变量的唯一入口**（不是 `.claude.json`）。
- 激活中的 token 必然**明文落盘**在 `settings.json`（Claude Code 机制，无法改变）。
- 配置清单若存 uTools DB，会随账户同步上云——违背"仅本地"诉求。
- 官方文档建议不想同步的数据"存储在本地文件中"。

## Goals / Non-Goals

**Goals:**
- 可视化管理多个 API 环境配置（官方 / 中转 / 代理），卡片展示、增删改。
- 一键应用环境 → 写入 `settings.json` 的 `env`，带确认弹窗明示操作。
- 配置存本地文件，不经 uTools 同步。
- token UI 默认打码，点击才显示。
- 受管键清理：切换时清掉旧环境的键，不留残值、不误删用户手动加的其它 env。

**Non-Goals:**
- 不做配置加密（激活中的 token 必然明文，清单文件也本地不同步，加密无实际意义）。
- 不在启动项目时临时选环境（全局单一激活）。
- 不做导入/导出、健康检查。

## Decisions

### 1. 存储：本地明文文件，不经 uTools 同步

配置清单存 `~/.claude/cconf-envs.json`（明文 JSON），复刻 `claude-config.js` 的备份+原子写模式。不用 `dbStorage`/`dbCryptoStorage`（会同步上云）。

文件格式：
```json
{
  "version": 1,
  "activeId": "builtin-official",
  "managedKeys": ["ANTHROPIC_BASE_URL", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_MODEL"],
  "configs": [
    {
      "id": "builtin-official",
      "name": "官方 Anthropic",
      "baseUrl": "https://api.anthropic.com",
      "token": "",
      "model": "",
      "builtin": true
    },
    {
      "id": "custom-1234567890",
      "name": "中转-XX",
      "baseUrl": "https://relay.example.com",
      "token": "sk-xxxx",
      "model": "claude-opus-4",
      "extra": { "CUSTOM_KEY": "value" }
    }
  ]
}
```

- `version`：schema 版本（当前 1），用于未来迁移。
- `activeId`：当前激活环境的 id，`null` 表示无激活（不改 `settings.json`）。
- `managedKeys`：本插件写过的 env 键集合（见决策 3）。
- `configs`：环境配置数组，`builtin: true` 的不可删除。
- `extra`：可选，自定义 KV 对（写入 env 时平铺）。

首次创建时内置一个「官方 Anthropic」配置（`builtin-official`，baseUrl 预填，token 空）。

**备选**：存 `dbStorage`（否决：会同步上云）；主密码加密（否决：激活 token 必然明文，加密清单意义不大且引入解锁复杂度）。

### 2. 生效机制：写 `settings.json` 的 `env`，带受管键清理

点「应用此环境」→ 确认弹窗 → 执行以下步骤：

1. 读取 `~/.claude/settings.json` 完整内容。
2. 从 `env` 对象删除 `managedKeys` 中的所有旧键（清理上一次写入的）。
3. 将新激活环境的 `{ ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN, ANTHROPIC_MODEL?, ...extra }` 写入 `env`。
4. 更新 `managedKeys` 为本次写入的键集合。
5. 备份原 `settings.json` 为 `settings.json.<timestamp>.bak`。
6. 原子写：先写临时文件 `settings.json.<timestamp>.tmp`，再 `fs.renameSync` 覆盖。
7. 同步更新 `cconf-envs.json` 的 `activeId` 与 `managedKeys`（也备份+原子写）。

**受管键清理策略**：`managedKeys` 是"本插件曾写入的键"的历史记录。每次应用前先删这批键，再写新键——既不留残值，也不误删用户手动加的其它 env（如 `HTTP_PROXY`）。

确认弹窗内容示例：
```
即将写入 ~/.claude/settings.json

• 将设置 ANTHROPIC_BASE_URL = https://relay.example.com
• 将写入 ANTHROPIC_AUTH_TOKEN（明文）
• 将设置 ANTHROPIC_MODEL = claude-opus-4
• 原文件已自动备份为 settings.json.20260720103045123.bak
⚠ token 将以明文保存在该文件中

            [取消]        [确认写入]
```

**备选**：拼接到启动命令前缀（否决：命令行暴露 token，跨平台拼接易错）；写 spawn 的 env 参数（否决：需改 launchProject，且与"写官方配置"诉求不符）。

### 3. UI：卡片网格，选中与生效两态分离

卡片布局（3 列自适应，gap 16px），每张卡片：

```
┌─────────────────────────────────┐
│ 中转-XX              ● 生效中    │
│ ───────────────────────────────  │
│ 🌐 relay.example.com            │
│ 🔑 sk-••••••••  👁               │
│ 🤖 claude-opus-4                │
│                                  │
│ [自定义] [编辑] [删除]            │
│                                  │
│ ✓ 已生效          [应用此环境]   │  ← activeId 匹配时显示"已生效"
└─────────────────────────────────┘
```

- **生效中**：activeId 匹配时，卡片用 `--primary-color` 描边（`border: 2px solid var(--primary-color)`），右上角显示「● 生效中」徽标。
- **待应用**：点击卡片 body **不**触发应用，只是视觉选中高亮（`background: var(--bg-hover)`）；真正应用要点「应用此环境」按钮。
- **token 脱敏**：默认显示 `sk-••••••••`（保留前缀 + 8 个点），点 👁 切换为明文。
- **内置标识**：`builtin: true` 的显示「[内置]」灰色徽标，不可删除（编辑/删除按钮置灰或隐藏）。

顶部操作区：
```
API 环境配置                              [+ 新增环境]
当前生效：中转-XX                          ← activeId 对应的 name
```

编辑/新增弹窗表单：
- 名称（必填）
- BASE_URL（必填，placeholder: `https://api.anthropic.com`）
- AUTH_TOKEN（必填，type=password，placeholder: `sk-ant-...`）
- MODEL（可选，placeholder: `claude-opus-4`）
- 自定义 KV 列表（可选，动态行：key input + value input + 删除按钮，+ 新增行按钮）

### 4. 模块划分

**preload 层**：新建 `public/preload/env-config.js`（参照 `claude-config.js` 结构）

```javascript
// 路径
function getEnvConfigsPath() { return path.join(os.homedir(), '.claude', 'cconf-envs.json') }
function getClaudeSettingsPath() { return path.join(os.homedir(), '.claude', 'settings.json') }

// 读写配置清单文件（备份+原子写）
function readEnvConfigsFile() { ... }   // 返回 { exists, data, parseError }
function writeEnvConfigsFile(data) { ... }  // 备份 .bak + 原子写 tmp→rename

// 读写 settings.json（同样备份+原子写）
function readClaudeSettingsFile() { ... }
function writeClaudeSettingsFile(data) { ... }

// 应用环境：清理受管键 + 写新键 + 更新 managedKeys
function applyEnvConfig(id) {
  // 1. 读 cconf-envs.json，找到 id 对应的 config
  // 2. 读 settings.json
  // 3. 从 env 删除 managedKeys 里的旧键
  // 4. 写入 { ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN, ANTHROPIC_MODEL?, ...extra }
  // 5. 更新 managedKeys = 本次写入的键集合
  // 6. 备份+原子写 settings.json
  // 7. 更新 cconf-envs.json 的 activeId 与 managedKeys，备份+原子写
  // 返回 { success, activeId, error? }
}

module.exports = {
  getEnvConfigsPath,
  readEnvConfigsFile,
  writeEnvConfigsFile,
  applyEnvConfig,
  // 增删改封装
  addEnvConfig(item) { ... },
  updateEnvConfig(id, patch) { ... },
  deleteEnvConfig(id) { ... },
}
```

在 `services.js` 引入并挂载到 `window.services`：
```javascript
const envConfig = require('./env-config')
// ...
module.exports = {
  // ...
  getEnvConfigs: () => envConfig.readEnvConfigsFile().data || defaultEnvConfigs(),
  applyEnvConfig: envConfig.applyEnvConfig,
  addEnvConfig: envConfig.addEnvConfig,
  updateEnvConfig: envConfig.updateEnvConfig,
  deleteEnvConfig: envConfig.deleteEnvConfig,
}
```

**渲染层**：新建 `src/EnvConfig/index.vue`

```vue
<script setup>
import { ref, onMounted } from 'vue'

const configs = ref([])
const activeId = ref(null)
const showEditDialog = ref(false)
const showApplyConfirm = ref(false)
const editingConfig = ref(null)
const applyingConfig = ref(null)
const tokenVisible = ref({})  // { [id]: boolean }

const load = () => {
  const data = window.services.getEnvConfigs()
  configs.value = data.configs
  activeId.value = data.activeId
}

const openEdit = (config) => {
  editingConfig.value = config ? { ...config } : { name: '', baseUrl: '', token: '', model: '' }
  showEditDialog.value = true
}

const saveEdit = () => {
  if (editingConfig.value.id) {
    window.services.updateEnvConfig(editingConfig.value.id, editingConfig.value)
  } else {
    window.services.addEnvConfig(editingConfig.value)
  }
  showEditDialog.value = false
  load()
}

const deleteConfig = (id) => {
  if (confirm('确定删除此环境配置？')) {
    window.services.deleteEnvConfig(id)
    load()
  }
}

const openApply = (config) => {
  applyingConfig.value = config
  showApplyConfirm.value = true
}

const confirmApply = () => {
  const result = window.services.applyEnvConfig(applyingConfig.value.id)
  showApplyConfirm.value = false
  if (result.success) {
    activeId.value = result.activeId
    window.utools.showNotification('环境已应用')
  } else {
    alert('应用失败：' + (result.error || '未知错误'))
  }
}

const toggleTokenVisible = (id) => {
  tokenVisible.value[id] = !tokenVisible.value[id]
}

onMounted(load)
</script>

<template>
  <div class="env-config">
    <div class="env-header">
      <div class="env-title">
        API 环境配置
        <span v-if="activeId" class="env-active-hint">
          当前生效：{{ configs.find(c => c.id === activeId)?.name }}
        </span>
      </div>
      <button class="btn btn-primary" @click="openEdit(null)">+ 新增环境</button>
    </div>

    <div class="env-grid">
      <div
        v-for="cfg in configs"
        :key="cfg.id"
        class="env-card"
        :class="{ active: cfg.id === activeId }"
      >
        <div class="env-card-header">
          <span class="env-card-name">{{ cfg.name }}</span>
          <span v-if="cfg.id === activeId" class="env-badge-active">● 生效中</span>
        </div>
        <div class="env-card-body">
          <div class="env-field">
            <span class="env-icon">🌐</span>
            <span class="env-value">{{ cfg.baseUrl }}</span>
          </div>
          <div class="env-field">
            <span class="env-icon">🔑</span>
            <span class="env-value">
              {{ tokenVisible[cfg.id] ? cfg.token : (cfg.token ? 'sk-••••••••' : '(未设置)') }}
            </span>
            <button v-if="cfg.token" class="btn-icon" @click="toggleTokenVisible(cfg.id)">👁</button>
          </div>
          <div v-if="cfg.model" class="env-field">
            <span class="env-icon">🤖</span>
            <span class="env-value">{{ cfg.model }}</span>
          </div>
        </div>
        <div class="env-card-actions">
          <span v-if="cfg.builtin" class="env-badge">内置</span>
          <template v-else>
            <button class="btn btn-sm" @click="openEdit(cfg)">编辑</button>
            <button class="btn btn-sm btn-danger" @click="deleteConfig(cfg.id)">删除</button>
          </template>
        </div>
        <div class="env-card-footer">
          <span v-if="cfg.id === activeId" class="env-applied">✓ 已生效</span>
          <button v-else class="btn btn-primary" @click="openApply(cfg)">应用此环境</button>
        </div>
      </div>
    </div>

    <!-- 编辑弹窗 -->
    <div v-if="showEditDialog" class="dialog-overlay" @click="showEditDialog = false">
      <div class="dialog card" @click.stop>
        <h3>{{ editingConfig.id ? '编辑环境' : '新增环境' }}</h3>
        <div class="form-field">
          <label>名称：</label>
          <input v-model="editingConfig.name" placeholder="例如：中转-XX" />
        </div>
        <div class="form-field">
          <label>BASE_URL：</label>
          <input v-model="editingConfig.baseUrl" placeholder="https://api.anthropic.com" />
        </div>
        <div class="form-field">
          <label>AUTH_TOKEN：</label>
          <input v-model="editingConfig.token" type="password" placeholder="sk-ant-..." />
        </div>
        <div class="form-field">
          <label>MODEL（可选）：</label>
          <input v-model="editingConfig.model" placeholder="claude-opus-4" />
        </div>
        <div class="dialog-actions">
          <button class="btn btn-primary" @click="saveEdit">保存</button>
          <button class="btn" @click="showEditDialog = false">取消</button>
        </div>
      </div>
    </div>

    <!-- 应用确认弹窗 -->
    <div v-if="showApplyConfirm" class="dialog-overlay" @click="showApplyConfirm = false">
      <div class="dialog card confirm-dialog" @click.stop>
        <h3>即将写入 ~/.claude/settings.json</h3>
        <div class="confirm-content">
          <div class="confirm-item">• 将设置 ANTHROPIC_BASE_URL = {{ applyingConfig.baseUrl }}</div>
          <div class="confirm-item">• 将写入 ANTHROPIC_AUTH_TOKEN（明文）</div>
          <div v-if="applyingConfig.model" class="confirm-item">
            • 将设置 ANTHROPIC_MODEL = {{ applyingConfig.model }}
          </div>
          <div class="confirm-item">• 原文件已自动备份为 settings.json.&lt;时间戳&gt;.bak</div>
          <div class="confirm-warn">⚠ token 将以明文保存在该文件中</div>
        </div>
        <div class="dialog-actions">
          <button class="btn" @click="showApplyConfirm = false">取消</button>
          <button class="btn btn-primary" @click="confirmApply">确认写入</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.env-config { padding: var(--spacing-xl); }
.env-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--spacing-xl); }
.env-title { font-size: var(--font-size-xl); font-weight: 600; }
.env-active-hint { margin-left: var(--spacing-md); font-size: var(--font-size-sm); color: var(--text-secondary); }

.env-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: var(--spacing-lg); }

.env-card {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: var(--spacing-lg);
  background: var(--card-bg);
  transition: all 0.2s ease;
}
.env-card:hover { background: var(--bg-hover); }
.env-card.active { border-color: var(--primary-color); border-width: 2px; }

.env-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--spacing-md); }
.env-card-name { font-size: var(--font-size-lg); font-weight: 600; }
.env-badge-active { font-size: var(--font-size-sm); color: var(--primary-color); }

.env-card-body { display: flex; flex-direction: column; gap: var(--spacing-sm); margin-bottom: var(--spacing-lg); }
.env-field { display: flex; align-items: center; gap: var(--spacing-sm); font-size: var(--font-size-sm); }
.env-icon { flex: 0 0 20px; }
.env-value { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.btn-icon { padding: 2px 6px; font-size: 14px; border: none; background: transparent; cursor: pointer; }

.env-card-actions { display: flex; gap: var(--spacing-xs); margin-bottom: var(--spacing-md); }
.env-badge { font-size: 11px; padding: 1px 6px; border-radius: 4px; background: var(--bg-hover); color: var(--text-tertiary); }

.env-card-footer { display: flex; justify-content: space-between; align-items: center; }
.env-applied { font-size: var(--font-size-sm); color: var(--success-color); font-weight: 500; }

.dialog-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.dialog { width: 90%; max-width: 460px; }
.dialog h3 { margin: 0 0 var(--spacing-lg); color: var(--text-primary); }
.form-field { margin-bottom: var(--spacing-lg); }
.form-field label { display: block; margin-bottom: var(--spacing-xs); font-size: var(--font-size-sm); font-weight: 600; }
.form-field input { width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; font-size: var(--font-size-base); box-sizing: border-box; }
.form-field input:focus { border-color: var(--primary-color); outline: none; }
.dialog-actions { display: flex; gap: var(--spacing-sm); justify-content: flex-end; margin-top: var(--spacing-lg); }

.confirm-dialog { max-width: 520px; }
.confirm-content { margin-bottom: var(--spacing-lg); }
.confirm-item { margin-bottom: var(--spacing-sm); font-size: var(--font-size-sm); }
.confirm-warn { margin-top: var(--spacing-md); padding: var(--spacing-sm); background: #fff3cd; border: 1px solid #ffc107; border-radius: 6px; color: #856404; font-size: var(--font-size-sm); }
</style>
```

**UnifiedConfig 挂载**：
```vue
// src/UnifiedConfig/index.vue
import EnvConfig from '../EnvConfig/index.vue'

<button class="nav-item" :class="{ active: activeTab === 'env' }" @click="activeTab = 'env'">
  <span class="nav-icon">🔌</span>
  <span class="nav-text">API 环境</span>
</button>

<EnvConfig v-show="activeTab === 'env'" />
```

### 5. 首次创建与默认配置

`readEnvConfigsFile()` 检测文件不存在时，自动创建默认配置：

```javascript
function defaultEnvConfigs() {
  return {
    version: 1,
    activeId: null,  // 默认无激活，不改 settings.json
    managedKeys: [],
    configs: [
      {
        id: 'builtin-official',
        name: '官方 Anthropic',
        baseUrl: 'https://api.anthropic.com',
        token: '',
        model: '',
        builtin: true
      }
    ]
  }
}
```

老用户首次进入「API 环境」tab 时，文件自动创建但 `activeId: null`，对 `settings.json` 零影响。

### 6. 错误处理

- 文件读取失败 / 解析失败：降级为默认配置，不抛异常。
- 写入失败：返回 `{ success: false, error: <msg> }`，弹窗告知用户。
- 备份失败：记录错误但不阻断写入（原子写仍执行）。
- 应用不存在的 id：返回 `{ success: false, error: '环境配置不存在' }`。
- `settings.json` 格式损坏：尝试保留原内容，只改 `env` 字段；若整个文件无法解析，返回错误。
