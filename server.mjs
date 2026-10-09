// HTTP: the page, the current state, and a live stream of new events (Server-Sent Events).
//   GITHUB_TOKEN=... node server.mjs        (PORT, default 8080; DATA_DIR, default ./data)
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import crypto from 'node:crypto'
import { start, snapshot, repoDetail, propose, proposal, highlightsNow, groupOf, personDetail, bus } from './pulse.mjs'
import { highlightsCard, repoCard, personCard, words } from './cards.mjs'

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'public')
const PORT = +(process.env.PORT || 8080)
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' }
const clients = new Set()

// one id per set of page files: the page carries it in a meta tag and /version.json answers with the current one,
// so a page left open can tell that a new version went out (the same scheme as cellula.id)
function buildId() {
  const h = crypto.createHash('sha256')
  const walk = (dir) => {
    for (const n of fs.readdirSync(dir).sort()) {
      const f = path.join(dir, n)
      if (fs.statSync(f).isDirectory()) walk(f)
      else { h.update(path.relative(ROOT, f).replace(/\\/g, '/')); h.update(fs.readFileSync(f)) }
    }
  }
  walk(ROOT)
  return h.digest('hex').slice(0, 12)
}
const BUILD = buildId()
const INDEX = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace('__BUILD__', BUILD)

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
// the page, with link-preview tags for what is shared: a period's highlights, a project or a person
function page(req, url) {
  const q = url.searchParams, host = req.headers.host || 'localhost'
  const base = `${req.headers['x-forwarded-proto'] || 'http'}://${host}`
  const lang = LANGS.includes(q.get('lang')) ? q.get('lang') : 'en', t = words(lang)
  const d = q.get('repo') ? repoDetail(q.get('repo')) : null
  const p = !d && q.get('person') ? personDetail(q.get('person')) : null
  let title, desc, img
  if (d) { title = t('og.repo', { name: short(d.name) }); desc = d.desc || t('d.noDesc'); img = `/og/repo.png?name=${encodeURIComponent(d.name)}` }
  else if (p) { title = t('og.person', { login: p.login }); desc = t('p.sum', { updates: t.cnt('upd', p.updates), projects: t.cnt('prj', p.projects.length) }); img = `/og/person.png?login=${encodeURIComponent(p.login)}` }
  else {
    const h = PERIODS.includes(q.get('h')) ? q.get('h') : 'week', s = highlightsNow()[h].stats
    title = `CKB Pulse · ${t('mode.' + h)}`
    desc = t('og.desc', { updates: t.cnt('upd', s.updates), people: t.cnt('ppl', s.people), projects: t.cnt('prj', s.projects), when: t('when.' + h) })
    img = `/og/highlights.png?p=${h}`
  }
  img = `${base}${img}&lang=${lang}`
  const tags = [['og:type', 'website'], ['og:site_name', 'CKB Pulse'], ['og:title', title], ['og:description', desc], ['og:image', img], ['og:image:width', '1200'], ['og:image:height', '630'], ['og:url', base + url.pathname + url.search]]
    .map(([k, v]) => `<meta property="${k}" content="${attr(v)}">`).join('\n') +
    `\n<meta name="twitter:card" content="summary_large_image">\n<meta name="twitter:title" content="${attr(title)}">\n<meta name="twitter:description" content="${attr(desc)}">\n<meta name="twitter:image" content="${attr(img)}">`
  return INDEX.replace('<!--og-->', tags)
}
async function shareCard(req, res, url) {
  const q = url.searchParams, lang = LANGS.includes(q.get('lang')) ? q.get('lang') : 'en', host = req.headers.host || 'localhost'
  let png = null
  if (url.pathname === '/og/highlights.png') { const p = PERIODS.includes(q.get('p')) ? q.get('p') : 'week'; png = await card(`h|${p}|${lang}|${host}`, () => highlightsCard({ leaders: highlightsNow(), period: p, lang, host, groupOf })) }
  if (url.pathname === '/og/repo.png') { const d = repoDetail(q.get('name') || ''); if (d) png = await card(`r|${d.name}|${lang}|${host}`, () => repoCard({ d, leaders: highlightsNow(), lang, host })) }
  if (url.pathname === '/og/person.png') { const p = personDetail(q.get('login') || ''); if (p) png = await card(`p|${p.login}|${lang}|${host}`, () => personCard({ p, leaders: highlightsNow(), lang, host })) }
  if (!png) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('not found') }
  res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=600' })
  res.end(png)
}

// JSON, gzipped when the browser accepts it (the state with 7 days of history is a few hundred kB raw)
function sendJson(req, res, obj) {
  const body = Buffer.from(JSON.stringify(obj))
  const gz = /gzip/.test(req.headers['accept-encoding'] || '')
  res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store', ...(gz ? { 'content-encoding': 'gzip', vary: 'accept-encoding' } : {}) })
  res.end(gz ? zlib.gzipSync(body) : body)
}

bus.on('event', (e) => { const msg = `data: ${JSON.stringify(e)}\n\n`; for (const c of clients) c.write(msg) })
setInterval(() => { for (const c of clients) c.write(': ping\n\n') }, 25e3).unref()

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x')
  if (url.pathname === '/health') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('ok') }
  if (url.pathname === '/' || url.pathname === '/index.html') { res.writeHead(200, { 'content-type': TYPES['.html'], 'cache-control': 'no-cache' }); return res.end(page(req, url)) }
  if (url.pathname.startsWith('/og/')) { shareCard(req, res, url).catch((err) => { console.warn('card', err.message); if (!res.headersSent) res.writeHead(500); res.end() }); return }
  if (url.pathname === '/version.json') { res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); return res.end(JSON.stringify({ v: BUILD })) }
  if (url.pathname === '/api/state') return sendJson(req, res, snapshot())
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
  const f = path.join(ROOT, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname))
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found') }
  // the page's own files change together on every deploy: always ask again; three.js only changes with a new folder
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': url.pathname.startsWith('/vendor/') ? 'public, max-age=86400' : 'no-cache' })
  fs.createReadStream(f).pipe(res)
})
server.listen(PORT, () => console.log(`ckb-pulse on :${PORT}`))
start()
