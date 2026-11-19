// "Who builds on what" lists a library while people build on it, and reads manifests in subfolders.
// Measured on 2026-11-19: reading the root manifest alone found 45 CCC projects where there were 126, and Lumos,
// listed by hand, had 5 active projects of 16 while ckb-testtool (79 projects) was not on the page.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

process.env.DATA_DIR ||= fs.mkdtempSync(path.join(os.tmpdir(), 'impact-use-'))
const { LIBS, shownLibs, manifestPaths, goDeps, matching, scan, impactPage, keepScan } = await import('../impact.mjs')

const NOW = Date.parse('2026-11-19T12:00:00Z')
const ago = (d) => new Date(NOW - d * 864e5).toISOString()
const use = (owners, days) => owners.map((o, k) => ({ repo: `${o}/app${k}`, group: 'builders', pushedAt: ago(days) }))
const empty = () => Object.fromEntries(LIBS.map((l) => [l.id, []]))

test('a library is listed while three owners use it and one project is active, most active first', () => {
  const libs = { ...empty(), ccc: use(['a', 'b', 'c', 'd'], 2), 'ckb-std': use(['a', 'b', 'c'], 5), lumos: use(['a', 'b', 'c'], 90), spore: use(['a', 'a', 'a'], 1), molecule: [...use(['a', 'b'], 60), ...use(['c'], 3)] }
  const data = { at: NOW, scanned: 10, total: 10, libs }
  assert.deepEqual(shownLibs(data, NOW).map((l) => l.id), ['ccc', 'ckb-std', 'molecule'])
  // Lumos: three owners, none active in 30 days. Spore: active, but one owner
  const later = { ...data, libs: { ...libs, lumos: [...libs.lumos, ...use(['z'], 1)] } }
  assert.ok(shownLibs(later, NOW).some((l) => l.id === 'lumos'), 'it comes back the day it is used again')
  assert.deepEqual(shownLibs(null, NOW).map((l) => l.id), ['ccc'], 'before the first count')
  assert.deepEqual(shownLibs({ libs: empty() }, NOW).map((l) => l.id), ['ccc'], 'nothing qualifies: the first of the catalogue')
})

test('a library that left the list keeps its page, with a line that says why, and is not in the switch of the others', () => {
  const libs = { ...empty(), ccc: use(['a', 'b', 'c'], 2), lumos: use(['a', 'b', 'c'], 90) }
  const data = keepScan(null, { at: NOW, scanned: 10, total: 10, libs }, '2026-11-19')
  const page = (lib) => impactPage({ lang: 'en', base: 'https://p.example', url: 'u', lib, data, now: NOW })
  assert.ok(!page('ccc').includes('lib=lumos'), 'not offered from another page')
  const lumos = page('lumos')
  assert.ok(lumos.includes('3 of the 10 projects Pulse follows use Lumos') && lumos.includes('Few projects build on Lumos now'), 'its own page still answers')
  assert.ok(lumos.includes('<b>Lumos</b>') && lumos.includes('lib=ccc&amp;lang=en'))
})

test('manifests are read up to three folders deep, and never in a copy of other people\'s code', () => {
  const got = manifestPaths(['package.json', 'apps/web/package.json', 'contracts/lock/Cargo.toml', 'a/b/c/Cargo.toml', 'a/b/c/d/Cargo.toml', 'node_modules/x/package.json', 'vendor/y/Cargo.toml', 'go.mod', 'README.md', 'tests/fixtures/z/package.json'])
  assert.deepEqual(got, ['package.json', 'apps/web/package.json', 'contracts/lock/Cargo.toml', 'a/b/c/Cargo.toml', 'go.mod'])
  assert.deepEqual(goDeps('module x\n\nrequire (\n\tgithub.com/nervosnetwork/ckb-sdk-go/v2 v2.3.0\n\tgithub.com/pkg/errors v0.9.1\n)\n'), ['github.com/nervosnetwork/ckb-sdk-go', 'github.com/pkg/errors'])
  assert.deepEqual(matching('go', ['github.com/nervosnetwork/ckb-sdk-go']), ['ckb-sdk-go'])
  assert.deepEqual(matching('cargo', ['ckb-testtool', 'molecule', 'ckb-types', 'serde']).sort(), ['ckb-testtool', 'ckb-types', 'molecule'])
  assert.deepEqual(matching('npm', ['@nervosnetwork/fiber-js', '@joyid/ckb', '@ckb-js-std/core', 'react']).sort(), ['ckb-js-std', 'fiber-js', 'joyid'])
})

test('a scan finds a library used only in a subfolder; with no file list it falls back to the root', async () => {
  const FILES = {
    'm/mono:apps/web/package.json': JSON.stringify({ dependencies: { '@ckb-ccc/core': '1' } }),
    'm/mono:contracts/lock/Cargo.toml': '[dependencies]\nckb-std = "0.16"\n[dev-dependencies]\nckb-testtool = "0.13"\n',
    'm/mono:package.json': JSON.stringify({ devDependencies: { turbo: '2' } }),
    'r/root:package.json': JSON.stringify({ dependencies: { '@ckb-ccc/core': '1' } }),
  }
  const TREES = { 'm/mono': ['package.json', 'apps/web/package.json', 'contracts/lock/Cargo.toml', 'node_modules/@ckb-lumos/base/package.json'] }
  const get = async (url) => { const m = url.match(/githubusercontent\.com\/([^/]+\/[^/]+)\/HEAD\/(.+)$/); return FILES[`${m[1]}:${decodeURIComponent(m[2])}`] ?? null }
  const repos = [{ name: 'm/mono', lang: 'TypeScript', pushedAt: ago(1) }, { name: 'r/root', lang: 'TypeScript', pushedAt: ago(1) }]
  const deep = await scan(repos, { get, tree: async (n) => TREES[n] || null, now: NOW })
  assert.deepEqual(deep.libs.ccc.map((p) => p.repo).sort(), ['m/mono', 'r/root'])
  assert.deepEqual([deep.libs['ckb-std'].length, deep.libs['ckb-testtool'].length, deep.libs.lumos.length], [1, 1, 0])
  const rootOnly = await scan(repos, { get, now: NOW })
  assert.deepEqual(rootOnly.libs.ccc.map((p) => p.repo), ['r/root'], 'the control: the root alone misses the monorepo')
})
