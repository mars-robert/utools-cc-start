## Context

`src/EnvConfig/` 已实现卡片展示与 `ConfigEditor` 编辑器，使用 `ConfigFields.js` 定义 4 个分组共 20+ 个字段。用户创建配置时需填写大量字段，对常见场景（DeepSeek / 官方 / 中转）缺乏模板支持。

现有架构：
- `public/preload/env-config.js` 管理 store 的增删改查，写入 `~/.claude/settings.json`
- `ConfigEditor.vue` 提供表单模式（基于 `ConfigFields.js`）和 JSON 模式
- `index.vue` 展示卡片网格，点击卡片切换配置

约束：
- 必须保持与现有 store 数据结构兼容
- 不改变 `settings.json` 的读写机制
- 预设数据存储在代码中，不需要持久化用户自定义预设

## Goals / Non-Goals

**Goals:**
- 提供 5+ 主流 API 厂商预设（DeepSeek、官方 Anthropic、OpenRouter、国内中转、自定义）
- 简化配置编辑器：表单模式只展示核心 4-5 个字段，其余折叠到「高级配置」或 JSON 模式
- 预设选择界面：创建配置时先选预设，自动填充 BASE_URL / 推荐 MODEL / EFFORT_LEVEL
- 卡片上显示预设来源（如标签「DeepSeek」）

**Non-Goals:**
- 不支持用户自定义预设（硬编码在代码中即可）
- 不做自动健康检查或连通性测试
- 不改变 store 的底层数据结构（`{ id, title, settings: { env: {...} } }`）

## Decisions

### 1. 预设定义：硬编码在 preload 层

在 `public/preload/env-config.js` 新增预设数组：

```javascript
const VENDOR_PRESETS = [
  {
    id: 'official-anthropic',
    name: '官方 Anthropic',
    description: '使用 Anthropic 官方 API',
    icon: '🟣',
    config: {
      'env.ANTHROPIC_BASE_URL': 'https://api.anthropic.com',
      'env.ANTHROPIC_MODEL': 'claude-opus-4-8[1m]',
      'env.CLAUDE_CODE_EFFORT_LEVEL': 'high'
    },
    requiresToken: true
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    description: 'DeepSeek 兼容 Anthropic API',
    icon: '🔷',
    config: {
      'env.ANTHROPIC_BASE_URL': 'https://api.deepseek.com/anthropic',
      'env.ANTHROPIC_MODEL': 'deepseek-v4-pro[1m]',
      'env.ANTHROPIC_DEFAULT_OPUS_MODEL': 'deepseek-v4-pro[1m]',
      'env.ANTHROPIC_DEFAULT_SONNET_MODEL': 'deepseek-v4-pro[1m]',
      'env.ANTHROPIC_DEFAULT_HAIKU_MODEL': 'deepseek-v4-flash',
      'env.CLAUDE_CODE_SUBAGENT_MODEL': 'deepseek-v4-flash',
      'env.CLAUDE_CODE_EFFORT_LEVEL': 'max'
    },
    requiresToken: true,
    tokenPlaceholder: 'sk-...',
    docs: 'https://platform.deepseek.com/api_keys'
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: '通过 OpenRouter 访问多种模型',
    icon: '🌐',
    config: {
      'env.ANTHROPIC_BASE_URL': 'https://openrouter.ai/api/v1',
      'env.ANTHROPIC_MODEL': 'anthropic/claude-opus-4'
    },
    requiresToken: true
  },
  {
    id: 'china-relay',
    name: '国内中转（示例）',
    description: '国内中转服务示例',
    icon: '🇨🇳',
    config: {
      'env.ANTHROPIC_BASE_URL': 'https://relay.example.com',
      'env.ANTHROPIC_MODEL': 'claude-opus-4'
    },
    requiresToken: true,
    isTemplate: true // 标记为模板，需要用户修改 URL
  },
  {
    id: 'custom',
    name: '自定义配置',
    description: '从空白开始配置',
    icon: '⚙️',
    config: {},
    requiresToken: false
  }
]

function getVendorPresets() {
  return { success: true, data: VENDOR_PRESETS }
}
```

**备选方案**：从外部 JSON 文件加载预设 → 否决，增加复杂度，硬编码更简单直接。

### 2. 简化字段展示：分组折叠 + 精简表单模式

修改 `ConfigFields.js`：

```javascript
// 新增字段元数据：priority（basic | advanced）
export const CONFIG_SECTIONS = [
  {
    sectionName: '基础配置',
    defaultOpen: true,
    fields: [
      {
        label: 'ANTHROPIC_BASE_URL',
        name: 'env.ANTHROPIC_BASE_URL',
        type: 'text',
        priority: 'basic', // ← 新增
        description: 'API 请求的 URL',
        placeholder: 'https://api.anthropic.com'
      },
      {
        label: 'ANTHROPIC_AUTH_TOKEN',
        name: 'env.ANTHROPIC_AUTH_TOKEN',
        type: 'text',
        priority: 'basic',
        description: 'API 密钥',
        placeholder: 'sk-ant-...'
      },
      {
        label: 'ANTHROPIC_MODEL',
        name: 'env.ANTHROPIC_MODEL',
        type: 'text',
        priority: 'basic',
        description: '默认使用的模型',
        placeholder: 'claude-opus-4-8[1m]'
      },
      {
        label: 'CLAUDE_CODE_EFFORT_LEVEL',
        name: 'env.CLAUDE_CODE_EFFORT_LEVEL',
        type: 'select',
        priority: 'basic',
        description: '思考强度',
        options: ['low', 'medium', 'high', 'xhigh', 'max']
      },
      // 其余字段标记为 priority: 'advanced'
      {
        label: 'ANTHROPIC_DEFAULT_HAIKU_MODEL',
        name: 'env.ANTHROPIC_DEFAULT_HAIKU_MODEL',
        type: 'text',
        priority: 'advanced',
        description: '默认 Haiku 模型'
      },
      // ...
    ]
  }
]

// 导出筛选函数
export function getBasicFields() {
  const result = []
  CONFIG_SECTIONS.forEach(section => {
    const basicFields = section.fields.filter(f => f.priority === 'basic')
    if (basicFields.length > 0) {
      result.push({ ...section, fields: basicFields })
    }
  })
  return result
}
```

`ConfigEditor.vue` 表单模式默认只渲染 `getBasicFields()`，底部增加「显示高级选项」折叠按钮，或引导用户切换到 JSON 模式。

**备选方案**：拆分为两个独立组件 `BasicEditor` / `AdvancedEditor` → 否决，状态同步复杂，单组件分级渲染更简单。

### 3. 预设选择界面：创建配置时先选预设

`src/EnvConfig/index.vue` 的 `handleCreate` 改为：

```javascript
handleCreate() {
  // 打开预设选择弹窗
  this.showPresetSelector = true
}

handlePresetSelected(presetId) {
  const preset = this.presets.find(p => p.id === presetId)
  if (!preset) return

  // 创建基于预设的 store 草稿
  this.editingStore = {
    title: preset.name,
    settings: this.buildSettingsFromPreset(preset),
    _presetId: presetId // 存储预设来源
  }

  this.showPresetSelector = false
  this.showEditor = true
}

buildSettingsFromPreset(preset) {
  const settings = { env: {} }
  Object.keys(preset.config).forEach(key => {
    const value = preset.config[key]
    // 解析嵌套路径 'env.ANTHROPIC_BASE_URL' → settings.env.ANTHROPIC_BASE_URL
    setNestedValue(settings, key, value)
  })
  return settings
}
```

预设选择弹窗 UI：
```
┌─────────────────────────────────────────┐
│  选择 API 厂商预设                        │
├─────────────────────────────────────────┤
│  🟣 官方 Anthropic                       │
│     使用 Anthropic 官方 API              │
├─────────────────────────────────────────┤
│  🔷 DeepSeek           [推荐]            │
│     DeepSeek 兼容 Anthropic API          │
│     📖 申请 API Key                       │
├─────────────────────────────────────────┤
│  🌐 OpenRouter                           │
│     通过 OpenRouter 访问多种模型          │
├─────────────────────────────────────────┤
│  🇨🇳 国内中转（示例）    [需修改 URL]     │
│     国内中转服务示例                      │
├─────────────────────────────────────────┤
│  ⚙️ 自定义配置                            │
│     从空白开始配置                        │
└─────────────────────────────────────────┘
```

点击预设后进入编辑器，BASE_URL / MODEL 等已预填，用户只需填写 `ANTHROPIC_AUTH_TOKEN`。

### 4. 卡片显示预设来源

在 store 数据中增加 `_presetId` 元数据（不写入 `settings.json`，仅 UI 用）：

```javascript
// 保存 store 时附加元数据
function saveStore(storeData) {
  const toSave = {
    id: storeData.id || generateId(),
    title: storeData.title,
    settings: storeData.settings,
    _presetId: storeData._presetId || null // 记录来源预设
  }
  // 存储到 dbStorage
  window.utools.dbStorage.setItem(`env-store-${toSave.id}`, JSON.stringify(toSave))
  return toSave
}
```

`index.vue` 卡片渲染时：
```vue
<div class="card-top">
  <span class="card-name">{{ store.title }}</span>
  <span v-if="getPresetLabel(store)" class="tag tag-preset">
    {{ getPresetLabel(store) }}
  </span>
  <!-- ... -->
</div>

<script>
methods: {
  getPresetLabel(store) {
    if (!store._presetId) return null
    const preset = this.presets.find(p => p.id === store._presetId)
    return preset ? preset.icon + ' ' + preset.name : null
  }
}
</script>
```

### 5. 数据存储：保持现有机制不变

继续使用 `utools.dbStorage` 存储 stores 列表，`settings.json` 仅在切换配置时写入。预设定义硬编码，不持久化。

## Risks / Trade-offs

**[风险] 预设配置过时（如 DeepSeek URL 变更）**
→ 预设硬编码在代码中，需要发版更新。用户可在 JSON 模式手动修改，或从预设创建后编辑。

**[风险] 用户从旧版本升级，已有 store 无 `_presetId`**
→ 兼容处理：`_presetId` 缺失时卡片不显示预设标签，不影响功能。

**[权衡] 简化表单 vs 功能暴露**
→ 高级字段（`ANTHROPIC_DEFAULT_HAIKU_MODEL` 等）移至 JSON 模式，99% 用户不需要。技术用户可通过 JSON 编辑。

**[权衡] 预设数量 vs 维护成本**
→ 初期提供 5 个预设，够覆盖主流场景。避免预设过多导致选择困难和维护负担。
