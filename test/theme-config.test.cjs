const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')

function loadServices ({ platform = 'win32', store = {} } = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'preload', 'services.js'), 'utf8')
  const sandbox = {
    require (id) {
      if (id === 'node:fs') {
        return {
          existsSync: () => true,
          readdirSync: fs.readdirSync,
          readFileSync: fs.readFileSync,
          statSync: fs.statSync,
          writeFileSync: fs.writeFileSync
        }
      }
      if (id === 'node:path') return path
      if (id === 'node:os') return { homedir: () => 'C:\\Users\\tester' }
      if (id === 'node:child_process') {
        return { spawn () { return { unref () {} } } }
      }
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

test('isValidHex 仅接受 #RRGGBB 格式', () => {
  const { services } = loadServices()
  assert.equal(services.isValidHex('#4f8cff'), true)
  assert.equal(services.isValidHex('#ABCDEF'), true)
  assert.equal(services.isValidHex('#fff'), false)
  assert.equal(services.isValidHex('4f8cff'), false)
  assert.equal(services.isValidHex('#gggggg'), false)
  assert.equal(services.isValidHex(null), false)
  assert.equal(services.isValidHex(123), false)
})

test('deriveHover 对合法色返回压暗版本，对非法输入返回默认色', () => {
  const { services } = loadServices()
  // #ffffff ×0.88 = 224 = 0xe0
  assert.equal(services.deriveHover('#ffffff'), '#e0e0e0')
  // #000000 保持为黑
  assert.equal(services.deriveHover('#000000'), '#000000')
  // 派生结果仍是合法 hex
  assert.equal(services.isValidHex(services.deriveHover('#4f8cff')), true)
  // 非法输入回退默认
  assert.equal(services.deriveHover('nope'), services.DEFAULT_PRIMARY)
})

test('getThemeSettings 默认返回 primaryColor 为 null', () => {
  const { services } = loadServices()
  assert.equal(services.getThemeSettings().primaryColor, null)
})

test('setThemeColor 持久化合法色，getThemeSettings 读回', () => {
  const store = {}
  const { services } = loadServices({ store })
  assert.equal(services.setThemeColor('#123abc'), true)
  assert.equal(services.getThemeSettings().primaryColor, '#123abc')
  assert.equal(store['cctheme.settings'].primaryColor, '#123abc')
})

test('setThemeColor 拒绝非法色且不写入', () => {
  const store = {}
  const { services } = loadServices({ store })
  assert.equal(services.setThemeColor('red'), false)
  assert.equal('cctheme.settings' in store, false)
  assert.equal(services.getThemeSettings().primaryColor, null)
})

test('resetTheme 清除自定义主色', () => {
  const store = { 'cctheme.settings': { primaryColor: '#123abc' } }
  const { services } = loadServices({ store })
  assert.equal(services.getThemeSettings().primaryColor, '#123abc')
  assert.equal(services.resetTheme(), true)
  assert.equal(services.getThemeSettings().primaryColor, null)
})

test('损坏的持久化数据回退为 null', () => {
  const store = { 'cctheme.settings': { primaryColor: 'garbage' } }
  const { services } = loadServices({ store })
  assert.equal(services.getThemeSettings().primaryColor, null)
})

test('DEFAULT_PRIMARY 与 PRESET_PRIMARIES 暴露且合法', () => {
  const { services } = loadServices()
  assert.equal(services.DEFAULT_PRIMARY, '#4f8cff')
  assert.ok(Array.isArray(services.PRESET_PRIMARIES))
  assert.ok(services.PRESET_PRIMARIES.length >= 5)
  for (const c of services.PRESET_PRIMARIES) {
    assert.equal(services.isValidHex(c), true)
  }
  assert.ok(services.PRESET_PRIMARIES.includes(services.DEFAULT_PRIMARY))
})
