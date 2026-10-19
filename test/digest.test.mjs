// The digest page and the feed render in every language, without the network, with no placeholder left unfilled.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { digestPage, feedXml, loadDigests, weeks } from '../digest.mjs'

const period = (n) => ({ stats: { updates: 120, people: 14, projects: 9 }, bars: Array.from({ length: n }, (_, i) => (i * 7) % 11), repos: [['ckb-devrel/ccc', 30], ['nervosnetwork/ckb', 12]], commits: [['ckb-devrel/ccc', 44]], pushes: [], people: [['alice', 20, ''], ['bob', 9, '']], peopleCommits: [], orgs: [['ckb-devrel', 40]] })
const leaders = { day: period(24), week: period(7), month: period(30) }
const news = [{ name: 'someone/new-thing', group: 'builders', desc: 'A new thing <on> CKB', createdAt: '2026-10-15T00:00:00Z', announcedAt: Date.parse('2026-10-16T00:00:00Z') }]
const trends = { repos: 10, of: 10, kept: 0, months: Array.from({ length: 24 }, (_, i) => ({ month: `2025-${String((i % 12) + 1).padStart(2, '0')}`, devs: 30 + i, newDevs: 2, commits: 300 })) }
const groupOf = (n) => (n.startsWith('ckb-devrel') ? 'ckb-devrel' : 'builders')

for (const lang of ['en', 'pt', 'zh']) {
  test(`digest page in ${lang}`, () => {
    for (const p of ['day', 'week', 'month']) {
      const html = digestPage({ period: p, lang, leaders, news, trends, groupOf, base: 'https://pulse.example', url: 'https://pulse.example/digest' })
      assert.match(html, /^<!doctype html>/)
      assert.match(html, /<b>120<\/b>/); assert.match(html, /ccc/); assert.match(html, /alice/)
      assert.match(html, /&lt;on&gt;/) // descriptions are text, not markup
      assert.doesNotMatch(html.replace(/<style>[\s\S]*?<\/style>/, ''), /\{\w+\}/)
      assert.match(html, /badge\/ckb\.svg/); assert.match(html, /feed\.xml/)
    }
  })
}
test('the feed lists the kept weeks and the new projects', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'digest-'))
  fs.writeFileSync(path.join(dir, 'digests.json'), JSON.stringify({ weeks: [{ at: Date.parse('2026-10-12T08:00:00Z'), stats: { updates: 500, people: 60, projects: 50 }, repos: [['ckb-devrel/ccc', 30]], commits: [], people: [['alice', 20]], orgs: [['ckb-devrel', 40]], news: [{ name: 'x/y', group: 'builders', desc: 'd' }] }] }))
  loadDigests(dir)
  assert.equal(weeks().length, 1)
  const xml = feedXml({ lang: 'en', news, groupOf, base: 'https://pulse.example' })
  assert.match(xml, /^<\?xml version="1.0" encoding="utf-8"\?>/)
  assert.equal((xml.match(/<entry>/g) || []).length, 2)
  assert.match(xml, /tag:pulse.example,2026-10-12:digest\/week/)
  assert.match(xml, /tag:pulse.example,2026-10-16:new\/someone\/new-thing/)
  assert.ok(xml.indexOf('new/someone') < xml.indexOf('digest/week'), 'newest first')
  assert.doesNotMatch(xml, /\{\w+\}/)
  assert.match(xml, /&amp;lt;on&amp;gt;/) // html inside xml, escaped twice
})
