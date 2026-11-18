// The Fiber map is paused (FIBER_PAUSED in public/menu.js): nothing links to it, its address goes to the live page, its
// API answers 503, and the code is all still there to bring it back.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { FIBER_PAUSED, VIEWS, GROUPS, menuHtml, viewsHtml } from '../public/menu.js'
import { usePage, llmsTxt } from '../use.mjs'
import { words } from '../cards.mjs'

const base = 'https://pulse.example'

test('the pause is one constant, and it is on', () => {
  assert.equal(FIBER_PAUSED, true)
})

test('nothing in the menu or the views leads to the Fiber map, in any language', () => {
  assert.deepEqual(VIEWS.map(([id]) => id), ['live'])
  assert.ok(!GROUPS.flatMap(([, rows]) => rows).some(([id, p]) => id === 'fiber' || p.startsWith('/fiber')))
  for (const lang of ['en', 'pt', 'zh']) {
    const t = words(lang)
    assert.ok(!menuHtml(t, { base, lang }).includes('/fiber'), `${lang} menu`)
    assert.equal(viewsHtml(t, { base, lang }), '', `${lang} views`)
  }
})

test('the use page and llms.txt do not offer the Fiber map or its API', () => {
  for (const lang of ['en', 'pt', 'zh']) {
    const html = usePage({ lang, base, url: `${base}/use` })
    assert.ok(!html.includes('id="fiber"') && !html.includes(`${base}/fiber`) && !html.includes('/api/fiber'), lang)
  }
  const txt = llmsTxt({ base })
  assert.ok(!/fiber map|\/api\/fiber|\/fiber\)/i.test(txt))
  assert.ok(txt.includes(`${base}/api/stream`), 'the live stream is still listed')
})

test('the code to bring it back is all still here', () => {
  for (const f of ['fiber.mjs', 'public/fiber.html', 'public/fiber.js', 'public/fiber.css']) assert.ok(fs.existsSync(new URL(`../${f}`, import.meta.url)), f)
})

const free = () => new Promise((r) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)) }) })
const get = (port, p) => new Promise((resolve, reject) => {
  http.get({ host: '127.0.0.1', port, path: p }, (res) => {
    let body = ''
    res.on('data', (c) => { body += c })
    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }))
  }).on('error', reject)
})

test('on a running server: the address goes to the live page, the API says paused, the live page is fine', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-fp-'))
  const port = await free()
  const child = spawn(process.execPath, ['server.mjs'], { env: { ...process.env, PORT: String(port), DATA_DIR: dir, PULSE_OFFLINE: '1', GITHUB_TOKEN: 'offline' }, stdio: 'ignore' })
  try {
    for (let i = 0; i < 100; i++) { try { if ((await get(port, '/health')).status === 200) break } catch {} await new Promise((r) => setTimeout(r, 100)) }
    for (const [p, to] of [['/fiber', '/live'], ['/fiber?lang=pt', '/live?lang=pt'], ['/fiber.html', '/live'], ['/fiber?net=testnet&lang=zh', '/live?lang=zh']]) {
      const r = await get(port, p)
      assert.equal(r.status, 302, p)
      assert.equal(r.headers.location, to, p)
      assert.equal(r.headers['cache-control'], 'no-store', 'a temporary move: it must not stick in a cache')
    }
    for (const p of ['/api/fiber?net=mainnet', '/api/fiber?net=testnet', '/api/fiber/stream']) {
      const r = await get(port, p)
      assert.equal(r.status, 503, p)
      assert.deepEqual(JSON.parse(r.body), { status: 'paused' }, p)
    }
    assert.equal((await get(port, '/og/fiber.png')).status, 404)
    assert.equal((await get(port, '/')).status, 200)
    assert.equal((await get(port, '/health')).status, 200)
    assert.equal((await get(port, '/digest')).status, 200)
  } finally { child.kill(); fs.rmSync(dir, { recursive: true, force: true }) }
})
