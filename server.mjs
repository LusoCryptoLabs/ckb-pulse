// HTTP: the page, the current state, and a live stream of new events (Server-Sent Events).
//   GITHUB_TOKEN=... node server.mjs        (PORT, default 8080; DATA_DIR, default ./data)
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import crypto from 'node:crypto'
import { start, snapshot, repoDetail, propose, proposal, bus } from './pulse.mjs'

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
  if (url.pathname === '/' || url.pathname === '/index.html') { res.writeHead(200, { 'content-type': TYPES['.html'], 'cache-control': 'no-cache' }); return res.end(INDEX) }
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
