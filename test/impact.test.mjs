// Who builds on what: reading dependencies from public manifests, counting them, and the page and API that show them.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { npmDeps, cargoDeps, matching, scan, keepScan, impactOf, impactPage, fetchText, LIBS } from '../impact.mjs'
import { OPT_OUT } from '../config.mjs'

const NOW = Date.parse('2026-11-18T12:00:00Z')
const daysAgo = (n) => new Date(NOW - n * 864e5).toISOString()

test('package.json: every kind of dependency, and nothing from a file that is not JSON', () => {
  const names = npmDeps(JSON.stringify({ name: 'x', dependencies: { '@ckb-ccc/core': '1' }, devDependencies: { vite: '5' }, peerDependencies: { '@ckb-lumos/lumos': '1' }, optionalDependencies: { '@spore-sdk/core': '1' }, scripts: { '@ckb-ccc/fake': 'x' } }))
  assert.deepEqual(names.sort(), ['@ckb-ccc/core', '@ckb-lumos/lumos', '@spore-sdk/core', 'vite'])
  assert.deepEqual(npmDeps('not json'), [])
  assert.deepEqual(npmDeps('{"dependencies": 5}'), [])
})

test('Cargo.toml: the keys under the dependency tables, including the workspace one', () => {
  const toml = ['[package]', 'name = "x"', 'ckb-std = "should not count here"', '', '[dependencies]', 'ckb-std = "0.15"', 'serde = { version = "1" }', 'blake2b-ref.workspace = true', '', '[workspace.dependencies]', 'ckb-types = "1"', '', '[dev-dependencies]', 'ckb-testtool = "1"', '', '[features]', 'ckb-std-feature = []'].join('\r\n')
  assert.deepEqual(cargoDeps(toml), ['ckb-std', 'serde', 'blake2b-ref', 'ckb-types', 'ckb-testtool'])
})

test('matching: a family of packages, an exact crate, and not a look-alike', () => {
  assert.deepEqual(matching('npm', ['@ckb-ccc/shell', 'react']), ['ccc'])
  assert.deepEqual(matching('npm', ['@ckb-ccc-fake/x', 'ckb-ccc']), [])
  assert.deepEqual(matching('cargo', ['ckb-std']), ['ckb-std'])
  assert.deepEqual(matching('cargo', ['ckb-std-extra', 'my-ckb-std']), [])
  assert.deepEqual(matching('npm', ['@ckb-lumos/base', '@spore-sdk/core']).sort(), ['lumos', 'spore'])
})

const fake = (files) => async (url) => {
  const m = url.match(/raw\.githubusercontent\.com\/([^/]+\/[^/]+)\/HEAD\/(.+)$/)
  if (!m) throw new Error('unexpected url ' + url)
  const v = files[`${m[1]}:${m[2]}`]
  if (v instanceof Error) throw v
  return v ?? null
}
const repos = [
  { name: 'a/web', lang: 'TypeScript', group: 'builders', pushedAt: daysAgo(2) },
  { name: 'b/contract', lang: 'Rust', group: 'builders', pushedAt: daysAgo(40) },
  { name: 'c/mixed', lang: '', group: 'builders', pushedAt: daysAgo(5) },
  { name: 'd/none', lang: 'TypeScript', group: 'builders', pushedAt: daysAgo(1) },
  { name: 'e/broken', lang: 'TypeScript', group: 'builders', pushedAt: daysAgo(1) },
]
const files = {
  'a/web:package.json': JSON.stringify({ dependencies: { '@ckb-ccc/core': '1' } }),
  'b/contract:Cargo.toml': '[dependencies]\nckb-std = "0.15"\n',
  'b/contract:package.json': JSON.stringify({ dependencies: { '@ckb-ccc/core': '1' } }), // not read: a Rust project is read by its Cargo.toml
  'c/mixed:package.json': JSON.stringify({ dependencies: { '@ckb-lumos/lumos': '1' } }),
  'c/mixed:Cargo.toml': '[dependencies]\nckb-std = "1"\n',
  'e/broken:package.json': new Error('network'),
}

test('scan: who uses what, by the file that fits the language, a missing file is none and an error leaves the project out', async () => {
  const r = await scan(repos, { get: fake(files), now: NOW })
  assert.deepEqual(r.libs.ccc.map((p) => p.repo), ['a/web'], 'the Rust project is not counted for CCC through a package.json it is not read by')
  assert.deepEqual(r.libs['ckb-std'].map((p) => p.repo).sort(), ['b/contract', 'c/mixed'])
  assert.deepEqual(r.libs.lumos.map((p) => p.repo), ['c/mixed'])
  assert.equal(r.scanned, 4, 'the broken one is not counted as scanned')
  assert.equal(r.total, 5)
  assert.equal(r.at, NOW)
})

test('scan: a person on the leave list is not read at all', async () => {
  OPT_OUT.add('a')
  try {
    const seen = []
    const r = await scan(repos, { get: async (u) => { seen.push(u); return fake(files)(u) }, now: NOW })
    assert.ok(!seen.some((u) => u.includes('/a/web/')))
    assert.ok(!r.libs.ccc.some((p) => p.repo.startsWith('a/')))
  } finally { OPT_OUT.delete('a') }
})

test('keepScan: one count per library per day, a second scan the same day replaces the first', () => {
  const res = (n) => ({ at: NOW, scanned: 4, total: 5, libs: Object.fromEntries(LIBS.map((l) => [l.id, Array.from({ length: l.id === 'ccc' ? n : 0 }, (_, i) => ({ repo: `o/r${i}`, pushedAt: '' }))])) })
  const a = keepScan(null, res(3), '2026-11-17'), b = keepScan(a, res(4), '2026-11-18'), c = keepScan(b, res(5), '2026-11-18')
  assert.deepEqual(c.series.map((s) => [s.d, s.ccc]), [['2026-11-17', 3], ['2026-11-18', 5]])
  let d = c
  for (let i = 0; i < 400; i++) d = keepScan(d, res(1), `2027-01-${String(1 + (i % 28)).padStart(2, '0')}-${i}`)
  assert.ok(d.series.length <= 366)
})

const DATA = keepScan(null, {
  at: NOW, scanned: 330, total: 340,
  libs: {
    ccc: [{ repo: 'a/web', group: 'builders', pushedAt: daysAgo(2) }, { repo: 'a/second', group: 'builders', pushedAt: daysAgo(1) }, { repo: 'z/old', group: 'builders', pushedAt: daysAgo(90) }, { repo: 'y/<img src=x>', group: 'builders', pushedAt: daysAgo(0) }],
    lumos: [{ repo: 'q/only', group: 'builders', pushedAt: daysAgo(3) }], spore: [], 'ckb-std': [],
  },
}, '2026-11-18')

test('impactOf: active means work in the last 30 days, owners are counted once, and a leaver is taken out at read time', () => {
  const r = impactOf(DATA, 'ccc', NOW)
  assert.equal(r.using, 4); assert.equal(r.active, 3); assert.equal(r.owners, 3)
  OPT_OUT.add('z')
  try { assert.equal(impactOf(DATA, 'ccc', NOW).using, 3) } finally { OPT_OUT.delete('z') }
  assert.equal(impactOf(null, 'ccc', NOW), null)
  assert.equal(impactOf(DATA, 'nope', NOW).lib, 'ccc', 'an unknown library is the first one')
})

const page = (lang, lib = 'ccc', data = DATA) => impactPage({ lang, base: 'https://pulse.example', url: 'https://pulse.example/impact', lib, data, now: NOW })
const text = (html) => html.replace(/<style>[\s\S]*?<\/style>/, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

test('the page says it in one sentence, in each language, and shows the numbers and the lists', () => {
  const want = { en: '4 of the 330 projects Pulse follows use CCC. 3 of them had work in the last 30 days.', pt: '4 dos 330 projetos que o Pulse segue usam o CCC. 3 deles tiveram trabalho nos últimos 30 dias.', zh: 'Pulse 关注的 330 个项目中，有 4 个使用 CCC，其中 3 个在最近 30 天有工作。' }
  for (const [lang, sentence] of Object.entries(want)) {
    const html = page(lang), plain = html.match(/<p class="lede plain">([\s\S]*?)<\/p>/)[1]
    assert.equal(plain, sentence, lang)
    assert.match(html, /<b>4<\/b><span>/); assert.ok(html.includes('href="https://pulse.example/?repo=a%2Fweb&amp;lang=' + lang), lang)
    assert.doesNotMatch(text(html), /\b(im|use|m)\.[a-z]+\b/, `${lang}: a word shows its key`)
  }
})

test('the page has a share button, a switch between libraries, language links that keep the library, and escapes names', () => {
  const html = page('en')
  assert.equal((html.match(/class="pshare"/g) || []).length, 1)
  assert.ok(html.includes('data-copy="https://pulse.example/impact?lib=ccc&amp;lang=en&amp;d='))
  assert.ok(html.includes('<b>CCC</b>') && !html.includes('lib=lumos&amp;lang=en'), 'Lumos has one owner here: it is not listed')
  assert.ok(html.includes('href="https://pulse.example/impact?lib=ccc&amp;lang=pt"'))
  assert.ok(!html.includes('<img src=x>') && html.includes('&lt;img src=x&gt;'))
})

test('one project, none, and no count yet each say the right thing', () => {
  assert.ok(text(page('en', 'lumos')).includes('One of the 330 projects Pulse follows uses Lumos.'))
  assert.ok(text(page('en', 'spore')).includes('None of the projects Pulse follows use Spore SDK yet'))
  assert.ok(text(page('en', 'ccc', null)).includes('The first count has not finished yet'))
})

test('the trend waits for a few days of counts and says when counting began', () => {
  assert.ok(text(page('en')).includes('Counting started on 18 November 2026'))
  let d = DATA
  for (const day of ['2026-11-19', '2026-11-20']) d = keepScan(d, { at: NOW, scanned: 330, total: 340, libs: DATA.libs }, day)
  const html = page('en', 'ccc', d)
  assert.match(html, /<div class="bars"/); assert.doesNotMatch(text(html), /Counting started/)
})

const free = () => new Promise((r) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)) }) })
const get = (port, p) => new Promise((resolve, reject) => { http.get({ host: '127.0.0.1', port, path: p }, (res) => { let body = ''; res.on('data', (c) => { body += c }); res.on('end', () => resolve({ status: res.statusCode, body })) }).on('error', reject) })
async function withServer(files, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-im-'))
  for (const [n, c] of Object.entries(files)) fs.writeFileSync(path.join(dir, n), c)
  const port = await free()
  const child = spawn(process.execPath, ['server.mjs'], { env: { ...process.env, PORT: String(port), DATA_DIR: dir, PULSE_OFFLINE: '1', GITHUB_TOKEN: 'offline' }, stdio: 'ignore' })
  try {
    for (let i = 0; i < 100; i++) { try { if ((await get(port, '/health')).status === 200) break } catch {} await new Promise((r) => setTimeout(r, 100)) }
    await fn(port)
  } finally { child.kill(); fs.rmSync(dir, { recursive: true, force: true }) }
}

test('on a running server: the page and the API answer from the file on the volume, and say so when there is none', async () => {
  await withServer({ 'impact.json': JSON.stringify(DATA) }, async (port) => {
    const page = await get(port, '/impact?lib=lumos&lang=pt')
    assert.equal(page.status, 200); assert.ok(page.body.includes('Um dos 330 projetos'))
    const api = await get(port, '/api/impact?lib=ccc')
    assert.equal(api.status, 200)
    const j = JSON.parse(api.body)
    assert.equal(j.using, 4); assert.equal(j.lib, 'ccc'); assert.ok(Array.isArray(j.projects))
    assert.equal(JSON.parse((await get(port, '/api/impact?lib=garbage')).body).lib, 'ccc')
  })
  await withServer({}, async (port) => {
    assert.equal((await get(port, '/impact')).status, 200)
    const api = await get(port, '/api/impact')
    assert.equal(api.status, 503); assert.deepEqual(JSON.parse(api.body), { status: 'counting' })
  })
})

test('fetchText: a 404 is no file, any other failure is an error and not a project that uses nothing', async () => {
  const real = globalThis.fetch
  try {
    const answer = (status, body = '') => { globalThis.fetch = async () => new Response(body, { status }) }
    answer(200, '{"a":1}'); assert.equal(await fetchText('https://x/y'), '{"a":1}')
    answer(404); assert.equal(await fetchText('https://x/y'), null)
    for (const status of [403, 429, 500, 503]) { answer(status); await assert.rejects(() => fetchText('https://x/y'), new RegExp(String(status))) }
  } finally { globalThis.fetch = real }
})
