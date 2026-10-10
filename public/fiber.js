// Fiber Pulse: the Fiber payment network on CKB, live. A map of the public graph, from the server's listening nodes,
// and every channel opened or closed on chain. Payments travel encrypted between nodes and are never shown.
// Data: /api/fiber?net= (the map and a week of events), /api/fiber/stream (what happens next).
import { WORDS } from './words.js'

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
const shortId = (id) => String(id).replace(/^0x/, '').slice(0, 8)
const EXPLORER = { mainnet: 'https://explorer.nervos.org/transaction/', testnet: 'https://testnet.explorer.nervos.org/transaction/' }

// ================= data =================
let NET = ['mainnet', 'testnet'].includes(location.hash.slice(1)) ? location.hash.slice(1) : store.get('fiberNet') === 'testnet' ? 'testnet' : 'mainnet'
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
    if (!e) pairs.set(k, (e = { source: s, target: tg, n: 0, ckb: 0, tokens: new Set(), updated: 0, created: 0, on: false }))
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
  for (const n of nodes) { n.deg = n.peers.size; n.r = n.announced ? 3.2 + 2.3 * Math.sqrt(n.deg) : 2.6 }
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
    .force('collide', d3.forceCollide((x) => x.r + 5))
    .force('x', d3.forceX(0).strength(0.11)).force('y', d3.forceY(0).strength(0.11))
    .stop()
  if (fresh) sim.tick(fresh === nodes.length ? 400 : 150)
  for (const n of nodes) { n.fx = n.fy = undefined; pos.set(n.id, { x: n.x, y: n.y }) }
  return { nodes, edges, byId, edgeOf }
}

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
const flashes = new Map() // edge -> { until, color }
const width = (e) => 0.8 + 1.5 * Math.log10(1 + e.ckb / 500) + (e.tokens.size ? 0.6 : 0)
function edgeStyle(e, now) {
  const f = flashes.get(e)
  if (f && f.until > now) return { color: f.color, alpha: 0.55 + 0.45 * Math.abs(Math.sin(now / 160)), boost: 1.6 }
  if (!e.on) return { color: C.off, alpha: 0.5, dash: true }
  if (Date.now() - e.created < DAY) return { color: C.pink, alpha: REDUCED ? 0.95 : 0.65 + 0.35 * Math.sin(now / 380) }
  const age = Date.now() - e.updated
  return { color: e.ckb ? C.lime : C.blue, alpha: age < DAY ? 0.9 : age < 7 * DAY ? 0.42 : 0.2 }
}
function draw(now = performance.now()) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, W, H)
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
  // names: the busiest at rest, all of them closer in, the chosen node and its neighbours always; none covers another
  const named = M.nodes.filter((n) => n.name).sort((a, b) => b.deg - a.deg || b.chans - a.chans)
  const show = new Set((T.k < 1.6 ? named.slice(0, 9) : named).map((n) => n.id))
  if (near) for (const id of near) show.add(id)
  ctx.font = `600 ${11.5 / T.k}px ${css.getPropertyValue('--ui')}`
  ctx.textAlign = 'center'; ctx.lineJoin = 'round'; ctx.globalAlpha = 1
  const boxes = [], pad = 3 / T.k
  for (const n of named.filter((x) => show.has(x.id)).sort((a, b) => (b === selected) - (a === selected))) {
    // a name near the edge slides inward, so it is never cut by the frame
    const w = ctx.measureText(n.name).width, half = (w * T.k) / 2 + 4
    const x = T.invertX(Math.min(Math.max(T.applyX(n.x), half), W - half)), y = n.y - n.r - 5 / T.k
    const box = [x - w / 2 - pad, y - 12 / T.k, x + w / 2 + pad, y + pad]
    if (n !== selected && boxes.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue
    boxes.push(box)
    ctx.lineWidth = 3.5 / T.k; ctx.strokeStyle = C.bg; ctx.strokeText(n.name, x, y)
    ctx.fillStyle = C.fg; ctx.fillText(n.name, x, y)
  }
}
// something moves only while there is a reason: a channel opened in the last day breathes, a change flashes
let raf = 0
function moving(now) { return !REDUCED && M && (M.edges.some((e) => e.on && Date.now() - e.created < DAY) || [...flashes.values()].some((f) => f.until > now)) }
function frame(now) { draw(now); raf = moving(now) ? requestAnimationFrame(frame) : 0 }
function kick() { if (!raf) raf = requestAnimationFrame(frame) }
function flash(channelId, color) {
  const e = M?.edgeOf.get(channelId); if (!e) return
  flashes.set(e, { until: performance.now() + (REDUCED ? 0 : 2600), color })
  kick()
}
// a hand on the map keeps its view: the map recentres by itself only until someone moves it
const zoom = d3.zoom().scaleExtent([0.2, 8]).on('zoom', (ev) => { T = ev.transform; if (ev.sourceEvent) moved = true; if (!raf) draw() })
d3.select(canvas).call(zoom).on('dblclick.zoom', null)
function fit() {
  if (!M?.nodes.length || !W) return
  const xs = M.nodes.map((n) => n.x), ys = M.nodes.map((n) => n.y)
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const k = Math.min(3, 0.9 * Math.min(W / (x1 - x0 + 60), H / (y1 - y0 + 60)))
  d3.select(canvas).call(zoom.transform, d3.zoomIdentity.translate(W / 2 - k * (x0 + x1) / 2, H / 2 - k * (y0 + y1) / 2).scale(k))
}
function size() {
  const b = canvas.getBoundingClientRect()
  W = b.width; H = b.height; dpr = Math.min(2, devicePixelRatio || 1)
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr)
}
new ResizeObserver(() => { size(); if (!moved) fit(); draw() }).observe(canvas)

// ================= pointing =================
function nodeAt(ev) {
  if (!M) return null
  const b = canvas.getBoundingClientRect(), [x, y] = T.invert([ev.clientX - b.left, ev.clientY - b.top])
  let best = null, bd = Infinity
  for (const n of M.nodes) { const dd = Math.hypot(n.x - x, n.y - y); if (dd < n.r + 9 / T.k && dd < bd) { bd = dd; best = n } }
  return best
}
canvas.addEventListener('click', (ev) => select(nodeAt(ev)))
canvas.addEventListener('pointermove', (ev) => {
  if (ev.pointerType !== 'mouse') return
  const n = nodeAt(ev)
  if (n !== hover) { hover = n; if (!raf) draw() }
  const tip = $('tip')
  if (!n) { tip.hidden = true; return }
  const b = canvas.getBoundingClientRect()
  tip.innerHTML = `${esc(label(n))} <small>${esc(cnt('fb.chan', n.chans))}</small>`
  tip.style.left = ev.clientX - b.left + 'px'; tip.style.top = ev.clientY - b.top + 'px'; tip.hidden = false
})
canvas.addEventListener('pointerleave', () => { hover = null; $('tip').hidden = true; if (!raf) draw() })

// ================= words on the page =================
const label = (n) => n.name || t(n.announced ? 'fb.unnamed' : 'fb.hidden')
const nameOf = (id) => M?.byId.get(id)?.name || shortId(id)
function stats() {
  const ckbCh = D.channels.filter((c) => c.asset === 'CKB'), hidden = M.nodes.filter((n) => !n.announced).length
  const big = Math.max(0, ...ckbCh.map((c) => c.cap))
  $('stats').innerHTML = [
    [fmt(D.nodes.length), t('fb.nodes'), hidden ? t('fb.nodesSub', { n: fmt(hidden) }) : t('fb.nodesAll')],
    [fmt(D.channels.length), t('fb.channels'), t('fb.channelsSub', { n: fmt(M.edges.length) })],
    [fmt(ckbCh.reduce((s, c) => s + c.cap, 0)), t('fb.ckb'), t('fb.ckbSub', { n: fmt(big) })],
    [fmt(D.chain.open), t('fb.chain'), t('fb.chainSub', { ckb: fmt(D.chain.ckb) })],
  ].map(([b, s, m]) => `<div class="stat"><b>${b}</b><span>${esc(s)}</span><small>${esc(m)}</small></div>`).join('')
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
function feed(newest) {
  const list = D.events.filter((e) => line(e)).slice().reverse()
  const now = Date.now()
  $('day').textContent = t('fb.day', { opened: fmt(D.channels.filter((c) => now - c.created < DAY).length), active: fmt(D.channels.filter((c) => now - c.updated < DAY).length) })
  const shown = feedAll ? list : list.slice(0, 10)
  $('feed').innerHTML = shown.map((e, i) => eventItem(e, newest && i === 0)).join('') || `<li class="none">${esc(t('fb.none'))}</li>`
  $('more').hidden = feedAll || list.length <= 10
  $('more').textContent = `+ ${fmt(list.length - 10)}`
}
$('more').addEventListener('click', () => { feedAll = true; feed() })
const dot = (n) => `<i style="background:${n.announced ? (n.name ? C.lime : C.pale) : 'transparent'};${n.announced ? '' : `box-shadow:inset 0 0 0 1.5px ${C.mut}`}"></i>`
const rows = (list) => `<ol class="rows">${list.map(([n, v]) => `<li><button type="button" data-id="${esc(n.id)}">${dot(n)}<span>${esc(label(n))}</span><b>${v}</b></button></li>`).join('')}</ol>`
const lineIcon = (color, dash) => `<svg viewBox="0 0 30 14" aria-hidden="true"><line x1="2" y1="7" x2="28" y2="7" stroke="${color}" stroke-width="2.4" stroke-linecap="round"${dash ? ' stroke-dasharray="4 4"' : ''}/></svg>`
const disc = (fill, ring) => `<svg viewBox="0 0 30 14" aria-hidden="true"><circle cx="15" cy="7" r="5" fill="${fill}"${ring ? ` stroke="${ring}" stroke-width="1.5"` : ''}/></svg>`
function overview() {
  const busiest = M.nodes.filter((n) => n.deg).sort((a, b) => b.deg - a.deg || b.chans - a.chans).slice(0, 10)
  $('overview').hidden = !!selected
  $('overview').innerHTML = (busiest.length ? `<h3>${esc(t('fb.top'))}</h3>${rows(busiest.map((n) => [n, `${n.deg} · ${n.chans}`]))}<p class="id rows-note">${esc(t('fb.topNote'))}</p>` : '') +
    `<h3>${esc(t('fb.how'))}</h3><ul class="key">
<li>${disc(C.lime)}<span>${esc(t('fb.k.named'))}</span></li>
<li>${disc(C.pale)}<span>${esc(t('fb.k.unnamed'))}</span></li>
<li>${disc('none', C.mut)}<span>${esc(t('fb.k.hidden'))}</span></li>
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
  $('detail').innerHTML = `<button type="button" class="back" id="back">‹ ${esc(t('fb.all'))}</button><h2>${esc(label(n))}</h2><p class="id">${esc(n.id)}</p>
<dl class="facts"><dt>${esc(t('fb.software'))}</dt><dd>${n.v ? 'fnn ' + esc(n.v) : esc(t('fb.notAnnounced'))}</dd>
<dt>${esc(t('fb.chans'))}</dt><dd>${esc(t('fb.chansVal', { n: fmt(n.chans), m: cnt('fb.peer', n.deg) }))}</dd>
<dt>CKB</dt><dd>${esc(t('fb.ckbVal', { n: fmt(n.ckb) }))}</dd>
<dt>${esc(t('fb.newest'))}</dt><dd>${n.newest ? esc(ago(n.newest)) : esc(t('fb.never'))}</dd>
<dt>${esc(t('fb.life'))}</dt><dd>${n.updated ? esc(ago(n.updated)) : esc(t('fb.never'))}</dd></dl>
${n.announced ? '' : `<p class="id" style="margin-top:10px">${esc(t('fb.hiddenNote'))}</p>`}
<h3>${esc(t('fb.peers'))}</h3>${rows(peers.map(([p, k]) => [p, String(k)]))}`
}
function select(n) {
  selected = n
  detail(); overview()
  if (n) $('detail').querySelector('h2')?.scrollIntoView?.({ block: 'nearest' })
  if (!raf) draw()
}
$('panel').addEventListener('click', (ev) => {
  if (ev.target.closest('#back')) return select(null)
  const b = ev.target.closest('[data-id]'); if (b && M) select(M.byId.get(b.dataset.id))
})
addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && selected) select(null) })

// ================= live =================
let nowTimer = 0, saidAt = 0
function tell(e) {
  const text = line(e); if (!text) return
  $('now').innerHTML = `<i style="background:${dotColor(e)}"></i>${esc(text)}`
  $('now').hidden = false
  clearTimeout(nowTimer); nowTimer = setTimeout(() => { $('now').hidden = true }, 12000)
  if (performance.now() - saidAt > 10000) { saidAt = performance.now(); $('sr').textContent = text }
}
function onEvent(e) {
  if (!D || e.net !== NET) return
  if (e.kind !== 'update') { D.events.push(e); if (D.events.length > 300) D.events.shift() }
  let structural = false
  if (e.kind === 'announce' && !D.channels.some((c) => c.id === e.id)) { D.channels.push({ id: e.id, a: e.a, b: e.b, cap: e.cap, asset: e.asset, created: e.created || e.at, updated: e.updated || e.at, on: true, fee: 0 }); structural = true }
  if (e.kind === 'node' && !D.nodes.some((n) => n.id === e.id)) { D.nodes.push({ id: e.id, name: e.name || '', v: '', ts: e.at }); structural = true }
  if (e.kind === 'gone') { D.channels = D.channels.filter((c) => c.id !== e.id); structural = true }
  const c = D.channels.find((x) => x.id === e.id)
  if (c && (e.kind === 'on' || e.kind === 'off')) c.on = e.kind === 'on'
  if (c && e.kind === 'update') c.updated = Date.now()
  if (e.kind === 'open') { D.chain.open++; D.chain.ckb += e.ckb }
  if (e.kind === 'close') { D.chain.open = Math.max(0, D.chain.open - 1); D.chain.ckb = Math.max(0, D.chain.ckb - e.ckb) }
  if (structural) rebuild(true)
  else { stats(); if (selected) detail() }
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
  load(false).catch((err) => { console.warn(err); $('empty').textContent = t('err.load'); $('empty').hidden = false; setTimeout(() => { if (NET === net && !D) show(net) }, 10000) })
}
for (const b of document.querySelectorAll('[data-net]')) b.addEventListener('click', () => { if (b.dataset.net !== NET) show(b.dataset.net) })
function applyLang() {
  document.documentElement.lang = t('locale')
  for (const el of document.querySelectorAll('[data-t]')) el.textContent = t(el.dataset.t)
  for (const el of document.querySelectorAll('[data-t-label]')) { el.setAttribute('aria-label', t(el.dataset.tLabel)); el.title = t(el.dataset.tLabel) }
  for (const b of document.querySelectorAll('[data-lang]')) b.setAttribute('aria-pressed', String(b.dataset.lang === LANG))
  if (D && M) { stats(); detail(); feed(); overview(); empty() }
}
for (const b of document.querySelectorAll('[data-lang]')) b.addEventListener('click', () => { LANG = b.dataset.lang; store.set('lang', LANG); applyLang() })
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
show(NET)
connect()
// the whole picture again every five minutes, in case the stream missed something
setInterval(() => load(true).catch(() => {}), 5 * 60e3)
setInterval(checkVersion, 90e3)
document.addEventListener('visibilitychange', checkVersion)
