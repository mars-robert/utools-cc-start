const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')

function loadServices ({ platform = 'win32', exists = () => true } = {}) {
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
          getItem: () => null,
          setItem: () => {}
        },
        getPath: () => 'C:\\Users\\tester\\Downloads'
      }
    }
  }

  vm.runInNewContext(source, sandbox, { filename: 'services.js' })
  return { services: sandbox.window.services, spawns }
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
