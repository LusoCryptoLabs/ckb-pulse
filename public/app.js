// CKB Pulse page: draws the cells from /api/state and pulses them from /api/stream.
// When nothing happens for a while it replays the last 24 hours, always marked REPLAY; a live event interrupts it.
const KINDS = {
  push: ['pushed', '--push'], pr_open: ['opened a PR', '--pr'], pr_merged: ['merged a PR', '--merged'], pr_closed: ['closed a PR', '--closed'],
  issue_open: ['opened an issue', '--issue'], issue_closed: ['closed an issue', '--closed'], comment: ['commented', '--talk'], review: ['reviewed', '--talk'],
  release: ['released', '--release'], repo: ['created a repo', '--repo'], star: ['starred', '--star'], fork: ['forked', '--fork'], branch: ['opened a branch', '--ref'], tag: ['tagged', '--ref'],
}
const LEGEND = [['push', 'push'], ['pr_open', 'PR opened'], ['pr_merged', 'PR merged'], ['issue_open', 'issue'], ['comment', 'discussion'], ['release', 'release'], ['repo', 'new repo'], ['star', 'star']]
const IDLE_MS = 15000 // quiet this long and the replay starts
const REPLAY_MS = 90000 // the last 24 h replayed in 90 s
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches
const $ = (id) => document.getElementById(id)
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const cssColor = (kind) => `var(${(KINDS[kind] || KINDS.push)[1]})`
const rawColor = (kind) => getComputedStyle(document.documentElement).getPropertyValue((KINDS[kind] || KINDS.push)[1]).trim()
const hhmm = (d) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
let S = null
let filter = null
const cellEls = new Map()
let geo = [] // [{name, el, x, y}]
let lastLive = 0

function ago(iso) {
  const s = (Date.now() - new Date(iso)) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  const d = Math.floor(s / 86400)
  return d === 1 ? 'yesterday' : `${d} days ago`
}
const sum = (list) => list.reduce((s, r) => s + r.n24, 0)

// ---------- drawing ----------
function render() {
  $('s-hour').textContent = S.stats.hour
  $('s-day').textContent = S.stats.day
  $('s-active').textContent = S.stats.activeRepos24
  $('s-builders').textContent = S.stats.builders
  $('s-bots').textContent = S.stats.bots24
  $('legend').innerHTML = LEGEND.map(([k, label]) => `<span><i style="background:${cssColor(k)}"></i>${label}</span>`).join('')
  const tags = Object.entries(S.stats.perTag).sort((a, b) => b[1] - a[1])
  $('tags').innerHTML = tags.map(([t, n]) => `<button type="button" data-tag="${esc(t)}" aria-pressed="${filter === t}">${esc(t)}<b>${n}</b></button>`).join('')
  const groups = new Map()
  for (const r of S.repos) { if (!groups.has(r.group)) groups.set(r.group, []); groups.get(r.group).push(r) }
  const order = [...groups.keys()].filter((g) => g !== 'builders').sort((a, b) => sum(groups.get(b)) - sum(groups.get(a)) || groups.get(b).length - groups.get(a).length)
  if (groups.has('builders')) order.push('builders')
  cellEls.clear()
  $('groups').innerHTML = order.map((g) => {
    const list = groups.get(g).sort((a, b) => (b.lastAt || '').localeCompare(a.lastAt || '') || (b.lastBotAt || '').localeCompare(a.lastBotAt || '') || (b.pushedAt || '').localeCompare(a.pushedAt || ''))
    const title = g === 'builders' ? 'Builders' : `<a href="https://github.com/${esc(g)}" target="_blank" rel="noopener">${esc(g)}</a>`
    return `<div class="group"><h3>${title}<span>${list.filter((r) => r.lastAt).length} of ${list.length} active · ${sum(list)} events today</span></h3><div class="cells">${list.map((r) => `<button type="button" class="cell" data-repo="${esc(r.name)}" aria-label="${esc(r.name)}"></button>`).join('')}</div></div>`
  }).join('')
  for (const el of document.querySelectorAll('.cell')) {
    const r = S.repos.find((x) => x.name === el.dataset.repo)
    cellEls.set(r.name, el)
    paint(el, r)
  }
  $('feed').innerHTML = S.events.slice(0, 80).map((e) => item(e, false)).join('')
  $('note').textContent = `${S.repos.length} public repositories followed; ${S.repos.filter((r) => r.lastAt).length} with activity by people in the last ${S.keepDays} days. Dark cells are quiet, grey ones only saw automation.`
  drawTimeline()
  measure()
  applyFilter()
}
function paint(el, r) {
  // people: colour of the last event, brighter with more activity today; breathing while active today
  if (r.lastKind) {
    el.style.background = cssColor(r.lastKind)
    el.style.color = cssColor(r.lastKind)
    el.style.opacity = r.n24 ? Math.min(1, 0.5 + 0.12 * r.n24) : 0.32
    el.classList.toggle('alive', r.n24 > 0)
    if (r.n24) { el.style.setProperty('--d', `${(Math.random() * 3).toFixed(2)}s`); el.style.setProperty('--t', `${(2.2 + Math.random() * 1.6).toFixed(2)}s`); el.style.setProperty('--amp', String(Math.min(1.9, 1.15 + 0.1 * r.n24))) }
  } else {
    el.style.background = r.lastBotAt ? 'var(--botcell)' : 'var(--olive)'
    el.style.color = 'var(--bot)'
    el.style.opacity = r.lastBotAt ? 0.75 : 0.55
    el.classList.remove('alive')
  }
}
function item(e, isNew) {
  const [verb] = KINDS[e.kind] || [e.kind]
  const title = e.title ? `<div class="title"><a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.title)}</a></div>` : ''
  return `<li class="${isNew ? 'new' : ''}" data-repo="${esc(e.repo)}"><span class="dot" style="background:${cssColor(e.kind)}"></span><div>
<div class="what"><b>${esc(e.actor)}</b> ${verb} in <a href="https://github.com/${esc(e.repo)}" target="_blank" rel="noopener">${esc(e.repo)}</a>${e.ref && e.kind === 'push' ? ` <span>(${esc(e.ref)})</span>` : ''}</div>
${title}<div class="meta">${(e.tags || []).map((t) => `<em>${esc(t)}</em>`).join('')}<time datetime="${esc(e.at)}">${ago(e.at)}</time></div></div></li>`
}

// ---------- timeline: the last 24 h in half-hour bars ----------
function drawTimeline() {
  const now = Date.now(), N = 48, h = new Array(N).fill(0), b = new Array(N).fill(0)
  for (const e of S.day) {
    const i = Math.min(N - 1, Math.max(0, Math.floor((new Date(e.at) - (now - 864e5)) / (864e5 / N))))
    if (e.bot) b[i]++; else h[i]++
  }
  const max = Math.max(1, ...h.map((v, i) => v + b[i]))
  $('bars').innerHTML = h.map((v, i) => `<span style="--h:${(v / max) * 100}%;--b:${(b[i] / max) * 100}%"><i class="hb"></i><i class="bb"></i></span>`).join('')
}
function headAt(frac) { $('head').style.left = `${(frac * 100).toFixed(2)}%`; $('head').hidden = false }

// ---------- motion ----------
function measure() {
  const g = $('groups').getBoundingClientRect()
  geo = [...cellEls].map(([name, el]) => { const b = el.getBoundingClientRect(); return { name, el, x: b.left - g.left + b.width / 2, y: b.top - g.top + b.height / 2 } })
}
addEventListener('resize', () => { clearTimeout(measure.t); measure.t = setTimeout(measure, 200) })
// the cell pops, a ring opens, and a wave runs through its neighbours
function pulse(name, kind, strength = 1, bot = false) {
  const el = cellEls.get(name)
  if (!el) return
  if (bot) {
    el.animate([{ filter: 'brightness(1)', transform: 'scale(1)' }, { filter: 'brightness(2.2)', transform: 'scale(1.18)' }, { filter: 'brightness(1)', transform: 'scale(1)' }], { duration: 700, easing: 'ease-out' })
    return
  }
  el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse')
  if (REDUCED) return
  const o = geo.find((g) => g.name === name)
  if (!o) return
  const color = rawColor(kind)
  const R = 260 * strength
  for (const g of geo) {
    if (g.el === el) continue
    const d = Math.hypot(g.x - o.x, g.y - o.y)
    if (d > R) continue
    const k = 1 - d / R
    g.el.animate([
      { boxShadow: '0 0 0 0 transparent', outlineColor: 'transparent' },
      { boxShadow: `0 0 ${6 + 10 * k}px ${1 + 2 * k}px ${color}`, outline: `2px solid ${color}`, outlineOffset: '1px' },
      { boxShadow: '0 0 0 0 transparent', outlineColor: 'transparent' },
    ], { duration: 650, delay: d * 2.2, easing: 'ease-out' })
  }
}

// ---------- live ----------
function onEvent(e) {
  lastLive = Date.now()
  stopReplay()
  let r = S.repos.find((x) => x.name === e.repo)
  const fresh = !r
  if (!r) { r = { name: e.repo, group: e.group, desc: '', n: 0, n24: 0, b24: 0, lastAt: null, lastKind: null, lastBotAt: null, tags: e.tags || [] }; S.repos.push(r) }
  S.day.push({ at: e.at, kind: e.kind, repo: e.repo, actor: e.actor, title: e.title, bot: !!e.bot })
  if (e.bot) { r.b24++; r.lastBotAt = e.at; S.stats.bots24++ } else {
    r.n++; r.n24++; r.lastAt = e.at; r.lastKind = e.kind
    S.stats.hour++; S.stats.day++
    for (const t of e.tags || []) S.stats.perTag[t] = (S.stats.perTag[t] || 0) + 1
    S.events.unshift(e); S.events = S.events.slice(0, 300)
  }
  if (fresh) render()
  const el = cellEls.get(e.repo)
  if (el) paint(el, r)
  pulse(e.repo, e.kind, 1.25, !!e.bot)
  if (!e.bot) {
    $('feed').insertAdjacentHTML('afterbegin', item(e, true))
    while ($('feed').children.length > 120) $('feed').lastElementChild.remove()
    setNow('LIVE', hhmm(e.at), `${e.actor} ${(KINDS[e.kind] || [e.kind])[0]} in ${e.repo}${e.title ? `: ${e.title}` : ''}`)
  }
  $('s-hour').textContent = S.stats.hour; $('s-day').textContent = S.stats.day; $('s-bots').textContent = S.stats.bots24
  drawTimeline(); headAt(1)
  applyFilter()
}
function setNow(mode, clock, text) {
  $('mode').textContent = mode
  $('now').classList.toggle('replay', mode !== 'LIVE')
  $('clock').textContent = clock
  $('ticker').textContent = text
}

// ---------- replay of the last 24 h ----------
let replay = null
function startReplay() {
  if (replay || !S || !S.day.length) return
  const t0 = Date.now() - 864e5
  replay = { start: performance.now(), t0, i: 0, list: S.day.slice().sort((a, b) => a.at.localeCompare(b.at)) }
  requestAnimationFrame(stepReplay)
}
function stopReplay() { replay = null; $('now').classList.remove('replay') }
function stepReplay(ts) {
  if (!replay) return
  const frac = Math.min(1, (ts - replay.start) / REPLAY_MS)
  const tNow = replay.t0 + frac * 864e5
  headAt(frac)
  setNow('REPLAY · LAST 24 H', hhmm(tNow), $('ticker').textContent)
  while (replay.i < replay.list.length && new Date(replay.list[replay.i].at) <= tNow) {
    const e = replay.list[replay.i++]
    pulse(e.repo, e.kind, 0.8, e.bot)
    if (!e.bot) setNow('REPLAY · LAST 24 H', hhmm(e.at), `${e.actor} ${(KINDS[e.kind] || [e.kind])[0]} in ${e.repo}${e.title ? `: ${e.title}` : ''}`)
  }
  if (frac >= 1) { replay = null; setTimeout(() => { if (Date.now() - lastLive > IDLE_MS) startReplay() }, 2500); return }
  requestAnimationFrame(stepReplay)
}
setInterval(() => { if (!replay && Date.now() - lastLive > IDLE_MS && !document.hidden) startReplay() }, 1000)

// ---------- filter and tooltip ----------
function applyFilter() {
  for (const b of document.querySelectorAll('.tags button')) b.setAttribute('aria-pressed', String(b.dataset.tag === filter))
  for (const [name, el] of cellEls) {
    const r = S.repos.find((x) => x.name === name)
    el.classList.toggle('dim', !!filter && !(r.tags || []).includes(filter))
  }
  for (const li of document.querySelectorAll('#feed li')) li.hidden = !!filter && !S.repos.find((x) => x.name === li.dataset.repo)?.tags?.includes(filter)
}
$('tags').addEventListener('click', (ev) => {
  const b = ev.target.closest('button')
  if (!b) return
  filter = filter === b.dataset.tag ? null : b.dataset.tag
  applyFilter()
})
const tip = $('tip')
function showTip(el, x, y) {
  const r = S.repos.find((v) => v.name === el.dataset.repo)
  if (!r) return
  const people = r.lastAt ? `${r.n24} events today · ${r.n} in ${S.keepDays} days · last ${ago(r.lastAt)}` : `no activity by people in ${S.keepDays} days`
  tip.innerHTML = `<b>${esc(r.name)}</b>${r.desc ? `<span>${esc(r.desc)}</span>` : ''}<span>${people}</span>${r.b24 ? `<span>${r.b24} automated today</span>` : ''}`
  tip.hidden = false
  const w = tip.offsetWidth, h = tip.offsetHeight
  tip.style.left = `${Math.min(window.innerWidth - w - 8, Math.max(8, x + 12))}px`
  tip.style.top = `${y + h + 20 > window.innerHeight ? y - h - 12 : y + 16}px`
}
$('groups').addEventListener('mousemove', (ev) => { const el = ev.target.closest('.cell'); if (el) showTip(el, ev.clientX, ev.clientY); else tip.hidden = true })
$('groups').addEventListener('mouseleave', () => { tip.hidden = true })
$('groups').addEventListener('click', (ev) => {
  const el = ev.target.closest('.cell')
  if (!el) return
  if (matchMedia('(hover: hover)').matches) { window.open(`https://github.com/${el.dataset.repo}`, '_blank', 'noopener'); return }
  const b = el.getBoundingClientRect()
  showTip(el, b.left, b.bottom)
})

// ---------- start ----------
function connect() {
  const es = new EventSource('/api/stream')
  es.onopen = () => { $('live').classList.add('on'); $('live').title = 'live' }
  es.onmessage = (m) => { try { onEvent(JSON.parse(m.data)) } catch (err) { console.error(err) } }
  es.onerror = () => { $('live').classList.remove('on'); $('live').title = 'reconnecting' }
}
async function load() {
  const r = await fetch('/api/state', { cache: 'no-store' })
  S = await r.json()
  render()
  const last = S.events[0]
  if (last && !replay) setNow('LIVE', hhmm(last.at), `Last: ${last.actor} ${(KINDS[last.kind] || [last.kind])[0]} in ${last.repo}, ${ago(last.at)}`)
}
load().then(() => { connect(); lastLive = Date.now() - IDLE_MS + 4000 })
// keep counts honest and relative times fresh (not during a replay, so the grid is not redrawn under it)
setInterval(() => { if (!replay) load().catch(() => {}) }, 120e3)
setInterval(() => { for (const t of document.querySelectorAll('#feed time')) t.textContent = ago(t.getAttribute('datetime')) }, 30e3)
