// A commit is counted once. A branch is pushed (its commits counted), then merged to main (a push whose compare holds
// the same commits again): only what is new counts. Measured 2026-11-18 on the lab against GitHub's unique SHAs over 30
// days: ckb-keyway counted 1061 for 443, fiber 183 for 72. And a cycle with more than 100 new commits reads on.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shas-'))
process.env.DATA_DIR = dir
process.env.GITHUB_TOKEN ||= 'test'
const FULL = 'officialcmg/ckb-keyway'
const sha = (n) => String(n).padStart(40, '0')
// the compare answers: the commits between two heads, as GitHub lists them
const COMPARE = {
  [`${sha(100)}...${sha(103)}`]: [sha(101), sha(102), sha(103)], // a branch with three commits
  [`${sha(50)}...${sha(200)}`]: [sha(101), sha(102), sha(103), sha(200)], // main takes the branch with a merge commit
  [`${sha(103)}...${sha(103)}`]: [],
}
const NOW = Date.now()
const LIST = Array.from({ length: 130 }, (_, i) => ({ sha: sha(1000 + i), html_url: `https://github.com/${FULL}/commit/${sha(1000 + i)}`, commit: { message: `c${i}`, author: { date: new Date(NOW - (3 + i) * 3600e3).toISOString() }, committer: { date: new Date(NOW - (3 + i) * 3600e3).toISOString() } }, author: { login: 'janx', avatar_url: '' } }))
const calls = []
globalThis.fetch = async (url) => {
  const u = new URL(url), p = u.pathname
  calls.push(p + u.search)
  let body = {}, status = 200
  const m = p.match(/\/compare\/([0-9a-f]{40}\.\.\.[0-9a-f]{40})$/)
  if (m) body = { total_commits: (COMPARE[m[1]] || []).length, commits: (COMPARE[m[1]] || []).map((s) => ({ sha: s })) }
  else if (p.endsWith('/commits')) { const page = +u.searchParams.get('page') || 1; body = LIST.slice((page - 1) * 100, page * 100) }
  else if (p.includes('/commits/')) body = { commit: { message: 'a title' } }
  else if (p === `/repos/${FULL}`) body = { full_name: FULL, name: 'ckb-keyway', owner: { login: 'officialcmg', type: 'User' }, description: '', private: false, topics: ['ckb'], default_branch: 'main' }
  else status = 404
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}
const pulse = await import('../pulse.mjs')
const { state, normalise, readCommits } = pulse
state.repos[FULL] = { name: FULL, owner: 'officialcmg', group: 'officialcmg', private: false, ownerType: 'User', branch: 'main', metaAt: Date.now(), topics: ['ckb'], desc: '' }

const push = (id, ref, before, head) => ({ id, type: 'PushEvent', public: true, actor: { login: 'janx', avatar_url: '' }, repo: { name: FULL }, payload: { ref: `refs/heads/${ref}`, before, head }, created_at: new Date().toISOString() })

test('a branch pushed and then merged counts its commits once', async () => {
  const a = await normalise(push('1', 'feature', sha(100), sha(103)))
  state.events.push(a)
  assert.equal(a.commits, 3)
  assert.deepEqual(a.cs, [sha(101), sha(102), sha(103)])
  const b = await normalise(push('2', 'main', sha(50), sha(200)))
  state.events.push(b)
  assert.equal(b.commits, 1) // the merge commit: the three were counted with the branch
  assert.deepEqual(b.cs, [sha(200)])
  // the control: the old count for the same two pushes was 3 + 4
  assert.equal(3 + 4, 7)
})

test('a push whose commits were all counted is dropped', async () => {
  assert.equal(await normalise(push('3', 'feature', sha(100), sha(103))), null) // the same range again, as after a force push of the same commits
})

test('the pushes read back after a restart keep their commits counted', async () => {
  pulse.readShas() // as load() does: the counted commits come back from the stored events
  assert.equal(await normalise(push('4', 'main', sha(103), sha(103))), null)
  assert.equal(await normalise(push('5', 'feature', sha(100), sha(103))), null)
})

test('a cycle with more than one page of new commits reads on, up to five pages', async () => {
  calls.length = 0
  state.events.length = 0
  pulse.readShas() // nothing counted, no push seen: the whole list is new
  const out = await readCommits(FULL, NOW)
  const count = out.reduce((n, e) => n + (e.commits || 0), 0)
  assert.equal(count, 130)
  assert.ok(calls.some((c) => c.includes('page=2')), calls.join(' '))
  assert.ok(!calls.some((c) => c.includes('page=3')), 'two pages were enough: it stops when the page is short')
})
