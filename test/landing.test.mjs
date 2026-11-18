// The landing: what a first visit sees at / without a link, who skips it, which links still go straight to the live view,
// and that no page sends a reader to / when it means the live view.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { landingPage, SKIP_SCRIPT } from '../landing.mjs'
import { digestPage } from '../digest.mjs'
import { usePage, llmsTxt } from '../use.mjs'
import { methodPage } from '../method.mjs'
import { privacyPage } from '../privacy.mjs'
import { impactPage } from '../impact.mjs'
import { menuHtml } from '../public/menu.js'
import { words } from '../cards.mjs'

const base = 'https://pulse.example'
const stats = { updates: 221, people: 30, projects: 36 }
const page = (lang, o = {}) => landingPage({ lang, base, url: `${base}/`, stats, img: `${base}/og/highlights.png?p=day&lang=${lang}`, ...o })
const text = (html) => html.replace(/<style>[\s\S]*?<\/style>/, '').replace(/<script>[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

test('the landing says what Pulse is, in each language, with the last day in a sentence and three numbers', () => {
  const want = { en: '30 people worked on 36 projects of the CKB ecosystem in the last 24 hours and made 221 updates.', pt: 'Nas últimas 24 horas, 30 pessoas trabalharam em 36 projetos do ecossistema CKB e fizeram 221 atualizações.', zh: '最近 24 小时，30 人参与了 CKB 生态中的 36 个项目，共完成 221 次更新。' }
  for (const [lang, sentence] of Object.entries(want)) {
    const html = page(lang), t = words(lang)
    assert.ok(html.includes(`<p class="plain">${sentence}</p>`), lang)
    assert.match(html, /<div class="kpis"><div><b>221<\/b>/)
    assert.ok(text(html).includes(t('ld.lead')), lang)
    assert.doesNotMatch(text(html), /\b(ld|m|use|k)\.[a-z]+(\.[a-z]+)?\b/, `${lang}: a word shows its key`)
  }
})

test('one way into the live view, the week, and eight doors in two groups', () => {
  for (const lang of ['en', 'pt', 'zh']) {
    const html = page(lang)
    assert.ok(html.includes(`<a href="${base}/live?lang=${lang}">${words(lang)('ld.cta')}</a>`), `${lang}: the way in`)
    assert.equal((html.match(/<a class="card"/g) || []).length, 8, lang)
    const all = html.indexOf(`<h2>${words(lang)('use.group.all')}</h2>`), dev = html.indexOf(`<h2>${words(lang)('use.group.dev')}</h2>`)
    assert.ok(all > 0 && dev > all, `${lang}: for everyone first`)
    for (const id of ['live', 'digest', 'screen', 'add']) assert.ok(html.indexOf(`id="d-${id}"`) > all && html.indexOf(`id="d-${id}"`) < dev, id)
    for (const id of ['impact', 'badge', 'data', 'method']) assert.ok(html.indexOf(`id="d-${id}"`) > dev, id)
  }
})

test('the studio is there at the entrance: the name and the by line in the bar, the wordmark and the boilerplate lower down', () => {
  for (const lang of ['en', 'pt', 'zh']) {
    const html = page(lang), t = words(lang)
    assert.ok(html.includes('class="pm-by-lcl"') && html.includes(`<a class="pm-brand" href="${base}/?landing=1&amp;lang=${lang}">`), lang)
    assert.ok(html.includes('<div class="made">') && html.includes(t('ld.made')), lang)
    assert.equal((html.match(/lcl-wordmark(-paper)?\.svg/g) || []).length, 4, `${lang}: both wordmarks in the bar and in the band`)
  }
})

test('the landing carries a share button, preview tags and language links that keep it on the landing', () => {
  const html = page('en')
  assert.equal((html.match(/class="pshare"/g) || []).length, 1)
  assert.ok(html.includes('<meta property="og:image" content="https://pulse.example/og/highlights.png?p=day&amp;lang=en">'))
  for (const l of ['en', 'zh', 'pt']) assert.ok(html.includes(`href="${base}/?lang=${l}&amp;landing=1"`), l)
})

test('without numbers there is no sentence and no tiles, and nothing is made up', () => {
  const html = page('en', { stats: { updates: 0, people: 0, projects: 0 } }), none = page('en', { stats: null })
  for (const h of [html, none]) assert.ok(!h.includes('class="plain"') && !h.includes('class="kpis"'))
})

const run = ({ search = '', hash = '', seen = false, throws = false } = {}) => {
  const calls = []
  const ls = { getItem: (k) => { if (throws) throw new Error('blocked'); return k === 'ckbpulse.seen' && seen ? '1' : null } }
  vm.runInNewContext(SKIP_SCRIPT.replace(/^<script>/, '').replace(/<\/script>$/, ''), { location: { search, hash, replace: (u) => calls.push(u) }, localStorage: ls })
  return calls
}

test('a browser that has seen the welcome card skips the landing, with its language; a first visit and ?landing=1 stay', () => {
  assert.deepEqual(run({ seen: true, search: '?lang=pt' }), ['live?lang=pt'])
  assert.deepEqual(run({ seen: true }), ['live'])
  assert.deepEqual(run({ seen: true, search: '?theme=light&lang=zh', hash: '#x' }), ['live?theme=light&lang=zh#x'])
  assert.deepEqual(run({ seen: false, search: '?lang=pt' }), [], 'a first visit')
  assert.deepEqual(run({ seen: true, search: '?landing=1&lang=pt' }), [], 'asked for the landing')
  assert.deepEqual(run({ seen: true, search: '?lang=pt&landing=1' }), [], 'asked for the landing, later in the query')
  assert.deepEqual(run({ seen: true, throws: true }), [], 'a blocked store shows the landing instead of failing')
})

test('the script comes first in the head, so nothing is drawn before a returning visit leaves', () => {
  const html = page('en')
  assert.ok(html.indexOf(SKIP_SCRIPT) > 0 && html.indexOf(SKIP_SCRIPT) < html.indexOf('<title>'))
})

test('no page or menu sends a reader to / when it means the live view', () => {
  const rows = { period: 7, stats, bars: [1, 2], repos: [['a/b', 3]], commits: [], pushes: [], people: [['alice', 2]], orgs: [], reviewers: [], merged: [] }
  const data = { at: Date.now(), scanned: 3, total: 3, libs: { ccc: [], lumos: [], spore: [], 'ckb-std': [] }, series: [] }
  for (const lang of ['en', 'pt', 'zh']) {
    const t = words(lang)
    const pages = {
      digest: digestPage({ period: 'week', lang, leaders: { week: rows, day: rows, month: rows }, news: [], trends: null, groupOf: () => 'builders', base, url: `${base}/digest` }),
      use: usePage({ lang, base, url: `${base}/use` }), method: methodPage({ lang, base, url: `${base}/method` }), privacy: privacyPage({ lang, base, url: `${base}/privacy` }),
      impact: impactPage({ lang, base, url: `${base}/impact`, lib: 'ccc', data }), menu: menuHtml(t, { base, lang, here: '/use' }),
    }
    for (const [name, html] of Object.entries(pages)) {
      const bad = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&')).filter((h) => new RegExp(`^${base}/(\\?lang=[a-z]{2})?$`).test(h))
      assert.deepEqual(bad, [], `${name} ${lang}: links to / that mean the live view`)
    }
  }
  assert.ok(llmsTxt({ base }).includes(`[Live page](${base}/live)`))
})

const free = () => new Promise((r) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)) }) })
const get = (port, p, headers = {}) => new Promise((resolve, reject) => { http.get({ host: '127.0.0.1', port, path: p, headers }, (res) => { let body = ''; res.on('data', (c) => { body += c }); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body })) }).on('error', reject) })

test('on a running server: / is the landing, a link to something and /live are the live view', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-ld-'))
  const port = await free()
  const child = spawn(process.execPath, ['server.mjs'], { env: { ...process.env, PORT: String(port), DATA_DIR: dir, PULSE_OFFLINE: '1', GITHUB_TOKEN: 'offline' }, stdio: 'ignore' })
  try {
    for (let i = 0; i < 100; i++) { try { if ((await get(port, '/health')).status === 200) break } catch {} await new Promise((r) => setTimeout(r, 100)) }
    const isLanding = (b) => b.includes('<div class="made">') && b.includes('class="cards"')
    const isLive = (b) => b.includes('id="stage"') && b.includes('id="intro"')
    for (const p of ['/', '/?lang=pt', '/?landing=1', '/?d=2026-11-18&lang=en', '/?theme=light']) { const r = await get(port, p); assert.equal(r.status, 200, p); assert.ok(isLanding(r.body) && !isLive(r.body), `${p} is the landing`) }
    for (const p of ['/live', '/live?lang=pt', '/index.html', '/?repo=nervosnetwork/ckb', '/?person=alice', '/?h=week', '/?tab=notices', '/?about=1', '/?screen=1', '/?ui=next', '/?lang=pt&repo=a/b']) { const r = await get(port, p); assert.equal(r.status, 200, p); assert.ok(isLive(r.body) && !isLanding(r.body), `${p} is the live view`) }
    assert.equal((await get(port, '/?lang=pt')).body.includes('lang="pt"'), true)
    assert.match(String((await get(port, '/')).headers['cache-control']), /max-age=300/)
    assert.equal((await get(port, '/live')).headers['cache-control'], 'no-cache')
  } finally { child.kill(); fs.rmSync(dir, { recursive: true, force: true }) }
})
