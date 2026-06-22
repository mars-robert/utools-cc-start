const { test } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const os = require('node:os')

test('临时路径功能：路径解析逻辑', () => {
  // 模拟路径提取逻辑
  const extractPathName = (inputPath) => {
    return inputPath.split(/[/\\]/).pop() || inputPath
  }

  // Windows 路径
  const winPath = 'D:\\code\\test\\project'
  assert.strictEqual(extractPathName(winPath), 'project')

  // Unix 路径
  const unixPath = '/home/user/projects/myapp'
  assert.strictEqual(extractPathName(unixPath), 'myapp')

  // 根路径（Windows：split 后最后一个元素是空字符串，但会回退到完整路径）
  const rootPath = 'C:\\'
  const rootResult = extractPathName(rootPath)
  assert.ok(rootResult === 'C:\\' || rootResult === '', '根路径应返回路径本身或空字符串')

  // 相对路径
  const relPath = './myproject'
  assert.strictEqual(extractPathName(relPath), 'myproject')
})

test('临时路径功能：临时项目对象结构', () => {
  const inputPath = 'D:\\test\\path'
  const pathName = inputPath.split(/[/\\]/).pop() || inputPath

  const tempProject = {
    id: '__temp__',
    dirName: '__temp__',
    cwd: inputPath,
    displayName: pathName,
    decoded: false,
    recency: Date.now(),
    available: true,
    isTemp: true
  }

  assert.strictEqual(tempProject.id, '__temp__')
  assert.strictEqual(tempProject.isTemp, true)
  assert.strictEqual(tempProject.available, true)
  assert.strictEqual(tempProject.cwd, inputPath)
  assert.strictEqual(tempProject.displayName, 'path')
})
