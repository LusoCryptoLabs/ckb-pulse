// The talk on Nervos Talk in the last seven days, counted from the forum's own public list of posts
// (talk.nervos.org/posts.json, no key): which topics had a post, how many replies and people each had, which are
// new, who opened them, and which name a project Pulse follows. Titles, names, counts and links only: no text of a
// post is kept or shown. Read once an hour, a few requests each time, a pause between them.
import fs from 'node:fs'
import path from 'node:path'
import { words } from './cards.mjs'
import { today } from './public/menu.js'
import { CSS, READING_CSS, pageFoot, pageBar, menuHead, menuScript, pageHead, crumbs } from './digest.mjs'

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
export const FORUM = 'https://talk.nervos.org'
const WEEK = 7 * 864e5
// The forum's own categories, as the author chose them. Technical: Infrastructure, Applications & Ecosystem (and
// what is under it), Cryptoeconomics & Mechanism Design. Funding: DAOs & Funding and what is under it. Read 2026-11-25.
const TECH = new Set([69, 70, 76, 71])
const FUNDING = new Set([73, 65, 77])
export const GROUPS = ['tech', 'funding', 'other', 'all']
export const groupOfCat = (id) => (TECH.has(id) ? 'tech' : FUNDING.has(id) ? 'funding' : 'other')
const LINK = /github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/g
const NAME = /^[A-Za-z0-9_.-]{1,60}$/
const SHOWN = 10
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
// a post by a person that everyone can see; the forum's own notices and its helper accounts are not talk
const counts = (p) => p && p.post_type === 1 && !p.hidden && !p.deleted_at && !p.user_deleted && Number.isInteger(p.topic_id) && NAME.test(String(p.username)) && p.username !== 'system' && p.username !== 'discobot' && Number.isFinite(Date.parse(p.created_at))

// the posts of the last seven days, newest first, a page at a time. `complete` is false when the pages ran out
// before the week did, so a busy week is not shown as a quiet one.
export async function fetchPosts({ now = Date.now(), get, pause = 1500, maxPages = 40 }) {
  const out = []
  let before = null, complete = false
  for (let page = 0; page < maxPages; page++) {
    const j = await get(`${FORUM}/posts.json${before ? `?before=${before}` : ''}`)
    const rows = Array.isArray(j?.latest_posts) ? j.latest_posts : []
    if (!rows.length) { complete = true; break }
    out.push(...rows)
    const last = rows[rows.length - 1]
    if (Date.parse(last.created_at) < now - WEEK || !Number.isInteger(last.id)) { complete = true; break }
    before = last.id
    await sleep(pause)
  }
  return { posts: out.filter((p) => Date.parse(p.created_at) >= now - WEEK && Date.parse(p.created_at) <= now + 60e3), complete }
}

// posts -> the week, by topic. `known` is the projects Pulse follows ("owner/name"), `names` the forum's category
// names by id, `authors` who opened a topic whose first post is older than the week.
export function weekOf(posts, { now = Date.now(), known = [], names = {}, authors = {} } = {}) {
  const byKey = new Map(known.map((f) => [f.toLowerCase(), f]))
  const topics = new Map()
  const who = Object.fromEntries(GROUPS.map((g) => [g, new Set()]))
  for (const p of posts) {
    if (!counts(p)) continue
    const group = groupOfCat(p.category_id)
    let t = topics.get(p.topic_id)
    if (!t) topics.set(p.topic_id, t = { id: p.topic_id, title: String(p.topic_title || '').slice(0, 200), group, category: String(names[p.category_id] || '').slice(0, 60), posts: 0, people: new Set(), isNew: false, last: 0, repos: new Set(), author: NAME.test(String(authors[p.topic_id])) ? authors[p.topic_id] : '' })
    t.posts++
    t.people.add(p.username)
    who[group].add(p.username); who.all.add(p.username)
    t.last = Math.max(t.last, Date.parse(p.created_at))
    if (p.post_number === 1) { t.isNew = true; t.author = p.username }
    for (const m of `${p.raw || ''} ${p.cooked || ''}`.matchAll(LINK)) {
      const full = byKey.get(`${m[1]}/${m[2].replace(/\.git$/, '')}`.toLowerCase())
      if (full) t.repos.add(full)
    }
  }
  // a reply is a post that does not open the topic
  const list = [...topics.values()].map((t) => ({ ...t, people: t.people.size, repos: [...t.repos].sort(), replies: t.posts - (t.isNew ? 1 : 0) }))
  const stats = {}
  for (const g of GROUPS) {
    const rows = g === 'all' ? list : list.filter((t) => t.group === g)
    stats[g] = { topics: rows.length, fresh: rows.filter((t) => t.isNew).length, posts: rows.reduce((n, t) => n + t.posts, 0), people: who[g].size }
  }
  return { at: now, since: now - WEEK, stats, topics: list.sort((a, b) => b.replies - a.replies || b.people - a.people || b.last - a.last) }
}

// ---------- kept on disk, read once an hour ----------
let file = ''
let DATA = null // { at, since, stats, topics, names, namesAt, authors }
export function loadForum(dir) {
  file = path.join(dir, 'forum.json')
  try { DATA = JSON.parse(fs.readFileSync(file, 'utf8')) } catch { DATA = null }
  return DATA
}
const save = () => { const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(DATA)); fs.renameSync(tmp, file) }
export const forumNow = () => (DATA?.stats && Array.isArray(DATA.topics) ? DATA : null)
const getJson = async (u) => {
  const r = await fetch(u, { headers: { 'user-agent': 'ckb-pulse (+https://github.com/LusoCryptoLabs/ckb-pulse)', accept: 'application/json' }, signal: AbortSignal.timeout(20e3) })
  if (!r.ok) throw new Error(`${r.status} ${u}`)
  return r.json()
}
export async function readForum({ known, get = getJson, now = Date.now(), pause = 1500, prev = DATA }) {
  let names = prev?.names || {}, namesAt = prev?.namesAt || 0
  if (now - namesAt > 864e5) {
    const site = await get(`${FORUM}/site.json`)
    if (Array.isArray(site?.categories)) { names = Object.fromEntries(site.categories.filter((c) => Number.isInteger(c.id)).map((c) => [c.id, String(c.name || '').slice(0, 60)])); namesAt = now }
    await sleep(pause)
  }
  const { posts, complete } = await fetchPosts({ now, get, pause })
  if (!complete) throw new Error('the week did not fit in the pages read, nothing kept')
  const authors = { ...(prev?.authors || {}) }
  let week = weekOf(posts, { now, known, names, authors })
  // who opened a topic that is older than the week: asked once per topic and kept
  for (const t of week.topics) {
    if (t.author) continue
    await sleep(pause)
    try { const j = await get(`${FORUM}/t/${t.id}.json`); const u = j?.details?.created_by?.username; if (NAME.test(String(u))) authors[t.id] = u } catch (err) { console.warn('forum author', t.id, err.message) }
  }
  week = weekOf(posts, { now, known, names, authors })
  const live = new Set(week.topics.map((t) => String(t.id)))
  return { ...week, names, namesAt, authors: Object.fromEntries(Object.entries(authors).filter(([id]) => live.has(id))) }
}
export function startForum({ dir, known }) {
  loadForum(dir)
  const tick = async () => {
    if (DATA && Date.now() - DATA.at < 3300e3) return
    DATA = await readForum({ known: known() }); save()
    console.log(`forum: ${DATA.stats.all.posts} posts in ${DATA.stats.all.topics} topics this week, ${DATA.stats.tech.topics} technical`)
  }
  setInterval(() => tick().catch((err) => console.warn('forum', err.message)), 3600e3).unref()
  setTimeout(() => tick().catch((err) => console.warn('forum', err.message)), 120e3).unref()
}

// what the weekly digest carries: the technical counts and the three most discussed technical topics (the newest ones
// when none had a reply). Nothing when the forum was not read in the last two days: an old week is not this week.
export function forumBrief(data, now = Date.now()) {
  if (!data?.stats?.tech || !Array.isArray(data.topics) || now - data.at > 2 * 864e5 || !data.stats.tech.topics) return null
  const tech = data.topics.filter((x) => x.group === 'tech')
  const top = (tech.some((x) => x.replies > 0) ? tech.filter((x) => x.replies > 0) : [...tech].sort((a, b) => b.last - a.last)).slice(0, 3)
  return { at: data.at, stats: data.stats.tech, top: top.map((x) => ({ id: x.id, title: x.title, replies: x.replies })) }
}
// the same lines as HTML, for the digest page and the feed; `f` may come from a week kept on disk
export function forumBriefHtml(t, f, { base, lang, heading = 'h2' }) {
  if (!f?.stats || !Array.isArray(f.top)) return ''
  const n = (v) => (Number.isInteger(v) ? v : 0)
  const rows = f.top.filter((x) => Number.isInteger(x?.id)).slice(0, 3)
  return `<section><${heading}>${esc(t('fo.dg.h'))}</${heading}><p>${esc(t('fo.dg.line', { topics: n(f.stats.topics), fresh: n(f.stats.fresh), posts: n(f.stats.posts), people: n(f.stats.people) }))}</p>`
    + `<ol>${rows.map((x) => `<li><span><a href="${FORUM}/t/${x.id}" rel="noreferrer">${esc(String(x.title || '').slice(0, 200))}</a></span><b>${esc(n(x.replies) ? t.cnt('fo.rep', n(x.replies)) : t('fo.noReply'))}</b></li>`).join('')}</ol>`
    + `<p><a href="${esc(base)}/forum?lang=${lang}">${esc(t('fo.dg.all'))}</a></p></section>`
}

// the topics of the week that link a project's repository, for its page. Newest activity first, at most five.
// Nothing when the forum was not read in the last two days.
export function forumOf(data, name, now = Date.now()) {
  if (!data?.stats || !Array.isArray(data.topics) || now - data.at > 2 * 864e5) return []
  const key = String(name).toLowerCase()
  return data.topics.filter((x) => Array.isArray(x.repos) && x.repos.some((r) => r.toLowerCase() === key))
    .sort((a, b) => b.last - a.last).slice(0, 5)
    .map((x) => ({ id: x.id, title: x.title, author: x.author, replies: x.replies, people: x.people, new: x.isNew }))
}
// the week as an Atom feed, one entry per topic, newest activity first. An entry's id is the topic, so a reader shows
// a topic again, as updated, when it gets a new post.
const iso = (ms) => new Date(ms).toISOString()
export function forumFeed({ lang, base, data, group }) {
  const t = words(lang), g = GROUPS.includes(group) ? group : 'tech', host = base.replace(/^https?:\/\//, '').replace(/[^A-Za-z0-9.-]/g, '')
  const rows = (data?.topics || []).filter((x) => g === 'all' || x.group === g).sort((a, b) => b.last - a.last).slice(0, 60)
  const title = `CKB Pulse · ${t('fo.title')} · ${t('fo.g.' + g)}`
  const self = `${base}/forum.xml?c=${g}&amp;lang=${lang}`
  const entry = (x) => {
    const meta = [x.author ? t('fo.by', { name: x.author }) : '', x.isNew ? t('fo.new') : '', x.replies ? t.cnt('fo.rep', x.replies) : t('fo.noReply'), t.cnt('ppl', x.people), x.category].filter(Boolean).join(' · ')
    const html = `<p>${esc(meta)}</p>${x.repos.length ? `<p>${x.repos.map((r) => `<a href="${esc(base)}/?repo=${encodeURIComponent(r)}&amp;lang=${lang}">${esc(r)}</a>`).join(' · ')}</p>` : ''}`
    return `<entry><id>tag:${host},2026-11-25:forum/${x.id}</id><title>${esc(x.title)}</title><link href="${FORUM}/t/${x.id}"/><updated>${iso(x.last)}</updated>${x.author ? `<author><name>${esc(x.author)}</name></author>` : '<author><name>Nervos Talk</name></author>'}<content type="html">${esc(html)}</content></entry>`
  }
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="${lang === 'zh' ? 'zh-CN' : lang}">
<title>${esc(title)}</title><subtitle>${esc(t('fo.lead'))}</subtitle><id>tag:${host},2026-11-25:forum/${g}</id><link href="${esc(base)}/forum?c=${g}"/><link rel="self" href="${self}"/><updated>${iso(data?.at || 0)}</updated><icon>${esc(base)}/icon-192.png</icon>
${rows.map(entry).join('\n')}
</feed>`
}

// what a program gets: the same week, without what is only kept for the next reading
export const forumJson = (data, group) => {
  const g = GROUPS.includes(group) ? group : 'tech'
  return { at: new Date(data.at).toISOString(), since: new Date(data.since).toISOString(), group: g, stats: data.stats[g], groups: data.stats,
    topics: data.topics.filter((x) => g === 'all' || x.group === g).map((x) => ({ id: x.id, url: `${FORUM}/t/${x.id}`, title: x.title, author: x.author, category: x.category, group: x.group, new: x.isNew, replies: x.replies, people: x.people, last: new Date(x.last).toISOString(), projects: x.repos })) }
}

const FORUM_CSS = `.kpis.four{grid-template-columns:repeat(4,1fr)}@media(max-width:420px){.kpis.four{grid-template-columns:repeat(2,1fr)}}
ol.tp{list-style:none;margin:0;padding:0}ol.tp li{display:block;padding:10px 0;border-top:1px solid var(--edge)}ol.tp li:first-child{border-top:0}
ol.tp a.tt{font-weight:600;color:var(--fg);text-decoration:none;overflow-wrap:anywhere}ol.tp a.tt:hover{text-decoration:underline}
ol.tp .mt{display:flex;flex-wrap:wrap;gap:4px 10px;margin-top:3px;font-size:13px;opacity:.8}ol.tp .mt b{font-weight:600}
details.more{border-top:1px solid var(--edge);margin-top:4px}details.more summary{cursor:pointer;padding:12px 0;font-weight:600;min-height:24px}details.more[open] summary{opacity:.6}
ol.tp .mt a:not(.chip){color:inherit}ol.tp .chip{display:inline-block;padding:1px 8px;border-radius:999px;border:1px solid var(--edge);font-size:12px;text-decoration:none;color:var(--fg);overflow-wrap:anywhere}
ol.tp .new{background:var(--lime);color:var(--ink);border-color:transparent;font-weight:700}`

export function forumPage({ lang, base, url, data, group }) {
  const t = words(lang), g = GROUPS.includes(group) ? group : 'tech'
  const title = `CKB Pulse · ${t('fo.title')}`, desc = t('fo.lead')
  const by = (name) => esc(t('fo.by', { name: '\u0001' })).replace('\u0001', `<a href="${FORUM}/u/${encodeURIComponent(name)}" rel="noreferrer">${esc(name)}</a>`)
  const row = (x) => `<li><a class="tt" href="${FORUM}/t/${x.id}" rel="noreferrer">${esc(x.title)}</a><div class="mt">${x.author ? `<span>${by(x.author)}</span>` : ''}${x.isNew ? `<span class="chip new">${esc(t('fo.new'))}</span>` : ''}<span><b>${esc(x.replies ? t.cnt('fo.rep', x.replies) : t('fo.noReply'))}</b></span><span>${esc(t.cnt('ppl', x.people))}</span>${x.category ? `<span>${esc(x.category)}</span>` : ''}${x.repos.slice(0, 3).map((r) => `<a class="chip" href="${esc(base)}/?repo=${encodeURIComponent(r)}&amp;lang=${lang}">${esc(r.split('/').pop())}</a>`).join('')}${x.repos.length > 3 ? `<span>+${x.repos.length - 3}</span>` : ''}</div></li>`
  const sec = (h, rows) => (rows.length ? `<section class="me"><h2>${esc(h)}</h2><ol class="tp">${rows.slice(0, SHOWN).map(row).join('')}</ol>${rows.length > SHOWN ? `<details class="more"><summary>${esc(t('fo.more', { n: rows.length - SHOWN }))}</summary><ol class="tp">${rows.slice(SHOWN).map(row).join('')}</ol></details>` : ''}</section>` : '')
  const s = data?.stats?.[g], all = (data?.topics || []).filter((x) => g === 'all' || x.group === g)
  const tabs = `<nav class="p">${['tech', 'funding', 'other', 'all'].map((k) => (k === g ? `<b>${esc(t('fo.g.' + k))}</b>` : `<a href="${esc(base)}/forum?c=${k}&amp;lang=${lang}">${esc(t('fo.g.' + k))}</a>`)).join('')}</nav>`
  const read = data ? new Date(data.at).toLocaleString(t('locale'), { dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC' : ''
  const body = !data ? `<p>${esc(t('fo.wait'))}</p>` : `${tabs}<div class="kpis four"><div><b>${s.topics}</b><span>${esc(t('fo.k.topics'))}</span></div><div><b>${s.fresh}</b><span>${esc(t('fo.k.new'))}</span></div><div><b>${s.posts}</b><span>${esc(t('fo.k.posts'))}</span></div><div><b>${s.people}</b><span>${esc(t('k.people'))}</span></div></div>
${all.length ? '' : `<p>${esc(t('fo.none'))}</p>`}${sec(t('fo.hot'), all.filter((x) => x.replies > 0))}${sec(t('fo.fresh'), all.filter((x) => x.isNew && !x.replies).sort((a, b) => b.last - a.last))}
<section class="me"><p><small>${esc(t('fo.note'))} ${esc(t('fo.how'))} ${esc(t('fo.asOf', { date: read }))}</small></p><p class="go"><a href="${FORUM}" rel="noreferrer">${esc(t('fo.open'))}</a><a class="alt" href="${esc(base)}/forum.xml?c=${g}&amp;lang=${lang}">${esc(t('fo.feed'))}</a></p></section>`
  return `<!doctype html><html lang="${lang === 'zh' ? 'zh-CN' : lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}"><meta property="og:type" content="website"><meta property="og:site_name" content="CKB Pulse"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(url)}">
<link rel="alternate" type="application/atom+xml" title="${esc(title)}" href="${esc(base)}/forum.xml?c=${g}&amp;lang=${lang}">${menuHead(base)}<style>${CSS}${READING_CSS}${FORUM_CSS}</style></head><body><main>
${pageBar(t, { base, lang, current: 'forum', here: g === 'tech' ? '/forum' : `/forum?c=${g}`, share: { url: `${url}?c=${g}&lang=${lang}&d=${today()}`, title } })}
${pageHead({ crumbs: crumbs(t, { base, lang, trail: [[t('fo.nav'), null]] }), eyebrow: t('fo.nav'), title: t('fo.h1'), lede: esc(desc) })}
${body}
${pageFoot(t, url)}
</main>${menuScript(base)}</body></html>`
}
