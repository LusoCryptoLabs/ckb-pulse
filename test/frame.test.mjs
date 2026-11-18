// The colours the pages share live in theme.css, and the plain pages share one foot: a page that goes back to its
// own copy of a shared colour, or names a colour that is not defined, fails here.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { CSS, READING_CSS, langLinks, pageFoot, menuHead, THEME_SCRIPT } from '../digest.mjs'
import { menuHtml } from '../public/menu.js'
import { words } from '../cards.mjs'

const theme = fs.readFileSync(new URL('../public/theme.css', import.meta.url), 'utf8')
// the defaults are the first :root block; the trial look further down redefines the same names under a theme attribute
const root = theme.match(/:root\s*\{([\s\S]*?)\r?\n\}/)[1]
const tokens = Object.fromEntries([...root.matchAll(/(--[a-z-]+):\s*(#[0-9a-f]{6})/gi)].map(([, k, v]) => [k, v.toLowerCase()]))

test('theme.css defines the shared colours', () => {
  for (const k of ['--bg', '--surface', '--panel', '--edge', '--edge-soft', '--fg', '--mut', '--lime', '--ink']) assert.match(tokens[k] || '', /^#[0-9a-f]{6}$/, k)
})

test('the shared page css repeats none of them, and names only colours that exist', () => {
  for (const [name, css] of [['CSS', CSS], ['READING_CSS', READING_CSS]]) {
    const screen = css.split('@media print')[0]
    for (const [k, hex] of Object.entries(tokens)) assert.ok(!screen.toLowerCase().includes(hex), `${name} repeats ${k} (${hex})`)
    for (const [, k] of screen.matchAll(/var\((--[a-z-]+)/g)) assert.ok(tokens[k] || k.startsWith('--font-'), `${name} uses ${k}, which theme.css does not define`)
  }
})

test('the page foot links the same page in each language and says who made it', () => {
  const t = words('en'), url = 'https://pulse.example/method'
  const foot = pageFoot(t, url)
  for (const l of ['en', 'zh', 'pt']) assert.ok(foot.includes(`href="${url}?lang=${l}"`), l)
  assert.ok(foot.includes('github.com/LusoCryptoLabs/ckb-pulse') && foot.startsWith('<footer>') && foot.endsWith('</footer>'))
  assert.equal(langLinks((l) => `/x?l=${l}`).match(/<a /g).length, 3)
})

// the token blocks of theme.css: the dark defaults, the light set for a light device (unless dark was chosen) and the light set
// for a chosen Light must define the same names, and the two light sets must be the same text
const lightMedia = theme.match(/@media \(prefers-color-scheme: light\) \{\s*:root:not\(\[data-theme="dark"\]\) \{([\s\S]*?)\r?\n  \}\s*\}/)[1]
const lightChosen = theme.match(/:root\[data-theme="light"\] \{([\s\S]*?)\r?\n\}/)[1]
const names = (css) => [...css.matchAll(/(--[a-z-]+):/g)].map((m) => m[1]).sort()
const norm = (css) => css.replace(/\s+/g, ' ').trim()

test('the light tokens are the dark ones by name, and a light device and a chosen Light get the same', () => {
  const dark = names(root).filter((n) => !n.startsWith('--font'))
  assert.deepEqual(names(lightMedia), dark.filter((n) => n !== '--logo-dark' || true).sort())
  assert.deepEqual(names(lightChosen), names(lightMedia))
  assert.equal(norm(lightChosen), norm(lightMedia), 'the same values in both')
  for (const k of ['--f-code', '--f-change', '--f-talk', '--f-version', '--f-interest', '--sky', '--dormant', '--botcell', '--signal', '--signal-text']) assert.ok(dark.includes(k), k)
})

test('the five kinds of work are Ink, Paper, Grafite and the red in the dark look, and the light look keeps their order', () => {
  const val = (css, k) => css.match(new RegExp(k + ':\\s*(#[0-9a-fA-F]{6})'))[1].toLowerCase()
  assert.deepEqual(['--f-code', '--f-change', '--f-talk', '--f-version', '--f-interest'].map((k) => val(root, k)), ['#f4f1eb', '#ff4438', '#d9b26f', '#8e9aa6', '#6f6a60'])
  assert.deepEqual(['--f-code', '--f-change', '--f-talk', '--f-version', '--f-interest'].map((k) => val(lightChosen, k)), ['#121212', '#c90000', '#a8741a', '#5a6672', '#8f8a80'])
})

test('no green is left in the look: the lime of the first look is not in the styles the pages share', () => {
  for (const f of ['public/theme.css', 'public/menu.css', 'public/pulse3d.css', 'digest.mjs', 'badge.mjs']) {
    const text = fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    assert.ok(!/#cbf34d|rgba\(203, ?243, ?77|#8fb81f|#e2ff7a/i.test(text.replace(/var\(--lime, #cbf34d\)/gi, '')), f)
  }
})

test('the live page is set to the dark look by the server until its light scene exists, and its scene reads its colours from the tokens', () => {
  const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8')
  assert.ok(html.includes('<!--theme-->'), 'the place the server fills')
  const server = fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8')
  assert.match(server, /LIVE_THEME = `<script>document\.documentElement\.dataset\.theme='dark'<\/script>`/)
  assert.ok(server.includes(".replace('<!--theme-->', LIVE_THEME)"))
  const js = fs.readFileSync(new URL('../public/pulse3d.js', import.meta.url), 'utf8')
  for (const name of ['--bg', '--edge', '--dormant', '--botcell', '--sky']) assert.ok(js.includes(`tok('${name}'`), name)
  assert.equal((js.match(/FAMILY\[f\]/g) || []).length, 1, 'the kinds of work are read from the tokens; the constant is only the fallback, once')
})

const runTheme = ({ search = '', stored, light = false, throws = false } = {}) => {
  const store = new Map(stored === undefined ? [] : [['ckbpulse.theme', stored]])
  const ls = { getItem: (k) => { if (throws) throw new Error('blocked'); return store.has(k) ? store.get(k) : null }, setItem: (k, v) => { if (throws) throw new Error('blocked'); store.set(k, v) }, removeItem: (k) => { if (throws) throw new Error('blocked'); store.delete(k) } }
  const el = { dataset: {} }
  const code = THEME_SCRIPT.replace(/^<script>/, '').replace(/<\/script>$/, '')
  vm.runInNewContext(code, { document: { documentElement: el }, location: { search }, localStorage: ls, matchMedia: () => ({ matches: light }), URLSearchParams, Object })
  return { theme: el.dataset.theme, stored: store.get('ckbpulse.theme') }
}

test('every plain page carries the script, which sets nothing unless the person chose: Auto is the device', () => {
  assert.ok(menuHead('https://x').includes(THEME_SCRIPT))
  assert.ok(menuHead('https://x').includes('name="color-scheme" content="dark light"') && menuHead('https://x').includes('prefers-color-scheme: light'))
  assert.deepEqual(runTheme({ light: false }), { theme: undefined, stored: undefined }, 'a dark device: no attribute, the stylesheet follows it')
  assert.deepEqual(runTheme({ light: true }), { theme: undefined, stored: undefined }, 'a light device: no attribute either')
  assert.equal(runTheme({ stored: 'light', light: false }).theme, 'light', 'a choice beats the device')
  assert.equal(runTheme({ stored: 'dark', light: true }).theme, 'dark')
  assert.equal(runTheme({ stored: 'lcl-light' }).theme, 'light', 'what an earlier version kept still counts')
  assert.equal(runTheme({ stored: 'lcl' }).theme, 'dark')
})

test('a link sets the look and it is kept, auto and old clear it, and nonsense or a blocked store change nothing', () => {
  assert.deepEqual(runTheme({ search: '?theme=light', light: false }), { theme: 'light', stored: 'light' })
  assert.deepEqual(runTheme({ search: '?theme=dark', light: true }), { theme: 'dark', stored: 'dark' })
  assert.deepEqual(runTheme({ search: '?lang=pt&theme=auto', stored: 'dark' }), { theme: undefined, stored: undefined }, 'back to the device')
  assert.deepEqual(runTheme({ search: '?theme=old', stored: 'light' }), { theme: undefined, stored: undefined })
  assert.equal(runTheme({ search: '?theme=blue', stored: 'light' }).theme, 'light', 'an unknown value changes nothing')
  assert.equal(runTheme({ search: '?theme=constructor' }).theme, undefined)
  assert.equal(runTheme({ stored: 'toString' }).theme, undefined, 'a kept value must be one of ours')
  assert.equal(runTheme({ throws: true }).theme, undefined, 'private browsing: the device decides')
  assert.equal(runTheme({ search: '?theme=dark', throws: true, light: true }).theme, 'dark', 'a link still works for this page')
})

test('the menu of a plain page has Auto, Dark and Light in every language, and the live page menu has none yet', () => {
  for (const lang of ['en', 'pt', 'zh']) {
    const t = words(lang), plain = menuHtml(t, { base: 'https://x', lang, here: '/use' }), live = menuHtml(t, { base: 'https://x', lang })
    for (const v of ['auto', 'dark', 'light']) assert.ok(plain.includes(`data-theme-set="${v}"`), `${lang} ${v}`)
    assert.ok(plain.includes(t('m.auto')) && plain.includes(t('m.dark')) && plain.includes(t('m.light')) && plain.includes(t('m.theme')), lang)
    assert.doesNotMatch(plain, /m\.(theme|auto|dark|light)\b/, `${lang}: a word shows its key`)
    assert.ok(!live.includes('data-theme-set'), `${lang}: the live page is dark only until its light scene exists`)
  }
})
