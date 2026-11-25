// The forum week (forum.mjs): what counts as a post, a reply, a new topic and a person, how topics are filed, what a
// program gets, and what the page shows from data that comes from outside.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { weekOf, fetchPosts, readForum, forumPage, forumJson, forumBrief, forumBriefHtml, groupOfCat, GROUPS, FORUM } from '../forum.mjs'
import { digestPage, feedEntries, loadDigests, weeks } from '../digest.mjs'
import { words } from '../cards.mjs'
import { WORDS } from '../public/words.js'

const NOW = Date.parse('2026-11-25T12:00:00Z'), H = 3600e3, DAY = 24 * H
let nextId = 1000
const post = (o) => ({ id: nextId++, post_type: 1, hidden: false, deleted_at: null, user_deleted: false, username: 'ana', created_at: new Date(NOW - H).toISOString(), post_number: 2, topic_id: 1, topic_title: 'A topic', category_id: 69, raw: '', cooked: '', ...o })
const NAMES = { 69: 'Infrastructure', 65: 'CKB Community Fund DAO', 74: 'General' }
const POSTS = [
  post({ topic_id: 1, post_number: 1, username: 'ana', topic_title: 'New lock <script>', raw: 'see https://github.com/Nervosnetwork/CKB/pull/1 and https://github.com/someone/else' }),
  post({ topic_id: 1, username: 'rui' }), post({ topic_id: 1, username: 'ana' }),
  post({ topic_id: 2, post_number: 9, username: 'eva', topic_title: 'An old topic', category_id: 65 }),
  post({ topic_id: 3, post_number: 1, username: 'rui', topic_title: 'Quiet', category_id: 74 }),
]

test('a category is technical, funding or everything else', () => {
  assert.deepEqual([69, 70, 76, 71].map(groupOfCat), ['tech', 'tech', 'tech', 'tech'])
  assert.deepEqual([73, 65, 77].map(groupOfCat), ['funding', 'funding', 'funding'])
  assert.deepEqual([74, 68, 72, 9999, undefined].map(groupOfCat), ['other', 'other', 'other', 'other', 'other'])
})

test('the week counts posts, replies, new topics and people, by group', () => {
  const w = weekOf(POSTS, { now: NOW, known: ['nervosnetwork/ckb'], names: NAMES, authors: { 2: 'zoe' } })
  assert.deepEqual(w.stats.tech, { topics: 1, fresh: 1, posts: 3, people: 2 })
  assert.deepEqual(w.stats.funding, { topics: 1, fresh: 0, posts: 1, people: 1 })
  assert.deepEqual(w.stats.other, { topics: 1, fresh: 1, posts: 1, people: 1 })
  assert.deepEqual(w.stats.all, { topics: 3, fresh: 2, posts: 5, people: 3 }, 'a person who wrote in two groups is one person in all')
  const [a, b, c] = w.topics
  assert.deepEqual([a.id, a.replies, a.people, a.isNew, a.author, a.category], [1, 2, 2, true, 'ana', 'Infrastructure'], 'the post that opens a topic is not a reply')
  assert.deepEqual(a.repos, ['nervosnetwork/ckb'], 'a followed project, whatever the case of the link; a repository Pulse does not follow is not listed')
  assert.deepEqual([b.id, b.replies, b.isNew, b.author], [2, 1, false, 'zoe'], 'an older topic with a post this week is not new; who opened it comes from what was kept')
  assert.deepEqual([c.id, c.replies, c.isNew], [3, 0, true])
})

test('what is not a post by a person in the week is not counted', () => {
  const base = weekOf([post({})], { now: NOW }).stats.all.posts
  assert.equal(base, 1, 'the control: a plain post counts')
  for (const bad of [{ post_type: 3 }, { hidden: true }, { deleted_at: '2026-11-25T00:00:00Z' }, { user_deleted: true }, { username: 'system' }, { username: 'discobot' }, { username: 'a b' }, { username: '' }, { topic_id: '1' }, { created_at: 'soon' }])
    assert.equal(weekOf([post(bad)], { now: NOW }).stats.all.posts, 0, JSON.stringify(bad))
})

test('reading stops at the week and says when the pages ran out first', async () => {
  const pages = [[post({ id: 30, created_at: new Date(NOW - H).toISOString() }), post({ id: 29, created_at: new Date(NOW - 2 * DAY).toISOString() })], [post({ id: 28, created_at: new Date(NOW - 6 * DAY).toISOString() }), post({ id: 27, created_at: new Date(NOW - 8 * DAY).toISOString() })], [post({ id: 26, created_at: new Date(NOW - 9 * DAY).toISOString() })]]
  const asked = []
  const get = async (u) => { asked.push(u); return { latest_posts: pages[asked.length - 1] || [] } }
  const r = await fetchPosts({ now: NOW, get, pause: 0 })
  assert.deepEqual(asked, [`${FORUM}/posts.json`, `${FORUM}/posts.json?before=29`], 'the third page is not asked for')
  assert.deepEqual([r.posts.map((p) => p.id), r.complete], [[30, 29, 28], true])
  const short = await fetchPosts({ now: NOW, get: async () => ({ latest_posts: [post({ id: 5, created_at: new Date(NOW - H).toISOString() })] }), pause: 0, maxPages: 2 })
  assert.equal(short.complete, false)
  await assert.rejects(readForum({ known: [], now: NOW, pause: 0, prev: { names: {}, namesAt: NOW }, get: async () => ({ latest_posts: Array.from({ length: 2 }, () => post({ created_at: new Date(NOW - H).toISOString() })) }) }), /did not fit/, 'a week that was cut short is not kept as a quiet week')
})

test('a reading asks once who opened an older topic, and keeps only what the week needs', async () => {
  const asked = []
  const get = async (u) => {
    asked.push(u.replace(FORUM, ''))
    if (u.endsWith('/site.json')) return { categories: [{ id: 65, name: 'CKB Community Fund DAO' }] }
    if (u.includes('/posts.json')) return { latest_posts: [POSTS[3], post({ topic_id: 2, created_at: new Date(NOW - 8 * DAY).toISOString() })] }
    if (u.endsWith('/t/2.json')) return { details: { created_by: { username: 'zoe' } } }
    throw new Error('not expected ' + u)
  }
  const d = await readForum({ known: [], get, now: NOW, pause: 0, prev: { authors: { 77: 'gone' } } })
  assert.deepEqual(asked, ['/site.json', '/posts.json', '/t/2.json'])
  assert.deepEqual([d.topics[0].author, d.topics[0].category, d.authors], ['zoe', 'CKB Community Fund DAO', { 2: 'zoe' }])
  asked.length = 0
  await readForum({ known: [], get, now: NOW + H, pause: 0, prev: d })
  assert.deepEqual(asked, ['/posts.json'], 'the names are a day old at most, and the author is not asked again')
})

const DATA = weekOf([...POSTS, ...Array.from({ length: 11 }, (_, i) => [post({ topic_id: 100 + i, post_number: 1, topic_title: `Topic ${i}` }), post({ topic_id: 100 + i, username: 'rui' })]).flat()], { now: NOW, known: ['nervosnetwork/ckb'], names: NAMES, authors: { 2: 'zoe' } })

test('the page opens on the technical topics, and every topic of a group can be reached', () => {
  const page = (group, lang = 'en') => forumPage({ lang, base: 'https://pulse.example', url: 'https://pulse.example/forum', data: DATA, group })
  const html = page(undefined)
  assert.ok(html.includes('<b>Technical</b>') && html.includes('href="https://pulse.example/forum?c=all&amp;lang=en">All</a>'))
  assert.equal(html.match(/class="tt"/g).length, DATA.stats.tech.topics, 'ten shown, the others behind one tap, none lost')
  assert.ok(html.includes('<summary>Show the other 2</summary>'))
  assert.ok(html.includes('New lock &lt;script&gt;') && !html.includes('<script>alert') && !html.includes('New lock <script>'), 'a title from outside is text')
  assert.ok(html.includes(`<a class="tt" href="${FORUM}/t/1" rel="noreferrer">`) && html.includes(`by <a href="${FORUM}/u/ana" rel="noreferrer">ana</a>`))
  assert.ok(html.includes('<span class="chip new">new</span>') && html.includes('<b>2 replies</b>') && html.includes('2 people'))
  assert.ok(html.includes('href="https://pulse.example/?repo=nervosnetwork%2Fckb&amp;lang=en">ckb</a>'))
  assert.ok(!html.includes('An old topic') && page('funding').includes('An old topic') && page('funding').includes('<b>1 reply</b>'))
  assert.ok(page('other').includes('New, waiting for a first reply') && page('other').includes('no reply yet'))
  assert.equal(page('all').match(/class="tt"/g).length, DATA.stats.all.topics)
  assert.ok(page('nonsense').includes('<b>Technical</b>'))
  assert.ok(page('all', 'pt').includes('<b>Tudo</b>') && page('all', 'pt').includes('Mais discutidos') && page(undefined, 'zh').includes('讨论最多'))
  for (const lang of ['en', 'pt', 'zh']) for (const k of page('all', lang).matchAll(/>((?:fo|use|me|m)\.[a-z.0-9]+)</g)) assert.fail(`word missing in ${lang}: ${k[1]}`)
  assert.ok(forumPage({ lang: 'en', base: '', url: '/forum', data: null }).includes('has not been read yet'))
})

test('a program gets the same week, and nothing kept only for the next reading', () => {
  const j = forumJson({ ...DATA, names: NAMES, namesAt: 1, authors: { 2: 'zoe' } }, 'funding')
  assert.deepEqual(Object.keys(j), ['at', 'since', 'group', 'stats', 'groups', 'topics'])
  assert.deepEqual(j.topics, [{ id: 2, url: `${FORUM}/t/2`, title: 'An old topic', author: 'zoe', category: 'CKB Community Fund DAO', group: 'funding', new: false, replies: 1, people: 1, last: new Date(NOW - H).toISOString(), projects: [] }])
  assert.equal(forumJson(DATA, 'x').group, 'tech')
  assert.deepEqual(Object.keys(j.groups), GROUPS)
})

test('every forum word exists in each language', () => {
  const keys = Object.keys(WORDS.en).filter((k) => /^(fo\.|m\.forum|use\.forum|use\.api\.forum|me\.forum)/.test(k))
  assert.ok(keys.length > 25)
  for (const lang of ['pt', 'zh']) assert.deepEqual(keys.filter((k) => !WORDS[lang][k]), [], lang)
})

test('the digest carries the technical counts and the three most discussed technical topics', () => {
  const b = forumBrief(DATA, NOW)
  assert.deepEqual(b.stats, DATA.stats.tech)
  assert.equal(b.top.length, 3)
  assert.ok(b.top.every((x) => x.replies > 0) && b.top[0].replies >= b.top[2].replies)
  assert.ok(!b.top.some((x) => x.title === 'An old topic'), 'a funding topic is not technical')
  assert.equal(forumBrief(DATA, NOW + 3 * DAY), null, 'a reading older than two days is not this week')
  assert.equal(forumBrief(null), null)
  assert.equal(forumBrief({ ...DATA, topics: DATA.topics.filter((x) => x.group !== 'tech'), stats: { ...DATA.stats, tech: { topics: 0, fresh: 0, posts: 0, people: 0 } } }, NOW), null, 'a week with no technical topic has no section')
  const quiet = weekOf([post({ topic_id: 7, post_number: 1, topic_title: 'Alone' })], { now: NOW })
  assert.deepEqual(forumBrief(quiet, NOW).top, [{ id: 7, title: 'Alone', replies: 0 }], 'with no reply anywhere, the newest topics')
})

test('the week digest shows the forum, the day and the month do not, and a kept week shows what was kept', () => {
  const L = { stats: { updates: 5, people: 2, projects: 1 }, repos: [], commits: [], people: [], orgs: [], bars: [] }
  const page = (o) => digestPage({ period: 'week', lang: 'en', leaders: { day: L, week: L, month: L }, news: [], trends: null, groupOf: () => 'g', base: 'https://pulse.example', url: 'https://pulse.example/digest', ...o })
  const b = { at: NOW, stats: { topics: 19, fresh: 11, posts: 36, people: 18 }, top: [{ id: 5, title: 'A <b>title</b>', replies: 7 }, { id: 6, title: 'Second', replies: 0 }] }
  const html = page({ forum: b })
  assert.ok(html.includes('<h2>On the forum this week</h2><p>Technical topics: 19 · new: 11 · posts: 36 · people: 18</p>'))
  assert.ok(html.includes(`<a href="${FORUM}/t/5" rel="noreferrer">A &lt;b&gt;title&lt;/b&gt;</a></span><b>7 replies</b>`) && html.includes('<b>no reply yet</b>'))
  assert.ok(html.includes('href="https://pulse.example/forum?lang=en">The whole forum week</a>'))
  assert.ok(!page({}).includes('On the forum') && !page({ forum: null }).includes('On the forum'), 'the control: no forum data, no section, and the page still renders')
  assert.ok(!page({ forum: b, period: 'day' }).includes('On the forum') && !page({ forum: b, period: 'month' }).includes('On the forum'))
  assert.ok(page({ forum: b, lang: 'pt' }).includes('No fórum esta semana') && page({ forum: b, lang: 'zh' }).includes('技术话题：19'))
  for (const bad of [{ stats: null, top: [] }, { stats: b.stats, top: 'x' }, {}]) assert.ok(!page({ forum: bad }).includes('On the forum'), JSON.stringify(bad))
  assert.ok(page({ forum: { stats: { topics: '<i>', fresh: 1, posts: 1, people: 1 }, top: [{ id: 'x', title: 't' }] } }).includes('Technical topics: 0 ·'), 'a kept record is read as numbers')
  assert.equal(forumBriefHtml(words('en'), null, { base: '', lang: 'en' }), '')
})

test('a kept week with the forum shows it in the feed, and a week kept before does not break', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-forum-'))
  const week = (at, extra) => ({ at, stats: { updates: 9, people: 3, projects: 2 }, repos: [['a/b', 5]], commits: [], people: [['ana', 4]], orgs: [], news: [], ...extra })
  fs.writeFileSync(path.join(dir, 'digests.json'), JSON.stringify({ weeks: [week(NOW - 7 * DAY), week(NOW, { forum: { at: NOW, stats: { topics: 2, fresh: 1, posts: 4, people: 3 }, top: [{ id: 9, title: 'Kept topic', replies: 2 }] } })] }))
  loadDigests(dir)
  assert.equal(weeks().length, 2)
  const e = feedEntries({ lang: 'en', news: [], groupOf: () => 'g', base: 'https://pulse.example' })
  assert.equal(e.length, 2)
  assert.ok(e[0].html.includes('<h4>On the forum this week</h4>') && e[0].html.includes('Kept topic') && e[0].html.includes('<b>2 replies</b>'))
  assert.ok(!e[1].html.includes('On the forum'), 'the older week has no forum record')
  fs.rmSync(dir, { recursive: true, force: true })
})
