// When GitHub's feeds stop sending pushes, the main branch's commits stand in for them, and a push that comes late is
// not counted a second time.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'commits-'))
process.env.GITHUB_TOKEN ||= 'test'
const { state, commitWatch, readCommits, normalise, snapshot } = await import('../pulse.mjs')

// as on the lab on 2026-11-01: fiber's last push came on 10-30 at 11:26, then commits kept landing with no push
const NOW = Date.parse('2026-11-01T12:00:00Z')
const FULL = 'nervosnetwork/fiber'
const sha = (n) => String(n).repeat(40).slice(0, 40)
const commit = (n, login, date, more = {}) => ({ sha: sha(n), html_url: `https://github.com/${FULL}/commit/${sha(n)}`, commit: { message: `change ${n}\n\nbody`, author: { date }, committer: { date } }, author: login ? { login, avatar_url: `https://a/${login}` } : null, committer: { login: 'web-flow' }, ...more })
const LIST = [
  commit(9, 'quake', new Date(NOW - 10 * 60e3).toISOString().replace('.000', '')), // too fresh: its push may still come
  commit(8, 'dependabot[bot]', '2026-11-01T03:00:00Z'),
  commit(7, 'quake', '2026-11-01T02:44:58Z'),
  commit(6, 'yangby-cryptape', '2026-10-31T12:00:00Z'),
  commit(5, 'quake', '2026-10-31T10:00:00Z'),
  commit(4, null, '2026-10-31T09:00:00Z'), // no GitHub account: nobody to show it for
  commit(3, 'quake', '2026-10-30T11:30:00Z'), // the head of the last push GitHub sent, from a clock 4 minutes ahead
  commit(2, 'quake', '2026-10-30T09:00:00Z'), // before that push
]
globalThis.fetch = async (url) => {
  const p = new URL(url).pathname
  const body = p === `/repos/${FULL}/commits` ? LIST : null
  return new Response(JSON.stringify(body || {}), { status: body ? 200 : 404, headers: { 'content-type': 'application/json' } })
}

state.repos[FULL] = { name: FULL, owner: 'nervosnetwork', group: 'nervosnetwork', private: false, ownerType: 'Organization', branch: 'develop', metaAt: Date.now(), topics: [], desc: '' }
state.events.push({ id: '1', kind: 'push', repo: FULL, group: 'nervosnetwork', actor: 'quake', avatar: '', title: 'change 3', url: `https://github.com/${FULL}/commit/${sha(3)}`, ref: 'develop', at: '2026-10-30T11:26:30Z', tags: [], bot: false, commits: 2 })
state.events.push({ id: '2', kind: 'pr_merged', repo: FULL, group: 'nervosnetwork', actor: 'quake', avatar: '', title: 'a pull request', url: '', ref: '', at: '2026-11-01T02:44:59Z', tags: [], bot: false })
const people = () => state.events.filter((e) => e.kind === 'push' && !e.bot && e.repo === FULL).reduce((a, e) => a + (e.commits || 0), 0)

test('commits after the last push become pushes, one per author, once', async () => {
  assert.equal(people(), 2) // the precondition: only the push GitHub sent
  const watch = commitWatch(NOW)
  assert.deepEqual(watch.repos, [FULL])
  const out = await readCommits(FULL, watch, NOW)
  const by = Object.fromEntries(out.map((e) => [e.actor, e]))
  assert.deepEqual(Object.keys(by).sort(), ['dependabot[bot]', 'quake', 'yangby-cryptape'])
  assert.equal(by.quake.commits, 2) // 7 and 5; 3 was the push's head, 2 came before it, 9 waits
  assert.equal(by.quake.at, '2026-11-01T02:44:58Z')
  assert.equal(by.quake.title, 'change 7')
  assert.equal(by.quake.ref, 'develop')
  assert.equal(by['yangby-cryptape'].commits, 1)
  assert.equal(by['dependabot[bot]'].bot, true)
  assert.equal(by['dependabot[bot]'].commits, undefined)
  assert.equal(people(), 5)
  // read again: nothing new
  assert.deepEqual(await readCommits(FULL, commitWatch(NOW), NOW), [])
  assert.equal(people(), 5)
})

test('the fresh commit is counted once its push is overdue', async () => {
  const later = NOW + 60 * 60e3
  const out = await readCommits(FULL, commitWatch(later), later)
  assert.deepEqual(out.map((e) => [e.actor, e.commits]), [['quake', 1]])
})

test('a push that arrives late for counted commits is dropped, a new one is kept', async () => {
  const push = (id, head) => ({ id, type: 'PushEvent', public: true, actor: { login: 'quake', avatar_url: '' }, repo: { name: FULL }, payload: { ref: 'refs/heads/develop', head, before: sha(3), size: 2 }, created_at: '2026-11-01T02:45:00Z' })
  assert.equal(await normalise(push('late', sha(7))), null)
  // the control: a head nobody counted yet still comes in (its title is looked up, so let the lookup fail quietly)
  const n = await normalise(push('new', sha(1)))
  assert.equal(n?.kind, 'push')
  assert.equal(n.commits, 2)
})

test('the page gets the pushes without their commit lists', () => {
  const s = snapshot()
  const e = s.events.find((x) => x.id.startsWith('c:'))
  assert.ok(e)
  assert.equal(e.shas, undefined)
})
