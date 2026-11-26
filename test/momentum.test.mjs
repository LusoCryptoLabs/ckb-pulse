import test from 'node:test'
import assert from 'node:assert/strict'
import { momentum } from '../momentum.mjs'

const NOW = Date.parse('2026-11-25T12:00:00Z'), DAY = 864e5
const ev = (repo, kind, actor, daysAgo, extra = {}) => ({ repo, kind, actor, at: new Date(NOW - daysAgo * DAY).toISOString(), bot: false, ...extra })

test('fifty pushes from one person do not make a project pick up', () => {
  const events = Array.from({ length: 50 }, (_, i) => ev('a/solo', 'push', 'one', 1 + (i % 5), { commits: 3 }))
  const m = momentum(events, NOW)
  assert.deepEqual(m.rising, [])
})

test('a lot of merges by one person is not picking up either', () => {
  const events = Array.from({ length: 12 }, () => ev('a/solo', 'pr_merged', 'one', 2))
  assert.deepEqual(momentum(events, NOW).rising, [])
})

test('more merged work from two people is picking up', () => {
  const events = [ev('a/team', 'pr_merged', 'x', 1), ev('a/team', 'pr_merged', 'y', 2), ev('a/team', 'pr_merged', 'x', 3), ev('a/team', 'pr_merged', 'x', 10)]
  const [r] = momentum(events, NOW).rising
  assert.equal(r.repo, 'a/team'); assert.equal(r.merged, 3); assert.equal(r.mergedBefore, 1); assert.equal(r.people, 2)
})

test('bots and agents are not counted', () => {
  const events = [ev('a/team', 'pr_merged', 'x', 1), ev('a/team', 'pr_merged', 'y', 2, { bot: true }), ev('a/team', 'pr_merged', 'z', 2, { agent: true })]
  assert.deepEqual(momentum(events, NOW).rising, [])
})

test('a project with real work last week and nothing this week is listed as quiet', () => {
  const events = [ev('a/old', 'pr_merged', 'x', 9), ev('a/old', 'pr_merged', 'y', 10), ev('a/old', 'pr_merged', 'x', 11)]
  const [q] = momentum(events, NOW).quiet
  assert.equal(q.repo, 'a/old'); assert.equal(q.mergedBefore, 3)
})

test('eighteen releases in a week are one release', () => {
  const events = Array.from({ length: 18 }, () => ev('a/rel', 'release', 'x', 1))
  const m = momentum(events, NOW)
  assert.equal(m.released.length, 1); assert.equal(m.released[0].released, true)
})
