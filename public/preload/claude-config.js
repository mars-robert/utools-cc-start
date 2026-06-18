const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

function getClaudeConfigPath () {
  return path.join(os.homedir(), '.claude.json')
}

function readClaudeConfigFile () {
  const filePath = getClaudeConfigPath()

  if (!fs.existsSync(filePath)) {
    return {
      exists: false,
      rawText: '',
      data: null,
      parseError: null
    }
  }

  try {
    const rawText = fs.readFileSync(filePath, 'utf8')
    try {
      return {
        exists: true,
        rawText,
        data: JSON.parse(rawText),
        parseError: null
      }
    } catch (err) {
      return {
        exists: true,
        rawText,
        data: null,
        parseError: err
      }
    }
  } catch (err) {
    return {
      exists: false,
      rawText: '',
      data: null,
      parseError: err
    }
  }
}

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

function backupClaudeConfigFile () {
  const filePath = getClaudeConfigPath()
  if (!fs.existsSync(filePath)) {
    return { success: true, exists: false, backupPath: null }
  }

  const backupPath = `${filePath}.${createTimestamp()}.bak`
  fs.copyFileSync(filePath, backupPath)
  return { success: true, exists: true, backupPath }
}

function writeClaudeConfigFile (nextData) {
  const filePath = getClaudeConfigPath()
  const exists = fs.existsSync(filePath)
  const tmpPath = `${filePath}.${createTimestamp()}.tmp`

  try {
    if (exists) {
      backupClaudeConfigFile()
    }

    const rawText = JSON.stringify(nextData, null, 2)
    fs.writeFileSync(tmpPath, rawText, 'utf8')
    fs.renameSync(tmpPath, filePath)

    return {
      success: true,
      exists,
      path: filePath,
      tempPath: tmpPath
    }
  } catch (err) {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath)
    } catch (_) { /* ignore cleanup errors */ }

    return {
      success: false,
      exists,
      path: filePath,
      error: err && err.message ? err.message : String(err)
    }
  }
}

module.exports = {
  getClaudeConfigPath,
  readClaudeConfigFile,
  backupClaudeConfigFile,
  writeClaudeConfigFile
}
