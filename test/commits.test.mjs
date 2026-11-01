// When GitHub's feeds stop sending pushes, the main branch's commits stand in for them, and a push that comes late is
// not counted a second time.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'commits-'))
process.env.DATA_DIR = dir
process.env.GITHUB_TOKEN ||= 'test'

// as on the lab on 2026-11-01: fiber's last push came on 10-30 at 11:26, then commits kept landing with no push
const NOW = Date.parse('2026-11-01T12:00:00Z')
const FULL = 'nervosnetwork/fiber', OTHER = 'Ticoworld/QuotaCell', OLD = 'UTXOPlay/UTXOPlay'
const sha = (n) => String(n).repeat(40).slice(0, 40)
const iso = (ms) => new Date(ms).toISOString().replace('.000', '')
const commit = (full, n, login, date) => ({ sha: sha(n), html_url: `https://github.com/${full}/commit/${sha(n)}`, commit: { message: `change ${n}\n\nbody`, author: { date }, committer: { date } }, author: login ? { login, avatar_url: `https://a/${login}` } : null, committer: { login: 'web-flow' } })
const LISTS = {
  [FULL]: [
    commit(FULL, 9, 'quake', iso(NOW - 10 * 60e3)), // too fresh: its push may still come, and the others wait with it
    commit(FULL, 8, 'dependabot[bot]', '2026-11-01T03:00:00Z'),
    commit(FULL, 7, 'quake', '2026-11-01T02:44:58Z'),
    commit(FULL, 6, 'yangby-cryptape', '2026-10-31T12:00:00Z'),
    commit(FULL, 5, 'quake', '2026-10-31T10:00:00Z'),
    commit(FULL, 4, null, '2026-10-31T09:00:00Z'), // no GitHub account: nobody to show it for
    commit(FULL, 3, 'quake', '2026-10-30T11:30:00Z'), // the head of the last push GitHub sent, from a clock 4 minutes ahead
    commit(FULL, 2, 'quake', '2026-10-30T09:00:00Z'), // before that push
  ],
  // its push is sent while the commit lists are being read (as the daily fill did on the lab)
  [OTHER]: [commit(OTHER, 'a', 'Ticoworld', '2026-10-30T18:03:50Z')],
}
globalThis.fetch = async (url) => {
  const p = new URL(url).pathname
  const body = LISTS[p.replace(/^\/repos\//, '').replace(/\/commits$/, '')]
  return new Response(JSON.stringify(p.endsWith('/commits') && body ? body : {}), { status: p.endsWith('/commits') && body ? 200 : 404, headers: { 'content-type': 'application/json' } })
}

const repo = (name) => ({ name, owner: name.split('/')[0], group: name.split('/')[0], private: false, ownerType: 'Organization', branch: 'main', metaAt: Date.now(), topics: [], desc: '' })
const ev = (id, full, at, more) => ({ id, kind: 'push', repo: full, group: full.split('/')[0], actor: 'x', avatar: '', title: '', url: '', ref: 'main', at, tags: [], bot: false, ...more })
fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify({
  version: 3, agentRule: 2, ctxRule: 3,
  repos: { [FULL]: repo(FULL), [OTHER]: repo(OTHER), [OLD]: repo(OLD) },
  events: [
    ev('1', FULL, '2026-10-30T11:26:30Z', { actor: 'quake', url: `https://github.com/${FULL}/commit/${sha(3)}`, commits: 2 }),
    ev('2', FULL, '2026-11-01T02:44:59Z', { kind: 'pr_merged', actor: 'quake' }),
    ev('3', OTHER, '2026-10-29T10:00:00Z', { kind: 'comment', actor: 'Ticoworld' }),
    // counted before this fix: one commit of seven was the head of a push GitHub had sent, one counted push was all one
    ev('4', OLD, '2026-10-30T18:28:14Z', { actor: 'a19q3', url: `https://github.com/${OLD}/commit/${sha('b')}`, commits: 1 }),
    ev(`c:${OLD}@${sha('c')}`, OLD, '2026-11-01T10:13:00Z', { actor: 'a19q3', commits: 2, shas: [sha('c'), sha('b')] }),
    ev(`c:${OTHER}@${sha('d')}`, OTHER, '2026-10-30T19:00:00Z', { actor: 'Ticoworld', commits: 1, shas: [sha('b')] }),
  ],
}))
const { state, load, commitWatch, readCommits, normalise, intake, snapshot } = await import('../pulse.mjs')
load()
const pushes = (full) => state.events.filter((e) => e.kind === 'push' && !e.bot && e.repo === full).reduce((a, e) => a + (e.commits || 0), 0)

test('a counted commit that a push GitHub sent also brought in counts once', () => {
  const kept = state.events.filter((e) => e.shas)
  assert.deepEqual(kept.map((e) => [e.repo, e.shas.length, e.commits]), [[OLD, 1, 1]])
  assert.equal(pushes(OLD), 2) // the push, and the one commit it did not bring
})

test('new commits wait for each other, then count as pushes, one per author, once', async () => {
  assert.deepEqual(commitWatch(NOW).sort(), [OTHER, FULL, OLD].sort())
  assert.equal(pushes(FULL), 2) // the precondition: only the push GitHub sent
  assert.deepEqual(await readCommits(FULL, NOW), []) // 9 is ten minutes old: nothing yet
  const later = NOW + 60 * 60e3
  const out = await readCommits(FULL, later)
  const by = Object.fromEntries(out.map((e) => [e.actor, e]))
  assert.deepEqual(Object.keys(by).sort(), ['dependabot[bot]', 'quake', 'yangby-cryptape'])
  assert.equal(by.quake.commits, 3) // 9, 7 and 5; 3 was the push's head, 2 came before it
  assert.equal(by.quake.title, 'change 9')
  assert.equal(by['yangby-cryptape'].commits, 1)
  assert.equal(by['dependabot[bot]'].bot, true)
  assert.equal(by['dependabot[bot]'].commits, undefined)
  assert.equal(pushes(FULL), 6)
  assert.deepEqual(await readCommits(FULL, later), []) // read again: nothing new
  // one more commit on top: only it counts, not the ones under it again
  LISTS[FULL].unshift(commit(FULL, 'e', 'quake', iso(later)))
  const next = await readCommits(FULL, later + 60 * 60e3)
  assert.deepEqual(next.map((e) => [e.actor, e.commits]), [['quake', 1]])
  assert.equal(pushes(FULL), 7)
})

test('a push sent while the lists are read is seen at once', async () => {
  const push = { id: 'p-other', type: 'PushEvent', public: true, actor: { login: 'Ticoworld', avatar_url: '' }, repo: { name: OTHER }, payload: { ref: 'refs/heads/main', head: sha('a'), before: sha(0), size: 1 }, created_at: '2026-10-30T18:03:34Z' }
  await intake([push], 'test')
  assert.equal(pushes(OTHER), 1)
  assert.deepEqual(await readCommits(OTHER, NOW + 60 * 60e3), [])
  assert.equal(pushes(OTHER), 1)
})

test('a push that arrives late for counted commits is dropped, a new one is kept', async () => {
  const push = (id, head) => ({ id, type: 'PushEvent', public: true, actor: { login: 'quake', avatar_url: '' }, repo: { name: FULL }, payload: { ref: 'refs/heads/main', head, before: sha(3), size: 2 }, created_at: '2026-11-01T02:45:00Z' })
  assert.equal(await normalise(push('late', sha(7))), null)
  // the control: a head nobody counted yet still comes in (its title lookup fails quietly)
  const n = await normalise(push('new', sha(1)))
  assert.equal(n?.kind, 'push')
  assert.equal(n.commits, 2)
})

test('the page gets the pushes without their commit lists', () => {
  const e = snapshot().events.find((x) => x.id.startsWith('c:'))
  assert.ok(e)
  assert.equal(e.shas, undefined)
})
