// The share cards draw in every language without the network (no avatars asked for).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { highlightsCard, repoCard } from '../cards.mjs'

const PNG = [0x89, 0x50, 0x4e, 0x47]
const isPng = (b) => PNG.every((v, i) => b[i] === v) && b.length > 20000
const period = (n) => ({ stats: { updates: 120, people: 14, projects: 9 }, bars: Array.from({ length: n }, (_, i) => (i * 7) % 11), repos: [['ckb-devrel/ccc', 30]], commits: [], pushes: [], people: [], peopleCommits: [], orgs: [['ckb-devrel', 40]] })
const leaders = { day: period(24), week: period(7), month: period(30) }

for (const lang of ['en', 'pt', 'zh']) {
  test(`highlights card in ${lang}`, async () => {
    const png = await highlightsCard({ leaders, period: 'week', lang, host: 'pulse.example', groupOf: () => 'ckb-devrel' })
    assert.ok(isPng(png))
  })
}

test('project card', async () => {
  const d = { name: 'ckb-devrel/ccc', group: 'ckb-devrel', desc: 'CCC is a one-stop solution for your CKB JS/TS ecosystem development.', stars: 43, contributors: [{ login: 'a' }], daily: { days: 30, people: Array(30).fill(2), bots: Array(30).fill(1) } }
  assert.ok(isPng(await repoCard({ d, leaders, lang: 'pt', host: 'pulse.example' })))
})

// ---------- the cards added on 2026-11-02 ----------
const { fundedCard, fundedPageCard, fiberCard, useCard, grantTag, words } = await import('../cards.mjs')
const size = (b) => [b.readUInt32BE(16), b.readUInt32BE(20)]
const grant = (status) => ({ topic: 9879, name: 'Pocket Node', grant: '$15,000', since: '2026-02-11', first: Date.parse('2026-02-05'), status, commits: 750, people: 8, updates: 19, bars: [0, 50, 52, 15, 0, 16, 111, 26], milestones: [{ m: 1, at: '2026-03-03T00:00:00Z' }], delivered: status === 'delivered' ? { at: '2026-03-20T00:00:00Z' } : null, lastWork: '2026-10-20T00:00:00Z' })

for (const status of ['delivered', 'progress', 'quiet']) test(`a funded project's card, ${status}`, async () => {
  const png = await fundedCard({ g: grant(status), lang: 'pt', host: 'pulse.example' })
  assert.ok(isPng(png)); assert.deepEqual(size(png), [1200, 630])
})

test("a quiet project's card shows the date of its last work, never the word quiet", () => {
  const t = words('en')
  assert.match(grantTag(grant('delivered'), t, 64, 316), /Delivered/)
  assert.match(grantTag(grant('progress'), t, 64, 316), /In progress/)
  const quiet = grantTag(grant('quiet'), t, 64, 316)
  assert.doesNotMatch(quiet, /Quiet/i); assert.match(quiet, /Last work on GitHub/)
})

test('the funded page, the Fiber network and /use draw their cards', async () => {
  assert.ok(isPng(await fundedPageCard({ grants: [grant('delivered'), { ...grant('progress'), name: 'Fiber Link', topic: 9845 }], lang: 'zh', host: 'pulse.example' })))
  const nodes = Array.from({ length: 12 }, (_, i) => ({ id: `0x${i}`, name: i < 4 ? `node-${i}` : '' }))
  const channels = Array.from({ length: 30 }, (_, i) => ({ id: `c${i}`, a: `0x${i % 3}`, b: `0x${3 + (i % 9)}`, cap: 1000 + i * 100, asset: 'CKB' }))
  assert.ok(isPng(await fiberCard({ d: { net: 'testnet', nodes, channels, chain: { open: 30, ckb: 50000 }, block: 22947000 }, lang: 'en', host: 'pulse.example' })))
  assert.ok(isPng(await useCard({ tools: ['overview', 'find_projects', 'project', 'person', 'who_works_on', 'recent_updates', 'dao_funded', 'trends'], repos: 245, month: { updates: 5000, people: 140, projects: 120 }, lang: 'pt', host: 'pulse.example' })))
})

test('a project created this week carries the "new on CKB" ribbon and still draws', async () => {
  const d = { name: 'someone/fresh', group: 'builders', desc: 'A new thing', stars: 0, contributors: [], createdAt: new Date(Date.now() - 3 * 864e5).toISOString(), daily: { days: 30, people: Array(30).fill(1), bots: Array(30).fill(0) } }
  assert.ok(isPng(await repoCard({ d, leaders, lang: 'en', host: 'pulse.example' })))
})
