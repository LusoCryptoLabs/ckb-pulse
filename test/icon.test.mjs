// The tab icon is the blocks of Pulse in Ink, Paper, Grafite and the red, asked for by a versioned address, from one place.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { menuHead, iconLinks, ICON_VERSION } from '../digest.mjs'

const base = 'https://pulse.example'
const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')

test('every plain page gets the three icon links from the shared head, and none of its own', () => {
  const head = menuHead(base)
  assert.ok(head.includes(iconLinks(base)))
  assert.ok(head.includes(`href="${base}/icon.svg?v=${ICON_VERSION}"`) && head.includes(`href="${base}/icon-32.png?v=${ICON_VERSION}"`) && head.includes(`href="${base}/icon-192.png?v=${ICON_VERSION}"`))
  for (const f of ['digest.mjs', 'landing.mjs', 'impact.mjs', 'use.mjs', 'method.mjs', 'privacy.mjs', 'lessons.mjs', 'feed.mjs']) assert.ok(!/<link rel="icon" href=/.test(read(f)), `${f} still sets an icon of its own`)
})

test('the live page, the Fiber page and the manifest ask for the versioned icons', () => {
  for (const f of ['public/index.html', 'public/fiber.html']) {
    const h = read(f)
    assert.ok(h.includes(`href="icon.svg?v=${ICON_VERSION}"`) && h.includes(`href="icon-32.png?v=${ICON_VERSION}"`), f)
    assert.ok(!/data:image\/svg\+xml/.test(h.match(/<link rel="icon"[^>]*>/g).join('')), `${f}: an inline icon would be cached apart`)
  }
  const m = JSON.parse(read('public/manifest.webmanifest'))
  for (const i of m.icons) assert.ok(i.src.endsWith(`?v=${ICON_VERSION}`), i.src)
  assert.equal(m.theme_color, '#121212')
})

const free = () => new Promise((r) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)) }) })
const get = (port, p) => new Promise((resolve, reject) => { http.get({ host: '127.0.0.1', port, path: p }, (res) => { const parts = []; res.on('data', (c) => parts.push(c)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(parts) })) }).on('error', reject) })

test('on a running server: the svg, the pngs and the address browsers try on their own', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-ic-'))
  const port = await free()
  const child = spawn(process.execPath, ['server.mjs'], { env: { ...process.env, PORT: String(port), DATA_DIR: dir, PULSE_OFFLINE: '1', GITHUB_TOKEN: 'offline' }, stdio: 'ignore' })
  try {
    for (let i = 0; i < 100; i++) { try { if ((await get(port, '/health')).status === 200) break } catch {} await new Promise((r) => setTimeout(r, 100)) }
    const svg = await get(port, `/icon.svg?v=${ICON_VERSION}`)
    assert.equal(svg.status, 200); assert.equal(svg.headers['content-type'], 'image/svg+xml')
    const text = svg.body.toString()
    for (const c of ['#121212', '#F4F1EB', '#E10600']) assert.ok(text.includes(c), c)
    assert.ok(!/cbf34d|37401f|37401F/i.test(text), 'no lime')
    for (const p of ['/favicon.ico', '/icon-32.png', '/icon-192.png', '/icon-512.png']) {
      const r = await get(port, p)
      assert.equal(r.status, 200, p); assert.equal(r.headers['content-type'], 'image/png', p)
      assert.deepEqual([...r.body.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47], `${p} is a png`)
    }
  } finally { child.kill(); fs.rmSync(dir, { recursive: true, force: true }) }
})
