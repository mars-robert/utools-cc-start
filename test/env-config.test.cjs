const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const vm = require('node:vm')

// 每个测试用独立的临时目录
function createTestEnvConfig() {
  const testDir = path.join(os.tmpdir(), 'env-config-test-' + Date.now() + '-' + Math.random().toString(36).slice(2))
  fs.mkdirSync(path.join(testDir, '.claude'), { recursive: true })

  const source = fs.readFileSync(path.join(__dirname, '../public/preload/env-config.js'), 'utf8')
  const moduleObject = { exports: {} }
  const sandbox = {
    module: moduleObject,
    exports: moduleObject.exports,
    console,
    require(id) {
      if (id === 'node:os') return { ...os, homedir: () => testDir }
      return require(id)
    }
  }
  vm.runInNewContext(source, sandbox, { filename: 'env-config.js' })

  return {
    ...moduleObject.exports,
    _testDir: testDir
  }
}

test('env-config module', async (t) => {
  const allTestDirs = []

  await t.afterEach(() => {
    // 清理所有测试目录
    allTestDirs.forEach(dir => {
      try {
        if (fs.existsSync(dir)) {
          fs.rmSync(dir, { recursive: true, force: true })
        }
      } catch (_) { /* ignore */ }
    })
  })

  await t.test('defaultEnvConfigs 包含内置环境', () => {
    const envConfig = createTestEnvConfig()
    allTestDirs.push(envConfig._testDir)

    const defaults = envConfig.defaultEnvConfigs()

    assert.strictEqual(defaults.version, 1)
    assert.strictEqual(defaults.activeId, null)
    assert.strictEqual(defaults.managedKeys.length, 0)
    assert.strictEqual(defaults.configs.length, 1)
    assert.strictEqual(defaults.configs[0].id, 'builtin-official')
    assert.strictEqual(defaults.configs[0].name, '官方 Anthropic')
    assert.strictEqual(defaults.configs[0].builtin, true)
  })

  await t.test('读取缺失文件降级为默认配置', () => {
    const envConfig = createTestEnvConfig()
    allTestDirs.push(envConfig._testDir)

    const result = envConfig.readEnvConfigsFile()

    // 文件不存在时降级为默认配置
    assert.strictEqual(result.data.version, 1)
    assert.strictEqual(result.data.configs.length, 1)
    assert.strictEqual(result.data.configs[0].id, 'builtin-official')
    assert.strictEqual(result.parseError, null)
  })

  await t.test('写入成功后可以读取', () => {
    const envConfig = createTestEnvConfig()
    allTestDirs.push(envConfig._testDir)

    const data = envConfig.defaultEnvConfigs()
    data.configs.push({
      id: 'test-1',
      name: 'Test Env',
      baseUrl: 'https://test.com',
      token: 'sk-test'
    })

    // 写入
    const writeResult = envConfig.writeEnvConfigsFile(data)
    assert.strictEqual(writeResult.success, true)

    // 读取验证
    const readResult = envConfig.readEnvConfigsFile()
    assert.strictEqual(readResult.data.configs.length, 2)
    assert.strictEqual(readResult.data.configs[1].name, 'Test Env')
  })

  await t.test('applyEnvConfig 正确清理 managedKeys 并写入新键', async () => {
    const envConfig = createTestEnvConfig()
    allTestDirs.push(envConfig._testDir)

    const configsData = envConfig.defaultEnvConfigs()
    configsData.configs.push({
      id: 'test-env-1',
      name: 'Test 1',
      baseUrl: 'https://test1.com',
      token: 'sk-test1',
      model: 'claude-opus-4'
    })
    configsData.configs.push({
      id: 'test-env-2',
      name: 'Test 2',
      baseUrl: 'https://test2.com',
      token: 'sk-test2',
      model: ''
    })
    envConfig.writeEnvConfigsFile(configsData)

    // 应用第一个环境
    const result1 = envConfig.applyEnvConfig('test-env-1')
    assert.strictEqual(result1.success, true)
    assert.strictEqual(result1.activeId, 'test-env-1')

    // 检查 settings.json
    const settings1 = envConfig.readClaudeSettingsFile()
    assert.strictEqual(settings1.data.env.ANTHROPIC_BASE_URL, 'https://test1.com')
    assert.strictEqual(settings1.data.env.ANTHROPIC_AUTH_TOKEN, 'sk-test1')
    assert.strictEqual(settings1.data.env.ANTHROPIC_MODEL, 'claude-opus-4')

    // 应用第二个环境（无 model）
    const result2 = envConfig.applyEnvConfig('test-env-2')
    assert.strictEqual(result2.success, true)

    // 检查旧的 ANTHROPIC_MODEL 被清理
    const settings2 = envConfig.readClaudeSettingsFile()
    assert.strictEqual(settings2.data.env.ANTHROPIC_BASE_URL, 'https://test2.com')
    assert.strictEqual(settings2.data.env.ANTHROPIC_AUTH_TOKEN, 'sk-test2')
    assert.strictEqual(settings2.data.env.ANTHROPIC_MODEL, undefined)

    // 检查 managedKeys 更新
    const configs2 = envConfig.readEnvConfigsFile()
    assert.strictEqual(configs2.data.managedKeys.length, 2)
    assert.ok(!configs2.data.managedKeys.includes('ANTHROPIC_MODEL'))
  })

  await t.test('删除 builtin 环境失败', () => {
    const envConfig = createTestEnvConfig()
    allTestDirs.push(envConfig._testDir)

    const result = envConfig.deleteEnvConfig('builtin-official')
    assert.strictEqual(result.success, false)
    assert.ok(result.error.includes('内置'))
  })

  await t.test('删除当前激活环境后 activeId 重置为 null', () => {
    const envConfig = createTestEnvConfig()
    allTestDirs.push(envConfig._testDir)

    const newConfig = envConfig.addEnvConfig({
      name: 'To Delete',
      baseUrl: 'https://delete.com',
      token: 'sk-delete'
    })
    envConfig.applyEnvConfig(newConfig.id)

    let configs = envConfig.readEnvConfigsFile()
    assert.strictEqual(configs.data.activeId, newConfig.id)

    const deleteResult = envConfig.deleteEnvConfig(newConfig.id)
    assert.strictEqual(deleteResult.success, true)

    configs = envConfig.readEnvConfigsFile()
    assert.strictEqual(configs.data.activeId, null)
  })

  await t.test('应用不存在的环境返回错误', () => {
    const envConfig = createTestEnvConfig()
    allTestDirs.push(envConfig._testDir)

    const result = envConfig.applyEnvConfig('non-existent-id')
    assert.strictEqual(result.success, false)
    assert.ok(result.error.includes('不存在'))
  })
})
