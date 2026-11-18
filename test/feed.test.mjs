// The feed for a person: a page that explains it and gives the link, and a browser that opens the XML address is sent
// there, while a feed reader still gets the XML.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { feedPage } from '../feed.mjs'
import { words } from '../cards.mjs'

const base = 'https://pulse.example'
const news = [{ name: 'a/new-thing', group: 'builders', desc: 'A new <thing>', createdAt: '2026-11-15T00:00:00Z', announcedAt: Date.parse('2026-11-16T10:00:00Z') }, { name: 'b/older', group: 'builders', desc: '', createdAt: '2026-11-10T00:00:00Z', announcedAt: Date.parse('2026-11-11T10:00:00Z') }]
const page = (lang) => feedPage({ lang, base, url: `${base}/feed`, news, groupOf: () => 'builders' })

test('the page explains the feed, in each language, in three steps', () => {
  for (const lang of ['en', 'pt', 'zh']) {
    const html = page(lang), t = words(lang)
    for (const k of ['fd.lead', 'fd.s1', 'fd.s2', 'fd.s3', 'fd.latest']) assert.ok(html.includes(t(k)), `${lang} ${k}`)
    assert.equal((html.match(/<ol class="steps"><li>[\s\S]*?<\/ol>/)[0].match(/<li>/g) || []).length, 3, lang)
    assert.doesNotMatch(html.replace(/<style>[\s\S]*?<\/style>/, '').replace(/<[^>]+>/g, ' '), /\bfd\.[a-z]+\b|\bm\.feed\b/, `${lang}: a word shows its key`)
  }
})

test('the link to copy is the feed in the page language, with a button that copies it, and two readers open it', () => {
  const html = page('pt'), feed = `${base}/feed.xml?lang=pt`, enc = encodeURIComponent(feed)
  assert.ok(html.includes(`<pre><code>${feed}</code></pre>`))
  assert.ok(html.includes(`data-copy="${feed}"`) && html.includes('data-copied="Link copiado"'))
  assert.ok(html.includes(`href="https://feedly.com/i/subscription/feed/${enc}"`) && html.includes(`href="https://www.inoreader.com/?add_feed=${enc}"`))
  assert.ok(html.includes(`${feed}&amp;raw=1`), 'the raw link asks for the XML, so a browser is not sent back')
  assert.ok(html.includes(`<link rel="alternate" type="application/atom+xml" title="CKB Pulse" href="${feed}">`))
})

test('it lists what the feed carries now, newest first, escaped', () => {
  const html = page('en'), list = html.match(/<ul class="latest">([\s\S]*?)<\/ul>/)[1]
  assert.equal((list.match(/<li>/g) || []).length, 2)
  assert.ok(list.indexOf('new-thing') < list.indexOf('older'))
  assert.ok(list.includes('href="https://pulse.example/?repo=a%2Fnew-thing&amp;lang=en"') && list.includes('datetime="2026-11-16T10:00:00.000Z"'))
  assert.ok(!html.includes('<thing>'))
})

test('it has a share button and the studio in the bar like every page', () => {
  const html = page('en')
  assert.equal((html.match(/class="pshare"/g) || []).length, 1)
  assert.ok(html.includes('class="pm-by-lcl"'))
})

const free = () => new Promise((r) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)) }) })
const get = (port, p, headers = {}) => new Promise((resolve, reject) => { http.get({ host: '127.0.0.1', port, path: p, headers }, (res) => { let body = ''; res.on('data', (c) => { body += c }); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body })) }).on('error', reject) })

test('on a running server: a browser is sent to the page, a reader gets the XML', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-fd-'))
  const port = await free()
  const child = spawn(process.execPath, ['server.mjs'], { env: { ...process.env, PORT: String(port), DATA_DIR: dir, PULSE_OFFLINE: '1', GITHUB_TOKEN: 'offline' }, stdio: 'ignore' })
  try {
    for (let i = 0; i < 100; i++) { try { if ((await get(port, '/health')).status === 200) break } catch {} await new Promise((r) => setTimeout(r, 100)) }
    const browser = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,*/*;q=0.8'
    const r = await get(port, '/feed.xml?lang=pt', { accept: browser })
    assert.equal(r.status, 302); assert.equal(r.headers.location, '/feed?lang=pt')
    for (const accept of ['application/atom+xml', 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*', 'text/html, application/atom+xml', '*/*', undefined]) {
      const x = await get(port, '/feed.xml?lang=pt', accept ? { accept } : {}); assert.equal(x.status, 200, String(accept)); assert.match(x.headers['content-type'], /atom\+xml/); assert.ok(x.body.startsWith('<?xml'))
    }
    const raw = await get(port, '/feed.xml?lang=pt&raw=1', { accept: browser }); assert.equal(raw.status, 200); assert.match(raw.headers['content-type'], /atom\+xml/)
    const p = await get(port, '/feed?lang=pt'); assert.equal(p.status, 200); assert.ok(p.body.includes('class="steps"'))
  } finally { child.kill(); fs.rmSync(dir, { recursive: true, force: true }) }
})
