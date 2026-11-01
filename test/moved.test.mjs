// A renamed repository is counted once: its old name is an alias, neither polled nor kept in the history.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moved-'))
process.env.DATA_DIR = dir
process.env.GITHUB_TOKEN ||= 'test'
// as on the lab on 2026-11-01: ickb/v1-core is now ickb/contracts, and GitHub's statistics answer the same for both
const rows = [[1758412800, 'phroi', 100], [1758931200, 'phroi', 35]]
// and ckb-cell/unique-cell is now utxostack/unique-cell, which nothing followed: only the old name had rows
const cell = [[1700000000, 'someone', 65]]
fs.writeFileSync(path.join(dir, 'history.json'), JSON.stringify({ repos: { 'ickb/v1-core': { at: Date.now(), rows }, 'ickb/contracts': { at: Date.now(), rows }, 'ckb-cell/unique-cell': { at: Date.now(), rows: cell } } }))
const { loadHistory, trends, historyNames, repoRows: historyRows } = await import('../history.mjs')
const { state, knownRepos, findMoves } = await import('../pulse.mjs')
loadHistory(dir)

const meta = (full) => ({ full_name: full, description: '', topics: [], private: false, fork: false, archived: false, pushed_at: '2026-09-26T14:49:17Z', owner: { type: 'Organization' } })
const GH = {
  '/repos/ickb/v1-core': meta('ickb/contracts'), '/repos/ickb/contracts': meta('ickb/contracts'),
  '/repos/ckb-cell/unique-cell': meta('utxostack/unique-cell'), '/repos/utxostack/unique-cell': meta('utxostack/unique-cell'),
  '/repos/utxostack/unique-cell/stats/contributors': [{ author: { login: 'someone' }, weeks: [{ w: 1700000000, c: 65 }] }],
}
globalThis.fetch = async (url) => {
  const body = GH[new URL(url).pathname]
  return new Response(JSON.stringify(body || {}), { status: body ? 200 : 404, headers: { 'content-type': 'application/json' } })
}
const commits = () => trends(knownRepos()).months.reduce((a, m) => a + m.commits, 0)
const total = (names) => names.reduce((a, f) => a + (historyRows(f) || []).reduce((b, r) => b + r[2], 0), 0)

test('the old name of a renamed repository is dropped, its commits counted once', async () => {
  state.builders = ['ickb/v1-core', 'ickb/contracts']
  for (const f of state.builders) state.repos[f] = { name: f, owner: 'ickb', private: false, ownerType: 'Organization' }
  assert.equal(commits(), 270) // the precondition: counted twice
  assert.deepEqual(await findMoves(['ickb/v1-core', 'ickb/contracts']), ['ickb/v1-core'])
  assert.equal(state.repos['ickb/v1-core'].movedTo, 'ickb/contracts')
  assert.deepEqual(knownRepos(), ['ickb/contracts'])
  assert.ok(!historyNames().includes('ickb/v1-core'))
  assert.equal(total(['ickb/contracts']), 135)
})

test('a renamed repository nothing followed under its new name keeps its commits', async () => {
  state.extra['ckb-cell'] = { login: 'ckb-cell', type: 'Organization', source: 'onchain', addedAt: 0, repos: ['ckb-cell/unique-cell'] }
  state.repos['ckb-cell/unique-cell'] = { name: 'ckb-cell/unique-cell', owner: 'ckb-cell', private: false, ownerType: 'Organization' }
  assert.equal(total(['ckb-cell/unique-cell']), 65) // the precondition: the old name holds the only rows
  await findMoves(['ckb-cell/unique-cell'])
  assert.ok(knownRepos().includes('utxostack/unique-cell'))
  assert.ok(!knownRepos().includes('ckb-cell/unique-cell'))
  assert.equal(total(['ckb-cell/unique-cell', 'utxostack/unique-cell']), 65)
})
