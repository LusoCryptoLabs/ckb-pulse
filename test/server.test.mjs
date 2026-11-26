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
  // one kept digest week, for /digest/<week>
  fs.writeFileSync(path.join(dir, 'digests.json'), JSON.stringify({ weeks: [{ at: Date.parse('2026-11-16T08:01:00Z'), stats: { updates: 970, people: 90, projects: 99 }, repos: [['ckb-devrel/ccc', 30]], commits: [], people: [['alice', 9]], orgs: [['ckb-devrel', 30]], news: [] }] }))
  // a free port is picked and released before the server takes it: if another process gets it first, try again
  let err = ''
  for (let attempt = 0; attempt < 3; attempt++) {
    port = await new Promise((r) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)) }) })
    exited = false
    child = spawn(process.execPath, ['server.mjs'], { env: { ...process.env, PORT: String(port), DATA_DIR: dir, PULSE_OFFLINE: '1', GITHUB_TOKEN: 'offline' }, stdio: ['ignore', 'pipe', 'pipe'] })
    child.stderr.on('data', (c) => { err += c })
    child.on('exit', () => { exited = true })
    for (let i = 0; i < 50 && !exited; i++) { try { if (status(await raw('/health')) === 200) return } catch {} await new Promise((r) => setTimeout(r, 100)) }
    child.kill()
  }
  throw new Error('server did not start: ' + err.slice(0, 500))
})
after(() => { child?.kill(); fs.rmSync(dir, { recursive: true, force: true }) })

for (const p of ['/%FF', '//', '/%', '/api/fiber?net=constructor', '/api/fiber?net=__proto__', '/api/fiber?net=toString']) {
  test(`${p} gets an answer and the server stays up`, async () => {
    const r = await raw(p)
    assert.ok([400, 404, 503].includes(status(r)), r.split('\r\n')[0])
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
for (const page of ['/digest', '/use']) {
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
    for (const id of ['source', 'update', 'window', 'rank', 'bots', 'follow', 'own', 'limits', 'wrong']) assert.ok(r.includes(`id="${id}"`), `${lang} ${id}`)
    assert.ok(!/\bme\.[a-z]+\.[a-z]\b/.test(r), 'a missing word shows its key')
  }
})

test('a kept digest week has its own page and card, an unknown one is a 404', async () => {
  const r = await get('/digest/2026-W46?lang=en')
  assert.equal(status(r), 200)
  assert.ok(/<b[^>]*>970<\/b>/.test(r) && r.includes('The week 2026-W46'))
  assert.equal(status(await get('/digest/2025-W01')), 404)
  const png = await get('/og/digest.png?w=2026-W46')
  assert.equal(status(png), 200)
  assert.match(png, /content-type: image\/png/i)
  assert.equal(status(await get('/og/digest.png?w=2025-W01')), 404)
})

test('the support page answers, and the sitemap lists it', async () => {
  const r = await raw('/support?lang=pt')
  assert.equal(status(r), 200)
  assert.ok(r.includes('bc1p9l2qc3ckhgzephxaguxh50j9dmvs9pzk9a0dw9ff626q45kdesushwvj06'))
  assert.ok((await raw('/sitemap.xml')).includes('/support'))
})

test('pages carry their canonical address and languages; noindex pages do not; the project routes answer', async () => {
  const d = await get('/digest?p=month&theme=dark', 'pt-PT')
  assert.ok(d.includes('<link rel="canonical" href="http://x/digest?p=month&amp;lang=pt">'), d.slice(0, 300))
  assert.ok(d.includes('hreflang="x-default" href="http://x/digest?p=month"'))
  assert.ok((await get('/?lang=en')).includes('"@type":"WebSite"'))
  assert.ok(!(await get('/compare')).includes('rel="canonical"'))
  const list = await get('/projects?lang=pt')
  assert.equal(status(list), 200)
  assert.ok(list.includes('Todos os projetos') && list.includes('<link rel="canonical" href="http://x/projects?lang=pt">'))
  assert.equal(status(await get('/project/nobody/nothing')), 404)
  assert.ok([400, 404].includes(status(await get('/project/%E0%A4%A/x'))))
  assert.ok((await raw('/sitemap.xml')).includes('/projects'))
})

test('the funded page is gone for good: it and its JSON are plain 404s', async () => {
  for (const p of ['/funded?lang=pt', '/api/funded', '/og/funded.png']) assert.equal(status(await get(p)), 404, p)
})

test('/api/person answers with dated facts, and refuses a bad login', async () => {
  const r = await get('/api/person?login=alice')
  assert.equal(status(r), 200)
  assert.match(r, /"login":"alice"/)
  assert.equal(status(await get('/api/person?login=a%20b')), 400)
  assert.equal(status(await get('/api/person')), 400)
})

test('/privacy answers in every language, with every section and the contact', async () => {
  for (const [lang, word] of [['en', 'What Pulse'], ['pt', 'O que o Pulse'], ['zh', 'Pulse 保存了']]) {
    const r = await get(`/privacy?lang=${lang}`)
    assert.equal(status(r), 200)
    assert.ok(r.includes(word), lang)
    for (const id of ['shows', 'visits', 'counts', 'device', 'notices', 'history', 'leave', 'sale', 'contact']) assert.ok(r.includes(`id="${id}"`), `${lang} ${id}`)
    assert.ok(r.includes('mailto:hello@lusocryptolabs.com'), lang)
    assert.ok(!/pv\.[a-z]+\.[a-z]/.test(r), 'a missing word shows its key')
  }
})

// a POST with a browser's user agent counts as a person, one that says it is a script as a bot: counts, never who
const url = (p) => `http://127.0.0.1:${port}${p}`
const HUMAN = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 Safari/604.1'
const countPost = (name, ua) => fetch(url('/api/count'), { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': ua }, body: JSON.stringify({ name }) })
const visits = async () => (await fetch(url('/api/visits'))).json()
test('a share channel is counted per day, a stranger name is not, and nobody is in the count', async () => {
  assert.equal((await countPost('share_x', HUMAN)).status, 204)
  assert.equal((await countPost('share_x', HUMAN)).status, 204)
  assert.equal((await countPost('share_telegram', 'curl/8.0')).status, 204) // a script: counted as a bot
  assert.equal((await countPost('drop table', HUMAN)).status, 204) // answered the same, counted nowhere
  const j = await visits()
  assert.equal(j.total.counts.share_x, 2)
  assert.equal(j.total.botCounts.share_telegram, 1)
  assert.equal(j.total.counts['drop table'], undefined)
  assert.ok(!JSON.stringify(j.days.at(-1)).includes('iPhone')) // the browser is not kept
})
test('a card drawn is counted by kind', async () => {
  const before = (await visits()).total.botCounts.card_digest || 0
  await fetch(url('/og/digest.png?w=2026-W46'), { headers: { 'user-agent': 'Twitterbot/1.0' } }) // a link preview
  assert.equal((await visits()).total.botCounts.card_digest, before + 1)
})
