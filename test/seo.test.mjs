// Canonical addresses, the other languages, and the project pages (seo.mjs, project.mjs)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canonicalOf, withSeo } from '../seo.mjs'
import { projectPage, projectsPage, indexable, projectPath } from '../project.mjs'

const B = 'https://pulse.example'
const q = (s) => new URLSearchParams(s)

test('the canonical keeps what makes a page different and drops the rest; English has no lang', () => {
  assert.equal(canonicalOf(B, '/digest', q('p=month&theme=dark&d=2026-11-26'), 'en'), `${B}/digest?p=month`)
  assert.equal(canonicalOf(B, '/digest', q('p=month'), 'pt'), `${B}/digest?p=month&lang=pt`)
  assert.equal(canonicalOf(B, '/method', q('utm_source=x&lang=zh'), 'zh'), `${B}/method?lang=zh`)
  assert.equal(canonicalOf(B, '/', q(''), 'en'), `${B}/`)
  // a link to a project on the live view counts as the project's page; any other link on it is the live view
  assert.equal(canonicalOf(B, '/', q('repo=ckb-devrel/ccc&lang=pt'), 'pt'), `${B}/project/ckb-devrel/ccc?lang=pt`)
  assert.equal(canonicalOf(B, '/', q('person=alice'), 'en'), `${B}/live`)
  assert.equal(canonicalOf(B, '/', q('repo=../../etc'), 'en'), `${B}/live`)
})

test('withSeo adds the canonical and the three languages, once, and leaves noindex and canonical pages alone', () => {
  const page = '<!doctype html><html lang="pt"><head><title>x</title></head><body></body></html>'
  const out = withSeo(page, { base: B, pathname: '/forum', query: q('c=tech') })
  assert.ok(out.includes(`<link rel="canonical" href="${B}/forum?c=tech&amp;lang=pt">`), out)
  for (const [h, href] of [['en', `${B}/forum?c=tech`], ['pt', `${B}/forum?c=tech&amp;lang=pt`], ['zh-Hans', `${B}/forum?c=tech&amp;lang=zh`], ['x-default', `${B}/forum?c=tech`]]) assert.ok(out.includes(`hreflang="${h}" href="${href}"`), h)
  assert.ok(!out.includes('"WebSite"'), 'the site data is on the landing only')
  assert.ok(withSeo(page, { base: B, pathname: '/', query: q('') }).includes('"WebSite"'))
  const noindex = page.replace('<title>', '<meta name="robots" content="noindex"><title>')
  assert.equal(withSeo(noindex, { base: B, pathname: '/compare', query: q('') }), noindex)
  const own = page.replace('<title>', `<link rel="canonical" href="${B}/learned"><title>`)
  assert.equal(withSeo(own, { base: B, pathname: '/learned', query: q('') }), own)
})

const detail = (over = {}) => ({
  name: 'ckb-devrel/ccc', url: 'https://github.com/ckb-devrel/ccc', group: 'ckb-devrel', desc: 'CKBers\' Codebase <b>', stars: 120, lang: 'TypeScript', topics: [], pushedAt: '2026-11-25T10:00:00Z', createdAt: '2024-01-02T00:00:00Z',
  daily: { days: 30, people: [...new Array(27).fill(0), 2, 0, 3], bots: new Array(30).fill(0) },
  months: [{ month: '2026-10', devs: 4, commits: 31 }, { month: '2026-11', devs: 3, commits: 12 }],
  contributors: [{ login: 'alice', n: 4 }, { login: 'bob', n: 1 }],
  events: [{ at: '2026-11-25T10:00:00Z', kind: 'pr_merged', actor: 'alice', title: 'fix(core): <script>', url: 'https://github.com/ckb-devrel/ccc/pull/1' }, { at: '2026-11-24T10:00:00Z', kind: 'push', actor: 'bob', title: 'fix(core): <script>', url: '' }],
  ...over,
})

test('a project page says the facts, escapes what GitHub gives, names no person and is marked as code', () => {
  const html = projectPage({ lang: 'en', base: B, d: detail(), lessons: { count: 1, top: [{ id: 'ccc/a', title: 'A lesson' }] }, forum: [{ id: 11375, title: 'A topic' }] })
  assert.ok(html.includes('<h1>ccc</h1>'))
  assert.ok(html.includes('5 updates by people in the last 30 days, on 2 of those days.'))
  assert.ok(html.includes('fix(core): &lt;script&gt;') && !html.includes('<script>fix'))
  assert.equal(html.split('fix(core): &lt;script&gt;').length - 1, 1, 'a title that comes back is shown once')
  assert.ok(html.includes('CKBers&#39;') || html.includes("CKBers'"))
  assert.ok(html.includes('Codebase &lt;b&gt;'), 'the description is escaped')
  assert.ok(!/\balice\b|\bbob\b/.test(html), 'people are counted, not named')
  assert.ok(html.includes('"@type":"SoftwareSourceCode"') && html.includes('"codeRepository":"https://github.com/ckb-devrel/ccc"'))
  assert.ok(html.includes(`${B}/learned/ccc/a?lang=en`) && html.includes('https://talk.nervos.org/t/11375'))
  assert.ok(!html.includes('noindex'))
  for (const lang of ['pt', 'zh']) assert.ok(!/\bpj\.[a-z.]+\b/.test(projectPage({ lang, base: B, d: detail() })), `${lang}: a missing word shows its key`)
})

test('a project with no work by people in 30 days and no commits in 12 months is not indexed', () => {
  const quiet = detail({ daily: { days: 30, people: new Array(30).fill(0), bots: new Array(30).fill(1) }, months: [{ month: '2026-11', devs: 0, commits: 0 }] })
  assert.equal(indexable(quiet), false)
  assert.ok(projectPage({ lang: 'en', base: B, d: quiet }).includes('<meta name="robots" content="noindex">'))
  assert.equal(indexable(detail({ daily: quiet.daily })), true, 'commits in the months are enough')
  assert.equal(indexable(detail({ months: null })), true, 'work in the 30 days is enough')
})

test('the list of projects puts the busy ones first and links every one', () => {
  const rows = [{ name: 'a/quiet', updates: 0, desc: '' }, { name: 'b/some', updates: 3, desc: 'x' }, { name: 'c/most', updates: 9, desc: '' }]
  const html = projectsPage({ lang: 'en', base: B, rows })
  assert.ok(html.indexOf('c/most') < html.indexOf('b/some') && html.indexOf('b/some') < html.indexOf('a/quiet'))
  for (const r of rows) assert.ok(html.includes(`${B}${projectPath(r.name)}?lang=en`), r.name)
  assert.ok(html.includes('3 public CKB projects on GitHub. 2 had work'))
})
