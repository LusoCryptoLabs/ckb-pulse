// One menu on every page (public/menu.js): every destination in it, in each language, the page's own row marked, and
// each page carrying it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { menuHtml, viewsHtml, barHtml, href, GROUPS, VIEWS } from '../public/menu.js'
import { words } from '../cards.mjs'
import { WORDS } from '../public/words.js'
import { usePage } from '../use.mjs'
import { fundedPage } from '../funded.mjs'

const base = 'https://pulse.example'
// what the menu reaches, as agreed on 2026-11-02: see, keep up, for builders
const PLACES = ['/', '/fiber', '/funded', '/digest?p=week', '/?tab=notices', '/feed.xml', '/?tab=suggest', '/use#badge', '/use#ai']

test('a path keeps its hash after the language', () => {
  assert.equal(href(base, '/use#ai', 'pt'), `${base}/use?lang=pt#ai`)
  assert.equal(href(base, '/digest?p=week', 'zh'), `${base}/digest?p=week&lang=zh`)
})

for (const lang of ['en', 'pt', 'zh']) {
  test(`the ${lang} menu has every destination and no missing word`, () => {
    const t = words(lang), html = menuHtml(t, { base, lang, current: 'fiber' })
    for (const path of PLACES) assert.ok(html.includes(`href="${href(base, path, lang).replace(/&/g, '&amp;')}"`), path)
    assert.match(html, /data-act="fiber" href="[^"]*" aria-current="page"/)
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
  const server = menuHtml(t, { base, lang: 'en', here: '/funded' })
  assert.ok(server.includes('href="/funded?lang=pt"') && !server.includes('data-lang='))
})

test('the views mark the page they are on', () => {
  const html = viewsHtml(words('en'), { base, lang: 'en', current: 'funded' })
  assert.match(html, /href="https:\/\/pulse\.example\/funded\?lang=en" aria-current="page">Funded</)
  assert.equal((html.match(/<a /g) || []).length, 3)
})

test('the server pages open with the bar and load the menu', () => {
  const pages = {
    use: usePage({ lang: 'pt', base, url: `${base}/use` }),
    funded: fundedPage({ lang: 'en', grants: [], base, url: `${base}/funded`, readAt: null }),
  }
  for (const [name, html] of Object.entries(pages)) {
    assert.ok(html.includes('<div class="pm-bar">'), name)
    assert.ok(html.includes(`<link rel="stylesheet" href="${base}/menu.css">`), name)
    assert.ok(html.includes(`<script type="module" src="${base}/menu.js"></script>`), name)
  }
  assert.match(pages.funded, /data-act="funded" href="[^"]*" aria-current="page"/)
  assert.equal(barHtml(words('en'), { base, lang: 'en' }).startsWith('<div class="pm-bar"><a class="pm-brand"'), true)
})

test('the live and Fiber pages have a place for the menu and its style, and the "?" button is gone', () => {
  for (const f of ['index.html', 'fiber.html']) {
    const html = fs.readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8')
    assert.ok(html.includes('id="menu-slot"') && html.includes('id="views-slot"') && html.includes('href="menu.css"'), f)
    assert.ok(!html.includes('id="btn-help"'), f)
  }
})
