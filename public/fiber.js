// Fiber Pulse: the Fiber payment network on CKB, live. A map of the public graph, from the server's listening nodes,
// and every channel opened or closed on chain. Payments travel encrypted between nodes and are never shown.
// Data: /api/fiber?net= (the map and a week of events), /api/fiber/stream (what happens next).
// Drawn like the LSP's live view (2026-11-02): each announced node a living cell, each pair's channels a root. Only
// what the network really does moves the picture: a new public channel grows a root, one that leaves the map withers,
// a sign of life lights a root and rings its two ends, a new node swells into a cell. The plain map of before stays
// as "Simple", for anyone who prefers it and for devices that cannot draw the cells fast enough.
import { WORDS } from './words.js'
import { menuHtml, viewsHtml, shareHtml, today } from './menu.js'

const d3 = globalThis.d3
const DAY = 864e5
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches
const $ = (id) => document.getElementById(id)
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const store = { get: (k) => { try { return localStorage.getItem('ckbpulse.' + k) } catch { return null } }, set: (k, v) => { try { localStorage.setItem('ckbpulse.' + k, v) } catch {} } }
const browserLang = (navigator.language || '').toLowerCase()
let LANG = WORDS[store.get('lang')] ? store.get('lang') : browserLang.startsWith('zh') ? 'zh' : browserLang.startsWith('pt') ? 'pt' : 'en'
const t = (k, v) => String(WORDS[LANG][k] ?? WORDS.en[k] ?? k).replace(/\{(\w+)\}/g, (_, x) => v?.[x] ?? '')
const fmt = (n) => Math.round(n).toLocaleString(t('locale'))
const cnt = (base, n) => t(base + (n === 1 ? '.1' : '.n'), { n: fmt(n) })
function ago(x) {
  const s = (Date.now() - x) / 1000
  if (s < 60) return t('ago.now')
  if (s < 3600) return t('ago.min', { n: Math.floor(s / 60) })
  if (s < 86400) return t('ago.h', { n: Math.floor(s / 3600) })
  const d = Math.floor(s / 86400); return d === 1 ? t('ago.day') : t('ago.days', { n: d })
}
const css = getComputedStyle(document.documentElement)
const C = Object.fromEntries(['bg', 'lime', 'pale', 'blue', 'pink', 'amber', 'off', 'mut', 'fg'].map((k) => [k, css.getPropertyValue('--' + k).trim()]))
const FONT = { ui: css.getPropertyValue('--ui'), num: css.getPropertyValue('--num') }
const shortId = (id) => String(id).replace(/^0x/, '').slice(0, 8)
const EXPLORER = { mainnet: 'https://explorer.nervos.org/transaction/', testnet: 'https://testnet.explorer.nervos.org/transaction/' }
const HUB = 8 // a node with this many neighbours is drawn as a hub, with a nucleus of squares

// ================= data =================
const linked = location.hash.slice(1) || new URLSearchParams(location.search).get('net') // a shared link names its network
let NET = ['mainnet', 'testnet'].includes(linked) ? linked : store.get('fiberNet') === 'testnet' ? 'testnet' : 'mainnet'
let D = null // what the server sent for NET, kept up to date by the stream
let M = null // the map built from it
const places = { mainnet: new Map(), testnet: new Map() } // where each node sits, so the map keeps its shape as it changes
let fitted = false, moved = false, selected = null, hover = null, feedAll = false

// one network as a map: nodes (announced ones, and channel ends that never announced themselves), one edge per pair
function model(d, pos) {
  const byId = new Map(), pairs = new Map(), edgeOf = new Map()
  const node = (id, n) => ({ id, name: n?.name || '', v: n?.v || '', announced: !!n, chans: 0, ckb: 0, peers: new Map(), newest: 0, updated: 0 })
  for (const n of d.nodes) byId.set(n.id, node(n.id, n))
  for (const c of d.channels) {
    for (const id of [c.a, c.b]) if (!byId.has(id)) byId.set(id, node(id, null))
    const [s, tg] = c.a < c.b ? [c.a, c.b] : [c.b, c.a], k = s + '|' + tg
    let e = pairs.get(k)
    if (!e) pairs.set(k, (e = { key: k, source: s, target: tg, n: 0, ckb: 0, tokens: new Set(), updated: 0, created: 0, on: false }))
    e.n++; e.updated = Math.max(e.updated, c.updated); e.created = Math.max(e.created, c.created); e.on ||= c.on
    if (c.asset === 'CKB') e.ckb += c.cap; else e.tokens.add(c.asset)
    edgeOf.set(c.id, e)
    for (const [me, other] of [[c.a, c.b], [c.b, c.a]]) {
      const m = byId.get(me)
      m.chans++; m.peers.set(other, (m.peers.get(other) || 0) + 1); m.newest = Math.max(m.newest, c.created); m.updated = Math.max(m.updated, c.updated)
      if (c.asset === 'CKB') m.ckb += c.cap
    }
  }
  const nodes = [...byId.values()], edges = [...pairs.values()]
  for (const n of nodes) { n.deg = n.peers.size; n.r = n.announced ? 3.2 + 2.3 * Math.sqrt(n.deg) : 2.6; n.seed = seedOf(n.id) }
  // a root bends a little to one side, the same side every time
  for (const e of edges) e.bend = ((seedOf(e.key) * 1000) % 7 - 3) / 3 * 0.14
  // known nodes stay where they were; a new one starts beside a neighbour and settles around the rest
  let fresh = 0
  for (const n of nodes) {
    const p = pos.get(n.id)
    if (p) { n.x = n.fx = p.x; n.y = n.fy = p.y; continue }
    fresh++
    const nb = [...n.peers.keys()].map((id) => pos.get(id)).find(Boolean)
    if (nb) { n.x = nb.x + (Math.random() - 0.5) * 40; n.y = nb.y + (Math.random() - 0.5) * 40 }
  }
  const sim = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(edges).id((x) => x.id).distance((e) => 34 + 10 * Math.sqrt(Math.min(e.source.deg ?? 1, e.target.deg ?? 1))).strength(0.5))
    .force('charge', d3.forceManyBody().strength((x) => (x.announced ? -150 : -40)))
    .force('collide', d3.forceCollide((x) => cellR(x) + 5))
    .force('x', d3.forceX(0).strength(0.11)).force('y', d3.forceY(0).strength(0.11))
    .stop()
  if (fresh) sim.tick(fresh === nodes.length ? 400 : 150)
  for (const n of nodes) { n.fx = n.fy = undefined; pos.set(n.id, { x: n.x, y: n.y }) }
  return { nodes, edges, byId, edgeOf }
}
function seedOf(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return ((h >>> 0) % 10000) / 10000 * Math.PI * 2 }

async function load(keepView) {
  const net = NET
  const r = await fetch(`api/fiber?net=${net}`, { cache: 'no-store' })
  if (!r.ok) throw new Error(r.status)
  const d = await r.json()
  if (net !== NET) return
  D = d
  rebuild(keepView)
}
function rebuild(keepView) {
  M = model(D, places[NET])
  if (selected) selected = M.byId.get(selected.id) || null
  size()
  if (!keepView || !fitted) { fit(); fitted = true }
  stats(); detail(); feed(); overview(); empty(); kick()
}

// ================= drawing =================
const canvas = $('graph'), ctx = canvas.getContext('2d')
let T = d3.zoomIdentity, W = 0, H = 0, dpr = 1
let MODE = store.get('fiberMode') === 'simple' ? 'simple' : 'alive'
const flashes = new Map() // edge -> { until, color }
const grows = new Map() // channel id -> when its root started to grow
const buds = new Map() // node id -> when it started to swell
const rings = [] // { x, y, r, at, color }: a sign of life at a root's two ends
let withers = [] // roots that left the map: their last shape, fading
// how far an animation has gone, 0 to 1: a frame's time can come a hair before the event that started it
const since = (at, now, ms) => Math.min(1, Math.max(0, (now - at) / ms))
const cellR = (n) => (n.announced ? n.r * 1.3 + 2 : n.r)
const width = (e) => 0.8 + 1.5 * Math.log10(1 + e.ckb / 500) + (e.tokens.size ? 0.6 : 0)
function edgeStyle(e, now) {
  const f = flashes.get(e)
  if (f && f.until > now) return { color: f.color, alpha: 0.55 + 0.45 * Math.abs(Math.sin(now / 160)), boost: 1.6, glow: true }
  if (!e.on) return { color: C.off, alpha: 0.5, dash: true }
  if (Date.now() - e.created < DAY) return { color: C.pink, alpha: REDUCED ? 0.95 : 0.65 + 0.35 * Math.sin(now / 380), glow: true }
  const age = Date.now() - e.updated
  return { color: e.ckb ? C.lime : C.blue, alpha: age < DAY ? 0.9 : age < 7 * DAY ? 0.42 : 0.2, glow: age < DAY }
}
// a root: a gentle curve from one node to the other
function curve(e) {
  const { x: x1, y: y1 } = e.source, { x: x2, y: y2 } = e.target
  return [x1, y1, (x1 + x2) / 2 - (y2 - y1) * e.bend, (y1 + y2) / 2 + (x2 - x1) * e.bend, x2, y2]
}
function rootPath([x1, y1, cx, cy, x2, y2], p = 1) {
  ctx.beginPath(); ctx.moveTo(x1, y1)
  if (p >= 1) { ctx.quadraticCurveTo(cx, cy, x2, y2); return }
  for (let i = 1; i <= 16; i++) { const s = (i / 16) * p, u = 1 - s; ctx.lineTo(u * u * x1 + 2 * u * s * cx + s * s * x2, u * u * y1 + 2 * u * s * cy + s * s * y2) }
}
// a cell's membrane: a circle that breathes, each one to its own rhythm
function membrane(x, y, R, seed, sec) {
  const N = 20, pts = []
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2
    const r = R * (1 + 0.065 * Math.sin(3 * a + seed + sec * 0.8) + 0.04 * Math.sin(5 * a - seed * 1.7 + sec * 1.25))
    pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r])
  }
  ctx.beginPath()
  const mid = (i) => { const [ax, ay] = pts[i % N], [bx, by] = pts[(i + 1) % N]; return [(ax + bx) / 2, (ay + by) / 2] }
  ctx.moveTo(...mid(N - 1))
  for (let i = 0; i < N; i++) ctx.quadraticCurveTo(pts[i][0], pts[i][1], ...mid(i))
  ctx.closePath()
}
// the glow behind a hub or a lit root's ends, drawn once
const glow = (() => {
  const g = document.createElement('canvas'); g.width = g.height = 128
  const c = g.getContext('2d'), r = c.createRadialGradient(64, 64, 0, 64, 64, 64)
  r.addColorStop(0, 'rgba(203,243,77,0.42)'); r.addColorStop(0.45, 'rgba(203,243,77,0.12)'); r.addColorStop(1, 'rgba(203,243,77,0)')
  c.fillStyle = r; c.fillRect(0, 0, 128, 128); return g
})()
// a few still specks of dust behind the network, so the dark has depth
let dust = null
function makeDust() {
  dust = document.createElement('canvas'); dust.width = Math.round(W * dpr); dust.height = Math.round(H * dpr)
  const c = dust.getContext('2d'); let s = 7
  const rnd = () => ((s = Math.imul(s, 48271) % 2147483647) & 0xffff) / 0xffff
  for (let i = 0; i < Math.round((W * H) / 9000); i++) { c.fillStyle = `rgba(240,236,226,${0.05 + rnd() * 0.12})`; c.fillRect(rnd() * dust.width, rnd() * dust.height, dpr, dpr) }
}
function names(near) {
  // names: the busiest at rest, all of them closer in, the chosen node and its neighbours always; none covers another
  const named = M.nodes.filter((n) => n.name).sort((a, b) => b.deg - a.deg || b.chans - a.chans)
  const show = new Set((T.k < 1.6 ? named.slice(0, 9) : named).map((n) => n.id))
  if (near) for (const id of near) show.add(id)
  const alive = MODE === 'alive'
  ctx.font = alive ? `500 ${11 / T.k}px ${FONT.num}` : `600 ${11.5 / T.k}px ${FONT.ui}`
  ctx.textAlign = 'center'; ctx.lineJoin = 'round'; ctx.globalAlpha = 1
  const boxes = [], pad = 3 / T.k
  for (const n of named.filter((x) => show.has(x.id)).sort((a, b) => (b === selected) - (a === selected))) {
    // a name near the edge slides inward, so it is never cut by the frame
    const w = ctx.measureText(n.name).width, half = (w * T.k) / 2 + 4
    const x = T.invertX(Math.min(Math.max(T.applyX(n.x), half), W - half))
    const y = alive ? n.y + cellR(n) + 14 / T.k : n.y - n.r - 5 / T.k
    const box = [x - w / 2 - pad, y - 12 / T.k, x + w / 2 + pad, y + pad]
    if (n !== selected && boxes.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue
    boxes.push(box)
    ctx.lineWidth = 3.5 / T.k; ctx.strokeStyle = C.bg; ctx.strokeText(n.name, x, y)
    ctx.fillStyle = C.fg; ctx.fillText(n.name, x, y)
  }
}
function drawAlive(now) {
  if (dust) ctx.drawImage(dust, 0, 0, W, H)
  if (!M) return
  ctx.translate(T.x, T.y); ctx.scale(T.k, T.k)
  const sec = REDUCED ? 0 : now / 1000
  const near = selected ? new Set([selected.id, ...selected.peers.keys()]) : null
  ctx.lineCap = 'round'
  // roots that left the map wither where they were
  withers = withers.filter((w) => now - w.at < 1600)
  for (const w of withers) {
    const k = since(w.at, now, 1600)
    ctx.globalAlpha = 0.6 * (1 - k); ctx.strokeStyle = C.off; ctx.lineWidth = w.w / T.k
    ctx.setLineDash([3 / T.k, 5 / T.k]); rootPath(w.c, 1 - k); ctx.stroke()
  }
  ctx.setLineDash([])
  for (const e of M.edges) {
    const s = edgeStyle(e, now), mine = selected && (e.source === selected || e.target === selected), c = curve(e)
    let p = 1
    const g = e.grownBy && grows.get(e.grownBy)
    if (g !== undefined) { p = REDUCED ? 1 : since(g, now, 1400); if (p >= 1) grows.delete(e.grownBy) }
    const w = width(e) + (mine ? 0.8 : 0) + (s.boost || 0)
    ctx.strokeStyle = s.color
    if (s.glow && !(selected && !mine)) { ctx.globalAlpha = s.alpha * 0.16; ctx.lineWidth = (w * 3.4) / T.k; rootPath(c, p); ctx.stroke() }
    ctx.globalAlpha = selected && !mine ? 0.05 : s.alpha
    ctx.lineWidth = w / T.k
    ctx.setLineDash(s.dash ? [4 / T.k, 4 / T.k] : [])
    rootPath(c, p); ctx.stroke()
  }
  ctx.setLineDash([])
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i], k = since(r.at, now, 900)
    if (k >= 1) { rings.splice(i, 1); continue }
    ctx.globalAlpha = 0.7 * (1 - k); ctx.strokeStyle = r.color; ctx.lineWidth = 1.6 / T.k
    ctx.beginPath(); ctx.arc(r.x, r.y, r.r + (18 * k) / T.k, 0, Math.PI * 2); ctx.stroke()
  }
  for (const n of M.nodes) {
    let sc = 1
    const b = buds.get(n.id)
    if (b !== undefined) { const k = REDUCED ? 1 : since(b, now, 900); sc = 1 - (1 - k) ** 3; if (k >= 1) buds.delete(n.id) }
    const R = cellR(n) * sc, dim = near && !near.has(n.id), mark = n === selected || n === hover
    ctx.globalAlpha = dim ? 0.15 : 1
    if (!n.announced) {
      ctx.setLineDash([2 / T.k, 2.5 / T.k]); ctx.lineWidth = 1.1 / T.k; ctx.strokeStyle = mark ? C.fg : C.mut
      ctx.beginPath(); ctx.arc(n.x, n.y, R, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([])
      continue
    }
    const hub = n.deg >= HUB
    if ((hub || mark) && !dim) { const gs = R * 4.2; ctx.globalAlpha = hub ? 0.9 : 0.6; ctx.drawImage(glow, n.x - gs / 2, n.y - gs / 2, gs, gs); ctx.globalAlpha = 1 }
    membrane(n.x, n.y, R, n.seed, sec)
    ctx.fillStyle = hub ? 'rgba(203,243,77,0.13)' : 'rgba(240,236,226,0.06)'; ctx.fill()
    ctx.lineWidth = (hub ? 2.6 : mark ? 2.2 : 1.5) / T.k
    ctx.strokeStyle = hub ? C.lime : mark ? C.fg : n.name ? C.pale : C.mut; ctx.stroke()
    if (hub) {
      // a nucleus of squares, one for each neighbour up to 25
      const k = Math.min(n.deg, 25), cols = Math.ceil(Math.sqrt(k)), side = (R * 0.95) / cols, gap = side * 0.22
      const x0 = n.x - (cols * side) / 2, y0 = n.y - (Math.ceil(k / cols) * side) / 2
      for (let i = 0; i < k; i++) {
        ctx.globalAlpha = (dim ? 0.15 : 1) * (0.45 + 0.55 * (0.5 + 0.5 * Math.sin(sec * 1.4 + i * 1.7 + n.seed)))
        ctx.fillStyle = C.lime; ctx.fillRect(x0 + (i % cols) * side + gap / 2, y0 + Math.floor(i / cols) * side + gap / 2, side - gap, side - gap)
      }
    } else {
      const s = R * 0.46
      ctx.fillStyle = n.name ? C.lime : C.pale; ctx.globalAlpha = dim ? 0.15 : 0.9
      ctx.fillRect(n.x - s / 2, n.y - s / 2, s, s)
    }
  }
  names(near)
}
function drawSimple(now) {
  if (!M) return
  ctx.translate(T.x, T.y); ctx.scale(T.k, T.k)
  const near = selected ? new Set([selected.id, ...selected.peers.keys()]) : null
  for (const e of M.edges) {
    const s = edgeStyle(e, now), mine = selected && (e.source === selected || e.target === selected)
    ctx.globalAlpha = selected && !mine ? 0.05 : s.alpha
    ctx.strokeStyle = s.color
    ctx.lineWidth = (width(e) + (mine ? 0.8 : 0) + (s.boost || 0)) / T.k
    ctx.setLineDash(s.dash ? [4 / T.k, 4 / T.k] : [])
    ctx.beginPath(); ctx.moveTo(e.source.x, e.source.y); ctx.lineTo(e.target.x, e.target.y); ctx.stroke()
  }
  ctx.setLineDash([])
  for (const n of M.nodes) {
    ctx.globalAlpha = near && !near.has(n.id) ? 0.15 : 1
    ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2)
    if (n.announced) {
      ctx.fillStyle = n.name ? C.lime : C.pale; ctx.fill()
      if (n === selected || n === hover) { ctx.lineWidth = 2.5 / T.k; ctx.strokeStyle = C.fg; ctx.stroke() }
    } else { ctx.lineWidth = 1.2 / T.k; ctx.strokeStyle = n === selected || n === hover ? C.fg : C.mut; ctx.stroke() }
  }
  names(near)
}
// a device that cannot keep the cells at 20 drawings a second gets the simple map. What counts is the pace the page
// really keeps, measured on 20 drawings after the first 10 of each start (2026-11-02, Chrome's throttling on the
// testnet map: 30 a second up to a processor 6x slower, 13 at 20x)
let paces = [], auto = false
function draw(now = performance.now()) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, W, H)
  if (MODE === 'alive') drawAlive(now); else drawSimple(now)
  if (MODE === 'alive' && M && paces.length < 30) {
    paces.push(performance.now())
    if (paces.length === 30) {
      const gaps = paces.slice(10).map((x, i, a) => (i ? x - a[i - 1] : 0)).slice(1).sort((a, b) => a - b)
      if (gaps[Math.floor(gaps.length / 2)] > 50) { auto = true; setMode('simple', false) }
    }
  }
}
// alive, the cells breathe at up to about 30 frames a second (every other frame of a 60 Hz screen, every frame of a
// 30 Hz one) while the page is visible; simple, something moves only while
// there is a reason: a channel opened in the last day breathes, a change flashes
let raf = 0, last = 0
function moving(now) { return !REDUCED && M && (MODE === 'alive' || M.edges.some((e) => e.on && Date.now() - e.created < DAY) || [...flashes.values()].some((f) => f.until > now)) }
function frame(now) {
  raf = 0
  if (now - last >= 24 || MODE !== 'alive') { last = now; draw(now) }
  if (moving(now) || rings.length || withers.length || grows.size || buds.size) raf = requestAnimationFrame(frame)
}
function kick() { if (!raf) raf = requestAnimationFrame(frame) }
function flash(channelId, color) {
  const e = M?.edgeOf.get(channelId); if (!e) return
  flashes.set(e, { until: performance.now() + (REDUCED ? 0 : 2600), color })
  if (MODE === 'alive' && !REDUCED) for (const n of [e.source, e.target]) rings.push({ x: n.x, y: n.y, r: cellR(n), at: performance.now(), color })
  kick()
}
function setMode(mode, keep = true) {
  MODE = mode
  if (keep) { store.set('fiberMode', mode); auto = false }
  for (const b of document.querySelectorAll('[data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === mode))
  $('slow').hidden = !auto || mode !== 'simple'
  if (mode === 'alive') paces = []
  if (M) overview()
  draw(); kick()
}
for (const b of document.querySelectorAll('[data-mode]')) b.addEventListener('click', () => setMode(b.dataset.mode))
// a hand on the map keeps its view: the map recentres by itself only until someone moves it
const zoom = d3.zoom().scaleExtent([0.2, 8]).on('zoom', (ev) => { T = ev.transform; if (ev.sourceEvent) moved = true; if (!raf) draw() })
d3.select(canvas).call(zoom).on('dblclick.zoom', null)
// the network fits the space the words leave free: below the name and counts, above what happened and the switches
function fit() {
  if (!M?.nodes.length || !W) return
  const xs = M.nodes.map((n) => n.x), ys = M.nodes.map((n) => n.y)
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  // on a wide screen the words keep to the corners and the network takes the middle, top to bottom, as on the LSP's
  // view; on a narrow one they span the width, so the network sits between them
  const wide = W >= 1000
  const top = wide ? 56 : Math.min(H * 0.4, document.querySelector('.top').getBoundingClientRect().bottom + 12)
  const bottom = wide ? H - 56 : Math.max(H * 0.62, Math.min($('log').getBoundingClientRect().top || H, document.querySelector('.controls').getBoundingClientRect().top) - 12)
  const h = Math.max(120, bottom - top)
  const k = Math.min(3, 0.9 * Math.min(W / (x1 - x0 + 60), h / (y1 - y0 + 60)))
  d3.select(canvas).call(zoom.transform, d3.zoomIdentity.translate(W / 2 - k * (x0 + x1) / 2, top + h / 2 - k * (y0 + y1) / 2).scale(k))
}
function size() {
  const b = canvas.getBoundingClientRect()
  if (b.width === W && b.height === H && dust) return
  W = b.width; H = b.height; dpr = Math.min(2, devicePixelRatio || 1)
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr)
  makeDust()
}
new ResizeObserver(() => { size(); if (!moved) fit(); draw() }).observe(canvas)
// on a phone what happened sits above the switches, which may take one line or two
new ResizeObserver(([e]) => document.documentElement.style.setProperty('--ctl', `${Math.ceil(e.target.getBoundingClientRect().height)}px`)).observe(document.querySelector('.controls'))

// ================= pointing =================
function nodeAt(ev) {
  if (!M) return null
  const b = canvas.getBoundingClientRect(), [x, y] = T.invert([ev.clientX - b.left, ev.clientY - b.top])
  let best = null, bd = Infinity
  for (const n of M.nodes) { const dd = Math.hypot(n.x - x, n.y - y); if (dd < (MODE === 'alive' ? cellR(n) : n.r) + 9 / T.k && dd < bd) { bd = dd; best = n } }
  return best
}
canvas.addEventListener('click', (ev) => select(nodeAt(ev)))
canvas.addEventListener('pointermove', (ev) => {
  if (ev.pointerType !== 'mouse') return
  const n = nodeAt(ev)
  if (n !== hover) { hover = n; if (!raf) draw() }
  const tip = $('tip')
  if (!n) { tip.hidden = true; return }
  tip.innerHTML = `${esc(label(n))} <small>${esc(cnt('fb.chan', n.chans))}</small>`
  tip.style.left = ev.clientX + 'px'; tip.style.top = ev.clientY + 'px'; tip.hidden = false
})
canvas.addEventListener('pointerleave', () => { hover = null; $('tip').hidden = true; if (!raf) draw() })

// ================= words on the page =================
const label = (n) => n.name || t(n.announced ? 'fb.unnamed' : 'fb.hidden')
const nameOf = (id) => M?.byId.get(id)?.name || shortId(id)
function stats() {
  const ckbCh = D.channels.filter((c) => c.asset === 'CKB'), hidden = M.nodes.filter((n) => !n.announced).length
  const big = Math.max(0, ...ckbCh.map((c) => c.cap))
  const item = (b, s, title) => `<span title="${esc(title)}"><b>${b}</b> ${esc(s)}</span>`
  $('stats').innerHTML = [
    item(fmt(D.nodes.length), t('fb.nodes'), hidden ? t('fb.nodesSub', { n: fmt(hidden) }) : t('fb.nodesAll')),
    item(fmt(D.channels.length), t('fb.channels'), t('fb.channelsSub', { n: fmt(M.edges.length) })),
    item(fmt(ckbCh.reduce((s, c) => s + c.cap, 0)), t('fb.s.ckb'), t('fb.ckbSub', { n: fmt(big) })),
    item(fmt(D.chain.open), t('fb.chain'), t('fb.chainSub', { ckb: fmt(D.chain.ckb) })),
  ].join('') + (D.block ? `<span>${esc(t('fb.s.block'))} <b>${fmt(D.block)}</b></span>` : '')
  $('eyebrow-net').textContent = t('fb.' + NET)
}
function empty() {
  const msg = !D.configured ? t('fb.notConfigured') : !D.graphAt ? t('fb.waiting') : ''
  $('empty').textContent = msg; $('empty').hidden = !msg
}
const KIND_COLOR = { open: 'pink', close: 'mut', forced: 'amber', announce: 'lime', node: 'lime', gone: 'off', on: 'lime', off: 'off' }
const dotColor = (e) => C[KIND_COLOR[e.kind === 'close' && e.forced ? 'forced' : e.kind] || 'mut']
function line(e) {
  if (e.kind === 'open') return t('fb.e.open', { ckb: fmt(e.ckb) })
  if (e.kind === 'close') return t(e.forced ? 'fb.e.forced' : 'fb.e.close', { ckb: fmt(e.ckb) })
  if (e.kind === 'announce') return t('fb.e.announce', { a: nameOf(e.a), b: nameOf(e.b), cap: e.asset === 'CKB' ? fmt(e.cap) + ' CKB' : e.asset })
  if (e.kind === 'node') return t('fb.e.node', { name: e.name || shortId(e.id) })
  if (e.kind === 'gone') return t('fb.e.gone', { a: nameOf(e.a), b: nameOf(e.b) })
  if (e.kind === 'on' || e.kind === 'off') return t('fb.e.' + e.kind, { a: nameOf(e.a), b: nameOf(e.b) })
  return ''
}
function eventItem(e, isNew) {
  const where = e.tx ? ` · <a href="${EXPLORER[NET]}${esc(e.tx)}" target="_blank" rel="noopener">${esc(t('fb.block', { n: fmt(e.block) }))}</a>` : ''
  return `<li class="${isNew ? 'new' : ''}"><i style="background:${dotColor(e)}"></i><div>${esc(line(e))}<small>${esc(ago(e.at))}${where}</small></div></li>`
}
// the full list in the panel, and the last four in the corner
function feed(newest) {
  const list = D.events.filter((e) => line(e)).slice().reverse()
  const now = Date.now()
  $('day').textContent = t('fb.day', { opened: fmt(D.channels.filter((c) => now - c.created < DAY).length), active: fmt(D.channels.filter((c) => now - c.updated < DAY).length) })
  const shown = feedAll ? list : list.slice(0, 10)
  $('feed').innerHTML = shown.map((e, i) => eventItem(e, newest && i === 0)).join('') || `<li class="none">${esc(t('fb.none'))}</li>`
  $('more').hidden = feedAll || list.length <= 10
  $('more').textContent = `+ ${fmt(list.length - 10)}`
  $('log').innerHTML = list.slice(0, 4).map((e) => `<li style="border-left-color:${dotColor(e)}">${esc(line(e))}<small>${esc(ago(e.at))}</small></li>`).join('')
}
$('more').addEventListener('click', () => { feedAll = true; feed() })
const dot = (n) => `<i style="background:${n.announced ? (n.deg >= HUB || n.name ? C.lime : C.pale) : 'transparent'};${n.announced ? '' : `box-shadow:inset 0 0 0 1.5px ${C.mut}`}"></i>`
const rows = (list) => `<ol class="rows">${list.map(([n, v]) => `<li><button type="button" data-id="${esc(n.id)}">${dot(n)}<span>${esc(label(n))}</span><b>${v}</b></button></li>`).join('')}</ol>`
const lineIcon = (color, dash) => `<svg viewBox="0 0 30 18" aria-hidden="true"><path d="M2 13Q15 3 28 9" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round"${dash ? ' stroke-dasharray="4 4"' : ''}/></svg>`
const cellIcon = (ring, core, hub) => `<svg viewBox="0 0 30 18" aria-hidden="true"><circle cx="15" cy="9" r="7.5" fill="rgba(240,236,226,0.06)" stroke="${ring}" stroke-width="1.5"${core ? '' : ' stroke-dasharray="2 2.5"'}/>${hub ? [0, 1, 2, 3].map((i) => `<rect x="${11.6 + (i % 2) * 3.6}" y="${5.6 + Math.floor(i / 2) * 3.6}" width="2.8" height="2.8" fill="${C.lime}"/>`).join('') : core ? `<rect x="12.6" y="6.6" width="4.8" height="4.8" fill="${core}"/>` : ''}</svg>`
function overview() {
  const busiest = M.nodes.filter((n) => n.deg).sort((a, b) => b.deg - a.deg || b.chans - a.chans).slice(0, 10)
  const alive = MODE === 'alive'
  const disc = (fill, ring) => `<svg viewBox="0 0 30 18" aria-hidden="true"><circle cx="15" cy="9" r="5" fill="${fill}"${ring ? ` stroke="${ring}" stroke-width="1.5"` : ''}/></svg>`
  $('overview').innerHTML = (busiest.length ? `<h3>${esc(t('fb.top'))}</h3>${rows(busiest.map((n) => [n, `${n.deg} · ${n.chans}`]))}<p class="id rows-note">${esc(t('fb.topNote'))}</p>` : '') +
    `<h3>${esc(t('fb.how'))}</h3><ul class="key">
${alive ? `<li>${cellIcon(C.lime, C.lime, true)}<span>${esc(t('fb.k.hub', { n: HUB }))}</span></li>` : ''}
<li>${alive ? cellIcon(C.pale, C.lime) : disc(C.lime)}<span>${esc(t('fb.k.named'))}</span></li>
<li>${alive ? cellIcon(C.mut, C.pale) : disc(C.pale)}<span>${esc(t('fb.k.unnamed'))}</span></li>
<li>${alive ? cellIcon(C.mut, '') : disc('none', C.mut)}<span>${esc(t('fb.k.hidden'))}</span></li>
<li>${lineIcon(C.lime)}<span>${esc(t('fb.k.line'))}</span></li>
<li>${lineIcon(C.pink)}<span>${esc(t('fb.k.new'))}</span></li>
<li>${lineIcon(C.blue)}<span>${esc(t('fb.k.token'))}</span></li>
<li>${lineIcon(C.off, true)}<span>${esc(t('fb.k.off'))}</span></li></ul>`
}
function detail() {
  const n = selected
  $('detail').hidden = !n
  if (!n) return
  const peers = [...n.peers].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, k]) => [M.byId.get(id), k])
  $('detail').innerHTML = `<button type="button" class="x" id="back" aria-label="${esc(t('close'))}">×</button><div><h2>${esc(label(n))}</h2><p class="id">${esc(n.id)}</p>
<dl class="facts"><dt>${esc(t('fb.software'))}</dt><dd>${n.v ? 'fnn ' + esc(n.v) : esc(t('fb.notAnnounced'))}</dd>
<dt>${esc(t('fb.chans'))}</dt><dd>${esc(t('fb.chansVal', { n: fmt(n.chans), m: cnt('fb.peer', n.deg) }))}</dd>
<dt>CKB</dt><dd>${esc(t('fb.ckbVal', { n: fmt(n.ckb) }))}</dd>
<dt>${esc(t('fb.newest'))}</dt><dd>${n.newest ? esc(ago(n.newest)) : esc(t('fb.never'))}</dd>
<dt>${esc(t('fb.life'))}</dt><dd>${n.updated ? esc(ago(n.updated)) : esc(t('fb.never'))}</dd></dl>
${n.announced ? '' : `<p class="id" style="margin-top:10px">${esc(t('fb.hiddenNote'))}</p>`}</div>
<div><h3>${esc(t('fb.peers'))}</h3>${rows(peers.map(([p, k]) => [p, String(k)]))}</div>`
}
function select(n) {
  selected = n
  if (n) panel(false)
  detail()
  if (!raf) draw()
}
function panel(open) {
  $('panel').hidden = !open
  $('open-panel').setAttribute('aria-expanded', String(open))
  if (open && selected) { selected = null; detail(); if (!raf) draw() }
}
$('open-panel').addEventListener('click', () => panel($('panel').hidden))
$('close-panel').addEventListener('click', () => panel(false))
for (const el of [$('panel'), $('detail')]) el.addEventListener('click', (ev) => {
  if (ev.target.closest('#back')) return select(null)
  const b = ev.target.closest('[data-id]'); if (b && M) select(M.byId.get(b.dataset.id))
})
addEventListener('keydown', (ev) => { if (ev.key !== 'Escape' || document.querySelector('details.pmenu[open]')) return; if (selected) select(null); else panel(false) })

// ================= live =================
let saidAt = 0
function tell(e) {
  const text = line(e); if (!text) return
  if (performance.now() - saidAt > 10000) { saidAt = performance.now(); $('sr').textContent = text }
}
function onEvent(e) {
  if (!D || e.net !== NET) return
  if (e.kind !== 'update') { D.events.push(e); if (D.events.length > 300) D.events.shift() }
  let structural = false
  if (e.kind === 'announce' && !D.channels.some((c) => c.id === e.id)) { D.channels.push({ id: e.id, a: e.a, b: e.b, cap: e.cap, asset: e.asset, created: e.created || e.at, updated: e.updated || e.at, on: true, fee: 0 }); grows.set(e.id, performance.now()); structural = true }
  if (e.kind === 'node' && !D.nodes.some((n) => n.id === e.id)) { D.nodes.push({ id: e.id, name: e.name || '', v: '', ts: e.at }); buds.set(e.id, performance.now()); structural = true }
  if (e.kind === 'gone') {
    const old = M?.edgeOf.get(e.id)
    if (old) withers.push({ c: curve(old), w: width(old), at: performance.now() })
    D.channels = D.channels.filter((c) => c.id !== e.id); structural = true
  }
  const c = D.channels.find((x) => x.id === e.id)
  if (c && (e.kind === 'on' || e.kind === 'off')) c.on = e.kind === 'on'
  if (c && e.kind === 'update') c.updated = Date.now()
  if (e.kind === 'open') { D.chain.open++; D.chain.ckb += e.ckb }
  if (e.kind === 'close') { D.chain.open = Math.max(0, D.chain.open - 1); D.chain.ckb = Math.max(0, D.chain.ckb - e.ckb) }
  if (structural) rebuild(true)
  else { stats(); if (selected) detail() }
  if (e.kind === 'announce') { const ed = M.edgeOf.get(e.id); if (ed) ed.grownBy = e.id }
  flash(e.id, e.kind === 'close' ? (e.forced ? C.amber : C.fg) : e.kind === 'off' ? C.off : C.lime)
  if (e.kind !== 'update') { feed(true); tell(e) }
}
let online = false
function connect() {
  const es = new EventSource('api/fiber/stream')
  es.onopen = () => { online = true; $('live').classList.add('on') }
  es.onmessage = (m) => { try { onEvent(JSON.parse(m.data)) } catch (err) { console.error(err) } }
  es.onerror = () => { online = false; $('live').classList.remove('on') }
}

// ================= switches, language, a new version =================
function show(net) {
  D = NET === net ? D : null
  NET = net; selected = null; feedAll = false; fitted = false; moved = false
  store.set('fiberNet', net)
  if (location.hash.slice(1) !== net) history.replaceState(null, '', '#' + net)
  for (const b of document.querySelectorAll('[data-net]')) b.setAttribute('aria-pressed', String(b.dataset.net === net))
  $('eyebrow-net').textContent = t('fb.' + net)
  shareSlot()
  detail()
  load(false).catch((err) => { console.warn(err); $('empty').textContent = t('err.load'); $('empty').hidden = false; setTimeout(() => { if (NET === net && !D) show(net) }, 10000) })
}
for (const b of document.querySelectorAll('[data-net]')) b.addEventListener('click', () => { if (b.dataset.net !== NET) show(b.dataset.net) })
addEventListener('hashchange', () => { const n = location.hash.slice(1); if (['mainnet', 'testnet'].includes(n) && n !== NET) show(n) })
// the share for the network on screen; its link names the network so the preview shows that map
function shareSlot() { $('share-slot').innerHTML = shareHtml(t, { url: `${location.origin}/fiber?net=${NET}&lang=${LANG}&d=${today()}#${NET}`, title: `${t('fb.title')} · ${t('fb.' + NET)}`, image: `${location.origin}/og/fiber.png?net=${NET}&lang=${LANG}` }); $('share-slot').querySelector('details')?.classList.add('up') }
function applyLang() {
  document.documentElement.lang = t('locale')
  for (const el of document.querySelectorAll('[data-t]')) el.textContent = t(el.dataset.t)
  for (const el of document.querySelectorAll('a[data-href]')) el.href = `${el.dataset.href}${el.dataset.href.includes('?') ? '&' : '?'}lang=${LANG}`
  for (const el of document.querySelectorAll('[data-t-label]')) { el.setAttribute('aria-label', t(el.dataset.tLabel)); el.title = t(el.dataset.tLabel) }
  $('menu-slot').innerHTML = menuHtml(t, { lang: LANG, current: 'fiber' })
  $('views-slot').innerHTML = viewsHtml(t, { lang: LANG, current: 'fiber' })
  $('slow').textContent = t('fb.slow')
  shareSlot()
  $('eyebrow-net').textContent = t('fb.' + NET)
  for (const b of document.querySelectorAll('[data-lang]')) b.setAttribute('aria-pressed', String(b.dataset.lang === LANG))
  if (D && M) { stats(); detail(); feed(); overview(); empty() }
}
// the language buttons live in the menu, drawn again with each language
$('menu-slot').addEventListener('click', (e) => {
  const b = e.target.closest('[data-lang]')
  if (b) { LANG = b.dataset.lang; store.set('lang', LANG); applyLang() }
  else if (e.target.closest('[data-act="fiber"]')) { e.preventDefault(); e.target.closest('details').open = false }
})
const BUILD = document.querySelector('meta[name="build"]')?.content || '__BUILD__'
let lastInput = Date.now()
for (const ev of ['pointerdown', 'keydown', 'wheel']) addEventListener(ev, () => { lastInput = Date.now() }, { passive: true })
async function checkVersion() {
  if (BUILD === '__BUILD__' || document.visibilityState !== 'visible') return
  try {
    const { v } = await (await fetch('version.json', { cache: 'no-store' })).json()
    if (typeof v !== 'string' || v === BUILD) return
    if (Date.now() - lastInput > 15 * 60e3) location.reload(); else $('update').hidden = false
  } catch { /* offline: the next round */ }
}
$('update-go').addEventListener('click', () => location.reload())

applyLang()
setMode(MODE, false)
show(NET)
connect()
// the whole picture again every five minutes, in case the stream missed something
setInterval(() => load(true).catch(() => {}), 5 * 60e3)
setInterval(checkVersion, 90e3)
// a page put away while it measures its pace would read the pause as slowness: it measures again on return
document.addEventListener('visibilitychange', () => { checkVersion(); if (document.visibilityState === 'visible') kick(); else if (paces.length < 30) paces = [] })
