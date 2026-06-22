/**
 * @file 测试 services.js 中的路径解码逻辑（文件系统辅助反编码）
 */

const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

// 从 services.js 提取核心解码函数（避免依赖 window.utools）
function decodeDirName (dirName) {
  let decoded = dirName
  if (process.platform === 'win32') {
    decoded = decoded.replace(/^([A-Za-z])--/, '$1:\\')
    decoded = decoded.replace(/-/g, '\\')
  } else {
    decoded = '/' + decoded.replace(/-/g, '/')
  }
  return decoded
}

function walkFsForPath (current, segments, idx) {
  if (idx === segments.length) return current
  for (let k = 1; idx + k <= segments.length; k++) {
    const subName = segments.slice(idx, idx + k).join('_')
    if (!subName) continue
    const sub = path.join(current, subName)
    try {
      if (fs.existsSync(sub)) {
        const r = walkFsForPath(sub, segments, idx + k)
        if (r) return r
      }
    } catch (_) { /* 忽略 */ }
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

// ===== 测试用例 =====

function test (name, fn) {
  try {
    fn()
    console.log(`✓ ${name}`)
  } catch (err) {
    console.error(`✗ ${name}`)
    console.error('  ', err.message)
    process.exitCode = 1
  }
}

function assertEquals (actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || 'Assertion failed'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

// 测试套件
console.log('\n=== 路径解码测试 ===\n')

// Windows 平台特定测试
if (process.platform === 'win32') {
  test('decodeDirName: 简单路径（无下划线）', () => {
    const encoded = 'D--code-utools-claudecode-claude'
    const decoded = decodeDirName(encoded)
    assertEquals(decoded, 'D:\\code\\utools\\claudecode\\claude')
  })

  test('decodeDirName: 含下划线的路径（有损，会错误还原）', () => {
    const encoded = 'D--code-EPD-GYXX-GY-XQ-XQ-PS-xq-teacher-weex'
    const decoded = decodeDirName(encoded)
    // 字符级还原会把所有 - 都当成路径分隔符
    assertEquals(decoded, 'D:\\code\\EPD\\GYXX\\GY\\XQ\\XQ\\PS\\xq\\teacher\\weex')
  })

  test('tryFsDecodeDirName: 当前项目路径（实际存在）', () => {
    // 这个项目自身的路径应该是存在的
    const cwd = process.cwd()
    // 构造编码：D:\code\utools\claudecode\claude -> D--code-utools-claudecode-claude
    const parts = cwd.split('\\')
    const drive = parts[0].replace(':', '')
    const encoded = drive + '--' + parts.slice(1).join('-')

    const decoded = tryFsDecodeDirName(encoded)
    assertEquals(decoded, cwd, '应该正确解码当前工作目录')
  })

  test('tryFsDecodeDirName: 不存在的路径返回 null', () => {
    const encoded = 'Z--nonexistent-fake-path-should-not-exist'
    const decoded = tryFsDecodeDirName(encoded)
    assertEquals(decoded, null, '不存在的路径应该返回 null')
  })

  test('tryFsDecodeDirName: 用户主目录（必然存在）', () => {
    const homedir = os.homedir()
    const parts = homedir.split('\\')
    const drive = parts[0].replace(':', '')
    const encoded = drive + '--' + parts.slice(1).join('-')

    const decoded = tryFsDecodeDirName(encoded)
    assertEquals(decoded, homedir, '应该正确解码用户主目录')
  })

  // 模拟用户报告的场景：需要真实路径存在才能测试
  test('tryFsDecodeDirName: 含下划线的真实路径（如果存在）', () => {
    // 检查用户报告的路径是否真实存在
    const realPath = 'D:\\code\\EPD_GYXX\\GY_XQ\\XQ_PS\\xq_teacher_weex'
    if (fs.existsSync(realPath)) {
      const encoded = 'D--code-EPD-GYXX-GY-XQ-XQ-PS-xq-teacher-weex'
      const decoded = tryFsDecodeDirName(encoded)
      assertEquals(decoded, realPath, '应该正确解码含下划线的路径')
    } else {
      console.log('  ⊘ 跳过（路径不存在）')
    }
  })

  // 测试回退逻辑：fs 解码失败后用字符级还原
  test('综合策略: 存在的路径用 fs 解码，不存在的用字符还原', () => {
    const cwd = process.cwd()
    const parts = cwd.split('\\')
    const drive = parts[0].replace(':', '')
    const encoded = drive + '--' + parts.slice(1).join('-')

    // 1. fs 解码应该成功
    const fromFs = tryFsDecodeDirName(encoded)
    assertEquals(fromFs, cwd)

    // 2. 不存在路径的 fs 解码返回 null，应该回退到字符还原
    const fakeEncoded = 'Z--fake-path'
    const fromFsFake = tryFsDecodeDirName(fakeEncoded)
    assertEquals(fromFsFake, null)
    const fallback = decodeDirName(fakeEncoded)
    assertEquals(fallback, 'Z:\\fake\\path')
  })
} else {
  console.log('⊘ 当前平台非 Windows，跳过 Windows 特定测试')
}

console.log('\n=== 测试完成 ===\n')
