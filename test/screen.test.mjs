// The screen for calls (/present): the menu, the landing and the use page lead to it, in every language; it carries its slides,
// its words and its way out; the old address (?screen=1) goes there; and the live page keeps the screen's layout for the
// frame the landing shows (?embed=1).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { GROUPS, menuHtml } from '../public/menu.js'
import { usePage } from '../use.mjs'
import { presentPage, SLIDES, CLIENT_WORDS } from '../present.mjs'
import { landingPage } from '../landing.mjs'
import { WORDS } from '../public/words.js'
import { words } from '../cards.mjs'

const base = 'https://pulse.example'
const read = (f) => fs.readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8')

test('the menu, the landing and the use page lead to the screen for calls, in every language', () => {
  assert.ok(GROUPS.flatMap(([, rows]) => rows).some(([id, path]) => id === 'screen' && path === '/present'))
  for (const lang of ['en', 'pt', 'zh']) {
    const t = words(lang), html = menuHtml(t, { base, lang })
    assert.ok(html.includes(`${base}/present?lang=${lang}`), lang)
    assert.ok(html.includes(t('m.screen')), lang)
    assert.doesNotMatch(html, /\bm\.screen\b/, `${lang}: a word shows its key`)
    assert.ok(landingPage({ lang, base, url: `${base}/`, stats: null }).includes(`${base}/present?lang=${lang}`), `${lang}: the landing`)
    const use = usePage({ lang, base, url: `${base}/use` }), watch = use.slice(use.indexOf('id="watch"'), use.indexOf('id="follow"'))
    assert.ok(watch.includes('/present?') && watch.includes(t('use.watch.screen')), `${lang}: the use page`)
  }
})

test('the screen has its five slides, each with a heading and a plain line in every language, and the words its script needs', () => {
  assert.deepEqual(SLIDES.map(([id]) => id), ['live', 'projects', 'people', 'week', 'ccc'])
  for (const lang of ['en', 'pt', 'zh']) {
    const html = presentPage({ lang, base, url: `${base}/present` }), t = words(lang)
    for (const [id] of SLIDES) {
      assert.ok(html.includes(`id="s-${id}"`), `${lang} ${id}`)
      assert.ok(html.includes(`<h2>${t('pr.' + id + '.h')}</h2>`), `${lang} ${id} heading`)
      assert.ok(t('pr.' + id + '.h') !== 'pr.' + id + '.h' && (id === 'live' ? t('pr.live.p') : t('pr.' + id + '.p')) !== 'pr.' + id + '.p', `${lang} ${id} words`)
    }
    const data = JSON.parse(html.match(/<script type="application\/json" id="pr-words">([\s\S]*?)<\/script>/)[1])
    for (const k of CLIENT_WORDS) assert.equal(data[k], WORDS[lang][k], `${lang} ${k}`)
    assert.ok(data['pr.ccc.n'].includes('{active}'), 'the placeholder is the script\'s to fill, so it travels raw')
    assert.equal(data.lang, lang)
    assert.match(html, new RegExp(`<iframe src="${base}/live\\?embed=1&amp;lang=${lang}"`), 'the scene is the live page, alone')
    assert.ok(html.includes('type="module" src="https://pulse.example/present.js"') && html.includes('name="robots" content="noindex"'))
    for (const id of ['pr-prev', 'pr-next', 'pr-play', 'pr-full', 'pr-leave', 'pr-hint', 'pr-prog']) assert.ok(html.includes(`id="${id}"`), `${lang} ${id}`)
    assert.ok(html.includes(`href="${base}/live?lang=${lang}"`), 'the way out is the live page')
    assert.ok(!/\b(pr|k|b)\.[a-z.]+\b(?=[<"])/.test(html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style>[\s\S]*?<\/style>/, '').replace(/https?:[^\s"]+/g, '')), `${lang}: a word shows its key`)
  }
  for (const lang of ['en', 'pt', 'zh']) for (const k of Object.keys(WORDS.en).filter((k) => k.startsWith('pr.'))) assert.ok(WORDS[lang][k], `${lang} ${k}`)
})

test('the script turns by itself, by key and by button, rests after three seconds, and asks only for what the live page asks for', () => {
  const js = read('present.js')
  for (const need of ["fetch('api/state')", "fetch('api/impact?lib=ccc')", "fetch('api/last?lang='", "'ArrowRight'", "'ArrowLeft'", "e.key === ' '", "e.key === 'f'", "e.key === 'Escape'", '3000', 'setInterval(load, 60000)', "toggleAttribute('inert'"]) assert.ok(js.includes(need), need)
  for (const [id] of SLIDES) assert.ok(id === 'live' || js.includes(`ready.${id}`), `${id} is passed over until it has its numbers`)
  assert.ok(!/https?:\/\//.test(js.replace(/https?:\/\/www\.w3\.org[^'"]*/g, '')), 'no outside address')
})

test('the live page keeps the screen layout for the landing frame, and the old address goes to the new page', () => {
  const html = read('index.html'), css = read('pulse3d.css')
  assert.match(html, /get\('embed'\) === '1'/)
  for (const sel of ['.screen .side', '.screen .timeline', '.screen .filters', '.screen .intro']) assert.ok(css.includes(sel), sel)
  assert.match(css, /\.screen-bar \{ display: none; \}/)
  const server = fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8')
  assert.ok(server.includes("url.searchParams.get('screen') === '1'") && server.includes('/present?lang='))
})
