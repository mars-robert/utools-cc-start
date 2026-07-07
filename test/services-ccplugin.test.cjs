/**
 * @file 测试 ccplugin 只读服务：listInstalledPlugins / listKnownMarketplaces / listMarketplacePlugins
 *   覆盖正常合并、文件缺失、坏 JSON 的降级行为。
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { loadPreload } = require('./helpers/load-preload.cjs')

const HOME = 'C:\\Users\\tester'
const PLUGINS = path.join(HOME, '.claude', 'plugins')
const SETTINGS = path.join(HOME, '.claude', 'settings.json')

// 用一张 { 绝对路径 -> 内容字符串 } 表驱动 readFile；未命中即抛 ENOENT（模拟缺失）
function envWithFiles (files) {
  const readFile = (p) => {
    const key = path.resolve(p)
    for (const f of Object.keys(files)) {
      if (path.resolve(f) === key) return files[f]
    }
    throw new Error('ENOENT ' + p)
  }
  return loadPreload({ platform: 'win32', homedir: HOME, readFile })
}

test('listInstalledPlugins: 合并 installed_plugins 与 enabledPlugins', () => {
  const { services } = envWithFiles({
    [path.join(PLUGINS, 'installed_plugins.json')]: JSON.stringify({
      version: 2,
      plugins: {
        'alpha@mp-one': [{ scope: 'user', version: '1.2.3' }],
        'beta@mp-two': [{ scope: 'user', version: '0.9.0' }]
      }
    }),
    [SETTINGS]: JSON.stringify({ enabledPlugins: { 'alpha@mp-one': true } })
  })
  const list = services.listInstalledPlugins()
  assert.equal(list.length, 2)
  // 按 name 升序：alpha 在 beta 之前
  assert.equal(list[0].id, 'alpha@mp-one')
  assert.equal(list[0].name, 'alpha')
  assert.equal(list[0].marketplace, 'mp-one')
  assert.equal(list[0].version, '1.2.3')
  assert.equal(list[0].enabled, true)
  assert.equal(list[1].name, 'beta')
  assert.equal(list[1].enabled, false) // 不在 enabledPlugins 中
})

test('listInstalledPlugins: 文件缺失时降级为空数组', () => {
  const { services } = envWithFiles({}) // 无任何文件
  assert.deepEqual([...services.listInstalledPlugins()], [])
})

test('listInstalledPlugins: 坏 JSON 时降级为空数组', () => {
  const { services } = envWithFiles({
    [path.join(PLUGINS, 'installed_plugins.json')]: '{ this is not json',
    [SETTINGS]: 'also broken'
  })
  assert.deepEqual([...services.listInstalledPlugins()], [])
})

test('listKnownMarketplaces: 合并 known_marketplaces 与 extraKnownMarketplaces（含插件数）', () => {
  const { services } = envWithFiles({
    [path.join(PLUGINS, 'known_marketplaces.json')]: JSON.stringify({
      'mp-one': { source: { source: 'github', repo: 'owner/repo' }, installLocation: 'C:\\x', lastUpdated: '2026-01-01' }
    }),
    [SETTINGS]: JSON.stringify({
      extraKnownMarketplaces: { 'mp-two': { source: { source: 'git', url: 'https://example.com/x.git' } } }
    }),
    // mp-one 清单已克隆到本地 → pluginCount 应为 2；mp-two 无清单 → 0
    [path.join(PLUGINS, 'marketplaces', 'mp-one', '.claude-plugin', 'marketplace.json')]: JSON.stringify({
      name: 'mp-one', plugins: [{ name: 'a' }, { name: 'b' }]
    })
  })
  const list = services.listKnownMarketplaces()
  assert.equal(list.length, 2)
  const one = list.find((m) => m.name === 'mp-one')
  const two = list.find((m) => m.name === 'mp-two')
  assert.equal(one.sourceLabel, 'owner/repo')
  assert.equal(one.installLocation, 'C:\\x')
  assert.equal(one.pluginCount, 2)
  assert.equal(two.sourceLabel, 'https://example.com/x.git')
  assert.equal(two.pluginCount, 0)
})

test('listKnownMarketplaces: 全部缺失时降级为空数组', () => {
  const { services } = envWithFiles({})
  assert.deepEqual([...services.listKnownMarketplaces()], [])
})

test('listMarketplacePlugins: 读取 marketplace.json 并标记已安装', () => {
  const mp = 'official'
  const { services } = envWithFiles({
    [path.join(PLUGINS, 'installed_plugins.json')]: JSON.stringify({
      plugins: { 'p1@official': [{ version: '1.0.0' }] }
    }),
    [SETTINGS]: JSON.stringify({}),
    [path.join(PLUGINS, 'marketplaces', mp, '.claude-plugin', 'marketplace.json')]: JSON.stringify({
      name: mp,
      plugins: [
        { name: 'p1', description: 'first', author: { name: 'Alice' }, category: 'tools', source: {} },
        { name: 'p2', description: 'second', author: 'Bob', category: 'ui', source: {} }
      ]
    })
  })
  const list = services.listMarketplacePlugins(mp)
  assert.equal(list.length, 2)
  const p1 = list.find((p) => p.name === 'p1')
  const p2 = list.find((p) => p.name === 'p2')
  assert.equal(p1.installed, true)
  assert.equal(p1.author, 'Alice') // 对象作者取 .name
  assert.equal(p2.installed, false)
  assert.equal(p2.author, 'Bob') // 字符串作者原样
})

test('listMarketplacePlugins: 清单缺失返回空数组', () => {
  const { services } = envWithFiles({})
  assert.deepEqual([...services.listMarketplacePlugins('whatever')], [])
})

test('listMarketplacePlugins: 非法商城名返回空数组', () => {
  const { services } = envWithFiles({})
  assert.deepEqual([...services.listMarketplacePlugins('../evil')], [])
})
