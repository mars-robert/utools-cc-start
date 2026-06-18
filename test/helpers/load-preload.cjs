const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

function loadPreload ({
  platform = 'win32',
  homedir = 'C:\\Users\\tester',
  exists = () => true,
  readFile = (p, options) => fs.readFileSync(p, options),
  writeFile = () => {},
  rename = () => {},
  copyFile = () => {},
  mkdir = () => {},
  unlink = () => {},
  stat = (p) => fs.statSync(p),
  readdir = (p, options) => fs.readdirSync(p, options),
  store = {}
} = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'preload', 'services.js'), 'utf8')
  const spawns = []
  const writes = []
  const copies = []
  const renames = []
  const unlinks = []
  const mkdirs = []
  const moduleCache = new Map()

  function loadModule (filePath) {
    if (moduleCache.has(filePath)) return moduleCache.get(filePath).exports

    const source = fs.readFileSync(filePath, 'utf8')
    const module = { exports: {} }
    moduleCache.set(filePath, module)

    const localRequire = (id) => {
      if (id.startsWith('./') || id.startsWith('../')) {
        return loadModule(path.join(path.dirname(filePath), id))
      }
      if (id === 'node:fs') {
        return {
          existsSync: exists,
          readFileSync: (p, options) => readFile(p, options),
          writeFileSync: (p, content, options) => {
            writes.push({ p, content, options })
            return writeFile(p, content, options)
          },
          renameSync: (from, to) => {
            renames.push({ from, to })
            return rename(from, to)
          },
          copyFileSync: (from, to) => {
            copies.push({ from, to })
            return copyFile(from, to)
          },
          mkdirSync: (dir, options) => {
            mkdirs.push({ dir, options })
            return mkdir(dir, options)
          },
          unlinkSync: (p) => {
            unlinks.push({ p })
            return unlink(p)
          },
          readdirSync: readdir,
          statSync: stat
        }
      }
      if (id === 'node:path') return path
      if (id === 'node:os') return { homedir: () => homedir }
      if (id === 'node:child_process') {
        return {
          spawn (command, args, options) {
            spawns.push({ command, args, options })
            return { unref () {} }
          }
        }
      }
      throw new Error(`Unexpected require: ${id}`)
    }

    const wrapped = `(function (require, module, exports, __filename, __dirname) {\n${source}\n})`
    const fn = vm.runInNewContext(wrapped, sandbox, { filename: filePath })
    fn(localRequire, module, module.exports, filePath, path.dirname(filePath))
    return module.exports
  }

  const sandbox = {
    require: (id) => localRequire(id),
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

  loadModule(path.join(__dirname, '..', '..', 'public', 'preload', 'services.js'))
  return {
    services: sandbox.window.services,
    spawns,
    store,
    writes,
    copies,
    renames,
    unlinks,
    mkdirs
  }
}

module.exports = { loadPreload }
