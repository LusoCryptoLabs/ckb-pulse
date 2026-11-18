// Moving the address: the old address carries a browser's settings to the new one in the fragment, and every page takes them
// in, only the keys of this app, never over what the new address holds.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { KEYS, MIGRATE_SCRIPT, legacyPage } from '../migrate.mjs'
import { menuHead } from '../digest.mjs'
import { landingPage } from '../landing.mjs'

const TO = 'https://pulse.lusocryptolabs.com'
const code = (s) => s.replace(/^<script>/, '').replace(/<\/script>$/, '')
const store = (o = {}) => { const m = new Map(Object.entries(o)); return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) } }

// what the old address's page does in a browser: returns where it sends the browser
function send({ ls = {}, pathname = '/', search = '', hash = '', throws = false }) {
  let to = null
  const s = store(ls)
  const storage = throws ? { getItem: () => { throw new Error('blocked') } } : s
  const page = legacyPage(TO), script = page.match(/<script>([\s\S]*)<\/script>/)[1]
  vm.runInNewContext(script, { localStorage: storage, location: { pathname, search, hash, replace: (u) => { to = u } }, btoa: (x) => Buffer.from(x, 'binary').toString('base64'), escape, unescape, encodeURIComponent, Object, JSON })
  return to
}
// what a page at the new address does with a fragment
function receive({ hash, ls = {}, pathname = '/use', search = '?lang=pt', throws = false }) {
  const s = store(ls); let url = null
  const storage = throws ? { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } } : s
  vm.runInNewContext(code(MIGRATE_SCRIPT), { localStorage: storage, location: { hash, pathname, search }, history: { replaceState: (_a, _b, u) => { url = u } }, atob: (x) => Buffer.from(x, 'base64').toString('binary'), escape, unescape, decodeURIComponent, Object, JSON })
  return { kept: Object.fromEntries(s.m), url }
}
const frag = (url) => url.slice(url.indexOf('#'))

test('the keys are the ones this app keeps on a device, and only those', () => {
  assert.deepEqual(KEYS, ['ckbpulse.lang', 'ckbpulse.seen', 'ckbpulse.theme', 'ckbpulse.view', 'ckbpulse.ui', 'ckbpulse.follows', 'ckbpulse.seenNews'])
  const src = fs.readFileSync(new URL('../public/pulse3d.js', import.meta.url), 'utf8')
  for (const k of [...src.matchAll(/store\.(?:get|set)\('([a-zA-Z]+)'/g)].map((m) => m[1])) assert.ok(KEYS.includes(`ckbpulse.${k}`), `the page keeps ${k} and the move would lose it`)
})

test('round trip: what the old address reads is what the new one keeps, with the path, the query and the old fragment', () => {
  const ls = { 'ckbpulse.lang': 'pt', 'ckbpulse.seen': '1', 'ckbpulse.theme': 'dark', 'ckbpulse.follows': JSON.stringify({ repos: ['ckb-devrel/ccc'], people: ['Hanssen0'], news: true }), 'unrelated': 'x', 'ckbpulse.other': 'y' }
  const to = send({ ls, pathname: '/use', search: '?lang=pt', hash: '#ai' })
  assert.ok(to.startsWith(`${TO}/use?lang=pt#ckbmigrate=`), to.slice(0, 60))
  assert.ok(!to.includes('unrelated') && !/[+/=]/.test(frag(to).slice(12)), 'only the allowlisted keys, base64url without padding')
  const got = receive({ hash: frag(to) })
  assert.deepEqual(got.kept, { 'ckbpulse.lang': 'pt', 'ckbpulse.seen': '1', 'ckbpulse.theme': 'dark', 'ckbpulse.follows': ls['ckbpulse.follows'] })
  assert.equal(got.url, '/use?lang=pt#ai', 'the address is cleaned and the old fragment comes back')
})

test('unicode survives, and nothing to carry still redirects with the fragment it had', () => {
  const to = send({ ls: { 'ckbpulse.follows': '{"people":["josé","中文"]}' } })
  assert.equal(receive({ hash: frag(to) }).kept['ckbpulse.follows'], '{"people":["josé","中文"]}')
  assert.equal(send({ pathname: '/digest', search: '?p=week', hash: '#x' }), `${TO}/digest?p=week#x`)
  assert.equal(send({ pathname: '/' }), `${TO}/`)
  assert.equal(send({ ls: { 'ckbpulse.lang': 'pt' }, throws: true, pathname: '/feed' }), `${TO}/feed`, 'a blocked store only loses the settings')
})

test('too much to carry is dropped rather than sent', () => {
  const to = send({ ls: { 'ckbpulse.follows': 'x'.repeat(9000) }, pathname: '/', hash: '#keep' })
  assert.equal(to, `${TO}/#keep`)
})

test('the receiver never overwrites, never takes a key that is not the app\'s, and ignores garbage', () => {
  const payload = (o) => '#ckbmigrate=' + Buffer.from(unescape(encodeURIComponent(JSON.stringify(o))), 'binary').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  assert.deepEqual(receive({ hash: payload({ 'ckbpulse.lang': 'pt' }), ls: { 'ckbpulse.lang': 'zh' } }).kept, { 'ckbpulse.lang': 'zh' }, 'what the new address already has wins')
  assert.deepEqual(receive({ hash: payload({ 'evil': 'x', 'ckbpulse.admin': 'y', '__proto__': { a: 1 }, 'ckbpulse.lang': 5, 'ckbpulse.seen': 'x'.repeat(20000) }) }).kept, {}, 'a foreign key, a non-text value, a huge value')
  for (const hash of ['#ckbmigrate=!!!', '#ckbmigrate=', '#ckbmigrate=e30', '#other', '', '#ckbmigrate=' + 'A'.repeat(50)]) { assert.doesNotThrow(() => receive({ hash }), hash) }
  assert.deepEqual(receive({ hash: '#other' }).kept, {}); assert.equal(receive({ hash: '#other' }).url, null, 'a fragment that is not ours is left alone')
  assert.doesNotThrow(() => receive({ hash: payload({ 'ckbpulse.lang': 'pt' }), throws: true }))
  assert.equal(receive({ hash: payload({ 'ckbpulse.lang': 'pt', '#': 'javascript:alert(1)' }) }).url, '/use?lang=pt', 'a stored fragment must start with #')
})

test('every page runs the receiver before anything reads a setting', () => {
  assert.ok(menuHead('https://x').indexOf(MIGRATE_SCRIPT) > 0 && menuHead('https://x').indexOf(MIGRATE_SCRIPT) < menuHead('https://x').indexOf('ckbpulse.theme'), 'before the look is read')
  const land = landingPage({ lang: 'en', base: 'https://x', url: 'https://x/', stats: null })
  assert.ok(land.indexOf(MIGRATE_SCRIPT) > 0 && land.indexOf(MIGRATE_SCRIPT) < land.indexOf("localStorage.getItem('ckbpulse.seen')"), 'before the landing decides whether to skip itself')
  const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8')
  assert.ok(html.indexOf('<!--migrate-->') > 0 && html.indexOf('<!--migrate-->') < html.indexOf("localStorage.setItem('ckbpulse.ui'"), 'the live page, before it reads the layout and the view')
  assert.ok(fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8').includes(".replace('<!--migrate-->', MIGRATE_SCRIPT)"))
})

test('the old address redirects to the new one, in the files that name it', () => {
  for (const f of ['README.md', 'server.json', 'mcp.mjs']) assert.ok(!fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').includes('pulse-lab.lusocryptolabs.com'), f)
  const conf = fs.readFileSync(new URL('../ops/pulse-legacy.nginx.conf', import.meta.url), 'utf8')
  assert.ok(conf.includes('return 301 https://pulse.lusocryptolabs.com$request_uri;') && conf.includes('return 308 https://pulse.lusocryptolabs.com$request_uri;'))
  assert.ok(conf.includes('/.well-known/acme-challenge/'), 'the old certificate keeps renewing')
})
