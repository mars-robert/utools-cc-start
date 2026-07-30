const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')

function loadServices ({ platform = 'win32', exists = () => true, store = {} } = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'preload', 'services.js'), 'utf8')
  const spawns = []
  const sandbox = {
    require (id) {
      if (id === 'node:fs') {
        return {
          existsSync: exists,
          readdirSync: fs.readdirSync,
          readFileSync: fs.readFileSync,
          statSync: fs.statSync,
          writeFileSync: fs.writeFileSync
        }
      }
      if (id === 'node:path') return path
      if (id === 'node:os') return { homedir: () => 'C:\\Users\\tester' }
      if (id === 'node:child_process') {
        return {
          spawn (command, args, options) {
            spawns.push({ command, args, options })
            return { unref () {} }
          }
        }
      }
      if (id === './env-config-new.js') return {}
      throw new Error(`Unexpected require: ${id}`)
    },
    process: {
      platform,
      env: {
        ProgramFiles: 'C:\\Program Files',
        SystemRoot: 'C:\\Windows'
      }
    },
    window: {
      utools: {
        dbStorage: {
          getItem: (k) => (k in store ? store[k] : null),
          setItem: (k, v) => { store[k] = v }
        },
        getPath: () => 'C:\\Users\\tester\\Downloads'
      }
    }
  }

  vm.runInNewContext(source, sandbox, { filename: 'services.js' })
  return { services: sandbox.window.services, spawns, store }
}

test('launchProject starts Windows Terminal with -d working directory and a direct PowerShell command', () => {
  const cwd = 'D:\\code\\demo project'
  const { services, spawns } = loadServices({
    exists: (p) => p === cwd || String(p).toLowerCase().includes('powershell')
  })

  const result = services.launchProject(cwd, ' claude ', {
    powershellPath: 'C:\\terminal-1.24.10921.0\\WindowsTerminal.exe'
  })

  assert.equal(result.success, true)
  assert.equal(spawns.length, 1)
  assert.equal(spawns[0].command, 'C:\\terminal-1.24.10921.0\\WindowsTerminal.exe')
  assert.deepEqual(Array.from(spawns[0].args), [
    '-d',
    cwd,
    'powershell.exe',
    '-NoExit',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    'claude'
  ])
})

test('getLauncherSettings returns builtin presets with defaults', () => {
  const { services } = loadServices()
  const s = services.getLauncherSettings()
  assert.equal(s.launchCommands.length, 2)
  assert.deepEqual(Array.from(s.launchCommands, (command) => command.id), ['lc-claude', 'lc-skip'])
  assert.equal(s.terminals.length, 4)
  assert.equal(s.launchCommand, 'claude')
  assert.equal(s.codexLaunchCommand, 'codex')
  assert.equal(s.selectedLaunchId, 'lc-claude')
  assert.equal(s.codexLaunchCommands.length, 1)
  assert.equal(s.selectedCodexLaunchId, 'clc-codex')
  assert.equal(s.codexLaunchCommands[0].builtin, true)
  assert.equal(s.terminalType, 'powershell')
})

test('migrates legacy settings into v2 list model', () => {
  const store = {
    'ccstart.settings': { launchCommand: 'claude --resume', powershellPath: 'C:\\my\\wt.exe' }
  }
  const { services } = loadServices({ store })
  const s = services.getLauncherSettings()
  assert.equal(s.launchCommand, 'claude --resume')
  assert.equal(s.selectedLaunchId, 'lc-custom-legacy')
  assert.equal(s.terminalType, 'wt')
})

test('existing v2 Claude settings without a Codex command fall back to codex', () => {
  const store = {
    'ccstart.settings': {
      version: 2,
      customLaunchCommands: [],
      selectedLaunchId: 'lc-claude',
      customTerminals: [],
      selectedTerminalId: 'bt-powershell',
      terminalPathOverrides: {}
    }
  }
  const { services } = loadServices({ store })
  assert.equal(services.getLauncherSettings().codexLaunchCommand, 'codex')
})

test('custom launch commands can be added, selected, and deleted', () => {
  const { services } = loadServices()
  const created = services.addLaunchCommand({ label: 'Foo', command: 'claude --foo' })
  services.setSelectedLaunchId(created.id)
  let s = services.getLauncherSettings()
  assert.equal(s.launchCommand, 'claude --foo')
  assert.equal(s.launchCommands.length, 3)
  // builtin cannot be deleted
  assert.equal(services.deleteLaunchCommand('lc-claude'), false)
  // custom can be deleted, selection falls back
  assert.equal(services.deleteLaunchCommand(created.id), true)
  s = services.getLauncherSettings()
  assert.equal(s.launchCommands.length, 2)
  assert.equal(s.selectedLaunchId, 'lc-claude')
})

test('Codex launch command cards are managed independently', () => {
  const store = {}
  const { services } = loadServices({ store })
  const created = services.addCodexLaunchCommand({ label: 'Codex Search', command: 'codex --search' })
  services.setSelectedCodexLaunchId(created.id)
  let s = services.getLauncherSettings()
  assert.equal(s.codexLaunchCommand, 'codex --search')
  assert.equal(s.selectedCodexLaunchId, created.id)
  assert.equal(s.codexLaunchCommands.length, 2)
  assert.equal(s.launchCommand, 'claude')
  assert.equal(store['cxstart.settings'].selectedLaunchId, created.id)
  assert.equal(store['ccstart.settings'], undefined)

  services.updateCodexLaunchCommand(created.id, { label: 'Full Auto', command: 'codex --full-auto' })
  s = services.getLauncherSettings()
  assert.equal(s.codexLaunchCommand, 'codex --full-auto')
  assert.equal(s.codexLaunchCommands[1].label, 'Full Auto')

  assert.equal(services.deleteCodexLaunchCommand('clc-codex'), false)
  assert.equal(services.deleteCodexLaunchCommand(created.id), true)
  s = services.getLauncherSettings()
  assert.equal(s.codexLaunchCommand, 'codex')
  assert.equal(s.selectedCodexLaunchId, 'clc-codex')
  assert.equal(s.codexLaunchCommands.length, 1)
})

test('legacy independent Codex command migrates to a selected custom card', () => {
  const store = {
    'cxstart.settings': { version: 1, launchCommand: 'codex --search' }
  }
  const { services } = loadServices({ store })
  const s = services.getLauncherSettings()
  assert.equal(s.codexLaunchCommand, 'codex --search')
  assert.equal(s.codexLaunchCommands.length, 2)
  assert.equal(s.selectedCodexLaunchId, 'clc-custom-legacy')
})

test('legacy shared cx default migrates to the independent codex default', () => {
  const store = {
    'ccstart.settings': {
      version: 2,
      customLaunchCommands: [],
      selectedLaunchId: 'lc-claude',
      codexLaunchCommand: 'cx',
      customTerminals: [],
      selectedTerminalId: 'bt-powershell',
      terminalPathOverrides: {}
    }
  }
  const { services } = loadServices({ store })
  const s = services.getLauncherSettings()
  assert.equal(s.codexLaunchCommand, 'codex')
  assert.equal(s.launchCommand, 'claude')
})

test('builtin command overrides: edit, delete, reset', () => {
  const { services } = loadServices()
  const base = services.getAllCommands().length
  services.updateBuiltinCommand('git-status', { name: '改名' })
  let all = services.getAllCommands()
  const gs = all.find((c) => c.id === 'git-status')
  assert.equal(gs.name, '改名')
  assert.equal(gs.modified, true)
  services.deleteBuiltinCommand('git-pull')
  assert.equal(services.getAllCommands().length, base - 1)
  services.resetBuiltinCommand('git-pull')
  services.resetBuiltinCommand('git-status')
  all = services.getAllCommands()
  assert.equal(all.length, base)
  assert.equal(all.find((c) => c.id === 'git-status').name, 'Git 状态')
})

test('CMD terminal type launches a new cmd window', () => {
  const cwd = 'D:\\proj'
  const { services, spawns } = loadServices({ exists: (p) => p === cwd })
  const result = services.launchProject(cwd, 'claude', { terminalType: 'cmd', powershellPath: '' })
  assert.equal(result.success, true)
  assert.equal(spawns[0].command, 'cmd.exe')
  assert.equal(spawns[0].args[0], '/c')
  assert.equal(spawns[0].args[1], 'start')
  assert.ok(spawns[0].args.includes('/k'))
})

test('builtin terminal path can be overridden and reset', () => {
  const { services } = loadServices()
  const before = services.getLauncherSettings().terminals.find((t) => t.id === 'bt-powershell')
  assert.ok(before.resolvedPath.toLowerCase().includes('powershell.exe'))

  // 覆盖路径
  assert.equal(services.setTerminalPathOverride('bt-powershell', 'C:\\custom\\ps.exe'), true)
  const after = services.getLauncherSettings().terminals.find((t) => t.id === 'bt-powershell')
  assert.equal(after.resolvedPath, 'C:\\custom\\ps.exe')

  // 自定义 id 不可覆盖（仅预设）
  assert.equal(services.setTerminalPathOverride('bt-custom-x', 'C:\\x.exe'), false)

  // 恢复默认
  services.clearTerminalPathOverride('bt-powershell')
  const reset = services.getLauncherSettings().terminals.find((t) => t.id === 'bt-powershell')
  assert.ok(reset.resolvedPath.toLowerCase().includes('powershell.exe'))
})

test('overridden terminal path is used at launch time', () => {
  const cwd = 'D:\\proj'
  const { services, spawns } = loadServices({ exists: (p) => p === cwd })
  services.setTerminalPathOverride('bt-powershell', 'C:\\custom\\ps.exe')
  services.setSelectedTerminalId('bt-powershell')
  const s = services.getLauncherSettings()
  const result = services.launchProject(cwd, s.launchCommand, {
    powershellPath: s.powershellPath,
    terminalType: s.terminalType
  })
  assert.equal(result.success, true)
  // powershell 分支：cmd.exe /c start "" <psPath> ...
  assert.ok(spawns[0].args.includes('C:\\custom\\ps.exe'))
})
