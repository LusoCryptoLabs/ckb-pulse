// HTTP: the page, the current state, and a live stream of new events (Server-Sent Events).
//   GITHUB_TOKEN=... node server.mjs        (PORT, default 8080; DATA_DIR, default ./data)
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import crypto from 'node:crypto'
import { personMarks, isAI, start, snapshot, repoDetail, propose, proposal, highlightsNow, momentumNow, earnedBy, groupOf, personDetail, bus, health, news, repoWeek, knownRepos, peopleEvents, projectsNow, personProfile, peopleIn, latestUpdates } from './pulse.mjs'
import { trends, repoRows, arrivals, rhythm } from './history.mjs'
import { repoBadge, personBadge, allBadge } from './badge.mjs'
import { earnedEmblem } from './emblem.mjs'
import { initVisits, hit, visits, count, mcpUse } from './visits.mjs'
import { loadDigests, startDigest, digestPage, feedXml, weekByLabel, weekLeaders, keptWeeks, THEME_SCRIPT, LOOK_META } from './digest.mjs'
import { limits } from './github.mjs'
import { highlightsCard, repoCard, personCard, fiberCard, useCard, lessonCard, pageCard, words, rasterise } from './cards.mjs'
import { initPush, publicKey, subscribe, unsubscribe, notifyEvent, notifyNews } from './push.mjs'
import { startFiber, fiberState, fiberBus, fiberHealth } from './fiber.mjs'
import { FIBER_PAUSED } from './public/menu.js'
import { etag, notModified, shared } from './cache.mjs'
import { makeMcp, mcpHttp, TOOL_INFO } from './mcp.mjs'
import { usePage, llmsTxt } from './use.mjs'
import { methodPage } from './method.mjs'
import { supportPage } from './support.mjs'
import { forumPage, forumJson, forumNow, forumBrief, forumOf, forumFeed, loadForum, startForum } from './forum.mjs'
import { comparePage, compareJson, metricsOf, REPO } from './compare.mjs'
import { landingPage, lastLine } from './landing.mjs'
import { presentPage } from './present.mjs'
import { feedPage } from './feed.mjs'
import { MIGRATE_SCRIPT } from './migrate.mjs'
import { impactPage, impactNow, impactOf, loadImpact, startImpact, shownLibs, LIBS } from './impact.mjs'
import { lessonsPage, lessonPage, startPage, glossaryPage, reviewPage, lessonsFeed, withdrawnPage, notFoundPage, confirmedByOthers, lessonsApi, lessonsMcp, publicLessonTools, PUBLIC_LESSONS_NOTE, lessonsOf, checkChunks, CHECK_LIMIT, visible, access, cookieOf, loadLessons } from './lessons.mjs'
import { privacyPage } from './privacy.mjs'
import { withStamp } from './og.mjs'
import { withSeo } from './seo.mjs'
import { projectPage, projectsPage, projectPath, indexable } from './project.mjs'

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'public')
const PORT = +(process.env.PORT || 8080)
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json' }
const clients = new Set(), fiberClients = new Set()
// the address the digest, the feed and Telegram name; without it, the one the request came to
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/$/, '')
const baseOf = (req) => PUBLIC_URL || `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host || 'localhost'}`
// ?lang= (any case, pt-PT counts as pt); without it, and only for pages a person opens (req given), the browser's own
// language; a link-preview robot sends none and gets English
const pick = (s) => { const l = String(s || '').toLowerCase().slice(0, 2); return LANGS.includes(l) ? l : null }
const fromHeader = (h) => { for (const part of String(h || '').split(',')) { const l = pick(part.trim()); if (l) return l } return null }
const langOf = (q, req) => pick(q.get('lang')) || (req ? fromHeader(req.headers['accept-language']) : null) || 'en'
// a page that depends on the browser's language must say so to caches
const LANG_VARY = 'accept-language'
// the parameters that mean a link to something on the live view
const DEEP = ['repo', 'person', 'h', 'tab', 'about', 'screen', 'ui']
const ipOf = (req) => req.headers['x-real-ip'] || req.socket.remoteAddress || ''

// one id per set of page files: the page carries it in a meta tag and /version.json answers with the current one,
// so a page left open can tell that a new version went out (the same scheme as cellula.id)
function buildId(dir = ROOT) {
  const h = crypto.createHash('sha256')
  const walk = (dir) => {
    for (const n of fs.readdirSync(dir).sort()) {
      const f = path.join(dir, n)
      if (fs.statSync(f).isDirectory()) walk(f)
      else { h.update(path.relative(ROOT, f).replace(/\\/g, '/')); h.update(fs.readFileSync(f)) }
    }
  }
  walk(dir)
  return h.digest('hex').slice(0, 12)
}
const BUILD = buildId()
// three.js and d3 are served under the hash of their folder (/vendor/<VENDOR>/...): a browser keeps them a year, and a
// new copy of the folder has a new address
const VENDOR = buildId(path.join(ROOT, 'vendor'))
const INDEX = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace('__BUILD__', BUILD).replaceAll('__VENDOR__', VENDOR).replace('<!--migrate-->', MIGRATE_SCRIPT).replace('<!--look-->', LOOK_META).replace('<!--theme-->', THEME_SCRIPT)
const FIBER = fs.readFileSync(path.join(ROOT, 'fiber.html'), 'utf8').replace('__BUILD__', BUILD).replaceAll('__VENDOR__', VENDOR)

// share cards: pictures drawn on demand, kept ten minutes per address
const LANGS = ['en', 'pt', 'zh'], PERIODS = ['day', 'week', 'month']
const short = (name) => String(name || '').split('/').pop()
const attr = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const cards = new Map()
async function card(key, make) {
  const hit = cards.get(key)
  if (hit && Date.now() - hit.at < 600e3) return hit.png
  const png = await make()
  if (cards.size > 300) cards.delete(cards.keys().next().value)
  cards.set(key, { png, at: Date.now() })
  return png
}
// what the /use card draws: the tools, how many projects Pulse follows, the last 30 days
const useFacts = () => ({ tools: TOOL_INFO.map((x) => x.name), repos: knownRepos().length, month: highlightsNow().month.stats })
// preview tags for a page whose picture is drawn here (/fiber, /use)
const previewTags = ({ title, desc, img, url }) => [['og:type', 'website'], ['og:site_name', 'CKB Pulse'], ['og:title', title], ['og:description', desc], ['og:image', img], ['og:image:width', '1200'], ['og:image:height', '630'], ['og:url', url]]
  .map(([k, v]) => `<meta property="${k}" content="${attr(v)}">`).join('\n') + `\n<meta name="twitter:card" content="summary_large_image">\n<meta name="twitter:title" content="${attr(title)}">\n<meta name="twitter:description" content="${attr(desc)}">\n<meta name="twitter:image" content="${attr(img)}">`
// the page, with link-preview tags for what is shared: a period's highlights, a project or a person
function page(req, url) {
  const q = url.searchParams, base = baseOf(req)
  const lang = langOf(q), t = words(lang)
  const d = q.get('repo') ? repoDetail(q.get('repo')) : null
  const p = !d && q.get('person') ? personDetail(q.get('person')) : null
  let title, desc, img
  if (d) { title = t('og.repo', { name: short(d.name) }); desc = d.desc || t('d.noDesc'); img = withStamp(`/og/repo.png?name=${encodeURIComponent(d.name)}`, d) }
  else if (p) { title = t('og.person', { login: p.login }); desc = t('p.sum', { updates: t.cnt('upd', p.updates), projects: t.cnt('prj', p.projects.length) }); img = withStamp(`/og/person.png?login=${encodeURIComponent(p.login)}`, p) }
  else {
    const h = PERIODS.includes(q.get('h')) ? q.get('h') : 'week', s = highlightsNow()[h].stats
    title = `CKB Pulse · ${t('mode.' + h)}`
    desc = t('og.desc', { updates: t.cnt('upd', s.updates), people: t.cnt('ppl', s.people), projects: t.cnt('prj', s.projects), when: t('when.' + h) })
    img = withStamp(`/og/highlights.png?p=${h}`, highlightsNow()[h])
  }
  img = `${base}${img}&lang=${lang}`
  const tags = [['og:type', 'website'], ['og:site_name', 'CKB Pulse'], ['og:title', title], ['og:description', desc], ['og:image', img], ['og:image:width', '1200'], ['og:image:height', '630'], ['og:url', base + url.pathname + url.search]]
    .map(([k, v]) => `<meta property="${k}" content="${attr(v)}">`).join('\n') +
    `\n<meta name="twitter:card" content="summary_large_image">\n<meta name="twitter:title" content="${attr(title)}">\n<meta name="twitter:description" content="${attr(desc)}">\n<meta name="twitter:image" content="${attr(img)}">`
  return INDEX.replace('<!--og-->', tags)
}
async function shareCard(req, res, url) {
  const q = url.searchParams, lang = pick(q.get('lang')) || 'en', host = req.headers.host || 'localhost'
  let png = null
  { const t = url.pathname.match(/^\/og\/(highlights|repo|person|fiber|use|digest|lesson)\.png$/); if (t) count('card_' + t[1], req.headers['user-agent']) }
  if (url.pathname === '/og/highlights.png') { const p = PERIODS.includes(q.get('p')) ? q.get('p') : 'week'; png = await card(`h|${p}|${lang}|${host}|${q.get('v') || ''}`, () => highlightsCard({ leaders: highlightsNow(), period: p, lang, host, groupOf })) }
  if (url.pathname === '/og/digest.png') { const w = weekByLabel(q.get('w') || ''); if (w) png = await card(`dg|${q.get('w')}|${lang}|${host}`, () => highlightsCard({ leaders: weekLeaders(w), period: 'week', lang, host, groupOf })) }
  if (url.pathname === '/og/repo.png') { const d = repoDetail(q.get('name') || ''); if (d) png = await card(`r|${d.name}|${lang}|${host}|${q.get('v') || ''}`, () => repoCard({ d, leaders: highlightsNow(), lang, host })) }
  if (url.pathname === '/og/person.png') { const p = personDetail(q.get('login') || ''); if (p) png = await card(`p|${p.login}|${lang}|${host}|${q.get('v') || ''}`, () => personCard({ p, leaders: highlightsNow(), lang, host })) }
  if (url.pathname === '/og/fiber.png' && !FIBER_PAUSED) { const d = fiberState(q.get('net') === 'testnet' ? 'testnet' : 'mainnet'); if (d) png = await card(`fb|${d.net}|${lang}|${host}|${q.get('v') || ''}`, () => fiberCard({ d, lang, host })) }
  if (url.pathname === '/og/learned.png') {
    const data = loadLessons(DATA_DIR, 'public-lessons.json'), t = words(lang)
    if (data?.version === 1 && Array.isArray(data.lessons) && data.lessons.length) {
      const v = visible(data), projects = new Set(v.lessons.flatMap((l) => l.sources.map((s) => s.repo))).size, confirmed = v.lessons.filter(confirmedByOthers).length
      png = await card(`ll|${v.lessons.length}|${projects}|${confirmed}|${lang}|${host}`, () => pageCard({ eyebrow: 'CKB LESSONS · CC BY 4.0', title: t('ls.h1'), numbers: [[v.lessons.length, t('og.lessons')], [projects, t('k.projects')], ...(confirmed ? [[confirmed, t('og.confirmed')]] : [])], line: t('og.lessons.line'), lang, host }))
    }
  }
  if (url.pathname === '/og/impact.png') {
    const t = words(lang), lib = LIBS.some((l) => l.id === q.get('lib')) ? q.get('lib') : LIBS[0].id, r = impactOf(impactNow(), lib)
    if (r) png = await card(`im|${lib}|${r.using}|${r.active}|${r.owners}|${lang}|${host}`, () => pageCard({ eyebrow: t('im.nav').toUpperCase(), title: t('im.h1', { lib: r.name }), numbers: [[r.using, t('im.k.using')], [r.active, t('og.active')], [r.owners, t('og.owners')]], line: '', lang, host }))
  }
  if (url.pathname === '/og/use.png') png = await card(`u|${lang}|${host}|${q.get('v') || ''}`, () => useCard({ ...useFacts(), lang, host }))
  if (url.pathname === '/og/lesson.png') { const data = loadLessons(DATA_DIR, 'public-lessons.json'), l = data?.version === 1 && Array.isArray(data.lessons) ? data.lessons.find((x) => x.id === q.get('id')) : null; if (l) png = await card(`l|${l.id}|${lang}|${host}|${q.get('v') || ''}`, () => lessonCard({ l, lang, host })) }
  if (!png) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('not found') }
  res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=600' })
  res.end(png)
}

// text compressed for browsers that take it: brotli, else gzip. The page's files only change with a deploy, so each
// one is compressed once and kept (measured 2026-10-10: 430 kB went out uncompressed on a first visit)
const ENC = (req) => { const ae = req.headers['accept-encoding'] || ''; return /\bbr\b/.test(ae) ? 'br' : /\bgzip\b/.test(ae) ? 'gzip' : '' }
const squeeze = (buf, enc) => enc === 'br' ? zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9 } }) : zlib.gzipSync(buf, { level: 9 })
// per file: its tag and its compressed copies, made once. Every text body goes out with a tag, and a browser that
// already holds that version gets a 304 with no body
const packed = new Map()
function sendText(req, res, status, headers, body, key) {
  // a page that may be indexed gets its canonical address and its other languages (seo.mjs)
  if (status === 200 && !key && typeof body === 'string' && /^text\/html/.test(headers['content-type'] || '') && !/noindex/.test(headers['x-robots-tag'] || '')) {
    const u = new URL(req.url, 'http://x')
    body = withSeo(body, { base: baseOf(req), pathname: u.pathname, query: u.searchParams })
  }
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body)
  let e = key && packed.get(key)
  if (!e) { e = { tag: etag(buf) }; if (key) packed.set(key, e) }
  sendEntry(req, res, status, headers, buf, e)
}
function sendEntry(req, res, status, headers, buf, e) {
  const { vary, ...rest } = headers
  const h = { ...rest, etag: e.tag, vary: vary ? `accept-encoding, ${vary}` : 'accept-encoding' }
  if (status === 200 && notModified(req, e.tag)) { res.writeHead(304, h); return res.end() }
  const enc = ENC(req)
  if (!enc || buf.length < 1024) { res.writeHead(status, h); return res.end(buf) }
  e[enc] ||= squeeze(buf, enc)
  res.writeHead(status, { ...h, 'content-encoding': enc })
  res.end(e[enc])
}
// JSON, gzipped when the browser accepts it (the state with 7 days of history is a few hundred kB raw)
function sendJson(req, res, obj) {
  const body = Buffer.from(JSON.stringify(obj))
  const gz = /gzip/.test(req.headers['accept-encoding'] || '')
  res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store', ...(gz ? { 'content-encoding': 'gzip', vary: 'accept-encoding' } : {}) })
  res.end(gz ? zlib.gzipSync(body) : body)
}

// the state is the same for everyone: built at most once a minute, and again as soon as something new comes in, so a
// page never starts from a state older than the live stream it then joins
const stateNow = shared(() => JSON.stringify(snapshot()), 60e3)
bus.on('event', () => stateNow.drop()); bus.on('news', () => stateNow.drop())
bus.on('event', (e) => { const msg = `data: ${JSON.stringify(e)}\n\n`; for (const c of clients) c.write(msg); notifyEvent(e) })
// a new project goes to every open page as its own kind of message, and to the browsers that asked for new projects
bus.on('news', (n) => { const msg = `event: news\ndata: ${JSON.stringify(n)}\n\n`; for (const c of clients) c.write(msg); notifyNews(n) })
// Fiber: the map's changes and every channel opened or closed on chain, to the open Fiber pages
fiberBus.on('event', (e) => { const msg = `data: ${JSON.stringify(e)}\n\n`; for (const c of fiberClients) c.write(msg) })
const DATA_DIR = process.env.DATA_DIR || path.join(path.dirname(ROOT), 'data')
initPush(DATA_DIR)
initVisits(DATA_DIR)
loadDigests(DATA_DIR)
loadImpact(DATA_DIR)
loadForum(DATA_DIR)
// PULSE_OFFLINE=1 serves what is on disk and polls nothing (the HTTP tests)
const OFFLINE = process.env.PULSE_OFFLINE === '1'
if (!OFFLINE) startDigest({ leaders: highlightsNow, news, groupOf, publicUrl: PUBLIC_URL, forum: () => forumBrief(forumNow()) })
if (!OFFLINE) startImpact({ repos: () => snapshot().repos, dir: DATA_DIR })
if (!OFFLINE) startForum({ dir: DATA_DIR, known: knownRepos })
// the app icon, drawn once: four cells, two lit
const ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="#121212"/><rect x="1.5" y="1.5" width="6.2" height="6.2" fill="#F4F1EB"/><rect x="8.3" y="1.5" width="6.2" height="6.2" fill="#5a5a56"/><rect x="1.5" y="8.3" width="6.2" height="6.2" fill="#5a5a56"/><rect x="8.3" y="8.3" width="6.2" height="6.2" fill="#E10600"/></svg>'
const icons = {}
const icon = (size) => icons[size] || (icons[size] = rasterise(ICON_SVG.replace('viewBox', `width="${size}" height="${size}" viewBox`), size))
const checkRate = new Map() // address -> {t: start of its minute, n: calls in it}
function readJson(req, max, done) {
  let body = ''
  req.on('data', (c) => { body += c; if (body.length > max) req.destroy() })
  req.on('end', () => { let j = null; try { j = JSON.parse(body) } catch {} done(j) })
}
setInterval(() => { for (const c of [...clients, ...fiberClients]) c.write(': ping\n\n') }, 25e3).unref()
// the same data for AI agents, as MCP tools (mcp.mjs)
const lessonsMcpHandle = lessonsMcp(() => loadLessons(DATA_DIR))
// what the landing page draws of the forum and of the lessons: the technical topics of the week, and how many lessons are public
const forumTech = () => { const d = forumNow(); return d?.stats?.tech ? { topics: d.stats.tech.topics, fresh: d.stats.tech.fresh, people: d.stats.tech.people } : null }
const publicLessonCount = () => { const data = loadLessons(DATA_DIR, 'public-lessons.json'); return data?.version === 1 && Array.isArray(data.lessons) && data.lessons.length ? visible(data).lessons.length : 0 }
// one project as the compare page and its API need it: the card's detail and the forum topics that link it
const detailFor = (name) => { const d = repoDetail(name); return d ? { d, forum: forumOf(forumNow(), d.name) } : null }
const compare = (x, y) => { const a = detailFor(x), b = detailFor(y); return a && b ? compareJson(metricsOf(a.d, { forum: a.forum }), metricsOf(b.d, { forum: b.forum })) : null }
const mcp = makeMcp({ highlights: highlightsNow, news, projects: projectsNow, project: repoDetail, person: personProfile, peopleIn, updates: latestUpdates, trends: () => trends(knownRepos()), arrivals, marks: personMarks, compare, forum: (g) => { const d = forumNow(); return d ? forumJson(d, g) : null } },
  { extra: publicLessonTools(() => loadLessons(DATA_DIR, 'public-lessons.json')), note: PUBLIC_LESSONS_NOTE })

// the projects the sitemap lists: reading every project's detail takes most of a second (measured 2026-11-26 on the
// stored data, 404 projects), so the list is made at most once an hour
let indexedAt = 0, indexedList = []
const indexedProjects = (now = Date.now()) => {
  if (now - indexedAt > 3600e3 || !indexedList.length) { indexedList = projectsNow().map((r) => ({ r, d: repoDetail(r.name) })).filter(({ d }) => d && indexable(d)).map(({ r, d }) => ({ r: { lastAt: r.lastAt }, d: { name: d.name } })); indexedAt = now }
  return indexedList
}

function handle(req, res) {
  let url
  try { url = new URL(req.url, 'http://x') } catch { res.writeHead(400, { 'content-type': 'text/plain' }); return res.end('bad request') }
  if (req.method === 'GET' && url.pathname.startsWith('/api/')) res.setHeader('access-control-allow-origin', '*') // public data, readable from any website
  // liveness stays 200; collector.ok turns false when no organisation feed has answered for 10 minutes, and the VPS
  // watcher (sentinela, SONDA_pulse-*) mails when it does
  if (url.pathname === '/health') {
    const now = Date.now(), stale = now - (health.lastPollOk || health.startedAt) > 10 * 60e3
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    return res.end(JSON.stringify({ ok: true, collector: { ok: !stale, lastPollAt: health.lastPollOk ? new Date(health.lastPollOk).toISOString() : null, lastEventAt: health.lastEventAt ? new Date(health.lastEventAt).toISOString() : null }, rate: { core: limits.core, search: limits.search }, fiber: fiberHealth(), visits: visits(1).days[0], build: BUILD }))
  }
  // / without a link to something is the landing, once for a browser (landing.mjs sends the ones that have been here on);
  // a link to a project, a person, a period, a tab, the welcome card, the screen for calls or a layout trial goes to the
  // live view, which is also at /live
  // the screen for calls moved to its own page: the old address (a link someone kept, a bookmark) goes there
  if (url.pathname === '/' && url.searchParams.get('screen') === '1') { res.writeHead(302, { location: `/present?lang=${langOf(url.searchParams, req)}`, 'cache-control': 'no-store' }); return res.end() }
  if (url.pathname === '/present') {
    hit('present', ipOf(req), req.headers['user-agent'])
    return sendText(req, res, 200, { 'content-type': TYPES['.html'], 'cache-control': 'public, max-age=300', 'x-robots-tag': 'noindex', vary: LANG_VARY }, presentPage({ lang: langOf(url.searchParams, req), base: baseOf(req), url: `${baseOf(req)}/present` }))
  }
  if (url.pathname === '/' && !DEEP.some((k) => url.searchParams.has(k))) {
    hit('landing', ipOf(req), req.headers['user-agent'])
    const lang = langOf(url.searchParams, req), b = baseOf(req), hl = highlightsNow(), day = hl.day
    return sendText(req, res, 200, { 'content-type': TYPES['.html'], 'cache-control': 'public, max-age=300', vary: LANG_VARY }, landingPage({ lang, base: b, url: `${b}/`, stats: day.stats, dayBars: day.bars, week: { bars: hl.week.bars, kinds: hl.week.stats.kinds }, forum: forumTech(), lessons: publicLessonCount(), last: latestUpdates({ limit: 1 })[0] || null, img: `${b}${withStamp(`/og/highlights.png?p=day`, day)}&lang=${lang}` }))
  }
  if (url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/live') { hit('pulse', ipOf(req), req.headers['user-agent']); return sendText(req, res, 200, { 'content-type': TYPES['.html'], 'cache-control': 'no-cache' }, page(req, url)) }
  // the Fiber map is paused: its address goes to the live page for now, its API and stream answer 503 (menu.js, FIBER_PAUSED)
  if (FIBER_PAUSED && (url.pathname === '/fiber' || url.pathname === '/fiber.html')) {
    const l = pick(url.searchParams.get('lang'))
    res.writeHead(302, { location: l ? `/live?lang=${l}` : '/live', 'cache-control': 'no-store' })
    return res.end()
  }
  if (FIBER_PAUSED && url.pathname.startsWith('/api/fiber')) { res.writeHead(503, { 'content-type': 'application/json', 'cache-control': 'no-store' }); return res.end('{"status":"paused"}') }
  if (url.pathname === '/fiber' || url.pathname === '/fiber.html') { hit('fiber', ipOf(req), req.headers['user-agent']); const net = url.searchParams.get('net') === 'testnet' ? 'testnet' : 'mainnet', d = fiberState(net), lang = langOf(url.searchParams), t = words(lang), base = baseOf(req); const tags = previewTags({ title: `${t('fb.title')} · ${t('fb.' + net)}`, desc: t('fb.tagline'), img: withStamp(`${base}/og/fiber.png?net=${net}&lang=${lang}`, d && [d.nodes.length, d.channels.length, d.chain, d.block]), url: `${base}/fiber?net=${net}` }); return sendText(req, res, 200, { 'content-type': TYPES['.html'], 'cache-control': 'no-cache' }, FIBER.replace('<!--og-->', tags)) }
  // the digest as a page and as a feed; badges for READMEs. GitHub's image proxy keeps a badge for its max-age
  // a kept week, at an address that never changes
  const dw = url.pathname.match(/^\/digest\/(\d{4}-(?:W\d{2}|\d{2}-\d{2}))$/)
  if (dw) {
    const w = weekByLabel(dw[1])
    if (!w) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('not found') }
    hit('digest', ipOf(req), req.headers['user-agent'])
    return sendText(req, res, 200, { 'content-type': TYPES['.html'], 'cache-control': 'public, max-age=3600', vary: LANG_VARY }, digestPage({ period: 'week', lang: langOf(url.searchParams, req), kept: keptWeeks(), leaders: weekLeaders(w), news: w.news.map((n) => ({ ...n, createdAt: new Date(w.at).toISOString() })), trends: null, groupOf, base: baseOf(req), url: `${baseOf(req)}/digest`, fixed: { label: dw[1], at: w.at }, forum: w.forum }))
  }
  if (url.pathname === '/digest') {
    hit('digest', ipOf(req), req.headers['user-agent'])
    const q = url.searchParams, period = PERIODS.includes(q.get('p')) ? q.get('p') : 'week', lang = langOf(q, req)
    return sendText(req, res, 200, { 'content-type': TYPES['.html'], 'cache-control': 'public, max-age=300', vary: LANG_VARY }, digestPage({ period, lang, kept: keptWeeks(), leaders: highlightsNow(), news: news(), trends: trends(knownRepos()), rhythm: rhythm(), mo: period === 'week' ? momentumNow() : null, arrivals: period === 'month' ? arrivals(30) : [], groupOf, base: baseOf(req), url: `${baseOf(req)}/digest`, forum: forumBrief(forumNow()) }))
  }
  // what a search engine may read, and every page worth finding: the pages, the lessons, nothing private
  if (url.pathname === '/robots.txt') {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' })
    return res.end(`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /lessons\nDisallow: /present\n\nSitemap: ${baseOf(req)}/sitemap.xml\n`)
  }
  if (url.pathname === '/sitemap.xml') {
    const b = baseOf(req), data = loadLessons(DATA_DIR, 'public-lessons.json'), many = data?.version === 1 && Array.isArray(data.lessons) && data.lessons.length ? visible(data).lessons : []
    const pages = ['/', '/live', '/digest?p=week', '/forum', '/forum.xml', '/impact', '/projects', '/use', '/method', '/support', '/privacy', ...(many.length ? ['/learned', '/learned/start', '/learned/glossary', '/learned/review'] : [])]
    const loc = (p, at) => `<url><loc>${(b + p).replace(/&/g, '&amp;')}</loc>${at ? `<lastmod>${at}</lastmod>` : ''}</url>`
    // the projects worth indexing (project.mjs), with the day of their last work by people
    const projects = indexedProjects()
    res.writeHead(200, { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' })
    return res.end(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map((p) => loc(p)).join('\n')}\n${projects.map(({ r, d }) => loc(projectPath(d.name), r.lastAt ? r.lastAt.slice(0, 10) : '')).join('\n')}\n${many.map((l) => loc(`/learned/${l.id}`, /^\d{4}-\d{2}-\d{2}$/.test(String(l.last_touched)) ? l.last_touched : '')).join('\n')}\n</urlset>\n`)
  }
  // everything Pulse does, for people and for AI agents
  if (url.pathname === '/use') {
    hit('use', ipOf(req), req.headers['user-agent'])
    return sendText(req, res, 200, { 'content-type': TYPES['.html'], 'cache-control': 'public, max-age=300', vary: LANG_VARY }, usePage({ lang: langOf(url.searchParams, req), base: baseOf(req), url: `${baseOf(req)}/use`, img: withStamp(`${baseOf(req)}/og/use.png?lang=${langOf(url.searchParams, req)}`, useFacts()) }))
  }
  // a private page: it opens only with the key (LESSONS_KEY) and reads its data from the data volume (lessons.json);
  // in every other case it falls through to the answer for a route that does not exist
  // the released lessons, in the open: the ones a person set public_ok on in the private repository, as pages and as one JSON file
  // (DATA_DIR/public-lessons.json, handed in by that repository's publish job). With no released lesson, or no file, these routes
  // do not exist; the private lessons below are untouched and never read here.
  if (url.pathname === '/learned' || url.pathname.startsWith('/learned/') || url.pathname === '/learned.json' || url.pathname === '/learned.xml') {
    const data = loadLessons(DATA_DIR, 'public-lessons.json')
    if (data?.version === 1 && Array.isArray(data.lessons) && data.lessons.length) {
      const b = baseOf(req), lang = langOf(url.searchParams, req), pub = { 'cache-control': 'public, max-age=300', vary: LANG_VARY }
      hit('learned', ipOf(req), req.headers['user-agent']) // how many read it, no one in it
      if (url.pathname === '/learned.xml') { res.writeHead(200, { 'content-type': 'application/atom+xml; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=300' }); return res.end(lessonsFeed({ base: b, data })) }
      if (url.pathname === '/learned/glossary') return sendText(req, res, 200, { 'content-type': TYPES['.html'], ...pub }, glossaryPage({ lang, base: b, url: `${b}/learned/glossary`, data, pub: true }))
      if (url.pathname === '/learned/review') return sendText(req, res, 200, { 'content-type': TYPES['.html'], ...pub }, reviewPage({ lang, base: b, url: `${b}/learned/review`, data, pub: true }))
      if (url.pathname === '/learned/start') return sendText(req, res, 200, { 'content-type': TYPES['.html'], ...pub }, startPage({ lang, base: b, url: `${b}/learned/start`, data, pub: true }))
      if (url.pathname === '/learned.json') { res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=300' }); return res.end(JSON.stringify(data)) }
      if (url.pathname === '/learned') return sendText(req, res, 200, { 'content-type': TYPES['.html'], ...pub }, lessonsPage({ lang, base: b, url: `${b}/learned`, data, q: (url.searchParams.get('q') || '').slice(0, 200), area: (url.searchParams.get('area') || '').slice(0, 40), concept: (url.searchParams.get('concept') || '').slice(0, 80), level: (url.searchParams.get('level') || '').slice(0, 10), evidence: (url.searchParams.get('evidence') || '').slice(0, 4), sort: (url.searchParams.get('sort') || '').slice(0, 5), repo: (url.searchParams.get('repo') || '').slice(0, 201), page: (url.searchParams.get('page') || '').slice(0, 4), pub: true }))
      const lid = url.pathname.slice('/learned/'.length)
      const page = lessonPage({ lang, base: b, url: `${b}${url.pathname}`, data, id: lid, pub: true })
      if (page) hit(`learned:${lid}`, ipOf(req), req.headers['user-agent']) // reads of this lesson: a count, no one in it
      if (page) return sendText(req, res, 200, { 'content-type': TYPES['.html'], ...pub }, page)
      const gone = (data.withdrawn || []).find((w) => `/learned/${w.id}` === url.pathname) // it was public once: say so
      if (gone) return sendText(req, res, 410, { 'content-type': TYPES['.html'], ...pub }, withdrawnPage({ lang, base: b, url: `${b}${url.pathname}`, date: gone.date }))
    }
  }
  // the lessons: pages, JSON and MCP, all behind the key; without it, or without the file, they are routes that do not exist
  if (url.pathname === '/lessons' || url.pathname.startsWith('/lessons/')) {
    const key = process.env.LESSONS_KEY, how = key && access(req, url, key), data = how && loadLessons(DATA_DIR)
    if (data) {
      const b = baseOf(req), lang = langOf(url.searchParams, req), api = url.pathname === '/lessons/api' || url.pathname === '/lessons/mcp'
      if (how === 'key' && !api && req.method === 'GET') { // the key leaves the address and becomes a cookie
        const clean = new URLSearchParams(url.searchParams)
        clean.delete('k')
        res.writeHead(303, { location: `${url.pathname}${clean.size ? `?${clean}` : ''}`, 'set-cookie': `lessons=${cookieOf(key)}; Path=/lessons; Max-Age=2592000; HttpOnly; Secure; SameSite=Strict`, 'cache-control': 'no-store' })
        return res.end()
      }
      const priv = { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex', vary: 'cookie, authorization, accept-language' }
      if (url.pathname === '/lessons/mcp') return mcpHttp(req, res, lessonsMcpHandle, b, '/lessons')
      if (url.pathname === '/lessons/api') { const r = lessonsApi(data, url, b); res.writeHead(r.status, { 'content-type': 'application/json', ...priv }); return res.end(JSON.stringify(r.json)) }
      if (url.pathname === '/lessons/glossary') return sendText(req, res, 200, { 'content-type': TYPES['.html'], ...priv }, glossaryPage({ lang, base: b, url: `${b}/lessons/glossary`, data }))
      if (url.pathname === '/lessons/review') return sendText(req, res, 200, { 'content-type': TYPES['.html'], ...priv }, reviewPage({ lang, base: b, url: `${b}/lessons/review`, data }))
      if (url.pathname === '/lessons/start') return sendText(req, res, 200, { 'content-type': TYPES['.html'], ...priv }, startPage({ lang, base: b, url: `${b}/lessons/start`, data }))
      if (url.pathname === '/lessons') return sendText(req, res, 200, { 'content-type': TYPES['.html'], ...priv }, lessonsPage({ lang, base: b, url: `${b}/lessons`, data, q: (url.searchParams.get('q') || '').slice(0, 200), area: (url.searchParams.get('area') || '').slice(0, 40), concept: (url.searchParams.get('concept') || '').slice(0, 80), level: (url.searchParams.get('level') || '').slice(0, 10), evidence: (url.searchParams.get('evidence') || '').slice(0, 4), sort: (url.searchParams.get('sort') || '').slice(0, 5), page: (url.searchParams.get('page') || '').slice(0, 4) }))
      const page = lessonPage({ lang, base: b, url: `${b}${url.pathname}`, data, id: url.pathname.slice('/lessons/'.length) })
      if (page) return sendText(req, res, 200, { 'content-type': TYPES['.html'], ...priv }, page)
    }
  }

  // a page per followed project, and the list of them all (project.mjs); an unknown project falls through to the 404
  if (url.pathname === '/projects') {
    hit('projects', ipOf(req), req.headers['user-agent'])
    return sendText(req, res, 200, { 'content-type': TYPES['.html'], 'cache-control': 'public, max-age=300', vary: LANG_VARY }, projectsPage({ lang: langOf(url.searchParams, req), base: baseOf(req), rows: projectsNow() }))
  }
  const pj = url.pathname.match(/^\/project\/([^/]+)\/([^/]+)$/)
  if (pj) {
    let name = ''
    try { name = `${decodeURIComponent(pj[1])}/${decodeURIComponent(pj[2])}` } catch {}
    const d = REPO.test(name) ? repoDetail(name) : null
    if (d) {
      // GitHub's spelling is the one address: another case goes there
      if (d.name !== name) { res.writeHead(301, { location: `${projectPath(d.name)}${url.search}`, 'cache-control': 'public, max-age=3600' }); return res.end() }
      hit('project', ipOf(req), req.headers['user-agent'])
      const lang = langOf(url.searchParams, req), b = baseOf(req), lessons = lessonsOf(loadLessons(DATA_DIR, 'public-lessons.json'), d.name)
      return sendText(req, res, 200, { 'content-type': TYPES['.html'], 'cache-control': 'public, max-age=300', vary: LANG_VARY }, projectPage({ lang, base: b, d, forum: forumOf(forumNow(), d.name), lessons, img: `${b}${withStamp(`/og/repo.png?name=${encodeURIComponent(d.name)}`, d)}&lang=${lang}` }))
    }
  }
  // which of the projects Pulse follows depend on a CKB library: a page for the people who maintain it, and the same as JSON
  if (url.pathname === '/impact') {
    hit('impact', ipOf(req), req.headers['user-agent'])
    const lib = LIBS.some((l) => l.id === url.searchParams.get('lib')) ? url.searchParams.get('lib') : LIBS[0].id
    return sendText(req, res, 200, { 'content-type': TYPES['.html'], 'cache-control': 'public, max-age=300', vary: LANG_VARY }, impactPage({ lang: langOf(url.searchParams, req), base: baseOf(req), url: `${baseOf(req)}/impact`, lib, data: impactNow() }))
  }
  if (url.pathname === '/api/impact') {
    const lib = LIBS.some((l) => l.id === url.searchParams.get('lib')) ? url.searchParams.get('lib') : LIBS[0].id, r = impactOf(impactNow(), lib)
    res.writeHead(r ? 200 : 503, { 'content-type': 'application/json', 'cache-control': 'public, max-age=300' })
    return res.end(JSON.stringify(r ? { ...r, libs: shownLibs(impactNow()).map((l) => ({ id: l.id, name: l.name })) } : { status: 'counting' })) // libs: the libraries listed now, most active first
  }
  // what is counted and what is not
  if (url.pathname === '/forum') {
    hit('forum', ipOf(req), req.headers['user-agent'])
    return sendText(req, res, 200, { 'content-type': TYPES['.html'], 'cache-control': 'public, max-age=300', vary: LANG_VARY }, forumPage({ lang: langOf(url.searchParams, req), base: baseOf(req), url: `${baseOf(req)}/forum`, data: forumNow(), group: url.searchParams.get('c') }))
  }
  if (url.pathname === '/compare') {
    hit('compare', ipOf(req), req.headers['user-agent'])
    return sendText(req, res, 200, { 'content-type': TYPES['.html'], 'cache-control': 'public, max-age=300', vary: LANG_VARY }, comparePage({ lang: langOf(url.searchParams, req), base: baseOf(req), url: `${baseOf(req)}/compare`, a: url.searchParams.get('a') || '', b: url.searchParams.get('b') || '', detail: detailFor, names: knownRepos() }))
  }
  if (url.pathname === '/api/compare') {
    const a = url.searchParams.get('a') || '', b = url.searchParams.get('b') || ''
    if (!REPO.test(a) || !REPO.test(b) || a.toLowerCase() === b.toLowerCase()) { res.writeHead(400, { 'content-type': 'application/json' }); return res.end('{"error":"give two different projects as owner/repo in a and b"}') }
    const r = compare(a, b)
    if (!r) { res.writeHead(404, { 'content-type': 'application/json' }); return res.end('{"error":"not followed"}') }
    return sendJson(req, res, r)
  }
  if (url.pathname === '/forum.xml') {
    hit('forum', ipOf(req), req.headers['user-agent'])
    return sendText(req, res, 200, { 'content-type': 'application/atom+xml; charset=utf-8', 'cache-control': 'public, max-age=900' }, forumFeed({ lang: langOf(url.searchParams), base: baseOf(req), data: forumNow(), group: url.searchParams.get('c') }))
  }
  if (url.pathname === '/api/forum') { const d = forumNow(); if (!d) { res.writeHead(503, { 'content-type': 'application/json', 'cache-control': 'no-store' }); return res.end('{"status":"reading"}') } return sendJson(req, res, forumJson(d, url.searchParams.get('c'))) }
  if (url.pathname === '/method') {
    hit('method', ipOf(req), req.headers['user-agent'])
    return sendText(req, res, 200, { 'content-type': TYPES['.html'], 'cache-control': 'public, max-age=300', vary: LANG_VARY }, methodPage({ lang: langOf(url.searchParams, req), base: baseOf(req), url: `${baseOf(req)}/method` }))
  }
  // what Pulse costs to run, and how to help: a page, no account
  if (url.pathname === '/support') {
    hit('support', ipOf(req), req.headers['user-agent'])
    return sendText(req, res, 200, { 'content-type': TYPES['.html'], 'cache-control': 'public, max-age=300', vary: LANG_VARY }, supportPage({ lang: langOf(url.searchParams, req), base: baseOf(req), url: `${baseOf(req)}/support` }))
  }
  // what is kept about visitors and about people on the page, and how to ask to leave
  if (url.pathname === '/privacy') {
    hit('privacy', ipOf(req), req.headers['user-agent'])
    return sendText(req, res, 200, { 'content-type': TYPES['.html'], 'cache-control': 'public, max-age=300', vary: LANG_VARY }, privacyPage({ lang: langOf(url.searchParams, req), base: baseOf(req), url: `${baseOf(req)}/privacy` }))
  }
  // the lessons for the lines a pull request changed, for the GitHub Action (LusoCryptoLabs/ckb-pulse-action):
  // POST {chunks: [{path, start, code}], limit?}. The code is read and dropped, never stored or logged. 30 calls a minute an address.
  // limit 1 to 20, three when absent (the Action v1.0.0 sends none).
  if (url.pathname === '/api/check' && req.method === 'POST') {
    const ip = ipOf(req), now = Date.now(), r = checkRate.get(ip)
    if (r && now - r.t < 60e3 && r.n >= 30) { res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '60' }); return res.end('{"error":"too many checks, wait a minute"}') }
    checkRate.set(ip, r && now - r.t < 60e3 ? { t: r.t, n: r.n + 1 } : { t: now, n: 1 })
    if (checkRate.size > 5000) checkRate.clear()
    return readJson(req, 262144, (j) => {
      const chunks = Array.isArray(j?.chunks) ? j.chunks.slice(0, 200).filter((c) => c && typeof c.code === 'string' && typeof c.path === 'string').map((c) => ({ path: c.path.slice(0, 300), start: Number.isInteger(c.start) ? c.start : 1, code: c.code.slice(0, 30000) })) : null
      if (!chunks) { res.writeHead(400, { 'content-type': 'application/json' }); return res.end('{"error":"send {chunks: [{path, start, code}]}"}') }
      const data = loadLessons(DATA_DIR, 'public-lessons.json'), b = baseOf(req)
      const lessons = data?.version === 1 && Array.isArray(data.lessons) ? checkChunks(visible(data).lessons, chunks, Number.isInteger(j.limit) ? Math.min(20, Math.max(1, j.limit)) : CHECK_LIMIT).map((x) => ({ ...x, url: `${b}/learned/${x.id}` })) : []
      count('api_check', req.headers['user-agent'])
      sendJson(req, res, { about: 'Lessons that apply to the changed lines. Hints to read, not proof: nothing is run, and the code is not stored.', count: lessons.length, lessons })
    })
  }
  // a share channel used or a button pressed, as a count and nothing else (a beacon: no answer needed)
  if (url.pathname === '/api/count' && req.method === 'POST') {
    return readJson(req, 512, (j) => { count(String(j?.name || ''), req.headers['user-agent']); res.writeHead(204, { 'cache-control': 'no-store' }); res.end() })
  }
  if (url.pathname === '/llms.txt') {
    hit('llms', ipOf(req), req.headers['user-agent'])
    return sendText(req, res, 200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' }, llmsTxt({ base: baseOf(req) }))
  }
  // a person who opens the feed address in a browser would see raw XML: they are sent to a page that explains it and gives
  // the link to copy; a feed reader (which asks for atom or rss, not for a page) gets the XML, and ?raw=1 asks for it too
  if (url.pathname === '/feed' ) {
    hit('feedpage', ipOf(req), req.headers['user-agent'])
    return sendText(req, res, 200, { 'content-type': TYPES['.html'], 'cache-control': 'public, max-age=300', vary: LANG_VARY }, feedPage({ lang: langOf(url.searchParams, req), base: baseOf(req), url: `${baseOf(req)}/feed`, news: news(), groupOf }))
  }
  if (url.pathname === '/feed.xml' && !url.searchParams.has('raw') && /text\/html/.test(req.headers.accept || '') && !/atom|rss/.test(req.headers.accept || '')) {
    res.writeHead(302, { location: `/feed?lang=${langOf(url.searchParams, req)}`, 'cache-control': 'no-store', vary: 'accept' })
    return res.end()
  }
  if (url.pathname === '/feed.xml') {
    hit('feed', ipOf(req), req.headers['user-agent'])
    return sendText(req, res, 200, { 'content-type': 'application/atom+xml; charset=utf-8', 'cache-control': 'public, max-age=900' }, feedXml({ lang: langOf(url.searchParams), news: news(), groupOf, base: baseOf(req) }))
  }
  if (url.pathname.startsWith('/badge/')) {
    const q = url.searchParams, lang = langOf(q)
    let svg = null
    if (url.pathname === '/badge/repo.svg') svg = repoBadge(repoWeek(q.get('name') || ''), lang)
    if (url.pathname === '/badge/person.svg') svg = personBadge(personDetail(q.get('login') || ''), lang, isAI(q.get('login') || ''))
    const em = url.pathname.match(/^\/badge\/earned\/([A-Za-z0-9-]{1,39})\/(since|months6|merged)\.svg$/)
    if (em) { const m = earnedBy(em[1]).find((x) => x.id === em[2]); if (m) svg = earnedEmblem(em[1], m, words(lang)) }
    if (url.pathname === '/badge/ckb.svg') svg = allBadge(highlightsNow().week.stats, lang)
    if (!svg) { res.writeHead(404); return res.end('not found') }
    hit('badge', ipOf(req), req.headers['user-agent'])
    return sendText(req, res, 200, { 'content-type': TYPES['.svg'], 'cache-control': 'public, max-age=600' }, svg)
  }
  if (url.pathname === '/api/visits') return sendJson(req, res, visits(30))
  if (url.pathname === '/mcp') { if (req.method === 'POST') hit('mcp', ipOf(req), req.headers['user-agent']); return mcpHttp(req, res, mcp, baseOf(req), '/use#ai', (method, tool) => mcpUse(method, tool, ipOf(req), req.headers['user-agent'])) }
  if (url.pathname === '/api/fiber') {
    const d = fiberState(url.searchParams.get('net') || 'mainnet')
    if (!d) { res.writeHead(404, { 'content-type': 'application/json' }); return res.end('{"error":"unknown network"}') }
    return sendJson(req, res, d)
  }
  if (url.pathname === '/api/fiber/stream') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' })
    res.write('retry: 5000\n\n')
    fiberClients.add(res)
    req.on('close', () => fiberClients.delete(res))
    return
  }
  // the tab icon: the svg (sharp at any size), the pngs, and the address browsers try on their own. Pages ask for them with
  // ?v=lcl1, since a browser keeps an icon for a long time and the first look's lime stayed in the tab (2026-11-18)
  if (url.pathname === '/icon.svg') { res.writeHead(200, { 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=86400' }); return res.end(ICON_SVG) }
  if (url.pathname === '/favicon.ico' || url.pathname === '/icon-32.png') { res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' }); return res.end(icon(32)) }
  if (url.pathname === '/icon-192.png' || url.pathname === '/icon-512.png') { res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' }); return res.end(icon(url.pathname.includes('512') ? 512 : 192)) }
  if (url.pathname === '/api/push/key') return sendJson(req, res, { key: publicKey() })
  if (url.pathname === '/api/push' && req.method === 'POST') return readJson(req, 16384, (j) => sendJson(req, res, subscribe(j)))
  if (url.pathname === '/api/push/off' && req.method === 'POST') return readJson(req, 4096, (j) => sendJson(req, res, unsubscribe(j)))
  if (url.pathname.startsWith('/og/')) { shareCard(req, res, url).catch((err) => { console.warn('card', err.message); if (!res.headersSent) res.writeHead(500); res.end() }); return }
  if (url.pathname === '/version.json') { res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); return res.end(JSON.stringify({ v: BUILD })) }
  // the last update, as the line the landing shows under its picture, in the page's language: the landing asks once a minute
  if (url.pathname === '/api/last') { const e = latestUpdates({ limit: 1 })[0] || null; return sendText(req, res, 200, { 'content-type': 'application/json', 'cache-control': 'public, max-age=30', vary: LANG_VARY }, JSON.stringify({ at: e?.at || null, line: lastLine(words(langOf(url.searchParams, req)), e) })) }
  if (url.pathname === '/api/state') { const e = stateNow.get(); return sendEntry(req, res, 200, { 'content-type': 'application/json', 'cache-control': 'no-cache' }, e.buf, e) }
  // dated facts about one person, for their card
  if (url.pathname === '/api/person') {
    const login = url.searchParams.get('login') || ''
    if (!/^[A-Za-z0-9-]{1,39}$/.test(login)) { res.writeHead(400, { 'content-type': 'application/json' }); return res.end('{"error":"bad login"}') }
    return sendJson(req, res, personMarks(login))
  }
  if (url.pathname === '/api/repo') {
    const d = repoDetail(url.searchParams.get('name') || '')
    if (!d) { res.writeHead(404, { 'content-type': 'application/json' }); return res.end('{"error":"not followed"}') }
    return sendJson(req, res, { ...d, forum: forumOf(forumNow(), d.name), lessons: lessonsOf(loadLessons(DATA_DIR, 'public-lessons.json'), d.name) }) // what CKB learned from it, with credit
  }
  // a suggested organisation or person: POST {"login"} starts a check, GET ?id= reads how it went
  if (url.pathname === '/api/propose' && req.method === 'POST') {
    let body = ''
    req.on('data', (c) => { body += c; if (body.length > 1024) req.destroy() })
    req.on('end', () => {
      let login = ''
      try { login = JSON.parse(body).login } catch {}
      const ip = req.headers['x-real-ip'] || req.socket.remoteAddress || ''
      sendJson(req, res, propose(login, ip))
    })
    return
  }
  if (url.pathname === '/api/propose') {
    const j = proposal(url.searchParams.get('id') || '')
    if (!j) { res.writeHead(404, { 'content-type': 'application/json' }); return res.end('{"status":"unknown"}') }
    return sendJson(req, res, j)
  }
  if (url.pathname === '/api/stream') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' })
    res.write('retry: 5000\n\n')
    clients.add(res)
    req.on('close', () => clients.delete(res))
    return
  }
  const vm = url.pathname.match(/^\/vendor\/([0-9a-f]{12})\/(.+)$/)
  const rel = vm ? `/vendor/${vm[2]}` : url.pathname
  let name
  try { name = decodeURIComponent(rel) } catch { res.writeHead(400, { 'content-type': 'text/plain' }); return res.end('bad request') }
  const f = path.join(ROOT, rel === '/' ? 'index.html' : name)
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    if (req.method === 'GET' && /text\/html/.test(req.headers.accept || '')) { // a person: a page with a way on; a program keeps the short answer
      const b = baseOf(req)
      return sendText(req, res, 404, { 'content-type': TYPES['.html'], 'cache-control': 'no-store', 'x-robots-tag': 'noindex', vary: LANG_VARY }, notFoundPage({ lang: langOf(url.searchParams, req), base: b, url: `${b}${url.pathname}`, data: loadLessons(DATA_DIR, 'public-lessons.json'), path: url.pathname }))
    }
    res.writeHead(404); return res.end('not found')
  }
  // the page's own files change together on every deploy: always ask again (a 304 when nothing changed). three.js and
  // d3 under the current hash never change; an old hash or the old unversioned address still answers
  const type = TYPES[path.extname(f)] || 'application/octet-stream'
  const cache = vm ? (vm[1] === VENDOR ? 'public, max-age=31536000, immutable' : 'no-cache') : rel.startsWith('/vendor/') ? 'public, max-age=86400' : 'no-cache'
  const headers = { 'content-type': type, 'cache-control': cache }
  if (/^(text\/|application\/(json|manifest\+json)|image\/svg)/.test(type)) return sendText(req, res, 200, headers, fs.readFileSync(f), f)
  res.writeHead(200, headers)
  fs.createReadStream(f).pipe(res)
}
// a request that throws gets a 500 and the process keeps running; anything that still escapes is logged, not fatal
const server = http.createServer((req, res) => {
  try { handle(req, res) } catch (err) {
    console.warn('request', req.method, String(req.url).slice(0, 200), err.message)
    if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain' })
    res.end('error')
  }
})
process.on('uncaughtException', (err) => console.warn('uncaught', err.stack || err.message))
process.on('unhandledRejection', (err) => console.warn('unhandled', err?.stack || err))
server.listen(PORT, () => console.log(`ckb-pulse on :${PORT}`))
if (!OFFLINE) { start(); if (!FIBER_PAUSED) startFiber(DATA_DIR) }
