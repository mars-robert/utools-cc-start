const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

// ==================== 路径配置 ====================

const APP_CONFIG_DIR = '.ccconfig'

function getAppConfigPath() {
  return path.join(os.homedir(), APP_CONFIG_DIR)
}

function getStoresPath() {
  return path.join(getAppConfigPath(), 'stores.json')
}

function getClaudeSettingsPath() {
  return path.join(os.homedir(), '.claude', 'settings.json')
}

// ==================== 工具函数 ====================

function generateId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let id = ''
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)]
  }
  return id
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

// ==================== 数据结构 ====================

/**
 * 默认存储数据结构
 */
function defaultStoresData() {
  return {
    configs: [],
    distinct_id: null,
    notification: {
      enable: true,
      enabled_hooks: ['Notification']
    }
  }
}

/**
 * 创建配置存储对象
 */
function createConfigStore(id, title, settings) {
  return {
    id,
    title,
    createdAt: Date.now(),
    settings: settings || {},
    using: false
  }
}

// ==================== 读写操作 ====================

/**
 * 读取 stores.json
 */
function readStores() {
  const storesPath = getStoresPath()

  if (!fs.existsSync(storesPath)) {
    return { success: true, data: defaultStoresData() }
  }

  try {
    const content = fs.readFileSync(storesPath, 'utf8')
    const data = JSON.parse(content)

    // 确保有 notification 字段
    if (!data.notification) {
      data.notification = {
        enable: true,
        enabled_hooks: ['Notification']
      }
    }

    return { success: true, data }
  } catch (error) {
    console.error('读取 stores.json 失败:', error)
    return { success: false, error: error.message, data: defaultStoresData() }
  }
}

/**
 * 写入 stores.json
 */
function writeStores(data) {
  const storesPath = getStoresPath()

  try {
    ensureDir(path.dirname(storesPath))
    const content = JSON.stringify(data, null, 2)
    fs.writeFileSync(storesPath, content, 'utf8')
    return { success: true }
  } catch (error) {
    console.error('写入 stores.json 失败:', error)
    return { success: false, error: error.message }
  }
}

/**
 * 读取 Claude settings.json
 */
function readClaudeSettings() {
  const settingsPath = getClaudeSettingsPath()

  if (!fs.existsSync(settingsPath)) {
    return { success: true, data: {} }
  }

  try {
    const content = fs.readFileSync(settingsPath, 'utf8')
    const data = JSON.parse(content)
    return { success: true, data }
  } catch (error) {
    console.error('读取 settings.json 失败:', error)
    return { success: false, error: error.message, data: {} }
  }
}

/**
 * 写入 Claude settings.json（部分更新）
 */
function writeClaudeSettings(newSettings) {
  const settingsPath = getClaudeSettingsPath()

  try {
    ensureDir(path.dirname(settingsPath))

    // 读取现有配置
    let existingSettings = {}
    if (fs.existsSync(settingsPath)) {
      const content = fs.readFileSync(settingsPath, 'utf8')
      existingSettings = JSON.parse(content)
    }

    // 合并配置（部分更新）
    const mergedSettings = { ...existingSettings }
    for (const [key, value] of Object.entries(newSettings)) {
      mergedSettings[key] = value
    }

    // 写入
    const content = JSON.stringify(mergedSettings, null, 2)
    fs.writeFileSync(settingsPath, content, 'utf8')

    return { success: true }
  } catch (error) {
    console.error('写入 settings.json 失败:', error)
    return { success: false, error: error.message }
  }
}

// ==================== 核心 API ====================

/**
 * 获取所有配置
 */
function getStores() {
  const result = readStores()
  if (!result.success) {
    return { success: false, error: result.error, data: [] }
  }

  // 按创建时间排序
  const configs = result.data.configs.sort((a, b) => a.createdAt - b.createdAt)

  return { success: true, data: configs }
}

/**
 * 获取单个配置
 */
function getStore(storeId) {
  const result = readStores()
  if (!result.success) {
    return { success: false, error: result.error }
  }

  const store = result.data.configs.find(s => s.id === storeId)
  if (!store) {
    return { success: false, error: '配置不存在' }
  }

  return { success: true, data: store }
}

/**
 * 获取当前生效的配置
 */
function getCurrentStore() {
  const result = readStores()
  if (!result.success) {
    return { success: false, error: result.error, data: null }
  }

  const currentStore = result.data.configs.find(s => s.using)
  return { success: true, data: currentStore || null }
}

/**
 * 创建新配置
 */
function createConfig(title, settings, presetId) {
  const storesResult = readStores()
  if (!storesResult.success) {
    return { success: false, error: storesResult.error }
  }

  const data = storesResult.data
  const id = generateId()

  // 判断是否是第一个配置
  const isFirstConfig = data.configs.length === 0

  // 如果是第一个配置且存在现有 settings.json，创建 "Original Config"
  if (isFirstConfig) {
    const settingsResult = readClaudeSettings()
    if (settingsResult.success && Object.keys(settingsResult.data).length > 0) {
      const originalStore = createConfigStore(
        generateId(),
        'Original Config',
        settingsResult.data
      )
      data.configs.push(originalStore)
    }
  }

  // 创建新配置
  const newStore = createConfigStore(id, title, settings)
  newStore.using = isFirstConfig // 第一个配置自动激活
  newStore._presetId = presetId || null // 记录预设来源

  data.configs.push(newStore)

  // 如果是第一个配置，写入到 settings.json
  if (isFirstConfig) {
    const writeResult = writeClaudeSettings(settings)
    if (!writeResult.success) {
      return { success: false, error: writeResult.error }
    }
  }

  // 保存
  const writeResult = writeStores(data)
  if (!writeResult.success) {
    return { success: false, error: writeResult.error }
  }

  return { success: true, data: newStore }
}

/**
 * 更新配置
 */
function updateConfig(storeId, title, settings) {
  const storesResult = readStores()
  if (!storesResult.success) {
    return { success: false, error: storesResult.error }
  }

  const data = storesResult.data
  const storeIndex = data.configs.findIndex(s => s.id === storeId)

  if (storeIndex === -1) {
    return { success: false, error: '配置不存在' }
  }

  // 更新配置
  const store = data.configs[storeIndex]
  store.title = title
  store.settings = settings

  // 如果当前配置正在使用，同步更新到 settings.json
  if (store.using) {
    const writeResult = writeClaudeSettings(settings)
    if (!writeResult.success) {
      return { success: false, error: writeResult.error }
    }
  }

  // 保存
  const writeResult = writeStores(data)
  if (!writeResult.success) {
    return { success: false, error: writeResult.error }
  }

  return { success: true, data: store }
}

/**
 * 删除配置
 */
function deleteConfig(storeId) {
  const storesResult = readStores()
  if (!storesResult.success) {
    return { success: false, error: storesResult.error }
  }

  const data = storesResult.data
  const originalLength = data.configs.length

  data.configs = data.configs.filter(s => s.id !== storeId)

  if (data.configs.length === originalLength) {
    return { success: false, error: '配置不存在' }
  }

  // 保存
  const writeResult = writeStores(data)
  if (!writeResult.success) {
    return { success: false, error: writeResult.error }
  }

  return { success: true }
}

/**
 * 切换配置（核心功能）
 */
function setUsingConfig(storeId) {
  const storesResult = readStores()
  if (!storesResult.success) {
    return { success: false, error: storesResult.error }
  }

  const data = storesResult.data

  // 找到目标配置
  const targetStore = data.configs.find(s => s.id === storeId)
  if (!targetStore) {
    return { success: false, error: '配置不存在' }
  }

  // 更新所有配置的 using 状态
  for (const store of data.configs) {
    store.using = (store.id === storeId)
  }

  // 写入到 settings.json（部分更新）
  const writeResult = writeClaudeSettings(targetStore.settings)
  if (!writeResult.success) {
    return { success: false, error: writeResult.error }
  }

  // 保存 stores.json
  const saveResult = writeStores(data)
  if (!saveResult.success) {
    return { success: false, error: saveResult.error }
  }

  return { success: true }
}

/**
 * 重置到原始配置（清空所有使用状态并清空 env）
 */
function resetToOriginalConfig() {
  const storesResult = readStores()
  if (!storesResult.success) {
    return { success: false, error: storesResult.error }
  }

  const data = storesResult.data

  // 取消所有配置的激活状态
  for (const store of data.configs) {
    store.using = false
  }

  // 保存 stores.json
  const saveResult = writeStores(data)
  if (!saveResult.success) {
    return { success: false, error: saveResult.error }
  }

  // 清空 settings.json 的 env 字段
  const settingsResult = readClaudeSettings()
  if (settingsResult.success) {
    const settings = settingsResult.data
    settings.env = {}

    const writeResult = writeClaudeSettings(settings)
    if (!writeResult.success) {
      return { success: false, error: writeResult.error }
    }
  }

  return { success: true }
}

// ==================== 预设模板 ====================

/**
 * 获取预设模板
 */
function getPresets() {
  const presets = [
    {
      id: 'official-anthropic',
      name: '官方 Anthropic',
      description: '使用 Anthropic 官方 API',
      icon: 'A',
      settings: {
        env: {
          ANTHROPIC_BASE_URL: 'https://api.anthropic.com',
          ANTHROPIC_MODEL: 'claude-opus-4-8[1m]',
          CLAUDE_CODE_EFFORT_LEVEL: 'high'
        }
      },
      requiresToken: true,
      docs: 'https://console.anthropic.com/settings/keys'
    },
    {
      id: 'deepseek',
      name: 'DeepSeek',
      description: 'DeepSeek 兼容 Anthropic API',
      icon: 'D',
      settings: {
        env: {
          ANTHROPIC_BASE_URL: 'https://api.deepseek.com/anthropic',
          ANTHROPIC_MODEL: 'deepseek-v4-pro[1m]',
          ANTHROPIC_DEFAULT_OPUS_MODEL: 'deepseek-v4-pro[1m]',
          ANTHROPIC_DEFAULT_SONNET_MODEL: 'deepseek-v4-pro[1m]',
          ANTHROPIC_DEFAULT_HAIKU_MODEL: 'deepseek-v4-flash',
          CLAUDE_CODE_SUBAGENT_MODEL: 'deepseek-v4-flash',
          CLAUDE_CODE_EFFORT_LEVEL: 'max'
        }
      },
      requiresToken: true,
      tokenPlaceholder: 'sk-...',
      docs: 'https://platform.deepseek.com/api_keys'
    },
    {
      id: 'glm',
      name: '智谱 GLM-4',
      description: '智谱 AI GLM 大模型',
      icon: 'Z',
      settings: {
        env: {
          ANTHROPIC_BASE_URL: 'https://open.bigmodel.cn/api/anthropic',
          ANTHROPIC_MODEL: 'GLM-4.6',
          ANTHROPIC_DEFAULT_OPUS_MODEL: 'GLM-4.6',
          ANTHROPIC_DEFAULT_SONNET_MODEL: 'GLM-4.6',
          ANTHROPIC_DEFAULT_HAIKU_MODEL: 'GLM-4.5-Air'
        }
      },
      requiresToken: true,
      docs: 'https://open.bigmodel.cn/usercenter/apikeys'
    },
    {
      id: 'kimi',
      name: 'Kimi',
      description: 'Moonshot AI Kimi 大模型',
      icon: 'K',
      settings: {
        env: {
          ANTHROPIC_BASE_URL: 'https://api.moonshot.cn/anthropic',
          ANTHROPIC_MODEL: 'kimi-k2-turbo-preview',
          ANTHROPIC_DEFAULT_OPUS_MODEL: 'kimi-k2-turbo-preview',
          ANTHROPIC_DEFAULT_SONNET_MODEL: 'kimi-k2-turbo-preview',
          ANTHROPIC_DEFAULT_HAIKU_MODEL: 'kimi-k2-turbo-preview'
        }
      },
      requiresToken: true,
      docs: 'https://platform.moonshot.cn/console/api-keys'
    },
    {
      id: 'openrouter',
      name: 'OpenRouter',
      description: '通过 OpenRouter 访问多种模型',
      icon: 'OR',
      settings: {
        env: {
          ANTHROPIC_BASE_URL: 'https://openrouter.ai/api/v1',
          ANTHROPIC_MODEL: 'anthropic/claude-opus-4'
        }
      },
      requiresToken: true,
      docs: 'https://openrouter.ai/keys'
    },
    {
      id: 'china-relay',
      name: '国内中转',
      description: '国内中转服务示例模板',
      icon: 'CN',
      settings: {
        env: {
          ANTHROPIC_BASE_URL: 'https://relay.example.com',
          ANTHROPIC_MODEL: 'claude-opus-4'
        }
      },
      requiresToken: true,
      isTemplate: true
    },
    {
      id: 'custom',
      name: '自定义配置',
      description: '从空白开始配置',
      icon: 'C',
      settings: {
        env: {}
      },
      requiresToken: false
    }
  ]

  return { success: true, data: presets }
}

/**
 * 应用预设模板
 */
function applyPreset(presetId, existingSettings = {}) {
  const presetsResult = getPresets()
  if (!presetsResult.success) {
    return { success: false, error: '无法获取预设列表' }
  }

  const preset = presetsResult.data.find(p => p.id === presetId)

  if (!preset) {
    return { success: false, error: '预设不存在' }
  }

  // 合并配置
  const mergedSettings = { ...existingSettings }
  for (const [key, value] of Object.entries(preset.settings)) {
    if (typeof value === 'object' && !Array.isArray(value)) {
      mergedSettings[key] = { ...mergedSettings[key], ...value }
    } else {
      mergedSettings[key] = value
    }
  }

  return { success: true, data: mergedSettings }
}

/**
 * 读取当前的 Claude settings.json
 */
function readCurrentClaudeSettings() {
  return readClaudeSettings()
}

// ==================== 导出 ====================

module.exports = {
  // 路径
  getAppConfigPath,
  getStoresPath,
  getClaudeSettingsPath,

  // CRUD
  getStores,
  getStore,
  getCurrentStore,
  createConfig,
  updateConfig,
  deleteConfig,
  setUsingConfig,
  resetToOriginalConfig,

  // 预设
  getPresets,
  applyPreset,

  // 读取
  readCurrentClaudeSettings,

  // 工具
  generateId
}
