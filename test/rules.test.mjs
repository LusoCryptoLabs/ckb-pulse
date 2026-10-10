// The rules that decide what counts: CKB work, manifests, medals that ignore bursts.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'

process.env.GITHUB_TOKEN ||= 'test'
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-test-'))
const { ckbContext, vetRepo, leaders, manifestOk } = await import('../pulse.mjs')

test('ckb alone is not chain work', () => {
  assert.equal(ckbContext({ name: 'codebase-kb-engine', description: 'Claude Code plugin: verifiable codebase knowledge base at .ckb', topics: ['ckb', 'knowledge-base'] }), false)
  assert.equal(ckbContext({ name: 'kurdish-translations', description: 'Sorani Kurdish strings', topics: ['ckb'] }), false)
  assert.equal(ckbContext({ name: 'dao-cycle', description: 'When each Nervos DAO deposit on a CKB address ends its cycle', topics: ['ckb'] }), true)
  assert.equal(ckbContext({ name: 'khie-mobile', description: 'mobile wallet for ckb', topics: [] }), true)
})

test('vetting asks for more than the word ckb', () => {
  assert.equal(vetRepo({ name: 'ckb-skill', description: '', topics: [] }), false)
  assert.equal(vetRepo({ name: 'fiber-pay', description: 'pay over fiber', topics: ['nervos'] }), true)
  assert.equal(vetRepo({ name: 'spore-demo', description: 'Spore protocol demo', topics: [] }), true)
  assert.equal(vetRepo({ name: 'linux', description: 'kernel', topics: [] }), false)
})

test('a dependency counts only in the project\'s own manifest', () => {
  assert.equal(manifestOk('package.json'), true)
  assert.equal(manifestOk('packages/core/package.json'), true)
  assert.equal(manifestOk('database/Neuron/package.json'), false)
  assert.equal(manifestOk('node_modules/x/package.json'), false)
  assert.equal(manifestOk('a/b/c/d/package.json'), false)
})

test('medals ignore bursts and branch openings, the counts do not', () => {
  const now = Date.parse('2026-10-03T21:00:00Z')
  const at = (m) => new Date(now - m * 60e3).toISOString()
  const ev = []
  // an agent as one person: 40 pull requests and 30 branches in one hour on one project
  for (let i = 0; i < 40; i++) ev.push({ repo: 'a/burst', actor: 'agent', kind: 'pr_open', at: at(50 - i) })
  for (let i = 0; i < 30; i++) ev.push({ repo: 'a/burst', actor: 'agent', kind: 'branch', at: at(40) })
  // a steady person: 12 pushes over 12 hours on another project
  for (let i = 0; i < 12; i++) ev.push({ repo: 'b/steady', actor: 'steady', kind: 'push', commits: 2, at: at(60 * i + 5) })
  ev.push({ repo: 'b/steady', actor: 'dependabot[bot]', kind: 'push', bot: true, at: at(3) })
  const L = leaders(ev, now).day
  assert.deepEqual(L.repos[0], ['b/steady', 12])
  assert.equal(L.repos.find(([r]) => r === 'a/burst')[1], 10)
  assert.deepEqual(L.commits[0], ['b/steady', 24])
  assert.equal(L.stats.updates, 82) // every update by people counts on the cards: 40 + 30 + 12, never the bot
  assert.equal(L.stats.people, 2)
})
