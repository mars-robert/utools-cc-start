/**
 * @file 测试项目历史的预加载只读接口：会话解析、标题提取、记忆 frontmatter、Markdown 导出、路径安全
 */

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { loadPreload } = require('./helpers/load-preload.cjs')

const HOME = 'C:\\Users\\tester'
const PROJECTS = path.join(HOME, '.claude', 'projects')
const DIR = 'myproj'
const PROJDIR = path.join(PROJECTS, DIR)
const MEMDIR = path.join(PROJDIR, 'memory')

function dirent (name, isFile) {
  return { name, isFile: () => isFile, isDirectory: () => !isFile }
}

// 构造一个带内存文件系统的预加载环境
function makeEnv ({ sessions = {}, memories = {} } = {}) {
  const readdir = (p) => {
    if (p === PROJDIR) {
      return [
        ...Object.keys(sessions).map((n) => dirent(n, true)),
        dirent('memory', false)
      ]
    }
    if (p === MEMDIR) return Object.keys(memories).map((n) => dirent(n, true))
    return []
  }
  const readFile = (p) => {
    const base = path.basename(p)
    if (String(p).startsWith(MEMDIR)) {
      if (memories[base] != null) return memories[base]
      throw new Error('ENOENT ' + p)
    }
    if (sessions[base] != null) return sessions[base]
    throw new Error('ENOENT ' + p)
  }
  const stat = (p) => ({ mtimeMs: 1000 + Object.keys(sessions).indexOf(path.basename(p)), size: 2048 })
  const exists = () => true
  return loadPreload({ platform: 'win32', homedir: HOME, readdir, readFile, stat, exists })
}

const line = (obj) => JSON.stringify(obj)

test('parseSession: 分类型解析、工具配对、跳过元数据与坏行', () => {
  const { services } = makeEnv()
  const jsonl = [
    line({ type: 'mode', mode: 'x' }),
    line({ type: 'user', message: { role: 'user', content: 'hello' }, gitBranch: 'main', version: '2.0', timestamp: 't1' }),
    line({ type: 'assistant', message: { role: 'assistant', content: [
      { type: 'thinking', thinking: 'hmm' },
      { type: 'text', text: 'hi there' },
      { type: 'tool_use', id: 'tu1', name: 'Bash', input: { command: 'ls' } }
    ] }, timestamp: 't2' }),
    line({ type: 'user', message: { role: 'user', content: [
      { type: 'tool_result', tool_use_id: 'tu1', content: 'file1\nfile2' }
    ] } }),
    '{ broken json',
    line({ type: 'attachment', attachment: { type: 'hook_success', stdout: 'ok' } })
  ].join('\n')

  const { blocks, meta } = services.parseSession(jsonl)
  // 跨 vm realm：用展开把结果数组重置到测试 realm，再做结构比较
  assert.deepEqual([...blocks.map((b) => b.kind)], ['user', 'thinking', 'assistant', 'tool_use', 'attachment'])
  assert.equal(blocks[0].text, 'hello')
  assert.equal(blocks[1].text, 'hmm')
  assert.equal(blocks[2].text, 'hi there')
  assert.equal(blocks[3].name, 'Bash')
  assert.equal(blocks[3].result.text, 'file1\nfile2')
  assert.equal(blocks[3].result.isError, false)
  // attachment 现在作为独立块解析（含子类型与预览文本）
  assert.equal(blocks[4].subtype, 'hook_success')
  assert.equal(blocks[4].text, 'ok')
  // attachment 不计入会话消息数 meta.count
  assert.equal(meta.count, 4)
  assert.equal(meta.gitBranch, 'main')
  assert.equal(meta.version, '2.0')
  assert.equal(meta.firstTimestamp, 't1')
})

test('parseSession: 去除本地命令噪声包装', () => {
  const { services } = makeEnv()
  const jsonl = line({
    type: 'user',
    message: { role: 'user', content: '<local-command-caveat>noise</local-command-caveat>\nreal question' }
  })
  const { blocks } = services.parseSession(jsonl)
  assert.equal(blocks.length, 1)
  assert.equal(blocks[0].kind, 'user')
  assert.equal(blocks[0].text, 'real question')
})

test('parseSession: 识别斜杠命令用户消息', () => {
  const { services } = makeEnv()
  const jsonl = [
    line({ type: 'user', message: { role: 'user', content: '<command-message>opsx:propose</command-message>\n<command-name>/opsx:propose</command-name>\n<command-args>开始设计</command-args>' } }),
    line({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: '<command-name>/clear</command-name>\n<command-args></command-args>' }] } })
  ].join('\n')
  const { blocks } = services.parseSession(jsonl)
  assert.equal(blocks.length, 2)
  assert.equal(blocks[0].kind, 'user')
  assert.equal(blocks[0].command.name, '/opsx:propose')
  assert.equal(blocks[0].command.args, '开始设计')
  // 数组内容里的命令也能识别；无参数时 args 为空
  assert.equal(blocks[1].command.name, '/clear')
  assert.equal(blocks[1].command.args, '')
})

test('parseSession: 纯命令输出作系统命令块、去 ANSI、不当作用户提问', () => {
  const { services } = makeEnv()
  const stdout = '<local-command-stdout>[2mCompacted[22m\nPreCompact done</local-command-stdout>'
  const jsonl = [
    line({ type: 'user', message: { role: 'user', content: '<command-name>/compact</command-name>\n<command-args></command-args>' } }),
    line({ type: 'user', message: { role: 'user', content: stdout } })
  ].join('\n')
  const { blocks } = services.parseSession(jsonl)
  assert.equal(blocks.length, 2)
  // 命令本身仍是用户命令胶囊
  assert.equal(blocks[0].kind, 'user')
  assert.equal(blocks[0].command.name, '/compact')
  // 命令输出重分类为系统命令块：去壳、去 ANSI 转义
  assert.equal(blocks[1].kind, 'system')
  assert.equal(blocks[1].subtype, 'local_command')
  assert.equal(blocks[1].text, 'Compacted\nPreCompact done')
})

test('parseSession: <local-command-stdout> 仅出现在文本中部时仍按用户消息', () => {
  const { services } = makeEnv()
  const jsonl = line({ type: 'user', message: { role: 'user', content: 'see <local-command-stdout>x</local-command-stdout> here' } })
  const { blocks } = services.parseSession(jsonl)
  assert.equal(blocks.length, 1)
  assert.equal(blocks[0].kind, 'user')
})

test('parseSession: 空命令输出不产出块', () => {
  const { services } = makeEnv()
  const jsonl = line({ type: 'user', message: { role: 'user', content: '<local-command-stdout>   </local-command-stdout>' } })
  const { blocks } = services.parseSession(jsonl)
  assert.equal(blocks.length, 0)
})

test('parseSession: 上下文压缩摘要并入对应「上下文压缩」系统块、不当作用户气泡', () => {
  const { services } = makeEnv()
  const jsonl = [
    line({ type: 'system', subtype: 'compact_boundary', compactMetadata: { trigger: 'manual', preTokens: 5000 } }),
    line({ type: 'user', isCompactSummary: true, message: { role: 'user', content: 'This session is being continued...\n\nSummary:\n要点一' } })
  ].join('\n')
  const { blocks } = services.parseSession(jsonl)
  // 摘要并入压缩块，不产出独立用户块
  assert.equal(blocks.length, 1)
  assert.equal(blocks[0].kind, 'system')
  assert.equal(blocks[0].subtype, 'compact_boundary')
  assert.match(blocks[0].text, /上下文已压缩/)
  assert.match(blocks[0].summary, /Summary:[\s\S]*要点一/)
})

test('parseSession: 无前置压缩块时摘要退化为独立系统块（仍非用户气泡）', () => {
  const { services } = makeEnv()
  const jsonl = line({ type: 'user', isCompactSummary: true, message: { role: 'user', content: 'This session is being continued...' } })
  const { blocks } = services.parseSession(jsonl)
  assert.equal(blocks.length, 1)
  assert.equal(blocks[0].kind, 'system')
  assert.equal(blocks[0].subtype, 'compact_boundary')
  assert.match(blocks[0].summary, /being continued/)
})

test('parseSession: 未配对的 tool_result 单独成块', () => {
  const { services } = makeEnv()
  const jsonl = line({
    type: 'user',
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'missing', content: 'orphan', is_error: true }] }
  })
  const { blocks } = services.parseSession(jsonl)
  assert.equal(blocks.length, 1)
  assert.equal(blocks[0].kind, 'tool_result')
  assert.equal(blocks[0].text, 'orphan')
  assert.equal(blocks[0].isError, true)
})

test('sessionToMarkdown: 各类型出现在输出中', () => {
  const { services } = makeEnv()
  const parsed = services.parseSession([
    line({ type: 'user', message: { role: 'user', content: 'q' } }),
    line({ type: 'assistant', message: { role: 'assistant', content: [
      { type: 'text', text: 'a' },
      { type: 'tool_use', id: 't', name: 'Bash', input: { command: 'ls' } }
    ] } }),
    line({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: 'out' }] } })
  ].join('\n'))
  const md = services.sessionToMarkdown(parsed, 'sid')
  assert.match(md, /# 会话记录/)
  assert.match(md, /👤 用户/)
  assert.match(md, /🤖 Claude/)
  assert.match(md, /🔧 Bash/)
  assert.match(md, /out/)
})

test('listProjectSessions: ai-title 优先、回退首条用户消息、按 mtime 降序', () => {
  const { services } = makeEnv({ sessions: {
    's1.jsonl': [
      line({ type: 'user', message: { role: 'user', content: 'first q' } }),
      line({ type: 'ai-title', aiTitle: 'Title One', sessionId: 's1' })
    ].join('\n'),
    's2.jsonl': line({ type: 'user', message: { role: 'user', content: 'hello there' } })
  } })

  const list = services.listProjectSessions(DIR)
  assert.equal(list.length, 2)
  // s2 的 mtime 更大（index 1），排在最前
  assert.equal(list[0].sessionId, 's2')
  assert.equal(list[0].title, 'hello there')
  const s1 = list.find((s) => s.sessionId === 's1')
  assert.equal(s1.title, 'Title One')
  // 会话条目带文件大小
  assert.equal(s1.size, 2048)
})

test('listProjectMemories: 解析 frontmatter 并排除 MEMORY.md', () => {
  const { services } = makeEnv({ memories: {
    'MEMORY.md': '# 索引',
    'mem1.md': [
      '---',
      'name: my-mem',
      'description: "Some desc"',
      'metadata:',
      '  type: feedback',
      '  originSessionId: s1',
      '---',
      '',
      'body text'
    ].join('\n')
  } })

  const list = services.listProjectMemories(DIR)
  assert.equal(list.length, 1)
  assert.equal(list[0].name, 'my-mem')
  assert.equal(list[0].description, 'Some desc')
  assert.equal(list[0].type, 'feedback')
  assert.equal(list[0].originSessionId, 's1')
})

test('readMemory: 返回 frontmatter 与正文', () => {
  const { services } = makeEnv({ memories: {
    'mem1.md': '---\nname: my-mem\n---\n\nbody text'
  } })
  const r = services.readMemory(DIR, 'mem1.md')
  assert.equal(r.frontmatter.name, 'my-mem')
  assert.match(r.body, /body text/)
})

test('readSession / exportSession: 正常读取与导出', () => {
  const { services } = makeEnv({ sessions: {
    's1.jsonl': line({ type: 'user', message: { role: 'user', content: 'hi' } })
  } })
  const parsed = services.readSession(DIR, 's1')
  assert.equal(parsed.blocks[0].text, 'hi')
  const md = services.exportSession(DIR, 's1')
  assert.match(md, /# 会话记录/)
  assert.match(md, /s1/)
})

test('路径安全：非法 dirName / fileName / sessionId 被拒', () => {
  const { services } = makeEnv({ sessions: { 's1.jsonl': '{}' } })
  assert.equal(services.listProjectSessions('../evil').length, 0)
  assert.equal(services.listProjectMemories('a/b').length, 0)
  assert.equal(services.readSession('..', 's1'), null)
  assert.equal(services.readSession(DIR, '../secret'), null)
  assert.equal(services.readMemory(DIR, '../secret.md'), null)
  assert.equal(services.readMemory(DIR, 'note.txt'), null)
})

test('resumeSession: 组装 claude --resume <id> 并在终端启动', () => {
  const { services, spawns } = makeEnv()
  const r = services.resumeSession('C:\\work\\proj', 's1')
  assert.equal(r.success, true)
  assert.equal(spawns.length, 1)
  assert.match(JSON.stringify(spawns[0].args), /claude --resume s1/)
})

test('resumeSession: 缺少参数时返回错误', () => {
  const { services } = makeEnv()
  assert.equal(services.resumeSession('', 's1').success, false)
  assert.equal(services.resumeSession('C:\\work', '').success, false)
})
