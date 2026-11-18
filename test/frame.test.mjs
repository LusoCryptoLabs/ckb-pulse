// The colours the pages share live in theme.css, and the plain pages share one foot: a page that goes back to its
// own copy of a shared colour, or names a colour that is not defined, fails here.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { CSS, READING_CSS, langLinks, pageFoot } from '../digest.mjs'
import { words } from '../cards.mjs'

const theme = fs.readFileSync(new URL('../public/theme.css', import.meta.url), 'utf8')
const tokens = Object.fromEntries([...theme.matchAll(/(--[a-z-]+):\s*(#[0-9a-f]{6})/gi)].map(([, k, v]) => [k, v.toLowerCase()]))

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
