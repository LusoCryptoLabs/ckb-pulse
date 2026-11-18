// One menu on every page (public/menu.js): every destination in it, in each language, the page's own row marked, and
// each page carrying it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { menuHtml, viewsHtml, barHtml, href, GROUPS, VIEWS } from '../public/menu.js'
import { words } from '../cards.mjs'
import { WORDS } from '../public/words.js'
import { usePage } from '../use.mjs'
import { methodPage } from '../method.mjs'

const base = 'https://pulse.example'
// what the menu reaches, as agreed on 2026-11-02: see, keep up, for builders
const PLACES = ['/live', '/digest?p=week', '/present', '/impact', '/?tab=notices', '/feed', '/?tab=suggest', '/use#badge', '/use#ai']

test('a path keeps its hash after the language', () => {
  assert.equal(href(base, '/use#ai', 'pt'), `${base}/use?lang=pt#ai`)
  assert.equal(href(base, '/digest?p=week', 'zh'), `${base}/digest?p=week&lang=zh`)
})

for (const lang of ['en', 'pt', 'zh']) {
  test(`the ${lang} menu has every destination and no missing word`, () => {
    const t = words(lang), html = menuHtml(t, { base, lang, current: 'digest' })
    for (const path of PLACES) assert.ok(html.includes(`href="${href(base, path, lang).replace(/&/g, '&amp;')}"`), path)
    assert.match(html, /data-act="digest" href="[^"]*" aria-current="page"/)
    assert.equal((html.match(/aria-current="page"/g) || []).length, 1)
    for (const k of html.matchAll(/>([a-z]+\.[a-z.]+)</g)) assert.fail(`word missing: ${k[1]}`)
    assert.ok(html.includes(`${base}/use?lang=${lang}`) && html.includes(`${base}/?about=1&amp;lang=${lang}`))
  })
}

test('every menu and view word exists in English', () => {
  const keys = [...GROUPS.flatMap(([g, rows]) => [g, ...rows.flatMap(([, , k, hint]) => [k, hint].filter(Boolean))]), ...VIEWS.map(([, , k]) => k), 'm.menu', 'm.views', 'm.about', 'm.all']
  assert.deepEqual(keys.filter((k) => !WORDS.en[k]), [])
})

test('the live page switches language in place, a server page links to itself in each language', () => {
  const t = words('en')
  assert.match(menuHtml(t, { lang: 'en' }), /<button type="button" data-lang="pt"/)
  const server = menuHtml(t, { base, lang: 'en', here: '/method' })
  assert.ok(server.includes('href="/method?lang=pt"') && !server.includes('data-lang='))
})

test('one view is not a switch: with the Fiber map paused the views are not drawn', () => {
  assert.equal(viewsHtml(words('en'), { base, lang: 'en', current: 'live' }), '')
})

test('the server pages open with the bar and load the menu', () => {
  const pages = {
    use: usePage({ lang: 'pt', base, url: `${base}/use` }),
    method: methodPage({ lang: 'en', base, url: `${base}/method` }),
  }
  for (const [name, html] of Object.entries(pages)) {
    assert.ok(html.includes('<div class="pm-bar">'), name)
    assert.ok(html.includes(`<link rel="stylesheet" href="${base}/menu.css">`), name)
    assert.ok(html.includes(`<script type="module" src="${base}/menu.js"></script>`), name)
  }
  assert.equal(barHtml(words('en'), { base, lang: 'en' }).startsWith('<div class="pm-bar"><span class="pm-lock"><a class="pm-brand"'), true)
})

test('the live and Fiber pages have a place for the menu and its style, and the "?" button is gone', () => {
  for (const f of ['index.html', 'fiber.html']) {
    const html = fs.readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8')
    assert.ok(html.includes('id="menu-slot"') && html.includes('id="views-slot"') && html.includes('href="menu.css"'), f)
    assert.ok(!html.includes('id="btn-help"'), f)
  }
})

test("every page loads Cellula's look, and a reading page's title lights its starred words", async () => {
  const { pageHead } = await import('../digest.mjs')
  assert.equal(pageHead({ eyebrow: 'E', title: 'a *b* <c>', lede: '' }), '<header class="hero"><span class="eyebrow">E</span><h1>a <em>b</em> &lt;c&gt;</h1></header>')
  const html = usePage({ lang: 'en', base, url: `${base}/use` })
  assert.ok(html.includes(`<link rel="stylesheet" href="${base}/theme.css">`))
  for (const f of ['index.html', 'fiber.html']) assert.ok(fs.readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8').includes('href="theme.css"'), f)
  for (const k of ['dg.h1.day', 'dg.h1.week', 'dg.h1.month', 'me.h1', 'use.h1']) assert.match(WORDS.en[k], /\*[^*]+\*/, k)
})

test('the bar says CKB Pulse and, under it, by LusoCryptoLabs with the studio wordmark, in every language', () => {
  for (const lang of ['en', 'pt', 'zh']) {
    const t = words(lang), bar = barHtml(t, { base, lang })
    assert.ok(bar.indexOf('CKB Pulse') < bar.indexOf('pm-by-lcl'), `${lang}: the name first`)
    assert.ok(bar.includes('<a class="pm-by-lcl" href="https://lusocryptolabs.com"'), lang)
    assert.ok(bar.includes(`aria-label="${t('by')}"`), `${lang}: a name for a screen reader`)
    assert.ok(bar.includes(`src="${base}/lcl-wordmark-paper.svg"`) && bar.includes(`src="${base}/lcl-wordmark.svg"`), `${lang}: both wordmarks, for a dark ground and a light one`)
  }
})

test('the two wordmark files exist and keep the red centre dot', () => {
  for (const f of ['lcl-wordmark.svg', 'lcl-wordmark-paper.svg']) {
    const svg = fs.readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8')
    assert.match(svg, /viewBox="0 0 11881 933"/, f)
    assert.match(svg, /E10600/i, f)
  }
})

test('the look has every corner straight, with the dots as the only round things', () => {
  const css = fs.readFileSync(new URL('../public/theme.css', import.meta.url), 'utf8')
  assert.match(css, /html\[lang\] \* \{ border-radius: 0 !important; \}/)
  assert.match(css, /\.pm-tile b \{ border-radius: 50% !important; \}/)
  assert.match(css, /\.eyebrow::before \{[^}]*border-radius: 50%/)
})
