// The landing's hero (UX review of 2026-11-25: the scene was small and the numbers were dead text): the picture the width
// of the window with the day's numbers counting up, a pulse made of the day's real hours, the last update over its foot,
// and three big cards with a picture of their own numbers, then the other doors, smaller.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { landingPage, ecgPath, COUNT_SCRIPT, WINDOW_SCRIPT } from '../landing.mjs'
import { words } from '../cards.mjs'
import { WORDS } from '../public/words.js'

const base = 'https://pulse.example'
const stats = { updates: 221, people: 30, projects: 36 }
const hours = [0, 0, 3, 5, 0, 2, 8, 14, 20, 11, 9, 7, 12, 18, 10, 6, 4, 9, 13, 7, 5, 2, 1, 0]
const week = { bars: [120, 210, 150, 90, 240, 180, 70], kinds: { code: 60, change: 25, talk: 10, version: 5, interest: 0 } }
const page = (lang = 'en', o = {}) => landingPage({ lang, base, url: `${base}/`, stats, dayBars: hours, last: { at: '2026-11-25T10:00:00Z', actor: 'ana', kind: 'push', repo: 'a/fiber' }, now: Date.parse('2026-11-25T10:20:00Z'), ...o })

test('the pulse has one beat for each hour with work, as tall as its share of the busiest hour, and is flat for a quiet hour', () => {
  assert.equal(ecgPath([]), '')
  assert.equal(ecgPath([0, 0, 0]), '', 'a day with nothing has no beats, and nothing is drawn')
  const d = ecgPath([0, 10, 0, 5])
  const y = [...d.matchAll(/L([\d.]+) ([\d.]+)/g)].map((m) => [+m[1], +m[2]])
  assert.ok(d.startsWith('M0 59.2'))
  assert.ok(y.every(([x, v]) => x >= -0.01 && x <= 1000.01 && v >= 0 && v <= 80), 'everything stays inside the picture')
  const peaks = y.filter(([, v]) => v < 59.2 - 6)
  assert.equal(peaks.length, 2, 'two hours with work, two beats')
  assert.ok(peaks[0][1] < peaks[1][1], 'the busiest hour is the taller beat')
  assert.ok(Math.abs((59.2 - peaks[1][1]) / (59.2 - peaks[0][1]) - 0.5) < 0.15, 'and half the work is about half the height')
  assert.ok(!/NaN|undefined|Infinity/.test(ecgPath(hours)))
  assert.equal(ecgPath(hours), ecgPath(hours), 'the same day gives the same line')
  const beats = (ecgPath(hours).match(/L[\d.]+ [\d.]+ L[\d.]+ [\d.]+ L[\d.]+ [\d.]+ L[\d.]+ [\d.]+ L[\d.]+ [\d.]+ L[\d.]+ [\d.]+/g) || []).length
  assert.equal(beats, hours.filter((v) => v > 0).length, 'one beat per hour with work')
})

test('the hero holds the pulse, the three numbers and the last update, all inside the picture, and the old tiles are gone', () => {
  const html = page()
  const fig = html.match(/<figure class="win"[\s\S]*?<\/figure>/)[0]
  assert.ok(fig.includes('<div class="hud"><svg class="ecg" viewBox="0 0 1000 80" preserveAspectRatio="none" role="img" aria-label="Updates by people in each of the last 24 hours, one beat per hour"><path d="M0 59.2'))
  assert.ok(fig.includes('<div class="nums"><div><b data-n="221">221</b><span>updates</span></div><div><b data-n="30">30</b><span>people</span></div><div><b data-n="36">36</b><span>projects</span></div><small>in the last 24 hours</small></div>'))
  assert.equal((fig.match(/<p class="last" id="last">/g) || []).length, 1, 'the last update is inside the picture, once')
  assert.ok(fig.includes('Last update 20 min ago: ana pushed to fiber') || /Last update 20 min ago/.test(fig))
  assert.ok(!html.includes('class="kpis"'), 'the tiles under the picture are the numbers in it now')
  assert.ok(html.indexOf('class="win"') > html.indexOf('class="go"') && html.indexOf('class="win"') < html.indexOf('class="plain"'), 'still under the buttons, above the sentence')
  assert.ok(html.includes('<p class="plain">'), 'the sentence stays: it is what a reader without scripts or a crawler gets')
  assert.ok(WINDOW_SCRIPT(base, 'en').includes("#last span"), 'the poll still finds the line')
})

test('with no pulse data or no numbers the hero shows only what is true', () => {
  const none = page('en', { dayBars: [] }), quiet = page('en', { dayBars: hours.map(() => 0) }), nostats = page('en', { stats: null })
  for (const h of [none, quiet]) assert.ok(!h.includes('class="ecg"') && h.includes('class="nums"'))
  assert.ok(!nostats.includes('class="nums"') && nostats.includes('class="ecg"') && nostats.includes('id="last"'))
})

test('the numbers count up in view, never under reduced motion, and the real number is the last thing written', () => {
  assert.equal((page().match(/querySelectorAll\('\.nums b\[data-n\]'\)/g) || []).length, 1, 'the script is in the page once')
  for (const need of ["matchMedia('(prefers-reduced-motion: reduce)').matches", "'IntersectionObserver' in window", 'io.disconnect()', 'String(to)', 'requestAnimationFrame']) assert.ok(COUNT_SCRIPT.includes(need), need)
  assert.ok(COUNT_SCRIPT.indexOf("return\nvar run") > 0 || COUNT_SCRIPT.includes('return\nvar run'), 'it stops before it touches anything when motion is reduced')
  assert.ok(!page('en', { stats: null }).includes('data-n='), 'nothing to count, nothing counted')
})

test('the picture is the width of the window, taller on a phone, and still when motion is reduced', () => {
  const html = page()
  assert.ok(html.includes('.win{width:100vw;max-width:none;margin:26px 0 0 calc(50% - 50vw);'))
  assert.ok(html.includes('body{overflow-x:clip}'), 'a full width picture must not give the page a sideways scroll')
  assert.match(html, /@media\(min-width:560px\)\{\.win\{aspect-ratio:16\/9\}\}@media\(min-width:1000px\)\{\.win\{aspect-ratio:21\/9;max-height:max\(380px,calc\(100svh - 372px\)\)\}\}/)
  assert.match(html, /@media\(prefers-reduced-motion:no-preference\)\{\.ecg path\{stroke-dasharray:1;stroke-dashoffset:1;animation:beat/, 'the line is drawn in only when motion is allowed, and is whole otherwise')
  assert.match(html, /\.win \.hud\{[^}]*padding:56px max\(16px,calc\(\(100vw - 860px\)\/2 \+ 16px\)\)/, 'the numbers line up with the column on a wide screen')
})

const lessons = 203, forum = { topics: 19, fresh: 11, people: 18 }
test('three big cards, each with a picture of its own real numbers, then the other doors without them', () => {
  const html = page('en', { week, forum, lessons })
  const cards = [...html.matchAll(/<a class="fcard" id="d-(\w+)"/g)].map((m) => m[1])
  assert.deepEqual(cards, ['digest', 'forum', 'learned'])
  const digest = html.match(/<a class="fcard" id="d-digest"[\s\S]*?<\/a>/)[0]
  assert.equal((digest.match(/<div class="bars">(.*?)<\/div>/)[1].match(/<i /g) || []).length, 7, 'the seven days')
  assert.ok(digest.includes('style="height:100%"') && digest.includes('<i data-f="code" style="flex:60;background-color:var(--f-code)"></i>') && !digest.includes('data-f="interest"'), 'the busiest day fills the chart, the mix has the kinds that had work')
  assert.ok(digest.includes('aria-hidden="true"') && digest.includes("This week's digest") && digest.includes('The week in one page'))
  const f = html.match(/<a class="fcard" id="d-forum"[\s\S]*?<\/a>/)[0]
  assert.ok(f.includes('<strong>19</strong><em>technical topics on the forum this week</em><small>11 new, 18 people</small>') && f.includes('href="https://pulse.example/forum?lang=en"'))
  assert.ok(html.match(/<a class="fcard" id="d-learned"[\s\S]*?<\/a>/)[0].includes('<strong>203</strong><em>lessons from real fixes</em>'))
  const ids = [...html.matchAll(/ id="d-(\w+)"/g)].map((m) => m[1])
  assert.equal(new Set(ids).size, ids.length, 'no door twice')
  assert.equal((html.match(/<a class="card"/g) || []).length, 8, 'the eight that are left are the small doors')
  assert.ok(html.indexOf('This week on CKB') > html.indexOf('class="plain"') && html.indexOf('This week on CKB') < html.indexOf('For everyone'), 'the big cards come before the doors')
})

test('a card with nothing to draw goes back to being a door, and nothing is made up', () => {
  const html = page('en', { week, forum: null, lessons: 0 })
  assert.deepEqual([...html.matchAll(/<a class="fcard" id="d-(\w+)"/g)].map((m) => m[1]), ['digest'])
  assert.ok(html.includes('id="d-forum"') && html.includes('id="d-learned"'), 'the forum and the lessons are doors again')
  assert.equal((html.match(/id="d-forum"/g) || []).length, 1)
  const nothing = page('en', { week: null, forum: { topics: 0, fresh: 0, people: 0 }, lessons: 0 })
  assert.ok(!nothing.includes('class="fcard"') && !nothing.includes('This week on CKB'))
  const hostile = page('en', { week: { bars: [1, 2, 3], kinds: { code: '<b>', change: -4, talk: 1.5, version: 2 } }, forum, lessons })
  assert.ok(!hostile.includes('<b>x') && /<div class="mixbar"><i data-f="version" style="flex:2;/.test(hostile), 'only whole positive counts of the five kinds are drawn')
})

test('the compare page and the forum have doors, and every word of the new hero exists in each language', () => {
  for (const lang of ['en', 'pt', 'zh']) {
    const html = page(lang), t = words(lang)
    assert.ok(html.includes(`id="d-compare" href="${base}/compare?lang=${lang}"><b>${t('m.compare')}</b><span>${t('ld.c.compare')}</span>`), lang)
    assert.ok(html.includes(`id="d-forum" href="${base}/forum?lang=${lang}"><b>${t('m.forum')}</b>`), lang)
    assert.ok(!/\bld\.[a-z.]+\b/.test(html.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<script[\s\S]*?<\/script>/g, '')), `${lang}: no word key shows`)
  }
  const keys = ['ld.hud', 'ld.ecg', 'ld.f.h', 'ld.f.forum.n', 'ld.f.forum.s', 'ld.f.learned.n', 'ld.c.forum', 'ld.c.compare']
  const holes = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join()
  for (const lang of ['en', 'pt', 'zh']) assert.deepEqual(keys.filter((k) => !WORDS[lang][k]), [], lang)
  for (const k of keys) for (const lang of ['pt', 'zh']) assert.equal(holes(WORDS[lang][k]), holes(WORDS.en[k]), `${lang} ${k}`)
})

test('on a phone the numbers, the pulse and the last update sit under the picture and never over the scene', () => {
  const html = page()
  const css = html.match(/<style>([\s\S]*?)<\/style>/)[1]
  assert.match(css, /@media\(max-width:559px\)\{\.win\{aspect-ratio:auto;max-height:none;padding-top:75vw\}\.win \.shot,\.win iframe,\.win a\.open\{inset:0 0 auto 0;height:75vw\}/, 'the picture keeps its own box, the figure leaves room under it')
  assert.match(css, /\.win \.hud\{position:static;background:none;padding:14px 16px 16px\}/, 'and the numbers are in the page flow with no veil')
  assert.match(css, /p\.plain\{font-size:16px;color:var\(--mut\)\}\}/, 'the sentence is a caption under the numbers, not a second headline')
  assert.match(css, /\.win \.shot\{object-position:62% 50%\}/, 'the crop leans to the side where the labels are')
  assert.match(css, /background:linear-gradient\(transparent,color-mix\(in srgb,var\(--bg\) 90%,transparent\) 54px,var\(--bg\) 110px\)/, 'on a wide screen the foot is nearly opaque at the numbers')
  const wide = css.indexOf('.win .hud{position:absolute'), phone = css.indexOf('@media(max-width:559px){.win{aspect-ratio:auto')
  assert.ok(wide > 0 && phone > wide, 'the phone rules come after the wide ones, so they win')
  assert.ok(html.includes('padding-top:75vw') && !/\.win \.hud\{padding-top:40px\}/.test(css), 'the old tightening of the veil is gone')
})

test('a finger gets the footer links and the name in the bar', () => {
  const html = page(), css = html.match(/<style>([\s\S]*?)<\/style>/)[1]
  assert.match(css, /@media \(pointer:coarse\)\{nav\.p>a,nav\.p>b\{[^}]*\}footer a\{display:inline-block;min-width:44px;padding:13px 6px;text-align:center\}\}/)
  assert.ok(css.indexOf('footer a{display:inline-block') > css.indexOf('footer{margin-top:44px'), 'after the footer rule, so it wins')
})
