const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { loadPreload } = require('./helpers/load-preload.cjs')

test('readClaudeConfigFile reports a missing file cleanly', () => {
  const { services } = loadPreload({ exists: () => false })
  const state = services.readClaudeConfigFile()

  assert.equal(state.exists, false)
  assert.equal(state.rawText, '')
  assert.equal(state.data, null)
  assert.equal(state.parseError, null)
})

test('readClaudeConfigFile returns parse errors without throwing', () => {
  const fileText = '{ invalid json'
  const homedir = 'C:\\Users\\tester'
  const { services } = loadPreload({
    homedir,
    exists: (p) => p === path.join(homedir, '.claude.json'),
    readFile: () => fileText
  })

  const state = services.readClaudeConfigFile()

  assert.equal(state.exists, true)
  assert.equal(state.rawText, fileText)
  assert.equal(state.data, null)
  assert.ok(state.parseError)
  assert.match(state.parseError.message, /Unexpected|JSON/i)
})

test('saveClaudeConfigFile creates a backup and writes atomically', () => {
  const original = JSON.stringify({
    numStartups: 1,
    installMethod: 'global',
    unknownThing: { a: 1 }
  }, null, 2)
  const homedir = 'C:\\Users\\tester'

  const writes = []
  const copies = []
  const renames = []
  const { services } = loadPreload({
    homedir,
    exists: (p) => p === path.join(homedir, '.claude.json'),
    readFile: () => original,
    writeFile: (p, content) => {
      writes.push({ p, content })
    },
    copyFile: (from, to) => {
      copies.push({ from, to })
    },
    rename: (from, to) => {
      renames.push({ from, to })
    }
  })

  const next = {
    numStartups: 1,
    installMethod: 'local',
    unknownThing: { a: 1 }
  }

  const result = services.saveClaudeConfigFile(next)

  assert.equal(result.success, true)
  assert.equal(copies.length, 1)
  assert.equal(copies[0].from, path.join(homedir, '.claude.json'))
  assert.ok(copies[0].to.endsWith('.bak'))
  assert.ok(copies[0].to.includes('.claude.json.'))
  assert.equal(writes.length, 1)
  assert.ok(writes[0].p.endsWith('.tmp'))
  assert.ok(writes[0].p.includes('.claude.json.'))
  assert.equal(renames.length, 1)
  assert.equal(renames[0].to, path.join(homedir, '.claude.json'))
  assert.equal(JSON.parse(writes[0].content).installMethod, 'local')
  assert.equal(JSON.parse(writes[0].content).unknownThing.a, 1)
})
