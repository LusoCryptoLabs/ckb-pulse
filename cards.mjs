// Share cards: 1200 x 630 pictures of the highlights, a project or a person, for link previews (Open Graph).
// Drawn as SVG and rasterised with resvg; the fonts come from the system (Inter and WenQuanYi Zen Hei in the image).
import { Resvg } from '@resvg/resvg-js'
import { WORDS, groupName } from './public/words.js'

const W = 1200, H = 630
const FONT = "Inter, 'Inter Variable', 'WenQuanYi Zen Hei', 'Microsoft YaHei', 'Segoe UI', sans-serif"
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const short = (name) => String(name || '').split('/').pop()
export const words = (lang) => {
  const w = { ...WORDS.en, ...(WORDS[lang] || {}) }
  const t = (k, v) => String(w[k] ?? k).replace(/\{(\w+)\}/g, (_, x) => v?.[x] ?? '')
  t.cnt = (base, n) => t(base + (n === 1 ? '.1' : '.n'), { n })
  t.group = (g) => groupName(g, w)
  return t
}
// a rough width in ems: wide enough for Inter, CJK characters count double
const ems = (s) => [...String(s)].reduce((n, c) => n + (/[⺀-鿿＀-￯]/.test(c) ? 1 : 0.56), 0)
const clip = (s, size, width) => { let out = String(s ?? ''); if (ems(out) * size <= width) return out; while (out && ems(out + '…') * size > width) out = out.slice(0, -1); return out + '…' }
function wrap(s, size, width, lines) {
  const parts = String(s || '').split(/(\s+)/), out = []
  let cur = ''
  for (const p of parts) {
    if (ems(cur + p) * size <= width) { cur += p; continue }
    if (cur.trim()) out.push(cur.trim())
    cur = p.trimStart()
    while (ems(cur) * size > width) { let k = cur.length; while (k > 1 && ems(cur.slice(0, k)) * size > width) k--; out.push(cur.slice(0, k)); cur = cur.slice(k) }
  }
  if (cur.trim()) out.push(cur.trim())
  if (out.length > lines) { out.length = lines; out[lines - 1] = clip(out[lines - 1] + '…', size, width) }
  return out
}
const text = (x, y, size, fill, s, extra = '') => `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" fill="${fill}" ${extra}>${esc(s)}</text>`

const avatars = new Map()
async function avatar(login, url) {
  const key = String(login).toLowerCase()
  if (avatars.has(key)) return avatars.get(key)
  let data = ''
  try {
    const base = url || `https://avatars.githubusercontent.com/${encodeURIComponent(login)}`
    const r = await fetch(base + (base.includes('?') ? '&' : '?') + 's=160', { signal: AbortSignal.timeout(5000) })
    if (r.ok) data = `data:${r.headers.get('content-type') || 'image/png'};base64,${Buffer.from(await r.arrayBuffer()).toString('base64')}`
  } catch {}
  if (avatars.size > 300) avatars.delete(avatars.keys().next().value)
  avatars.set(key, data)
  return data
}

const MEDAL = (x, y, r = 15) => `<g transform="translate(${x} ${y})"><path d="M${-r * 0.7} ${-r * 1.9}h${r * 0.65}l${r * 0.4} ${r * 1.1}-${r * 0.9} ${r * 0.35}zM${r * 0.7} ${-r * 1.9}h-${r * 0.65}l-${r * 0.4} ${r * 1.1} ${r * 0.9} ${r * 0.35}z" fill="#e0533d"/><circle r="${r}" fill="url(#gold)" stroke="#a8740c" stroke-width="2"/><path d="M0 ${-r * 0.55}l${r * 0.17} ${r * 0.34} ${r * 0.37} ${r * 0.05}-${r * 0.27} ${r * 0.26} ${r * 0.06} ${r * 0.37}L0 ${r * 0.37}l-${r * 0.33} ${r * 0.17} ${r * 0.06}-${r * 0.37}-${r * 0.27}-${r * 0.26} ${r * 0.37}-${r * 0.05}z" fill="#fff4cc"/></g>`
function frame(host, inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
<radialGradient id="glow" cx="0.82" cy="0.9" r="0.75"><stop offset="0" stop-color="#cbf34d" stop-opacity="0.2"/><stop offset="1" stop-color="#cbf34d" stop-opacity="0"/></radialGradient>
<pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#18210f" stroke-width="1"/></pattern>
<linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe7a0"/><stop offset="1" stop-color="#f3b733"/></linearGradient>
<linearGradient id="bar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e2ff7a"/><stop offset="1" stop-color="#8fb820"/></linearGradient>
<clipPath id="face"><circle cx="0" cy="0" r="1"/></clipPath>
</defs>
<rect width="${W}" height="${H}" fill="#07090a"/><rect width="${W}" height="${H}" fill="url(#grid)"/><rect width="${W}" height="${H}" fill="url(#glow)"/>
<circle cx="78" cy="72" r="10" fill="#cbf34d"/>${text(100, 82, 30, '#eef3e2', 'CKB Pulse', 'font-weight="700"')}
${inner}
${text(64, H - 40, 22, '#9aa38e', host)}
</svg>`
}
// a column chart in the right part of the card; people in lime, automation stacked in grey when given
function chart(people, bots, x = 720, y = 150, w = 420, h = 380) {
  const n = people.length, max = Math.max(1, ...people.map((v, i) => v + (bots?.[i] || 0)))
  const gap = n > 20 ? 3 : 8, bw = (w - gap * (n - 1)) / n
  let out = `<rect x="${x - 20}" y="${y - 20}" width="${w + 40}" height="${h + 40}" rx="22" fill="#0f140c" stroke="#26331a"/>`
  people.forEach((v, i) => {
    const hb = ((bots?.[i] || 0) / max) * h, hp = (v / max) * h, bx = x + i * (bw + gap)
    if (hb) out += `<rect x="${bx}" y="${y + h - hb}" width="${bw}" height="${hb}" rx="${Math.min(4, bw / 2)}" fill="#3b4330"/>`
    out += `<rect x="${bx}" y="${y + h - hb - Math.max(2, hp)}" width="${bw}" height="${Math.max(2, hp)}" rx="${Math.min(4, bw / 2)}" fill="${hp ? 'url(#bar)' : '#26331a'}"/>`
  })
  return out
}
const kpis = (list, y = 246) => { let x = 64; return list.map(([n, label]) => { const s = text(x, y, 62, '#cbf34d', n, 'font-weight="800"') + text(x, y + 36, 22, '#9aa38e', label); x += Math.max(150, ems(String(n)) * 62 + 40, ems(label) * 22 + 30); return s }).join('') }
let faces = 0
async function face(login, url, cx, cy, r) {
  const img = await avatar(login, url), id = `f${++faces}`
  return `<circle cx="${cx}" cy="${cy}" r="${r + 3}" fill="#cbf34d"/>` + (img ? `<clipPath id="${id}"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath><image href="${img}" x="${cx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}" clip-path="url(#${id})" preserveAspectRatio="xMidYMid slice"/>` : `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#1b2215"/>`)
}
function pills(list, x, y, maxW) {
  let cx = x, out = ''
  for (const s of list) {
    const w = ems(s) * 20 + 56
    if (cx + w > x + maxW) break
    out += `<rect x="${cx}" y="${y - 26}" width="${w}" height="38" rx="19" fill="url(#gold)"/>${MEDAL(cx + 22, y - 7, 10)}${text(cx + 40, y, 20, '#241a00', s, 'font-weight="700"')}`
    cx += w + 10
  }
  return out
}
export function rasterise(svg) {
  return new Resvg(svg, { fitTo: { mode: 'width', value: W }, font: { loadSystemFonts: true, defaultFontFamily: 'Inter' } }).render().asPng()
}

// the highlights of a period: counts, the project, the person and the organisation of the period, the activity
export async function highlightsCard({ leaders, period, lang, host, groupOf }) {
  const t = words(lang), L = leaders[period], s = L.stats
  let inner = text(64, 150, 40, '#eef3e2', t('mode.' + period), 'font-weight="700"')
  inner += kpis([[s.updates, t('k.updates')], [s.people, t('k.people')], [s.projects, t('k.projects')]])
  let y = 352
  const row = async (label, value, who) => {
    let out = MEDAL(82, y - 8) + text(112, y - 18, 19, '#9aa38e', label)
    if (who) { out += await face(who.login, who.avatar, 130, y + 22, 18); out += text(160, y + 32, 30, '#eef3e2', clip(value, 30, 520), 'font-weight="700"') }
    else out += text(112, y + 24, 30, '#eef3e2', clip(value, 30, 560), 'font-weight="700"')
    y += 76
    return out
  }
  const repo = L.repos[0], person = L.people[0], org = L.orgs[0]
  if (repo) inner += await row(`${t('b.repos.' + period)} · ${t.cnt('upd', repo[1])}`, `${short(repo[0])} · ${t.group(groupOf(repo[0]))}`)
  if (person) inner += await row(`${t('b.people.' + period)} · ${t.cnt('upd', person[1])}`, person[0], { login: person[0], avatar: person[2] })
  if (org) inner += await row(t('b.orgs.' + period), t.group(org[0]))
  inner += chart(L.bars || [])
  return rasterise(frame(host, inner))
}

// one project: what it is, its 30 days, its medals
export async function repoCard({ d, leaders, lang, host }) {
  const t = words(lang)
  let inner = text(64, 148, 24, '#9aa38e', clip(t.group(d.group), 24, 600))
  inner += text(64, 210, 54, '#eef3e2', clip(short(d.name), 54, 620), 'font-weight="800"')
  wrap(d.desc || t('d.noDesc'), 25, 610, 2).forEach((l, i) => { inner += text(64, 256 + i * 34, 25, '#cdd5c0', l) })
  const updates = d.daily.people.reduce((a, b) => a + b, 0)
  inner += kpis([[updates, t('k.updates')], [d.contributors.length, t('k.people')], [d.stars, t.cnt('star', d.stars).replace(/^\S+\s*/, '')]], 390)
  const won = []
  for (const p of ['month', 'week', 'day']) for (const c of ['repos', 'commits', 'pushes']) { const w = leaders[p]?.[c]?.[0]; if (w && w[0] === d.name && w[1] > 0) won.push(t(`b.${c}.${p}`)) }
  inner += pills(won, 64, 500, 620)
  inner += text(720, 128, 20, '#9aa38e', t('d.month'))
  inner += chart(d.daily.people, d.daily.bots)
  return rasterise(frame(host, inner))
}

// one person: who, how much work this week and where, their medals
export async function personCard({ p, leaders, lang, host }) {
  const t = words(lang)
  let inner = await face(p.login, p.avatar, 140, 210, 76)
  inner += text(250, 200, 50, '#eef3e2', clip(p.login, 50, 440), 'font-weight="800"')
  wrap(t('p.sum', { updates: t.cnt('upd', p.updates), projects: t.cnt('prj', p.projects.length) }), 24, 440, 2).forEach((l, i) => { inner += text(250, 240 + i * 32, 24, '#cdd5c0', l) })
  let y = 345
  for (const [name, n] of p.projects.slice(0, 3)) { inner += `<rect x="64" y="${y - 22}" width="10" height="28" rx="3" fill="#cbf34d"/>` + text(88, y, 26, '#eef3e2', clip(short(name), 26, 460)) + text(600, y, 26, '#cbf34d', n, 'font-weight="700" text-anchor="end"'); y += 42 }
  const won = []
  for (const per of ['month', 'week', 'day']) for (const c of ['people', 'peopleCommits']) { const w = leaders[per]?.[c]?.[0]; if (w && w[0] === p.login && w[1] > 0) won.push(t(`b.${c}.${per}`)) }
  inner += pills(won, 64, 520, 620)
  inner += text(720, 128, 20, '#9aa38e', t('mode.week'))
  inner += chart(p.daily)
  return rasterise(frame(host, inner))
}
