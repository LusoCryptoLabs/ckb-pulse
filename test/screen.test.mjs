// The screen for calls (/present): the menu, the landing and the use page lead to it, in every language; it is one page with its
// numbers, its words and its way out; the old address (?screen=1) goes there; and the live page keeps the screen's layout for the
// frame the landing shows (?embed=1).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { GROUPS, menuHtml } from '../public/menu.js'
import { usePage } from '../use.mjs'
import { presentPage, CLIENT_WORDS } from '../present.mjs'
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

test('the screen is one page with the numbers, the two lists, the scene and the latest updates, in every language, with the words its script needs', () => {
  for (const lang of ['en', 'pt', 'zh']) {
    const html = presentPage({ lang, base, url: `${base}/present` }), t = words(lang)
    for (const id of ['n-up', 'n-people', 'n-projects', 'week', 'ccc', 'r-projects', 'r-people', 'feed', 'scene', 'clock', 'pr-full', 'pr-leave']) assert.ok(html.includes(`id="${id}"`), `${lang} ${id}`)
    for (const k of ['pr.sub', 'pr.last24', 'pr.latest', 'pr.projects.h', 'pr.people.h', 'pr.leave', 'k.updates', 'k.people', 'k.projects']) assert.ok(html.includes(t(k)) && t(k) !== k, `${lang} ${k}`)
    const data = JSON.parse(html.match(/<script type="application\/json" id="pr-words">([\s\S]*?)<\/script>/)[1])
    for (const k of CLIENT_WORDS) assert.equal(data[k], WORDS[lang][k] ?? WORDS.en[k], `${lang} ${k}`)
    for (const k of ['pr.week.line', 'pr.ccc.line', 'ago.min', 'v.comment']) assert.ok(/\{\w+\}/.test(data[k]), `${k} travels raw, with its placeholders`)
    assert.equal(data.lang, lang)
    assert.ok(html.includes(`data-live="${base}/live?embed=1&amp;lang=${lang}"`), 'the scene is the live page, alone')
    assert.ok(html.includes(`<img class="shot on-dark" src="${base}/landing-dark.jpg"`) && html.includes(`<img class="shot on-light" src="${base}/landing-light.jpg"`), 'a still of it until it runs, and for a phone')
    assert.ok(html.includes('type="module" src="https://pulse.example/present.js"') && html.includes('name="robots" content="noindex"'))
    assert.ok(html.includes(`href="${base}/live?lang=${lang}"`), 'the way out is the live page')
    assert.ok(!/\b(pr|k|b|v)\.[a-z.]+\b(?=[<"])/.test(html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style>[\s\S]*?<\/style>/, '').replace(/https?:[^\s"]+/g, '')), `${lang}: a word shows its key`)
  }
  for (const lang of ['en', 'pt', 'zh']) for (const k of Object.keys(WORDS.en).filter((k) => k.startsWith('pr.'))) assert.ok(WORDS[lang][k], `${lang} ${k}`)
})

test('the screen fits a projector, a laptop window and a phone: a grid that holds the height on a wide window, one column that scrolls elsewhere', () => {
  const css = presentPage({ lang: 'en', base, url: base }).match(/<style>([\s\S]*?)<\/style>/)[1]
  assert.ok(css.includes('@media(min-width:900px) and (min-height:520px){') && css.includes('height:100dvh;overflow:hidden;display:grid'), 'a wide window holds its own height')
  assert.ok(css.includes('grid-template-areas:"top top top" "nums scene lists" "feed feed feed"'))
  assert.ok(css.includes('font-size:clamp(11px,min(1.9vh,1.1vw),26px)'), 'type follows the window, so a projector reads from the back')
  assert.ok(/body\.pr\{margin:0;[^}]*padding:16px 16px 48px\}/.test(css), 'elsewhere it is an ordinary page that scrolls')
  assert.ok(!/position:fixed/.test(css), 'nothing floats over anything else')
})

test('the script fills the numbers and the lists from the live page\'s own calls, takes new updates as they happen, and starts the scene only where it is welcome', () => {
  const js = read('present.js')
  for (const need of ["fetch('api/state')", "fetch('api/impact?lib=ccc')", "new EventSource('api/stream')", 'setInterval(load, 60000)', "(min-width: 900px) and (min-height: 520px)", '(prefers-reduced-motion: reduce)', 'saveData', "e.source === f.contentWindow", "e.data?.pulse === 'ready'", '.filter((e) => !e.bot)']) assert.ok(js.includes(need), need)
  assert.ok(!/https?:\/\//.test(js), 'no outside address')
  assert.ok(!js.includes('setTimeout(() => step'), 'nothing turns by itself')
})

test('the live page keeps the screen layout for the landing frame, and the old address goes to the new page', () => {
  const html = read('index.html'), css = read('pulse3d.css')
  assert.match(html, /get\('embed'\) === '1'/)
  for (const sel of ['.screen .side', '.screen .timeline', '.screen .filters', '.screen .intro']) assert.ok(css.includes(sel), sel)
  assert.match(css, /\.screen-bar \{ display: none; \}/)
  const server = fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8')
  assert.ok(server.includes("url.searchParams.get('screen') === '1'") && server.includes('/present?lang='))
})
