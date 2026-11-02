// Share cards: 1200 x 630 pictures of the highlights, a project or a person, for link previews (Open Graph).
// Drawn as SVG and rasterised with resvg, in the pages' look (2026-11-02): Space Grotesk and JetBrains Mono from ./fonts,
// WenQuanYi Zen Hei from the system for Chinese.
import { Resvg } from '@resvg/resvg-js'
import fs from 'node:fs'
import path from 'node:path'
import { WORDS, groupName } from './public/words.js'

const W = 1200, H = 630
const FONT = "'Space Grotesk', 'WenQuanYi Zen Hei', 'Microsoft YaHei', sans-serif"
const NUM = "'JetBrains Mono', 'WenQuanYi Zen Hei', monospace"
const FONT_FILES = (() => { const dir = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'fonts'); try { return fs.readdirSync(dir).filter((f) => f.endsWith('.ttf')).map((f) => path.join(dir, f)) } catch { return [] } })()
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
const num = (x, y, size, fill, s, extra = '') => `<text x="${x}" y="${y}" font-family="${NUM}" font-size="${size}" fill="${fill}" ${extra}>${esc(s)}</text>`

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
<pattern id="grid" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="11" cy="11" r="1.1" fill="#cbf34d" fill-opacity="0.09"/></pattern>
<linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe7a0"/><stop offset="1" stop-color="#f3b733"/></linearGradient>
<linearGradient id="bar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e2ff7a"/><stop offset="1" stop-color="#8fb820"/></linearGradient>
<clipPath id="face"><circle cx="0" cy="0" r="1"/></clipPath>
</defs>
<rect width="${W}" height="${H}" fill="#0a0907"/><rect width="${W}" height="${H}" fill="url(#grid)"/><rect width="${W}" height="${H}" fill="url(#glow)"/>
<circle cx="78" cy="72" r="10" fill="#cbf34d"/>${text(100, 82, 30, '#f0ece2', 'CKB Pulse', 'font-weight="700"')}
${inner}
${num(64, H - 40, 20, '#9a9486', host)}
</svg>`
}
// a column chart in the right part of the card; people in lime, automation stacked in grey when given
function chart(people, bots, x = 720, y = 150, w = 420, h = 380) {
  const n = people.length, max = Math.max(1, ...people.map((v, i) => v + (bots?.[i] || 0)))
  const gap = n > 20 ? 3 : 8, bw = (w - gap * (n - 1)) / n
  let out = `<rect x="${x - 20}" y="${y - 20}" width="${w + 40}" height="${h + 40}" rx="22" fill="#14120e" stroke="#36322a"/>`
  people.forEach((v, i) => {
    const hb = ((bots?.[i] || 0) / max) * h, hp = (v / max) * h, bx = x + i * (bw + gap)
    if (hb) out += `<rect x="${bx}" y="${y + h - hb}" width="${bw}" height="${hb}" rx="${Math.min(4, bw / 2)}" fill="#4a4536"/>`
    out += `<rect x="${bx}" y="${y + h - hb - Math.max(2, hp)}" width="${bw}" height="${Math.max(2, hp)}" rx="${Math.min(4, bw / 2)}" fill="${hp ? 'url(#bar)' : '#36322a'}"/>`
  })
  return out
}
// JetBrains Mono digits are 0.6 em wide
const kpis = (list, y = 246) => { let x = 64; return list.map(([n, label]) => { const s = num(x, y, 60, '#cbf34d', n, 'font-weight="600"') + text(x, y + 36, 22, '#9a9486', label); x += Math.max(160, String(n).length * 0.62 * 60 + 56, ems(label) * 22 + 36); return s }).join('') }
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
export function rasterise(svg, width = W) {
  return new Resvg(svg, { fitTo: { mode: 'width', value: width }, font: { fontFiles: FONT_FILES, loadSystemFonts: true, defaultFontFamily: 'Space Grotesk' } }).render().asPng()
}

// the highlights of a period: counts, the project, the person and the organisation of the period, the activity
export async function highlightsCard({ leaders, period, lang, host, groupOf }) {
  const t = words(lang), L = leaders[period], s = L.stats
  let inner = text(64, 150, 40, '#f0ece2', t('mode.' + period), 'font-weight="700"')
  inner += kpis([[s.updates, t('k.updates')], [s.people, t('k.people')], [s.projects, t('k.projects')]])
  let y = 352
  const row = async (label, value, who) => {
    let out = MEDAL(82, y - 8) + text(112, y - 18, 19, '#9a9486', label)
    if (who) { out += await face(who.login, who.avatar, 130, y + 22, 18); out += text(160, y + 32, 30, '#f0ece2', clip(value, 30, 520), 'font-weight="700"') }
    else out += text(112, y + 24, 30, '#f0ece2', clip(value, 30, 560), 'font-weight="700"')
    y += 80
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
  let inner = text(64, 148, 24, '#9a9486', clip(t.group(d.group), 24, 600))
  const age = d.createdAt ? Date.now() - Date.parse(d.createdAt) : Infinity
  if (age < 14 * DAY) { const label = `${t('n.title')} · ${t('n.created', { ago: agoIn(t, age) })}`, w = ems(label) * 19 + 40; inner = `<rect x="64" y="104" width="${w}" height="34" rx="17" fill="#ff5f8f"/>` + text(84, 127, 19, '#2a0a14', label, 'font-weight="700"') + text(64 + w + 16, 128, 22, '#9a9486', clip(t.group(d.group), 22, 560 - w)) }
  inner += text(64, 210, 54, '#f0ece2', clip(short(d.name), 54, 620), 'font-weight="700"')
  wrap(d.desc || t('d.noDesc'), 25, 610, 2).forEach((l, i) => { inner += text(64, 256 + i * 34, 25, '#d9d4c4', l) })
  const updates = d.daily.people.reduce((a, b) => a + b, 0)
  inner += kpis([[updates, t('k.updates')], [d.contributors.length, t('k.people')], [d.stars, t.cnt('star', d.stars).replace(/^\S+\s*/, '')]], 390)
  const won = []
  for (const p of ['month', 'week', 'day']) for (const c of ['repos', 'commits', 'pushes']) { const w = leaders[p]?.[c]?.[0]; if (w && w[0] === d.name && w[1] > 0) won.push(t(`b.${c}.${p}`)) }
  inner += pills(won, 64, 500, 620)
  inner += text(720, 128, 20, '#9a9486', t('d.month'))
  inner += chart(d.daily.people, d.daily.bots)
  return rasterise(frame(host, inner))
}

// one person: who, how much work this week and where, their medals
export async function personCard({ p, leaders, lang, host }) {
  const t = words(lang)
  let inner = await face(p.login, p.avatar, 140, 210, 76)
  inner += text(250, 200, 50, '#f0ece2', clip(p.login, 50, 440), 'font-weight="700"')
  wrap(t('p.sum', { updates: t.cnt('upd', p.updates), projects: t.cnt('prj', p.projects.length) }), 24, 440, 2).forEach((l, i) => { inner += text(250, 240 + i * 32, 24, '#d9d4c4', l) })
  let y = 345
  for (const [name, n] of p.projects.slice(0, 3)) { inner += `<rect x="64" y="${y - 22}" width="10" height="28" rx="3" fill="#cbf34d"/>` + text(88, y, 26, '#f0ece2', clip(short(name), 26, 460)) + text(600, y, 26, '#cbf34d', n, 'font-weight="700" text-anchor="end"'); y += 42 }
  const won = []
  for (const per of ['month', 'week', 'day']) for (const c of ['people', 'peopleCommits']) { const w = leaders[per]?.[c]?.[0]; if (w && w[0] === p.login && w[1] > 0) won.push(t(`b.${c}.${per}`)) }
  inner += pills(won, 64, 520, 620)
  inner += text(720, 128, 20, '#9a9486', t('mode.week'))
  inner += chart(p.daily)
  return rasterise(frame(host, inner))
}

// ---------------- the cards added on 2026-11-02 ----------------
const DAY = 864e5, WEEK = 7 * DAY
function agoIn(t, ms) { const h = ms / 36e5; if (h < 1) return t('ago.min', { n: Math.max(1, Math.round(ms / 6e4)) }); if (h < 24) return t('ago.h', { n: Math.floor(h) }); const d = Math.floor(h / 24); return d === 1 ? t('ago.day') : t('ago.days', { n: d }) }
const day = (iso, t) => (iso ? new Date(iso).toLocaleDateString(t('locale'), { day: 'numeric', month: 'short', year: 'numeric' }) : '')
const plain = (s) => String(s).replace(/\*/g, '')
function litTitle(title, x, y, size, width, lines, gap) {
  const words = [], parts = String(title).split('*')
  parts.forEach((part, i) => { for (const w of part.split(/\s+/).filter(Boolean)) words.push([w, i % 2 === 1]) })
  const rows = [[]]
  for (const w of words) { const row = rows[rows.length - 1], line = [...row, w].map(([x]) => x).join(' '); if (row.length && ems(line) * size > width) rows.push([w]); else row.push(w) }
  return rows.slice(0, lines).map((row, i) => `<text x="${x}" y="${y + i * gap}" font-family="${FONT}" font-size="${size}" font-weight="700">${row.map(([w, lit], k) => `<tspan fill="${lit ? '#cbf34d' : '#f0ece2'}">${esc(w)}${k < row.length - 1 ? ' ' : ''}</tspan>`).join('')}</text>`).join('')
}
const tag = (x, y, label, bg, fg) => { const w = ems(label) * 19 + 34; return { w, svg: `<rect x="${x}" y="${y - 25}" width="${w}" height="36" rx="18" fill="${bg}"/>` + text(x + 17, y, 19, fg, label, 'font-weight="700"') } }
// a status shown only when it is good news: a quiet project gets the date of its last work and no label
export function grantTag(g, t, x, y) {
  if (g.status === 'delivered') return tag(x, y, t('f.delivered', { date: day(g.delivered.at, t) }), '#cbf34d', '#1a2208').svg
  if (g.status === 'progress') return tag(x, y, t('f.progress'), '#16301f', '#9be5b0').svg
  return text(x, y, 20, '#9a9486', `${t('f.lastWork')}: ${day(g.lastWork, t) || t('f.none')}`)
}

// one project the Community Fund DAO pays for: the grant, its state, the code since the vote week by week, the reports
export async function fundedCard({ g, lang, host }) {
  const t = words(lang)
  let inner = num(64, 146, 18, '#9a9486', 'COMMUNITY FUND DAO', 'letter-spacing="1.5"')
  inner += text(64, 214, 58, '#f0ece2', clip(g.name, 58, 610), 'font-weight="700"')
  inner += text(64, 256, 24, '#d9d4c4', clip(t('f.grant', { grant: g.grant, since: day(g.since, t) }), 24, 610))
  inner += grantTag(g, t, 64, 316)
  inner += kpis([[g.commits, t.cnt('f.commits', g.commits)], [g.people, t.cnt('f.people', g.people)]], 432)
  inner += num(64, 518, 22, '#d9d4c4', g.updates) + text(64 + String(g.updates).length * 14 + 12, 518, 22, '#9a9486', clip(t.cnt('f.reports', g.updates), 22, 520))
  inner += text(720, 128, 20, '#9a9486', t('f.lLabel'))
  const bars = g.bars.length > 52 ? g.bars.slice(-52) : g.bars, skip = g.bars.length - bars.length
  inner += chart(bars, null)
  const n = bars.length, gap = n > 20 ? 3 : 8, bw = (420 - gap * (n - 1)) / n
  const at = (iso) => Math.floor((Date.parse(iso) - g.first) / WEEK) - skip
  for (const [i, label, color] of [...g.milestones.map((m) => [at(m.at), `M${m.m}`, '#62c9f5']), ...(g.delivered ? [[at(g.delivered.at), '✓', '#ffd166']] : [])]) {
    if (i < 0 || i >= n) continue
    const x = 720 + i * (bw + gap) + bw / 2
    inner += `<line x1="${x}" x2="${x}" y1="150" y2="530" stroke="${color}" stroke-width="2.5" stroke-dasharray="6 6"/>` + num(x - 12, 146, 16, color, label, 'font-weight="600"')
  }
  return rasterise(frame(host, inner))
}

// the funded page: every grant, its code since the vote and its state
export async function fundedPageCard({ grants, lang, host }) {
  const t = words(lang)
  let inner = num(64, 146, 18, '#9a9486', 'COMMUNITY FUND DAO', 'letter-spacing="1.5"')
  inner += litTitle(t('f.h1'), 64, 206, 46, 560, 3, 54)
  const total = grants.reduce((a, g) => a + g.commits, 0)
  inner += kpis([[grants.length, t('f.projects')], [total, t.cnt('f.commits', total)]], 470)
  inner += `<rect x="700" y="112" width="460" height="${Math.min(6, grants.length) * 68 + 28}" rx="22" fill="#14120e" stroke="#36322a"/>`
  const max = Math.max(1, ...grants.map((g) => g.commits))
  grants.slice(0, 6).forEach((g, i) => {
    const y = 158 + i * 68
    inner += text(728, y, 24, '#f0ece2', clip(g.name, 24, 230), 'font-weight="700"') + num(1132, y, 22, '#cbf34d', g.commits, 'text-anchor="end" font-weight="600"')
    inner += `<rect x="728" y="${y + 14}" width="404" height="6" rx="3" fill="#2a2720"/><rect x="728" y="${y + 14}" width="${Math.max(4, (g.commits / max) * 404)}" height="6" rx="3" fill="url(#bar)"/>`
    if (g.status === 'delivered') inner += `<circle cx="${728 + ems(clip(g.name, 24, 230)) * 24 + 16}" cy="${y - 8}" r="6" fill="#cbf34d"/>`
  })
  return rasterise(frame(host, inner))
}

// the Fiber network as it is: the counts, and the real graph, the busiest nodes in the middle
export async function fiberCard({ d, lang, host }) {
  const t = words(lang)
  let inner = num(64, 146, 18, '#9a9486', `FIBER · ${t('fb.' + d.net).toUpperCase()}`, 'letter-spacing="1.5"')
  wrap(t('fb.title'), 52, 600, 2).forEach((l, i) => { inner += text(64, 210 + i * 58, 52, '#f0ece2', l, 'font-weight="700"') })
  const ckb = d.channels.filter((c) => c.asset === 'CKB').reduce((a, c) => a + c.cap, 0)
  inner += kpis([[d.nodes.length, t('fb.nodes')], [d.channels.length, t('fb.channels')]], 392)
  inner += num(64, 500, 24, '#d9d4c4', `${Math.round(ckb).toLocaleString('en')} CKB · ${t('fb.s.block')} ${Number(d.block || 0).toLocaleString('en')}`)
  inner += `<rect x="700" y="112" width="460" height="438" rx="22" fill="#14120e" stroke="#36322a"/>`
  // the graph: degree per node, one line per pair of nodes, hubs on an inner ring and the rest by their hubs
  const deg = new Map(), pairs = new Map()
  for (const c of d.channels) { const k = c.a < c.b ? `${c.a}|${c.b}` : `${c.b}|${c.a}`; pairs.set(k, (pairs.get(k) || 0) + (c.cap || 0)); for (const id of [c.a, c.b]) deg.set(id, (deg.get(id) || 0) + 1) }
  const ids = [...deg.keys()].sort((a, b) => deg.get(b) - deg.get(a)).slice(0, 220), keep = new Set(ids)
  const hubs = ids.filter((id) => deg.get(id) >= 6).slice(0, 6), pos = new Map(), cx = 930, cy = 331
  hubs.forEach((id, i) => { const a = (i / Math.max(1, hubs.length)) * Math.PI * 2 - Math.PI / 2, r = hubs.length > 1 ? 52 : 0; pos.set(id, [cx + Math.cos(a) * r, cy + Math.sin(a) * r]) })
  const rest = ids.filter((id) => !pos.has(id))
  const angleOf = (id) => { const hs = [...pairs.keys()].map((k) => k.split('|')).filter(([a, b]) => a === id || b === id).map(([a, b]) => (a === id ? b : a)).filter((x) => pos.has(x)); if (!hs.length) return null; const [x, y] = pos.get(hs[0]); return Math.atan2(y - cy, x - cx) }
  const order = rest.map((id, i) => [id, angleOf(id) ?? (i / rest.length) * Math.PI * 2]).sort((a, b) => a[1] - b[1])
  order.forEach(([id], i) => { const a = (i / order.length) * Math.PI * 2 - Math.PI / 2, ring = 110 + (i % 3) * 32; pos.set(id, [cx + Math.cos(a) * ring, cy + Math.sin(a) * ring * 0.92]) })
  for (const [k, cap] of pairs) { const [a, b] = k.split('|'); if (!keep.has(a) || !keep.has(b)) continue; const [x1, y1] = pos.get(a), [x2, y2] = pos.get(b); inner += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#cbf34d" stroke-opacity="0.38" stroke-width="${(0.8 + Math.log10(1 + cap / 500) * 0.9).toFixed(2)}"/>` }
  const named = new Map(d.nodes.map((n) => [n.id, n.name]))
  for (const id of [...ids].reverse()) {
    const [x, y] = pos.get(id), dg = deg.get(id), hub = hubs.includes(id), r = hub ? 9 + Math.min(12, Math.sqrt(dg) * 1.3) : Math.min(7, (named.has(id) ? 4.5 : 3) + Math.sqrt(dg) * 0.5)
    if (hub) inner += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(r * 2.2).toFixed(1)}" fill="url(#hubglow)"/>`
    inner += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${hub ? '#2a3a12' : '#1d1b15'}" stroke="${hub ? '#cbf34d' : named.has(id) ? '#d9d4c4' : '#6b675c'}" stroke-width="${hub ? 2.4 : 1.3}"${named.has(id) || hub ? '' : ' stroke-dasharray="2 2"'}/>`
    if (hub || named.has(id)) { const q = r * (hub ? 0.75 : 0.6); inner += `<rect x="${(x - q / 2).toFixed(1)}" y="${(y - q / 2).toFixed(1)}" width="${q.toFixed(1)}" height="${q.toFixed(1)}" fill="#cbf34d"/>` }
  }
  return rasterise(frame(host, inner).replace('<clipPath id="face">', '<radialGradient id="hubglow"><stop offset="0" stop-color="#cbf34d" stop-opacity="0.35"/><stop offset="1" stop-color="#cbf34d" stop-opacity="0"/></radialGradient><clipPath id="face">'))
}

// /use: what an AI agent can ask Pulse, and how much Pulse knows today
export async function useCard({ tools, repos, month, lang, host }) {
  const t = words(lang)
  let inner = num(64, 146, 18, '#9a9486', 'MCP · LLMS.TXT · API', 'letter-spacing="1.5"')
  inner += litTitle(t('use.h1'), 64, 210, 52, 600, 2, 58)
  inner += kpis([[repos, t('k.projects')], [month.people, t('k.people')], [month.updates, t('k.updates')]], 410)
  inner += text(64, 500, 22, '#9a9486', t('mode.month'))
  inner += `<rect x="700" y="112" width="460" height="${tools.length * 48 + 40}" rx="22" fill="#14120e" stroke="#36322a"/>`
  tools.slice(0, 8).forEach((name, i) => { const y = 160 + i * 48; inner += `<rect x="728" y="${y - 15}" width="12" height="12" fill="#cbf34d"/>` + num(756, y - 2, 24, '#f0ece2', name) })
  return rasterise(frame(host, inner))
}
