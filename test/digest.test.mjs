// The digest page and the feed render in every language, without the network, with no placeholder left unfilled.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { digestPage, feedXml, loadDigests, weeks, digestDue } from '../digest.mjs'

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
      // a long name gives way to its count: on a 320 phone "55 atualizações" pushed the page to 330
      assert.match(html, /ol li span\{min-width:0;overflow-wrap:anywhere\}/)
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

test('the trend line reads the last whole month, as the page does', () => {
  // as on 2026-11-01: November had one person so far, October 87
  const t2 = { ...trends, months: [...trends.months.slice(0, 22), { month: '2026-10', devs: 87, newDevs: 9, commits: 1775 }, { month: '2026-11', devs: 1, newDevs: 0, commits: 3 }] }
  const html = digestPage({ period: 'week', lang: 'en', leaders, news, trends: t2, groupOf, base: 'https://pulse.example', url: 'https://pulse.example/digest' })
  assert.match(html, /87 people committed in October 2026, 9 for the first time\. A year earlier: 40, among the projects Pulse follows today./)
  // the share links carry the day they were drawn (d=2026-11-02), which is not the trend line
  assert.doesNotMatch(html.replace(/<details class="pshare">[\s\S]*?<\/details>/g, ''), /2026-11/)
})

test('a digest every Monday, even the one after a first digest on a Thursday', () => {
  const thursday = [{ at: Date.parse('2026-10-22T09:00:00Z') }]
  assert.equal(digestDue([], Date.parse('2026-10-22T09:00:00Z')), true) // the first one, whatever the day
  assert.equal(digestDue(thursday, Date.parse('2026-10-26T07:59:00Z')), false) // Monday, before 08:00
  assert.equal(digestDue(thursday, Date.parse('2026-10-26T08:01:00Z')), true) // four days after the first: still due
  const monday = [...thursday, { at: Date.parse('2026-10-26T08:01:00Z') }]
  assert.equal(digestDue(monday, Date.parse('2026-10-26T09:00:00Z')), false) // kept already
  assert.equal(digestDue(monday, Date.parse('2026-10-27T08:30:00Z')), false) // Tuesday
  assert.equal(digestDue(monday, Date.parse('2026-11-02T08:00:00Z')), true)
})

test('each kept week has an address that does not change, and the feed links to it', async () => {
  const { weekLabel, labelOf, weekByLabel } = await import('../digest.mjs')
  // the Monday digests: the week that ended on 2026-11-16 is ISO week 46
  assert.equal(weekLabel(Date.parse('2026-11-16T08:01:00Z')), '2026-W46')
  assert.equal(weekLabel(Date.parse('2026-11-09T08:01:00Z')), '2026-W45')
  assert.equal(weekLabel(Date.parse('2027-01-04T08:01:00Z')), '2026-W53') // the year turns inside a week
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'digest-weeks-'))
  fs.writeFileSync(path.join(dir, 'digests.json'), JSON.stringify({ weeks: [
    { at: Date.parse('2026-10-22T09:00:00Z'), stats: { updates: 50, people: 5, projects: 4 }, repos: [], commits: [], people: [], orgs: [], news: [] },
    { at: Date.parse('2026-10-26T08:01:00Z'), stats: { updates: 970, people: 90, projects: 99 }, repos: [['a/b', 3]], commits: [], people: [['alice', 3]], orgs: [], news: [] },
  ] }))
  loadDigests(dir)
  // the Thursday digest and the Monday after it fall in the same ISO week: the earlier one is named by its date
  assert.equal(labelOf(weeks()[1]), '2026-W43')
  assert.equal(labelOf(weeks()[0]), '2026-10-22')
  assert.equal(weekByLabel('2026-W43').stats.updates, 970)
  const feed = feedXml({ lang: 'en', news: [], groupOf, base: 'https://pulse.example' })
  assert.match(feed, /href="https:\/\/pulse\.example\/digest\/2026-W43\?lang=en"/)
  assert.match(feed, /href="https:\/\/pulse\.example\/digest\/2026-10-22\?lang=en"/)
  const page = digestPage({ period: 'week', lang: 'en', leaders: { week: { stats: weekByLabel('2026-W43').stats, repos: [], commits: [], people: [], orgs: [], bars: [] } }, news: [], trends: null, groupOf, base: 'https://pulse.example', url: 'https://pulse.example/digest', fixed: { label: '2026-W43', at: weeks()[1].at } })
  assert.match(page, /<b>970<\/b>/)
  assert.match(page, /The week 2026-W43, kept on 26 October 2026/)
  assert.match(page, /og\/digest\.png\?w=2026-W43/)
})

test('the monthly digest lists who joined, in order, with a note that it is not a ranking', () => {
  const html = digestPage({ period: 'month', lang: 'en', leaders, news, trends, groupOf, base: 'https://pulse.example', url: 'https://pulse.example/digest', arrivals: ['alice', 'bob'] })
  assert.match(html, /Joined this month/)
  assert.match(html, /person=alice[^>]*>alice<\/a> · <a[^>]*person=bob/)
  assert.match(html, /not a ranking/)
  assert.doesNotMatch(digestPage({ period: 'month', lang: 'en', leaders, news, trends, groupOf, base: 'https://pulse.example', url: 'https://pulse.example/digest' }), /Joined this month/)
})

test('the digest lists reviewers, accepted pull requests and the AI accounts apart, with the mark', () => {
  const lead = { ...leaders, week: { ...leaders.week, reviewers: [['carol', 9]], merged: [['bob', 4]], ai: [['Hanssen0-Alter-Ego', 105, '']] } }
  const html = digestPage({ period: 'week', lang: 'en', leaders: lead, news, trends, groupOf, base: 'https://pulse.example', url: 'https://pulse.example/digest' })
  assert.match(html, /Most reviews/); assert.match(html, /person=carol/)
  assert.match(html, /Most pull requests accepted/); assert.match(html, /person=bob/)
  assert.match(html, /AI accounts<\/h2>[\s\S]*Hanssen0-Alter-Ego<\/a> <em class="tag">AI<\/em>/)
  assert.doesNotMatch(digestPage({ period: 'week', lang: 'en', leaders, news, trends, groupOf, base: 'https://pulse.example', url: 'https://pulse.example/digest' }), /AI accounts/)
})

test('the digest says the community pace in the three languages, as a pace and not a goal', () => {
  for (const [lang, word] of [['en', 'The community pace'], ['pt', 'O ritmo da comunidade'], ['zh', '社区的节奏']]) {
    const html = digestPage({ period: 'week', lang, leaders, news, trends, groupOf, base: 'https://pulse.example', url: 'https://pulse.example/digest', rhythm: { week: '2026-11-09', commits: 200, median: 135 } })
    assert.ok(html.includes(word), lang)
    assert.ok(html.includes('200') && html.includes('135'), lang)
    assert.doesNotMatch(html.replace(/<style>[\s\S]*?<\/style>/, ''), /\{\w+\}/)
  }
})
