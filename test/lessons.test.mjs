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
import { lessonsPage, lessonPage, startPage, lessonsFeed, withdrawnPage, lessonsApi, lessonsMcp, publicLessonTools, checkCode, agentRule, searchLessons, visible, shownLessons, access, cookieOf, loadLessons, LESSON_TOOLS } from '../lessons.mjs'
import { OPT_OUT } from '../config.mjs'

const lesson = (o = {}) => ({ title: 'Example lesson one', lesson: 'Do the example thing.', concepts: ['Example concept'], status: 'current', note: '', sources: [{ repo: 'owner/repo', hash: 'abc1234', subject: 'fix: an example' }], ...o })
const DATA = { from: '2026-11-11', to: '2026-11-18', read: 3, topics: [{ area: 'Example topic', summary: 'A summary.', lessons: [lesson()] }] }
const page = (data, lang = 'en') => lessonsPage({ lang, base: 'https://pulse.example', url: 'https://pulse.example/lessons', data })
const KEY = 'test-key-0123456789'

test('the page shows the topic and the lesson, linked to its page, which links its commit; neither is indexed', () => {
  const html = page(DATA)
  assert.ok(html.includes('Example topic') && html.includes('Example lesson one') && html.includes('Do the example thing.'))
  assert.ok(lessonPage({ lang: 'en', base: 'https://pulse.example', url: 'u', data: DATA, id: 'example-topic/example-lesson-one' }).includes('https://github.com/owner/repo/commit/abc1234'))
  assert.ok(html.includes('<meta name="robots" content="noindex">'))
})

test('the page speaks each language and shows no word key', () => {
  for (const [lang, word] of [['en', 'What CKB'], ['pt', 'O que a CKB'], ['zh', 'CKB 学到了什么']]) {
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

// version 2 of the export, as the lessons repository writes it
const L2 = (o = {}) => ({ id: 'ccc/keep-the-change', area: 'ccc', title: 'Keep the change output', lesson: 'Never drop the change output when the fee grows.', note: '', patterns: ['outputs[change].capacity -= fee'],
  concepts: ['Transaction building and fees'], kind: ['bug fix'], applies_to: ['@ckb-ccc/core >= 1.0'], status: 'current', superseded_by: null, evidence: 'L1', confidence: 'high',
  first_seen: '2026-11-12', last_touched: '2026-11-17', last_checked: null,
  sources: [{ repo: 'owner/repo', hash: 'abc1234', date: '2026-11-12', subject: 'fix: keep change' }, { repo: 'other/app', hash: 'def5678', date: '2026-11-17', subject: 'fix: change' }],
  related: ['scripts/witness-args'], history: [{ date: '2026-11-18', what: 'feat(lessons): add what the projects learned' }], ...o })
const V2 = { version: 2, from: '2026-11-11', to: '2026-11-18', read: 353, areas: { ccc: { name: 'CCC (TypeScript SDK)', summary: 'Building with CCC.' }, scripts: { name: 'Rust scripts', summary: 'On chain.' } },
  lessons: [L2(), L2({ id: 'scripts/witness-args', area: 'scripts', title: 'Read witness args from the right index', lesson: 'Use the group index, not the input index.', concepts: ['Witnesses and signatures'], related: ['ccc/keep-the-change'], sources: [{ repo: 'third/lock', hash: '9999999', date: '2026-11-14', subject: 'fix(lock): index' }], applies_to: [], evidence: 'L0', patterns: [], history: [] })] }
const P2 = (o = {}) => lessonsPage({ lang: 'en', base: 'https://pulse.example', url: 'https://pulse.example/lessons', data: V2, ...o })

test('version 2: the page lists every lesson by topic, linked to its own page, and the first week\'s file still reads', () => {
  const html = P2()
  assert.ok(html.includes('href="https://pulse.example/lessons/ccc/keep-the-change?lang=en"') && html.includes('CCC (TypeScript SDK)') && html.includes('Rust scripts'))
  assert.ok(html.includes('353 commits read, 2 lessons'))
  assert.ok(html.includes('name="q"') && html.includes('role="search"'), 'a search box')
  assert.ok(page(DATA).includes('href="https://pulse.example/lessons/example-topic/example-lesson-one?lang=en"'), 'the old file gets ids from its topic and title')
})

test('the index says how the lessons were checked, in words, when the export carries it', () => {
  const checked = { date: '2026-11-18', sample: 60, of: 89, right: 20, partly_right: 37, not_ckb: 3, wrong: 0 }
  for (const [lang, want] of [['en', '60 of the first 89 lessons. 20 right, 37 partly right'], ['pt', '60 das primeiras 89 lições. 20 certas, 37 em parte certas'], ['zh', '前 89 条经验中抽查 60 条。20 条正确']]) {
    assert.ok(P2({ lang, data: { ...V2, checked } }).includes(want), lang)
  }
  assert.ok(!P2().includes('partly right'), 'nothing is said when nothing was measured')
})

test('search: every word must match, the title counts most, and an area or a project narrows it', () => {
  const ls = visible(V2).lessons
  assert.deepEqual(searchLessons(ls, { q: 'change output' }).map((l) => l.id), ['ccc/keep-the-change'])
  assert.deepEqual(searchLessons(ls, { q: 'change witness' }), [], 'both words, or nothing')
  assert.deepEqual(searchLessons(ls, { q: 'witnesses' }).map((l) => l.id), ['scripts/witness-args'], 'a plural finds the singular')
  assert.deepEqual(searchLessons(ls, { q: 'fix' }).map((l) => l.id).length, 2, 'sources count too')
  assert.deepEqual(searchLessons(ls, { area: 'scripts' }).map((l) => l.id), ['scripts/witness-args'])
  assert.deepEqual(searchLessons(ls, { repo: 'Other/App' }).map((l) => l.id), ['ccc/keep-the-change'])
  const html = P2({ q: 'witness' })
  assert.ok(html.includes('1 lessons found.') && html.includes('Read witness args') && !html.includes('Keep the change output</a>'))
  assert.ok(P2({ q: 'nothing-like-this' }).includes('No lesson matches.'))
})

test('a lesson\'s page has the rule, the pattern, its sources with dates, related lessons, evidence and history', () => {
  const html = lessonPage({ lang: 'en', base: 'https://pulse.example', url: 'https://pulse.example/lessons/ccc/keep-the-change', data: V2, id: 'ccc/keep-the-change' })
  for (const want of ['Never drop the change output', 'outputs[change].capacity -= fee', '2026-11-12 · <a href="https://github.com/owner/repo/commit/abc1234"', 'https://github.com/other/app/commit/def5678',
    'href="https://pulse.example/lessons/scripts/witness-args?lang=en">Read witness args', 'seen in two or more projects', '@ckb-ccc/core &gt;= 1.0', '2026-11-18 · feat(lessons): add what the projects learned', 'Last checked</dt><dd>never', '<meta name="robots" content="noindex">'])
    assert.ok(html.includes(want), want)
  assert.equal(lessonPage({ lang: 'en', base: 'x', url: 'x', data: V2, id: 'ccc/no-such' }), null)
  assert.equal(lessonPage({ lang: 'en', base: 'x', url: 'x', data: V2, id: '../../etc/passwd' }), null)
  const bad = lessonPage({ lang: 'pt', base: 'x', url: 'x', data: { ...V2, lessons: [L2({ title: '<script>alert(1)</script>', patterns: ['<img src=x onerror=1>'] })] }, id: 'ccc/keep-the-change' })
  assert.ok(!bad.includes('<script>alert') && !bad.includes('<img src=x') && bad.includes('Padrão'))
})

test('a project that left takes its lessons and the links to them along', () => {
  OPT_OUT.add('third')
  try {
    const v = visible(V2)
    assert.deepEqual(v.lessons.map((l) => l.id), ['ccc/keep-the-change'])
    assert.deepEqual(v.lessons[0].related, [], 'no link to a lesson that is gone')
  } finally { OPT_OUT.delete('third') }
})

test('the key as a bearer token opens the API and MCP; a wrong one does not', () => {
  const url = new URL('http://x/lessons/api')
  assert.equal(access({ headers: { authorization: `Bearer ${KEY}` } }, url, KEY), 'bearer')
  assert.equal(access({ headers: { authorization: 'Bearer nope' } }, url, KEY), null)
  assert.equal(access({ headers: { authorization: KEY } }, url, KEY), null, 'only as a bearer token')
})

test('the API answers a search briefly and one lesson in full, with a link to its page', () => {
  const s = lessonsApi(V2, new URL('http://x/lessons/api?q=change'), 'https://pulse.example')
  assert.equal(s.status, 200)
  assert.equal(s.json.count, 1)
  assert.deepEqual(Object.keys(s.json.lessons[0]).sort(), ['area', 'concepts', 'evidence', 'id', 'last_touched', 'lesson', 'status', 'title', 'url'])
  assert.equal(s.json.lessons[0].url, 'https://pulse.example/lessons/ccc/keep-the-change')
  const one = lessonsApi(V2, new URL('http://x/lessons/api?id=scripts/witness-args'), 'b')
  assert.equal(one.json.sources[0].repo, 'third/lock')
  assert.equal(lessonsApi(V2, new URL('http://x/lessons/api?id=none/none'), 'b').status, 404)
  assert.equal(lessonsApi(V2, new URL('http://x/lessons/api?limit=1'), 'b').json.lessons.length, 1)
})

test('the MCP server lists its four tools and answers them; a bad argument is told to the model', async () => {
  const handle = lessonsMcp(() => V2)
  const call = async (method, params) => (await handle({ jsonrpc: '2.0', id: 1, method, params }, { base: 'https://pulse.example' })).json
  assert.equal((await call('initialize', {})).result.serverInfo.name, 'ckb-lessons')
  assert.deepEqual((await call('tools/list')).result.tools.map((t) => t.name), LESSON_TOOLS)
  assert.deepEqual(LESSON_TOOLS, ['search_lessons', 'get_lesson', 'lessons_from_project', 'check_code', 'list_areas'])
  const found = JSON.parse((await call('tools/call', { name: 'search_lessons', arguments: { query: 'witness index' } })).result.content[0].text)
  assert.deepEqual(found.lessons.map((l) => l.id), ['scripts/witness-args'])
  const one = JSON.parse((await call('tools/call', { name: 'get_lesson', arguments: { id: 'ccc/keep-the-change' } })).result.content[0].text)
  assert.equal(one.evidence, 'L1')
  const bad = (await call('tools/call', { name: 'get_lesson', arguments: { id: '../x' } })).result
  assert.equal(bad.isError, true)
  const areas = JSON.parse((await call('tools/call', { name: 'list_areas', arguments: {} })).result.content[0].text)
  assert.deepEqual(areas.areas.map((a) => [a.id, a.lessons]), [['ccc', 1], ['scripts', 1]])
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

const post = (port, p, body, headers = {}) => new Promise((resolve, reject) => {
  const data = JSON.stringify(body)
  const r = http.request({ host: '127.0.0.1', port, path: p, method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data), ...headers } }, (res) => {
    let b = ''; res.on('data', (c) => { b += c }); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: b }))
  })
  r.on('error', reject); r.end(data)
})

test('on a running server: a lesson page, the API and MCP open with the key and are unknown routes without it', async () => {
  await withServer({ LESSONS_KEY: KEY }, { 'lessons.json': JSON.stringify(V2) }, async (port) => {
    const nothing = await get(port, '/no-such-page-here')
    for (const p of ['/lessons/ccc/keep-the-change', '/lessons/api?q=change', '/lessons/api?k=wrong']) {
      const r = await get(port, p, { authorization: 'Bearer wrong' })
      assert.equal(r.status, nothing.status, p); assert.equal(r.body, nothing.body, p)
    }
    const shut = await post(port, '/lessons/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/list' })
    assert.equal(shut.status, nothing.status, 'MCP without the key')
    const auth = { authorization: `Bearer ${KEY}` }
    const api = await get(port, '/lessons/api?q=change', auth)
    assert.equal(api.status, 200)
    assert.equal(JSON.parse(api.body).lessons[0].id, 'ccc/keep-the-change')
    assert.match(String(api.headers['cache-control']), /private, no-store/)
    assert.equal(api.headers['x-robots-tag'], 'noindex')
    const mcp = await post(port, '/lessons/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_lesson', arguments: { id: 'scripts/witness-args' } } }, auth)
    assert.equal(mcp.status, 200)
    assert.equal(JSON.parse(JSON.parse(mcp.body).result.content[0].text).title, 'Read witness args from the right index')
    const key = await get(port, `/lessons/ccc/keep-the-change?k=${KEY}&lang=pt`)
    assert.equal(key.status, 303); assert.equal(key.headers.location, '/lessons/ccc/keep-the-change?lang=pt', 'the key leaves the address of a lesson page too')
    const cookie = String(key.headers['set-cookie']).split(';')[0]
    const page = await get(port, '/lessons/ccc/keep-the-change?lang=pt', { cookie })
    assert.equal(page.status, 200); assert.ok(page.body.includes('Never drop the change output') && page.body.includes('Lições relacionadas'))
    assert.equal((await get(port, '/lessons/ccc/no-such', { cookie })).status, nothing.status, 'an unknown lesson is an unknown route')
    const found = await get(port, '/lessons?q=witness', { cookie })
    assert.ok(found.body.includes('Read witness args') && !found.body.includes('>Keep the change output</a>'))
  })
})

// the released lessons, in the open
const PUB = { version: 1, generated: '2026-11-19T10:00:00Z', license: { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/', credit: 'x' }, notice: 'n',
  areas: { ccc: { name: 'CCC (TypeScript SDK)', summary: 'Building with CCC.' } },
  lessons: [{ id: 'ccc/keep-the-change', area: 'ccc', title: 'Keep the change output', lesson: 'Never drop the change output when the fee grows.', note: '', patterns: ['avoid: drop change'], concepts: ['Transaction building and fees'], applies_to: [], status: 'current', evidence: 'L0', first_seen: '2026-11-12', last_touched: '2026-11-17', sources: [{ repo: 'owner/repo', hash: 'abc1234', date: '2026-11-12' }], related: [] }] }

test('the released lessons page is for everyone: indexable, licensed, linked to its own paths and with no key or API in it', () => {
  const html = lessonsPage({ lang: 'en', base: 'https://pulse.example', url: 'https://pulse.example/learned', data: PUB, pub: true })
  assert.ok(html.includes('href="https://pulse.example/learned/ccc/keep-the-change?lang=en"') && html.includes('action="https://pulse.example/learned"'))
  assert.ok(!html.includes('name="robots"') && !html.includes('/lessons'), 'indexable, and nothing points to the private paths')
  assert.ok(html.includes('1 lessons from 1 projects so far, each one checked against the commit it came from.') && html.includes('CC BY 4.0') && html.includes('github.com/LusoCryptoLabs/ckb-pulse/issues/new') && html.includes('/learned.json'))
  assert.ok(html.includes('Drawn from public commits') && !/model/i.test(html.replace(/Model Context Protocol/g, '')), 'what it is, up front, without naming how it is checked')
  assert.ok(!html.includes('/lessons/api') && !html.includes('/lessons/mcp'))
  const one = lessonPage({ lang: 'pt', base: 'https://pulse.example', url: 'u', data: PUB, id: 'ccc/keep-the-change', pub: true })
  assert.ok(one.includes('https://github.com/owner/repo/commit/abc1234') && one.includes('CC BY 4.0') && !one.includes('name="robots"') && !one.includes('/lessons'))
  assert.ok(lessonsPage({ lang: 'zh', base: 'x', url: 'x', data: PUB, pub: true }).includes('每一条都对照其来源提交核对过'))
  assert.ok(!html.includes('released by a person') && !html.includes('A person chose'), 'the gate releases, not a person')
})

test('a withdrawn lesson says so with a 410, in three languages, and names the date', async () => {
  for (const [lang, want] of [['en', 'withdrawn on 2026-11-20'], ['pt', 'retirada em 2026-11-20'], ['zh', '2026-11-20 撤下']]) {
    assert.ok(withdrawnPage({ lang, base: 'https://pulse.example', url: 'u', date: '2026-11-20' }).includes(want), lang)
  }
  await withServer({ LESSONS_KEY: KEY }, { 'lessons.json': JSON.stringify(V2), 'public-lessons.json': JSON.stringify({ ...PUB, withdrawn: [{ id: 'ccc/old-one', date: '2026-11-20' }] }) }, async (port) => {
    const r = await get(port, '/learned/ccc/old-one'); assert.equal(r.status, 410); assert.ok(r.body.includes('withdrawn on 2026-11-20'))
    assert.equal((await get(port, '/learned/ccc/never-existed')).status, (await get(port, '/no-such-page-here')).status, 'an id that was never public is not announced')
    assert.equal((await get(port, '/learned/ccc/keep-the-change')).status, 200)
  })
})

test('on a running server: /learned does not exist until a lesson is released, then it opens without a key, and the private pages stay shut', async () => {
  await withServer({ LESSONS_KEY: KEY }, { 'lessons.json': JSON.stringify(V2) }, async (port) => {
    const nothing = await get(port, '/no-such-page-here')
    for (const p of ['/learned', '/learned.json', '/learned/ccc/keep-the-change']) { const r = await get(port, p); assert.equal(r.status, nothing.status, `${p}: no file, no route`); assert.equal(r.body, nothing.body) }
  })
  await withServer({ LESSONS_KEY: KEY }, { 'lessons.json': JSON.stringify(V2), 'public-lessons.json': JSON.stringify({ ...PUB, lessons: [] }) }, async (port) => {
    assert.equal((await get(port, '/learned')).status, (await get(port, '/no-such-page-here')).status, 'a file with no lesson in it is not a page either')
  })
  await withServer({ LESSONS_KEY: KEY }, { 'lessons.json': JSON.stringify(V2), 'public-lessons.json': JSON.stringify(PUB) }, async (port) => {
    const nothing = await get(port, '/no-such-page-here')
    const r = await get(port, '/learned?lang=pt')
    assert.equal(r.status, 200); assert.ok(r.body.includes('Keep the change output') && !r.body.includes('Read witness args'), 'only the released lesson, not the private file')
    assert.match(String(r.headers['cache-control']), /public/); assert.equal(r.headers['x-robots-tag'], undefined)
    const one = await get(port, '/learned/ccc/keep-the-change'); assert.equal(one.status, 200)
    assert.equal((await get(port, '/learned/scripts/witness-args')).status, nothing.status, 'a lesson only in the private file is not here')
    const j = await get(port, '/learned.json'); assert.equal(j.status, 200); assert.equal(JSON.parse(j.body).lessons.length, 1); assert.equal(j.headers['access-control-allow-origin'], '*')
    assert.equal((await get(port, '/lessons')).status, nothing.status, 'the private pages still need the key')
    assert.equal((await get(port, '/lessons/api?q=change')).status, nothing.status)
  })
})

// teaching, sharing, searching
const TL = { ...PUB, lessons: [
  { ...PUB.lessons[0], why: 'Without it the fee eats the change cell.', level: 'basic', related: [] },
  { ...PUB.lessons[0], id: 'ccc/second-one', title: 'Second one', lesson: 'Witnesses must follow the inputs order.', concepts: ['Witnesses and signatures'], level: 'advanced', why: 'A reordered input breaks the signature.', sources: [{ repo: 'other/app', hash: 'def5678', date: '2026-11-13' }, { repo: 'owner/repo', hash: 'abc1234', date: '2026-11-12' }] },
  { ...PUB.lessons[0], id: 'ccc/no-level', title: 'No level yet', lesson: 'Something else entirely.', level: null, why: null }] }

test('a lesson page says why it matters and its level, and a public one can be copied, cited and reported', () => {
  const html = lessonPage({ lang: 'en', base: 'https://pulse.example', url: 'u', data: TL, id: 'ccc/keep-the-change', pub: true })
  assert.ok(html.includes('Why it matters:</b> Without it the fee eats the change cell.') && html.includes('>Basic<'))
  assert.ok(html.includes('data-copy="https://pulse.example/learned/ccc/keep-the-change"') && html.includes('Copy as Markdown') && html.includes('## Keep the change output'))
  assert.ok(html.includes('LusoCryptoLabs, &quot;Keep the change output&quot;, CKB lessons, https://pulse.example/learned/ccc/keep-the-change, CC BY 4.0'))
  assert.ok(html.includes('https://github.com/LusoCryptoLabs/ckb-pulse/issues/new?title=Lesson%3A%20ccc%2Fkeep-the-change'), 'an issue with the id filled in')
  const priv = lessonPage({ lang: 'en', base: 'https://pulse.example', url: 'u', data: TL, id: 'ccc/keep-the-change' })
  assert.ok(!priv.includes('title=Lesson') && !priv.includes('Copy as Markdown'), 'the private page offers no copy of the lesson and puts no private id into a public issue')
  assert.ok(lessonPage({ lang: 'pt', base: 'x', url: 'u', data: TL, id: 'ccc/keep-the-change', pub: true }).includes('Porque importa:'))
})

test('the start page lists the basic lessons first with their why, and the rest by level, in three languages', () => {
  const html = startPage({ lang: 'en', base: 'https://pulse.example', url: 'u', data: TL, pub: true })
  assert.ok(html.indexOf('id="basic"') > 0 && html.indexOf('id="basic"') < html.indexOf('id="advanced"') && !html.includes('id="working"'))
  assert.ok(html.includes('Without it the fee eats the change cell.') && html.includes('A reordered input breaks the signature.'))
  assert.ok(html.includes('1 lessons have no level yet') && html.includes('level=basic'))
  for (const [lang, w] of [['pt', 'Começa aqui'], ['zh', '从这里开始']]) assert.ok(startPage({ lang, base: 'x', url: 'u', data: TL, pub: true }).includes(w), lang)
})

test('concepts are links that filter exactly, and a search that no lesson fully matches shows the closest ones and says so', () => {
  const v = visible(TL).lessons
  assert.deepEqual(searchLessons(v, { concept: 'Witnesses and signatures' }).map((l) => l.id), ['ccc/second-one'])
  assert.deepEqual(searchLessons(v, { level: 'basic' }).map((l) => l.id), ['ccc/keep-the-change'])
  assert.deepEqual(searchLessons(v, { q: 'witnesses reordered banana' }), [], 'strict by default')
  const loose = searchLessons(v, { q: 'witnesses reordered banana', loose: true })
  assert.equal(loose.partial, true); assert.equal(loose[0].id, 'ccc/second-one')
  const html = lessonsPage({ lang: 'en', base: 'https://pulse.example', url: 'u', data: TL, q: 'witnesses reordered banana', pub: true })
  assert.ok(html.includes('No lesson has every word. The closest 1:'))
  const idx = lessonsPage({ lang: 'en', base: 'https://pulse.example', url: 'u', data: TL, pub: true })
  assert.ok(idx.includes('?concept=Transaction%20building%20and%20fees') && idx.includes('/learned/start') && idx.includes('/learned.xml'))
})

test('an Atom feed of the released lessons, newest first, escaped', () => {
  const xmlOut = lessonsFeed({ base: 'https://pulse.example', data: { ...TL, lessons: [{ ...TL.lessons[0], title: 'A <b>&</b> title' }, { ...TL.lessons[1], last_touched: '2026-11-10' }] } })
  assert.ok(xmlOut.startsWith('<?xml') && xmlOut.includes('<feed xmlns="http://www.w3.org/2005/Atom">') && xmlOut.includes('A &lt;b&gt;&amp;&lt;/b&gt; title'))
  assert.ok(xmlOut.indexOf('A &lt;b&gt;') < xmlOut.indexOf('Second one'), 'newest first')
  assert.ok(xmlOut.includes('<id>https://pulse.example/learned/ccc/keep-the-change</id>'))
})

test('on a running server: the start page, the feed and the filters work in the open and in private', async () => {
  await withServer({ LESSONS_KEY: KEY }, { 'lessons.json': JSON.stringify(V2), 'public-lessons.json': JSON.stringify(TL) }, async (port) => {
    const s = await get(port, '/learned/start'); assert.equal(s.status, 200); assert.ok(s.body.includes('id="basic"'))
    const x = await get(port, '/learned.xml'); assert.equal(x.status, 200); assert.match(String(x.headers['content-type']), /atom\+xml/)
    const c = await get(port, '/learned?concept=Witnesses%20and%20signatures'); assert.ok(c.body.includes('Second one') && !c.body.includes('Keep the change output</a>'))
    const nothing = await get(port, '/no-such-page-here')
    assert.equal((await get(port, '/lessons/start')).status, nothing.status, 'the private start page needs the key')
    const k = await get(port, `/lessons/start?k=${KEY}`); assert.equal(k.status, 303)
  })
})

test('the repository holds no lessons data', () => {
  const files = execSync('git ls-files', { cwd: path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..') }).toString().split('\n')
  assert.deepEqual(files.filter((f) => /lessons[-.]data|(^|\/)lessons\.json$/.test(f)), [])
})

test('a released lesson has a share card and says so in its page; a private one has neither', async () => {
  const { lessonCard } = await import('../cards.mjs')
  const png = await lessonCard({ l: { id: 'a/b', title: 'Example lesson one', lesson: 'Do the example thing. '.repeat(8), sources: [{}], level: 'basic' }, lang: 'en', host: 'pulse.example' })
  assert.deepEqual([...png.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47])
  const args = { lang: 'en', base: 'https://pulse.example', url: 'u', data: DATA, id: 'example-topic/example-lesson-one' }
  assert.ok(lessonPage({ ...args, pub: true }).includes('og:image" content="https://pulse.example/og/lesson.png?id='))
  assert.ok(!lessonPage(args).includes('og:image'))
})

test('patterns labelled avoid and prefer show as before and after, and a commit that changed a test is linked', async () => {
  const { glossaryPage, reviewPage } = await import('../lessons.mjs')
  const d = { ...DATA, version: 1, topics: undefined, lessons: [lesson({ id: 'a/b', title: 'One', area: 'a', patterns: ['avoid: let x = 1', 'prefer: const x = 1'], tests: [{ repo: 'owner/repo', hash: 'abc1234', files: ['tests/a.test.ts'] }], concepts: ['Zeta', 'Alpha'], level: 'basic', related: [], sources: [{ repo: 'owner/repo', hash: 'abc1234', subject: 's' }] })], areas: { a: { name: 'A' } } }
  const html = lessonPage({ lang: 'en', base: 'https://p.example', url: 'u', data: d, id: 'a/b', pub: true })
  assert.ok(html.includes('class="avoid"') && html.includes('class="prefer"') && html.includes('const x = 1'))
  assert.ok(html.includes('https://github.com/owner/repo/commit/abc1234') && html.includes('tests/a.test.ts'))
  const g = glossaryPage({ lang: 'en', base: 'https://p.example', url: 'u', data: d, pub: true })
  assert.ok(g.indexOf('Alpha') < g.indexOf('Zeta') && g.includes('/learned?concept=Alpha'))
  const r = reviewPage({ lang: 'en', base: 'https://p.example', url: 'u', data: d, pub: true })
  assert.ok(r.includes('id="rv"') && r.includes('localStorage') && !r.includes('fetch('))
})

test('the index shows a few lessons per topic, a search pages at 12, and the cite block stays inside the column', () => {
  const many = Array.from({ length: 30 }, (_, i) => lesson({ id: `a/l${i}`, title: `Lesson number ${i}`, area: 'a', concepts: ['Shared'], related: [], sources: [{ repo: 'o/r', hash: 'abc1234', subject: 's' }] }))
  const d = { version: 1, generated: 'x', lessons: many, areas: { a: { name: 'A topic', summary: 's' } } }
  const args = { lang: 'en', base: 'https://p.example', url: 'u', data: d, pub: true }
  const index = lessonsPage(args)
  assert.equal((index.match(/class="ln/g) || []).length, 2)
  assert.ok(index.includes('/learned?area=a&amp;lang=en'))
  const p1 = lessonsPage({ ...args, concept: 'Shared' }), p3 = lessonsPage({ ...args, concept: 'Shared', page: '3' })
  assert.equal((p1.match(/class="ln/g) || []).length, 12)
  assert.equal((p3.match(/class="ln/g) || []).length, 6)
  assert.ok(p1.includes('page=2') && p3.includes('rel="prev"') && !p3.includes('rel="next"'))
  assert.ok(lessonPage({ ...args, id: 'a/l0' }).includes('.lp pre{white-space:pre-wrap'))
})

test('the public MCP server answers the released lessons, with links to /learned, and never the private file', async () => {
  const tools = publicLessonTools(() => ({ ...PUB, lessons: [{ ...PUB.lessons[0], checked: { date: '2026-11-19', verdict: 'right', against_commit: true } }] }))
  const run = (name, a) => tools.find((t) => t.name === name).run(a, { base: 'https://pulse.example' })
  const found = run('search_lessons', { query: 'change' })
  assert.deepEqual(found.lessons.map((l) => [l.id, l.url, l.checked.verdict]), [['ccc/keep-the-change', 'https://pulse.example/learned/ccc/keep-the-change', 'right']])
  assert.equal(run('get_lesson', { id: 'ccc/keep-the-change' }).url, 'https://pulse.example/learned/ccc/keep-the-change')
  assert.equal(publicLessonTools(() => null).find((t) => t.name === 'search_lessons').run({ query: 'x' }, { base: 'b' }).count, 0, 'no file, no lessons')
  await withServer({ LESSONS_KEY: KEY }, { 'lessons.json': JSON.stringify(V2), 'public-lessons.json': JSON.stringify(PUB) }, async (port) => {
    const post = (body) => new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port, path: '/mcp', method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' } }, (res) => { let b = ''; res.on('data', (c) => { b += c }); res.on('end', () => resolve(JSON.parse(b.slice(b.indexOf('{'))))) })
      req.on('error', reject); req.end(JSON.stringify(body))
    })
    const names = (await post({ jsonrpc: '2.0', id: 1, method: 'tools/list' })).result.tools.map((t) => t.name)
    assert.ok(names.includes('overview') && names.includes('search_lessons') && names.includes('get_lesson'), names.join())
    const pub = JSON.parse((await post({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'search_lessons', arguments: { query: 'change' } } })).result.content[0].text)
    assert.deepEqual(pub.lessons.map((l) => l.id), ['ccc/keep-the-change'])
    const priv = JSON.parse((await post({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'search_lessons', arguments: { query: 'witness' } } })).result.content[0].text)
    assert.equal(priv.count, 0, 'a lesson only in the private file is not on the public server')
    const init = (await post({ jsonrpc: '2.0', id: 4, method: 'initialize', params: { protocolVersion: '2025-06-18' } })).result
    assert.match(init.instructions, /CKB lessons/)
  })
})

test('a project shows what CKB learned from it, and the lessons page filters by project with credit', async () => {
  const { lessonsOf } = await import('../lessons.mjs')
  const two = { ...PUB, lessons: [PUB.lessons[0], { ...PUB.lessons[0], id: 'ccc/other', title: 'Other one', sources: [{ repo: 'else/where', hash: 'def5678', date: '2026-11-13' }] }] }
  assert.deepEqual(lessonsOf(two, 'Owner/Repo'), { count: 1, top: [{ id: 'ccc/keep-the-change', title: 'Keep the change output' }] }, 'GitHub names are not case sensitive')
  assert.deepEqual(lessonsOf(null, 'owner/repo'), { count: 0, top: [] })
  assert.deepEqual(lessonsOf({ version: 2, lessons: two.lessons }, 'owner/repo'), { count: 0, top: [] }, 'only the released file')
  const html = lessonsPage({ lang: 'en', base: 'https://pulse.example', url: 'u', data: two, repo: 'owner/repo', pub: true })
  assert.ok(html.includes('Lessons from owner/repo') && html.includes('Keep the change output') && !html.includes('Other one'))
  assert.ok(!lessonsPage({ lang: 'en', base: 'b', url: 'u', data: two, repo: '../x', pub: true }).includes('<h2>Lessons from'), 'a bad name is ignored')
  const one = lessonPage({ lang: 'pt', base: 'https://pulse.example', url: 'u', data: two, id: 'ccc/keep-the-change', pub: true })
  assert.ok(one.includes('/learned?repo=owner%2Frepo&amp;lang=pt') && one.includes('mais deste projeto'))
})

test('check_code returns the lessons about what the code uses, flags a repeated avoid pattern, and nothing for code with no CKB in it', async () => {
  const L = [
    { id: 'ccc/fee', area: 'ccc', title: 'completeFeeBy adds change', lesson: 'completeFeeBy adds a change output instead of shrinking one.', patterns: ['avoid: await tx.completeFeeBy(signer);', 'prefer: await tx.completeFeeChangeToOutput(signer, 0);'], sources: [{ repo: 'a/b', hash: '1' }] },
    { id: 'scripts/since', area: 'scripts', title: 'Handle None from extract_metric', lesson: 'since.extract_metric() returns None for a bad since.', patterns: ['avoid: let (ty, inner_value) = since.extract_metric().unwrap();'], sources: [{ repo: 'a/c', hash: '2' }] },
    { id: 'other/epoch', area: 'other', title: 'Absolute epoch since needs the 0x20 flag', lesson: 'Set 0x2000000000000000 for an absolute epoch.', patterns: [], sources: [{ repo: 'a/d', hash: '3' }] },
    { id: 'node/live', area: 'node', title: 'get_live_cell may say unknown', lesson: 'get_live_cell returns unknown for a spent cell it no longer knows.', patterns: [], sources: [{ repo: 'a/e', hash: '4' }] },
  ]
  const fee = checkCode(L, ['await tx.completeInputsByCapacity(signer);', 'await tx.completeFeeBy(signer);'].join('\n'))
  assert.equal(fee[0].id, 'ccc/fee'); assert.match(fee[0].match, /avoid/); assert.deepEqual(fee[0].prefer, ['await tx.completeFeeChangeToOutput(signer, 0);'])
  const since = checkCode(L, 'let (ty, value) = since.extract_metric().unwrap();')
  assert.equal(since[0].id, 'scripts/since'); assert.match(since[0].match, /avoid/, 'a local name in the pattern differs from the code: still a hit')
  assert.equal(checkCode(L, 'const F = 0x2000_0000_0000_0000n')[0].id, 'other/epoch', 'hex constants match with or without underscores')
  const live = checkCode(L, 'r = rpc.call("get_live_cell", [op, False])')
  assert.equal(live[0].id, 'node/live'); assert.match(live[0].match, /uses what/)
  assert.deepEqual(checkCode(L, "import React, { useState } from 'react'; export const C = () => { const [n, setN] = useState(0); return n }"), [], 'no CKB, no lesson')
  assert.ok(agentRule('https://p.example').includes('call check_code') && agentRule('https://p.example').includes('https://p.example/mcp') && !/[\u2013\u2014]/.test(agentRule('x')))
  await withServer({ LESSONS_KEY: KEY }, { 'lessons.json': JSON.stringify(V2), 'public-lessons.json': JSON.stringify({ ...PUB, lessons: [{ ...PUB.lessons[0], patterns: ['avoid: drop_change_output(tx)'] }] }) }, async (port) => {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'check_code', arguments: { code: 'drop_change_output(tx)' } } })
    const r = await new Promise((resolve, reject) => { const q = http.request({ host: '127.0.0.1', port, path: '/mcp', method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' } }, (res) => { let b = ''; res.on('data', (c) => { b += c }); res.on('end', () => resolve(JSON.parse(b.slice(b.indexOf('{'))))) }); q.on('error', reject); q.end(body) })
    const out = JSON.parse(r.result.content[0].text)
    assert.equal(out.lessons[0].url.endsWith('/learned/ccc/keep-the-change'), true); assert.match(out.lessons[0].match, /avoid/)
    const use = await get(port, '/use?lang=en'); assert.ok(use.body.includes('id="rule"') && use.body.includes('call check_code') && use.body.includes('check_code</code>'))
  })
})

test('POST /api/check: the lessons for changed lines, with the file and line, one each; a bad body is a 400; too many calls a 429', async () => {
  const { checkChunks } = await import('../lessons.mjs')
  const L = [{ id: 'ccc/fee', area: 'ccc', title: 'completeFeeBy adds change', lesson: 'x', patterns: ['avoid: await tx.completeFeeBy(signer);'], sources: [{ repo: 'a/b', hash: '1' }] }]
  const r = checkChunks(L, [{ path: 'src/a.ts', start: 40, code: ['const x = 1', 'await tx.completeFeeBy(signer);'].join('\n') }, { path: 'src/b.ts', start: 3, code: 'tx.completeFeeBy(s)' }])
  assert.equal(r.length, 1, 'a lesson comes once')
  assert.deepEqual([r[0].path, r[0].line], ['src/a.ts', 41], 'where the avoid pattern is repeated, at its own line')
  await withServer({ LESSONS_KEY: KEY }, { 'lessons.json': JSON.stringify(V2), 'public-lessons.json': JSON.stringify({ ...PUB, lessons: [{ ...PUB.lessons[0], patterns: ['avoid: drop_change_output(tx)'] }] }) }, async (port) => {
    const post = (body) => new Promise((resolve, reject) => { const q = http.request({ host: '127.0.0.1', port, path: '/api/check', method: 'POST', headers: { 'content-type': 'application/json' } }, (res) => { let b = ''; res.on('data', (c) => { b += c }); res.on('end', () => resolve({ status: res.statusCode, body: b })) }); q.on('error', reject); q.end(body) })
    const ok = await post(JSON.stringify({ chunks: [{ path: 'lib/tx.rs', start: 10, code: 'let a = 1;\ndrop_change_output(tx);' }] }))
    assert.equal(ok.status, 200)
    const j = JSON.parse(ok.body)
    assert.deepEqual([j.count, j.lessons[0].id, j.lessons[0].path, j.lessons[0].line], [1, 'ccc/keep-the-change', 'lib/tx.rs', 11])
    assert.ok(j.lessons[0].url.endsWith('/learned/ccc/keep-the-change'))
    assert.equal((await post('{"nope":1}')).status, 400)
    let last = 0
    for (let k = 0; k < 31; k++) last = (await post(JSON.stringify({ chunks: [{ path: 'a', code: 'x' }] }))).status
    assert.equal(last, 429, 'the 32nd call in a minute from one address waits')
  })
})

test('a public lesson asks its maintainers to confirm it, and shows who did', async () => {
  const { confirmUrl } = await import('../lessons.mjs')
  const l = PUB.lessons[0]
  const u = new URL(confirmUrl('https://pulse.example', l))
  assert.equal(u.origin + u.pathname, 'https://github.com/LusoCryptoLabs/ckb-pulse/issues/new')
  assert.equal(u.searchParams.get('title'), 'Lesson: ccc/keep-the-change', 'the title the lessons pipeline reads')
  assert.match(u.searchParams.get('body'), /^https:\/\/pulse\.example\/learned\/ccc\/keep-the-change\n\nVerdict: right\n/, 'and its verdict line')
  const plain = lessonPage({ lang: 'en', base: 'https://pulse.example', url: 'u', data: PUB, id: l.id, pub: true })
  assert.ok(plain.includes('Do you maintain a project this lesson came from?') && !plain.includes('Confirmed by'))
  const conf = { ...PUB, lessons: [{ ...l, evidence: 'L2', confirmed: { by: 'alice', role: 'owner', date: '2026-11-20' } }] }
  const html = lessonPage({ lang: 'pt', base: 'https://pulse.example', url: 'u', data: conf, id: l.id, pub: true })
  assert.ok(html.includes('Confirmada por <a href="https://github.com/alice"') && html.includes('dono do projeto') && html.includes('2026-11-20'))
  const bad = { ...PUB, lessons: [{ ...l, confirmed: { by: 'a"><script>', role: 'owner', date: 'x' } }] }
  assert.ok(!lessonPage({ lang: 'en', base: 'b', url: 'u', data: bad, id: l.id, pub: true }).includes('Confirmed by'), 'a login that is not a GitHub login is not shown')
  assert.ok(!lessonPage({ lang: 'en', base: 'b', url: 'u', data: V2, id: 'ccc/keep-the-change' }).includes('issues/new?title=Lesson'), 'the private page does not ask')
})

test('a project page offers one issue for all its lessons, in parts when there are many', async () => {
  const { batchConfirmUrls, BATCH } = await import('../lessons.mjs')
  const ids = Array.from({ length: BATCH + 5 }, (_, k) => `ccc/lesson-${k}`)
  const urls = batchConfirmUrls('https://pulse.example', 'toastmanAu/daowow', ids)
  assert.equal(urls.length, 2)
  const u = new URL(urls[0])
  assert.equal(u.searchParams.get('title'), 'Lessons: toastmanAu/daowow', 'the title the lessons pipeline reads')
  const lines = u.searchParams.get('body').split(String.fromCharCode(10)).filter((l) => l.startsWith('right | '))
  assert.deepEqual([lines.length, lines[0]], [BATCH, 'right | ccc/lesson-0'])
  assert.ok(new URL(urls[1]).searchParams.get('body').includes(`right | ccc/lesson-${BATCH + 4}`))
  assert.ok(urls.every((x) => x.length < 7000), 'an address GitHub accepts')
  const html = lessonsPage({ lang: 'en', base: 'https://pulse.example', url: 'u', data: PUB, repo: 'owner/repo', pub: true })
  assert.ok(html.includes('Do you maintain this project?') && html.includes('issues/new?title=Lessons%3A%20owner%2Frepo'))
  assert.ok(!lessonsPage({ lang: 'en', base: 'https://pulse.example', url: 'u', data: PUB, pub: true }).includes('title=Lessons%3A'), 'only on a project page')
})
