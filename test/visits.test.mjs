// Visits count views and visitors per day without keeping anyone: the same browser twice is one visitor.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { initVisits, hit, visits } from '../visits.mjs'

test('views, visitors, days', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'visits-'))
  initVisits(dir)
  const t0 = Date.parse('2026-10-19T10:00:00Z')
  hit('pulse', '1.2.3.4', 'Firefox', t0); hit('pulse', '1.2.3.4', 'Firefox', t0 + 1000); hit('pulse', '1.2.3.4', 'Safari', t0 + 2000); hit('fiber', '5.6.7.8', 'Safari', t0)
  let v = visits(1, t0)
  assert.deepEqual(v.total.views, { pulse: 3, fiber: 1 })
  assert.deepEqual(v.total.visitors, { pulse: 2, fiber: 1 })
  // the next day starts fresh, and yesterday keeps only its counts
  hit('pulse', '1.2.3.4', 'Firefox', t0 + 864e5)
  v = visits(2, t0 + 864e5)
  assert.deepEqual(v.days.map((d) => d.visitors.pulse), [2, 1])
  assert.equal(v.total.views.pulse, 4)
  const raw = JSON.parse(JSON.stringify(Object.values(visits(2, t0 + 864e5).days)))
  assert.ok(raw.every((d) => !('salt' in d) && !('seen' in d)))
})

test('monitors and previews count apart, as bots', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'visits-'))
  initVisits(dir)
  const t0 = Date.parse('2026-10-26T10:00:00Z')
  const person = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36'
  for (const ua of ['sentinela/1.0', 'Mozilla/5.0+(compatible; UptimeRobot/2.0; http://www.uptimerobot.com/)', 'curl/8.19.0', 'TelegramBot (like TwitterBot)', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36', '', undefined]) hit('pulse', '9.9.9.9', ua, t0)
  hit('pulse', '1.2.3.4', person, t0)
  const v = visits(1, t0)
  assert.deepEqual(v.total.views, { pulse: 1 })
  assert.deepEqual(v.total.visitors, { pulse: 1 })
  assert.deepEqual(v.total.bots, { pulse: 7 })
})

test('a person reading three pages counts once on the site, and the count stays after the day ends', async () => {
  const { hit, visits } = await import('../visits.mjs')
  const t0 = Date.parse('2031-03-03T10:00:00Z'), ua = 'Mozilla/5.0 people-test'
  for (const page of ['pulse', 'learned', 'digest']) hit(page, '203.0.113.7', ua, t0)
  hit('pulse', '203.0.113.8', ua, t0)
  const day = (v) => v.days.find((d) => d.day === '2031-03-03')
  assert.equal(day(visits(1, t0)).people, 2)
  hit('pulse', '203.0.113.9', ua, t0 + 864e5) // the next day drops the hashes of this one
  const after = day(visits(2, t0 + 864e5))
  assert.equal(after.people, 2)
  assert.equal(after.visitors.pulse, 2)
})
