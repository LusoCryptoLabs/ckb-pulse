import test from 'node:test'
import assert from 'node:assert/strict'
import { usePage } from '../use.mjs'
import { methodPage } from '../method.mjs'
import { countScript } from '../digest.mjs'
import { COUNT_SCRIPT } from '../landing.mjs'

const base = 'https://pulse.example'

test('the use page says how many tools there are and copies the install command', () => {
  for (const [lang, copy] of [['en', 'Copy'], ['pt', 'Copiar'], ['zh', '复制']]) {
    const html = usePage({ lang, base, url: `${base}/use` })
    assert.match(html, /<div class="kpis"><div><b>\d+<\/b><span>[^<]+<\/span><\/div><\/div>/, lang)
    assert.ok(html.includes(`data-cmd="claude mcp add --transport http ckb-pulse ${base}/mcp"`) && html.includes(`>${copy}</button>`), lang)
    assert.ok(html.includes('navigator.clipboard'), 'the copy script is in the page')
  }
})

test('the method page has an index of its sections, and every link has a section to go to', () => {
  const html = methodPage({ lang: 'pt', base, url: `${base}/method` })
  const links = [...html.matchAll(/<a href="#([a-z]+)">/g)].map((m) => m[1])
  assert.ok(links.length >= 10)
  for (const id of links) assert.ok(html.includes(`id="${id}"`), id)
})

test('the count script is one script for any set of numbers', () => {
  assert.ok(countScript('.kpis b[data-n]').includes("querySelectorAll('.kpis b[data-n]')"))
  assert.ok(COUNT_SCRIPT.includes("querySelectorAll('.nums b[data-n]')"), 'the landing still counts its own numbers')
})
