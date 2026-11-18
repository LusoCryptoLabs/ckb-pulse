// The screen for calls (/present, see present.mjs): the numbers and the two lists refresh once a minute from the calls the live
// page makes (/api/state, /api/impact), the latest updates come in as they happen (/api/stream), the clock and the "minutes ago"
// move on their own, and the live scene starts in its frame where the device can carry it.
const W = JSON.parse(document.getElementById('pr-words').textContent)
const $ = (id) => document.getElementById(id)
const loc = W.lang === 'zh' ? 'zh-CN' : W.lang
const num = (n) => Number(n).toLocaleString(loc)
const short = (n) => String(n).split('/').pop()
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const fill = (tpl, v) => String(tpl).replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '')
const face = (url, px) => (url ? `${url}${String(url).endsWith('?') ? '' : String(url).includes('?') ? '&' : '?'}s=${px}` : '')

// ---- what has happened, newest first
const events = new Map() // id -> event
const ago = (iso) => {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000)
  if (s < 60) return W['ago.now']
  if (s < 3600) return fill(W['ago.min'], { n: Math.floor(s / 60) })
  if (s < 86400) return fill(W['ago.h'], { n: Math.floor(s / 3600) })
  const d = Math.floor(s / 86400)
  return d === 1 ? W['ago.day'] : fill(W['ago.days'], { n: d })
}
let fresh = ''
function drawFeed() {
  const rows = [...events.values()].filter((e) => !e.bot).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 3)
  $('feed').innerHTML = rows.map((e) => `<li${e.id === fresh ? ' class="fresh"' : ''}><time datetime="${esc(e.at)}">${esc(ago(e.at))}</time>${e.avatar ? `<img src="${esc(face(e.avatar, 80))}" alt="" width="40" height="40">` : '<span></span>'}<span class="what"><b>${esc(e.actor)}</b> ${esc(fill(W['v.' + e.kind] || '{repo}', { repo: short(e.repo) }))}${e.title ? `<small>${esc(e.title)}</small>` : ''}</span></li>`).join('')
  fresh = ''
}

// ---- the numbers and the lists
const rank = (id, rows, faces) => {
  const max = Math.max(1, ...rows.map((r) => r[1]))
  $(id).innerHTML = rows.slice(0, 5).map(([name, n, avatar]) => `<li><span class="n">${num(n)}</span>${faces ? `<img src="${esc(face(avatar, 80))}" alt="" width="44" height="44">` : ''}<span class="who">${esc(short(name))}${faces ? '' : `<small>${esc(String(name).split('/')[0])}</small>`}</span><span class="bar"><i style="width:${Math.round((n / max) * 100)}%"></i></span></li>`).join('')
}
function paintState(s) {
  const d = s.leaders?.day, w = s.leaders?.week
  if (!d?.stats) return
  $('n-up').textContent = num(d.stats.updates); $('n-people').textContent = num(d.stats.people); $('n-projects').textContent = num(d.stats.projects)
  rank('r-projects', d.repos || [], false); rank('r-people', d.people || [], true)
  if (w?.stats) $('week').textContent = fill(W['pr.week.line'], { updates: num(w.stats.updates), people: num(w.stats.people), projects: num(w.stats.projects) })
  for (const e of s.events || []) events.set(e.id, e)
  drawFeed()
}
function paintCcc(c) { if (c?.using != null) $('ccc').textContent = fill(W['pr.ccc.line'], { using: num(c.using), active: num(c.active) }) }
async function load() {
  try { paintState(await (await fetch('api/state')).json()) } catch {}
  try { paintCcc(await (await fetch('api/impact?lib=ccc')).json()) } catch {}
}
load(); setInterval(load, 60000)

// ---- as it happens
try {
  const es = new EventSource('api/stream')
  es.onmessage = (m) => { try { const e = JSON.parse(m.data); if (!e.id || e.bot) return; events.set(e.id, e); fresh = e.id; drawFeed() } catch {} }
} catch {}

// ---- the clock and the minutes
const clock = () => { $('clock').textContent = new Date().toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' }) }
clock(); setInterval(() => { clock(); for (const t of document.querySelectorAll('#feed time')) t.textContent = ago(t.getAttribute('datetime')) }, 30000)

// ---- full screen, where the browser has it (an iPhone does not)
const full = $('pr-full')
if (document.fullscreenEnabled) full.addEventListener('click', () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen() })
else full.hidden = true
addEventListener('keydown', (e) => { if ((e.key === 'f' || e.key === 'F') && !e.metaKey && !e.ctrlKey && !e.altKey && document.fullscreenEnabled) full.click() })

// ---- the live scene, in its frame, on a wide screen with motion allowed and no data saver
const scene = $('scene')
if (matchMedia('(min-width: 900px) and (min-height: 520px)').matches && !matchMedia('(prefers-reduced-motion: reduce)').matches && !navigator.connection?.saveData) {
  const f = document.createElement('iframe')
  f.src = scene.dataset.live; f.title = ''; f.tabIndex = -1; f.setAttribute('aria-hidden', 'true')
  scene.insertBefore(f, scene.querySelector('a.open'))
  addEventListener('message', (e) => { if (e.source === f.contentWindow && e.data?.pulse === 'ready') scene.classList.add('live') })
}
