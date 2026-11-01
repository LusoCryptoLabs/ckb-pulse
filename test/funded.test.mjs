// Projects the Community Fund DAO pays for are followed even when discovery cannot see them.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'funded-'))
process.env.GITHUB_TOKEN ||= 'test'
const { FUNDED } = await import('../config.mjs')
const { state, knownRepos, followFunded } = await import('../pulse.mjs')

// GitHub as it answered on 2026-11-01, cut down: none of these carries a CKB topic or a dependency code search finds
const recent = new Date(Date.now() - 864e5).toISOString()
const meta = (full, more) => ({ full_name: full, description: '', topics: [], private: false, fork: false, archived: false, pushed_at: recent, created_at: '2025-10-04T19:50:17Z', owner: { type: more?.type || 'User' }, ...more })
const GH = {
  '/repos/Keith-CY/fiber-link': meta('Keith-CY/fiber-link'),
  '/repos/someone/secret': meta('someone/secret', { private: true }),
  '/users/ickb/repos': [meta('ickb/stack', { type: 'Organization' }), meta('ickb/legacy-lumos-interface', { type: 'Organization', archived: true }), meta('ickb/old', { type: 'Organization', pushed_at: '2024-01-01T00:00:00Z' }), meta('ickb/a-fork', { type: 'Organization', fork: true })],
}
globalThis.fetch = async (url) => {
  const u = new URL(url)
  const body = u.pathname.endsWith('/events') ? [] : GH[u.pathname]
  return new Response(body ? JSON.stringify(body) : '{}', { status: body ? 200 : 404, headers: { 'content-type': 'application/json' } })
}

test('the funded list names a proposal and something to follow', () => {
  assert.ok(FUNDED.length >= 6)
  for (const f of FUNDED) {
    assert.ok(Number.isInteger(f.topic) && f.topic > 0)
    assert.ok(f.follow.length && f.follow.every((n) => /^[A-Za-z0-9-]+(\/[A-Za-z0-9_.-]+)?$/.test(n)))
  }
  const all = FUNDED.flatMap((f) => f.follow)
  for (const n of ['ickb', 'Keith-CY/fiber-link', 'invisibook-lab/invisibook']) assert.ok(all.includes(n), n)
})

test('funded projects are followed, private ones and old or archived repositories are not', async () => {
  state.groupsSeen = { builders: 0 }
  assert.ok(!knownRepos().includes('Keith-CY/fiber-link'))
  await followFunded([{ topic: 9845, follow: ['Keith-CY/fiber-link'] }, { topic: 8369, follow: ['ickb'] }, { topic: 1, follow: ['someone/secret'] }])
  const known = knownRepos()
  assert.ok(known.includes('Keith-CY/fiber-link'))
  assert.ok(known.includes('ickb/stack'))
  for (const f of ['someone/secret', 'ickb/legacy-lumos-interface', 'ickb/old', 'ickb/a-fork']) assert.ok(!known.includes(f), f)
  assert.equal(state.extra.ickb.source, 'funded')
  assert.equal(state.extra.someone, undefined) // a private repository is not even polled
  // not newcomers: the iCKB group is there, never marked new
  assert.equal(state.groupsSeen.ickb, 0)
})

// ---------- the page: reports sorted by their first words, code since the vote, the status ----------
const { classify, grantView, fundedPage } = await import('../funded.mjs')

test('reports are sorted by their first words, as the teams wrote them', () => {
  const seen = {
    'Milestone 1 Completion Report Project: Pocket Node: Mobile CKB Light Client Wallet': { kind: 'milestone', m: 1 },
    'milestone.1 已完成 代码仓库： GitHub - invisibook-lab/invisibook': { kind: 'milestone', m: 1 },
    'Milestone 3 complete: Fiber Studio v1.0.0 is live Hi everyone': { kind: 'milestone', m: 3 },
    'Milestone 2 Report for CKBoost Preface Milestone 2 focuses on': { kind: 'milestone', m: 2 },
    '[Weekly Update] Fiber Link (Milestone 2) / 周报(里程碑 2) Quick update': { kind: 'update' },
    '周报 2026.5.10 完成 Invisibook 下单、结算的zk电路': { kind: 'update' },
    'Progress update: Fiber Studio v0.1.9, upgrade when you can': { kind: 'update' },
    'Fiber Studio, DAO Grant Completion Report 1. Executive Summary': { kind: 'delivered' },
    'Pocket Node Completion Report General Pocket Node: DAO Grant Completion Report (Milestones 1 to 4)': { kind: 'delivered' },
    'Fiber Link Product Delivery Report 1. Project Overview': { kind: 'delivered' },
    'CKBoost Milestone 1 Testing Guideline Preface As we are still': { kind: 'post' },
    'Milestone 1 Follow Ups UX Improvements': { kind: 'post' },
    'Thank you all for your continued support!!': { kind: 'post' },
    '@zz_tovarishch Thanks, just to clarify, we already revealed the repo URL in the M1 report.': { kind: 'post' },
  }
  for (const [text, want] of Object.entries(seen)) assert.deepEqual(classify(text), want, text)
})

const NOW = Date.parse('2026-11-01T12:00:00Z'), wk = (iso) => Math.floor(Date.parse(iso) / 1000)
const grant = { topic: 1, name: 'Test', follow: ['a/b'], since: '2026-06-11', grant: '$6,000' }
const view = (posts, rows, events = []) => grantView(grant, { repos: ['a/b'], rows: () => rows, events, now: NOW, thread: { posts } })

test('code counts from the vote on, by people', () => {
  const g = view([], [[wk('2026-05-01'), 'x', 50], [wk('2026-06-15'), 'x', 3], [wk('2026-08-03'), 'y', 4]])
  assert.equal(g.commits, 7)
  assert.equal(g.people, 2)
  assert.equal(g.bars.reduce((a, b) => a + b, 0), 7)
  assert.equal(g.bars.length, Math.floor((NOW - Math.floor(Date.parse('2026-06-11') / 6048e5) * 6048e5) / 6048e5) + 1)
  assert.equal(view([], null).counting, true)
})

test('delivered, in progress, quiet', () => {
  const old = [[wk('2026-08-03'), 'y', 4]]
  assert.equal(view([{ n: 9, at: '2026-09-08T10:00:00Z', kind: 'delivered' }], old).status, 'delivered')
  assert.equal(view([{ n: 3, at: '2026-10-25T10:00:00Z', kind: 'update' }], old).status, 'progress')
  assert.equal(view([{ n: 3, at: '2026-08-25T10:00:00Z', kind: 'update' }], old).status, 'quiet')
  // work on any branch in the last 30 days keeps it in progress
  assert.equal(view([], old, [{ repo: 'a/b', actor: 'y', at: '2026-10-28T10:00:00Z' }]).status, 'progress')
  // a post before the vote is not a report on this grant
  assert.equal(view([{ n: 2, at: '2026-05-01T10:00:00Z', kind: 'delivered' }], old).delivered, null)
  // a plain post is not a report
  assert.equal(view([{ n: 4, at: '2026-10-30T10:00:00Z', kind: 'post' }], old).status, 'quiet')
})

test('the page names every grant in every language', () => {
  const g = view([{ n: 5, at: '2026-07-05T10:00:00Z', kind: 'milestone', m: 2 }], [[wk('2026-07-06'), 'y', 4]])
  for (const lang of ['en', 'pt', 'zh']) {
    const html = fundedPage({ lang, grants: [g], base: 'https://x', url: 'https://x/funded', readAt: NOW })
    assert.match(html, /<h2>Test<\/h2>/)
    assert.match(html, />M2</)
    assert.doesNotMatch(html, /\{\w+\}|f\.\w+/)
  }
})
