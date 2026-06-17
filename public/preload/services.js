const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { spawn } = require('node:child_process')

// ===== Claude Code 项目启动器：设置存储 =====

const SETTINGS_KEY = 'ccstart.settings'

// Windows 上探测默认 PowerShell 可执行文件路径（优先 PowerShell 7+）
function detectDefaultPowershell () {
  if (process.platform !== 'win32') return ''
  const candidates = [
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'PowerShell', '7', 'pwsh.exe'),
    path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  ]
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate
    } catch (_) { /* 忽略 */ }
  }
  // 回退到 PATH 中的 powershell
  return 'powershell.exe'
}

function defaultSettings () {
  return {
    launchCommand: 'claude',
    powershellPath: detectDefaultPowershell()
  }
}

// ===== Claude Code 项目发现 =====

function getProjectsDir () {
  return path.join(os.homedir(), '.claude', 'projects')
}

// 从最新会话 *.jsonl 文件读取 cwd（逐行扫描 JSON 记录的 cwd 字段）
function readCwdFromSessions (projectDir, sessionFiles) {
  for (const file of sessionFiles) {
    try {
      const content = fs.readFileSync(path.join(projectDir, file.name), { encoding: 'utf-8' })
      const lines = content.split(/\r?\n/)
      // cwd 不一定在首行（首行可能是 summary/last-prompt 等），逐行查找
      for (const line of lines) {
        if (!line) continue
        if (line.indexOf('"cwd"') === -1) continue
        try {
          const parsed = JSON.parse(line)
          if (parsed && typeof parsed.cwd === 'string' && parsed.cwd) {
            return { cwd: parsed.cwd, decoded: false }
          }
        } catch (_) {
          // 该行非完整 JSON，继续
        }
      }
    } catch (_) {
      // 无法读取该文件，尝试下一个
    }
  }
  return null
}

// 启发式：将编码目录名解码为路径（有损，作为回退方案并标记）
function decodeDirName (dirName) {
  // 形如 D--code-utools-claudecode-claude 还原为 D:\code\utools\claudecode\claude
  let decoded = dirName
  if (process.platform === 'win32') {
    // 盘符：开头 "X--" -> "X:\"
    decoded = decoded.replace(/^([A-Za-z])--/, '$1:\\')
    decoded = decoded.replace(/-/g, '\\')
  } else {
    decoded = '/' + decoded.replace(/-/g, '/')
  }
  return decoded
}

// 计算最近使用时间：会话文件 mtimeMs 最大值，无会话文件时回退到目录自身 mtimeMs
function computeRecency (projectDir, sessionFiles, dirStat) {
  let recency = 0
  for (const file of sessionFiles) {
    try {
      const st = fs.statSync(path.join(projectDir, file.name))
      if (st.mtimeMs > recency) recency = st.mtimeMs
    } catch (_) { /* 忽略 */ }
  }
  if (recency === 0 && dirStat) recency = dirStat.mtimeMs
  return recency
}

function listClaudeProjects () {
  const projectsDir = getProjectsDir()
  const result = { dirExists: false, projects: [] }

  let entries
  try {
    if (!fs.existsSync(projectsDir)) return result
    result.dirExists = true
    entries = fs.readdirSync(projectsDir, { withFileTypes: true })
  } catch (_) {
    return result
  }

  const projects = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const dirName = entry.name
    const projectDir = path.join(projectsDir, dirName)

    let dirStat = null
    try { dirStat = fs.statSync(projectDir) } catch (_) { /* 忽略 */ }

    // 收集会话文件
    let sessionFiles = []
    try {
      sessionFiles = fs.readdirSync(projectDir, { withFileTypes: true })
        .filter((f) => f.isFile() && f.name.endsWith('.jsonl'))
    } catch (_) { /* 忽略 */ }

    // 按 mtime 排序，便于读取最新文件的 cwd
    const sortedForCwd = sessionFiles
      .map((f) => {
        let mtimeMs = 0
        try { mtimeMs = fs.statSync(path.join(projectDir, f.name)).mtimeMs } catch (_) { /* 忽略 */ }
        return { name: f.name, mtimeMs }
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs)

    // 解析 cwd
    let cwd = ''
    let decoded = false
    const fromSession = readCwdFromSessions(projectDir, sortedForCwd)
    if (fromSession) {
      cwd = fromSession.cwd
    } else {
      cwd = decodeDirName(dirName)
      decoded = true
    }

    let available = false
    try { available = !!cwd && fs.existsSync(cwd) } catch (_) { available = false }

    const displayName = cwd ? path.basename(cwd) || cwd : dirName

    projects.push({
      id: dirName,
      dirName,
      cwd,
      displayName,
      decoded,
      recency: computeRecency(projectDir, sortedForCwd, dirStat),
      available
    })
  }

  // 按最近使用时间降序
  projects.sort((a, b) => b.recency - a.recency)
  result.projects = projects
  return result
}

// ===== 终端启动 =====

// 检测是否为 Windows Terminal 路径
function isWindowsTerminal (psPath) {
  if (!psPath) return false
  const normalized = psPath.toLowerCase()
  return normalized.includes('windowsterminal.exe') || normalized.includes('wt.exe')
}

function launchWindows (cwd, command, options) {
  const psPath = (options && options.powershellPath) || detectDefaultPowershell()

  // 判断是使用 Windows Terminal 还是标准 PowerShell
  if (isWindowsTerminal(psPath)) {
    // Windows Terminal parses semicolons in its command line; keep cwd and command
    // as native arguments so a command like "claude" is not treated as a new tab.
    const args = ['-d', cwd, 'powershell.exe', '-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', command]
    return spawn(psPath, args, { detached: true, stdio: 'ignore' })
  } else {
    // 标准 PowerShell 模式：通过 cmd 的 start 打开新窗口
    // 进入目录后运行命令，并保持窗口（NoExit）
    const inner = `Set-Location -LiteralPath '${cwd.replace(/'/g, "''")}'; ${command}`
    const args = ['/c', 'start', '""', psPath, '-NoExit', '-Command', inner]
    return spawn('cmd.exe', args, { detached: true, stdio: 'ignore', windowsVerbatimArguments: false })
  }
}

function launchMac (cwd, command) {
  const script = `tell application "Terminal"
    activate
    do script "cd " & quoted form of "${cwd.replace(/"/g, '\\"')}" & " && ${command.replace(/"/g, '\\"')}"
  end tell`
  return spawn('osascript', ['-e', script], { detached: true, stdio: 'ignore' })
}

function launchLinux (cwd, command) {
  const terminals = [
    { bin: 'x-terminal-emulator', args: ['-e'] },
    { bin: 'gnome-terminal', args: ['--working-directory', cwd, '--'] },
    { bin: 'konsole', args: ['--workdir', cwd, '-e'] },
    { bin: 'xterm', args: ['-e'] }
  ]
  const shellCmd = `cd ${JSON.stringify(cwd)} && ${command}; exec $SHELL`
  let lastErr = null
  for (const term of terminals) {
    try {
      const args = term.bin === 'gnome-terminal'
        ? [...term.args, 'bash', '-c', shellCmd]
        : [...term.args, `bash -c ${JSON.stringify(shellCmd)}`]
      const child = spawn(term.bin, args, { detached: true, stdio: 'ignore' })
      return child
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr || new Error('未找到可用的终端模拟器')
}

// 返回 { success, error } 结果，使渲染层能报告失败
function launchProject (cwd, command, options) {
  try {
    if (!cwd) return { success: false, error: '项目工作目录为空' }
    if (!fs.existsSync(cwd)) return { success: false, error: '项目工作目录不存在：' + cwd }
    const cmd = (command && command.trim()) || 'claude'

    let child
    if (process.platform === 'win32') {
      child = launchWindows(cwd, cmd, options)
    } else if (process.platform === 'darwin') {
      child = launchMac(cwd, cmd)
    } else {
      child = launchLinux(cwd, cmd)
    }
    if (child && typeof child.unref === 'function') child.unref()
    return { success: true }
  } catch (err) {
    return { success: false, error: err && err.message ? err.message : String(err) }
  }
}

// 通过 window 对象向渲染进程注入 nodejs 能力
window.services = {
  // 读文件
  readFile (file) {
    return fs.readFileSync(file, { encoding: 'utf-8' })
  },
  // 文本写入到下载目录
  writeTextFile (text) {
    const filePath = path.join(window.utools.getPath('downloads'), Date.now().toString() + '.txt')
    fs.writeFileSync(filePath, text, { encoding: 'utf-8' })
    return filePath
  },
  // 图片写入到下载目录
  writeImageFile (base64Url) {
    const matchs = /^data:image\/([a-z]{1,20});base64,/i.exec(base64Url)
    if (!matchs) return
    const filePath = path.join(window.utools.getPath('downloads'), Date.now().toString() + '.' + matchs[1])
    fs.writeFileSync(filePath, base64Url.substring(matchs[0].length), { encoding: 'base64' })
    return filePath
  },

  // ===== Claude Code 项目启动器 =====

  // 列出 Claude Code 项目（已排序）
  listClaudeProjects,

  // 启动项目：在终端中以配置命令打开
  launchProject,

  // 检查路径是否存在（用于配置界面校验）
  pathExists (p) {
    try { return !!p && fs.existsSync(p) } catch (_) { return false }
  },

  // 读取启动器设置（带默认值）
  getLauncherSettings () {
    const defaults = defaultSettings()
    try {
      const saved = window.utools.dbStorage.getItem(SETTINGS_KEY)
      if (saved && typeof saved === 'object') {
        return Object.assign(defaults, saved)
      }
    } catch (_) { /* 忽略，使用默认值 */ }
    return defaults
  },

  // 保存启动器设置
  saveLauncherSettings (settings) {
    const merged = Object.assign(defaultSettings(), settings || {})
    window.utools.dbStorage.setItem(SETTINGS_KEY, merged)
    return merged
  }
}
