const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

// ===== 路径函数 =====

function getEnvConfigsPath () {
  return path.join(os.homedir(), '.claude', 'cconf-envs.json')
}

function getClaudeSettingsPath () {
  return path.join(os.homedir(), '.claude', 'settings.json')
}

// ===== 时间戳工具（复刻 claude-config.js）=====

function createTimestamp () {
  const now = new Date()
  const pad = (value, length = 2) => String(value).padStart(length, '0')
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
    pad(now.getMilliseconds(), 3)
  ].join('')
}

// ===== 默认配置 =====

function defaultEnvConfigs () {
  return {
    version: 1,
    activeId: null,
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

// ===== 读取配置清单文件 =====

function readEnvConfigsFile () {
  const filePath = getEnvConfigsPath()

  if (!fs.existsSync(filePath)) {
    return {
      exists: false,
      data: defaultEnvConfigs(),
      parseError: null
    }
  }

  try {
    const rawText = fs.readFileSync(filePath, 'utf8')
    try {
      const parsed = JSON.parse(rawText)
      return {
        exists: true,
        data: (parsed && typeof parsed === 'object') ? parsed : defaultEnvConfigs(),
        parseError: null
      }
    } catch (parseErr) {
      return {
        exists: true,
        data: defaultEnvConfigs(),
        parseError: parseErr
      }
    }
  } catch (err) {
    return {
      exists: false,
      data: defaultEnvConfigs(),
      parseError: err
    }
  }
}

// ===== 写入配置清单文件（备份 + 原子写）=====

function writeEnvConfigsFile (data) {
  const filePath = getEnvConfigsPath()
  const exists = fs.existsSync(filePath)
  const tmpPath = `${filePath}.${createTimestamp()}.tmp`

  try {
    // 备份
    if (exists) {
      const backupPath = `${filePath}.${createTimestamp()}.bak`
      try {
        fs.copyFileSync(filePath, backupPath)
      } catch (backupErr) {
        // 备份失败不阻断写入，但记录错误
        console.warn('Failed to backup env-configs:', backupErr)
      }
    }

    // 原子写
    const rawText = JSON.stringify(data, null, 2)
    fs.writeFileSync(tmpPath, rawText, 'utf8')
    fs.renameSync(tmpPath, filePath)

    return { success: true }
  } catch (err) {
    // 清理临时文件
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath)
    } catch (_) { /* ignore cleanup errors */ }

    return {
      success: false,
      error: err && err.message ? err.message : String(err)
    }
  }
}

// ===== 读取 settings.json =====

function readClaudeSettingsFile () {
  const filePath = getClaudeSettingsPath()

  if (!fs.existsSync(filePath)) {
    return {
      exists: false,
      data: {},
      parseError: null
    }
  }

  try {
    const rawText = fs.readFileSync(filePath, 'utf8')
    try {
      const parsed = JSON.parse(rawText)
      return {
        exists: true,
        data: (parsed && typeof parsed === 'object') ? parsed : {},
        parseError: null
      }
    } catch (parseErr) {
      return {
        exists: true,
        data: {},
        parseError: parseErr
      }
    }
  } catch (err) {
    return {
      exists: false,
      data: {},
      parseError: err
    }
  }
}

// ===== 写入 settings.json（备份 + 原子写）=====

function writeClaudeSettingsFile (data) {
  const filePath = getClaudeSettingsPath()
  const exists = fs.existsSync(filePath)
  const tmpPath = `${filePath}.${createTimestamp()}.tmp`

  try {
    // 备份
    if (exists) {
      const backupPath = `${filePath}.${createTimestamp()}.bak`
      try {
        fs.copyFileSync(filePath, backupPath)
      } catch (backupErr) {
        console.warn('Failed to backup settings.json:', backupErr)
      }
    }

    // 原子写
    const rawText = JSON.stringify(data, null, 2)
    fs.writeFileSync(tmpPath, rawText, 'utf8')
    fs.renameSync(tmpPath, filePath)

    return { success: true }
  } catch (err) {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath)
    } catch (_) { /* ignore */ }

    return {
      success: false,
      error: err && err.message ? err.message : String(err)
    }
  }
}

// ===== 应用环境配置 =====

function applyEnvConfig (id) {
  try {
    // 1. 读取配置清单
    const configsResult = readEnvConfigsFile()
    const configsData = configsResult.data
    const targetConfig = configsData.configs.find(c => c.id === id)

    if (!targetConfig) {
      return {
        success: false,
        error: '环境配置不存在'
      }
    }

    // 2. 读取 settings.json
    const settingsResult = readClaudeSettingsFile()
    const settingsData = settingsResult.data
    if (!settingsData.env) {
      settingsData.env = {}
    }

    // 3. 清理旧的受管键
    const oldManagedKeys = configsData.managedKeys || []
    oldManagedKeys.forEach(key => {
      delete settingsData.env[key]
    })

    // 4. 写入新环境的键
    const newKeys = []

    settingsData.env.ANTHROPIC_BASE_URL = targetConfig.baseUrl
    newKeys.push('ANTHROPIC_BASE_URL')

    settingsData.env.ANTHROPIC_AUTH_TOKEN = targetConfig.token
    newKeys.push('ANTHROPIC_AUTH_TOKEN')

    if (targetConfig.model && targetConfig.model.trim()) {
      settingsData.env.ANTHROPIC_MODEL = targetConfig.model
      newKeys.push('ANTHROPIC_MODEL')
    }

    // 自定义 KV
    if (targetConfig.extra && typeof targetConfig.extra === 'object') {
      Object.keys(targetConfig.extra).forEach(key => {
        settingsData.env[key] = targetConfig.extra[key]
        newKeys.push(key)
      })
    }

    // 5. 写入 settings.json
    const writeResult = writeClaudeSettingsFile(settingsData)
    if (!writeResult.success) {
      return writeResult
    }

    // 6. 更新配置清单的 activeId 与 managedKeys
    configsData.activeId = id
    configsData.managedKeys = newKeys

    const updateResult = writeEnvConfigsFile(configsData)
    if (!updateResult.success) {
      return updateResult
    }

    return {
      success: true,
      activeId: id
    }
  } catch (err) {
    return {
      success: false,
      error: err && err.message ? err.message : String(err)
    }
  }
}

// ===== 新增环境配置 =====

function addEnvConfig (item) {
  const configsResult = readEnvConfigsFile()
  const configsData = configsResult.data

  const newConfig = {
    id: 'custom-' + Date.now(),
    name: item.name || '未命名',
    baseUrl: item.baseUrl || '',
    token: item.token || '',
    model: item.model || '',
    extra: item.extra || {}
  }

  configsData.configs.push(newConfig)
  writeEnvConfigsFile(configsData)

  return newConfig
}

// ===== 更新环境配置 =====

function updateEnvConfig (id, patch) {
  const configsResult = readEnvConfigsFile()
  const configsData = configsResult.data

  const idx = configsData.configs.findIndex(c => c.id === id)
  if (idx === -1) {
    return null
  }

  const updated = {
    ...configsData.configs[idx],
    ...patch,
    id, // 保留 id
    builtin: configsData.configs[idx].builtin // 保留 builtin 标记
  }

  configsData.configs[idx] = updated
  writeEnvConfigsFile(configsData)

  return updated
}

// ===== 删除环境配置 =====

function deleteEnvConfig (id) {
  const configsResult = readEnvConfigsFile()
  const configsData = configsResult.data

  const target = configsData.configs.find(c => c.id === id)
  if (!target) {
    return { success: false, error: '环境配置不存在' }
  }

  if (target.builtin) {
    return { success: false, error: '内置环境不可删除' }
  }

  configsData.configs = configsData.configs.filter(c => c.id !== id)

  // 若删除的是当前激活环境，重置 activeId
  if (configsData.activeId === id) {
    configsData.activeId = null
  }

  const writeResult = writeEnvConfigsFile(configsData)
  return writeResult
}

// ===== 导出 =====

module.exports = {
  getEnvConfigsPath,
  getClaudeSettingsPath,
  defaultEnvConfigs,
  readEnvConfigsFile,
  writeEnvConfigsFile,
  readClaudeSettingsFile,
  writeClaudeSettingsFile,
  applyEnvConfig,
  addEnvConfig,
  updateEnvConfig,
  deleteEnvConfig
}
