const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { spawn } = require('node:child_process')

function loadClaudeConfigHelpers () {
  return require('./claude-config.js')
}

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

// 探测 PowerShell 7 (pwsh) 路径
function detectPwsh7 () {
  if (process.platform !== 'win32') return 'pwsh'
  const candidate = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'PowerShell', '7', 'pwsh.exe')
  try { if (fs.existsSync(candidate)) return candidate } catch (_) { /* 忽略 */ }
  return 'pwsh.exe'
}

// 探测 Windows PowerShell 5.1 路径
function detectWinPowershell () {
  if (process.platform !== 'win32') return 'powershell'
  const candidate = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  try { if (fs.existsSync(candidate)) return candidate } catch (_) { /* 忽略 */ }
  return 'powershell.exe'
}

// ===== 内置预设：启动命令与终端 =====

const BUILTIN_LAUNCH_COMMANDS = [
  { id: 'lc-claude', label: 'Claude', command: 'claude' },
  { id: 'lc-continue', label: 'Claude 继续上次会话 (--continue)', command: 'claude --continue' },
  { id: 'lc-resume', label: 'Claude 恢复会话 (--resume)', command: 'claude --resume' },
  { id: 'lc-skip', label: 'Claude 跳过权限确认 (--dangerously-skip-permissions)', command: 'claude --dangerously-skip-permissions' }
]

const BUILTIN_TERMINALS = [
  { id: 'bt-powershell', label: 'Windows PowerShell', type: 'powershell' },
  { id: 'bt-wt', label: 'Windows Terminal', type: 'wt' },
  { id: 'bt-pwsh', label: 'PowerShell 7 (pwsh)', type: 'pwsh' },
  { id: 'bt-cmd', label: 'CMD', type: 'cmd' }
]

// 将终端项解析为运行时 { powershellPath, terminalType }
function resolveTerminal (term) {
  if (!term) return { powershellPath: detectDefaultPowershell(), terminalType: undefined }
  switch (term.type) {
    case 'powershell': return { powershellPath: detectWinPowershell(), terminalType: 'powershell' }
    case 'pwsh': return { powershellPath: detectPwsh7(), terminalType: 'pwsh' }
    case 'wt': return { powershellPath: 'wt.exe', terminalType: 'wt' }
    case 'cmd': return { powershellPath: '', terminalType: 'cmd' }
    case 'custom': return { powershellPath: term.path || '', terminalType: 'custom' }
    default: return { powershellPath: detectDefaultPowershell(), terminalType: undefined }
  }
}

const SETTINGS_VERSION = 2

// 默认持久化结构（v2）
function defaultPersisted () {
  return {
    version: SETTINGS_VERSION,
    customLaunchCommands: [],
    selectedLaunchId: 'lc-claude',
    customTerminals: [],
    selectedTerminalId: 'bt-powershell',
    terminalPathOverrides: {} // { [builtinId]: customPath }
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

// 基于文件系统的辅助反编码：
// Claude Code 编码时 `\`（路径分隔符）与 `_`（名字内的下划线）都会被写成 `-`，单凭 dirName 无法区分。
// 这里在每一级子目录上，用文件系统验证「相邻若干段以 `_` 或 `-` 连接」是否构成真实存在的目录名，命中即下钻。
// 找到一条完整存在的路径则返回，否则返回 null，由调用方继续回退。
function walkFsForPath (current, segments, idx) {
  if (idx === segments.length) return current
  for (let k = 1; idx + k <= segments.length; k++) {
    // 尝试用 _ 和 - 两种连接符（目录名中可能含有真实的连字符）
    for (const sep of ['_', '-']) {
      const subName = segments.slice(idx, idx + k).join(sep)
      if (!subName) continue
      const sub = path.join(current, subName)
      try {
        if (fs.existsSync(sub)) {
          const r = walkFsForPath(sub, segments, idx + k)
          if (r) return r
        }
      } catch (_) { /* 忽略，继续下一个候选 */ }
    }
  }
  return null
}

function tryFsDecodeDirName (dirName) {
  let basePath
  let segments
  if (process.platform === 'win32') {
    const m = dirName.match(/^([A-Za-z])--(.*)$/)
    if (!m) return null
    basePath = m[1] + ':\\'
    segments = m[2].split('-')
  } else {
    basePath = '/'
    segments = dirName.replace(/^-+/, '').split('-')
  }
  if (segments.length === 0 || segments.every((s) => s === '')) return null
  try { if (!fs.existsSync(basePath)) return null } catch (_) { return null }
  return walkFsForPath(basePath, segments, 0)
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

// 读取项目当前 git 分支：直接解析 .git/HEAD，零子进程开销
// 返回分支名；detached HEAD 返回短 commit；非 git 仓库或出错返回 ''
function readGitBranch (cwd) {
  if (!cwd) return ''
  try {
    let gitDir = path.join(cwd, '.git')
    const st = fs.statSync(gitDir)
    if (st.isFile()) {
      // .git 为文件（worktree/submodule）：内容形如 "gitdir: <路径>"
      const m = fs.readFileSync(gitDir, 'utf-8').trim().match(/^gitdir:\s*(.+)$/)
      if (!m) return ''
      gitDir = path.resolve(cwd, m[1].trim())
    }
    const head = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf-8').trim()
    const ref = head.match(/^ref:\s*refs\/heads\/(.+)$/)
    if (ref) return ref[1]
    // detached HEAD：HEAD 直接是 commit SHA
    if (/^[0-9a-f]{7,40}$/i.test(head)) return head.slice(0, 7)
    return ''
  } catch (_) {
    return ''
  }
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

    // 解析 cwd：1) 会话 jsonl 中的 cwd（最准）；2) 文件系统辅助反编码；3) 字符级还原（有损）
    let cwd = ''
    let decoded = false
    const fromSession = readCwdFromSessions(projectDir, sortedForCwd)
    if (fromSession) {
      cwd = fromSession.cwd
    } else {
      const fromFs = tryFsDecodeDirName(dirName)
      if (fromFs) {
        cwd = fromFs
        decoded = true
      } else {
        cwd = decodeDirName(dirName)
        decoded = true
      }
    }

    let available = false
    try { available = !!cwd && fs.existsSync(cwd) } catch (_) { available = false }

    const displayName = cwd ? path.basename(cwd) || cwd : dirName
    // 仅对工作目录存在的项目读取分支（避免对失效路径做无谓 IO）
    const branch = available ? readGitBranch(cwd) : ''

    projects.push({
      id: dirName,
      dirName,
      cwd,
      displayName,
      decoded,
      recency: computeRecency(projectDir, sortedForCwd, dirStat),
      available,
      branch
    })
  }

  // 按最近使用时间降序
  projects.sort((a, b) => b.recency - a.recency)
  result.projects = projects
  return result
}

// 删除 Claude Code 项目记录目录（~/.claude/projects/<dirName>）
// 仅删除会话记录目录本身；其对应的真实工作目录已不存在，不会被触碰
function deleteClaudeProject (dirName) {
  try {
    if (!dirName || typeof dirName !== 'string') {
      return { success: false, error: '项目标识无效' }
    }
    // 防止路径穿越：dirName 必须是单层目录名
    if (dirName.includes('/') || dirName.includes('\\') || dirName.includes('..')) {
      return { success: false, error: '项目标识无效' }
    }
    const projectsDir = getProjectsDir()
    const target = path.join(projectsDir, dirName)
    // 再次确认目标确实位于 projectsDir 之内
    const rel = path.relative(projectsDir, target)
    if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
      return { success: false, error: '项目标识无效' }
    }
    if (!fs.existsSync(target)) {
      return { success: false, error: '项目记录不存在' }
    }
    fs.rmSync(target, { recursive: true, force: true })
    return { success: true }
  } catch (err) {
    return { success: false, error: err && err.message ? err.message : String(err) }
  }
}

// ===== 终端启动 =====

// 检测是否为 Windows Terminal 路径
function isWindowsTerminal (psPath) {
  if (!psPath) return false
  const normalized = psPath.toLowerCase()
  return normalized.includes('windowsterminal.exe') || normalized.includes('wt.exe')
}

function launchWindows (cwd, command, options) {
  const opts = options || {}
  const psPath = opts.powershellPath || detectDefaultPowershell()
  // 显式终端类型优先；custom / 未提供时回退到路径启发式
  let type = opts.terminalType
  if (!type) type = isWindowsTerminal(psPath) ? 'wt' : 'powershell'
  if (type === 'custom') type = isWindowsTerminal(psPath) ? 'wt' : 'powershell'

  if (type === 'wt') {
    // Windows Terminal：保持 cwd 与命令为原生参数，避免分号被解析为新标签
    const wtBin = psPath || 'wt.exe'
    const args = ['-d', cwd, 'powershell.exe', '-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', command]
    return spawn(wtBin, args, { detached: true, stdio: 'ignore' })
  } else if (type === 'cmd') {
    // CMD：新窗口进入目录后执行命令并保持窗口（/k）
    const inner = `cd /d "${cwd}" && ${command}`
    const args = ['/c', 'start', '""', 'cmd.exe', '/k', inner]
    return spawn('cmd.exe', args, { detached: true, stdio: 'ignore', windowsVerbatimArguments: false })
  } else {
    // PowerShell / pwsh：通过 cmd 的 start 打开新窗口，进入目录后运行命令并保持窗口
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

// ===== ccrun 命令管理器 =====

// 内置命令库
const BUILTIN_COMMANDS = [
  // Claude CLI
  {
    id: 'claude-upgrade',
    name: '升级 Claude CLI',
    command: 'npm install -g @anthropic-ai/claude-cli@latest',
    description: '更新 Claude CLI 到最新版本',
    type: 'builtin',
    needsProjectDir: false
  },
  {
    id: 'claude-version',
    name: '查看 Claude 版本',
    command: 'claude --version',
    description: '查看当前安装的 Claude CLI 版本',
    type: 'builtin',
    needsProjectDir: false
  },
  {
    id: 'claude-help',
    name: 'Claude 帮助',
    command: 'claude --help',
    description: '查看 Claude CLI 帮助信息',
    type: 'builtin',
    needsProjectDir: false
  },

  // OpenSpec
  {
    id: 'openspec-upgrade',
    name: '升级 OpenSpec',
    command: 'npm install -g openspec@latest',
    description: '更新 OpenSpec 到最新版本',
    type: 'builtin',
    needsProjectDir: false
  },
  {
    id: 'openspec-version',
    name: '查看 OpenSpec 版本',
    command: 'openspec --version',
    description: '查看当前安装的 OpenSpec 版本',
    type: 'builtin',
    needsProjectDir: false
  },
  {
    id: 'openspec-status',
    name: 'OpenSpec 状态',
    command: 'openspec status',
    description: '查看当前项目的 OpenSpec 变更状态',
    type: 'builtin',
    needsProjectDir: true
  },
  {
    id: 'openspec-init',
    name: 'OpenSpec 初始化',
    command: 'openspec init --tools none',
    description: '在当前项目初始化 OpenSpec',
    type: 'builtin',
    needsProjectDir: true
  },
  {
    id: 'openspec-list',
    name: 'OpenSpec 列出变更',
    command: 'openspec list',
    description: '列出所有 OpenSpec 变更',
    type: 'builtin',
    needsProjectDir: true
  },

  // NPM
  {
    id: 'npm-cache-clean',
    name: '清理 npm 缓存',
    command: 'npm cache clean --force',
    description: '清理 npm 缓存',
    type: 'builtin',
    needsProjectDir: false
  },
  {
    id: 'npm-list-global',
    name: '查看全局包',
    command: 'npm list -g --depth=0',
    description: '查看所有全局安装的 npm 包',
    type: 'builtin',
    needsProjectDir: false
  },

  // Git
  {
    id: 'git-status',
    name: 'Git 状态',
    command: 'git status',
    description: '查看 Git 仓库状态',
    type: 'builtin',
    needsProjectDir: true
  },
  {
    id: 'git-pull',
    name: 'Git 拉取代码',
    command: 'git pull',
    description: '从远程拉取最新代码',
    type: 'builtin',
    needsProjectDir: true
  },
  {
    id: 'git-branch',
    name: 'Git 查看分支',
    command: 'git branch -a',
    description: '查看所有本地和远程分支',
    type: 'builtin',
    needsProjectDir: true
  },
  {
    id: 'git-log',
    name: 'Git 提交历史',
    command: 'git log --oneline -10',
    description: '查看最近 10 条提交历史',
    type: 'builtin',
    needsProjectDir: true
  }
]

const COMMANDS_STORAGE_KEY = 'ccrun.custom'
const OVERRIDES_STORAGE_KEY = 'ccrun.overrides'
const LAST_PROJECT_KEY = 'ccrun.lastProject'

// 读取内置命令覆盖层 { [builtinId]: { deleted?, name?, command?, description?, needsProjectDir? } }
function getBuiltinOverrides () {
  return window.utools.dbStorage.getItem(OVERRIDES_STORAGE_KEY) || {}
}

function setBuiltinOverrides (overrides) {
  window.utools.dbStorage.setItem(OVERRIDES_STORAGE_KEY, overrides || {})
}

// 获取所有命令（内置 + 覆盖层 + 自定义）
function getAllCommands () {
  const overrides = getBuiltinOverrides()
  const custom = window.utools.dbStorage.getItem(COMMANDS_STORAGE_KEY) || []
  const builtins = []
  for (const base of BUILTIN_COMMANDS) {
    const ov = overrides[base.id]
    if (ov && ov.deleted) continue // 已删除
    if (ov) {
      const { deleted, ...patch } = ov
      builtins.push({ ...base, ...patch, modified: true })
    } else {
      builtins.push({ ...base })
    }
  }
  return [...builtins, ...custom]
}

// 获取自定义命令
function getCustomCommands () {
  return window.utools.dbStorage.getItem(COMMANDS_STORAGE_KEY) || []
}

// 添加自定义命令
function addCustomCommand (command) {
  const commands = getCustomCommands()
  const newCommand = {
    id: 'custom-' + Date.now(),
    type: 'custom',
    ...command
  }
  commands.push(newCommand)
  window.utools.dbStorage.setItem(COMMANDS_STORAGE_KEY, commands)
  return newCommand
}

// 更新自定义命令
function updateCustomCommand (id, updates) {
  const commands = getCustomCommands()
  const index = commands.findIndex(c => c.id === id)
  if (index !== -1) {
    commands[index] = { ...commands[index], ...updates }
    window.utools.dbStorage.setItem(COMMANDS_STORAGE_KEY, commands)
    return commands[index]
  }
  return null
}

// 删除自定义命令
function deleteCustomCommand (id) {
  const commands = getCustomCommands()
  const filtered = commands.filter(c => c.id !== id)
  window.utools.dbStorage.setItem(COMMANDS_STORAGE_KEY, filtered)
}

// ---- 内置命令覆盖层增删改 ----

// 修改内置命令（以覆盖层记录）
function updateBuiltinCommand (id, patch) {
  if (!BUILTIN_COMMANDS.some((c) => c.id === id)) return null
  const overrides = getBuiltinOverrides()
  const prev = overrides[id] && !overrides[id].deleted ? overrides[id] : {}
  const allowed = {}
  for (const k of ['name', 'command', 'description', 'needsProjectDir']) {
    if (patch[k] !== undefined) allowed[k] = patch[k]
  }
  overrides[id] = { ...prev, ...allowed }
  setBuiltinOverrides(overrides)
  return overrides[id]
}

// 删除内置命令（以覆盖层标记）
function deleteBuiltinCommand (id) {
  if (!BUILTIN_COMMANDS.some((c) => c.id === id)) return false
  const overrides = getBuiltinOverrides()
  overrides[id] = { deleted: true }
  setBuiltinOverrides(overrides)
  return true
}

// 恢复内置命令默认（移除覆盖层记录）
function resetBuiltinCommand (id) {
  const overrides = getBuiltinOverrides()
  if (overrides[id]) {
    delete overrides[id]
    setBuiltinOverrides(overrides)
  }
  return true
}

// 保存最后使用的项目目录
function saveLastProjectDir (dir) {
  window.utools.dbStorage.setItem(LAST_PROJECT_KEY, dir)
}

// 获取最后使用的项目目录
function getLastUsedProjectDir () {
  return window.utools.dbStorage.getItem(LAST_PROJECT_KEY)
}

// 执行 ccrun 命令：在预加载层解析工作目录（渲染层无 process 能力）
// 返回 { success, error }
function runCommand (command, options) {
  try {
    const opts = options || {}
    let cwd

    if (opts.needsProjectDir) {
      cwd = getLastUsedProjectDir()
      if (!cwd || !fs.existsSync(cwd)) {
        return {
          success: false,
          error: '该命令需要在项目目录中执行，请先使用 ccstart 启动项目'
        }
      }
    } else {
      cwd = os.homedir()
    }

    return launchProject(cwd, command, {
      powershellPath: opts.powershellPath,
      terminalType: opts.terminalType
    })
  } catch (err) {
    return { success: false, error: err && err.message ? err.message : String(err) }
  }
}

// ===== 启动器设置：v2 列表模型读写与迁移 =====

// 读取持久化结构（带迁移）。返回 v2 形态。
function readPersisted () {
  let raw = null
  try { raw = window.utools.dbStorage.getItem(SETTINGS_KEY) } catch (_) { raw = null }
  if (!raw || typeof raw !== 'object') return defaultPersisted()

  // 已是 v2
  if (raw.version === SETTINGS_VERSION) {
    return Object.assign(defaultPersisted(), raw)
  }

  // 旧结构迁移：{ launchCommand, powershellPath }
  const migrated = defaultPersisted()
  const oldCmd = (raw.launchCommand || '').trim()
  if (oldCmd && !BUILTIN_LAUNCH_COMMANDS.some((c) => c.command === oldCmd)) {
    const id = 'lc-custom-legacy'
    migrated.customLaunchCommands.push({ id, label: oldCmd, command: oldCmd })
    migrated.selectedLaunchId = id
  } else if (oldCmd) {
    const hit = BUILTIN_LAUNCH_COMMANDS.find((c) => c.command === oldCmd)
    migrated.selectedLaunchId = hit ? hit.id : 'lc-claude'
  }

  const oldPath = (raw.powershellPath || '').trim()
  if (oldPath) {
    if (isWindowsTerminal(oldPath)) {
      migrated.selectedTerminalId = 'bt-wt'
    } else if (oldPath === detectWinPowershell()) {
      migrated.selectedTerminalId = 'bt-powershell'
    } else if (oldPath === detectPwsh7()) {
      migrated.selectedTerminalId = 'bt-pwsh'
    } else {
      const id = 'bt-custom-legacy'
      migrated.customTerminals.push({ id, label: oldPath, type: 'custom', path: oldPath })
      migrated.selectedTerminalId = id
    }
  }
  return migrated
}

function writePersisted (persisted) {
  const merged = Object.assign(defaultPersisted(), persisted || {})
  merged.version = SETTINGS_VERSION
  window.utools.dbStorage.setItem(SETTINGS_KEY, merged)
  return merged
}

// 合并内置 + 自定义的完整列表
function getLaunchCommandList (persisted) {
  const p = persisted || readPersisted()
  return [
    ...BUILTIN_LAUNCH_COMMANDS.map((c) => ({ ...c, builtin: true })),
    ...p.customLaunchCommands.map((c) => ({ ...c, builtin: false }))
  ]
}

function getTerminalList (persisted) {
  const p = persisted || readPersisted()
  const overrides = p.terminalPathOverrides || {}
  return [
    ...BUILTIN_TERMINALS.map((t) => {
      const resolved = resolveTerminal(t)
      const finalPath = overrides[t.id] || resolved.powershellPath
      return { ...t, builtin: true, resolvedPath: finalPath }
    }),
    ...p.customTerminals.map((t) => ({ ...t, builtin: false, resolvedPath: t.path || '' }))
  ]
}

// 派生运行时设置：供 launchProject/runCommand 使用，签名不变
function getLauncherSettings () {
  const p = readPersisted()
  const cmds = getLaunchCommandList(p)
  const terms = getTerminalList(p)
  const selCmd = cmds.find((c) => c.id === p.selectedLaunchId) || cmds[0]
  const selTerm = terms.find((t) => t.id === p.selectedTerminalId) || terms[0]
  const resolved = resolveTerminal(selTerm)
  // selTerm.resolvedPath 已包含预设路径覆盖；优先使用它作为运行时路径
  const runtimePath = (selTerm && selTerm.resolvedPath) || resolved.powershellPath
  return {
    // 运行时字段（兼容旧调用处）
    launchCommand: (selCmd && selCmd.command) || 'claude',
    powershellPath: runtimePath,
    terminalType: resolved.terminalType,
    // 完整模型（供配置界面使用）
    launchCommands: cmds,
    selectedLaunchId: selCmd ? selCmd.id : 'lc-claude',
    terminals: terms,
    selectedTerminalId: selTerm ? selTerm.id : 'bt-powershell'
  }
}

// ---- 启动命令项增删改 ----
function setSelectedLaunchId (id) {
  const p = readPersisted()
  p.selectedLaunchId = id
  return writePersisted(p)
}

function addLaunchCommand (item) {
  const p = readPersisted()
  const newItem = { id: 'lc-custom-' + Date.now(), label: item.label || item.command, command: item.command }
  p.customLaunchCommands.push(newItem)
  writePersisted(p)
  return newItem
}

function updateLaunchCommand (id, patch) {
  const p = readPersisted()
  const idx = p.customLaunchCommands.findIndex((c) => c.id === id)
  if (idx === -1) return null // 内置项不可改
  p.customLaunchCommands[idx] = { ...p.customLaunchCommands[idx], ...patch, id }
  writePersisted(p)
  return p.customLaunchCommands[idx]
}

function deleteLaunchCommand (id) {
  if (BUILTIN_LAUNCH_COMMANDS.some((c) => c.id === id)) return false // 内置不可删
  const p = readPersisted()
  p.customLaunchCommands = p.customLaunchCommands.filter((c) => c.id !== id)
  if (p.selectedLaunchId === id) p.selectedLaunchId = 'lc-claude'
  writePersisted(p)
  return true
}

// ---- 终端项增删改 ----
function setSelectedTerminalId (id) {
  const p = readPersisted()
  p.selectedTerminalId = id
  return writePersisted(p)
}

function addTerminal (item) {
  const p = readPersisted()
  const newItem = { id: 'bt-custom-' + Date.now(), label: item.label || item.path, type: 'custom', path: item.path }
  p.customTerminals.push(newItem)
  writePersisted(p)
  return newItem
}

function updateTerminal (id, patch) {
  const p = readPersisted()
  const idx = p.customTerminals.findIndex((t) => t.id === id)
  if (idx === -1) return null // 预设不可改
  p.customTerminals[idx] = { ...p.customTerminals[idx], ...patch, id, type: 'custom' }
  writePersisted(p)
  return p.customTerminals[idx]
}

function deleteTerminal (id) {
  if (BUILTIN_TERMINALS.some((t) => t.id === id)) return false // 预设不可删
  const p = readPersisted()
  p.customTerminals = p.customTerminals.filter((t) => t.id !== id)
  if (p.selectedTerminalId === id) p.selectedTerminalId = 'bt-powershell'
  writePersisted(p)
  return true
}

// ---- 终端路径覆盖（预设项路径可编辑）----
function setTerminalPathOverride (id, path) {
  if (!BUILTIN_TERMINALS.some((t) => t.id === id)) return false // 仅预设项可覆盖
  const p = readPersisted()
  if (!p.terminalPathOverrides) p.terminalPathOverrides = {}
  p.terminalPathOverrides[id] = path
  writePersisted(p)
  return true
}

function clearTerminalPathOverride (id) {
  const p = readPersisted()
  if (p.terminalPathOverrides && p.terminalPathOverrides[id]) {
    delete p.terminalPathOverrides[id]
    writePersisted(p)
  }
  return true
}

// ===== 主题配置：主色持久化与派生 =====

const THEME_KEY = 'cctheme.settings'

// 内置默认主色（与 variables.css 的 --primary-color 一致）
const DEFAULT_PRIMARY = '#4f8cff'

// 预设主色：10 个不同色相的常用主题色
const PRESET_PRIMARIES = [
  '#4f8cff', // 蓝（默认）
  '#45aaf2', // 天蓝
  '#0fb9b1', // 青
  '#20bf6b', // 绿
  '#f7b731', // 琥珀
  '#fa8231', // 橙
  '#eb3b5a', // 红
  '#e84393', // 粉
  '#a55eea', // 紫
  '#6c5ce7' // 靛
]

// 校验 #RRGGBB 格式
function isValidHex (hex) {
  return typeof hex === 'string' && /^#[0-9a-fA-F]{6}$/.test(hex)
}

// 派生悬停色：与黑色混合约 12%（各通道 ×0.88），保持色相、压暗
function deriveHover (hex) {
  if (!isValidHex(hex)) return DEFAULT_PRIMARY
  const r = Math.round(parseInt(hex.slice(1, 3), 16) * 0.88)
  const g = Math.round(parseInt(hex.slice(3, 5), 16) * 0.88)
  const b = Math.round(parseInt(hex.slice(5, 7), 16) * 0.88)
  const to2 = (n) => n.toString(16).padStart(2, '0')
  return '#' + to2(r) + to2(g) + to2(b)
}

// 读取主题设置；缺省返回 { primaryColor: null }
function getThemeSettings () {
  let raw = null
  try { raw = window.utools.dbStorage.getItem(THEME_KEY) } catch (_) { raw = null }
  if (!raw || typeof raw !== 'object') return { primaryColor: null }
  const color = isValidHex(raw.primaryColor) ? raw.primaryColor : null
  return { primaryColor: color }
}

// 设置主色（校验合法才写入），返回是否成功
function setThemeColor (hex) {
  if (!isValidHex(hex)) return false
  window.utools.dbStorage.setItem(THEME_KEY, { primaryColor: hex })
  return true
}

// 恢复默认：清除自定义主色（写回 null）
function resetTheme () {
  window.utools.dbStorage.setItem(THEME_KEY, { primaryColor: null })
  return true
}

// ===== 项目历史:会话与记忆只读接口 =====

// 安全的单层名称校验:禁止路径分隔符与上跳
function isSafeSegment (name) {
  return typeof name === 'string' && name.length > 0 &&
    !name.includes('/') && !name.includes('\\') && !name.includes('..')
}

// 校验 dirName 并返回其在 projects 目录下的安全绝对路径;非法返回 null
function getProjectDirSafe (dirName) {
  if (!isSafeSegment(dirName)) return null
  const projectsDir = getProjectsDir()
  const target = path.join(projectsDir, dirName)
  const rel = path.relative(projectsDir, target)
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return null
  return target
}

// 读取文件末尾至多 maxBytes 字节(用于廉价提取会话标题);
// 低层 fd API 不可用时(如测试沙箱)回退到整文件读取
function readFileTail (filePath, maxBytes) {
  if (typeof fs.openSync === 'function' && typeof fs.readSync === 'function' && typeof fs.fstatSync === 'function') {
    let fd
    try {
      fd = fs.openSync(filePath, 'r')
      const size = fs.fstatSync(fd).size
      const start = Math.max(0, size - maxBytes)
      const len = size - start
      if (len <= 0) return ''
      const buf = Buffer.alloc(len)
      fs.readSync(fd, buf, 0, len, start)
      return buf.toString('utf-8')
    } catch (_) {
      // 回退到整文件读取
    } finally {
      if (fd !== undefined) { try { fs.closeSync(fd) } catch (_) { /* 忽略 */ } }
    }
  }
  try { return fs.readFileSync(filePath, 'utf-8') } catch (_) { return '' }
}

// 移除本地命令噪声包装(仅用于展示/标题预览)
function stripCommandNoise (text) {
  if (typeof text !== 'string') return ''
  return text
    .replace(/<local-command-caveat>[\s\S]*?<\/local-command-caveat>/g, '')
    .replace(/<command-message>[\s\S]*?<\/command-message>/g, '')
    .replace(/<command-name>[\s\S]*?<\/command-name>/g, '')
    .replace(/<command-args>[\s\S]*?<\/command-args>/g, '')
    .trim()
}

// 从消息对象提取纯文本(content 可能为字符串或内容块数组)
function messageText (message) {
  if (!message) return ''
  const c = message.content
  if (typeof c === 'string') return c
  if (Array.isArray(c)) {
    return c.filter(b => b && b.type === 'text' && typeof b.text === 'string')
      .map(b => b.text).join('\n')
  }
  return ''
}

// 从尾部文本提取标题:最后一条 ai-title 的 aiTitle
function titleFromTail (tailText) {
  const lines = tailText.split(/\r?\n/)
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]
    if (!line || line.indexOf('"ai-title"') === -1) continue
    try {
      const d = JSON.parse(line)
      if (d && d.type === 'ai-title' && d.aiTitle) return d.aiTitle
    } catch (_) { /* 跳过半行 */ }
  }
  return ''
}

// 从头部文本提取回退标题:首条真实用户消息
function titleFromHead (headText) {
  const lines = headText.split(/\r?\n/)
  for (const line of lines) {
    if (!line || line.indexOf('"user"') === -1) continue
    try {
      const d = JSON.parse(line)
      if (!d || d.type !== 'user' || d.isMeta) continue
      const cleaned = stripCommandNoise(messageText(d.message))
      if (cleaned) return cleaned.replace(/\s+/g, ' ').slice(0, 80)
    } catch (_) { /* 跳过 */ }
  }
  return ''
}

// 列出某项目的历史会话(摘要),按最近修改时间降序
function listProjectSessions (dirName) {
  const projectDir = getProjectDirSafe(dirName)
  if (!projectDir) return []
  let names = []
  try {
    names = fs.readdirSync(projectDir, { withFileTypes: true })
      .filter(f => f.isFile() && f.name.endsWith('.jsonl'))
      .map(f => f.name)
  } catch (_) { return [] }

  const sessions = []
  for (const name of names) {
    const filePath = path.join(projectDir, name)
    let mtime = 0
    let size = 0
    try { const st = fs.statSync(filePath); mtime = st.mtimeMs; size = st.size || 0 } catch (_) { /* 忽略 */ }
    const tail = readFileTail(filePath, 256 * 1024)
    let title = titleFromTail(tail)
    if (!title) {
      // 尾部无 ai-title:读整文件找首条用户消息作为回退
      let head = tail
      try { head = fs.readFileSync(filePath, 'utf-8') } catch (_) { /* 用 tail */ }
      title = titleFromHead(head)
    }
    sessions.push({ sessionId: name.replace(/\.jsonl$/, ''), title, mtime, size })
  }
  sessions.sort((a, b) => b.mtime - a.mtime)
  return sessions
}

// 极简 frontmatter 解析:顶层 key: value + metadata 下一层缩进键
function parseMemoryFrontmatter (fmText) {
  const fm = { metadata: {} }
  let inMeta = false
  for (const raw of fmText.split(/\r?\n/)) {
    if (!raw.trim()) continue
    const indented = /^\s/.test(raw)
    const line = raw.trim()
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    const val = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '')
    if (!indented && key === 'metadata') { inMeta = true; fm.metadata = {}; continue }
    if (indented && inMeta) { fm.metadata[key] = val; continue }
    inMeta = false
    fm[key] = val
  }
  return fm
}

// 拆分记忆 markdown 的 frontmatter 与正文
function splitFrontmatter (content) {
  const text = typeof content === 'string' ? content.replace(/^﻿/, '') : ''
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!m) return { frontmatter: { metadata: {} }, body: text }
  return { frontmatter: parseMemoryFrontmatter(m[1]), body: m[2] }
}

// 列出某项目的记忆条目(排除索引 MEMORY.md)
function listProjectMemories (dirName) {
  const projectDir = getProjectDirSafe(dirName)
  if (!projectDir) return []
  const memDir = path.join(projectDir, 'memory')
  let names = []
  try {
    if (!fs.existsSync(memDir)) return []
    names = fs.readdirSync(memDir, { withFileTypes: true })
      .filter(f => f.isFile() && f.name.endsWith('.md') && f.name !== 'MEMORY.md')
      .map(f => f.name)
  } catch (_) { return [] }

  const memories = []
  for (const fileName of names) {
    try {
      const content = fs.readFileSync(path.join(memDir, fileName), 'utf-8')
      const { frontmatter } = splitFrontmatter(content)
      const meta = frontmatter.metadata || {}
      memories.push({
        name: frontmatter.name || fileName.replace(/\.md$/, ''),
        description: frontmatter.description || '',
        type: meta.type || '',
        originSessionId: meta.originSessionId || '',
        fileName
      })
    } catch (_) { /* 跳过坏文件 */ }
  }
  return memories
}

// 读取单条记忆 { frontmatter, body }
function readMemory (dirName, fileName) {
  const projectDir = getProjectDirSafe(dirName)
  if (!projectDir) return null
  if (!isSafeSegment(fileName) || !fileName.endsWith('.md')) return null
  try {
    const content = fs.readFileSync(path.join(projectDir, 'memory', fileName), 'utf-8')
    return splitFrontmatter(content)
  } catch (_) { return null }
}

// 工具结果内容归一化为文本
function normalizeToolResult (content) {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map(b => {
      if (typeof b === 'string') return b
      if (b && b.type === 'text') return b.text || ''
      return ''
    }).join('\n')
  }
  return ''
}

// 从 attachment 对象提取可读文本预览
function attachmentText (a) {
  if (!a || typeof a !== 'object') return ''
  for (const key of ['content', 'text', 'stdout', 'message']) {
    if (typeof a[key] === 'string' && a[key].trim()) return a[key]
  }
  const { type, ...rest } = a
  try {
    const s = JSON.stringify(rest)
    return s && s !== '{}' ? s : ''
  } catch (_) { return '' }
}

// 解析斜杠命令用户消息：<command-name> / <command-args> / <command-message>
function parseCommand (text) {
  if (typeof text !== 'string' || text.indexOf('<command-name>') === -1) return null
  const pick = (tag) => {
    const m = text.match(new RegExp('<' + tag + '>([\\s\\S]*?)</' + tag + '>'))
    return m ? m[1].trim() : ''
  }
  const name = pick('command-name')
  if (!name) return null
  return { name, args: pick('command-args'), message: pick('command-message') }
}

// 解析会话 jsonl 文本为有序消息块 + 元信息
function parseSession (content) {
  const blocks = []
  const toolUseById = {}
  const meta = { gitBranch: '', version: '', firstTimestamp: '', lastTimestamp: '', count: 0 }
  const lines = (typeof content === 'string' ? content : '').split(/\r?\n/)
  for (const line of lines) {
    if (!line) continue
    let d
    try { d = JSON.parse(line) } catch (_) { continue }
    if (!d || typeof d !== 'object') continue
    if (!meta.gitBranch && d.gitBranch) meta.gitBranch = d.gitBranch
    if (!meta.version && d.version) meta.version = d.version
    if (d.timestamp) {
      if (!meta.firstTimestamp) meta.firstTimestamp = d.timestamp
      meta.lastTimestamp = d.timestamp
    }
    const type = d.type
    if (type === 'attachment') {
      const a = d.attachment || {}
      blocks.push({
        kind: 'attachment',
        subtype: (a && a.type) || 'attachment',
        text: attachmentText(a),
        sidechain: !!d.isSidechain
      })
      continue
    }
    if (type !== 'user' && type !== 'assistant' && type !== 'system') continue
    if (d.isMeta) continue
    const sidechain = !!d.isSidechain
    const ts = d.timestamp || ''
    if (type === 'system') {
      const text = typeof d.content === 'string' ? d.content : messageText(d.message)
      if (text) { blocks.push({ kind: 'system', text, sidechain, ts }); meta.count++ }
      continue
    }
    const message = d.message
    if (!message) continue
    // 助手消息携带 token 用量与模型，用于对话框辅助信息
    const usage = type === 'assistant' && message.usage ? message.usage : null
    const model = type === 'assistant' ? (message.model || '') : ''
    const c = message.content
    // 用户消息：优先识别斜杠命令（含 command-name 标签）
    if (type === 'user') {
      const rawText = typeof c === 'string'
        ? c
        : (Array.isArray(c) ? c.filter((b) => b && b.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('\n') : '')
      const cmd = parseCommand(rawText)
      if (cmd) { blocks.push({ kind: 'user', command: cmd, text: cmd.args || '', sidechain, ts }); meta.count++; continue }
    }
    if (typeof c === 'string') {
      if (type === 'user') {
        const text = stripCommandNoise(c)
        if (text) { blocks.push({ kind: 'user', text, sidechain, ts }); meta.count++ }
      }
      continue
    }
    if (!Array.isArray(c)) continue
    for (const b of c) {
      if (!b || typeof b !== 'object') continue
      if (b.type === 'text' && b.text) {
        const text = type === 'user' ? stripCommandNoise(b.text) : b.text
        if (text) { blocks.push({ kind: type === 'user' ? 'user' : 'assistant', text, sidechain, ts, usage, model }); meta.count++ }
      } else if (b.type === 'thinking' && (b.thinking || b.text)) {
        blocks.push({ kind: 'thinking', text: b.thinking || b.text, sidechain, ts, usage, model }); meta.count++
      } else if (b.type === 'tool_use') {
        const blk = { kind: 'tool_use', id: b.id || '', name: b.name || '', input: b.input, result: null, sidechain, ts, usage, model }
        if (b.id) toolUseById[b.id] = blk
        blocks.push(blk); meta.count++
      } else if (b.type === 'tool_result') {
        const text = normalizeToolResult(b.content)
        const target = b.tool_use_id ? toolUseById[b.tool_use_id] : null
        if (target) {
          target.result = { text, isError: !!b.is_error }
        } else {
          blocks.push({ kind: 'tool_result', text, isError: !!b.is_error, sidechain, ts }); meta.count++
        }
      }
    }
  }
  return { blocks, meta }
}

// 读取并解析单个会话 { blocks, meta }
function readSession (dirName, sessionId) {
  const projectDir = getProjectDirSafe(dirName)
  if (!projectDir) return null
  if (!isSafeSegment(sessionId)) return null
  try {
    const content = fs.readFileSync(path.join(projectDir, sessionId + '.jsonl'), 'utf-8')
    return parseSession(content)
  } catch (_) { return null }
}

function safeStringify (v) {
  if (typeof v === 'string') return v
  try { return JSON.stringify(v, null, 2) } catch (_) { return String(v) }
}

// 整条仅为中断标记 → 取消通知
function isInterruptOnly (text) {
  return /^\s*\[Request interrupted by user[^\]]*\]\s*$/.test(text || '')
}
function stripInterrupt (text) {
  return (text || '').replace(/\[Request interrupted by user[^\]]*\]/g, '').replace(/[ \t]{2,}/g, ' ').trim()
}

// 逐行 diff（带 +/-/空格 前缀，供 ```diff 代码块）
function lineDiffText (oldStr, newStr) {
  const a = (oldStr || '').split('\n'); const b = (newStr || '').split('\n')
  const m = a.length; const n = b.length
  if (m * n > 200000) return [...a.map((t) => '-' + t), ...b.map((t) => '+' + t)].join('\n')
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const out = []; let i = 0; let j = 0
  while (i < m && j < n) { if (a[i] === b[j]) { out.push(' ' + a[i]); i++; j++ } else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push('-' + a[i]); i++ } else { out.push('+' + b[j]); j++ } }
  while (i < m) { out.push('-' + a[i]); i++ }
  while (j < n) { out.push('+' + b[j]); j++ }
  return out.join('\n')
}

// 输出一个 Claude 内容块到 markdown 行数组
function mdClaudeBlock (out, c) {
  if (c.kind === 'assistant') {
    out.push(c.text, '')
  } else if (c.kind === 'thinking') {
    out.push('<details>', '<summary>💭 思考</summary>', '', '> ' + String(c.text).replace(/\n/g, '\n> '), '', '</details>', '')
  } else if (c.kind === 'tool_use') {
    const desc = c.input && c.input.description ? ' — ' + c.input.description : ''
    out.push('**🔧 ' + (c.name || '工具') + '**' + desc, '')
    if (c.name === 'Edit' && c.input && typeof c.input.old_string === 'string' && typeof c.input.new_string === 'string') {
      out.push('```diff', lineDiffText(c.input.old_string, c.input.new_string), '```')
    } else if (c.input && typeof c.input.command === 'string') {
      out.push('```bash', c.input.command, '```')
    } else if (c.input !== undefined) {
      out.push('```json', safeStringify(c.input), '```')
    }
    if (c.result) {
      out.push('', c.result.isError ? '_结果（错误）_' : '_结果_', '```', c.result.text, '```')
    }
    out.push('')
  } else if (c.kind === 'tool_result') {
    out.push('```', c.text, '```', '')
  } else if (c.kind === 'system') {
    out.push('> 系统：' + c.text, '')
  } else if (c.kind === 'attachment') {
    out.push('`附件 · ' + c.subtype + '`', '')
  }
}

// 将解析后的会话格式化为 Markdown 对话稿（按用户 / Claude 回合分组）
function sessionToMarkdown (parsed, sessionId) {
  if (!parsed) return ''
  const { blocks, meta } = parsed
  const out = ['# 会话记录']
  const metaBits = []
  if (sessionId) metaBits.push('`' + sessionId + '`')
  if (meta.gitBranch) metaBits.push('分支 ' + meta.gitBranch)
  if (meta.version) metaBits.push('v' + meta.version)
  if (meta.firstTimestamp) metaBits.push(meta.firstTimestamp)
  if (metaBits.length) out.push('> ' + metaBits.join(' · '))
  out.push('')

  let i = 0
  const n = blocks.length
  while (i < n) {
    const b = blocks[i]
    if (b.kind === 'user') {
      if (isInterruptOnly(b.text)) { out.push('> ⊘ 用户已取消', ''); i++; continue }
      out.push('## 👤 用户', '')
      if (b.command) {
        out.push('```', b.command.name + (b.command.args ? ' ' + b.command.args : ''), '```', '')
      } else {
        out.push(stripInterrupt(b.text) || b.text, '')
      }
      i++
    } else {
      out.push('## 🤖 Claude', '')
      while (i < n && blocks[i].kind !== 'user') { mdClaudeBlock(out, blocks[i]); i++ }
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

// 导出会话为 Markdown 字符串
function exportSession (dirName, sessionId) {
  const parsed = readSession(dirName, sessionId)
  if (!parsed) return null
  return sessionToMarkdown(parsed, sessionId)
}

// 写入任意文本到用户选择的文件（用于 HTML 导出）
function writeTextFile (filePath, content) {
  try {
    if (!filePath || typeof filePath !== 'string') return { success: false, error: '保存路径无效' }
    fs.writeFileSync(filePath, typeof content === 'string' ? content : String(content), { encoding: 'utf-8' })
    return { success: true }
  } catch (err) {
    return { success: false, error: err && err.message ? err.message : String(err) }
  }
}

// 导出会话 Markdown 并写入用户选择的文件(另存为)
function exportSessionToFile (dirName, sessionId, filePath) {
  try {
    if (!filePath || typeof filePath !== 'string') return { success: false, error: '保存路径无效' }
    const md = exportSession(dirName, sessionId)
    if (md === null) return { success: false, error: '会话读取失败' }
    fs.writeFileSync(filePath, md, { encoding: 'utf-8' })
    return { success: true }
  } catch (err) {
    return { success: false, error: err && err.message ? err.message : String(err) }
  }
}

// 在终端中恢复指定会话(claude --resume <id>),复用启动器终端配置
function resumeSession (cwd, sessionId) {
  if (!cwd) return { success: false, error: '项目工作目录为空' }
  if (typeof sessionId !== 'string' || !sessionId) return { success: false, error: '会话标识无效' }
  const settings = getLauncherSettings()
  return launchProject(cwd, 'claude --resume ' + sessionId, {
    powershellPath: settings.powershellPath,
    terminalType: settings.terminalType
  })
}

// 通过 window 对象向渲染进程注入 nodejs 能力
window.services = {
  // ===== Claude Code 项目启动器 =====

  // 列出 Claude Code 项目（已排序）
  listClaudeProjects,

  // 读取项目当前 git 分支（解析 .git/HEAD）
  readGitBranch,

  // 删除 Claude Code 项目记录目录（用于清理工作目录已不存在的失效项目）
  deleteClaudeProject,

  // 启动项目：在终端中以配置命令打开
  launchProject,

  // 检查路径是否存在（用于配置界面校验）
  pathExists (p) {
    try { return !!p && fs.existsSync(p) } catch (_) { return false }
  },

  // ===== 项目历史：会话与记忆只读接口 =====

  // 列出某项目的历史会话摘要（标题 + 时间）
  listProjectSessions,

  // 列出某项目的记忆条目
  listProjectMemories,

  // 读取单条记忆 { frontmatter, body }
  readMemory,

  // 读取并解析单个会话 { blocks, meta }
  readSession,

  // 解析会话文本 / 格式化为 Markdown（导出复用）
  parseSession,
  sessionToMarkdown,

  // 导出会话为 Markdown 字符串
  exportSession,

  // 导出会话并另存为文件
  exportSessionToFile,

  // 写入任意文本文件（HTML 导出）
  writeTextFile,

  // 在终端中恢复指定会话（claude --resume <id>）
  resumeSession,

  // ===== Claude config file I/O =====

  getClaudeConfigPath () {
    return loadClaudeConfigHelpers().getClaudeConfigPath()
  },

  readClaudeConfigFile () {
    return loadClaudeConfigHelpers().readClaudeConfigFile()
  },

  backupClaudeConfigFile () {
    return loadClaudeConfigHelpers().backupClaudeConfigFile()
  },

  saveClaudeConfigFile (nextData) {
    return loadClaudeConfigHelpers().writeClaudeConfigFile(nextData)
  },

  // ===== 启动器设置（v2 列表模型） =====

  // 读取派生运行时设置 + 完整模型
  getLauncherSettings,

  // 启动命令项管理
  setSelectedLaunchId,
  addLaunchCommand,
  updateLaunchCommand,
  deleteLaunchCommand,

  // 终端项管理
  setSelectedTerminalId,
  addTerminal,
  updateTerminal,
  deleteTerminal,
  setTerminalPathOverride,
  clearTerminalPathOverride,

  // ===== ccrun 命令管理器 =====

  // 获取所有命令（内置 + 覆盖层 + 自定义）
  getAllCommands,

  // 自定义命令
  getCustomCommands,
  addCustomCommand,
  updateCustomCommand,
  deleteCustomCommand,

  // 内置命令覆盖层
  updateBuiltinCommand,
  deleteBuiltinCommand,
  resetBuiltinCommand,

  // 保存最后使用的项目目录
  saveLastProjectDir,

  // 获取最后使用的项目目录
  getLastUsedProjectDir,

  // 执行 ccrun 命令（在预加载层解析工作目录）
  runCommand,

  // ===== 主题配置 =====

  // 默认主色与预设色（供配置界面与测试使用）
  DEFAULT_PRIMARY,
  PRESET_PRIMARIES,

  // 主题读写与派生
  getThemeSettings,
  setThemeColor,
  resetTheme,
  deriveHover,
  isValidHex
}
