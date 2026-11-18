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
import { landingPage, SKIP_SCRIPT, lastLine, agoText } from '../landing.mjs'
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
test('the landing shows the live view in a frame of its own size, with a still of it in both looks and a link over all of it', () => {
  for (const lang of ['en', 'pt', 'zh']) {
    const html = page(lang), t = words(lang)
    assert.match(html, /<figure class="win" id="win" data-live="https:\/\/pulse\.example\/live\?embed=1&amp;lang=/, lang)
    assert.ok(html.includes('src="https://pulse.example/landing-dark.jpg" width="1280" height="720"') && html.includes('src="https://pulse.example/landing-light.jpg" width="1280" height="720"'), 'both stills, with their size, so the frame is held before they arrive')
    assert.ok(html.includes(`alt="${t('ld.shot')}"`) && (html.match(/ alt=""/g) || []).length >= 1, 'one description, not two')
    assert.ok(html.includes(`<a class="open" href="https://pulse.example/live?lang=${lang}" aria-label="${t('ld.cta')}"></a>`), 'the whole picture opens the live view')
    assert.ok(html.indexOf('class="win"') > html.indexOf('class="go"') && html.indexOf('class="win"') < html.indexOf('class="plain"'), 'under the buttons, above the sentence')
  }
  const css = page('en').match(/<style>([\s\S]*?)<\/style>/)[1]
  assert.match(css, /\.win\{[^}]*aspect-ratio:16\/9/, 'the frame has its shape before anything is in it')
  assert.match(css, /\.win \.shot\.on-dark\{display:var\(--logo-dark\)\}\.win \.shot\.on-light\{display:var\(--logo-light\)\}/, 'the still follows the look')
})

test('the live view only starts in the frame where it is welcome: wide, motion allowed, no data saver, loaded, in view', () => {
  const html = page('en'), script = html.match(/<script>(\(function\(\)\{var w=document\.getElementById\('win'\)[\s\S]*?)<\/script>/)[1]
  for (const need of ['(min-width: 720px)', '(prefers-reduced-motion: reduce)', 'saveData', 'IntersectionObserver', "addEventListener('load'", "e.data.pulse==='ready'", 'e.source===f.contentWindow']) assert.ok(script.includes(need), need)
  assert.ok(script.includes("f.setAttribute('aria-hidden','true')") && script.includes('f.tabIndex=-1'), 'a picture, not a control')
  // run it as a browser that qualifies: it adds one frame, once, and the still stays until the live view says it is ready
  const calls = { frames: [], listeners: {}, io: null }
  const frame = { contentWindow: {}, setAttribute() {} }
  const win = { dataset: { live: 'https://pulse.example/live?embed=1&lang=en' }, classList: { add: (c) => calls.live = c }, querySelector: (s) => (s === 'iframe' ? calls.frames[0] || null : {}), insertBefore: (f) => calls.frames.push(f) }
  const ctx = { document: { getElementById: (id) => (id === 'win' ? win : null), createElement: () => frame, readyState: 'complete', querySelector: () => null }, matchMedia: (q) => ({ matches: !q.includes('reduce') }), navigator: {}, IntersectionObserver: function (cb) { calls.io = cb; this.observe = () => {}; this.disconnect = () => {} }, requestIdleCallback: (f, o) => { if (!o || typeof o !== 'object') throw new TypeError('the second argument of requestIdleCallback is an options object'); f() }, setTimeout, setInterval: () => 0, fetch: () => Promise.resolve({ ok: false }), addEventListener: (n, f) => { calls.listeners[n] = f }, window: {} }
  ctx.window = ctx
  vm.runInNewContext(script, ctx)
  assert.equal(calls.frames.length, 0, 'not before the picture is in view')
  calls.io([{ isIntersecting: true }])
  assert.equal(calls.frames.length, 1); assert.equal(frame.src, 'https://pulse.example/live?embed=1&lang=en')
  assert.equal(calls.live, undefined, 'the still stays')
  calls.listeners.message({ source: {}, data: { pulse: 'ready' } }); assert.equal(calls.live, undefined, 'a message from anywhere else is not the live view')
  calls.listeners.message({ source: frame.contentWindow, data: { pulse: 'ready' } }); assert.equal(calls.live, 'live')
  // and not for a phone, a reduced-motion setting or a data saver
  for (const off of [(q) => q.includes('min-width') ? false : !q.includes('reduce'), (q) => q.includes('reduce'), null]) {
    const c2 = { ...ctx, matchMedia: off ? (q) => ({ matches: off(q) }) : ctx.matchMedia, navigator: off ? {} : { connection: { saveData: true } } }; c2.window = c2
    calls.frames.length = 0; calls.io = null; vm.runInNewContext(script, c2)
    assert.equal(calls.io, null, 'it does not even watch for the picture to come into view')
  }
})

test('the last update is a line in the page language, from the same words as the live view, and says so when there is none', () => {
  const now = Date.parse('2026-11-18T20:00:00Z'), at = (min) => new Date(now - min * 60e3).toISOString()
  const e = { at: at(14), actor: 'Hanssen0', kind: 'comment', repo: 'ckb-devrel/ccc' }
  assert.equal(lastLine(words('en'), e, now), 'Last update 14 min ago: Hanssen0 commented in ccc')
  assert.equal(lastLine(words('pt'), e, now), 'Última atualização há 14 min: Hanssen0 comentou em ccc')
  assert.equal(lastLine(words('zh'), e, now), '最近一次更新（14 分钟前）：Hanssen0 在 ccc 发表了评论')
  assert.equal(agoText(words('en'), 20e3), 'just now'); assert.equal(agoText(words('en'), 3 * 3600e3), '3 h ago'); assert.equal(agoText(words('en'), 30 * 3600e3), 'yesterday'); assert.equal(agoText(words('en'), 5 * 86400e3), '5 days ago')
  for (const lang of ['en', 'pt', 'zh']) assert.equal(lastLine(words(lang), null), words(lang)('ld.last.none'))
  assert.ok(page('en', { last: e, now }).includes('<span>Last update 14 min ago: Hanssen0 commented in ccc</span>'))
  assert.ok(page('en', { last: null }).includes(`<span>${words('en')('ld.last.none')}</span>`), 'nothing made up')
  const css = page('en').match(/<style>([\s\S]*?)<\/style>/)[1]
  assert.match(css, /\.last\{[^}]*min-height:2\.9em/, 'two lines held on a phone, one from 560 px: the line changing never moves what is under it')
})

test('the live page has a mode for the landing\'s frame: the scene alone, nothing kept in the browser, and it says when it is ready', () => {
  const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8'), js = fs.readFileSync(new URL('../public/pulse3d.js', import.meta.url), 'utf8'), css = fs.readFileSync(new URL('../public/pulse3d.css', import.meta.url), 'utf8')
  assert.ok(html.includes("get('embed') === '1'") && html.includes("h.classList.add('screen', 'embed')") && html.includes("screen || embed ? '3d'"))
  assert.ok(js.includes("const EMBED = document.documentElement.classList.contains('embed')") && js.includes('if (!n || EMBED) return') && js.includes("parent.postMessage({ pulse: 'ready' }, location.origin)"), 'no notice is marked seen from inside the frame, and the message goes to the page that framed it only')
  assert.match(css, /\.embed \.top, \.embed \.now, \.embed \.screen-bar, \.embed \.skip \{ display: none !important; \}/)
})

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
    for (const p of ['/live', '/live?lang=pt', '/index.html', '/?repo=nervosnetwork/ckb', '/?person=alice', '/?h=week', '/?tab=notices', '/?about=1', '/?ui=next', '/?lang=pt&repo=a/b']) { const r = await get(port, p); assert.equal(r.status, 200, p); assert.ok(isLive(r.body) && !isLanding(r.body), `${p} is the live view`) }
    assert.equal((await get(port, '/?lang=pt')).body.includes('lang="pt"'), true)
    assert.match(String((await get(port, '/')).headers['cache-control']), /max-age=300/)
    assert.equal((await get(port, '/live')).headers['cache-control'], 'no-cache')
    const old = await get(port, '/?screen=1&lang=pt'); assert.equal(old.status, 302); assert.equal(old.headers.location, '/present?lang=pt', 'the old address of the screen for calls')
    const pr = await get(port, '/present?lang=pt'); assert.equal(pr.status, 200); assert.ok(pr.body.includes('id="s-ccc"') && pr.body.includes('lang="pt"')); assert.equal(pr.headers['x-robots-tag'], 'noindex'); assert.equal((await get(port, '/present.js')).status, 200)
    const last = await get(port, '/api/last?lang=pt'); assert.equal(last.status, 200); const lj = JSON.parse(last.body); assert.equal(lj.at, null); assert.equal(lj.line, words('pt')('ld.last.none'), 'nothing to say and not made up'); assert.match(String(last.headers['cache-control']), /max-age=30/)
  } finally { child.kill(); fs.rmSync(dir, { recursive: true, force: true }) }
})
