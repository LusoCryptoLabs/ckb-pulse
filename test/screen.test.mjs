// The screen for calls (?screen=1): the menu and the use page lead to it, in every language, and the page carries what
// it needs to hide its panels, skip the welcome card and offer the way out.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { GROUPS, menuHtml } from '../public/menu.js'
import { usePage } from '../use.mjs'
import { words } from '../cards.mjs'

const base = 'https://pulse.example'
const read = (f) => fs.readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8')

test('the menu has a row for the screen, in every language, with its words', () => {
  assert.ok(GROUPS.flatMap(([, rows]) => rows).some(([id, path]) => id === 'screen' && path === '/?screen=1'))
  for (const lang of ['en', 'pt', 'zh']) {
    const t = words(lang), html = menuHtml(t, { base, lang })
    assert.ok(html.includes(`${base}/?screen=1&amp;lang=${lang}`) || html.includes(`${base}/?screen=1&lang=${lang}`), lang)
    assert.ok(html.includes(t('m.screen')), lang)
    assert.doesNotMatch(html, /\bm\.screen\b/, `${lang}: a word shows its key`)
  }
})

test('the use page offers it next to the live page', () => {
  for (const lang of ['en', 'pt', 'zh']) {
    const html = usePage({ lang, base, url: `${base}/use` })
    const watch = html.slice(html.indexOf('id="watch"'), html.indexOf('id="follow"'))
    assert.ok(watch.includes('/?screen=1'), lang)
    assert.ok(watch.includes(words(lang)('use.watch.screen')), lang)
  }
})

test('the live page sets the screen class early, and has the bar and the styles that hide the panels', () => {
  const html = read('index.html'), css = read('pulse3d.css')
  assert.match(html, /get\('screen'\) === '1'/)
  assert.match(html, /id="screen-bar"/); assert.match(html, /id="screen-exit"/)
  for (const sel of ['.screen .side', '.screen .timeline', '.screen .filters', '.screen .intro']) assert.ok(css.includes(sel), sel)
  assert.match(css, /\.screen\.still, \.screen\.still \* \{ cursor: none/)
})

test('without the class the bar stays hidden', () => {
  assert.match(read('pulse3d.css'), /\.screen-bar \{ display: none; \}/)
})
