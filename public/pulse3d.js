// CKB Pulse in 3D: repositories as blocks of light, people as avatars above them, each update a comet from the person
// to the project. Three ways to look: live, the last 24 hours, the last 7 days. The camera stays where the viewer puts it.
// Data: /api/state (7 days of compact history, highlights, groups), /api/stream (live), /api/repo (one project).
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import { WORDS, FAMILY, KIND_FAMILY, TAGS, groupName } from './words.js'

const DAY = 864e5
const IDLE_MS = 15000
const QUIET_MS = 10 * 60e3 // no update by people for this long: the day replays instead of a still scene
const REFRESH_MS = 10 * 60e3 // new projects, new organisations and the highlights come with a fresh state
const MOBILE = matchMedia('(max-width: 860px)').matches || matchMedia('(pointer: coarse)').matches
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches
const $ = (id) => document.getElementById(id)
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const store = { get: (k) => { try { return localStorage.getItem('ckbpulse.' + k) } catch { return null } }, set: (k, v) => { try { localStorage.setItem('ckbpulse.' + k, v) } catch {} } }
const MEDAL = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5.5 1h3.2l1.3 4.2-3.1 1.2zM14.5 1h-3.2L10 5.2l3.1 1.2z" fill="#e0533d"/><circle cx="10" cy="12.6" r="6.2" fill="#f3c23a" stroke="#a8740c" stroke-width="1.2"/><path d="M10 9.2l1.05 2.1 2.3.33-1.67 1.62.4 2.3L10 14.47l-2.08 1.08.4-2.3-1.67-1.62 2.3-.33z" fill="#fff4cc"/></svg>'

// ================= words =================
const browserLang = (navigator.language || '').toLowerCase()
let LANG = WORDS[store.get('lang')] ? store.get('lang') : browserLang.startsWith('zh') ? 'zh' : browserLang.startsWith('pt') ? 'pt' : 'en'
const t = (k, v) => String(WORDS[LANG][k] ?? WORDS.en[k] ?? k).replace(/\{(\w+)\}/g, (_, x) => v?.[x] ?? '')
const fam = (k) => KIND_FAMILY[k] || 'code'
const kcol = (k) => FAMILY[fam(k)]
const FAMS = Object.keys(FAMILY)
const short = (name) => String(name || '').split('/').pop()
const gname = (g) => groupName(g, { ...WORDS.en, ...WORDS[LANG] })
const fmtClock = (x) => new Date(x).toLocaleTimeString(t('locale'), { hour: '2-digit', minute: '2-digit' })
const fmtDay = (x) => new Date(x).toLocaleDateString(t('locale'), { weekday: 'short' }) + ' ' + fmtClock(x)
function ago(x) {
  const s = (Date.now() - x) / 1000
  if (s < 60) return t('ago.now')
  if (s < 3600) return t('ago.min', { n: Math.floor(s / 60) })
  if (s < 86400) return t('ago.h', { n: Math.floor(s / 3600) })
  const d = Math.floor(s / 86400); return d === 1 ? t('ago.day') : t('ago.days', { n: d })
}
const cnt = (base, n) => t(base + (n === 1 ? '.1' : '.n'), { n })
// the words for the window on screen: the period, and the moment it ends when that is not now
const shown = (base) => { const wk = T.period === 'week' ? 'week' : 'day'; return T.mode === 'live' || T.mode === 'done' ? t(base + wk) : t(base + wk + 'At', { time: fmtDay(T.t) }) }
const when = () => shown('when.')

// ================= data =================
let S = null
let repos = [] // from the server, plus repos first seen live
let rows = [] // {t, k, r, a, b, title, c}
let actors = [] // [login, avatar]
const actorIdx = new Map()
const filt = { tag: null, fam: null, bots: true, mine: false }
// three ways to look: live, the last 24 hours, the last 7 days. A period plays from its start to now (mode replay),
// holds the full picture (done), then plays again; dragging the timeline pauses anywhere in the week
const PERIOD = { live: { span: DAY }, day: { span: DAY, ms: 90000 }, week: { span: 7 * DAY, ms: 120000 } }
const T = { mode: 'live', period: 'live', t: Date.now(), rate: 1, auto: false, chosen: false, doneAt: 0, autoAt: 0, lastLive: 0, lastUser: 0, ptr: 0, holdTicker: 0 }
const span = () => PERIOD[T.period].span
let introOpen = false
let hlPeriod = null // the highlights period picked by hand; until then it follows the period on screen

function actorOf(login, avatar) {
  if (!actorIdx.has(login)) { actorIdx.set(login, actors.length); actors.push([login, avatar || '']) }
  const i = actorIdx.get(login)
  if (avatar && !actors[i][1]) actors[i][1] = avatar
  return i
}
// avatars.githubusercontent.com answers by login with CORS open, so the image can become a WebGL texture
const ghAvatar = (login, avatar, s) => avatar ? avatar + (avatar.includes('?') ? '&' : '?') + 's=' + s : `https://avatars.githubusercontent.com/${encodeURIComponent(login || '')}?s=${s}`
const avatarUrl = (i) => ghAvatar(actors[i]?.[0], actors[i]?.[1], 96)
const stateRepo = (name) => S?.repos?.find((r) => r.name === name)

// ================= scene =================
const renderer = new THREE.WebGLRenderer({ antialias: !MOBILE, powerPreference: 'high-performance' })
renderer.setPixelRatio(Math.min(devicePixelRatio, MOBILE ? 1.5 : 2))
renderer.setSize(innerWidth, innerHeight)
renderer.toneMapping = THREE.NeutralToneMapping // keeps hues saturated; ACES washed the cells into pastel
$('stage').appendChild(renderer.domElement)
const labelRenderer = new CSS2DRenderer()
labelRenderer.setSize(innerWidth, innerHeight)
Object.assign(labelRenderer.domElement.style, { position: 'fixed', inset: '0', pointerEvents: 'none' })
$('stage').appendChild(labelRenderer.domElement)

const scene = new THREE.Scene()
scene.background = new THREE.Color('#07090a')
scene.fog = new THREE.FogExp2('#07090a', 0.011)
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 600)
// the view only moves when the viewer moves it (or opens something to look at)
const controls = new OrbitControls(camera, renderer.domElement)
Object.assign(controls, { enableDamping: true, dampingFactor: 0.08, autoRotate: false, maxPolarAngle: 1.33, minDistance: 5, enablePan: true, screenSpacePanning: false })
controls.addEventListener('start', () => { T.lastUser = Date.now(); flight = null })

scene.add(new THREE.HemisphereLight('#cfdcb6', '#0a0c08', 0.45))
const sun = new THREE.DirectionalLight('#ffffff', 0.85)
sun.position.set(30, 60, 20)
scene.add(sun)
const ground = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), new THREE.MeshStandardMaterial({ color: '#080b06', roughness: 1 }))
ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02
scene.add(ground)
const grid = new THREE.GridHelper(400, 308, '#1f2b12', '#11180a')
grid.material.transparent = true; grid.material.opacity = 0.55
scene.add(grid)

const composer = new EffectComposer(renderer)
composer.addPass(new RenderPass(scene, camera))
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), MOBILE ? 0.85 : 1.05, 0.6, 0.42)
composer.addPass(bloom)
composer.addPass(new OutputPass())
let useBloom = true

// glow sprite texture for comets and sparks
const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
})()

// ================= cells =================
const PITCH = 1.3
let mesh = null
const cell = [] // per repo: {x, z, h, hT, glow, flash: Color, base: Color, dim, dimT, hover, born}
const groupLabels = []
const groupCenter = new Map()
let layoutR = 20
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3(), tmpC = new THREE.Color()
const DORMANT = new THREE.Color('#1c2412'), BOTCELL = new THREE.Color('#3b4330')

function spiral(n) {
  // grid slots ordered from the centre outwards, so the busiest repos sit in the middle of their cluster
  const cols = Math.ceil(Math.sqrt(n)), rowsN = Math.ceil(n / cols)
  const slots = []
  for (let r = 0; r < rowsN; r++) for (let c = 0; c < cols; c++) slots.push([c - (cols - 1) / 2, r - (rowsN - 1) / 2])
  slots.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]) || Math.atan2(a[1], a[0]) - Math.atan2(b[1], b[0]))
  return { slots: slots.slice(0, n), w: cols * PITCH, d: rowsN * PITCH }
}
const isNewGroup = (g) => !!S?.groups?.find((x) => x.name === g)?.isNew
function labelText(div) { div.innerHTML = `${esc(gname(div.dataset.g))} · ${div.dataset.n}${isNewGroup(div.dataset.g) ? `<em>${esc(t('new.org'))}</em>` : ''}` }
function buildCells() {
  if (mesh) { scene.remove(mesh); mesh.geometry.dispose() }
  for (const l of groupLabels) l.parent?.remove(l)
  groupLabels.length = 0; groupCenter.clear(); cell.length = 0
  if (!repos.length) return
  const groups = new Map()
  repos.forEach((r, i) => { if (!groups.has(r.group)) groups.set(r.group, []); groups.get(r.group).push(i) })
  const weekly = new Array(repos.length).fill(0)
  for (const w of rows) if (w.r >= 0 && !w.b) weekly[w.r]++
  const clusters = [...groups.entries()].map(([g, list]) => { list.sort((a, b) => weekly[b] - weekly[a] || (repos[b].pushedAt || '').localeCompare(repos[a].pushedAt || '')); return { g, list, ...spiral(list.length) } })
  const center = clusters.find((c) => c.g === 'builders') || clusters.sort((a, b) => b.list.length - a.list.length)[0]
  const ring = clusters.filter((c) => c !== center).sort((a, b) => b.list.length - a.list.length)
  const place = (c, cx, cz) => { c.cx = cx; c.cz = cz; c.list.forEach((ri, k) => { const [sx, sz] = c.slots[k]; cell[ri] = { x: cx + sx * PITCH, z: cz + sz * PITCH } }) }
  place(center, 0, 0)
  const half = (c) => Math.hypot(c.w, c.d) / 2
  const R = half(center) + Math.max(...ring.map(half), 2) + 3.5
  const total = ring.reduce((s, c) => s + Math.max(c.w, c.d) + 3, 0)
  let ang = -Math.PI / 2
  const step = (2 * Math.PI) / Math.max(total, 2 * Math.PI * R / 1.6)
  for (const c of ring) {
    const sp = (Math.max(c.w, c.d) + 3) * step
    ang += sp / 2
    place(c, Math.cos(ang) * R, Math.sin(ang) * R)
    ang += sp / 2
  }
  layoutR = R + Math.max(...ring.map(half), 2)
  for (const c of clusters) {
    groupCenter.set(c.g, { x: c.cx, z: c.cz, r: half(c) })
    const div = document.createElement('div')
    div.className = 'lbl culled' // born hidden: the next cull shows it only where it covers nothing
    div.dataset.g = c.g; div.dataset.n = c.list.length
    labelText(div)
    const o = new CSS2DObject(div)
    o.position.set(c.cx, 0.2, c.cz + c.d / 2 + 1.1)
    o.userData.prio = 100 + c.list.length
    scene.add(o); groupLabels.push(o)
  }
  const geo = new RoundedBoxGeometry(1, 1, 1, 2, 0.14)
  geo.translate(0, 0.5, 0)
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.32, metalness: 0.1 })
  mat.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += vColor.rgb * 0.95;') }
  mesh = new THREE.InstancedMesh(geo, mat, repos.length + 64)
  mesh.count = repos.length
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array((repos.length + 64) * 3), 3)
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage)
  scene.add(mesh)
  repos.forEach((r, i) => { Object.assign(cell[i], { h: 0.01, hT: 0.25, glow: 0, flash: new THREE.Color('#ffffff'), base: DORMANT.clone(), dim: 1, dimT: 1, hover: 0, born: performance.now() + Math.hypot(cell[i].x, cell[i].z) * 18 }) })
}
function addRepo(r) {
  // a repository first seen live: a new cell on the outer ring
  const i = repos.length
  repos.push(r)
  const a = Math.random() * Math.PI * 2, R = layoutR + 3
  cell[i] = { x: Math.cos(a) * R, z: Math.sin(a) * R, h: 0.01, hT: 0.4, glow: 0, flash: new THREE.Color('#fff'), base: DORMANT.clone(), dim: 1, dimT: 1, hover: 0, born: performance.now() }
  if (mesh && i < mesh.instanceMatrix.count) mesh.count = repos.length
  return i
}

// ================= the window on screen =================
const W = { n: [], b: [], last: [], bits: [], people: new Map(), day: 0, bots: 0, fams: {} }
function computeWindow() {
  const t1 = T.t, t0 = t1 - span(), scale = T.period === 'week' ? 0.3 : 1
  W.n = new Array(repos.length).fill(0); W.b = new Array(repos.length).fill(0); W.last = new Array(repos.length).fill(null); W.bits = new Array(repos.length).fill(0)
  W.people = new Map(); W.day = 0; W.bots = 0; W.fams = {}; W.mine = new Array(repos.length).fill(0)
  for (const w of rows) {
    if (w.t > t1) break
    if (w.t < t0 || w.r < 0) continue
    if (w.b) { W.b[w.r]++; W.bots++; continue }
    const f = fam(w.k)
    W.n[w.r]++; W.last[w.r] = w.k; W.day++; W.bits[w.r] |= 1 << FAMS.indexOf(f)
    W.people.set(w.a, (W.people.get(w.a) || 0) + 1)
    if (followsPerson(actors[w.a]?.[0])) W.mine[w.r] = 1
    W.fams[f] = (W.fams[f] || 0) + 1
  }
  repos.forEach((r, i) => {
    const c = cell[i]
    if (!c) return
    if (W.n[i]) { const n = W.n[i] * scale; c.base.set(kcol(W.last[i])).multiplyScalar(0.55 + Math.min(0.9, 0.12 * n)); c.hT = 0.45 + 0.85 * Math.log2(1 + n) }
    else if (W.b[i]) { c.base.copy(BOTCELL); c.hT = 0.32 }
    else { c.base.copy(DORMANT); c.hT = 0.22 }
  })
  applyFilter()
  kpis(); filterCounts(); people()
}
function matches(ri, k, a) {
  if (ri < 0) return false
  if (filt.tag && !(repos[ri].tags || []).includes(filt.tag)) return false
  if (filt.mine && !followsRepo(repos[ri].name) && !(a != null ? followsPerson(actors[a]?.[0]) : W.mine[ri])) return false
  if (filt.fam && k) return fam(k) === filt.fam
  if (filt.fam) return !!(W.bits[ri] & (1 << FAMS.indexOf(filt.fam)))
  return true
}
const filtering = () => !!(filt.tag || filt.fam || filt.mine)
function applyFilter() { repos.forEach((r, i) => { if (cell[i]) cell[i].dimT = !filtering() ? 1 : matches(i) ? 1 : 0.12 }) }

// ================= numbers =================
const tween = new Map()
function setNum(id, v) {
  const el = $(id), from = +el.dataset.v || 0
  el.dataset.v = v
  tween.set(id, { from, to: v, t0: performance.now() })
}
function stepTweens(now) {
  for (const [id, tw] of tween) {
    const k = Math.min(1, (now - tw.t0) / 700)
    $(id).textContent = Math.round(tw.from + (tw.to - tw.from) * (1 - Math.pow(1 - k, 3)))
    if (k >= 1) tween.delete(id)
  }
}
function kpis() {
  setNum('k-day', W.day); setNum('k-people', W.people.size); setNum('k-active', W.n.filter(Boolean).length)
  $('k-cap').textContent = shown('k.')
}

// ================= filters =================
// built once per language, so an open topic list is never rebuilt under the finger; the counts update in place
function buildFilters() {
  $('fams').innerHTML = `<button type="button" data-fam="">${esc(t('f.all'))}</button>` +
    FAMS.map((f) => `<button type="button" data-fam="${f}"><i style="background:${FAMILY[f]}"></i>${esc(t('fam.' + f))}<b></b></button>`).join('')
  $('topic').innerHTML = `<option value="">${esc(t('topic.all'))}</option>` + TAGS.map((g) => `<option value="${esc(g)}">${esc(t('tag.' + g))}</option>`).join('')
  $('topic').value = filt.tag || ''
  syncFilters(); filterCounts()
}
function syncFilters() {
  for (const b of $('fams').querySelectorAll('button')) b.setAttribute('aria-pressed', String((b.dataset.fam || null) === filt.fam))
  $('topic').classList.toggle('on', !!filt.tag)
  $('bots').setAttribute('aria-pressed', String(filt.bots))
  $('mine').setAttribute('aria-pressed', String(filt.mine))
  const mineWas = $('mine-row').hidden
  $('mine-row').hidden = !follows.repos.size && !follows.people.size && !filt.mine
  if (mineWas !== $('mine-row').hidden) updateLayout()
  const n = (filt.fam ? 1 : 0) + (filt.tag ? 1 : 0) + (filt.bots ? 0 : 1) + (filt.mine ? 1 : 0)
  $('filt-n').hidden = !n; $('filt-n').textContent = n
}
function filterCounts() {
  for (const b of $('fams').querySelectorAll('button[data-fam]')) { const x = b.querySelector('b'); if (x) x.textContent = W.fams[b.dataset.fam] || 0 }
  $('bots-n').textContent = W.bots
}
$('fams').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return
  const f = b.dataset.fam || null
  filt.fam = filt.fam === f ? null : f
  syncFilters(); applyFilter(); feed()
})
$('topic').addEventListener('change', () => { filt.tag = $('topic').value || null; syncFilters(); applyFilter(); feed() })
$('bots').addEventListener('click', () => { filt.bots = !filt.bots; syncFilters() })
$('mine').addEventListener('click', () => { filt.mine = !filt.mine; syncFilters(); applyFilter(); feed() })
function openFilters(on) {
  $('filters').classList.toggle('open', on)
  $('btn-filters').setAttribute('aria-expanded', String(on))
  if (on) closeSearch()
}
$('btn-filters').addEventListener('click', () => openFilters(!$('filters').classList.contains('open')))
$('filters-done').addEventListener('click', () => openFilters(false))

// ================= side panel: latest and highlights =================
function feed() {
  const list = []
  for (let i = rows.length - 1; i >= 0 && list.length < 60; i--) {
    const w = rows[i]
    if (w.t > T.t || w.b || w.r < 0) continue
    if (filtering() && !matches(w.r, w.k, w.a)) continue
    list.push(w)
  }
  $('feed').innerHTML = list.map((w) => feedItem(w, false)).join('')
}
// one plain sentence per update: who, what, which project; the GitHub title underneath
function feedItem(w, isNew) {
  const r = repos[w.r]
  const title = w.title ? `<div class="title">${w.url ? `<a href="${esc(w.url)}" target="_blank" rel="noopener">${esc(w.title)}</a>` : esc(w.title)}</div>` : ''
  const did = t('v.' + w.k, { repo: `<span class="repo" data-repo="${w.r}">${esc(short(r.name))}</span>` })
  return `<li class="${isNew ? 'new' : ''}"><img src="${esc(avatarUrl(w.a))}" alt="" loading="lazy"><div><div class="what"><b>${esc(actors[w.a][0])}</b> ${did}</div>${title}<div class="meta"><i class="k" style="background:${kcol(w.k)}"></i>${T.mode === 'live' || T.mode === 'done' ? ago(w.t) : fmtDay(w.t)} · ${esc(gname(r.group))}</div></div></li>`
}
$('feed').addEventListener('click', (e) => { const r = e.target.closest('[data-repo]'); if (r) openRepo(+r.dataset.repo) })
for (const b of document.querySelectorAll('.tabs [data-tab]')) b.addEventListener('click', () => {
  for (const x of document.querySelectorAll('.tabs [data-tab]')) x.setAttribute('aria-selected', String(x === b))
  for (const p of document.querySelectorAll('[data-pane]')) p.hidden = p.dataset.pane !== b.dataset.tab
  $('side').classList.remove('closed')
})
$('btn-side').addEventListener('click', () => $('side').classList.toggle('closed'))
if (MOBILE) $('side').classList.add('closed')

// the most active projects, people and organisations of the last day, week and month, from the server
const HL_CATS = [['repos', 'repo'], ['commits', 'repo'], ['pushes', 'repo'], ['people', 'person'], ['peopleCommits', 'person'], ['orgs', 'org']]
const hlKey = () => hlPeriod || (T.period === 'week' ? 'week' : 'day')
let hlShown = null
function renderHighlights() {
  renderTrend()
  const L = S?.leaders; if (!L) return
  const k = hlShown = hlKey()
  for (const b of $('hl-period').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.h === k))
  $('hl').innerHTML = HL_CATS.map(([cat, type]) => {
    const items = (L[k]?.[cat] || []).filter((x) => x[1] > 0).map(([name, n, av], i) => {
      const rk = `<span class="rk">${i === 0 ? MEDAL : i + 1}</span>`
      if (type === 'repo') return `<li data-repo-name="${esc(name)}">${rk}<i class="sw" style="background:${kcol(stateRepo(name)?.lastKind)}"></i><span>${esc(short(name))}<small>${esc(gname(stateRepo(name)?.group || ''))}</small></span><b>${n}</b></li>`
      if (type === 'person') return `<li data-login="${esc(name)}" data-avatar="${esc(av || '')}">${rk}<img src="${esc(ghAvatar(name, av, 48))}" alt="" loading="lazy"><span>${esc(name)}</span><b>${n}</b></li>`
      return `<li data-group="${esc(name)}">${rk}<i class="sw"></i><span>${esc(gname(name))}</span><b>${n}</b></li>`
    }).join('')
    return `<h3>${esc(t('h.' + cat))}</h3><ol class="hl">${items || `<li class="none">${esc(t('h.empty'))}</li>`}</ol>`
  }).join('')
}
$('hl-period').addEventListener('click', (e) => { const b = e.target.closest('[data-h]'); if (b) { hlPeriod = b.dataset.h; renderHighlights() } })
$('hl').addEventListener('click', (e) => {
  const li = e.target.closest('li'); if (!li) return
  if (li.dataset.repoName) { const i = repos.findIndex((r) => r.name === li.dataset.repoName); if (i >= 0) openRepo(i) }
  if (li.dataset.login) openPerson(actorOf(li.dataset.login, li.dataset.avatar))
  if (li.dataset.group) { const c = groupCenter.get(li.dataset.group); if (c) flyTo(c.x, c.z, Math.max(16, c.r * 3.2)) }
})
// active developers per month over two years, from commits (the server reads GitHub's contributor statistics)
const monthName = (m) => new Date(`${m}-15T00:00:00Z`).toLocaleDateString(t('locale'), { month: 'long', year: 'numeric', timeZone: 'UTC' })
function monthBars(list, key, hi) {
  const max = Math.max(1, ...list.map((x) => x[key])), bw = 300 / list.length
  return list.map((x, i) => { const h = (x[key] / max) * 56; return `<rect x="${(i * bw + 0.6).toFixed(1)}" y="${(60 - Math.max(1, h)).toFixed(1)}" width="${(bw - 1.2).toFixed(1)}" height="${Math.max(1, h).toFixed(1)}" rx="1" fill="${i === hi ? '#cbf34d' : '#7d9a2c'}"><title>${esc(monthName(x.month))}: ${x[key]}</title></rect>` }).join('')
}
function renderTrend() {
  const T2 = S?.trends
  if (!T2 || !T2.repos) { $('trend').innerHTML = ''; return }
  const ms = T2.months, last = ms.length - 2, m = ms[last], ago = ms[last - 12]
  $('trend').innerHTML = `<h3>${esc(t('t.title'))}</h3><svg viewBox="0 0 300 60" preserveAspectRatio="none" aria-hidden="true">${monthBars(ms, 'devs', last)}</svg>
<div class="t-axis"><span>${esc(monthName(ms[0].month))}</span><span>${esc(monthName(ms[ms.length - 1].month))}</span></div>
<p class="t-line">${esc(t('t.line', { devs: m.devs, month: monthName(m.month), newDevs: m.newDevs, yearAgo: ago ? ago.devs : 0 }))}</p>
<p class="hint">${esc(T2.repos < T2.of ? t('t.counting', { repos: T2.repos, of: T2.of }) : t('t.source'))}</p>`
}

// the medals one project or one person holds, longest period first
function badgesFor(name, cats, extra = '') {
  const L = S?.leaders
  const out = []
  if (L) for (const p of ['month', 'week', 'day']) for (const c of cats) { const w = L[p]?.[c]?.[0]; if (w && w[0] === name && w[1] > 0) out.push(`<span class="badge">${MEDAL}${esc(t(`b.${c}.${p}`))}</span>`) }
  if (extra) out.push(extra)
  return out.length ? `<div class="badges">${out.join('')}</div>` : ''
}

// ================= suggest an organisation or a person =================
// the server checks GitHub (CKB topics, names, or a CKB dependency, and work in the last 30 days) and adds them on its own
const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms))
$('add-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const login = $('add-login').value.trim(), out = $('add-result'), btn = $('add-form').querySelector('button')
  if (!login) return
  btn.disabled = true
  out.className = 'checking'; out.textContent = t('a.checking')
  let j = null
  try {
    const res = await fetch('api/propose', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ login }) })
    j = await res.json()
    for (let i = 0; j.status === 'checking' && i < 120; i++) { await sleepMs(1500); j = await (await fetch(`api/propose?id=${encodeURIComponent(j.id)}`, { cache: 'no-store' })).json() }
  } catch { j = { status: 'error' } }
  const who = j.login || login
  const msg = { added: t('a.added', { login: who, projects: cnt('prj', j.repos?.length || 0) }), already: t('a.already', { login: who }), missing: t('a.missing', { login: who }), invalid: t('a.invalid'), none: t('a.none', { login: who }), limited: t('a.limited') }[j.status] || t('a.error')
  out.className = j.status === 'added' || j.status === 'already' ? 'ok' : 'no'
  out.innerHTML = esc(msg) + (j.status === 'added' && j.repos?.length ? `<ul>${j.repos.map((r) => `<li>${esc(short(r))}</li>`).join('')}</ul>` : '')
  btn.disabled = false
  if (j.status === 'added') { $('add-login').value = ''; refresh() }
})

// ================= share =================
// a link to what is on screen: its preview is a picture the server draws (/og/*.png) and the page opens on the same thing
const SHARE_ICON = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 13V3m0 0L6.5 6.5M10 3l3.5 3.5M4 10v5.5A1.5 1.5 0 0 0 5.5 17h9a1.5 1.5 0 0 0 1.5-1.5V10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
const withParams = (path, params) => { const u = new URL(path, location.href); for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v); u.searchParams.set('lang', LANG); return u.toString() }
let shareMenu = null
function closeShare() { shareMenu?.remove(); shareMenu = null }
function openShare(anchor, { params, image, title }) {
  if (shareMenu && shareMenu.previousElementSibling === anchor) { closeShare(); return }
  closeShare()
  const url = withParams(location.pathname, params), img = withParams(image, {}), enc = encodeURIComponent
  const m = document.createElement('div')
  m.className = 'share-menu'
  m.innerHTML = (navigator.share ? `<button type="button" data-act="native">${esc(t('sh.native'))}</button>` : '') +
    `<button type="button" data-act="copy">${esc(t('sh.copy'))}</button>` +
    `<a href="https://x.com/intent/post?text=${enc(title)}&url=${enc(url)}" target="_blank" rel="noopener">X</a>` +
    `<a href="https://t.me/share/url?url=${enc(url)}&text=${enc(title)}" target="_blank" rel="noopener">Telegram</a>` +
    `<a href="https://wa.me/?text=${enc(`${title} ${url}`)}" target="_blank" rel="noopener">WhatsApp</a>` +
    `<a href="${esc(img)}" download="ckb-pulse.png">${esc(t('sh.image'))}</a>`
  anchor.after(m)
  m.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]')
    if (!b) { setTimeout(closeShare, 100); return }
    if (b.dataset.act === 'native') { try { await navigator.share({ title, url }) } catch {} closeShare() }
    if (b.dataset.act === 'copy') { try { await navigator.clipboard.writeText(url); b.textContent = t('sh.copied') } catch { window.prompt(t('sh.copy'), url) } setTimeout(closeShare, 1000) }
  })
  shareMenu = m
}
addEventListener('pointerdown', (e) => { if (shareMenu && !e.target.closest('.share-menu, .share-btn')) closeShare() })
$('hl-share').addEventListener('click', () => { const h = hlKey(); openShare($('hl-share'), { params: { h }, image: `og/highlights.png?p=${h}`, title: `CKB Pulse · ${t('mode.' + h)}` }) })
$('drawer-body').addEventListener('click', (e) => {
  const b = e.target.closest('.share-btn'); if (!b) return
  if (b.dataset.shareRepo) openShare(b, { params: { repo: b.dataset.shareRepo }, image: `og/repo.png?name=${encodeURIComponent(b.dataset.shareRepo)}`, title: t('og.repo', { name: short(b.dataset.shareRepo) }) })
  if (b.dataset.sharePerson) openShare(b, { params: { person: b.dataset.sharePerson }, image: `og/person.png?login=${encodeURIComponent(b.dataset.sharePerson)}`, title: t('og.person', { login: b.dataset.sharePerson }) })
})
// a shared link opens on what was shared
function openFromLink() {
  const q = new URLSearchParams(location.search)
  const repo = q.get('repo'), person = q.get('person'), h = q.get('h')
  if (repo) { const i = repos.findIndex((r) => r.name.toLowerCase() === repo.toLowerCase()); if (i >= 0) { T.chosen = true; openRepo(i) } }
  else if (person && actorIdx.has(person)) { T.chosen = true; openPerson(actorIdx.get(person)) }
  else if (['day', 'week', 'month'].includes(h)) {
    hlPeriod = h
    document.querySelector('.tabs [data-tab="top"]').click()
    if (h !== 'month') { T.chosen = true; play(h) } else renderHighlights()
  }
}

// ================= follow, on this device =================
// no account: what is followed lives in this browser; with notices allowed, the server is told so it can send them
const follows = (() => { try { const j = JSON.parse(store.get('follows') || '{}'); return { repos: new Set(j.repos || []), people: new Set(j.people || []), news: !!j.news } } catch { return { repos: new Set(), people: new Set(), news: false } } })()
const saveFollows = () => store.set('follows', JSON.stringify({ repos: [...follows.repos], people: [...follows.people], news: follows.news }))
function followsRepo(name) { return follows.repos.has(String(name || '').toLowerCase()) }
function followsPerson(login) { return follows.people.has(String(login || '').toLowerCase()) }
const followLabel = (on) => (on ? '★ ' : '☆ ') + t(on ? 'f.following' : 'f.follow')
function followBtn(kind, id) { const on = kind === 'repo' ? followsRepo(id) : followsPerson(id); return `<button type="button" class="follow${on ? ' on' : ''}" data-follow-${kind}="${esc(id)}" aria-pressed="${on}">${esc(followLabel(on))}</button>` }
function toggleFollow(kind, id) {
  const set = kind === 'repo' ? follows.repos : follows.people, k = String(id).toLowerCase()
  const on = !set.has(k)
  if (on) set.add(k); else set.delete(k)
  saveFollows()
  for (const b of document.querySelectorAll(`[data-follow-${kind}]`)) if (b.getAttribute(`data-follow-${kind}`).toLowerCase() === k) { b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); b.textContent = followLabel(on) }
  syncFilters(); placeBadges(); computeWindow(); feed()
  syncFollows(on) // following asks for notices once, on this very tap
}
addEventListener('click', (e) => {
  const b = e.target.closest('[data-follow-repo], [data-follow-person]'); if (!b) return
  if (b.dataset.followRepo) toggleFollow('repo', b.dataset.followRepo); else toggleFollow('person', b.dataset.followPerson)
})

// notices: a service worker shows what the server pushes; on iPhone only once the page is on the Home Screen
const pushOk = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent), standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
const keyBytes = (b64) => { const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64.length % 4)) % 4)); return Uint8Array.from(s, (c) => c.charCodeAt(0)) }
async function pushSub(ask) {
  if (!pushOk || Notification.permission === 'denied') return null
  if (Notification.permission === 'default') { if (!ask) return null; if ((await Notification.requestPermission()) !== 'granted') return null }
  const reg = await navigator.serviceWorker.register('sw.js')
  await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) { const { key } = await (await fetch('api/push/key')).json(); sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }) }
  return sub
}
async function syncFollows(ask) {
  try {
    const sub = await pushSub(ask)
    if (sub) await fetch('api/push', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sub: sub.toJSON(), repos: [...follows.repos], people: [...follows.people], news: follows.news, lang: LANG }) })
  } catch (err) { console.warn('notices', err) }
  notifyState()
}
function notifyState() {
  $('notify-news').setAttribute('aria-pressed', String(follows.news))
  $('notify-state').textContent = !pushOk ? t(isIOS && !standalone ? 'p.ios' : 'p.none') : Notification.permission === 'denied' ? t('p.denied') : Notification.permission === 'granted' && (follows.news || follows.repos.size || follows.people.size) ? t('p.on') : ''
}
$('notify-news').addEventListener('click', () => { follows.news = !follows.news; saveFollows(); syncFollows(follows.news) })

// ================= new projects =================
// the server finds CKB projects created in the last 14 days; each is announced once to the open pages, here as a notice
const seenNews = (() => { try { return new Set(JSON.parse(store.get('seenNews') || '[]')) } catch { return new Set() } })()
const markSeen = (name) => { seenNews.add(name); store.set('seenNews', JSON.stringify([...seenNews].slice(-200))) }
function renderNews() {
  const list = S?.news || []
  $('news').innerHTML = list.slice(0, 20).map((n) => `<li><div class="n-head"><b>${esc(short(n.name))}</b><small>${esc(gname(n.group))} · ${esc(t('n.created', { ago: ago(Date.parse(n.createdAt)) }))}</small></div>${n.desc ? `<p>${esc(n.desc)}</p>` : ''}<div class="n-act"><button type="button" data-see="${esc(n.name)}">${esc(t('n.see'))}</button>${followBtn('repo', n.name)}</div></li>`).join('') || `<li class="none">${esc(t('n.none'))}</li>`
  $('news-dot').hidden = !list.some((n) => !seenNews.has(n.name) && Date.now() - Date.parse(n.createdAt) < 3 * DAY)
}
function seeProject(name) {
  const i = repos.findIndex((r) => r.name === name)
  if (i >= 0) openRepo(i); else window.open(`https://github.com/${name}`, '_blank', 'noopener')
}
$('news').addEventListener('click', (e) => { const b = e.target.closest('[data-see]'); if (b) { markSeen(b.dataset.see); seeProject(b.dataset.see); renderNews() } })
function showNewsToast(n) {
  const el = $('news-toast')
  el.innerHTML = `<span class="tag">${esc(t('new.repo'))}</span><span class="what">${esc(t('n.title'))}: <b>${esc(short(n.name))}</b></span><button type="button" class="go" data-see="${esc(n.name)}">${esc(t('n.see'))}</button>${followBtn('repo', n.name)}<button type="button" class="x" aria-label="${esc(t('close'))}">×</button>`
  el.hidden = false
  markSeen(n.name)
}
$('news-toast').addEventListener('click', (e) => {
  const see = e.target.closest('[data-see]')
  if (see) { seeProject(see.dataset.see); $('news-toast').hidden = true }
  if (e.target.closest('.x')) $('news-toast').hidden = true
  renderNews()
})
let newsWaiting = null
function newsToastOnLoad() {
  // a project announced in the last day that this device has not seen yet
  const n = (S?.news || []).find((x) => x.announcedAt && Date.now() - x.announcedAt < DAY && !seenNews.has(x.name))
  if (!n) return
  if (introOpen) newsWaiting = n; else showNewsToast(n)
}
async function onNews(n) {
  if (!S) return
  if (!(S.news || []).some((x) => x.name === n.name)) S.news = [n, ...(S.news || [])]
  if (!repos.some((r) => r.name === n.name)) await refresh()
  renderNews()
  if (introOpen) newsWaiting = n; else showNewsToast(n)
}

// ================= a new version =================
// the page carries the id of its build; /version.json answers with the current one, every 90 s and whenever the tab
// comes back. A screen nobody has touched for 15 minutes reloads by itself, so a page left on a wall stays current.
const BUILD = document.querySelector('meta[name="build"]')?.content || '__BUILD__'
let lastInput = Date.now(), updateDismissed = false
for (const ev of ['pointerdown', 'keydown', 'wheel']) addEventListener(ev, () => { lastInput = Date.now() }, { passive: true })
async function checkVersion() {
  if (BUILD === '__BUILD__' || document.visibilityState !== 'visible') return
  try {
    const r = await fetch('version.json', { cache: 'no-store' }); if (!r.ok) return
    const { v } = await r.json()
    if (typeof v !== 'string' || v === BUILD) return
    if (Date.now() - lastInput > 15 * 60e3 && !introOpen) { location.reload(); return }
    if (!updateDismissed) $('update').hidden = false
  } catch { /* offline: the next round */ }
}
setInterval(checkVersion, 90e3)
document.addEventListener('visibilitychange', checkVersion)
$('update-go').addEventListener('click', () => location.reload())
$('update-x').addEventListener('click', () => { $('update').hidden = true; updateDismissed = true })

// ================= the strip above the timeline =================
function setNow(clock, text) {
  $('mode').textContent = t(T.mode === 'paused' ? 'mode.paused' : 'mode.' + T.period)
  $('now').classList.toggle('replay', T.mode === 'replay' || T.mode === 'done')
  $('now').classList.toggle('paused', T.mode === 'paused')
  $('clock').textContent = clock
  if (text != null && performance.now() > T.holdTicker) { $('ticker').textContent = text; $('sr').textContent = text }
  for (const b of $('periods').querySelectorAll('[data-p]')) b.setAttribute('aria-pressed', String(b.dataset.p === T.period))
  if (hlKey() !== hlShown) renderHighlights()
}
const line = (w) => `${actors[w.a][0]} ${t('v.' + w.k, { repo: short(repos[w.r]?.name) })}${w.title ? `: ${w.title}` : ''}`
function liveText() {
  const last = [...rows].reverse().find((w) => !w.b && w.r >= 0)
  if (!last) return t('waiting')
  return Date.now() - last.t > QUIET_MS ? t('quiet', { ago: ago(last.t), line: line(last) }) : t('recent', { line: line(last), ago: ago(last.t) })
}

// ================= people above the scene =================
const peopleGroup = new THREE.Group()
scene.add(peopleGroup)
const sprites = new Map() // login -> sprite
const texCache = new Map() // login -> texture
let personWins = new Map() // login -> the longest period this person leads
const personBadges = new Set()
function avatarTexture(login, avatar) {
  if (texCache.has(login)) return texCache.get(login)
  const c = document.createElement('canvas'); c.width = c.height = 128
  const g = c.getContext('2d')
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  const draw = (img) => {
    g.clearRect(0, 0, 128, 128)
    g.save(); g.beginPath(); g.arc(64, 64, 56, 0, Math.PI * 2); g.clip()
    if (img) g.drawImage(img, 8, 8, 112, 112); else { g.fillStyle = '#1b2215'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#cbf34d'; g.font = 'bold 52px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText((login[0] || '?').toUpperCase(), 64, 68) }
    g.restore(); g.lineWidth = 6; g.strokeStyle = '#cbf34d'; g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.stroke()
    tex.needsUpdate = true
  }
  draw(null)
  const img = new Image(); img.crossOrigin = 'anonymous'; img.onload = () => draw(img); img.src = ghAvatar(login, avatar, 96)
  texCache.set(login, tex)
  return tex
}
// each person keeps one place on the ring (the golden angle from a hash of the login), so nobody swaps seats as counts change
function seat(login) { let h = 0; for (const ch of login) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h }
function people() {
  const top = [...W.people.entries()].sort((x, y) => y[1] - x[1]).slice(0, MOBILE ? 16 : 32)
  const keep = new Set(top.map(([a]) => actors[a][0]))
  for (const [login, s] of sprites) if (!keep.has(login)) s.userData.leaving = true
  const R = layoutR + 4, max = top[0]?.[1] || 1
  for (const [a, n] of top) {
    const login = actors[a][0]
    let s = sprites.get(login)
    if (!s) {
      s = new THREE.Sprite(new THREE.SpriteMaterial({ map: avatarTexture(login, actors[a][1]), transparent: true, depthWrite: false, opacity: 0 }))
      const h = seat(login)
      s.userData = { login, ang: (h % 997) * 2.39996, R: R + (h % 3) * 1.8, y: 7 + ((h >> 3) % 3) * 1.6 }
      sprites.set(login, s); peopleGroup.add(s)
      tmpP.set(Math.cos(s.userData.ang) * s.userData.R, s.userData.y, Math.sin(s.userData.ang) * s.userData.R); s.position.copy(tmpP)
    }
    s.userData.leaving = false
    s.userData.size = 1.1 + 1.6 * Math.sqrt(n / max)
    s.userData.n = n
    personBadge(s)
  }
}
function personBadge(s) {
  const p = personWins.get(s.userData.login)
  if (s.userData.badge && s.userData.badge.userData.p !== p) { s.remove(s.userData.badge); personBadges.delete(s.userData.badge); s.userData.badge = null }
  if (!p || s.userData.badge) return
  const div = document.createElement('div'); div.className = 'badge3d culled'; div.innerHTML = MEDAL + esc(t(`b.people.${p}`))
  const o = new CSS2DObject(div); o.position.set(0, 0.78, 0); o.userData = { p, prio: 900 + ['day', 'week', 'month'].indexOf(p) }
  s.add(o); s.userData.badge = o; personBadges.add(o)
}
function stepPeople(dt) {
  const now = performance.now()
  for (const [login, s] of sprites) {
    const u = s.userData
    s.material.opacity += ((u.leaving ? 0 : 1) - s.material.opacity) * Math.min(1, dt * 3)
    if (u.leaving && s.material.opacity < 0.02) {
      if (u.badge) { s.remove(u.badge); personBadges.delete(u.badge) }
      peopleGroup.remove(s); s.material.dispose(); sprites.delete(login); continue
    }
    s.position.y = u.y + (REDUCED ? 0 : Math.sin(now / 1400 + u.ang * 3) * 0.25)
    const sz = u.size * (1 + (u.flare || 0) * 0.5)
    s.scale.set(sz, sz, 1)
    u.flare = Math.max(0, (u.flare || 0) - dt * 2)
  }
}

// ================= medals and new projects in the scene =================
const sceneBadges = [] // CSS2D objects that follow a cell
function placeBadges() {
  for (const o of sceneBadges) o.parent?.remove(o)
  sceneBadges.length = 0
  const L = S?.leaders
  const best = (cat) => { const m = new Map(); if (L) for (const p of ['day', 'week', 'month']) { const w = L[p]?.[cat]?.[0]; if (w && w[1] > 0) m.set(w[0], p) } return m }
  personWins = best('people')
  for (const s of sprites.values()) { if (s.userData.badge) { s.remove(s.userData.badge); personBadges.delete(s.userData.badge); s.userData.badge = null } personBadge(s) }
  const repoWins = best('repos')
  const pin = (name, html, cls, prio) => {
    const i = repos.findIndex((r) => r.name === name); if (i < 0 || !cell[i]) return
    const div = document.createElement('div'); div.className = cls + ' culled'; div.innerHTML = html
    const o = new CSS2DObject(div); o.userData = { cell: i, prio }
    scene.add(o); sceneBadges.push(o)
  }
  for (const [name, p] of repoWins) pin(name, MEDAL + esc(t(`b.repos.${p}`)), 'badge3d', 1000 + ['day', 'week', 'month'].indexOf(p))
  const fresh = (S?.repos || []).filter((r) => r.isNew && !repoWins.has(r.name)).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 6)
  for (const r of fresh) pin(r.name, esc(t('new.repo')), 'new3d', 50)
  // what this device follows wears a star
  for (const r of repos.filter((x) => followsRepo(x.name) && !repoWins.has(x.name)).slice(0, 40)) pin(r.name, '★', 'star3d', 700)
}
// names, medals and tags never sit on top of each other or under a panel: the more important one stays
const overlap = (a, b, m = 0) => a.left < b.right + m && a.right + m > b.left && a.top < b.bottom + m && a.bottom + m > b.top
let panels = [], panelsAt = 0
function cull(now) {
  // the panels move rarely: measure them a few times a second; the labels move with the blocks, so every frame
  if (now - panelsAt > 250) { panelsAt = now; panels = [...document.querySelectorAll('.hud, .intro')].filter((el) => { if (el.hidden) return false; const cs = getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden' }).map((el) => el.getBoundingClientRect()).filter((r) => r.width && r.height) }
  const items = [...groupLabels, ...sceneBadges, ...personBadges].filter((o) => o.element.isConnected && o.element.style.display !== 'none')
  items.sort((a, b) => b.userData.prio - a.userData.prio)
  const placed = []
  for (const o of items) {
    const r = o.element.getBoundingClientRect()
    const hide = r.left < 2 || r.right > innerWidth - 2 || r.top < 2 || r.bottom > innerHeight - 2 || panels.some((p) => overlap(r, p)) || placed.some((p) => overlap(r, p, 4))
    o.element.classList.toggle('culled', hide)
    if (!hide) placed.push(r)
  }
}

// ================= comets, rings, waves =================
const comets = []
const rings = []
const waves = [] // delayed glow bumps
const TRAIL = 26
function comet(w) {
  const c = cell[w.r]
  if (!c) return
  const color = new THREE.Color(kcol(w.k))
  const s = sprites.get(actors[w.a]?.[0])
  const start = s ? s.position.clone() : new THREE.Vector3(Math.cos(Math.random() * 6.28) * (layoutR + 4), 9, Math.sin(Math.random() * 6.28) * (layoutR + 4))
  if (s) s.userData.flare = 1
  const end = new THREE.Vector3(c.x, Math.max(c.h, 0.4) + 0.2, c.z)
  const mid = start.clone().lerp(end, 0.5); mid.y += 4 + start.distanceTo(end) * 0.18
  if (REDUCED || comets.length > (MOBILE ? 14 : 30)) { hit(w, color); return }
  const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }))
  head.scale.set(1.8, 1.8, 1)
  const pos = new Float32Array(TRAIL * 3), col = new Float32Array(TRAIL * 3)
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  const trail = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.95, map: glowTex, vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }))
  for (let i = 0; i < TRAIL; i++) { pos.set([start.x, start.y, start.z], i * 3) }
  scene.add(head); scene.add(trail)
  comets.push({ w, head, trail, start, mid, end, color, t: 0, dur: 1.1 + Math.random() * 0.4 })
}
const curve = (a, m, b, k, out) => out.set((1 - k) ** 2 * a.x + 2 * (1 - k) * k * m.x + k * k * b.x, (1 - k) ** 2 * a.y + 2 * (1 - k) * k * m.y + k * k * b.y, (1 - k) ** 2 * a.z + 2 * (1 - k) * k * m.z + k * k * b.z)
function stepComets(dt) {
  for (let i = comets.length - 1; i >= 0; i--) {
    const c = comets[i]
    c.t += dt / c.dur
    const k = c.t < 1 ? 0.5 - Math.cos(Math.PI * Math.min(1, c.t)) / 2 : 1
    curve(c.start, c.mid, c.end, k, c.head.position)
    const pos = c.trail.geometry.attributes.position.array, col = c.trail.geometry.attributes.color.array
    for (let j = TRAIL - 1; j > 0; j--) { pos[j * 3] = pos[(j - 1) * 3]; pos[j * 3 + 1] = pos[(j - 1) * 3 + 1]; pos[j * 3 + 2] = pos[(j - 1) * 3 + 2] }
    pos[0] = c.head.position.x; pos[1] = c.head.position.y; pos[2] = c.head.position.z
    for (let j = 0; j < TRAIL; j++) { const f = (1 - j / TRAIL) ** 1.6; col[j * 3] = c.color.r * f; col[j * 3 + 1] = c.color.g * f; col[j * 3 + 2] = c.color.b * f }
    c.trail.geometry.attributes.position.needsUpdate = true; c.trail.geometry.attributes.color.needsUpdate = true
    if (c.t >= 1) {
      if (!c.hit) { c.hit = true; hit(c.w, c.color); c.head.visible = false }
      if (c.t > 1.5) { scene.remove(c.head); scene.remove(c.trail); c.trail.geometry.dispose(); c.trail.material.dispose(); c.head.material.dispose(); comets.splice(i, 1) }
    }
  }
}
const ringGeo = new THREE.RingGeometry(0.8, 1, 64)
function hit(w, color) {
  const c = cell[w.r]
  if (!c) return
  c.glow = 2.6; c.flash.copy(color); c.pop = 1
  if (REDUCED) return
  const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }))
  m.rotation.x = -Math.PI / 2; m.position.set(c.x, 0.06, c.z)
  scene.add(m); rings.push({ m, t: 0 })
  // the wave through the neighbours
  for (let i = 0; i < cell.length; i++) {
    const o = cell[i]; if (!o || o === c) continue
    const d = Math.hypot(o.x - c.x, o.z - c.z)
    if (d < 9) waves.push({ i, at: performance.now() + d * 70, amt: (1 - d / 9) * 1.1, color })
  }
}
function spark(w) { const c = cell[w.r]; if (!c || !filt.bots) return; c.glow = Math.max(c.glow, 0.9); c.flash.set('#b9c2aa') }
function stepFx(dt, now) {
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i]; r.t += dt / 1.3
    const s = 1 + r.t * 9; r.m.scale.set(s, s, s); r.m.material.opacity = 0.9 * (1 - r.t)
    if (r.t >= 1) { scene.remove(r.m); r.m.material.dispose(); rings.splice(i, 1) }
  }
  for (let i = waves.length - 1; i >= 0; i--) {
    const w = waves[i]; if (now < w.at) continue
    const c = cell[w.i]; if (c && w.amt > c.glow) { c.glow = w.amt; c.flash.copy(w.color) }
    waves.splice(i, 1)
  }
}
function fire(w) {
  if (w.r < 0) return
  if (w.b) { spark(w); return }
  if (filtering() && !matches(w.r, w.k, w.a)) return
  comet(w)
}

// ================= interaction =================
const ray = new THREE.Raycaster()
const ptr = new THREE.Vector2(), ptrPx = { x: 0, y: 0, in: false }
let hovered = -1, down = null
renderer.domElement.addEventListener('pointermove', (e) => { ptr.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ptrPx.x = e.clientX; ptrPx.y = e.clientY; ptrPx.in = true })
renderer.domElement.addEventListener('pointerleave', () => { ptrPx.in = false; $('tip').hidden = true })
renderer.domElement.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; ptr.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); openFilters(false); closeSearch() })
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6 || performance.now() - down.t > 450) return
  ptr.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1)
  const pick = pickAt()
  if (pick.person) openPerson(actorIdx.get(pick.person))
  else if (pick.cell >= 0) openRepo(pick.cell)
})
function pickAt() {
  ray.setFromCamera(ptr, camera)
  const ps = ray.intersectObjects(peopleGroup.children, false)
  if (ps.length) return { person: ps[0].object.userData.login, cell: -1 }
  const hits = mesh ? ray.intersectObject(mesh, false) : []
  return { person: null, cell: hits.length ? hits[0].instanceId : -1 }
}
function stepHover() {
  if (!ptrPx.in || MOBILE) return
  const p = pickAt()
  const tip = $('tip')
  if (hovered >= 0 && cell[hovered]) cell[hovered].hover = 0
  hovered = p.cell
  if (p.person) {
    const n = W.people.get(actorIdx.get(p.person)) || 0
    tip.innerHTML = `<b>${esc(p.person)}</b><span>${esc(t('tip.person', { updates: cnt('upd', n), when: when() }))}</span><em>${esc(t('tip.open'))}</em>`
  } else if (p.cell >= 0) {
    cell[p.cell].hover = 1
    const r = repos[p.cell], n = W.n[p.cell], b = W.b[p.cell]
    tip.innerHTML = `<b>${esc(short(r.name))}</b><span class="g">${esc(gname(r.group))}</span>${r.desc ? `<span>${esc(r.desc)}</span>` : ''}<span>${esc(n ? t('tip.repo', { updates: cnt('upd', n), when: when() }) : t('tip.quiet', { when: when() }))}${b ? ` · ${esc(cnt('auto', b))}` : ''}</span><em>${esc(t('tip.open'))}</em>`
  } else { tip.hidden = true; renderer.domElement.style.cursor = ''; return }
  renderer.domElement.style.cursor = 'pointer'
  tip.hidden = false
  const w = tip.offsetWidth, h = tip.offsetHeight
  tip.style.left = `${Math.min(innerWidth - w - 8, ptrPx.x + 14)}px`
  tip.style.top = `${ptrPx.y + h + 24 > innerHeight ? ptrPx.y - h - 12 : ptrPx.y + 18}px`
}

// ================= framing =================
// the panels cover the top, the bottom and (on wide screens) the right: measure them and centre the scene in what is left
const box = (sel) => document.querySelector(sel).getBoundingClientRect()
function hud() {
  const top = Math.max(box('.top').bottom, innerWidth >= 1340 ? box('#filters').bottom : 0) + 6
  const bottom = MOBILE ? 180 + $('now').offsetHeight + 8 : innerHeight - box('#now').top + 8
  const right = !MOBILE && (!$('side').classList.contains('closed') || !$('drawer').hidden) ? $('side').offsetWidth + 32 : 0
  return { top, bottom, right }
}
function updateLayout() {
  const root = document.documentElement.style
  root.setProperty('--top', `${Math.round(box('.top').bottom + 6)}px`)
  // notices sit under whatever is there: the filter bar on wide screens (one or two rows), the header elsewhere
  root.setProperty('--below', `${Math.round((innerWidth >= 1340 ? box('#filters').bottom : box('.top').bottom) + 8)}px`)
  updateView()
}
function updateView() {
  const { top, bottom, right } = hud()
  camera.setViewOffset(innerWidth, innerHeight, right / 2, (bottom - top) / 2, innerWidth, innerHeight)
  camera.updateProjectionMatrix()
}
function fitDistance() {
  const { top, bottom, right } = hud()
  const v = THREE.MathUtils.degToRad(camera.fov) / 2, h = Math.atan(Math.tan(v) * camera.aspect)
  const tw = Math.tan(h) * (innerWidth - right - 24) / innerWidth, tv = Math.tan(v) * Math.max(120, innerHeight - top - bottom) / innerHeight
  // on a phone the whole ring would be tiny: frame the centre and let a pinch or a drag show the rest
  const r = (layoutR + 3) * (MOBILE ? 0.55 : 1)
  return Math.max(r / tw, (r * 0.66) / tv)
}
const ELEV = 0.66 // about 38 degrees above the ground
const home = { p: new THREE.Vector3(), t: new THREE.Vector3() }
function setHome() { const d = fitDistance(); home.p.set(0, d * Math.sin(ELEV), d * Math.cos(ELEV)); home.t.set(0, 0, 0); controls.maxDistance = d * 2.5 }
function drawerShown() { document.body.classList.toggle('drawer-open', !$('drawer').hidden); updateView() }
new MutationObserver(updateView).observe($('side'), { attributes: true, attributeFilter: ['class'] })
new MutationObserver(drawerShown).observe($('drawer'), { attributes: true, attributeFilter: ['hidden'] })

// camera flights: to a project, to a group, back home
let flight = null
function flyTo(x, z, dist = 14) {
  const dir = camera.position.clone().sub(controls.target).normalize()
  const to = { t: new THREE.Vector3(x, 0.5, z) }
  to.p = to.t.clone().add(dir.multiplyScalar(dist)); to.p.y = Math.max(to.p.y, 6)
  flight = { from: { p: camera.position.clone(), t: controls.target.clone() }, to, t: 0 }
  T.lastUser = Date.now()
}
function flyHome() { flight = { from: { p: camera.position.clone(), t: controls.target.clone() }, to: { p: home.p.clone(), t: home.t.clone() }, t: 0 } }
$('btn-home').addEventListener('click', () => { $('drawer').hidden = true; flyHome() })
function stepFlight(dt) {
  if (!flight) return
  flight.t = Math.min(1, flight.t + dt / 1.2)
  const k = flight.t < 0.5 ? 4 * flight.t ** 3 : 1 - Math.pow(-2 * flight.t + 2, 3) / 2
  camera.position.lerpVectors(flight.from.p, flight.to.p, k)
  controls.target.lerpVectors(flight.from.t, flight.to.t, k)
  if (flight.t >= 1) flight = null
}

// ================= drawer: a project or a person =================
async function openRepo(i) {
  const r = repos[i]; if (!r) return
  const c = cell[i]; if (c) flyTo(c.x, c.z, 26)
  $('drawer').hidden = false
  $('drawer-body').innerHTML = `<h2>${esc(short(r.name))}</h2><p class="sub">${esc(t('d.loading'))}</p>`
  const gh = (url) => `<div class="actions"><a class="gh" href="${esc(url)}" target="_blank" rel="noopener">${esc(t('d.github'))} ↗</a>${followBtn('repo', r.name)}<button type="button" class="share-btn" data-share-repo="${esc(r.name)}">${SHARE_ICON}${esc(t('sh.share'))}</button></div>`
  const fresh = stateRepo(r.name)?.isNew ? `<span class="badge new">${esc(t('new.repo'))}</span>` : ''
  try {
    const res = await fetch(`api/repo?name=${encodeURIComponent(r.name)}`)
    if (!res.ok) throw new Error(res.status)
    const d = await res.json()
    const max = Math.max(1, ...d.daily.people.map((v, k) => v + d.daily.bots[k]))
    const bw = 300 / d.daily.days
    const bars = d.daily.people.map((v, k) => { const hb = (d.daily.bots[k] / max) * 56, hp = (v / max) * 56; return `<rect x="${k * bw + 1}" y="${60 - hp - hb}" width="${bw - 2}" height="${hb}" fill="#8b9480" opacity=".6"/><rect x="${k * bw + 1}" y="${60 - hp}" width="${bw - 2}" height="${hp}" fill="#cbf34d" rx="1"/>` }).join('')
    const sub = [gname(d.group), d.lang, cnt('star', d.stars), d.pushedAt ? t('d.lastCode', { ago: ago(Date.parse(d.pushedAt)) }) : ''].filter(Boolean).map(esc).join(' · ')
    $('drawer-body').innerHTML = `<h2>${esc(short(d.name))}</h2><p class="owner">${esc(d.name)}</p>
${badgesFor(d.name, ['repos', 'commits', 'pushes'], fresh)}<p class="sub">${sub}</p>
<p class="desc">${esc(d.desc || t('d.noDesc'))}</p>${gh(d.url)}
<h3>${esc(t('d.month'))}</h3><svg class="bars" viewBox="0 0 300 60" preserveAspectRatio="none" aria-hidden="true">${bars}</svg>
<p class="key"><i class="h"></i>${esc(t('people'))} <i class="b"></i>${esc(t('automatic'))}</p>
${d.months?.some((x) => x.commits) ? `<h3>${esc(t('d.months'))}</h3><svg class="bars" viewBox="0 0 300 60" preserveAspectRatio="none" aria-hidden="true">${monthBars(d.months, 'commits', d.months.length - 1)}</svg><div class="t-axis"><span>${esc(monthName(d.months[0].month))}</span><span>${esc(monthName(d.months[d.months.length - 1].month))}</span></div>` : ''}
${d.contributors.length ? `<h3>${esc(t('d.who'))}</h3><div class="people">${d.contributors.map((p) => `<a href="https://github.com/${esc(p.login)}" target="_blank" rel="noopener"><img src="${esc(ghAvatar(p.login, p.avatar, 48))}" alt="">${esc(p.login)} <b>${p.n}</b></a>`).join('')}</div>` : ''}
<h3>${esc(t('d.latest'))}</h3><ol>${d.events.slice(0, 20).map((e) => `<li><i class="k" style="background:${kcol(e.kind)}"></i><b>${esc(e.actor)}</b> ${esc(t('v.' + e.kind, { repo: short(d.name) }))}${e.title ? `<a class="t" href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.title)}</a>` : ''}<small>${ago(Date.parse(e.at))}</small></li>`).join('') || `<li>${esc(t(d.daily.bots.some(Boolean) ? 'd.onlyBots' : 'd.empty'))}</li>`}</ol>
${d.topics.length ? `<div class="pills">${d.topics.slice(0, 10).map((x) => `<span>${esc(x)}</span>`).join('')}</div>` : ''}`
  } catch { $('drawer-body').innerHTML = `<h2>${esc(short(r.name))}</h2><p class="owner">${esc(r.name)}</p>${badgesFor(r.name, ['repos', 'commits', 'pushes'], fresh)}<p class="sub">${esc(t('d.error'))}</p>${gh(`https://github.com/${r.name}`)}` }
}
function openPerson(a) {
  const login = actors[a]?.[0]; if (!login) return
  const per = new Map()
  for (const w of rows) if (w.a === a && !w.b && w.r >= 0) per.set(w.r, (per.get(w.r) || 0) + 1)
  const list = [...per.entries()].sort((x, y) => y[1] - x[1])
  $('drawer').hidden = false
  $('drawer-body').innerHTML = `<div class="person"><img src="${esc(avatarUrl(a))}" alt=""><div><h2>${esc(login)}</h2>
<p class="sub">${esc(t('p.sum', { updates: cnt('upd', list.reduce((s, x) => s + x[1], 0)), projects: cnt('prj', list.length) }))}</p></div></div>
${badgesFor(login, ['people', 'peopleCommits'])}<div class="actions"><a class="gh" href="https://github.com/${esc(login)}" target="_blank" rel="noopener">${esc(t('p.profile'))} ↗</a>${followBtn('person', login)}<button type="button" class="share-btn" data-share-person="${esc(login)}">${SHARE_ICON}${esc(t('sh.share'))}</button></div>
<h3>${esc(t('p.where'))}</h3><ol class="where">${list.map(([r, n]) => `<li data-repo="${r}"><span>${esc(short(repos[r].name))}<small>${esc(gname(repos[r].group))}</small></span><b>${n}</b></li>`).join('')}</ol>`
  const s = sprites.get(login); if (s) flyTo(s.position.x * 0.6, s.position.z * 0.6, 22)
}
$('drawer-body').addEventListener('click', (e) => { const li = e.target.closest('[data-repo]'); if (li) openRepo(+li.dataset.repo) })
$('drawer-close').addEventListener('click', () => { $('drawer').hidden = true })

// ================= search =================
function closeSearch() { $('search').classList.remove('open'); $('results').hidden = true }
$('btn-search').addEventListener('click', () => {
  const on = !$('search').classList.contains('open')
  $('search').classList.toggle('open', on)
  if (on) { openFilters(false); $('q').focus() } else closeSearch()
})
$('q').addEventListener('input', () => {
  const q = $('q').value.trim().toLowerCase()
  if (q.length < 2) { $('results').hidden = true; return }
  const rs = repos.map((r, i) => [i, r]).filter(([, r]) => r.name.toLowerCase().includes(q)).slice(0, 8)
  const ps = actors.map((p, i) => [i, p]).filter(([, p]) => p[0].toLowerCase().includes(q)).slice(0, 6)
  $('results').innerHTML = rs.map(([i, r]) => `<li role="option" data-repo="${i}"><span class="sw" style="background:${W.n[i] ? kcol(W.last[i]) : '#2b3420'}"></span><span>${esc(short(r.name))}<small>${esc(gname(r.group))}</small></span><b>${W.n[i] || ''}</b></li>`).join('') +
    ps.map(([i, p]) => `<li role="option" data-person="${i}"><img src="${esc(avatarUrl(i))}" alt=""><span>${esc(p[0])}</span><b>${W.people.get(i) || ''}</b></li>`).join('') || `<li>${esc(t('nothing'))}</li>`
  $('results').hidden = false
})
$('results').addEventListener('click', (e) => {
  const li = e.target.closest('li'); if (!li) return
  if (li.dataset.repo) openRepo(+li.dataset.repo)
  if (li.dataset.person) openPerson(+li.dataset.person)
  closeSearch(); $('q').blur()
})
$('btn-full').addEventListener('click', () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.() })
if (!document.fullscreenEnabled) $('btn-full').hidden = true // iPhones have no full screen for pages
addEventListener('keydown', (e) => { if (e.key === 'Escape') { $('drawer').hidden = true; closeSearch(); openFilters(false) } })
addEventListener('pointerdown', (e) => {
  // a tap outside the open filter panel closes it
  if ($('filters').classList.contains('open') && !e.target.closest('#filters, #btn-filters')) openFilters(false)
})

// ================= timeline =================
const track = $('track'), bars = $('bars')
function drawBars() {
  const now = Date.now(), N = 168, start = now - 7 * DAY
  const hp = new Array(N).fill(0), hb = new Array(N).fill(0)
  for (const w of rows) { const i = Math.floor((w.t - start) / 3600e3); if (i >= 0 && i < N) (w.b ? hb : hp)[i]++ }
  const dpr = devicePixelRatio || 1, cw = bars.clientWidth, ch = bars.clientHeight
  bars.width = cw * dpr; bars.height = ch * dpr
  const g = bars.getContext('2d'); g.scale(dpr, dpr); g.clearRect(0, 0, cw, ch)
  const max = Math.max(1, ...hp.map((v, i) => v + hb[i])), bw = cw / N
  for (let i = 0; i < N; i++) {
    const b = (hb[i] / max) * (ch - 2), p = (hp[i] / max) * (ch - 2)
    g.fillStyle = 'rgba(139,148,128,0.55)'; g.fillRect(i * bw + 0.5, ch - b, Math.max(1, bw - 1), b)
    g.fillStyle = '#cbf34d'; g.fillRect(i * bw + 0.5, ch - b - p, Math.max(1, bw - 1), p)
  }
  // seven names in a phone's width: three letters each
  const wd = (x) => { const s = new Date(x).toLocaleDateString(t('locale'), { weekday: 'short' }).replace('.', ''); return innerWidth < 640 ? s.slice(0, 3) : s }
  $('days').innerHTML = Array.from({ length: 7 }, (_, d) => `<span>${wd(start + d * DAY + DAY / 2)}</span>`).join('')
}
function drawHead() {
  const now = Date.now(), start = now - 7 * DAY
  const x = Math.max(0, Math.min(1, (T.t - start) / (7 * DAY)))
  const wx = Math.max(0, (T.t - span() - start) / (7 * DAY))
  $('head').style.left = `${(x * 100).toFixed(3)}%`
  $('window').style.left = `${(wx * 100).toFixed(3)}%`; $('window').style.width = `${((x - wx) * 100).toFixed(3)}%`
  $('head-label').textContent = T.mode === 'live' || T.mode === 'done' ? t('tl.now') : fmtDay(T.t)
  $('head-label').style.transform = `translateX(${x > 0.92 ? -100 : x < 0.08 ? 0 : -50}%)`
  track.setAttribute('aria-valuenow', String(Math.round(x * 100)))
}
function timeAtX(clientX) { const b = track.getBoundingClientRect(); const f = Math.max(0, Math.min(1, (clientX - b.left) / b.width)); return Date.now() - 7 * DAY + f * 7 * DAY }
let dragging = false
track.addEventListener('pointerdown', (e) => { dragging = true; track.setPointerCapture(e.pointerId); pauseAt(timeAtX(e.clientX)) })
track.addEventListener('pointermove', (e) => { if (dragging) pauseAt(timeAtX(e.clientX)) })
track.addEventListener('pointerup', () => { dragging = false })
track.addEventListener('keydown', (e) => {
  const step = e.shiftKey ? 6 * 3600e3 : 3600e3
  if (e.key === 'ArrowLeft') pauseAt(T.t - step)
  if (e.key === 'ArrowRight') pauseAt(Math.min(Date.now(), T.t + step))
  if (e.key === 'End') goLive(true)
})
function seekPtr() { let lo = 0, hi = rows.length; while (lo < hi) { const m = (lo + hi) >> 1; if (rows[m].t <= T.t) lo = m + 1; else hi = m } T.ptr = lo }
let lastWindowAt = 0
function setPlay(on) { $('btn-play').textContent = on ? '❚❚' : '▶'; $('btn-play').setAttribute('aria-label', t(on ? 'tl.pause' : 'tl.play')); $('btn-play').title = t(on ? 'tl.pause' : 'tl.play') }
function pauseAt(at) {
  if (T.period === 'live') T.period = 'day'
  T.mode = 'paused'; T.auto = false; T.chosen = true; T.lastUser = Date.now(); T.holdTicker = 0
  T.t = Math.min(Date.now(), at)
  seekPtr(); computeWindow(); feed(); drawHead()
  let k = T.ptr - 1
  while (k >= 0 && (rows[k].b || rows[k].r < 0)) k--
  setNow(fmtDay(T.t), k >= 0 ? t('recent', { line: line(rows[k]), ago: fmtDay(rows[k].t) }) : '')
  setPlay(false)
}
function goLive(chosen) {
  T.mode = 'live'; T.period = 'live'; T.auto = false; T.t = Date.now(); T.lastLive = Date.now(); T.holdTicker = 0
  if (chosen) T.chosen = true
  $('periods').querySelector('.p-live').classList.remove('ping')
  seekPtr(); computeWindow(); feed(); drawHead()
  setNow(fmtClock(Date.now()), liveText())
  setPlay(false)
}
// play a period from its start (or from a paused moment) up to now
function play(period, { auto = false, from = null } = {}) {
  T.period = period; T.mode = 'replay'; T.auto = auto; T.holdTicker = 0
  T.rate = REDUCED ? 1e9 : PERIOD[period].span / PERIOD[period].ms
  T.t = from ?? Date.now() - PERIOD[period].span
  seekPtr(); computeWindow(); feed(); drawHead()
  setNow(fmtDay(T.t), from == null ? t(auto ? 'replay.auto' : 'replay.' + period) : null)
  if (from == null) T.holdTicker = performance.now() + 4500 // say what is playing before the first update takes the line
  setPlay(true)
}
$('periods').addEventListener('click', (e) => {
  const b = e.target.closest('[data-p]'); if (!b) return
  T.lastUser = Date.now(); T.chosen = true
  if (b.dataset.p === 'live') goLive(true); else play(b.dataset.p)
})
$('btn-play').addEventListener('click', () => {
  T.lastUser = Date.now(); T.chosen = true
  if (T.mode === 'replay') { pauseAt(T.t); return }
  if (T.mode === 'paused' && T.t < Date.now() - 60e3) { play(T.period, { from: T.t }); return }
  play(T.period === 'live' ? 'day' : T.period)
})
function advance(to) {
  // fire every event between the old and the new time
  let n = 0
  while (T.ptr < rows.length && rows[T.ptr].t <= to) {
    const w = rows[T.ptr++]
    if (n++ < 12) fire(w)
    if (!w.b && w.r >= 0) setNow(fmtDay(w.t), line(w))
  }
  T.t = to
}
const quiet = () => { const last = [...rows].reverse().find((w) => !w.b && w.r >= 0); return !last || Date.now() - last.t > QUIET_MS }
function stepTime(now, dt) {
  const idle = !REDUCED && !introOpen && !document.hidden && Date.now() - T.lastUser > 8000
  if (T.mode === 'live') {
    T.t = Date.now()
    if (T.autoAt && now > T.autoAt && !introOpen) { T.autoAt = 0; if (quiet() && !T.chosen) play('day', { auto: true }) }
    // nobody picked live and nothing has happened for a while: show the day rather than a still scene
    else if (!T.chosen && idle && quiet() && Date.now() - T.lastLive > IDLE_MS && rows.length) play('day', { auto: true })
  } else if (T.mode === 'replay') {
    const to = Math.min(Date.now(), T.t + dt * 1000 * T.rate)
    advance(to)
    $('clock').textContent = fmtDay(T.t)
    if (to >= Date.now() - 1000) {
      T.mode = 'done'; T.doneAt = now; T.t = Date.now()
      computeWindow(); feed(); drawHead(); setNow(fmtClock(T.t), null); setPlay(false)
    }
  } else if (T.mode === 'done') {
    // hold the whole period on screen for a moment, then play it again
    if (idle && now - T.doneAt > 12000) play(T.period, { auto: T.auto })
  }
  if ((T.mode === 'live' || T.mode === 'replay') && now - lastWindowAt > 400) { lastWindowAt = now; computeWindow(); drawHead(); if (T.mode !== 'live') feed() }
}

// ================= live =================
function onLive(e) {
  let ri = repos.findIndex((r) => r.name === e.repo)
  if (ri < 0) ri = addRepo({ name: e.repo, group: e.group, desc: '', tags: e.tags || [], pushedAt: e.at })
  const w = { t: Date.parse(e.at), k: e.kind, r: ri, a: actorOf(e.actor, e.avatar), b: e.bot ? 1 : 0, title: e.title || '', url: e.url, c: e.commits || 0 }
  rows.push(w); rows.sort((x, y) => x.t - y.t)
  drawBars()
  // an automatic replay gives way to the real thing; a period someone chose stays, and Live lights up instead
  if ((T.mode === 'replay' || T.mode === 'done') && T.auto) goLive()
  if (T.mode !== 'live') { if (!w.b) { const b = $('periods').querySelector('.p-live'); b.classList.add('ping'); b.title = t('p.new') } return }
  if (!w.b) T.lastLive = Date.now()
  seekPtr(); computeWindow()
  fire(w)
  if (!w.b) {
    setNow(fmtClock(w.t), t('recent', { line: line(w), ago: ago(w.t) }))
    if (!filtering() || matches(w.r, w.k, w.a)) $('feed').insertAdjacentHTML('afterbegin', feedItem(w, true))
    while ($('feed').children.length > 80) $('feed').lastElementChild.remove()
  }
}
let online = false
function liveDot() { $('live').classList.toggle('on', online); $('live').title = t(online ? 'live.on' : 'live.off') }
function connect() {
  const es = new EventSource('api/stream')
  es.onopen = () => { online = true; liveDot() }
  es.onmessage = (m) => { try { onLive(JSON.parse(m.data)) } catch (err) { console.error(err) } }
  es.addEventListener('news', (m) => { try { onNews(JSON.parse(m.data)) } catch (err) { console.error(err) } })
  es.onerror = () => { online = false; liveDot() }
}

// ================= language and the welcome card =================
function applyLang() {
  document.documentElement.lang = t('locale')
  for (const el of document.querySelectorAll('[data-t]')) el.textContent = t(el.dataset.t)
  for (const el of document.querySelectorAll('[data-t-label]')) { el.setAttribute('aria-label', t(el.dataset.tLabel)); el.title = t(el.dataset.tLabel) }
  $('q').placeholder = innerWidth <= 860 ? t('search') : innerWidth < 1200 ? t('searchShort') : t('search')
  for (const b of document.querySelectorAll('[data-lang]')) b.setAttribute('aria-pressed', String(b.dataset.lang === LANG))
  $('legend').innerHTML = FAMS.map((f) => `<span><i style="background:${FAMILY[f]}"></i>${esc(t('famLong.' + f))}</span>`).join('') + `<span><i style="background:#8b9480"></i>${esc(t('automatic'))}</span>`
  for (const o of groupLabels) labelText(o.element)
  buildFilters(); liveDot(); setPlay(T.mode === 'replay'); renderNews(); notifyState()
  if (!repos.length) { $('ticker').textContent = t('connecting'); updateLayout(); return }
  computeWindow(); feed(); drawBars(); drawHead(); renderHighlights(); placeBadges()
  if (T.mode === 'live') setNow(fmtClock(Date.now()), liveText()); else setNow(T.mode === 'done' ? fmtClock(T.t) : fmtDay(T.t), null)
  updateLayout()
}
for (const b of document.querySelectorAll('[data-lang]')) b.addEventListener('click', () => { LANG = b.dataset.lang; store.set('lang', LANG); applyLang() })
let introFrom = null
function openIntro() {
  introFrom = document.activeElement
  introOpen = true; $('intro').hidden = false
  $('intro-go').focus()
}
function closeIntro() {
  if (!introOpen) return
  introOpen = false; $('intro').hidden = true; store.set('seen', '1')
  introFrom?.focus?.()
  if (newsWaiting) { showNewsToast(newsWaiting); newsWaiting = null }
  // a quiet hour would greet a newcomer with a still scene: start the day's replay almost at once
  if (T.mode === 'live' && quiet() && !T.chosen) T.autoAt = performance.now() + 1200
}
$('btn-help').addEventListener('click', openIntro)
$('intro-go').addEventListener('click', closeIntro)
$('intro').addEventListener('click', (e) => { if (e.target === $('intro')) closeIntro() })
addEventListener('keydown', (e) => { if (e.key === 'Escape' && introOpen) closeIntro() })
applyLang()
if (!store.get('seen')) openIntro()

// ================= frame =================
let last = performance.now(), slow = 0, frames = 0, acc = 0
function frame(now) {
  requestAnimationFrame(frame)
  const dt = Math.min(0.1, (now - last) / 1000); last = now
  stepTime(now, dt); stepFlight(dt); stepPeople(dt); stepComets(dt); stepFx(dt, now); stepTweens(now); stepHover()
  controls.update()
  if (mesh) {
    for (let i = 0; i < mesh.count; i++) {
      const c = cell[i]; if (!c) continue
      const grow = Math.min(1, Math.max(0, (now - c.born) / 900))
      c.h += (c.hT * grow - c.h) * Math.min(1, dt * 5)
      c.glow *= Math.exp(-dt * 2.2)
      c.pop = Math.max(0, (c.pop || 0) - dt * 2.5)
      c.dim += (c.dimT - c.dim) * Math.min(1, dt * 6)
      const breathe = W.n[i] && !REDUCED ? 1 + 0.18 * Math.sin(now / 700 + i * 1.7) : 1
      const sxz = 0.82 * (1 + c.hover * 0.12 + c.pop * 0.25)
      tmpS.set(sxz, Math.max(0.02, c.h * (1 + c.pop * 0.35)), sxz)
      tmpP.set(c.x, 0, c.z)
      tmpM.compose(tmpP, tmpQ, tmpS)
      mesh.setMatrixAt(i, tmpM)
      tmpC.copy(c.base).multiplyScalar(breathe * c.dim + c.hover * 0.6)
      tmpC.r += c.flash.r * c.glow * c.dim; tmpC.g += c.flash.g * c.glow * c.dim; tmpC.b += c.flash.b * c.glow * c.dim
      mesh.setColorAt(i, tmpC)
    }
    mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true
  }
  for (const o of sceneBadges) { const c = cell[o.userData.cell]; if (c) o.position.set(c.x, c.h + 0.55, c.z) }
  if (useBloom) composer.render(); else renderer.render(scene, camera)
  labelRenderer.render(scene, camera)
  // every frame: medals ride on blocks that grow during a replay, so a label can reach another one between two checks
  cull(now)
  // slow device: drop the bloom
  acc += dt; frames++
  if (acc > 2) { if (frames / acc < 28) slow++; else slow = 0; if (slow >= 2 && useBloom) { useBloom = false; renderer.setPixelRatio(1) } acc = 0; frames = 0 }
}
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); labelRenderer.setSize(innerWidth, innerHeight)
  bloom.resolution.set(innerWidth / 2, innerHeight / 2)
  updateLayout(); setHome()
  drawBars(); drawHead()
})

// ================= start =================
function ingest(N) {
  S = N
  repos = S.repos.map((r) => ({ name: r.name, group: r.group, desc: r.desc, tags: r.tags || [], pushedAt: r.pushedAt }))
  actors = S.history.actors.map(([l, av]) => [l, av]); actorIdx.clear(); actors.forEach(([l], i) => actorIdx.set(l, i))
  rows = S.history.rows.map(([at, k, r, a, b, title, c]) => ({ t: at * 1000, k: S.history.kinds[k], r, a, b, title: title || '', c: c || 0 }))
  rows.sort((x, y) => x.t - y.t)
  // links for the feed come from the latest events with titles and urls
  const urls = new Map(S.events.map((e) => [`${e.repo}|${Date.parse(e.at)}`, e.url]))
  for (const w of rows) { const u = urls.get(`${repos[w.r]?.name}|${w.t}`); if (u) w.url = u }
}
async function load() {
  const res = await fetch('api/state', { cache: 'no-store' })
  ingest(await res.json())
  buildCells()
  updateLayout(); setHome()
  camera.position.copy(home.p).multiplyScalar(1.4); controls.target.set(0, 0, 0)
  flight = { from: { p: camera.position.clone(), t: new THREE.Vector3() }, to: { p: home.p.clone(), t: home.t.clone() }, t: 0 }
  goLive()
  drawBars(); drawHead(); renderHighlights(); placeBadges()
  if (quiet()) T.autoAt = performance.now() + 3500 // after the opening flight
  openFromLink()
  renderNews(); newsToastOnLoad()
  if (pushOk && Notification.permission === 'granted') syncFollows(false)
}
// every few minutes: projects that joined or left, new organisations, fresh highlights
async function refresh() {
  try {
    const res = await fetch('api/state', { cache: 'no-store' }); if (!res.ok) return
    const before = repos.map((r) => r.name).join('|')
    ingest(await res.json())
    if (repos.map((r) => r.name).join('|') !== before) buildCells()
    else for (const o of groupLabels) labelText(o.element)
    seekPtr(); computeWindow(); feed(); drawBars(); drawHead(); renderHighlights(); placeBadges()
  } catch (err) { console.warn('refresh', err) }
}
load().then(() => { connect(); requestAnimationFrame(frame); setInterval(refresh, REFRESH_MS) }).catch((err) => { console.error(err); $('ticker').textContent = t('err.load'); setTimeout(() => location.reload(), 10000) })
