// Accounts that declare themselves AI are a category of their own: marked, out of the human lists, listed apart.
// Reviews and accepted pull requests have medals of their own next to the volume ones.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-'))
process.env.GITHUB_TOKEN ||= 'test'
const pulse = await import('../pulse.mjs')
const { AI_BIO } = await import('../config.mjs')
const { state } = pulse

const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString()
const name = 'ckb-devrel/ccc'
state.repos[name] = { name, owner: 'ckb-devrel', group: 'ckb-devrel', desc: 'CKBers Codebase', topics: ['ccc'], lang: 'TypeScript', stars: 3, private: false, ownerType: 'Organization', metaAt: Date.now() }
state.orgRepos = [name]
let n = 0
const ev = (actor, h, kind = 'push', extra = {}) => state.events.push({ id: String(++n), at: ago(h), kind, repo: name, group: 'ckb-devrel', actor, avatar: '', title: `${kind} ${n}`, url: '', ref: 'main', commits: kind === 'push' ? 1 : 0, bot: false, tags: [], ...extra })
// alice pushes and reviews, bob has two accepted pull requests, the AI account does the most
ev('alice', 1); ev('alice', 2, 'review'); ev('alice', 3, 'review'); ev('bob', 4, 'pr_merged'); ev('bob', 5, 'pr_merged'); ev('lusocryptolabs', 6, 'comment')
for (let i = 0; i < 6; i++) ev('Hanssen0-Alter-Ego', 7 + i, i % 2 ? 'review' : 'comment')
state.events.sort((a, b) => a.at.localeCompare(b.at))

test('an AI account is out of the human lists and in its own, once the stored events are marked', () => {
  pulse.markAI()
  const w = pulse.highlightsNow().week
  assert.ok(!w.people.some(([l]) => l === 'Hanssen0-Alter-Ego'))
  assert.deepEqual(w.ai.map(([l, c]) => [l, c]), [['Hanssen0-Alter-Ego', 6]])
  assert.equal(w.stats.ai, 6)
  assert.ok(!w.reviewers.some(([l]) => l === 'Hanssen0-Alter-Ego'))
  assert.equal(w.people[0][0], 'alice') // the most active person is a person
})

test('reviews and accepted pull requests have their own lists', () => {
  const w = pulse.highlightsNow().week
  assert.deepEqual(w.reviewers.map(([l, c]) => [l, c]), [['alice', 2]])
  assert.deepEqual(w.merged.map(([l, c]) => [l, c]), [['bob', 2]])
})

test('the history rows carry the mark of the AI account and of the operator', () => {
  const s = pulse.snapshot().history
  const flag = (l) => s.actors.find(([x]) => x === l)?.[2]
  assert.equal(flag('Hanssen0-Alter-Ego'), 'ai')
  assert.equal(flag('lusocryptolabs'), 'op')
  assert.equal(flag('alice'), '')
})

test('a bio that says AI assistant or not a human is an AI account, a normal one is not', () => {
  for (const bio of ['AI assistant of Hanssen0. I am not a human contributor.', 'An AI agent for CKB docs', 'automated account', 'I am an AI']) assert.ok(AI_BIO.test(bio), bio)
  for (const bio of ['Rust developer, CKB core', 'Building wallets. Previously at an AI startup', 'dev advocate, human']) assert.ok(!AI_BIO.test(bio), bio)
})

test('the daily scan reads the bio of the people at the top and marks the ones that say AI', async () => {
  ev('newagent', 0.2, 'push'); ev('newagent', 0.3, 'push'); ev('newagent', 0.4, 'push'); ev('newagent', 0.5, 'push')
  state.events.sort((a, b) => a.at.localeCompare(b.at)); pulse.invalidate?.()
  globalThis.fetch = async (url) => {
    const u = String(url)
    const bio = u.endsWith('/users/newagent') ? 'AI assistant, not a human' : 'engineer'
    return new Response(JSON.stringify({ login: u.split('/').pop(), bio }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  await pulse.aiScan()
  assert.equal(pulse.isAI('newagent'), true)
  assert.equal(pulse.isAI('alice'), false)
  assert.ok(pulse.highlightsNow().week.ai.some(([l]) => l === 'newagent'))
  assert.ok(!pulse.highlightsNow().week.people.some(([l]) => l === 'newagent'))
})
