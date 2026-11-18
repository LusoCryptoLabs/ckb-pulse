// The screen for calls (/present, see present.mjs): the slides change by themselves, the keys and the small bar change them by
// hand, and the bar and the pointer go away after three seconds without the pointer moving. The numbers come from the same
// calls the live page makes (/api/state, /api/impact), once a minute.
const W = JSON.parse(document.getElementById('pr-words').textContent)
const $ = (id) => document.getElementById(id)
const slides = W.slides.map(([id, ms]) => ({ id, ms, el: $('s-' + id) }))
const html = document.documentElement
const num = (n) => Number(n).toLocaleString(W.lang === 'zh' ? 'zh-CN' : W.lang)
const short = (n) => String(n).split('/').pop()
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const fill = (tpl, v) => String(tpl).replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '')
const ready = { live: true } // a slide with nothing to show is passed over until its numbers arrive
let cur = 0, playing = true, timer = 0

// ---- the numbers
const rank = (id, rows, face) => {
  const max = Math.max(1, ...rows.map((r) => r[1]))
  $(id).innerHTML = rows.slice(0, 5).map(([name, n, avatar]) => `<li>${face ? `<span class="n">${num(n)}</span><img src="${esc(avatar + (String(avatar).endsWith('?') ? '' : '&') + 's=160')}" alt="" width="96" height="96">` : `<span class="n">${num(n)}</span>`}<span class="who">${esc(short(name))}${face ? '' : `<small>${esc(String(name).split('/')[0])}</small>`}</span><span class="bar"><i style="width:${Math.round((n / max) * 100)}%"></i></span></li>`).join('')
}
function paintState(s) {
  const d = s.leaders?.day, w = s.leaders?.week
  if (!d?.stats) return
  $('n-up').textContent = num(d.stats.updates); $('n-people').textContent = num(d.stats.people); $('n-projects').textContent = num(d.stats.projects)
  rank('r-projects', d.repos || [], false); rank('r-people', d.people || [], true)
  ready.projects = !!d.repos?.length; ready.people = !!d.people?.length
  if (w?.stats) {
    $('w-up').textContent = num(w.stats.updates); $('w-people').textContent = num(w.stats.people); $('w-projects').textContent = num(w.stats.projects)
    $('w-repo').textContent = w.repos?.[0] ? short(w.repos[0][0]) : ''; $('w-person').textContent = w.people?.[0]?.[0] || ''
    ready.week = true
  }
}
function paintCcc(c) {
  if (c?.using == null) return
  $('c-using').textContent = num(c.using); $('c-line').textContent = fill(W['pr.ccc.n'], { active: num(c.active) })
  $('c-list').innerHTML = (c.projects || []).slice(0, 8).map((p) => `<li>${esc(short(p.repo))}</li>`).join('')
  ready.ccc = true
}
async function load() {
  try { paintState(await (await fetch('api/state')).json()) } catch {}
  try { paintCcc(await (await fetch('api/impact?lib=ccc')).json()) } catch {}
  try { const l = await (await fetch('api/last?lang=' + W.lang)).json(); $('last').textContent = l.line || '' } catch {}
}

// ---- the turns
const dots = [...document.querySelectorAll('.dots [data-go]')]
const prog = $('pr-prog')
function show(i) {
  cur = (i + slides.length) % slides.length
  slides.forEach((s, k) => { s.el.classList.toggle('on', k === cur); s.el.toggleAttribute('inert', k !== cur) })
  dots.forEach((d, k) => d.setAttribute('aria-current', String(k === cur)))
  clearTimeout(timer); prog.style.transition = 'none'; prog.style.transform = 'scaleX(0)'
  if (playing) {
    void prog.offsetWidth // the bar starts again from nothing
    prog.style.transition = `transform ${slides[cur].ms}ms linear`; prog.style.transform = 'scaleX(1)'
    timer = setTimeout(() => step(1), slides[cur].ms)
  }
}
function step(by) { let n = cur; for (let k = 0; k < slides.length; k++) { n = (n + by + slides.length) % slides.length; if (ready[slides[n].id]) break } show(n) }
function play(on) {
  playing = on; const b = $('pr-play'); b.textContent = on ? '❚❚' : '▶'; b.setAttribute('aria-label', on ? W['pr.pause'] : W['pr.play'])
  show(cur)
}
$('pr-prev').addEventListener('click', () => step(-1)); $('pr-next').addEventListener('click', () => step(1)); $('pr-play').addEventListener('click', () => play(!playing))
for (const d of dots) d.addEventListener('click', () => show(Number(d.dataset.go)))
const toggleFull = () => { if (document.fullscreenElement) document.exitFullscreen(); else html.requestFullscreen?.() }
$('pr-full').addEventListener('click', toggleFull)
if (!document.fullscreenEnabled) $('pr-full').hidden = true // iPhones have no full screen for pages
addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return
  if (e.key === 'ArrowRight' || e.key === 'PageDown') step(1)
  else if (e.key === 'ArrowLeft' || e.key === 'PageUp') step(-1)
  else if (e.key === ' ') { e.preventDefault(); play(!playing) }
  else if (e.key === 'f' || e.key === 'F') toggleFull()
  else if (e.key === 'Escape' && !document.fullscreenElement) location.href = $('pr-leave').href
  else return
  wakeBar()
})

// ---- the bar and the pointer rest after three seconds
let rest = 0
function wakeBar() { html.classList.remove('still'); clearTimeout(rest); rest = setTimeout(() => html.classList.add('still'), 3000) }
addEventListener('pointermove', wakeBar, { passive: true }); addEventListener('pointerdown', wakeBar, { passive: true }); wakeBar()
setTimeout(() => { $('pr-hint').hidden = true }, 7000)

load(); setInterval(load, 60000)
show(0)
