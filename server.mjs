// HTTP: the page, the current state, and a live stream of new events (Server-Sent Events).
//   GITHUB_TOKEN=... node server.mjs        (PORT, default 8080; DATA_DIR, default ./data)
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { start, snapshot, bus } from './pulse.mjs'

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'public')
const PORT = +(process.env.PORT || 8080)
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' }
const clients = new Set()

bus.on('event', (e) => { const msg = `data: ${JSON.stringify(e)}\n\n`; for (const c of clients) c.write(msg) })
setInterval(() => { for (const c of clients) c.write(': ping\n\n') }, 25e3).unref()

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x')
  if (url.pathname === '/health') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('ok') }
  if (url.pathname === '/api/state') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    return res.end(JSON.stringify(snapshot()))
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
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'public, max-age=300' })
  fs.createReadStream(f).pipe(res)
})
server.listen(PORT, () => console.log(`ckb-pulse on :${PORT}`))
start()
