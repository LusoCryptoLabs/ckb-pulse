// Two projects side by side (UX review of 2026-11-25): what the page counts, what it highlights, what it refuses, and that
// nothing but followed projects in the shape owner/repo gets through.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { comparePage, compareJson, metricsOf, REPO } from '../compare.mjs'
import { makeMcp } from '../mcp.mjs'
import { words } from '../cards.mjs'
import { WORDS } from '../public/words.js'

const base = 'https://pulse.example'
const NOW = Date.parse('2026-11-25T17:26:00Z')
const days = (f) => Array.from({ length: 30 }, (_, i) => f(i))
// a project with steady work from many people, and one with a burst by one person and many automatic updates
const FIBER = { name: 'nervosnetwork/fiber', url: 'https://github.com/nervosnetwork/fiber', group: 'nervosnetwork', lang: 'Rust', stars: 61, desc: 'Fiber', pushedAt: '2026-11-25T12:00:00Z',
  daily: { days: 30, people: days((i) => 10 + (i % 5)), bots: days(() => 2) }, months: [{ month: '2026-10', devs: 7, commits: 90 }, { month: '2026-11', devs: 5, commits: 40 }, { month: '2026-12', devs: 1, commits: 2 }],
  contributors: [{ login: 'quake', n: 150 }, { login: 'jjyr', n: 60 }, { login: 'ann', n: 40 }] }
const BURST = { name: 'someone/ckb-keyway', url: 'https://github.com/someone/ckb-keyway', group: 'builders', lang: 'TypeScript', stars: 0, desc: '', pushedAt: '2026-11-24T00:00:00Z',
  daily: { days: 30, people: days((i) => (i === 20 ? 212 : i > 24 ? 3 : 0)), bots: days((i) => (i === 20 ? 299 : 0)) }, months: [{ month: '2026-10', devs: 1, commits: 30 }, { month: '2026-11', devs: 1, commits: 346 }, { month: '2026-12', devs: 0, commits: 0 }],
  contributors: [{ login: 'one', n: 227 }] }
// like repoDetail, the name is matched whatever its case
const detail = (n) => { const all = { [FIBER.name]: { d: FIBER, forum: [{ id: 1 }, { id: 2 }] }, [BURST.name]: { d: BURST, forum: [] } }; return all[Object.keys(all).find((k) => k.toLowerCase() === String(n).toLowerCase())] || null }
const page = (a, b, lang = 'en') => comparePage({ lang, base, url: `${base}/compare`, a, b, detail, names: [FIBER.name, BURST.name, 'bad name', '<x>/<y>'], now: NOW })

test('the figures of a project: totals, days with work, how concentrated, who, and the last whole month', () => {
  const f = metricsOf(FIBER, { forum: [1, 2] }), b = metricsOf(BURST)
  assert.deepEqual([f.people, f.bots, f.activeDays, f.contributors, f.forum, f.status], [360, 60, 30, 3, 2, 'active'])
  assert.deepEqual([f.monthDevs, f.monthCommits, f.month], [5, 40, '2026-11'], 'the last whole month is the one before the current one')
  assert.deepEqual(f.top, { login: 'quake', share: 42 })
  assert.equal(f.peakShare, Math.round((14 / 360) * 100))
  assert.deepEqual([b.people, b.bots, b.activeDays, b.peakShare, b.status], [227, 299, 6, 93, 'active'], 'one day holds 93% of the 30 days, and the automatic updates outnumber the people')
  assert.deepEqual(b.top, { login: 'one', share: 100 })
  const quiet = metricsOf({ ...BURST, daily: { days: 30, people: days((i) => (i === 3 ? 4 : 0)), bots: days(() => 0) } })
  assert.deepEqual([quiet.status, quiet.quietDays], ['quiet', 26])
  assert.equal(metricsOf({ ...BURST, daily: { days: 30, people: days(() => 0), bots: days(() => 1) } }).status, 'auto')
  assert.equal(metricsOf({ ...BURST, daily: { days: 30, people: days(() => 0), bots: days(() => 0) } }).status, 'none')
  const none = metricsOf({ ...FIBER, months: null, contributors: [] })
  assert.deepEqual([none.monthDevs, none.top, none.contributors], [null, null, 0], 'a project with no history still has a column')
  assert.equal(metricsOf({ ...FIBER, contributors: [{ login: 'x', n: 999 }] }).top.share, 100, 'a share never goes above 100')
})

test('the page shows both projects, highlights the larger of what is more work and nothing else', () => {
  const html = page(FIBER.name, BURST.name)
  assert.ok(html.includes('<th scope="col"><a href="https://pulse.example/?repo=nervosnetwork%2Ffiber&amp;lang=en">fiber</a><small>nervosnetwork</small></th>'))
  const row = (label) => html.match(new RegExp(`<th scope="row">${label}</th>(.*?)</tr>`))[1]
  assert.equal(row('Updates by people'), '<td class="hi">360</td><td>227</td>', 'more work is the larger number')
  assert.equal(row('Stars'), '<td class="hi">61</td><td>0</td>')
  assert.equal(row('Automatic updates'), '<td>60</td><td>299</td>', 'automatic updates are not highlighted: more of them is not more work')
  assert.equal(row('Share of the busiest day'), '<td>4%</td><td>93%</td>', 'a share is a fact about the work, not a score')
  assert.equal(row('Top person and share of the work'), '<td>quake<small>42%</small></td><td>one<small>100%</small></td>')
  assert.equal(row('Days with work'), '<td class="hi">30 of 30</td><td>6 of 30</td>')
  assert.equal(row('Developers, last whole month'), '<td class="hi">5</td><td>1</td>')
  assert.equal(row('Forum topics this week'), '<td class="hi">2</td><td>0</td>')
  assert.equal(row('Now'), '<td>Work by people this week</td><td>Work by people this week</td>', 'the same status, no highlight')
  const tie = page(FIBER.name, FIBER.name.toUpperCase())
  assert.ok(!tie.includes('class="hi"') && tie.includes('Choose two different projects.'), 'the same project twice is refused, whatever the case')
  assert.ok(html.includes('The updates, days and people are the last 30 days. A bigger number is more work, not a better project.'))
})

test('the two day charts share one scale, with their days and values', () => {
  const html = page(FIBER.name, BURST.name)
  const heights = [...html.matchAll(/<i title="[^"]*" style="height:(\d+)%">/g)].map((m) => +m[1])
  assert.equal(heights.length, 60)
  assert.equal(Math.max(...heights), 100, 'the larger project fills the scale')
  assert.equal(Math.max(...heights.slice(0, 30)), 7, 'and the other is drawn against that same scale (14 of 212)')
  assert.ok(html.includes('<h3>nervosnetwork/fiber</h3>') && html.includes('<h3>someone/ckb-keyway</h3>'))
  assert.ok(html.includes('Busiest: ') && html.includes('class="axis ticks"'))
})

test('a project Pulse does not follow, a bad name, or nothing at all gets a plain message, not a table', () => {
  const none = page('', '')
  assert.ok(none.includes('Choose two projects Pulse follows to see them side by side.') && !none.includes('<table'))
  assert.ok(page(FIBER.name, 'ghost/none').includes('Pulse does not follow ghost/none.'))
  assert.ok(page('<script>alert(1)</script>', 'a/b').includes('Pulse does not follow &lt;script&gt;alert(1)&lt;/script&gt;, a/b.'))
  assert.ok(!page('<script>alert(1)</script>', 'a/b').includes('<script>alert'))
  assert.ok(page(FIBER.name, '').includes('Choose two projects Pulse follows'), 'one project: the form keeps it')
  assert.ok(page(FIBER.name, '').includes('value="nervosnetwork/fiber"'))
  for (const bad of ['', 'x', 'a/b/c', 'a b/c', '../x', 'a/' + 'b'.repeat(101), '/x', 'x/', 'a/<b>']) assert.equal(REPO.test(bad), false, bad)
  for (const good of ['nervosnetwork/fiber', 'ckb-devrel/ccc', 'LusoCryptoLabs/ckb-pulse', 'a/b.c_d-e']) assert.equal(REPO.test(good), true, good)
})

test('the form lists only well formed followed names, escaped, and the page is not indexed', () => {
  const html = page('', '')
  assert.ok(html.includes('<datalist id="cmp-projects"><option value="nervosnetwork/fiber"></option><option value="someone/ckb-keyway"></option></datalist>'), 'a name that is not owner/repo is left out')
  assert.ok(html.includes('<meta name="robots" content="noindex">'))
  assert.ok(html.includes('table.cmp small{display:block;'), 'the owner sits under the name, in the column heads too')
  assert.ok(html.includes('<form class="cmp" method="get" action="https://pulse.example/compare"><input type="hidden" name="lang" value="en">'))
  assert.ok(html.includes('list="cmp-projects"') && html.includes('placeholder="nervosnetwork/fiber"'))
})

test('the page has its trail and speaks each language, with no word key showing', () => {
  for (const lang of ['en', 'pt', 'zh']) {
    const html = page(FIBER.name, BURST.name, lang), t = words(lang)
    assert.ok(html.includes(`<li aria-current="page">${t('cmp.nav')}</li>`) && html.includes(`>${t('bc.live')}</a>`), lang)
    assert.ok(!/\b(cmp|bc|d\.st|m)\.[a-zA-Z.]+\b/.test(html.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<script[\s\S]*?<\/script>/g, '')), `${lang}: no word key`)
  }
  assert.ok(page(FIBER.name, BURST.name, 'pt').includes('Dias com trabalho') && page(FIBER.name, BURST.name, 'zh').includes('有工作的天数'))
  assert.ok(page(FIBER.name, BURST.name, 'zh').includes('30 天中的 30 天') || page(FIBER.name, BURST.name, 'zh').includes('30 天中的 30'))
})

test('every compare word exists in each language with the same placeholders', () => {
  const keys = Object.keys(WORDS.en).filter((k) => /^(cmp\.|m\.compare|d\.compare|use\.compare|use\.api\.compare|use\.tool\.compare_projects)/.test(k))
  assert.ok(keys.length >= 30)
  const holes = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join()
  for (const lang of ['pt', 'zh']) { assert.deepEqual(keys.filter((k) => !WORDS[lang][k]), [], lang); for (const k of keys) assert.equal(holes(WORDS[lang][k]), holes(WORDS.en[k]), `${lang} ${k}`) }
})

test('the JSON is the two projects and the same note; an agent gets it from one tool', async () => {
  const j = compareJson(metricsOf(FIBER), metricsOf(BURST))
  assert.deepEqual([j.days, j.a.name, j.b.name], [30, FIBER.name, BURST.name])
  assert.match(j.note, /not a better project/)
  const mcp = makeMcp({ compare: (x, y) => (detail(x) && detail(y) ? compareJson(metricsOf(detail(x).d), metricsOf(detail(y).d)) : null) })
  const call = async (args) => (await mcp({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'compare_projects', arguments: args } }, { base })).json.result
  const ok = JSON.parse((await call({ a: FIBER.name, b: BURST.name })).content[0].text)
  assert.equal(ok.a.people, 360); assert.ok(ok.pulse.endsWith('/compare?a=nervosnetwork%2Ffiber&b=someone%2Fckb-keyway'))
  for (const args of [{ a: FIBER.name, b: FIBER.name }, { a: FIBER.name, b: 'ghost/none' }, { a: 'not a repo', b: BURST.name }]) assert.equal((await call(args)).isError, true, JSON.stringify(args))
})

test('the live page, the menu, the card and the docs lead to it', () => {
  const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
  assert.match(read('public/menu.js'), /\['compare', '\/compare', 'm\.compare', '', 'VS'\]/)
  assert.match(read('public/pulse3d.js'), /<a class=\\?"gh cmp-link\\?" href=\\?"compare\?a=\$\{encodeURIComponent\(r\.name\)\}&lang=\$\{LANG\}\\?">/)
  assert.match(read('server.mjs'), /if \(url\.pathname === '\/compare'\)/)
  assert.match(read('server.mjs'), /if \(url\.pathname === '\/api\/compare'\)/)
  assert.ok(read('README.md').includes('GET /compare?a=owner/repo&b=owner/repo'))
  assert.ok(path && os, 'imports used')
})
