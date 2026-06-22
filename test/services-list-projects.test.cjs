/**
 * @file 测试 listClaudeProjects 在真实目录上的表现
 */

const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

// Mock window.utools (services.js 的 listClaudeProjects 不直接依赖它，只有其他函数依赖)
global.window = {
  utools: {
    dbStorage: {
      getItem: () => null,
      setItem: () => {}
    }
  }
}

// 加载 services.js（通过 require 缓存复用）
delete require.cache[require.resolve('../public/preload/services.js')]
const servicesPath = path.join(__dirname, '../public/preload/services.js')

// 手动提取 listClaudeProjects 需要的函数（避免完整 require services.js，因为它会设置 window.services）
const servicesCode = fs.readFileSync(servicesPath, 'utf-8')

// 提取函数定义
function extractFunction(code, fnName) {
  const regex = new RegExp(`function ${fnName}\\s*\\([^)]*\\)\\s*{`, 'g')
  const match = regex.exec(code)
  if (!match) return null

  let braceCount = 1
  let i = match.index + match[0].length
  let body = match[0]

  while (i < code.length && braceCount > 0) {
    const char = code[i]
    body += char
    if (char === '{') braceCount++
    if (char === '}') braceCount--
    i++
  }

  return body
}

// 执行函数定义
const fnNames = [
  'getProjectsDir',
  'readCwdFromSessions',
  'decodeDirName',
  'walkFsForPath',
  'tryFsDecodeDirName',
  'computeRecency',
  'listClaudeProjects'
]

for (const name of fnNames) {
  const fnCode = extractFunction(servicesCode, name)
  if (fnCode) {
    eval(fnCode)
  }
}

// ===== 测试 =====

console.log('\n=== listClaudeProjects 端到端测试 ===\n')

const projectsDir = path.join(os.homedir(), '.claude', 'projects')

if (!fs.existsSync(projectsDir)) {
  console.log('⊘ 跳过测试：~/.claude/projects 目录不存在')
  process.exit(0)
}

const result = listClaudeProjects()

console.log(`项目目录: ${projectsDir}`)
console.log(`目录存在: ${result.dirExists}`)
console.log(`项目数量: ${result.projects.length}\n`)

// 检查用户报告的问题项目
const problemDirName = 'D--code-EPD-GYXX-GY-XQ-XQ-PS-xq-teacher-weex'
const expectedCwd = 'D:\\code\\EPD_GYXX\\GY_XQ\\XQ_PS\\xq_teacher_weex'

const problemProject = result.projects.find(p => p.dirName === problemDirName)

if (problemProject) {
  console.log('✓ 找到用户报告的问题项目:')
  console.log(`  dirName: ${problemProject.dirName}`)
  console.log(`  cwd: ${problemProject.cwd}`)
  console.log(`  displayName: ${problemProject.displayName}`)
  console.log(`  available: ${problemProject.available}`)
  console.log(`  decoded: ${problemProject.decoded}`)

  // 验证修复效果
  if (problemProject.cwd === expectedCwd) {
    console.log('  ✓ cwd 解析正确！')
  } else {
    console.error(`  ✗ cwd 解析错误！期望 ${expectedCwd}，实际 ${problemProject.cwd}`)
    process.exitCode = 1
  }

  if (problemProject.available) {
    console.log('  ✓ 项目标记为可用')
  } else {
    console.error('  ✗ 项目应该可用但标记为不可用')
    process.exitCode = 1
  }
} else {
  console.log('⊘ 未找到问题项目（可能已被删除或在其他机器上）')
}

// 显示所有项目概览
console.log('\n所有项目:')
result.projects.forEach((p, i) => {
  const status = p.available ? '✓' : '✗'
  const decodedFlag = p.decoded ? '[fs-decoded]' : ''
  console.log(`  ${i + 1}. ${status} ${p.displayName} ${decodedFlag}`)
  if (!p.available) {
    console.log(`     → 不可用: ${p.cwd}`)
  }
})

console.log('\n=== 测试完成 ===\n')
