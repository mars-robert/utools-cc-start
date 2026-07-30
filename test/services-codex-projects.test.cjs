const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { loadPreload } = require('./helpers/load-preload.cjs')

const HOME = 'C:\\Users\\tester'
const SESSIONS = path.join(HOME, '.codex', 'sessions')

function directory (name) {
  return { name, isDirectory: () => true, isFile: () => false }
}

function file (name) {
  return { name, isDirectory: () => false, isFile: () => true }
}

function sessionMeta (id, cwd, timestamp) {
  return JSON.stringify({
    timestamp,
    type: 'session_meta',
    payload: { id, cwd, timestamp }
  }) + '\n' + JSON.stringify({ type: 'event_msg', payload: { type: 'user_message' } })
}

function makeServices ({ tree = {}, files = {}, mtimes = {}, existing = [] } = {}) {
  const existingPaths = new Set([SESSIONS, ...existing])
  return loadPreload({
    homedir: HOME,
    exists: (p) => existingPaths.has(String(p)),
    readdir: (p) => {
      const key = String(p)
      if (key in tree) return tree[key]
      throw new Error('ENOENT: ' + key)
    },
    readFile: (p) => {
      const key = String(p)
      if (key in files) return files[key]
      throw new Error('ENOENT: ' + key)
    },
    stat: (p) => {
      const key = String(p)
      if (key in mtimes) {
        return { mtimeMs: mtimes[key], isFile: () => true, isDirectory: () => false }
      }
      throw new Error('ENOENT: ' + key)
    }
  })
}

test('listCodexProjects recursively discovers, deduplicates and sorts session cwd values', () => {
  const year = path.join(SESSIONS, '2026')
  const month = path.join(year, '07')
  const day29 = path.join(month, '29')
  const day30 = path.join(month, '30')
  const alpha = 'D:\\code\\alpha'
  const beta = 'D:\\code\\beta'
  const oldAlphaSession = path.join(day29, 'rollout-alpha-old.jsonl')
  const betaSession = path.join(day29, 'rollout-beta.jsonl')
  const newAlphaSession = path.join(day30, 'rollout-alpha-new.jsonl')
  const invalidSession = path.join(day30, 'invalid.jsonl')

  const { services } = makeServices({
    tree: {
      [SESSIONS]: [directory('2026')],
      [year]: [directory('07')],
      [month]: [directory('29'), directory('30')],
      [day29]: [file('rollout-alpha-old.jsonl'), file('rollout-beta.jsonl')],
      [day30]: [file('rollout-alpha-new.jsonl'), file('invalid.jsonl'), file('notes.txt')]
    },
    files: {
      [oldAlphaSession]: sessionMeta('alpha-old', alpha, '2026-07-01T00:00:00.000Z'),
      [betaSession]: sessionMeta('beta', beta, '2026-07-02T00:00:00.000Z'),
      [newAlphaSession]: sessionMeta('alpha-new', alpha, '2026-07-03T00:00:00.000Z'),
      [invalidSession]: '{"type":"event_msg","payload":{}}\n'
    },
    mtimes: {
      [oldAlphaSession]: 100,
      [betaSession]: 200,
      [newAlphaSession]: 300,
      [invalidSession]: 400
    },
    existing: [alpha]
  })

  const result = services.listCodexProjects()

  assert.equal(result.dirExists, true)
  assert.equal(result.projects.length, 2)
  assert.equal(result.projects[0].cwd, alpha)
  assert.equal(result.projects[0].recency, 300)
  assert.equal(result.projects[0].available, true)
  assert.equal(result.projects[0].source, 'codex')
  assert.equal(result.projects[1].cwd, beta)
  assert.equal(result.projects[1].available, false)
})

test('listCodexProjects reports a missing sessions directory', () => {
  const services = loadPreload({
    homedir: HOME,
    exists: () => false
  }).services

  const result = services.listCodexProjects()
  assert.equal(result.dirExists, false)
  assert.equal(result.projects.length, 0)
})

test('deleteCodexProject removes only sessions whose cwd matches the project', () => {
  const day = path.join(SESSIONS, '2026', '07', '30')
  const alpha = 'D:\\code\\alpha'
  const alphaOne = path.join(day, 'alpha-one.jsonl')
  const alphaTwo = path.join(day, 'alpha-two.jsonl')
  const beta = path.join(day, 'beta.jsonl')
  const { services, unlinks } = makeServices({
    tree: {
      [SESSIONS]: [directory('2026')],
      [path.join(SESSIONS, '2026')]: [directory('07')],
      [path.join(SESSIONS, '2026', '07')]: [directory('30')],
      [day]: [file('alpha-one.jsonl'), file('alpha-two.jsonl'), file('beta.jsonl')]
    },
    files: {
      [alphaOne]: sessionMeta('alpha-one', alpha, '2026-07-01T00:00:00.000Z'),
      [alphaTwo]: sessionMeta('alpha-two', alpha, '2026-07-02T00:00:00.000Z'),
      [beta]: sessionMeta('beta', 'D:\\code\\beta', '2026-07-03T00:00:00.000Z')
    }
  })

  const result = services.deleteCodexProject(alpha)

  assert.equal(result.success, true)
  assert.equal(result.deleted, 2)
  assert.deepEqual(unlinks.map((item) => item.p).sort(), [alphaOne, alphaTwo].sort())
})
