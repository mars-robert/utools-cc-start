/**
 * @file 测试 find-core.cjs：历史详情页内查找的纯匹配核心
 *   - escapeRegExp：转义正则元字符
 *   - compileQuery：按 大小写/全字/正则 选项编译全局正则
 *   - findInText：单段文本求所有匹配区间，零宽不死循环
 */

const { escapeRegExp, compileQuery, findInText } = require('../src/ProjectHistory/find-core.cjs')

// ---- 迷你测试骨架（与 services-active.test.cjs 一致）----
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
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a !== e) {
    throw new Error(`${message || 'Assertion failed'}: expected ${e}, got ${a}`)
  }
}

// escapeRegExp
test('escapeRegExp 转义元字符', () => {
  assertEquals(escapeRegExp('a.b*c'), 'a\\.b\\*c', 'should escape . and *')
})

// compileQuery：字面量
test('compileQuery 字面量将 . 视为普通字符', () => {
  const { re } = compileQuery('a.b', {})
  assertEquals(findInText('xa.byaxb', re), [[1, 4]], 'literal a.b matches only a.b not axb')
})

test('compileQuery 默认大小写不敏感', () => {
  const { re } = compileQuery('cat', {})
  assertEquals(findInText('Cat cat', re).length, 2, 'case-insensitive matches both')
})

test('compileQuery caseSensitive 区分大小写', () => {
  const { re } = compileQuery('cat', { caseSensitive: true })
  assertEquals(findInText('Cat cat', re), [[4, 7]], 'only lowercase cat')
})

test('compileQuery wholeWord 全字匹配', () => {
  const { re } = compileQuery('cat', { wholeWord: true })
  assertEquals(findInText('cat category cat.', re), [[0, 3], [13, 16]], 'whole-word only')
})

test('compileQuery useRegex 正则模式', () => {
  const { re } = compileQuery('a\\d+', { useRegex: true })
  assertEquals(findInText('a12 b a3', re), [[0, 3], [6, 8]], 'regex digit runs')
})

test('compileQuery 非法正则返回 error', () => {
  const { re, error } = compileQuery('a(', { useRegex: true })
  assertEquals(re, null, 're is null on invalid')
  assertEquals(error.length > 0, true, 'error message present')
})

test('compileQuery 空查询返回空', () => {
  const { re, error } = compileQuery('', {})
  assertEquals(re, null, 'empty query re null')
  assertEquals(error, '', 'no error')
})

// findInText
test('findInText 无匹配返回空数组', () => {
  const { re } = compileQuery('zzz', {})
  assertEquals(findInText('abc', re), [], 'no match')
})

test('findInText null re 返回空数组', () => {
  assertEquals(findInText('abc', null), [], 'null re')
})

test('findInText 零宽匹配不死循环且被忽略', () => {
  const { re } = compileQuery('x*', { useRegex: true })
  assertEquals(findInText('abc', re), [], 'zero-width yields no ranges and terminates')
})
