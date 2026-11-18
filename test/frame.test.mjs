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

test('the trial look redefines only names the defaults have, and the live page is not given the attribute', () => {
  const trial = theme.slice(theme.indexOf('A trial look'))
  const names = new Set([...trial.matchAll(/(--[a-z-]+):\s*[^;]+;/g)].map((m) => m[1]))
  for (const n of names) assert.ok(n in tokens || ['--signal', '--signal-text', '--font-ui', '--font-num', '--pm-glass', '--pm-line', '--pm-soft'].includes(n), n)
  assert.equal(fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8').includes('data-theme'), false)
})

const runTheme = ({ search = '', stored, light = false, throws = false } = {}) => {
  const store = new Map(stored === undefined ? [] : [['ckbpulse.theme', stored]])
  const ls = { getItem: (k) => { if (throws) throw new Error('blocked'); return store.has(k) ? store.get(k) : null }, setItem: (k, v) => { if (throws) throw new Error('blocked'); store.set(k, v) } }
  const el = { dataset: {} }
  const code = THEME_SCRIPT.replace(/^<script>/, '').replace(/<\/script>$/, '')
  vm.runInNewContext(code, { document: { documentElement: el }, location: { search }, localStorage: ls, matchMedia: () => ({ matches: light }), URLSearchParams, Object })
  return { theme: el.dataset.theme, stored: store.get('ckbpulse.theme') }
}

test('every plain page carries the script that picks the look: the choice, else the system', () => {
  assert.ok(menuHead('https://x').includes(THEME_SCRIPT))
  assert.deepEqual(runTheme({ light: false }), { theme: 'lcl', stored: undefined }, 'a dark system gets the dark look, and nothing is written')
  assert.deepEqual(runTheme({ light: true }), { theme: 'lcl-light', stored: undefined }, 'a light system gets the light look')
  assert.equal(runTheme({ stored: 'lcl-light', light: false }).theme, 'lcl-light', 'a choice beats the system')
  assert.equal(runTheme({ stored: 'lcl', light: true }).theme, 'lcl')
  assert.equal(runTheme({ stored: 'old', light: true }).theme, undefined, 'the old look is no theme at all')
})

test('a link can set the look and it is kept; nonsense and a blocked store fall back to the system', () => {
  assert.deepEqual(runTheme({ search: '?theme=light', light: false }), { theme: 'lcl-light', stored: 'lcl-light' })
  assert.deepEqual(runTheme({ search: '?theme=dark', light: true }), { theme: 'lcl', stored: 'lcl' })
  assert.deepEqual(runTheme({ search: '?lang=pt&theme=old' }), { theme: undefined, stored: 'old' })
  assert.equal(runTheme({ search: '?theme=blue', stored: 'lcl-light' }).theme, 'lcl-light', 'an unknown value changes nothing')
  assert.equal(runTheme({ search: '?theme=constructor', light: true }).theme, 'lcl-light')
  assert.equal(runTheme({ stored: 'toString', light: true }).theme, 'lcl-light', 'a kept value must be one of ours')
  assert.equal(runTheme({ throws: true, light: true }).theme, 'lcl-light', 'private browsing: the system decides')
  assert.equal(runTheme({ search: '?theme=dark', throws: true, light: true }).theme, 'lcl', 'a link still works for this page')
})

test('the menu of a plain page has the choice of look in every language, and the live page menu has none', () => {
  for (const lang of ['en', 'pt', 'zh']) {
    const t = words(lang), plain = menuHtml(t, { base: 'https://x', lang, here: '/use' }), live = menuHtml(t, { base: 'https://x', lang })
    assert.ok(plain.includes('data-theme-set="lcl"') && plain.includes('data-theme-set="lcl-light"'), lang)
    assert.ok(plain.includes(t('m.dark')) && plain.includes(t('m.light')) && plain.includes(t('m.theme')), lang)
    assert.doesNotMatch(plain, /m\.(theme|dark|light)/, `${lang}: a word shows its key`)
    assert.ok(!live.includes('data-theme-set'), `${lang}: the live page is not themed yet`)
  }
  for (const th of ['lcl', 'lcl-light']) assert.ok(theme.includes(`html[data-theme="${th}"]`), th)
})
