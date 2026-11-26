import test from 'node:test'
import assert from 'node:assert/strict'
import { scanAwards, earnedBy, hasEarned, resetAwards } from '../awards.mjs'

const pr = (actor, at, extra = {}) => ({ kind: 'pr_merged', actor, at, url: `https://github.com/a/b/pull/${at.slice(8, 10)}`, bot: false, ...extra })
const months = (login, list) => ({ login, months: list })

test('the first merged pull request is recorded once, with its proof', () => {
  resetAwards()
  scanAwards([pr('Ana', '2026-11-05T10:00:00Z'), pr('Ana', '2026-11-02T10:00:00Z')], [months('Ana', ['2026-11'])])
  const m = earnedBy('ana').find((x) => x.id === 'merged')
  assert.equal(m.id, 'merged'); assert.equal(m.date, '2026-11-02'); assert.match(m.proof, /pull\/02$/)
  scanAwards([pr('Ana', '2026-10-01T10:00:00Z')], [months('Ana', ['2026-11'])]) // an older one seen later changes nothing: already kept
  assert.equal(earnedBy('ana').find((x) => x.id === 'merged').date, '2026-11-02')
})

test('what is earned is never taken back', () => {
  resetAwards()
  scanAwards([pr('Ana', '2026-11-02T10:00:00Z')], [months('Ana', ['2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04'])])
  assert.equal(earnedBy('Ana').length, 3)
  scanAwards([], []) // the event aged out, the person went quiet
  assert.equal(earnedBy('Ana').length, 3)
})

test('the sixth month with commits earns the mark, the fifth does not', () => {
  resetAwards()
  scanAwards([], [months('Bo', ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05']), months('Cy', ['2025-12', '2026-02', '2026-03', '2026-05', '2026-07', '2026-08', '2026-09'])])
  assert.equal(hasEarned('Bo', 'months6'), false)
  assert.equal(earnedBy('Cy').find((x) => x.id === 'months6').date, '2026-08-01')
  assert.equal(earnedBy('Cy').find((x) => x.id === 'since').date, '2025-12-01')
})

test('someone who was here before the events Pulse has read is not given a first merged pull request', () => {
  resetAwards()
  const events = [pr('Old', '2026-11-02T10:00:00Z'), pr('New', '2026-11-03T10:00:00Z'), pr('Nobody', '2026-11-04T10:00:00Z'), pr('Edge', '2026-10-28T10:00:00Z')]
  scanAwards(events, [months('Old', ['2019-05', '2026-11']), months('New', ['2026-11']), months('Edge', ['2026-10'])])
  assert.equal(hasEarned('Old', 'merged'), false) // first commit in 2019
  assert.equal(hasEarned('New', 'merged'), true)
  assert.equal(hasEarned('Nobody', 'merged'), false) // no history: not known to be new
  assert.equal(hasEarned('Edge', 'merged'), true) // first commit in the month the events begin
})

test('bots and agents earn nothing', () => {
  resetAwards()
  scanAwards([pr('robot', '2026-11-02T10:00:00Z', { bot: true }), pr('agent', '2026-11-02T10:00:00Z', { agent: true }), pr('ai', '2026-11-02T10:00:00Z', { ai: true })])
  assert.deepEqual(earnedBy('robot'), []); assert.deepEqual(earnedBy('agent'), []); assert.deepEqual(earnedBy('ai'), [])
})

test('the emblem of a mark nobody earned is not drawn', async () => {
  const { earnedEmblem } = await import('../emblem.mjs')
  const svg = earnedEmblem('Ana', { id: 'merged', date: '2026-11-02' }, (k) => k)
  assert.match(svg, /^<svg /); assert.ok(!/undefined/.test(svg))
})
