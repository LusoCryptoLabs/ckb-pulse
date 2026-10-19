// Badges: small SVG pictures of a project's, a person's or the whole ecosystem's last 7 days, for READMEs and sites.
//   [![CKB Pulse](https://host/badge/repo.svg?name=owner/repo)](https://host/?repo=owner/repo)
// Drawn flat, in the page's colours, with the text forced to its measured width so no font can break the layout.
import { words } from './cards.mjs'

const FONT = 'Verdana, Geneva, DejaVu Sans, sans-serif'
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
// Verdana at 11 px: about 6.6 px a character, digits a little less; CJK characters are square
const width = (s) => Math.round([...String(s)].reduce((n, c) => n + (/[⺀-鿿＀-￯]/.test(c) ? 11 : /\d/.test(c) ? 6.2 : /[ .,·]/.test(c) ? 3.6 : 6.6), 0))

export const LANGS = ['en', 'pt', 'zh']
// left: the page's name with its lit cell; right: the words, lime when there was work, grey when not
export function badgeSvg(label, value, { lit = true } = {}) {
  const lw = width(label) + 26, vw = width(value) + 20, w = lw + vw, h = 20
  const fill = lit ? '#cbf34d' : '#3b4330', text = lit ? '#1a2208' : '#c8d0bc'
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" role="img" aria-label="${esc(label)}: ${esc(value)}">
<title>${esc(label)}: ${esc(value)}</title>
<clipPath id="r"><rect width="${w}" height="${h}" rx="3"/></clipPath>
<g clip-path="url(#r)"><rect width="${lw}" height="${h}" fill="#07090a"/><rect x="${lw}" width="${vw}" height="${h}" fill="${fill}"/></g>
<rect x="7" y="6" width="8" height="8" rx="2" fill="#cbf34d"/>
<g font-family="${FONT}" font-size="11" text-rendering="geometricPrecision">
<text x="${19 + (lw - 26) / 2}" y="14" fill="#eef3e2" text-anchor="middle" textLength="${lw - 26}" lengthAdjust="spacingAndGlyphs">${esc(label)}</text>
<text x="${lw + vw / 2}" y="14" fill="${text}" font-weight="bold" text-anchor="middle" textLength="${vw - 20}" lengthAdjust="spacingAndGlyphs">${esc(value)}</text>
</g>
</svg>`
}

// a project: updates and people in 7 days; null when the project is not followed
export function repoBadge(week, lang) {
  const t = words(lang)
  if (!week) return badgeSvg('CKB Pulse', t('bd.unknown'), { lit: false })
  if (!week.updates) return badgeSvg('CKB Pulse', t('bd.quiet'), { lit: false })
  return badgeSvg('CKB Pulse', t('bd.week', { updates: t.cnt('upd', week.updates), people: t.cnt('ppl', week.people) }))
}
// a person: updates and projects in 7 days
export function personBadge(p, lang) {
  const t = words(lang)
  if (!p || !p.updates) return badgeSvg('CKB Pulse', t('bd.quiet'), { lit: false })
  return badgeSvg('CKB Pulse', t('bd.person', { updates: t.cnt('upd', p.updates), projects: t.cnt('prj', p.projects.length) }))
}
// everyone: the week's counts
export function allBadge(stats, lang) {
  const t = words(lang)
  if (!stats?.updates) return badgeSvg('CKB Pulse', t('bd.quiet'), { lit: false })
  return badgeSvg('CKB Pulse', t('bd.all', { people: t.cnt('ppl', stats.people), updates: t.cnt('upd', stats.updates), projects: t.cnt('prj', stats.projects) }))
}
