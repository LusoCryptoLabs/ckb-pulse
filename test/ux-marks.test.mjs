// A kind of work is a colour, a shape and a pattern (UX review of 2026-11-25: red and gold look alike in deuteranopia, and
// they were the two biggest kinds). Every place that draws a colour of work names its family in data-f, and the
// stylesheet draws the mark. The brand rule that flattens every corner must not flatten the circle.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
const js = read('public/pulse3d.js'), css = read('public/theme.css'), theme = css

test('every swatch of a kind of work names its family, and sets only the colour inline', () => {
  const sites = js.split('\n').filter((l) => /var\(--f-\$\{f\}\)|kvar\(/.test(l) && /<i |<span class="sw"/.test(l))
  assert.ok(sites.length >= 8, `the swatches: ${sites.length}`)
  for (const l of sites) {
    for (const m of l.matchAll(/<(?:i|span)\b[^>]*style="[^"]*(?:var\(--f-\$\{f\}\)|kvar\()[^"]*"[^>]*>/g)) {
      assert.ok(/data-f=|dataF\(/.test(m[0]), `a swatch without its family: ${m[0].slice(0, 90)}`)
      assert.ok(!/style="[^"]*\bbackground:/.test(m[0]), `inline shorthand would wipe the pattern: ${m[0].slice(0, 90)}`)
    }
  }
  assert.match(js, /const dataF = \(k\) => `data-f="\$\{fam\(k\)\}"`/)
  assert.ok(!/background:\$\{kvar|background:var\(--f-/.test(js), 'no inline background shorthand for a kind of work is left')
})

test('the five families and the automatic kind each get a pattern; the plain square is code', () => {
  for (const f of ['change', 'talk', 'version', 'interest', 'auto']) assert.match(css, new RegExp(`\\[data-f="${f}"\\] \\{ background-image: [^;]*gradient`), f)
  assert.ok(!/\[data-f="code"\]/.test(css), 'code stays the plain square')
  assert.match(css, /:root \{ --pat: color-mix\(in srgb, var\(--bg\) 70%, transparent\); \}/, 'the pattern follows the look')
  const patterns = [...css.matchAll(/\[data-f="(\w+)"\] \{ background-image: ([^;]*);/g)].map((m) => m[2])
  assert.equal(new Set(patterns).size, patterns.length, 'no two kinds share a pattern')
})

test('the small swatches also get a shape: diamond, circle, triangle, hexagon', () => {
  const shapes = [...css.matchAll(/\)\[data-f="(\w+)"\] \{ (clip-path: [^;]*);/g)].map((m) => [m[1], m[2]])
  assert.deepEqual(shapes.map(([f]) => f), ['change', 'talk', 'version', 'interest'])
  assert.equal(new Set(shapes.map(([, s]) => s)).size, 4, 'four different shapes')
  assert.match(css, /\[data-f="talk"\] \{ clip-path: circle\(50%\); \}/, 'the circle is a clip, because the brand rule sets every border radius to 0')
  assert.match(theme, /html\[lang\] \* \{ border-radius: 0 !important; \}/, 'the control: that rule is there')
  assert.ok(!/\[data-f="talk"\][^{]*\{[^}]*border-radius: 50%/.test(css), 'and the circle does not rely on a radius')
})

test('the brand gradient is for the day bars of the reading pages, not for every i under the list view', () => {
  assert.match(theme, /html\[lang\] div\.bars > i \{ background: linear-gradient\(var\(--fg\), var\(--mut\)\); border-radius: 0; \}/)
  assert.ok(!/html\[lang\] \.bars i/.test(theme), 'body.bars is the live list view: its swatches keep their own colour')
})

test('the bars of the list carry their family, so the pattern follows the work', () => {
  assert.match(js, /segs\.map\(\(\[f, c\]\) => `<i data-f="\$\{f\}" style="flex:\$\{c\};background-color:var\(--f-\$\{f\}\)"><\/i>`\)/)
  assert.match(js, /<i data-f="auto" style="background-color:var\(--mut\)">/, 'the legend names the automatic mark too')
})
