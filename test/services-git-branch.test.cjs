/**
 * @file 测试 readGitBranch：直接解析 .git/HEAD 得到当前分支（零子进程）
 */

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { loadPreload } = require('./helpers/load-preload.cjs')

// 用内存 fs 构造服务：dirs 命中视为目录，files 命中视为文件并提供内容
function makeServices ({ dirs = {}, files = {} } = {}) {
  const stat = (p) => {
    const key = String(p)
    if (key in dirs) return { isFile: () => false, isDirectory: () => true, mtimeMs: 0 }
    if (key in files) return { isFile: () => true, isDirectory: () => false, mtimeMs: 0 }
    throw new Error('ENOENT: ' + key)
  }
  const readFile = (p) => {
    const key = String(p)
    if (key in files) return files[key]
    throw new Error('ENOENT: ' + key)
  }
  return loadPreload({ stat, readFile }).services
}

test('readGitBranch: 普通分支从 .git/HEAD 的 ref 解析', () => {
  const cwd = 'C:\\repo'
  const services = makeServices({
    dirs: { [path.join(cwd, '.git')]: true },
    files: { [path.join(cwd, '.git', 'HEAD')]: 'ref: refs/heads/main\n' }
  })
  assert.equal(services.readGitBranch(cwd), 'main')
})

test('readGitBranch: 普通仓库直接读取 HEAD，不先 stat .git 目录', () => {
  const cwd = 'C:\\repo'
  const statPaths = []
  const services = loadPreload({
    readFile: (p) => {
      const key = String(p)
      if (key === path.join(cwd, '.git', 'HEAD')) return 'ref: refs/heads/main\n'
      throw new Error('ENOENT: ' + key)
    },
    stat: (p) => {
      statPaths.push(String(p))
      throw new Error('unexpected stat: ' + p)
    }
  }).services

  assert.equal(services.readGitBranch(cwd), 'main')
  assert.deepEqual(statPaths, [])
})

test('readGitBranch: 含斜杠的分支名完整保留', () => {
  const cwd = 'C:\\repo'
  const services = makeServices({
    dirs: { [path.join(cwd, '.git')]: true },
    files: { [path.join(cwd, '.git', 'HEAD')]: 'ref: refs/heads/feature/login\n' }
  })
  assert.equal(services.readGitBranch(cwd), 'feature/login')
})

test('readGitBranch: detached HEAD 返回短 commit', () => {
  const cwd = 'C:\\repo'
  const sha = 'abcdef1234567890abcdef1234567890abcdef12'
  const services = makeServices({
    dirs: { [path.join(cwd, '.git')]: true },
    files: { [path.join(cwd, '.git', 'HEAD')]: sha + '\n' }
  })
  assert.equal(services.readGitBranch(cwd), 'abcdef1')
})

test('readGitBranch: .git 为文件（worktree）时跟随 gitdir', () => {
  const cwd = 'C:\\repo'
  const realGitDir = 'C:\\realgit\\worktrees\\wt'
  const services = makeServices({
    files: {
      [path.join(cwd, '.git')]: 'gitdir: ' + realGitDir + '\n',
      [path.join(realGitDir, 'HEAD')]: 'ref: refs/heads/dev\n'
    }
  })
  assert.equal(services.readGitBranch(cwd), 'dev')
})

test('readGitBranch: 非 git 目录返回空串', () => {
  const services = makeServices({}) // 任何路径 stat 都抛 ENOENT
  assert.equal(services.readGitBranch('C:\\not-a-repo'), '')
})

test('readGitBranch: 空 cwd 返回空串', () => {
  const services = makeServices({})
  assert.equal(services.readGitBranch(''), '')
})
