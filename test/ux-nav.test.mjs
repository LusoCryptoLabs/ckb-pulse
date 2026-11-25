// Where a person is and the way back (UX review of 2026-11-25): breadcrumbs on the reading pages and not on the live
// page, the card's address and history step, the pull that closes a card, 44 px for a finger, a short welcome card.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { crumbs, digestPage } from '../digest.mjs'
import { forumPage } from '../forum.mjs'
import { methodPage } from '../method.mjs'
import { usePage } from '../use.mjs'
import { privacyPage } from '../privacy.mjs'
import { feedPage } from '../feed.mjs'
import { impactPage, keepScan } from '../impact.mjs'
import { lessonsPage, lessonPage, startPage, glossaryPage, reviewPage } from '../lessons.mjs'
import { landingPage } from '../landing.mjs'
import { words } from '../cards.mjs'
import { WORDS } from '../public/words.js'
import { cardUrl, pullAction, handleTap, CARD_KEYS } from '../public/nav.js'

const base = 'https://pulse.example'
const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')

test('a trail starts at the live view, links every level but the last, and keeps the language', () => {
  const t = words('en')
  const html = crumbs(t, { base, lang: 'pt', trail: [['Lessons', '/learned'], ['Wallets & <keys>', '/learned?area=wallets'], ['The title', null]] })
  assert.ok(html.startsWith('<nav class="crumbs" aria-label="Breadcrumb"><ol>'))
  const items = [...html.matchAll(/<li([^>]*)>(.*?)<\/li>/g)].map((m) => [m[1], m[2]])
  assert.equal(items.length, 4)
  assert.deepEqual(items[0], ['', `<a href="${base}/live?lang=pt">Live</a>`])
  assert.deepEqual(items[1], ['', `<a href="${base}/learned?lang=pt">Lessons</a>`])
  assert.deepEqual(items[2], ['', `<a href="${base}/learned?area=wallets&amp;lang=pt">Wallets &amp; &lt;keys&gt;</a>`], 'a path with a query takes the language after it')
  assert.deepEqual(items[3], [' aria-current="page"', 'The title'], 'the last one is the page itself, not a link')
  assert.equal((html.match(/<a /g) || []).length, 3)
})

test('the trail is also given to search engines, and text from outside cannot close the script', () => {
  const t = words('en')
  const html = crumbs(t, { base, lang: 'en', trail: [['A </script><b>x</b>', null]] })
  const json = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/)[1]
  assert.ok(!json.includes('<'), 'no tag can end the script early')
  const ld = JSON.parse(json)
  assert.equal(ld['@type'], 'BreadcrumbList')
  assert.deepEqual(ld.itemListElement.map((x) => [x.position, x.name, x.item]), [[1, 'Live', `${base}/live?lang=en`], [2, 'A </script><b>x</b>', undefined]], 'the last item has no address, as the format asks')
  assert.equal(html.match(/<\/script>/g).length, 1)
})

test('on a phone the trail is one back link to the parent, and a mouse keeps the full trail', () => {
  const css = read('digest.mjs')
  assert.match(css, /@media \(max-width:600px\)\{nav\.crumbs li\{display:none\}nav\.crumbs li:nth-last-child\(2\)\{display:inline-flex\}/)
  assert.match(css, /nav\.crumbs li:nth-last-child\(2\) a::before\{content:"\\\\2039/)
  assert.match(css, /@media \(pointer:coarse\)\{nav\.crumbs a\{padding:13px 0\}/, 'a finger gets a 44 px link')
  assert.ok(css.includes('nav.crumbs li{display:inline-flex;align-items:center;min-width:0;padding:0;border:0}'), 'the generic list style of the reading pages (a line under each item) is reset')
  assert.match(css, /@media print\{nav\.crumbs\{display:none\}/)
  assert.ok(css.indexOf('@media (pointer:coarse){nav.p>a,nav.p>b{min-height:44px;display:inline-flex;align-items:center}}') > css.indexOf('nav.p{display:flex'), 'the chips are enlarged after their own rule, so the rule wins and the text is centred')
})

const LESSON = { title: 'Example lesson one', lesson: 'Do the example thing.', concepts: ['Example concept'], status: 'current', note: '', sources: [{ repo: 'owner/repo', hash: 'abc1234', subject: 'fix: an example' }] }
const LDATA = { from: '2026-11-11', to: '2026-11-18', read: 3, topics: [{ area: 'Example topic', summary: 'A summary.', lessons: [LESSON] }] }
const IMPACT = keepScan(null, { at: Date.parse('2026-11-18T12:00:00Z'), scanned: 30, total: 34, libs: { ccc: [{ repo: 'a/web', group: 'builders', pushedAt: '2026-11-16T00:00:00Z' }], lumos: [], spore: [], 'ckb-std': [] } }, '2026-11-18')
const D = { stats: { updates: 5, people: 2, projects: 1 }, repos: [], commits: [], people: [], orgs: [], bars: [] }
const trailOf = (html) => [...html.match(/<nav class="crumbs"[\s\S]*?<\/nav>/)[0].matchAll(/<li[^>]*>(?:<a [^>]*>)?([^<]*)/g)].map((m) => m[1])
const PAGES = (lang) => {
  const t = words(lang), args = { lang, base, url: `${base}/x` }
  return {
    forum: [forumPage({ ...args, data: null }), [t('bc.live'), t('fo.nav')]],
    method: [methodPage(args), [t('bc.live'), t('me.nav')]],
    use: [usePage(args), [t('bc.live'), t('use.nav')]],
    privacy: [privacyPage(args), [t('bc.live'), t('me.nav'), t('pv.nav')]],
    feed: [feedPage({ ...args, news: [], groupOf: () => 'g' }), [t('bc.live'), t('m.feed')]],
    digest: [digestPage({ ...args, period: 'week', leaders: { day: D, week: D, month: D }, news: [], trends: null, groupOf: () => 'g' }), [t('bc.live'), t('tab.top')]],
    fixedWeek: [digestPage({ ...args, period: 'week', leaders: { day: D, week: D, month: D }, news: [], trends: null, groupOf: () => 'g', fixed: { label: '2026-W47', at: 0 } }), [t('bc.live'), t('tab.top'), '2026-W47']],
    impact: [impactPage({ ...args, lib: 'ccc', data: IMPACT, now: Date.parse('2026-11-18T12:00:00Z') }), [t('bc.live'), t('im.nav')]],
    lessons: [lessonsPage({ ...args, data: LDATA }), [t('bc.live'), t('ls.nav')]],
    start: [startPage({ ...args, data: LDATA }), [t('bc.live'), t('ls.nav'), t('ls.start.nav')]],
    glossary: [glossaryPage({ ...args, data: LDATA }), [t('bc.live'), t('ls.nav'), t('ls.gloss.link')]],
    review: [reviewPage({ ...args, data: LDATA }), [t('bc.live'), t('ls.nav'), t('ls.rev.h')]],
    lesson: [lessonPage({ ...args, data: LDATA, id: 'example-topic/example-lesson-one' }), [t('bc.live'), t('ls.nav'), 'Example topic', 'Example lesson one']],
  }
}

for (const lang of ['en', 'pt', 'zh']) {
  test(`every reading page has its trail in ${lang}, with the live view first and the page last`, () => {
    for (const [name, [html, want]] of Object.entries(PAGES(lang))) {
      assert.ok(html, name)
      assert.deepEqual(trailOf(html), want, name)
      assert.equal((html.match(/<nav class="crumbs"/g) || []).length, 1, `${name}: one trail`)
      assert.ok(html.indexOf('<nav class="crumbs"') < html.indexOf('<h1'), `${name}: the trail is above the title`)
      assert.ok(html.includes('nav.crumbs{'), `${name}: the page carries the trail's style`)
      assert.ok(!/\b(bc|fo|ls)\.[a-z.]+\b/.test(html.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<script[\s\S]*?<\/script>/g, '')), `${name} in ${lang}: no word key shows`)
    }
  })
}

test('the live page, its cards and the landing page have no trail', () => {
  assert.ok(!read('public/index.html').includes('crumbs'), 'one screen with its own close')
  const t = words('en')
  assert.ok(!landingPage({ lang: 'en', base, url: `${base}/`, data: null, impact: null, menu: '' })?.includes?.('nav class="crumbs"'))
  assert.ok(!read('public/pulse3d.js').includes('nav.crumbs'))
  assert.ok(t('bc.live'))
})

test('the lesson page keeps its own links to the start and the glossary, and says nothing twice', () => {
  const html = PAGES('en').lesson[0]
  assert.match(html, /<p class="back"><a href="[^"]*\/start\?lang=en">[^<]*<\/a> · <a href="[^"]*\/glossary\?lang=en">/)
  assert.ok(!html.includes('class="back"><a href="https://pulse.example/lessons?lang=en">'), 'the way up is the trail now')
})

test('every word the trail, the welcome card and the digest note use exists in each language', () => {
  const keys = ['bc.live', 'bc.label', 'i.more', 'dg.asof', 'dg.cite']
  for (const lang of ['en', 'pt', 'zh']) assert.deepEqual(keys.filter((k) => !WORDS[lang][k]), [], lang)
})

test('the card address names only the card that is open, and keeps what else the page has', () => {
  assert.equal(cardUrl('https://p.example/live?lang=pt', 'repo', 'nervosnetwork/fiber'), '/live?lang=pt&repo=nervosnetwork%2Ffiber')
  assert.equal(cardUrl('https://p.example/?repo=a%2Fb&lang=en', 'person', 'ana'), '/?lang=en&person=ana', 'a person replaces a project')
  assert.equal(cardUrl('https://p.example/?repo=a%2Fb&person=x&lang=en'), '/?lang=en', 'no card, no card in the address')
  assert.equal(cardUrl('https://p.example/live?tab=notices&h=week#x', 'repo', 'a/b'), '/live?tab=notices&h=week&repo=a%2Fb#x')
  assert.equal(cardUrl('https://p.example/live', 'nonsense', 'a'), '/live', 'only the two known keys')
  assert.equal(cardUrl('https://p.example/live', 'repo', ''), '/live')
  assert.deepEqual(CARD_KEYS, ['repo', 'person'])
})

test('a pull from the top edge of a card: up opens the sheet fully, down closes a half sheet or lowers a full one', () => {
  const ok = { startY: 300, y: 390, top: 280, scrollTop: 0 }
  assert.equal(pullAction(ok), 'close', 'the control: a pull down on a half sheet closes it')
  assert.equal(pullAction({ ...ok, tall: true }), 'collapse', 'on a full sheet it goes back to half first')
  assert.equal(pullAction({ ...ok, y: 200 }), 'expand', 'a pull up opens a half sheet fully')
  assert.equal(pullAction({ ...ok, y: 200, tall: true }), null, 'a full sheet cannot open further')
  assert.equal(pullAction({ ...ok, sheet: false }), 'close', 'with no sheet (a tablet, a short screen) a pull down closes')
  assert.equal(pullAction({ ...ok, y: 200, sheet: false }), null, 'and a pull up does nothing')
  assert.equal(pullAction({ ...ok, tall: true, sheet: false }), 'close', 'a stale full state does not matter where there is no sheet')
  assert.equal(pullAction({ ...ok, y: 340 }), null, 'a short pull')
  assert.equal(pullAction({ ...ok, scrollTop: 40 }), null, 'a card that is scrolled is being read')
  assert.equal(pullAction({ ...ok, startY: 420 }), null, 'a pull that began in the middle of the card')
})

test('a tap on the handle toggles the sheet, and a tap on a control, or a drag, does not', () => {
  const tap = { startY: 290, y: 292, top: 280, target: { closest: () => null } }
  assert.equal(handleTap(tap), true, 'the control: a tap in the top 28 px')
  assert.equal(handleTap({ ...tap, startY: 330, y: 331 }), false, 'a tap lower down')
  assert.equal(handleTap({ ...tap, y: 320 }), false, 'a drag')
  assert.equal(handleTap({ ...tap, target: { closest: (s) => (/button/.test(s) ? {} : null) } }), false, 'the close button sits in that corner')
})

test('the card client wires the address, one history step, the pull and the focus', () => {
  const js = read('public/pulse3d.js')
  assert.match(js, /import \{ cardUrl, pullAction, handleTap \} from '\.\/nav\.js'/)
  assert.match(js, /if \(!cardStep && !linkCard\) \{ try \{ history\.pushState/, 'a card opened by the address is not a step on top of it')
  assert.match(js, /showDrawer\(\); setCardUrl\('repo', r\.name\)/)
  assert.match(js, /showDrawer\(\); setCardUrl\('person', login\)/)
  assert.match(js, /linkCard = true; try \{ openRepo\(i\) \} finally \{ linkCard = false \}/)
  assert.match(js, /linkCard = true; try \{ openPerson\(actorIdx\.get\(key\)\) \} finally \{ linkCard = false \}/)
  assert.match(js, /if \(cardStep\) \{ cardStep = false; try \{ history\.back\(\) \} catch \{\} \} else setCardUrl\(\)/)
  assert.match(js, /const act = pullAction\(point\(e\)\)/)
  assert.match(js, /if \(act === 'close'\) closeDrawer\(\); else d\.classList\.toggle\('tall', act === 'expand'\)/)
  assert.match(js, /handleTap\(\{ \.\.\.point\(e\), target: start\.target \}\)\) d\.classList\.toggle\('tall'\)/)
  assert.match(js, /\$\('drawer'\)\.hidden = false; \$\('drawer'\)\.classList\.remove\('tall'\)/, 'a card opens at half height')
  assert.match(js, /\.brand h1/, 'when what opened the card is gone, the focus goes to the top')
})

test('the forum block of a project card sits under the description, with its count, before the charts', () => {
  const js = read('public/pulse3d.js')
  const at = (s) => js.indexOf(s)
  assert.ok(at("${gh(d.url)}${badgeRow('repo', d.name)}") > 0 && at("t('d.forum')") > at("${gh(d.url)}${badgeRow('repo', d.name)}"))
  assert.ok(at("t('d.forum')") < at("t('d.month')"), 'above the 30 day chart')
  assert.match(js, /<span class="n">\$\{d\.forum\.length\}<\/span>/)
  assert.equal(js.split("t('d.forum')").length - 1, 1, 'once')
})

test('a finger gets 44 px: the header, the menu, the card and the chips', () => {
  const menu = read('public/menu.css'), live = read('public/pulse3d.css')
  assert.match(menu, /@media \(pointer: coarse\) \{\s*\.pm-btn, \.pm-bar \.ps-btn \{ min-width: 44px; height: 44px; \}/)
  assert.match(menu, /\.pm-row \{ min-height: 44px; \}/)
  assert.match(menu, /\.pm-foot a, \.pm-foot button \{ min-height: 44px;/)
  assert.match(live, /@media \(pointer: coarse\) \{\s*\.icon, \.top \.pm-btn \{ min-width: 44px; height: 44px; \}/)
  assert.match(live, /\.drawer \.close \{ width: 48px; height: 48px;/)
  assert.match(live, /\.drawer \.actions > \*, \.drawer \.gh, \.drawer \.back, \.drawer \.more[^}]*min-height: 44px/)
  assert.match(live, /@media \(pointer: coarse\) and \(max-width: 360px\) \{ \.icon, \.top \.pm-btn \{ min-width: 40px; height: 40px; \} \}/, 'the narrowest phones keep the header on one line')
  assert.ok(!/@media \(pointer: coarse\)[^{]*\{[^}]*\.pm-btn \{ width: 38px/.test(menu), 'a mouse keeps the compact size')
})

test('the welcome card puts the button after one idea, and the rest behind one tap, open on a big screen', () => {
  const html = read('public/index.html')
  const card = html.slice(html.indexOf('id="intro"'), html.indexOf('class="hud toasts"'))
  const order = ['data-t="i.title"', 'data-t="i.lead"', 'id="intro-more"', 'class="how"', 'id="legend"', '</details>', 'id="intro-go"']
  const at = order.map((s) => card.indexOf(s))
  assert.ok(at.every((n) => n > 0) && at.every((n, i) => !i || n > at[i - 1]), `in this order: ${at}`)
  assert.match(card, /<details class="more" id="intro-more"><summary data-t="i\.more"><\/summary>/)
  const js = read('public/pulse3d.js')
  assert.match(js, /\$\('intro-more'\)\.open = matchMedia\('\(min-width: 861px\) and \(min-height: 700px\)'\)\.matches/)
})

test('the digest says when it was counted and points to a fixed week to cite', () => {
  const t = words('en')
  const page = (o) => digestPage({ lang: 'en', base, url: `${base}/digest`, period: 'week', leaders: { day: D, week: D, month: D }, news: [], trends: null, groupOf: () => 'g', now: Date.parse('2026-12-02T16:05:00Z'), ...o })
  const html = page({ kept: ['2026-W49', '2026-W48'] })
  assert.ok(html.includes('Counted on 2 December 2026 at 16:05 UTC. The period moves with time.'))
  assert.ok(html.includes(`To cite a week, use a fixed one: <a href="${base}/digest/2026-W49?lang=en">2026-W49</a>`), 'the newest kept week')
  assert.ok(!page({}).includes('To cite a week'), 'no kept week, nothing to point to')
  assert.ok(!page({ kept: ['2026-W49'], period: 'day' }).includes('To cite a week'), 'a day is not a week')
  assert.ok(!page({ fixed: { label: '2026-W49', at: 0 }, kept: ['2026-W49'] }).includes('Counted on'), 'a fixed week already says when it was kept')
  assert.ok(t('dg.asof', { when: 'x' }).includes('x UTC'))
})

test('the card is a sheet from the bottom on a phone, half the screen high, and full when opened out', () => {
  const live = read('public/pulse3d.css')
  assert.match(live, /@media \(max-width: 860px\) and \(min-height: 561px\) \{\s*\.drawer \{ top: auto; height: min\(56dvh, calc\(100dvh - var\(--top\) - 150px - var\(--sab\)\)\); animation: sheet 0\.28s ease-out; \}\s*\.drawer\.tall \{ top: var\(--top\); height: auto; \}/)
  assert.match(live, /@keyframes sheet \{ from \{ transform: translateY\(28px\)/)
  assert.match(live, /@media \(prefers-reduced-motion: reduce\) \{ [^}]*\.drawer[^}]*animation: none/, 'and it keeps still for those who asked')
  assert.match(js(), /matchMedia\('\(max-width: 860px\) and \(min-height: 561px\)'\)/, 'the script and the stylesheet agree on when it is a sheet')
})
const js = () => read('public/pulse3d.js')
