// HTTP: the page, the current state, and a live stream of new events (Server-Sent Events).
//   GITHUB_TOKEN=... node server.mjs        (PORT, default 8080; DATA_DIR, default ./data)
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import crypto from 'node:crypto'
import { personMarks, isAI, start, snapshot, repoDetail, propose, proposal, highlightsNow, groupOf, personDetail, bus, health, news, repoWeek, knownRepos, peopleEvents, projectsNow, personProfile, peopleIn, latestUpdates } from './pulse.mjs'
import { trends, repoRows, arrivals, rhythm } from './history.mjs'
import { repoBadge, personBadge, allBadge } from './badge.mjs'
import { initVisits, hit, visits, count } from './visits.mjs'
import { loadDigests, startDigest, digestPage, feedXml, weekByLabel, weekLeaders } from './digest.mjs'
import { limits } from './github.mjs'
import { highlightsCard, repoCard, personCard, fiberCard, useCard, words, rasterise } from './cards.mjs'
import { initPush, publicKey, subscribe, unsubscribe, notifyEvent, notifyNews } from './push.mjs'
import { startFiber, fiberState, fiberBus, fiberHealth } from './fiber.mjs'
import { FIBER_PAUSED } from './public/menu.js'
import { etag, notModified, shared } from './cache.mjs'
import { makeMcp, mcpHttp, TOOL_INFO } from './mcp.mjs'
import { usePage, llmsTxt } from './use.mjs'
import { methodPage } from './method.mjs'
import { impactPage, impactNow, impactOf, loadImpact, startImpact, LIBS } from './impact.mjs'
import { lessonsPage, access, cookieOf, loadLessons } from './lessons.mjs'
import { privacyPage } from './privacy.mjs'
import { withStamp } from './og.mjs'

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
const INDEX = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace('__BUILD__', BUILD).replaceAll('__VENDOR__', VENDOR)
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
  { const t = url.pathname.match(/^\/og\/(highlights|repo|person|fiber|use|digest)\.png$/); if (t) count('card_' + t[1], req.headers['user-agent']) }
  if (url.pathname === '/og/highlights.png') { const p = PERIODS.includes(q.get('p')) ? q.get('p') : 'week'; png = await card(`h|${p}|${lang}|${host}|${q.get('v') || ''}`, () => highlightsCard({ leaders: highlightsNow(), period: p, lang, host, groupOf })) }
  if (url.pathname === '/og/digest.png') { const w = weekByLabel(q.get('w') || ''); if (w) png = await card(`dg|${q.get('w')}|${lang}|${host}`, () => highlightsCard({ leaders: weekLeaders(w), period: 'week', lang, host, groupOf })) }
  if (url.pathname === '/og/repo.png') { const d = repoDetail(q.get('name') || ''); if (d) png = await card(`r|${d.name}|${lang}|${host}|${q.get('v') || ''}`, () => repoCard({ d, leaders: highlightsNow(), lang, host })) }
  if (url.pathname === '/og/person.png') { const p = personDetail(q.get('login') || ''); if (p) png = await card(`p|${p.login}|${lang}|${host}|${q.get('v') || ''}`, () => personCard({ p, leaders: highlightsNow(), lang, host })) }
  if (url.pathname === '/og/fiber.png' && !FIBER_PAUSED) { const d = fiberState(q.get('net') === 'testnet' ? 'testnet' : 'mainnet'); if (d) png = await card(`fb|${d.net}|${lang}|${host}|${q.get('v') || ''}`, () => fiberCard({ d, lang, host })) }
  if (url.pathname === '/og/use.png') png = await card(`u|${lang}|${host}|${q.get('v') || ''}`, () => useCard({ ...useFacts(), lang, host }))
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
// PULSE_OFFLINE=1 serves what is on disk and polls nothing (the HTTP tests)
const OFFLINE = process.env.PULSE_OFFLINE === '1'
if (!OFFLINE) startDigest({ leaders: highlightsNow, news, groupOf, publicUrl: PUBLIC_URL })
if (!OFFLINE) startImpact({ repos: () => snapshot().repos, dir: DATA_DIR })
// the app icon, drawn once: four cells, two lit
const ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="#07090a"/><rect x="2" y="2" width="5.5" height="5.5" rx="1.4" fill="#cbf34d"/><rect x="8.5" y="2" width="5.5" height="5.5" rx="1.4" fill="#37401f"/><rect x="2" y="8.5" width="5.5" height="5.5" rx="1.4" fill="#37401f"/><rect x="8.5" y="8.5" width="5.5" height="5.5" rx="1.4" fill="#cbf34d"/></svg>'
const icons = {}
const icon = (size) => icons[size] || (icons[size] = rasterise(ICON_SVG.replace('viewBox', `width="${size}" height="${size}" viewBox`), size))
function readJson(req, max, done) {
  let body = ''
  req.on('data', (c) => { body += c; if (body.length > max) req.destroy() })
  req.on('end', () => { let j = null; try { j = JSON.parse(body) } catch {} done(j) })
}
setInterval(() => { for (const c of [...clients, ...fiberClients]) c.write(': ping\n\n') }, 25e3).unref()
// the same data for AI agents, as MCP tools (mcp.mjs)
const mcp = makeMcp({ highlights: highlightsNow, news, projects: projectsNow, project: repoDetail, person: personProfile, peopleIn, updates: latestUpdates, trends: () => trends(knownRepos()), arrivals, marks: personMarks })

function handle(req, res) {
  let url
  try { url = new URL(req.url, 'http://x') } catch { res.writeHead(400, { 'content-type': 'text/plain' }); return res.end('bad request') }
  // liveness stays 200; collector.ok turns false when no organisation feed has answered for 10 minutes, and the VPS
  // watcher (sentinela, SONDA_pulse-*) mails when it does
  if (url.pathname === '/health') {
    const now = Date.now(), stale = now - (health.lastPollOk || health.startedAt) > 10 * 60e3
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    return res.end(JSON.stringify({ ok: true, collector: { ok: !stale, lastPollAt: health.lastPollOk ? new Date(health.lastPollOk).toISOString() : null, lastEventAt: health.lastEventAt ? new Date(health.lastEventAt).toISOString() : null }, rate: { core: limits.core, search: limits.search }, fiber: fiberHealth(), visits: visits(1).days[0], build: BUILD }))
  }
  if (url.pathname === '/' || url.pathname === '/index.html') { hit('pulse', ipOf(req), req.headers['user-agent']); return sendText(req, res, 200, { 'content-type': TYPES['.html'], 'cache-control': 'no-cache' }, page(req, url)) }
  // the Fiber map is paused: its address goes to the live page for now, its API and stream answer 503 (menu.js, FIBER_PAUSED)
  if (FIBER_PAUSED && (url.pathname === '/fiber' || url.pathname === '/fiber.html')) {
    const l = pick(url.searchParams.get('lang'))
    res.writeHead(302, { location: l ? `/?lang=${l}` : '/', 'cache-control': 'no-store' })
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
    return sendText(req, res, 200, { 'content-type': TYPES['.html'], 'cache-control': 'public, max-age=3600', vary: LANG_VARY }, digestPage({ period: 'week', lang: langOf(url.searchParams, req), leaders: weekLeaders(w), news: w.news.map((n) => ({ ...n, createdAt: new Date(w.at).toISOString() })), trends: null, groupOf, base: baseOf(req), url: `${baseOf(req)}/digest`, fixed: { label: dw[1], at: w.at } }))
  }
  if (url.pathname === '/digest') {
    hit('digest', ipOf(req), req.headers['user-agent'])
    const q = url.searchParams, period = PERIODS.includes(q.get('p')) ? q.get('p') : 'week', lang = langOf(q, req)
    return sendText(req, res, 200, { 'content-type': TYPES['.html'], 'cache-control': 'public, max-age=300', vary: LANG_VARY }, digestPage({ period, lang, leaders: highlightsNow(), news: news(), trends: trends(knownRepos()), rhythm: rhythm(), arrivals: period === 'month' ? arrivals(30) : [], groupOf, base: baseOf(req), url: `${baseOf(req)}/digest` }))
  }
  // the page of the DAO grants was taken out on 2026-11-18: old links go to the live page, the JSON is gone
  if (url.pathname === '/funded') { res.writeHead(301, { location: '/', 'cache-control': 'public, max-age=3600' }); return res.end() }
  if (url.pathname === '/api/funded') { res.writeHead(410, { 'content-type': 'application/json' }); return res.end('{"error":"removed"}') }
  // everything Pulse does, for people and for AI agents
  if (url.pathname === '/use') {
    hit('use', ipOf(req), req.headers['user-agent'])
    return sendText(req, res, 200, { 'content-type': TYPES['.html'], 'cache-control': 'public, max-age=300', vary: LANG_VARY }, usePage({ lang: langOf(url.searchParams, req), base: baseOf(req), url: `${baseOf(req)}/use`, img: withStamp(`${baseOf(req)}/og/use.png?lang=${langOf(url.searchParams, req)}`, useFacts()) }))
  }
  // a private page: it opens only with the key (LESSONS_KEY) and reads its data from the data volume (lessons.json);
  // in every other case it falls through to the answer for a route that does not exist
  if (url.pathname === '/lessons' && process.env.LESSONS_KEY) {
    const how = access(req, url, process.env.LESSONS_KEY), data = how && loadLessons(DATA_DIR)
    if (data && how === 'key') {
      const clean = new URLSearchParams(url.searchParams)
      clean.delete('k')
      res.writeHead(303, { location: `/lessons${clean.size ? `?${clean}` : ''}`, 'set-cookie': `lessons=${cookieOf(process.env.LESSONS_KEY)}; Path=/lessons; Max-Age=2592000; HttpOnly; Secure; SameSite=Strict`, 'cache-control': 'no-store' })
      return res.end()
    }
    if (data) return sendText(req, res, 200, { 'content-type': TYPES['.html'], 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex', vary: 'cookie, accept-language' }, lessonsPage({ lang: langOf(url.searchParams, req), base: baseOf(req), url: `${baseOf(req)}/lessons`, data }))
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
    return res.end(JSON.stringify(r || { status: 'counting' }))
  }
  // what is counted and what is not
  if (url.pathname === '/method') {
    hit('method', ipOf(req), req.headers['user-agent'])
    return sendText(req, res, 200, { 'content-type': TYPES['.html'], 'cache-control': 'public, max-age=300', vary: LANG_VARY }, methodPage({ lang: langOf(url.searchParams, req), base: baseOf(req), url: `${baseOf(req)}/method` }))
  }
  // what is kept about visitors and about people on the page, and how to ask to leave
  if (url.pathname === '/privacy') {
    hit('privacy', ipOf(req), req.headers['user-agent'])
    return sendText(req, res, 200, { 'content-type': TYPES['.html'], 'cache-control': 'public, max-age=300', vary: LANG_VARY }, privacyPage({ lang: langOf(url.searchParams, req), base: baseOf(req), url: `${baseOf(req)}/privacy` }))
  }
  // a share channel used or a button pressed, as a count and nothing else (a beacon: no answer needed)
  if (url.pathname === '/api/count' && req.method === 'POST') {
    return readJson(req, 512, (j) => { count(String(j?.name || ''), req.headers['user-agent']); res.writeHead(204, { 'cache-control': 'no-store' }); res.end() })
  }
  if (url.pathname === '/llms.txt') {
    hit('llms', ipOf(req), req.headers['user-agent'])
    return sendText(req, res, 200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' }, llmsTxt({ base: baseOf(req) }))
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
    if (url.pathname === '/badge/ckb.svg') svg = allBadge(highlightsNow().week.stats, lang)
    if (!svg) { res.writeHead(404); return res.end('not found') }
    hit('badge', ipOf(req), req.headers['user-agent'])
    return sendText(req, res, 200, { 'content-type': TYPES['.svg'], 'cache-control': 'public, max-age=600' }, svg)
  }
  if (url.pathname === '/api/visits') return sendJson(req, res, visits(30))
  if (url.pathname === '/mcp') { if (req.method === 'POST') hit('mcp', ipOf(req), req.headers['user-agent']); return mcpHttp(req, res, mcp, baseOf(req)) }
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
  if (url.pathname === '/icon-192.png' || url.pathname === '/icon-512.png') { res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' }); return res.end(icon(url.pathname.includes('512') ? 512 : 192)) }
  if (url.pathname === '/api/push/key') return sendJson(req, res, { key: publicKey() })
  if (url.pathname === '/api/push' && req.method === 'POST') return readJson(req, 16384, (j) => sendJson(req, res, subscribe(j)))
  if (url.pathname === '/api/push/off' && req.method === 'POST') return readJson(req, 4096, (j) => sendJson(req, res, unsubscribe(j)))
  if (url.pathname.startsWith('/og/')) { shareCard(req, res, url).catch((err) => { console.warn('card', err.message); if (!res.headersSent) res.writeHead(500); res.end() }); return }
  if (url.pathname === '/version.json') { res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); return res.end(JSON.stringify({ v: BUILD })) }
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
    return sendJson(req, res, d)
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
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found') }
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
