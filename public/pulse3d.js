// CKB Pulse in 3D: repositories as columns of light, people as avatars in orbit, each event a comet from
// the person to the repository. Time runs LIVE, REPLAY (the last 24 h when nothing is happening) or PAUSED
// (wherever the timeline is dragged). Data: /api/state (7 days of compact history), /api/stream, /api/repo.
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'

const KIND = {
  push: ['pushed', '#cbf34d'], pr_open: ['opened a PR', '#62c9f5'], pr_merged: ['merged a PR', '#a78bfa'], pr_closed: ['closed a PR', '#6b7260'],
  issue_open: ['opened an issue', '#f5b14c'], issue_closed: ['closed an issue', '#6b7260'], comment: ['commented', '#7aa2f7'], review: ['reviewed', '#7aa2f7'],
  release: ['released', '#ff6b8b'], repo: ['created a repo', '#ffffff'], star: ['starred', '#ffd166'], fork: ['forked', '#4fd1c5'], branch: ['opened a branch', '#9fb06a'], tag: ['tagged', '#9fb06a'],
}
const KIND_FILTERS = [['pr', 'pull requests', ['pr_open', 'pr_merged', 'pr_closed', 'review']], ['push', 'pushes', ['push']], ['issue', 'issues', ['issue_open', 'issue_closed', 'comment']], ['release', 'releases', ['release', 'tag', 'repo']]]
const DAY = 864e5
const IDLE_MS = 15000
const REPLAY_MS = 90000
const MOBILE = matchMedia('(max-width: 860px)').matches || matchMedia('(pointer: coarse)').matches
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches
const $ = (id) => document.getElementById(id)
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const verb = (k) => (KIND[k] || [k])[0]
const kcol = (k) => (KIND[k] || KIND.push)[1]
const fmtClock = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const fmtDay = (t) => new Date(t).toLocaleDateString([], { weekday: 'short' }) + ' ' + fmtClock(t)
function ago(t) {
  const s = (Date.now() - t) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  const d = Math.floor(s / 86400); return d === 1 ? 'yesterday' : `${d} days ago`
}

// ================= data =================
let S = null
let repos = [] // from the server, plus repos first seen live
let rows = [] // {t, k, r, a, b, title}
let actors = [] // [login, avatar]
const actorIdx = new Map()
const filt = { tag: null, kind: null, bots: true }
const T = { mode: 'live', t: Date.now(), playing: false, speed: 3600, lastLive: 0, lastUser: 0, ptr: 0, replay: null }

function actorOf(login, avatar) {
  if (!actorIdx.has(login)) { actorIdx.set(login, actors.length); actors.push([login, avatar || '']) }
  const i = actorIdx.get(login)
  if (avatar && !actors[i][1]) actors[i][1] = avatar
  return i
}
// avatars.githubusercontent.com answers by login with CORS open, so the image can become a WebGL texture (github.com/<login>.png redirects first)
const avatarUrl = (i) => { const a = actors[i]?.[1]; return a ? a + (a.includes('?') ? '&' : '?') + 's=96' : `https://avatars.githubusercontent.com/${encodeURIComponent(actors[i]?.[0] || '')}?s=96` }

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
const controls = new OrbitControls(camera, renderer.domElement)
Object.assign(controls, { enableDamping: true, dampingFactor: 0.07, autoRotate: !REDUCED, autoRotateSpeed: 0.3, maxPolarAngle: 1.33, minDistance: 5, enablePan: true, screenSpacePanning: false })
controls.addEventListener('start', () => { T.lastUser = Date.now(); controls.autoRotate = false })

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
function buildCells() {
  if (mesh) { scene.remove(mesh); mesh.geometry.dispose() }
  for (const l of groupLabels) l.parent.remove(l)
  groupLabels.length = 0
  const groups = new Map()
  repos.forEach((r, i) => { if (!groups.has(r.group)) groups.set(r.group, []); groups.get(r.group).push(i) })
  const weekly = new Array(repos.length).fill(0)
  for (const w of rows) if (w.r >= 0 && !w.b) weekly[w.r]++
  const clusters = [...groups.entries()].map(([g, list]) => { list.sort((a, b) => weekly[b] - weekly[a] || (repos[b].pushedAt || '').localeCompare(repos[a].pushedAt || '')); return { g, list, ...spiral(list.length) } })
  const center = clusters.find((c) => c.g === 'builders') || clusters.sort((a, b) => b.list.length - a.list.length)[0]
  const ring = clusters.filter((c) => c !== center).sort((a, b) => b.list.length - a.list.length)
  const place = (c, cx, cz) => { c.cx = cx; c.cz = cz; c.list.forEach((ri, k) => { const [sx, sz] = c.slots[k]; cell[ri] = { ...(cell[ri] || {}), x: cx + sx * PITCH, z: cz + sz * PITCH } }) }
  place(center, 0, 0)
  const half = (c) => Math.hypot(c.w, c.d) / 2
  const R = half(center) + Math.max(...ring.map(half), 2) + 3.5
  const total = ring.reduce((s, c) => s + Math.max(c.w, c.d) + 3, 0)
  let ang = -Math.PI / 2
  const step = (2 * Math.PI) / Math.max(total, 2 * Math.PI * R / 1.6)
  for (const c of ring) {
    const span = (Math.max(c.w, c.d) + 3) * step
    ang += span / 2
    place(c, Math.cos(ang) * R, Math.sin(ang) * R)
    ang += span / 2
  }
  layoutR = R + Math.max(...ring.map(half), 2)
  for (const c of clusters) {
    const div = document.createElement('div')
    div.className = 'lbl'
    div.textContent = c.g === 'builders' ? `Builders · ${c.list.length}` : `${c.g} · ${c.list.length}`
    const o = new CSS2DObject(div)
    o.position.set(c.cx, 0.2, c.cz + c.d / 2 + 1.1)
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
  repos.forEach((r, i) => { const c = cell[i]; Object.assign(c, { h: c.h ?? 0.01, hT: 0.25, glow: 0, flash: new THREE.Color('#ffffff'), base: DORMANT.clone(), dim: 1, dimT: 1, hover: 0, born: performance.now() + Math.hypot(c.x, c.z) * 18 }) })
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

// ================= the window [t - 24 h, t] =================
const W = { n: [], b: [], last: [], people: new Map(), hour: 0, day: 0, tags: {}, kinds: {} }
function computeWindow() {
  const t1 = T.t, t0 = t1 - DAY, h0 = t1 - 3600e3
  W.n = new Array(repos.length).fill(0); W.b = new Array(repos.length).fill(0); W.last = new Array(repos.length).fill(null)
  W.people = new Map(); W.hour = 0; W.day = 0; W.tags = {}; W.kinds = {}
  for (const w of rows) {
    if (w.t > t1) break
    if (w.t < t0 || w.r < 0) continue
    if (w.b) { W.b[w.r]++; continue }
    W.n[w.r]++; W.last[w.r] = w.k; W.day++
    if (w.t >= h0) W.hour++
    W.people.set(w.a, (W.people.get(w.a) || 0) + 1)
    for (const tg of repos[w.r].tags || []) W.tags[tg] = (W.tags[tg] || 0) + 1
    W.kinds[w.k] = (W.kinds[w.k] || 0) + 1
  }
  repos.forEach((r, i) => {
    const c = cell[i]
    if (!c) return
    if (W.n[i]) { c.base.set(kcol(W.last[i])).multiplyScalar(0.55 + Math.min(0.9, 0.12 * W.n[i])); c.hT = 0.45 + 0.85 * Math.log2(1 + W.n[i]) }
    else if (W.b[i]) { c.base.copy(BOTCELL); c.hT = 0.32 }
    else { c.base.copy(DORMANT); c.hT = 0.22 }
  })
  applyFilter()
  kpis(); chips(); topLists(); people()
}
function matches(ri, k) {
  if (ri < 0) return false
  if (filt.tag && !(repos[ri].tags || []).includes(filt.tag)) return false
  if (filt.kind && k && !KIND_FILTERS.find((f) => f[0] === filt.kind)[2].includes(k)) return false
  if (filt.kind && !k) return KIND_FILTERS.find((f) => f[0] === filt.kind)[2].includes(W.last[ri])
  return true
}
function applyFilter() { repos.forEach((r, i) => { if (cell[i]) cell[i].dimT = !filt.tag && !filt.kind ? 1 : matches(i) ? 1 : 0.12 }) }

// ================= HUD =================
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
  setNum('k-hour', W.hour); setNum('k-day', W.day)
  setNum('k-active', W.n.filter(Boolean).length); setNum('k-people', W.people.size)
}
function chips() {
  const tags = Object.entries(W.tags).sort((a, b) => b[1] - a[1])
  const kinds = KIND_FILTERS.map(([id, label, ks]) => [id, label, ks.reduce((s, k) => s + (W.kinds[k] || 0), 0), kcol(ks[0])])
  $('chips').innerHTML = tags.map(([t, n]) => `<button type="button" data-tag="${esc(t)}" aria-pressed="${filt.tag === t}">${esc(t)}<b>${n}</b></button>`).join('') +
    '<span class="sep"></span>' + kinds.map(([id, label, n, col]) => `<button type="button" data-kind="${id}" aria-pressed="${filt.kind === id}"><i style="background:${col}"></i>${label}<b>${n}</b></button>`).join('') +
    `<span class="sep"></span><button type="button" data-bots="1" aria-pressed="${filt.bots}"><i style="background:#8b9480"></i>automation</button>`
}
$('chips').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return
  if (b.dataset.tag) filt.tag = filt.tag === b.dataset.tag ? null : b.dataset.tag
  if (b.dataset.kind) filt.kind = filt.kind === b.dataset.kind ? null : b.dataset.kind
  if (b.dataset.bots) filt.bots = !filt.bots
  applyFilter(); chips(); feed()
})
function topLists() {
  const tr = W.n.map((n, i) => [i, n]).filter((x) => x[1]).sort((a, b) => b[1] - a[1]).slice(0, 8)
  const tp = [...W.people.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
  const mr = tr[0]?.[1] || 1, mp = tp[0]?.[1] || 1
  $('top-repos').innerHTML = tr.map(([i, n]) => `<li data-repo="${i}"><span class="sw" style="background:${kcol(W.last[i])}"></span><span>${esc(repos[i].name)}</span><b>${n}</b><div class="bar"><i style="width:${(n / mr) * 100}%"></i></div></li>`).join('') || '<li>Nothing in this window.</li>'
  $('top-people').innerHTML = tp.map(([a, n]) => `<li data-person="${a}"><img src="${esc(avatarUrl(a))}" alt="" loading="lazy"><span>${esc(actors[a][0])}</span><b>${n}</b><div class="bar"><i style="width:${(n / mp) * 100}%"></i></div></li>`).join('')
  $('top-window').textContent = `24 hours up to ${fmtDay(T.t)}`
}
$('top').addEventListener('click', (e) => {
  const li = e.target.closest('li'); if (!li) return
  if (li.dataset.repo) openRepo(+li.dataset.repo)
  if (li.dataset.person) openPerson(+li.dataset.person)
})
function feed() {
  const list = []
  for (let i = rows.length - 1; i >= 0 && list.length < 60; i--) {
    const w = rows[i]
    if (w.t > T.t || w.b || w.r < 0) continue
    if ((filt.tag || filt.kind) && !matches(w.r, w.k)) continue
    list.push(w)
  }
  $('feed').innerHTML = list.map((w) => feedItem(w, false)).join('')
}
function feedItem(w, isNew) {
  const title = w.title ? `<div class="title">${w.url ? `<a href="${esc(w.url)}" target="_blank" rel="noopener">${esc(w.title)}</a>` : esc(w.title)}</div>` : ''
  return `<li class="${isNew ? 'new' : ''}"><img src="${esc(avatarUrl(w.a))}" alt="" loading="lazy"><div><div class="what"><i class="k" style="background:${kcol(w.k)}"></i><b>${esc(actors[w.a][0])}</b> ${verb(w.k)} in <span class="repo" data-repo="${w.r}">${esc(repos[w.r].name)}</span></div>${title}<div class="meta">${T.mode === 'live' ? ago(w.t) : fmtDay(w.t)}</div></div></li>`
}
$('feed').addEventListener('click', (e) => { const r = e.target.closest('[data-repo]'); if (r) openRepo(+r.dataset.repo) })
for (const b of document.querySelectorAll('.tabs [data-tab]')) b.addEventListener('click', () => {
  for (const x of document.querySelectorAll('.tabs [data-tab]')) x.setAttribute('aria-selected', String(x === b))
  for (const p of document.querySelectorAll('[data-pane]')) p.hidden = p.dataset.pane !== b.dataset.tab
  $('side').classList.remove('closed')
})
$('btn-side').addEventListener('click', () => $('side').classList.toggle('closed'))
if (MOBILE) $('side').classList.add('closed')
function setNow(mode, clock, text) {
  $('mode').textContent = mode
  $('now').classList.toggle('replay', mode.startsWith('REPLAY'))
  $('now').classList.toggle('paused', mode === 'PAUSED' || mode === 'PLAYING')
  $('clock').textContent = clock
  if (text != null) { $('ticker').textContent = text; $('sr').textContent = text }
  $('btn-live').classList.toggle('on', T.mode === 'live')
}
const line = (w) => `${actors[w.a][0]} ${verb(w.k)} in ${repos[w.r]?.name}${w.title ? `: ${w.title}` : ''}`

// ================= people in orbit =================
const peopleGroup = new THREE.Group()
scene.add(peopleGroup)
const sprites = new Map() // actor index -> sprite
const texCache = new Map()
function avatarTexture(a) {
  if (texCache.has(a)) return texCache.get(a)
  const c = document.createElement('canvas'); c.width = c.height = 128
  const g = c.getContext('2d')
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  const draw = (img) => {
    g.clearRect(0, 0, 128, 128)
    g.save(); g.beginPath(); g.arc(64, 64, 56, 0, Math.PI * 2); g.clip()
    if (img) g.drawImage(img, 8, 8, 112, 112); else { g.fillStyle = '#1b2215'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#cbf34d'; g.font = 'bold 52px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText((actors[a][0][0] || '?').toUpperCase(), 64, 68) }
    g.restore(); g.lineWidth = 6; g.strokeStyle = '#cbf34d'; g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.stroke()
    tex.needsUpdate = true
  }
  draw(null)
  const img = new Image(); img.crossOrigin = 'anonymous'; img.onload = () => draw(img); img.src = avatarUrl(a)
  texCache.set(a, tex)
  return tex
}
let orbit = 0
function people() {
  const top = [...W.people.entries()].sort((x, y) => y[1] - x[1]).slice(0, MOBILE ? 16 : 32)
  const keep = new Set(top.map(([a]) => a))
  for (const [a, s] of sprites) if (!keep.has(a)) { s.userData.leaving = true }
  const R = layoutR + 4, max = top[0]?.[1] || 1
  top.forEach(([a, n], i) => {
    let s = sprites.get(a)
    if (!s) {
      s = new THREE.Sprite(new THREE.SpriteMaterial({ map: avatarTexture(a), transparent: true, depthWrite: false, opacity: 0 }))
      s.userData = { a }
      sprites.set(a, s); peopleGroup.add(s)
    }
    s.userData.leaving = false
    s.userData.ang = (i / top.length) * Math.PI * 2
    s.userData.size = 1.1 + 1.6 * Math.sqrt(n / max)
    s.userData.n = n
    s.userData.R = R + (i % 2) * 2.2
    s.userData.y = 7 + (i % 3) * 1.6
  })
}
function stepPeople(dt) {
  if (!REDUCED) orbit += dt * 0.04
  for (const [a, s] of sprites) {
    const u = s.userData
    const target = u.leaving ? 0 : 1
    s.material.opacity += (target - s.material.opacity) * Math.min(1, dt * 3)
    if (u.leaving && s.material.opacity < 0.02) { peopleGroup.remove(s); s.material.dispose(); sprites.delete(a); continue }
    const ang = u.ang + orbit
    tmpP.set(Math.cos(ang) * u.R, u.y + Math.sin(performance.now() / 1400 + u.ang * 3) * 0.25, Math.sin(ang) * u.R)
    s.position.lerp(tmpP, Math.min(1, dt * 2.5))
    const sz = u.size * (1 + (u.flare || 0) * 0.5)
    s.scale.set(sz, sz, 1)
    u.flare = Math.max(0, (u.flare || 0) - dt * 2)
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
  const s = sprites.get(w.a)
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
const curve = (a, m, b, t, out) => out.set((1 - t) ** 2 * a.x + 2 * (1 - t) * t * m.x + t * t * b.x, (1 - t) ** 2 * a.y + 2 * (1 - t) * t * m.y + t * t * b.y, (1 - t) ** 2 * a.z + 2 * (1 - t) * t * m.z + t * t * b.z)
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
  if ((filt.tag || filt.kind) && !matches(w.r, w.k)) return
  comet(w)
}

// ================= interaction =================
const ray = new THREE.Raycaster()
const ptr = new THREE.Vector2(), ptrPx = { x: 0, y: 0, in: false }
let hovered = -1, hoveredPerson = null, down = null
renderer.domElement.addEventListener('pointermove', (e) => { ptr.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ptrPx.x = e.clientX; ptrPx.y = e.clientY; ptrPx.in = true })
renderer.domElement.addEventListener('pointerleave', () => { ptrPx.in = false; $('tip').hidden = true })
renderer.domElement.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; ptr.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1) })
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6 || performance.now() - down.t > 450) return
  ptr.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1)
  const pick = pickAt()
  if (pick.person != null) openPerson(pick.person)
  else if (pick.cell >= 0) openRepo(pick.cell)
})
function pickAt() {
  ray.setFromCamera(ptr, camera)
  const ps = ray.intersectObjects(peopleGroup.children, false)
  if (ps.length) return { person: ps[0].object.userData.a, cell: -1 }
  const hits = mesh ? ray.intersectObject(mesh, false) : []
  return { person: null, cell: hits.length ? hits[0].instanceId : -1 }
}
function stepHover() {
  if (!ptrPx.in || MOBILE) return
  const p = pickAt()
  const tip = $('tip')
  if (hovered >= 0 && cell[hovered]) cell[hovered].hover = 0
  hovered = p.cell; hoveredPerson = p.person
  if (p.person != null) {
    const n = W.people.get(p.person) || 0
    tip.innerHTML = `<b>${esc(actors[p.person][0])}</b><span>${n} events in the 24 h up to ${fmtClock(T.t)}</span>`
  } else if (p.cell >= 0) {
    cell[p.cell].hover = 1
    const r = repos[p.cell]
    tip.innerHTML = `<b>${esc(r.name)}</b>${r.desc ? `<span>${esc(r.desc)}</span>` : ''}<span>${W.n[p.cell] ? `${W.n[p.cell]} events by people in the 24 h up to ${fmtClock(T.t)}` : 'quiet in this window'}${W.b[p.cell] ? ` · ${W.b[p.cell]} automated` : ''}</span>`
  } else { tip.hidden = true; renderer.domElement.style.cursor = ''; return }
  renderer.domElement.style.cursor = 'pointer'
  tip.hidden = false
  const w = tip.offsetWidth, h = tip.offsetHeight
  tip.style.left = `${Math.min(innerWidth - w - 8, ptrPx.x + 14)}px`
  tip.style.top = `${ptrPx.y + h + 24 > innerHeight ? ptrPx.y - h - 12 : ptrPx.y + 18}px`
}
// the HUD covers the top, the bottom and (on wide screens) the right: centre the scene in what is left
function hud() {
  const right = !MOBILE && (!$('side').classList.contains('closed') || !$('drawer').hidden) ? 400 : 0
  return { top: MOBILE ? 150 : 112, bottom: MOBILE ? 215 : 186, right }
}
function updateView() {
  const { top, bottom, right } = hud()
  camera.setViewOffset(innerWidth, innerHeight, right / 2, (bottom - top) / 2, innerWidth, innerHeight)
}
function fitDistance() {
  const { top, bottom, right } = hud()
  const v = THREE.MathUtils.degToRad(camera.fov) / 2, h = Math.atan(Math.tan(v) * camera.aspect)
  const tw = Math.tan(h) * (innerWidth - right - 24) / innerWidth, tv = Math.tan(v) * (innerHeight - top - bottom) / innerHeight
  const r = layoutR + 3
  return Math.max(r / tw, (r * 0.66) / tv)
}
const ELEV = 0.66 // about 38 degrees above the ground
new MutationObserver(updateView).observe($('side'), { attributes: true, attributeFilter: ['class'] })
new MutationObserver(updateView).observe($('drawer'), { attributes: true, attributeFilter: ['hidden'] })

// camera flight to a cell
let flight = null
function flyTo(x, z, dist = 14) {
  const from = { p: camera.position.clone(), t: controls.target.clone() }
  const to = { t: new THREE.Vector3(x, 0.5, z) }
  const dir = camera.position.clone().sub(controls.target).normalize()
  to.p = to.t.clone().add(dir.multiplyScalar(dist)); to.p.y = Math.max(to.p.y, 6)
  flight = { from, to, t: 0 }
  controls.autoRotate = false; T.lastUser = Date.now()
}
function stepFlight(dt) {
  if (!flight) return
  flight.t = Math.min(1, flight.t + dt / 1.2)
  const k = flight.t < 0.5 ? 4 * flight.t ** 3 : 1 - Math.pow(-2 * flight.t + 2, 3) / 2
  camera.position.lerpVectors(flight.from.p, flight.to.p, k)
  controls.target.lerpVectors(flight.from.t, flight.to.t, k)
  if (flight.t >= 1) flight = null
}

// drawer: a repository
async function openRepo(i) {
  const r = repos[i]; if (!r) return
  const c = cell[i]; if (c) flyTo(c.x, c.z, 26)
  $('drawer').hidden = false
  $('drawer-body').innerHTML = `<h2>${esc(r.name)}</h2><p class="sub">Loading…</p>`
  try {
    const res = await fetch(`api/repo?name=${encodeURIComponent(r.name)}`)
    if (!res.ok) throw new Error(res.status)
    const d = await res.json()
    const max = Math.max(1, ...d.daily.people.map((v, k) => v + d.daily.bots[k]))
    const bw = 300 / d.daily.days
    const bars = d.daily.people.map((v, k) => { const hb = (d.daily.bots[k] / max) * 56, hp = (v / max) * 56; return `<rect x="${k * bw + 1}" y="${60 - hp - hb}" width="${bw - 2}" height="${hb}" fill="#8b9480" opacity=".6"/><rect x="${k * bw + 1}" y="${60 - hp}" width="${bw - 2}" height="${hp}" fill="#cbf34d" rx="1"/>` }).join('')
    $('drawer-body').innerHTML = `<h2><a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.name)}</a></h2>
<p class="sub">${esc(d.group === 'builders' ? 'Builder' : d.group)}${d.lang ? ` · ${esc(d.lang)}` : ''} · ★ ${d.stars}${d.pushedAt ? ` · last push ${ago(Date.parse(d.pushedAt))}` : ''}</p>
${d.desc ? `<p class="desc">${esc(d.desc)}</p>` : ''}<div class="pills">${d.topics.slice(0, 10).map((t) => `<span>${esc(t)}</span>`).join('')}</div>
<h3>Last 30 days (people, automation)</h3><svg viewBox="0 0 300 60" preserveAspectRatio="none">${bars}</svg>
${d.contributors.length ? `<h3>People</h3><div class="people">${d.contributors.map((p) => `<a href="https://github.com/${esc(p.login)}" target="_blank" rel="noopener"><img src="${esc(p.avatar ? p.avatar + (p.avatar.includes('?') ? '&' : '?') + 's=48' : `https://avatars.githubusercontent.com/${encodeURIComponent(p.login)}?s=48`)}" alt="">${esc(p.login)} <b>${p.n}</b></a>`).join('')}</div>` : ''}
<h3>Latest</h3><ol>${d.events.slice(0, 20).map((e) => `<li><i class="k" style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${kcol(e.kind)}"></i> <b>${esc(e.actor)}</b> ${verb(e.kind)}${e.title ? `: <a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.title)}</a>` : ''}<small>${ago(Date.parse(e.at))}</small></li>`).join('') || '<li>No activity by people in the last 30 days.</li>'}</ol>`
  } catch { $('drawer-body').innerHTML = `<h2><a href="https://github.com/${esc(r.name)}" target="_blank" rel="noopener">${esc(r.name)}</a></h2><p class="sub">Details are not available right now.</p>` }
}
function openPerson(a) {
  const login = actors[a][0]
  const per = new Map()
  for (const w of rows) if (w.a === a && !w.b && w.r >= 0) per.set(w.r, (per.get(w.r) || 0) + 1)
  const list = [...per.entries()].sort((x, y) => y[1] - x[1])
  $('drawer').hidden = false
  $('drawer-body').innerHTML = `<h2><a href="https://github.com/${esc(login)}" target="_blank" rel="noopener">${esc(login)}</a></h2>
<p class="sub">${list.reduce((s, x) => s + x[1], 0)} events in ${list.length} repositories over 7 days</p>
<div class="people"><a href="https://github.com/${esc(login)}" target="_blank" rel="noopener"><img src="${esc(avatarUrl(a))}" alt="" style="width:56px;height:56px">GitHub profile</a></div>
<h3>Where</h3><ol>${list.map(([r, n]) => `<li data-repo="${r}" style="cursor:pointer">${esc(repos[r].name)} <b style="color:var(--lime)">${n}</b></li>`).join('')}</ol>`
  const s = sprites.get(a); if (s) flyTo(s.position.x * 0.6, s.position.z * 0.6, 22)
}
$('drawer-body').addEventListener('click', (e) => { const li = e.target.closest('[data-repo]'); if (li) openRepo(+li.dataset.repo) })
$('drawer-close').addEventListener('click', () => { $('drawer').hidden = true })
addEventListener('keydown', (e) => { if (e.key === 'Escape') { $('drawer').hidden = true; $('results').hidden = true } })

// search: repositories and people
$('q').addEventListener('input', () => {
  const q = $('q').value.trim().toLowerCase()
  if (q.length < 2) { $('results').hidden = true; return }
  const rs = repos.map((r, i) => [i, r]).filter(([, r]) => r.name.toLowerCase().includes(q)).slice(0, 8)
  const ps = actors.map((p, i) => [i, p]).filter(([, p]) => p[0].toLowerCase().includes(q)).slice(0, 6)
  $('results').innerHTML = rs.map(([i, r]) => `<li role="option" data-repo="${i}"><span class="sw" style="background:${W.n[i] ? kcol(W.last[i]) : '#2b3420'}"></span>${esc(r.name)}<small>${W.n[i] || ''}</small></li>`).join('') +
    ps.map(([i, p]) => `<li role="option" data-person="${i}"><img src="${esc(avatarUrl(i))}" alt="">${esc(p[0])}<small>${W.people.get(i) || ''}</small></li>`).join('') || '<li>No match</li>'
  $('results').hidden = false
})
$('results').addEventListener('click', (e) => {
  const li = e.target.closest('li'); if (!li) return
  if (li.dataset.repo) openRepo(+li.dataset.repo)
  if (li.dataset.person) openPerson(+li.dataset.person)
  $('results').hidden = true; $('q').blur()
})
$('btn-full').addEventListener('click', () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.() })

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
  $('days').innerHTML = Array.from({ length: 7 }, (_, d) => `<span>${new Date(start + d * DAY + DAY / 2).toLocaleDateString([], { weekday: 'short' })}</span>`).join('')
}
function drawHead() {
  const now = Date.now(), start = now - 7 * DAY
  const x = Math.max(0, Math.min(1, (T.t - start) / (7 * DAY)))
  const wx = Math.max(0, (T.t - DAY - start) / (7 * DAY))
  $('head').style.left = `${(x * 100).toFixed(3)}%`
  $('window').style.left = `${(wx * 100).toFixed(3)}%`; $('window').style.width = `${((x - wx) * 100).toFixed(3)}%`
  $('head-label').textContent = T.mode === 'live' ? 'now' : fmtDay(T.t)
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
  if (e.key === 'End') goLive()
})
function seekPtr() { let lo = 0, hi = rows.length; while (lo < hi) { const m = (lo + hi) >> 1; if (rows[m].t <= T.t) lo = m + 1; else hi = m } T.ptr = lo }
let lastWindowAt = 0
function pauseAt(t) {
  T.mode = 'paused'; T.playing = false; T.replay = null; T.lastUser = Date.now()
  T.t = Math.min(Date.now(), t)
  seekPtr(); computeWindow(); feed(); drawHead()
  const last = rows[T.ptr - 1]
  setNow('PAUSED', fmtDay(T.t), last && !last.b ? line(last) : '')
  $('btn-play').textContent = '▶'
}
function goLive() {
  T.mode = 'live'; T.playing = false; T.replay = null; T.t = Date.now(); T.lastLive = Date.now()
  seekPtr(); computeWindow(); feed(); drawHead()
  const last = [...rows].reverse().find((w) => !w.b && w.r >= 0)
  setNow('LIVE', fmtClock(Date.now()), last ? `Last: ${line(last)}, ${ago(last.t)}` : 'Waiting for activity…')
  $('btn-play').textContent = '▶'
}
$('btn-live').addEventListener('click', goLive)
$('speed').addEventListener('change', () => { T.speed = +$('speed').value })
$('btn-play').addEventListener('click', () => {
  if (T.mode === 'playing') { pauseAt(T.t); return }
  if (T.mode === 'live' || T.t >= Date.now() - 60e3) T.t = Date.now() - DAY
  T.mode = 'playing'; T.playing = true; T.replay = null; seekPtr(); T.lastUser = Date.now()
  $('btn-play').textContent = '❚❚'
})
function advance(to) {
  // fire every event between the old and the new time
  let n = 0
  while (T.ptr < rows.length && rows[T.ptr].t <= to) {
    const w = rows[T.ptr++]
    if (n++ < 12) fire(w)
    if (!w.b && w.r >= 0) setNow($('mode').textContent, fmtDay(w.t), line(w))
  }
  T.t = to
}
function stepTime(now, dt) {
  if (T.mode === 'live') {
    T.t = Date.now()
    if (!REDUCED && Date.now() - T.lastLive > IDLE_MS && Date.now() - T.lastUser > 8000 && !document.hidden && rows.length) {
      T.mode = 'replay'; T.replay = { start: now }; T.t = Date.now() - DAY; seekPtr()
    }
  } else if (T.mode === 'replay') {
    const f = Math.min(1, (now - T.replay.start) / REPLAY_MS)
    advance(Date.now() - DAY + f * DAY)
    $('mode').textContent = 'REPLAY · LAST 24 H'; $('now').classList.add('replay'); $('clock').textContent = fmtDay(T.t)
    if (f >= 1) { goLive(); T.lastLive = Date.now() - IDLE_MS + 4000 }
  } else if (T.mode === 'playing') {
    const to = Math.min(Date.now(), T.t + dt * T.speed * 1000)
    advance(to)
    $('mode').textContent = 'PLAYING'; $('clock').textContent = fmtDay(T.t)
    if (to >= Date.now() - 1000) goLive()
  }
  if (T.mode !== 'paused' && now - lastWindowAt > 400) { lastWindowAt = now; computeWindow(); drawHead(); if (T.mode !== 'live') feed() }
}

// ================= live =================
function onLive(e) {
  let ri = repos.findIndex((r) => r.name === e.repo)
  if (ri < 0) ri = addRepo({ name: e.repo, group: e.group, desc: '', tags: e.tags || [], pushedAt: e.at })
  const w = { t: Date.parse(e.at), k: e.kind, r: ri, a: actorOf(e.actor, e.avatar), b: e.bot ? 1 : 0, title: e.title || '', url: e.url }
  rows.push(w); rows.sort((x, y) => x.t - y.t)
  drawBars()
  if (T.mode === 'replay') goLive()
  if (T.mode !== 'live') return
  if (!w.b) T.lastLive = Date.now()
  seekPtr(); computeWindow()
  fire(w)
  if (!w.b) {
    setNow('LIVE', fmtClock(w.t), line(w))
    $('feed').insertAdjacentHTML('afterbegin', feedItem(w, true))
    while ($('feed').children.length > 80) $('feed').lastElementChild.remove()
  }
}
function connect() {
  const es = new EventSource('api/stream')
  es.onopen = () => { $('live').classList.add('on'); $('live').title = 'live' }
  es.onmessage = (m) => { try { onLive(JSON.parse(m.data)) } catch (err) { console.error(err) } }
  es.onerror = () => { $('live').classList.remove('on'); $('live').title = 'reconnecting' }
}

// ================= frame =================
let last = performance.now(), slow = 0, frames = 0, acc = 0
function frame(now) {
  requestAnimationFrame(frame)
  const dt = Math.min(0.1, (now - last) / 1000); last = now
  stepTime(now, dt); stepFlight(dt); stepPeople(dt); stepComets(dt); stepFx(dt, now); stepTweens(now); stepHover()
  if (!flight && !controls.autoRotate && !REDUCED && Date.now() - T.lastUser > 9000) controls.autoRotate = true
  controls.update()
  // cells
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
  if (useBloom) composer.render(); else renderer.render(scene, camera)
  labelRenderer.render(scene, camera)
  // slow device: drop the bloom
  acc += dt; frames++
  if (acc > 2) { if (frames / acc < 28) slow++; else slow = 0; if (slow >= 2 && useBloom) { useBloom = false; renderer.setPixelRatio(1) } acc = 0; frames = 0 }
}
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; updateView(); camera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); labelRenderer.setSize(innerWidth, innerHeight)
  bloom.resolution.set(innerWidth / 2, innerHeight / 2)
  drawBars(); drawHead()
})

// ================= start =================
async function load() {
  const res = await fetch('api/state', { cache: 'no-store' })
  S = await res.json()
  repos = S.repos.map((r) => ({ name: r.name, group: r.group, desc: r.desc, tags: r.tags || [], pushedAt: r.pushedAt }))
  actors = S.history.actors.map(([l, av]) => [l, av]); actorIdx.clear(); actors.forEach(([l], i) => actorIdx.set(l, i))
  rows = S.history.rows.map(([t, k, r, a, b, title]) => ({ t: t * 1000, k: S.history.kinds[k], r, a, b, title: title || '' }))
  rows.sort((x, y) => x.t - y.t)
  // links for the feed come from the latest events with titles and urls
  const urls = new Map(S.events.map((e) => [`${e.repo}|${Date.parse(e.at)}`, e.url]))
  for (const w of rows) { const u = urls.get(`${repos[w.r]?.name}|${w.t}`); if (u) w.url = u }
  buildCells()
  updateView()
  const dist = fitDistance()
  camera.position.set(0, dist * 1.4 * Math.sin(ELEV), dist * 1.4 * Math.cos(ELEV))
  controls.target.set(0, 0, 0)
  controls.maxDistance = dist * 2.5
  flight = { from: { p: camera.position.clone(), t: new THREE.Vector3() }, to: { p: new THREE.Vector3(0, dist * Math.sin(ELEV), dist * Math.cos(ELEV)), t: new THREE.Vector3() }, t: 0 }
  goLive()
  drawBars(); drawHead()
}
load().then(() => { connect(); requestAnimationFrame(frame) }).catch((err) => { console.error(err); $('ticker').textContent = 'Could not load the data. Retrying in 10 s.'; setTimeout(() => location.reload(), 10000) })
