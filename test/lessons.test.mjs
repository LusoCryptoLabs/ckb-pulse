// /lessons is private: it opens only with a key, its data is a file on the data volume and never in git, text a model
// wrote is escaped, and a person on the leave list takes their sources with them.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, execSync } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { lessonsPage, shownLessons, access, cookieOf, loadLessons } from '../lessons.mjs'
import { OPT_OUT } from '../config.mjs'

const lesson = (o = {}) => ({ title: 'Example lesson one', lesson: 'Do the example thing.', concepts: ['Example concept'], status: 'current', note: '', sources: [{ repo: 'owner/repo', hash: 'abc1234', subject: 'fix: an example' }], ...o })
const DATA = { from: '2026-11-11', to: '2026-11-18', read: 3, topics: [{ area: 'Example topic', summary: 'A summary.', lessons: [lesson()] }] }
const page = (data, lang = 'en') => lessonsPage({ lang, base: 'https://pulse.example', url: 'https://pulse.example/lessons', data })
const KEY = 'test-key-0123456789'

test('the page shows the topic, the lesson and a link to its commit, and is not indexed', () => {
  const html = page(DATA)
  assert.ok(html.includes('Example topic') && html.includes('Example lesson one') && html.includes('Do the example thing.'))
  assert.ok(html.includes('https://github.com/owner/repo/commit/abc1234'))
  assert.ok(html.includes('<meta name="robots" content="noindex">'))
})

test('the page speaks each language and shows no word key', () => {
  for (const [lang, word] of [['en', 'What CKB'], ['pt', 'O que a CKB'], ['zh', 'CKB 本周']]) {
    const html = page(DATA, lang)
    assert.ok(html.includes(word), lang)
    assert.ok(!/\bls\.[a-z]+\b/.test(html), `${lang}: a missing word shows its key`)
  }
})

test('text written by a model is escaped', () => {
  const html = page({ ...DATA, topics: [{ area: 'Other', summary: '<b>x</b>', lessons: [lesson({ title: '<img src=x onerror=alert(1)>', lesson: '"><script>alert(1)</script>', sources: [{ repo: 'a/b', hash: 'abc', subject: '<i>s</i>' }] })] }] })
  assert.ok(!html.includes('<img src=x') && !html.includes('<script>alert') && !html.includes('<i>s</i>'))
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'))
})

test('a person on the leave list takes their sources with them, and a lesson left with none goes', () => {
  const data = { ...DATA, topics: [{ area: 'Other', summary: '', lessons: [
    lesson({ title: 'kept', sources: [{ repo: 'leaver/r', hash: '1', subject: 's' }, { repo: 'stays/r', hash: '2', subject: 's' }] }),
    lesson({ title: 'only theirs', sources: [{ repo: 'Leaver/r2', hash: '3', subject: 's' }] }),
  ] }] }
  assert.equal(shownLessons(data)[0].lessons.length, 2) // the control: before they ask, both are there
  OPT_OUT.add('leaver')
  try {
    const shown = shownLessons(data)
    assert.deepEqual(shown[0].lessons.map((l) => l.title), ['kept'])
    assert.deepEqual(shown[0].lessons[0].sources.map((s) => s.repo), ['stays/r'])
    assert.ok(!page(data).includes('leaver/'))
  } finally { OPT_OUT.delete('leaver') }
})

test('access: the key in the address or the cookie made from it, nothing else', () => {
  const url = (q) => new URL(`http://x/lessons${q}`)
  const req = (cookie) => ({ headers: cookie ? { cookie } : {} })
  assert.equal(access(req(), url(`?k=${KEY}`), KEY), 'key')
  assert.equal(access(req(), url('?k=wrong'), KEY), null)
  assert.equal(access(req(), url(''), KEY), null)
  assert.equal(access(req(`a=b; lessons=${cookieOf(KEY)}`), url(''), KEY), 'cookie')
  assert.equal(access(req(`lessons=${cookieOf('other')}`), url(''), KEY), null)
  assert.equal(access(req(), url(`?k=${KEY}`), ''), null, 'no key configured means closed')
  assert.ok(!cookieOf(KEY).includes(KEY), 'the cookie is not the key')
})

test('loadLessons reads the file on the volume and says null when it is missing or not JSON', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-ld-'))
  try {
    assert.equal(loadLessons(dir), null)
    fs.writeFileSync(path.join(dir, 'lessons.json'), '{not json')
    assert.equal(loadLessons(dir), null)
    fs.writeFileSync(path.join(dir, 'lessons.json'), JSON.stringify(DATA))
    assert.equal(loadLessons(dir).read, 3)
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

const free = () => new Promise((r) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)) }) })
const get = (port, p, headers = {}) => new Promise((resolve, reject) => {
  http.get({ host: '127.0.0.1', port, path: p, headers }, (res) => {
    let body = ''
    res.on('data', (c) => { body += c })
    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }))
  }).on('error', reject)
})
async function withServer(env, files, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-ls-'))
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), content)
  const port = await free()
  const child = spawn(process.execPath, ['server.mjs'], { env: { ...process.env, PORT: String(port), DATA_DIR: dir, PULSE_OFFLINE: '1', GITHUB_TOKEN: 'offline', LESSONS_KEY: '', ...env }, stdio: 'ignore' })
  try {
    for (let i = 0; i < 100; i++) { try { if ((await get(port, '/health')).status === 200) break } catch {} await new Promise((r) => setTimeout(r, 100)) }
    await fn(port)
  } finally { child.kill(); fs.rmSync(dir, { recursive: true, force: true }) }
}

test('the route: without the key it is a route that does not exist, with the key it sets a cookie and opens', async () => {
  await withServer({ LESSONS_KEY: KEY }, { 'lessons.json': JSON.stringify(DATA) }, async (port) => {
    const nothing = await get(port, '/no-such-page-here')
    for (const p of ['/lessons', '/lessons?k=wrong', '/lessons?lang=pt']) {
      const r = await get(port, p)
      assert.equal(r.status, nothing.status, p)
      assert.equal(r.body, nothing.body, `${p} must look like an unknown route`)
    }
    const r = await get(port, `/lessons?k=${KEY}`)
    assert.equal(r.status, 303)
    assert.equal(r.headers.location, '/lessons')
    const cookie = String(r.headers['set-cookie'])
    assert.ok(/HttpOnly/.test(cookie) && /Secure/.test(cookie) && /SameSite=Strict/.test(cookie) && /Path=\/lessons/.test(cookie))
    assert.ok(!cookie.includes(KEY), 'the cookie is not the key')
    const open = await get(port, '/lessons', { cookie: cookie.split(';')[0] })
    assert.equal(open.status, 200)
    assert.ok(open.body.includes('Example lesson one'))
    assert.match(String(open.headers['cache-control']), /private, no-store/)
    assert.equal(open.headers['x-robots-tag'], 'noindex')
    const pt = await get(port, '/lessons?lang=pt', { cookie: cookie.split(';')[0] })
    assert.ok(pt.body.includes('O que a CKB'))
    assert.equal((await get(port, '/health')).status, 200)
  })
})

test('the route is closed when there is no key configured, or no file on the volume', async () => {
  await withServer({ LESSONS_KEY: '' }, { 'lessons.json': JSON.stringify(DATA) }, async (port) => {
    assert.equal((await get(port, `/lessons?k=${KEY}`)).status, (await get(port, '/no-such-page-here')).status)
  })
  await withServer({ LESSONS_KEY: KEY }, {}, async (port) => {
    assert.equal((await get(port, `/lessons?k=${KEY}`)).status, (await get(port, '/no-such-page-here')).status)
  })
})

test('the repository holds no lessons data', () => {
  const files = execSync('git ls-files', { cwd: path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..') }).toString().split('\n')
  assert.deepEqual(files.filter((f) => /lessons[-.]data|(^|\/)lessons\.json$/.test(f)), [])
})
