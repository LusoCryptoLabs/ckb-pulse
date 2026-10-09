// CKB Pulse page: draws the cells from /api/state and pulses them from /api/stream.
const KINDS = {
  push: ['pushed', '--push'], pr_open: ['opened a PR', '--pr'], pr_merged: ['merged a PR', '--merged'], pr_closed: ['closed a PR', '--closed'],
  issue_open: ['opened an issue', '--issue'], issue_closed: ['closed an issue', '--closed'], comment: ['commented', '--talk'], review: ['reviewed', '--talk'],
  release: ['released', '--release'], repo: ['created a repo', '--repo'], star: ['starred', '--star'], fork: ['forked', '--fork'], branch: ['opened a branch', '--ref'], tag: ['tagged', '--ref'],
}
const LEGEND = [['push', 'push'], ['pr_open', 'PR opened'], ['pr_merged', 'PR merged'], ['issue_open', 'issue'], ['comment', 'discussion'], ['release', 'release'], ['repo', 'new repo'], ['star', 'star']]
const $ = (id) => document.getElementById(id)
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const color = (kind) => `var(${(KINDS[kind] || KINDS.push)[1]})`
let S = null
let filter = null
const cellEls = new Map()

function ago(iso) {
  const s = (Date.now() - new Date(iso)) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  const d = Math.floor(s / 86400)
  return d === 1 ? 'yesterday' : `${d} days ago`
}

// brightness from activity in the last 24 h; dormant repos stay faint
const glow = (r) => (r.n24 ? Math.min(1, 0.45 + 0.12 * r.n24) : 0.28)

function render() {
  $('s-hour').textContent = S.stats.hour
  $('s-day').textContent = S.stats.day
  $('s-active').textContent = S.stats.activeRepos24
  $('s-builders').textContent = S.stats.builders
  $('legend').innerHTML = LEGEND.map(([k, label]) => `<span><i style="background:${color(k)}"></i>${label}</span>`).join('')
  const tags = Object.entries(S.stats.perTag).sort((a, b) => b[1] - a[1])
  $('tags').innerHTML = tags.map(([t, n]) => `<button type="button" data-tag="${esc(t)}" aria-pressed="${filter === t}">${esc(t)}<b>${n}</b></button>`).join('')
  // groups: organisations by activity, builders last
  const groups = new Map()
  for (const r of S.repos) { if (!groups.has(r.group)) groups.set(r.group, []); groups.get(r.group).push(r) }
  const order = [...groups.keys()].filter((g) => g !== 'builders').sort((a, b) => sum(groups.get(b)) - sum(groups.get(a)))
  if (groups.has('builders')) order.push('builders')
  cellEls.clear()
  $('groups').innerHTML = order.map((g) => {
    const list = groups.get(g).sort((a, b) => (b.lastAt || '').localeCompare(a.lastAt || '') || (b.pushedAt || '').localeCompare(a.pushedAt || ''))
    const title = g === 'builders' ? 'Builders' : `<a href="https://github.com/${esc(g)}" target="_blank" rel="noopener">${esc(g)}</a>`
    return `<div class="group"><h3>${title}<span>${list.filter((r) => r.lastAt).length} of ${list.length} active · ${sum(list)} events today</span></h3><div class="cells">${list.map((r) => `<button type="button" class="cell" data-repo="${esc(r.name)}" aria-label="${esc(r.name)}"></button>`).join('')}</div></div>`
  }).join('')
  for (const el of document.querySelectorAll('.cell')) {
    const r = S.repos.find((x) => x.name === el.dataset.repo)
    cellEls.set(r.name, el)
    paint(el, r)
  }
  $('feed').innerHTML = S.events.slice(0, 80).map((e) => item(e, false)).join('')
  $('note').textContent = `${S.repos.length} repositories followed; ${S.repos.filter((r) => r.lastAt).length} with activity in the last ${S.keepDays} days. Dark cells are quiet.`
  applyFilter()
}
const sum = (list) => list.reduce((s, r) => s + r.n24, 0)
function paint(el, r) {
  // dormant repos (no event in the window) stay as dark cells; active ones take the colour of their last event
  el.style.background = r.lastKind ? color(r.lastKind) : 'var(--olive)'
  el.style.color = r.lastKind ? color(r.lastKind) : 'var(--lime)'
  el.style.opacity = r.lastKind ? glow(r) : 0.55
}
function item(e, isNew) {
  const [verb] = KINDS[e.kind] || [e.kind]
  const title = e.title ? `<div class="title"><a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.title)}</a></div>` : ''
  return `<li class="${isNew ? 'new' : ''}" data-repo="${esc(e.repo)}"><span class="dot" style="background:${color(e.kind)}"></span><div>
<div class="what"><b>${esc(e.actor)}</b> ${verb} in <a href="https://github.com/${esc(e.repo)}" target="_blank" rel="noopener">${esc(e.repo)}</a>${e.ref && e.kind !== 'branch' && e.kind !== 'tag' ? ` <span>(${esc(e.ref)})</span>` : ''}</div>
${title}<div class="meta">${(e.tags || []).map((t) => `<em>${esc(t)}</em>`).join('')}<time datetime="${esc(e.at)}">${ago(e.at)}</time></div></div></li>`
}

function applyFilter() {
  for (const b of document.querySelectorAll('.tags button')) b.setAttribute('aria-pressed', String(b.dataset.tag === filter))
  for (const [name, el] of cellEls) {
    const r = S.repos.find((x) => x.name === name)
    el.classList.toggle('dim', !!filter && !(r.tags || []).includes(filter))
  }
  for (const li of document.querySelectorAll('#feed li')) {
    const e = S.events.find((x) => x.repo === li.dataset.repo)
    li.hidden = !!filter && !S.repos.find((x) => x.name === li.dataset.repo)?.tags?.includes(filter)
  }
}
$('tags').addEventListener('click', (ev) => {
  const b = ev.target.closest('button')
  if (!b) return
  filter = filter === b.dataset.tag ? null : b.dataset.tag
  applyFilter()
})

// tooltip on hover and tap
const tip = $('tip')
function showTip(el, x, y) {
  const r = S.repos.find((v) => v.name === el.dataset.repo)
  if (!r) return
  tip.innerHTML = `<b>${esc(r.name)}</b>${r.desc ? `<span>${esc(r.desc)}</span>` : ''}<span>${r.lastAt ? `${r.n24} events today · ${r.n} in ${S.keepDays} days · last ${ago(r.lastAt)}` : `quiet for ${S.keepDays} days${r.pushedAt ? ` · last push ${ago(r.pushedAt)}` : ''}`}</span>`
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

// live: each new event pulses its cell and enters the feed
function onEvent(e) {
  S.events.unshift(e)
  S.events = S.events.slice(0, 300)
  let r = S.repos.find((x) => x.name === e.repo)
  const fresh = !r
  if (!r) { r = { name: e.repo, group: e.group, desc: '', n: 0, n24: 0, lastAt: e.at, lastKind: e.kind, tags: e.tags || [] }; S.repos.push(r) }
  r.n++; r.n24++; r.lastAt = e.at; r.lastKind = e.kind
  S.stats.hour++; S.stats.day++
  for (const t of e.tags || []) S.stats.perTag[t] = (S.stats.perTag[t] || 0) + 1
  if (fresh) { render() }
  const el = cellEls.get(e.repo)
  if (el) { paint(el, r); el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse') }
  $('feed').insertAdjacentHTML('afterbegin', item(e, true))
  while ($('feed').children.length > 120) $('feed').lastElementChild.remove()
  $('s-hour').textContent = S.stats.hour; $('s-day').textContent = S.stats.day
  applyFilter()
}
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
}
load().then(connect)
// keep counts honest and relative times fresh
setInterval(() => { load().catch(() => {}) }, 120e3)
setInterval(() => { for (const t of document.querySelectorAll('#feed time')) t.textContent = ago(t.getAttribute('datetime')) }, 30e3)
