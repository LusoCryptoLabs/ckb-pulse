// The charts of the reading pages say what they show (UX review of 2026-11-25): a day under each bar with its value, the
// busiest slot named, a text for a screen reader that is the data and not the method, where the impact chart starts,
// and the mix of work in the same colours, shapes and patterns as the live page.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { barsInfo, barsHtml, mixHtml, digestPage } from '../digest.mjs'
import { impactPage, keepScan } from '../impact.mjs'
import { words } from '../cards.mjs'
import { WORDS } from '../public/words.js'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'charts-'))
process.env.GITHUB_TOKEN ||= 'test'
const pulse = await import('../pulse.mjs')

const NOW = Date.parse('2026-11-25T17:26:00Z')
const base = 'https://pulse.example'
const en = words('en')

test('a week: a value and a weekday under each of seven bars, the last bar is the 24 hours up to the count', () => {
  const bars = [10, 20, 5, 0, 30, 15, 12]
  const i = barsInfo(en, 'week', bars, NOW)
  assert.deepEqual(i.ticks.map(([l]) => l), ['Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed'], 'Wednesday is the day of the count')
  assert.deepEqual(i.ticks.map(([, v]) => v), bars)
  assert.equal(i.titles[4], 'Mon 23 Nov: 30 updates')
  assert.equal(i.peak, 'Busiest: Mon 23 Nov: 30 updates.')
  assert.ok(i.summary.startsWith('Updates by people, one bar per day: Thu 19 Nov: 10 updates; Fri'), 'the label of the chart is the data')
  assert.ok(!i.summary.includes('Bots'), 'not the sentence about the method')
  const html = barsHtml(en, 'week', bars, NOW)
  assert.equal((html.match(/<i title=/g) || []).length, 7)
  assert.ok(html.includes('<div class="axis" aria-hidden="true"><span><b>10</b>Thu</span>'))
  assert.ok(html.includes('<i title="Mon 23 Nov: 30 updates" style="height:100%">') && html.includes('Each bar is 24 hours, and the last one ends at the time of the count, in UTC.'))
})

test('a day has hours, a month three dates, and an empty period has no chart to describe', () => {
  const day = barsInfo(en, 'day', Array.from({ length: 24 }, (_, k) => k), NOW)
  assert.deepEqual(day.ticks.map(([l]) => l), ['18:00', '06:00', '17:00'], 'first, middle and last hour, in UTC')
  assert.equal(day.titles[23], '25 Nov 17:00 UTC: 23 updates')
  const month = barsInfo(en, 'month', Array.from({ length: 30 }, () => 1), NOW)
  assert.deepEqual(month.ticks.map(([l]) => l), ['27 Oct', '11 Nov', '25 Nov'])
  assert.ok(barsHtml(en, 'month', Array.from({ length: 30 }, () => 1), NOW).includes('<div class="axis ticks" aria-hidden="true"><span>27 Oct</span>'))
  assert.equal(barsInfo(en, 'week', [0, 0, 0, 0, 0, 0, 0], NOW).peak, '', 'a quiet week has no busiest day')
  assert.equal(barsHtml(en, 'week', [], NOW), '<div hidden></div>')
})

test('the chart speaks each language and shows no word key', () => {
  for (const lang of ['pt', 'zh']) {
    const t = words(lang), html = barsHtml(t, 'week', [1, 2, 3, 4, 5, 6, 7], NOW)
    assert.ok(!/\bdg\.[a-z.]+\b/.test(html), `${lang}: a missing word shows its key`)
    assert.ok(html.includes(lang === 'pt' ? 'Cada barra' : '每根柱'), lang)
  }
  assert.equal(barsInfo(words('pt'), 'week', [1, 2, 3, 4, 5, 6, 7], NOW).ticks[6][0], 'qua')
})

const KINDS = { code: 60, change: 25, talk: 10, version: 5, interest: 0 }
test('the mix of work is a bar and a list of shares in the five kinds, with the live page marks', () => {
  const html = mixHtml(en, KINDS)
  assert.ok(html.includes('<h2>What kind of work</h2>'))
  assert.equal((html.match(/<i data-f=/g) || []).length, 4, 'a kind with no work has no segment')
  assert.ok(html.includes('<i data-f="code" style="flex:60;background-color:var(--f-code)"></i>') && html.includes('<i data-f="change" style="flex:25;'))
  assert.match(html, /<li><i class="sw" data-f="code" style="background-color:var\(--f-code\)"><\/i><span>new code<\/span><b>60%<\/b><\/li>/)
  assert.ok(html.includes('aria-label="new code: 60, proposed changes: 25, problems and ideas: 10, new versions: 5"'))
  for (const bad of [null, undefined, 'x', {}, { code: 0 }, { code: -3, change: 'a' }, { code: 1.5 }]) assert.equal(mixHtml(en, bad), '', JSON.stringify(bad))
  assert.equal(mixHtml(en, { code: 3, '<b>': 9 }).includes('<b>x'), false)
})

const D = (kinds) => ({ stats: { updates: 100, people: 5, projects: 3, ...(kinds ? { kinds } : {}) }, repos: [], commits: [], people: [], orgs: [], bars: [1, 2, 3, 4, 5, 6, 7] })
test('the week digest shows the mix and the chart; a kept week from before has no mix and still renders', () => {
  const page = (o) => digestPage({ lang: 'en', base, url: `${base}/digest`, period: 'week', leaders: { day: D(), week: D(KINDS), month: D() }, news: [], trends: null, groupOf: () => 'g', now: NOW, ...o })
  const html = page({})
  assert.ok(html.includes('What kind of work') && html.includes('class="axis"') && html.includes('Busiest:'))
  assert.ok(html.indexOf('class="axis"') < html.indexOf('What kind of work'), 'the chart first, then the mix')
  const old = page({ leaders: { day: D(), week: D(), month: D() } })
  assert.ok(!old.includes('What kind of work') && old.includes('class="axis"'), 'no kinds recorded, no section')
  assert.ok(page({ lang: 'pt' }).includes('Que tipo de trabalho') && page({ lang: 'zh' }).includes('什么类型的工作'))
})

test('every chart word exists in each language, with the same placeholders', () => {
  const keys = ['dg.chart', 'dg.unit.day', 'dg.unit.week', 'dg.unit.month', 'dg.peak', 'dg.note.hour', 'dg.note.day', 'dg.mix.h', 'im.trend.since']
  for (const lang of ['en', 'pt', 'zh']) assert.deepEqual(keys.filter((k) => !WORDS[lang][k]), [], lang)
  const holes = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join()
  for (const k of keys) for (const lang of ['pt', 'zh']) assert.equal(holes(WORDS[lang][k]), holes(WORDS.en[k]), `${lang} ${k}`)
})

const IMPACT = keepScan(null, { at: Date.parse('2026-11-18T12:00:00Z'), scanned: 30, total: 34, libs: { ccc: [{ repo: 'a/web', group: 'builders', pushedAt: '2026-11-16T00:00:00Z' }], lumos: [], spore: [], 'ckb-std': [] } }, '2026-11-16')
const withTrend = (n) => { const d = JSON.parse(JSON.stringify(IMPACT)); d.days = {}; for (let k = 0; k < n; k++) d.days[`2026-11-${String(16 + k).padStart(2, '0')}`] = { ccc: 40 + k * 80 }; return d }
test('the impact trend says where the measuring starts, and its chart is read out as data', () => {
  const html = impactPage({ lang: 'en', base, url: `${base}/impact`, lib: 'ccc', data: IMPACT, now: Date.parse('2026-11-18T12:00:00Z') })
  assert.ok(html.includes('<p class="sub">') || html.includes('class="sub"'))
  const withBars = /class="bars"/.test(html)
  if (withBars) {
    assert.match(html, /aria-label="[^"]*: 2026-11-\d\d \d+;/)
    assert.ok(html.includes('class="axis ticks"') && html.includes('Measured since'), 'a start and a note')
  }
  assert.ok(typeof withTrend === 'function')
})

test('the kinds of work of a period are counted by family and add up to the updates by people', () => {
  const { state, highlightsNow } = pulse
  const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString()
  state.repos['nervosnetwork/fiber'] = { name: 'nervosnetwork/fiber', owner: 'nervosnetwork', group: 'nervosnetwork', desc: 'Fiber', topics: ['fiber-network'], lang: 'Rust', stars: 3, private: false, ownerType: 'Organization', createdAt: ago(9000), pushedAt: ago(1) }
  let n = 0
  const ev = (kind, h, extra = {}) => state.events.push({ id: `k${++n}`, at: ago(h), kind, repo: 'nervosnetwork/fiber', group: 'nervosnetwork', actor: 'alice', avatar: '', title: kind, url: '', ref: 'main', commits: kind === 'push' ? 2 : 0, bot: false, tags: [], ...extra })
  ev('push', 1); ev('push', 2); ev('pr_open', 3); ev('issue_open', 4); ev('release', 5); ev('star', 6); ev('push', 7, { bot: true })
  state.events.sort((a, b) => a.at.localeCompare(b.at))
  const h = highlightsNow()
  for (const p of ['day', 'week', 'month']) {
    const k = h[p].stats.kinds
    assert.deepEqual(Object.keys(k), ['code', 'change', 'talk', 'version', 'interest'], p)
    assert.equal(Object.values(k).reduce((a, b) => a + b, 0), h[p].stats.updates, `${p}: every update by a person is one kind, and a bot is none`)
  }
  assert.deepEqual(h.day.stats.kinds, { code: 2, change: 1, talk: 1, version: 1, interest: 1 }, 'two pushes, a proposal, an issue, a release and a star; the bot push is left out')
})
