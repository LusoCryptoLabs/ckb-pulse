// The picture of an earned mark: a square emblem in Ink and Paper, straight corners, one red element for the thing that
// happened. Drawn flat, with the text forced to its measured width so no font can break the layout (as badge.mjs does).
const FONT = 'Verdana, Geneva, DejaVu Sans, sans-serif'
const INK = '#121212', PAPER = '#F4F1EB', GRAFITE = '#4a4a47', MUTED = '#8A857B', RED = '#E10600'
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const width = (s, size) => Math.round([...String(s)].reduce((n, c) => n + (/[⺀-鿿＀-￯]/.test(c) ? 11 : /\d/.test(c) ? 6.2 : /[ .,·]/.test(c) ? 3.6 : 6.6), 0) * size / 11)
const fit = (s, max, from, to) => { for (let z = from; z >= to; z--) if (width(s, z) <= max) return z; return to }

// each glyph is drawn inside 0..120 x 0..70, centred in the emblem
const GLYPH = {
  // since: a line that begins at the red square and runs on
  since: () => `<rect x="0" y="31" width="120" height="3" fill="${PAPER}"/><rect x="0" y="23" width="18" height="18" fill="${RED}"/>${[36, 60, 84, 108].map((x) => `<rect x="${x}" y="26" width="2" height="12" fill="${PAPER}"/>`).join('')}`,
  // six months with commits: six squares, the sixth in red
  months6: () => Array.from({ length: 6 }, (_, i) => `<rect x="${i * 20.4}" y="26" width="18" height="18" fill="${i === 5 ? RED : PAPER}"/>`).join(''),
  // merged: two lines that become one, the red square where they meet
  merged: () => `<path d="M6 12 H44 L72 35 M6 58 H44 L72 35 H120" fill="none" stroke="${PAPER}" stroke-width="3"/><rect x="0" y="6" width="12" height="12" fill="${PAPER}"/><rect x="0" y="52" width="12" height="12" fill="${PAPER}"/><rect x="62" y="25" width="20" height="20" fill="${RED}"/>`,
  // welcomed: a newcomer (red) enters the project (the frame)
  welcomed: () => `<rect x="52" y="6" width="68" height="58" fill="none" stroke="${PAPER}" stroke-width="3"/><path d="M14 35 H60" stroke="${PAPER}" stroke-width="3"/><rect x="0" y="25" width="20" height="20" fill="${RED}"/><path d="M52 27 L64 35 L52 43 Z" fill="${PAPER}"/>`,
  // returned: a line, a gap, the line again, the red square at the return
  returned: () => `<rect x="0" y="32" width="40" height="3" fill="${PAPER}"/><rect x="48" y="33" width="24" height="1" fill="${GRAFITE}"/><rect x="80" y="32" width="40" height="3" fill="${PAPER}"/><rect x="72" y="24" width="18" height="18" fill="${RED}"/>`,
}

// kind: since | months6 | merged | welcomed | returned; earned: false draws the same emblem in outline, for a mark not yet earned
export function emblemSvg({ kind, category, title, line, n = 0, earned = true }) {
  const W = 240, H = 280, tz = fit(title, 200, 17, 11), lz = fit(line, 200, 11, 9)
  const g = (GLYPH[kind] || GLYPH.since)(n)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">
<title>${esc(title)}: ${esc(line)}</title>
<rect width="${W}" height="${H}" fill="${INK}"/><rect x="6" y="6" width="${W - 12}" height="${H - 12}" fill="none" stroke="${earned ? PAPER : GRAFITE}" stroke-width="1" ${earned ? '' : 'stroke-dasharray="4 4"'}/>
<g font-family="${FONT}" text-rendering="geometricPrecision">
<text x="20" y="34" font-size="9" letter-spacing="1.6" fill="${MUTED}">${esc(String(category).toUpperCase())}</text>
<g transform="translate(60 80)" ${earned ? '' : 'opacity=".45"'}>${g}</g>
<text x="${W / 2}" y="198" font-size="${tz}" font-weight="bold" fill="${PAPER}" text-anchor="middle" textLength="${width(title, tz)}" lengthAdjust="spacingAndGlyphs">${esc(title)}</text>
<text x="${W / 2}" y="220" font-size="${lz}" fill="${MUTED}" text-anchor="middle" textLength="${width(line, lz)}" lengthAdjust="spacingAndGlyphs">${esc(line)}</text>
</g>
<circle cx="24" cy="254" r="3.5" fill="${RED}"/><text x="34" y="258" font-family="${FONT}" font-size="9" fill="${MUTED}" letter-spacing="1">CKB PULSE</text>
</svg>`
}

// the emblem of one earned mark of one person: its words come from the page's words, its date from the record
export function earnedEmblem(login, mark, t) {
  const category = { since: 'em.cat.p', months6: 'em.cat.c', merged: 'em.cat.m' }[mark.id]
  return emblemSvg({ kind: mark.id, category: t(category), title: t('em.t.' + mark.id, { month: mark.date.slice(0, 7) }), line: `${login} · ${mark.date}` })
}
