const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')

// 自含加载：在沙箱中执行 services.js，注入可控的 utools.dbStorage
function loadServices ({ platform = 'win32', store = {} } = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'preload', 'services.js'), 'utf8')
  const sandbox = {
    require (id) {
      if (id === 'node:fs') {
        return { existsSync: () => true, readdirSync: fs.readdirSync, readFileSync: fs.readFileSync, statSync: fs.statSync, writeFileSync: fs.writeFileSync }
      }
      if (id === 'node:path') return path
      if (id === 'node:os') return { homedir: () => 'C:\\Users\\tester' }
      if (id === 'node:child_process') return { spawn () { return { unref () {} } } }
      throw new Error(`Unexpected require: ${id}`)
    },
    process: { platform, env: { ProgramFiles: 'C:\\Program Files', SystemRoot: 'C:\\Windows' } },
    window: {
      utools: {
        dbStorage: {
          getItem: (k) => (k in store ? store[k] : null),
          setItem: (k, v) => { store[k] = v }
        }
      }
    }
  }
  vm.runInNewContext(source, sandbox, { filename: 'services.js' })
  return { services: sandbox.window.services, store }
}

const SKIN_KEY = 'cctheme.readingSkin'

test('getReadingSkin 无记录时默认 system', () => {
  const { services } = loadServices()
  assert.equal(services.getReadingSkin(), 'system')
})

test('getReadingSkin 读回已持久化的合法皮肤', () => {
  const store = { [SKIN_KEY]: 'ocean' }
  const { services } = loadServices({ store })
  assert.equal(services.getReadingSkin(), 'ocean')
})

test('getReadingSkin 对未知/非法值降级为 system', () => {
  for (const bad of ['neon', '', null, 42, {}]) {
    const { services } = loadServices({ store: { [SKIN_KEY]: bad } })
    assert.equal(services.getReadingSkin(), 'system')
  }
})

test('setReadingSkin 持久化合法皮肤并读回', () => {
  const store = {}
  const { services } = loadServices({ store })
  assert.equal(services.setReadingSkin('sepia'), true)
  assert.equal(store[SKIN_KEY], 'sepia')
  assert.equal(services.getReadingSkin(), 'sepia')
})

test('setReadingSkin 接受全部 6 个已知皮肤', () => {
  for (const id of ['system', 'light', 'dark', 'sepia', 'ocean', 'forest']) {
    const { services } = loadServices()
    assert.equal(services.setReadingSkin(id), true)
  }
})

test('setReadingSkin 拒绝非法皮肤且不写入', () => {
  const store = {}
  const { services } = loadServices({ store })
  assert.equal(services.setReadingSkin('rainbow'), false)
  assert.equal(SKIN_KEY in store, false)
  assert.equal(services.getReadingSkin(), 'system')
})

test('阅读皮肤与主色互不干扰（独立键）', () => {
  const store = {}
  const { services } = loadServices({ store })
  services.setThemeColor('#123abc')
  services.setReadingSkin('forest')
  // 两个键各自独立，互不覆盖
  assert.equal(store['cctheme.settings'].primaryColor, '#123abc')
  assert.equal(store[SKIN_KEY], 'forest')
  assert.equal(services.getThemeSettings().primaryColor, '#123abc')
  assert.equal(services.getReadingSkin(), 'forest')
})
