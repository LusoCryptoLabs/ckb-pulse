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
