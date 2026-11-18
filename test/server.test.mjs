// The server answers a bad request with an error and keeps running: GET /%FF, //, /% and /api/fiber?net=constructor
// each used to throw outside any handler and end the process (found 2026-11-18, proved on a local copy).
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import net from 'node:net'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

let child, port, dir, exited = false

// a raw request, so the path reaches the server exactly as written (fetch would normalise it)
const raw = (p) => new Promise((resolve, reject) => {
  const s = net.connect(port, '127.0.0.1', () => s.write(`GET ${p} HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n`))
  let out = ''
  s.on('data', (c) => { out += c }); s.on('end', () => resolve(out)); s.on('error', reject)
})
const status = (r) => +r.split(' ')[1]

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-'))
  port = await new Promise((r) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)) }) })
  child = spawn(process.execPath, ['server.mjs'], { env: { ...process.env, PORT: String(port), DATA_DIR: dir, PULSE_OFFLINE: '1', GITHUB_TOKEN: 'offline' }, stdio: ['ignore', 'pipe', 'pipe'] })
  child.on('exit', () => { exited = true })
  for (let i = 0; i < 100; i++) { try { if (status(await raw('/health')) === 200) return } catch {} await new Promise((r) => setTimeout(r, 100)) }
  throw new Error('server did not start')
})
after(() => { child?.kill(); fs.rmSync(dir, { recursive: true, force: true }) })

for (const p of ['/%FF', '//', '/%', '/api/fiber?net=constructor', '/api/fiber?net=__proto__', '/api/fiber?net=toString']) {
  test(`${p} gets an answer and the server stays up`, async () => {
    const r = await raw(p)
    assert.ok([400, 404].includes(status(r)), r.split('\r\n')[0])
    assert.equal(exited, false)
    assert.equal(status(await raw('/health')), 200)
  })
}

// a page a person opens speaks their browser's language when the link names none; ?lang= wins, in any case
const get = (p, al) => new Promise((resolve, reject) => {
  const s = net.connect(port, '127.0.0.1', () => s.write(`GET ${p} HTTP/1.1\r\nHost: x\r\n${al ? `Accept-Language: ${al}\r\n` : ''}Connection: close\r\n\r\n`))
  let out = ''
  s.on('data', (c) => { out += c }); s.on('end', () => resolve(out)); s.on('error', reject)
})
const htmlLang = (r) => (r.match(/<html[^>]*\slang="([^"]+)"/) || [])[1]
for (const page of ['/digest', '/funded', '/use']) {
  test(`${page} follows Accept-Language, and ?lang= wins in any case`, async () => {
    assert.match(htmlLang(await get(page, 'pt-PT,pt;q=0.9,en;q=0.8')), /^pt/)
    assert.match(htmlLang(await get(page, 'zh-CN,zh;q=0.9')), /^zh/)
    assert.match(htmlLang(await get(page, 'fr-FR')), /^en/)
    assert.match(htmlLang(await get(`${page}?lang=PT`, 'zh-CN')), /^pt/)
    assert.match(htmlLang(await get(`${page}?lang=pt-PT`)), /^pt/)
    assert.match((await get(page, 'pt')).toLowerCase(), /vary: accept-encoding, accept-language/)
  })
}

test('/method answers in every language with every section', async () => {
  for (const [lang, word] of [['en', 'How Pulse'], ['pt', 'Como o Pulse'], ['zh', 'Pulse 如何']]) {
    const r = await get(`/method?lang=${lang}`)
    assert.equal(status(r), 200)
    assert.ok(r.includes(word), lang)
    for (const id of ['source', 'update', 'window', 'rank', 'bots', 'follow', 'own', 'funded', 'limits', 'wrong']) assert.ok(r.includes(`id="${id}"`), `${lang} ${id}`)
    assert.ok(!/\bme\.[a-z]+\.[a-z]\b/.test(r), 'a missing word shows its key')
  }
})
