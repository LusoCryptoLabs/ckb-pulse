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
fs.writeFileSync(path.join(dir, 'history.json'), JSON.stringify({ repos: { 'ickb/v1-core': { at: Date.now(), rows }, 'ickb/contracts': { at: Date.now(), rows } } }))
const { loadHistory, trends, historyNames } = await import('../history.mjs')
const { state, knownRepos, findMoves } = await import('../pulse.mjs')
loadHistory(dir)

const meta = (full) => ({ full_name: full, description: '', topics: [], private: false, fork: false, archived: false, pushed_at: '2026-09-26T14:49:17Z', owner: { type: 'Organization' } })
const GH = { '/repos/ickb/v1-core': meta('ickb/contracts'), '/repos/ickb/contracts': meta('ickb/contracts') }
globalThis.fetch = async (url) => {
  const body = GH[new URL(url).pathname]
  return new Response(JSON.stringify(body || {}), { status: body ? 200 : 404, headers: { 'content-type': 'application/json' } })
}
const commits = () => trends(knownRepos()).months.reduce((a, m) => a + m.commits, 0)

test('the old name of a renamed repository is dropped, its commits counted once', async () => {
  state.builders = ['ickb/v1-core', 'ickb/contracts']
  for (const f of state.builders) state.repos[f] = { name: f, owner: 'ickb', private: false, ownerType: 'Organization' }
  assert.equal(commits(), 270) // the precondition: counted twice
  assert.deepEqual(await findMoves(['ickb/v1-core', 'ickb/contracts']), ['ickb/v1-core'])
  assert.equal(state.repos['ickb/v1-core'].movedTo, 'ickb/contracts')
  assert.deepEqual(knownRepos(), ['ickb/contracts'])
  assert.deepEqual(historyNames(), ['ickb/contracts'])
  assert.equal(commits(), 135)
})
