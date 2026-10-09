// The pulse: reads GitHub, turns events into simple lines, keeps the last days, and tells listeners about new ones.
import fs from 'node:fs'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { gh, once, limits } from './github.mjs'
import { ORGS, USERS, CODE_SEARCHES, TOPIC_SEARCHES, TAGS, POLL, isNoiseActor } from './config.mjs'

const DATA = process.env.DATA_DIR || path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'data')
fs.mkdirSync(DATA, { recursive: true })
const FILE = path.join(DATA, 'state.json')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const OWNERS = [...ORGS.map((n) => ({ n, user: false })), ...USERS.map((n) => ({ n, user: true }))]
const ownerSet = new Set(OWNERS.map((o) => o.n.toLowerCase()))
const ownerOf = (full) => full.split('/')[0]
const DAY = 864e5
const MONTH = 30 * DAY
const NEW_DAYS = 7 // a project or an organisation counts as new for this long
// 2: every repository carries the visibility GitHub reported. The token can see private repositories (code search
// with it returned two private LusoCryptoLabs repos on 2026-10-09), so nothing is shown unless private === false.
// 3: builders rediscovered with manifestOk (a copied package.json no longer makes a repository a builder)
const STATE_VERSION = 3

export const bus = new EventEmitter()
bus.setMaxListeners(1000)
export const state = { version: STATE_VERSION, repos: {}, events: [], builders: [], orgRepos: [], orgReposAt: 0, discoveredAt: 0, groupsSeen: null, startedAt: Date.now() }
const ids = new Set()

// ---------- persistence ----------
export function load() {
  if (!fs.existsSync(FILE)) return
  try {
    const s = JSON.parse(fs.readFileSync(FILE, 'utf8'))
    Object.assign(state, s, { startedAt: Date.now() })
    if (s.version !== STATE_VERSION) {
      // older state has no visibility flags: keep the events (re-checked below) and rediscover everything else
      Object.assign(state, { version: STATE_VERSION, repos: {}, builders: [], orgRepos: [], orgReposAt: 0, discoveredAt: 0 })
      console.log('state from an older version: visibility will be checked again for every repository')
    }
    state.events.sort((a, b) => a.at.localeCompare(b.at))
    for (const e of state.events) ids.add(e.id)
    console.log(`loaded ${state.events.length} events, ${Object.keys(state.repos).length} repos, ${state.builders.length} builders`)
  } catch (err) { console.error('could not read state:', err.message) }
}
function save() {
  const tmp = FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify({ version: STATE_VERSION, repos: state.repos, events: state.events, builders: state.builders, orgRepos: state.orgRepos, orgReposAt: state.orgReposAt, discoveredAt: state.discoveredAt, groupsSeen: state.groupsSeen }))
  fs.renameSync(tmp, FILE)
}
setInterval(save, 60e3).unref()

// ---------- repositories ----------
const isPublic = (full) => state.repos[full]?.private === false
// the followed owners keep their own group; any other organisation gets one as soon as it is found; people go to builders
function groupFor(owner, type) {
  const o = OWNERS.find((x) => x.n.toLowerCase() === owner.toLowerCase())
  return o ? o.n : type === 'Organization' ? owner : 'builders'
}
function repoEntry(full, meta) {
  const owner = ownerOf(full)
  const r = state.repos[full] || (state.repos[full] = { name: full, owner })
  if (meta) {
    Object.assign(r, { desc: meta.description || '', topics: meta.topics || [], stars: meta.stargazers_count ?? r.stars ?? 0, lang: meta.language || '', pushedAt: meta.pushed_at, metaAt: Date.now() })
    if (meta.owner?.type) r.ownerType = meta.owner.type
    if (meta.created_at) r.createdAt = meta.created_at
    // only an explicit "false" from GitHub makes a repository public here
    r.private = meta.private === false ? false : true
  }
  r.group = groupFor(owner, r.ownerType)
  return r
}
async function ensureMeta(full, force) {
  const r = repoEntry(full)
  // a private repository can turn public at any time: look again within the hour instead of the day
  const ttl = r.private === false ? 24 * 3600e3 : 3600e3
  if (!force && r.metaAt && r.ownerType && Date.now() - r.metaAt < ttl) return r
  const res = await gh(`/repos/${full}`)
  return repoEntry(full, res.body || { description: '', private: true })
}
// the events API stopped sending commit counts with a push (it keeps before and head): compare the two once
async function commitCount(repo, p) {
  if (typeof p.distinct_size === 'number') return p.distinct_size
  if (typeof p.size === 'number') return p.size
  if (!p.before || !p.head || /^0+$/.test(p.before)) return 1
  return once(`cc:${repo}@${p.before}..${p.head}`, async () => {
    const r = await gh(`/repos/${repo}/compare/${p.before}...${p.head}?per_page=1`)
    return Math.max(1, r.body?.total_commits ?? 1)
  })
}
function tagsFor(repo, text) {
  const hay = `${repo.name} ${repo.desc || ''} ${(repo.topics || []).join(' ')} ${text || ''}`
  return Object.entries(TAGS).filter(([, re]) => re.test(hay)).map(([k]) => k)
}

// ---------- one GitHub event -> one line ----------
const pr = (url) => once('pr:' + url, async () => { const r = await gh(url); return r.body ? { title: r.body.title, merged: r.body.merged, html: r.body.html_url } : null })
const prHtml = (apiUrl) => (apiUrl || '').replace('https://api.github.com/repos/', 'https://github.com/').replace('/pulls/', '/pull/')
async function normalise(e) {
  if (e.public === false) return null
  const actor = e.actor?.login || ''
  const repo = e.repo?.name
  const p = e.payload || {}
  // automation stays as quiet sparks on the grid; it costs no extra lookups and never enters the feed
  const bot = isNoiseActor(actor)
  let kind = null, title = '', url = `https://github.com/${repo}`, ref = '', commits = 0
  switch (e.type) {
    case 'PushEvent': {
      ref = (p.ref || '').replace('refs/heads/', '')
      if (ref === 'gh-pages') return null
      kind = 'push'
      if (p.head) {
        url = `https://github.com/${repo}/commit/${p.head}`
        title = bot ? ref : await once(`c:${repo}@${p.head}`, async () => { const r = await gh(`/repos/${repo}/commits/${p.head}`); return r.body ? r.body.commit.message.split('\n')[0] : '' })
      }
      if (!bot) commits = await commitCount(repo, p)
      break
    }
    case 'PullRequestEvent': {
      const a = p.action
      if (!['opened', 'closed', 'reopened'].includes(a) || !p.pull_request?.url) return null
      if (bot) { kind = a === 'closed' ? 'pr_closed' : 'pr_open'; title = p.pull_request.head?.ref || ''; url = prHtml(p.pull_request.url); break }
      const d = await pr(p.pull_request.url)
      if (!d) return null
      kind = a === 'closed' ? (d.merged ? 'pr_merged' : 'pr_closed') : 'pr_open'
      title = d.title; url = d.html
      break
    }
    case 'IssuesEvent': {
      if (!['opened', 'closed', 'reopened'].includes(p.action)) return null
      kind = p.action === 'closed' ? 'issue_closed' : 'issue_open'
      title = p.issue?.title || ''; url = p.issue?.html_url || url
      break
    }
    case 'IssueCommentEvent':
      kind = 'comment'; title = p.issue?.title || ''; url = p.comment?.html_url || p.issue?.html_url || url
      break
    case 'PullRequestReviewEvent':
    case 'PullRequestReviewCommentEvent': {
      kind = 'review'
      const d = !bot && p.pull_request?.url ? await pr(p.pull_request.url) : null
      title = d?.title || ''; url = p.review?.html_url || p.comment?.html_url || d?.html || prHtml(p.pull_request?.url) || url
      break
    }
    case 'ReleaseEvent':
      if (p.action && p.action !== 'published') return null
      kind = 'release'; title = p.release?.name || p.release?.tag_name || ''; url = p.release?.html_url || url
      break
    case 'CreateEvent':
      kind = p.ref_type === 'repository' ? 'repo' : p.ref_type === 'tag' ? 'tag' : 'branch'
      ref = p.ref || ''; title = p.ref_type === 'repository' ? (p.description || 'new repository') : ref
      break
    case 'PublicEvent': kind = 'repo'; title = 'made public'; break
    case 'ForkEvent': kind = 'fork'; title = p.forkee?.full_name || ''; break
    case 'WatchEvent': kind = 'star'; break
    default: return null
  }
  const r = await ensureMeta(repo, e.type === 'PublicEvent')
  if (r.private !== false) return null
  return { id: e.id, kind, repo, group: r.group, actor, avatar: e.actor?.avatar_url || '', title, url, ref, at: e.created_at, tags: tagsFor(r, title), bot: bot && kind !== 'release', ...(commits ? { commits } : {}) }
}

// ---------- intake ----------
async function intake(raw, source) {
  const fresh = []
  let added = 0
  for (const e of raw.slice().reverse()) {
    if (ids.has(e.id)) continue
    ids.add(e.id)
    let n = null
    try { n = await normalise(e) } catch (err) { console.warn('skip event', e.id, err.message) }
    if (!n) continue
    state.events.push(n)
    added++
    // only events from the last few minutes pulse live; the backfill just fills the page
    if (Date.now() - new Date(n.at) < 15 * 60e3) fresh.push(n)
  }
  if (added) state.events.sort((a, b) => a.at.localeCompare(b.at))
  if (fresh.length) {
    for (const n of fresh) bus.emit('event', n)
    console.log(`${new Date().toISOString().slice(11, 19)} ${source}: ${fresh.length} new`)
  }
  trim()
}
function trim() {
  const cut = new Date(Date.now() - POLL.keepDays * 864e5).toISOString()
  if (state.events.length && (state.events[0].at < cut || state.events.length > POLL.maxEvents)) {
    state.events.sort((a, b) => a.at.localeCompare(b.at))
    state.events = state.events.filter((e) => e.at >= cut).slice(-POLL.maxEvents)
  }
}

// ---------- loops ----------
async function pollOwners(backfill) {
  for (const o of OWNERS) {
    if (o.user) {
      // a person's feed only lists what that account did (and not what it did while a repository was private):
      // work in its repositories comes from each repository's own feed
      for (const full of (state.orgRepos || []).filter((f) => ownerOf(f).toLowerCase() === o.n.toLowerCase())) {
        try {
          const r = await gh(`/repos/${full}/events?per_page=${backfill ? 100 : 30}`, { conditional: !backfill })
          if (r.changed && Array.isArray(r.body)) await intake(r.body, full)
        } catch (err) { console.warn('repo', full, err.message) }
      }
    }
    for (let page = 1; page <= (backfill ? 3 : 1); page++) {
      try {
        const url = o.user ? `/users/${o.n}/events/public?per_page=100&page=${page}` : `/orgs/${o.n}/events?per_page=100&page=${page}`
        const r = await gh(url, { conditional: !backfill })
        if (r.changed && Array.isArray(r.body)) {
          // a person's feed also lists what they did elsewhere: keep their own repositories and the followed ones
          const raw = o.user ? r.body.filter((e) => { const ow = ownerOf(e.repo?.name || '').toLowerCase(); return ownerSet.has(ow) || state.builders.includes(e.repo?.name) }) : r.body
          await intake(raw, o.n)
        }
        if (!r.body || r.body.length < 100) break
      } catch (err) { console.warn('owner', o.n, err.message); break }
    }
  }
}
async function ownerLoop() {
  await pollOwners(true)
  for (;;) { await sleep(POLL.orgsEverySec * 1000); await pollOwners(false) }
}
async function builderLoop() {
  for (;;) {
    const list = state.builders.slice()
    if (!list.length) { await sleep(30e3); continue }
    const gap = (POLL.buildersCycleMin * 60e3) / list.length
    for (const full of list) {
      const t0 = Date.now()
      try {
        const r = await gh(`/repos/${full}/events?per_page=30`, { conditional: true })
        if (r.changed && Array.isArray(r.body)) await intake(r.body, full)
      } catch (err) { console.warn('repo', full, err.message) }
      await sleep(Math.max(0, gap - (Date.now() - t0)))
    }
  }
}

// every public, non-archived repository of the followed owners pushed in the last year: the quiet cells of the grid
export async function listOwnerRepos() {
  const year = Date.now() - 365 * 864e5
  const out = []
  for (const o of OWNERS) {
    for (let page = 1; page <= 5; page++) {
      const url = o.user ? `/users/${o.n}/repos?type=owner&sort=pushed&per_page=100&page=${page}` : `/orgs/${o.n}/repos?type=public&sort=pushed&per_page=100&page=${page}`
      const r = await gh(url)
      const items = r.body || []
      let old = false
      for (const m of items) {
        if (new Date(m.pushed_at) < year) { old = true; continue }
        if (m.archived || m.fork || m.private !== false) continue
        repoEntry(m.full_name, m)
        out.push(m.full_name)
      }
      if (old || items.length < 100) break
    }
  }
  state.orgRepos = out
  state.orgReposAt = Date.now()
  save()
  console.log(`owners: ${out.length} public repositories pushed in the last year`)
}

// a dependency only counts in the project's own manifest: at the root or a few levels into a monorepo, never in a
// copy of someone else's (the AppImage catalogue keeps Neuron's package.json under database/Neuron/, measured 2026-10-09)
const SKIP_DIRS = /(^|\/)(node_modules|vendor|third_party|database|data|fixtures?|test-fixtures|testdata|\.github)\//i
function manifestOk(p) { return !!p && p.split('/').length <= 3 && !SKIP_DIRS.test(p) }

// builders: public repositories that depend on CKB libraries or carry CKB topics, outside the followed owners
export async function discover() {
  const found = new Map()
  for (const q of CODE_SEARCHES) {
    for (let page = 1; page <= 10; page++) {
      const r = await gh(`/search/code?q=${encodeURIComponent(q)}&per_page=100&page=${page}`, { search: true })
      await sleep(6500) // code search allows 10 requests a minute
      const items = r.body?.items || []
      for (const it of items) if (it.repository && manifestOk(it.path)) found.set(it.repository.full_name, null)
      if (items.length < 100) break
    }
  }
  for (const q of TOPIC_SEARCHES) {
    for (let page = 1; page <= 5; page++) {
      const r = await gh(`/search/repositories?q=${encodeURIComponent(q)}&per_page=100&page=${page}&sort=updated`, { search: true })
      await sleep(2200)
      const items = r.body?.items || []
      for (const it of items) found.set(it.full_name, it)
      if (items.length < 100) break
    }
  }
  const keep = []
  const recent = Date.now() - 180 * 864e5
  for (const [full, meta] of found) {
    if (ownerSet.has(ownerOf(full).toLowerCase())) continue
    let m = meta
    if (!m) { const r = await gh(`/repos/${full}`); m = r.body }
    if (!m || m.private !== false || m.fork || m.archived) continue
    repoEntry(full, m)
    if (new Date(m.pushed_at) > recent) keep.push(full)
  }
  state.builders = keep
  state.discoveredAt = Date.now()
  save()
  console.log(`discovery: ${found.size} candidates, ${keep.length} active public builders`)
}
// events kept from before visibility was recorded: check each repository once
async function verifyEventRepos() {
  const todo = [...new Set(state.events.map((e) => e.repo))].filter((full) => state.repos[full]?.private === undefined)
  for (const full of todo) { try { await ensureMeta(full) } catch (err) { console.warn('verify', full, err.message) } }
  if (todo.length) console.log(`visibility checked for ${todo.length} repositories in the stored events`)
}
// repositories stored before the owner type was recorded: fetch their metadata again, once
async function fillOwnerTypes() {
  const todo = [...new Set([...state.builders, ...state.events.map((e) => e.repo)])].filter((full) => state.repos[full] && !state.repos[full].ownerType)
  for (const full of todo) { try { await ensureMeta(full, true) } catch (err) { console.warn('owner type', full, err.message) } }
  if (todo.length) { save(); console.log(`owner type recorded for ${todo.length} repositories`) }
  typesReady = true
}
// pushes stored before commits were counted: find them again in the repository's event list (GitHub keeps 300 events
// or 90 days) and compare; a push GitHub no longer lists counts as one commit, the least it can be
async function backfillCommits() {
  const need = new Map()
  for (const e of state.events) if (e.kind === 'push' && !e.bot && e.commits == null) { if (!need.has(e.repo)) need.set(e.repo, new Map()); need.get(e.repo).set(e.id, e) }
  let found = 0, guessed = 0
  for (const [repo, list] of need) {
    try {
      for (let page = 1; page <= 3 && list.size; page++) {
        const r = await gh(`/repos/${repo}/events?per_page=100&page=${page}`)
        for (const raw of r.body || []) {
          const e = list.get(raw.id)
          if (!e || raw.type !== 'PushEvent') continue
          e.commits = await commitCount(repo, raw.payload || {}); list.delete(raw.id); found++
        }
        if (!r.body || r.body.length < 100) break
      }
    } catch (err) { console.warn('commits', repo, err.message) }
    for (const e of list.values()) { e.commits = 1; guessed++ }
  }
  if (found + guessed) { save(); console.log(`commits counted for ${found} stored pushes, ${guessed} set to one`) }
}
async function discoverLoop() {
  try { await listOwnerRepos() } catch (err) { console.warn('owner repos', err.message) }
  await verifyEventRepos()
  await fillOwnerTypes()
  await backfillCommits()
  for (;;) {
    if (Date.now() - (state.orgReposAt || 0) > POLL.discoverEveryHours * 3600e3) { try { await listOwnerRepos() } catch (err) { console.warn('owner repos', err.message) } }
    if (Date.now() - state.discoveredAt > POLL.discoverEveryHours * 3600e3) { try { await discover() } catch (err) { console.warn('discovery', err.message) } }
    await sleep(15 * 60e3)
  }
}

export function start() {
  load()
  ownerLoop().catch((e) => console.error('owner loop died', e))
  builderLoop().catch((e) => console.error('builder loop died', e))
  discoverLoop().catch((e) => console.error('discovery loop died', e))
}

// ---------- what the page needs ----------
// public repositories of the followed owners and the current builders, and only while their owner has people at work:
// an organisation or a builder with no human event in 30 days leaves the page and comes back with the next one
function followedNow(now) {
  const builders = new Set(state.builders)
  const from = new Date(now - MONTH).toISOString()
  const active = new Set()
  for (const e of state.events) if (!e.bot && e.at >= from && isPublic(e.repo)) active.add(ownerOf(e.repo).toLowerCase())
  return (full) => { const o = ownerOf(full).toLowerCase(); return isPublic(full) && (ownerSet.has(o) || builders.has(full)) && active.has(o) }
}
// the first time a group shows up; the ones present when this started count as old. Nothing is marked until every
// stored repository has its owner type, or the organisations sorted out of builders would all look new
let typesReady = false
function markGroups(groups, now) {
  if (!typesReady) return
  const seeding = !state.groupsSeen
  if (seeding) state.groupsSeen = {}
  for (const g of groups) if (!(g in state.groupsSeen)) state.groupsSeen[g] = seeding ? 0 : now
}
// the most active projects, people and organisations over the last day, week and month (people only, automation left out)
function leaders(ev, now) {
  const out = {}
  for (const [key, ms] of [['day', DAY], ['week', 7 * DAY], ['month', MONTH]]) {
    const from = new Date(now - ms).toISOString()
    const m = { repos: new Map(), commits: new Map(), pushes: new Map(), people: new Map(), peopleCommits: new Map(), orgs: new Map() }
    const add = (map, k, n = 1) => map.set(k, (map.get(k) || 0) + n)
    const avatar = new Map()
    for (const e of ev) {
      if (e.bot || e.at < from) continue
      add(m.repos, e.repo); add(m.people, e.actor)
      if (e.avatar) avatar.set(e.actor, e.avatar)
      if (e.kind === 'push') { add(m.pushes, e.repo); add(m.commits, e.repo, e.commits || 1); add(m.peopleCommits, e.actor, e.commits || 1) }
      const g = state.repos[e.repo]?.group
      if (g && g !== 'builders') add(m.orgs, g)
    }
    const top = (map) => [...map].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5)
    out[key] = {
      repos: top(m.repos), commits: top(m.commits), pushes: top(m.pushes), orgs: top(m.orgs),
      people: top(m.people).map(([l, n]) => [l, n, avatar.get(l) || '']), peopleCommits: top(m.peopleCommits).map(([l, n]) => [l, n, avatar.get(l) || '']),
    }
  }
  return out
}
export function snapshot() {
  const now = Date.now()
  const h1 = new Date(now - 3600e3).toISOString(), d1 = new Date(now - 864e5).toISOString()
  const followed = followedNow(now)
  const ev = state.events.filter((e) => followed(e.repo))
  const human = ev.filter((e) => !e.bot)
  const humanDay = human.filter((e) => e.at >= d1)
  const count = (arr, key) => arr.reduce((m, e) => { for (const k of [].concat(e[key])) m[k] = (m[k] || 0) + 1; return m }, {})
  const per = {}
  for (const e of ev) {
    const p = per[e.repo] || (per[e.repo] = { n: 0, n24: 0, b24: 0, last: null, lastBot: null })
    if (e.bot) { if (e.at >= d1) p.b24++; if (!p.lastBot || e.at > p.lastBot.at) p.lastBot = e; continue }
    p.n++; if (e.at >= d1) p.n24++
    if (!p.last || e.at > p.last.at) p.last = e
  }
  const all = [...new Set([...Object.keys(per), ...(state.orgRepos || []), ...state.builders])].filter(followed)
  const repos = all.map((full) => {
    const r = state.repos[full]
    const a = per[full]
    return {
      name: full, group: r.group, desc: r.desc || '', stars: r.stars || 0, n: a ? a.n : 0, n24: a ? a.n24 : 0, b24: a ? a.b24 : 0,
      lastAt: a?.last ? a.last.at : null, lastKind: a?.last ? a.last.kind : null, lastBotAt: a?.lastBot ? a.lastBot.at : null, pushedAt: r.pushedAt || null, tags: tagsFor(r, ''),
      createdAt: r.createdAt || null, isNew: !!r.createdAt && now - Date.parse(r.createdAt) < NEW_DAYS * DAY,
    }
  })
  const groupNames = [...new Set(repos.map((r) => r.group))]
  markGroups(groupNames, now)
  const groups = groupNames.map((g) => ({ name: g, repos: repos.filter((r) => r.group === g).length, isNew: g !== 'builders' && !!state.groupsSeen && now - (state.groupsSeen[g] ?? now) < NEW_DAYS * DAY && g in state.groupsSeen }))
  return {
    now: new Date(now).toISOString(), keepDays: POLL.keepDays, owners: OWNERS.map((o) => o.n),
    stats: {
      hour: human.filter((e) => e.at >= h1).length, day: humanDay.length, bots24: ev.filter((e) => e.bot && e.at >= d1).length,
      activeRepos24: repos.filter((r) => r.n24).length, tracked: repos.length, builders: repos.filter((r) => r.group === 'builders').length,
      perTag: count(humanDay, 'tags'), perKind: count(humanDay, 'kind'),
    },
    repos, groups,
    leaders: leaders(ev, now),
    events: human.slice(-150).reverse(),
    // the last 24 hours, oldest first, for the replay and the timeline
    day: ev.filter((e) => e.at >= d1).map((e) => ({ at: e.at, kind: e.kind, repo: e.repo, actor: e.actor, title: (e.title || '').slice(0, 90), bot: !!e.bot })),
    // the last 7 days in compact rows for the 3D page: [unix seconds, kind, repo index, actor index, bot, title, commits]
    history: compactHistory(ev.filter((e) => e.at >= new Date(now - 7 * 864e5).toISOString()), repos),
    limits: { core: limits.core, search: limits.search },
  }
}
export const KIND_LIST = ['push', 'pr_open', 'pr_merged', 'pr_closed', 'issue_open', 'issue_closed', 'comment', 'review', 'release', 'repo', 'star', 'fork', 'branch', 'tag']
function compactHistory(list, repos) {
  const repoIdx = new Map(repos.map((r, i) => [r.name, i]))
  const actors = [], actorIdx = new Map()
  const rows = []
  for (const e of list) {
    if (!actorIdx.has(e.actor)) { actorIdx.set(e.actor, actors.length); actors.push([e.actor, e.avatar || '']) }
    else if (e.avatar && !actors[actorIdx.get(e.actor)][1]) actors[actorIdx.get(e.actor)][1] = e.avatar
    rows.push([Math.floor(Date.parse(e.at) / 1000), KIND_LIST.indexOf(e.kind), repoIdx.has(e.repo) ? repoIdx.get(e.repo) : -1, actorIdx.get(e.actor), e.bot ? 1 : 0, e.bot ? '' : (e.title || '').slice(0, 80), e.commits || 0])
  }
  return { kinds: KIND_LIST, actors, rows }
}

// one repository in detail, from what is already stored (no GitHub call): daily activity, people, latest events
export function repoDetail(name) {
  if (!followedNow(Date.now())(name)) return null
  const r = state.repos[name]
  const list = state.events.filter((e) => e.repo === name)
  const days = 30, start = Date.now() - days * 864e5
  const people = new Array(days).fill(0), bots = new Array(days).fill(0)
  const who = new Map()
  for (const e of list) {
    const i = Math.floor((Date.parse(e.at) - start) / 864e5)
    if (i >= 0 && i < days) (e.bot ? bots : people)[i]++
    if (!e.bot) { const w = who.get(e.actor) || { login: e.actor, avatar: e.avatar || '', n: 0, commits: 0 }; w.n++; if (e.kind === 'push') w.commits += e.commits || 1; if (e.avatar) w.avatar = e.avatar; who.set(e.actor, w) }
  }
  return {
    name, url: `https://github.com/${name}`, group: r.group, desc: r.desc || '', stars: r.stars || 0, lang: r.lang || '', topics: r.topics || [], pushedAt: r.pushedAt || null, createdAt: r.createdAt || null,
    daily: { days, people, bots },
    contributors: [...who.values()].sort((a, b) => b.n - a.n).slice(0, 12),
    events: list.filter((e) => !e.bot).slice(-40).reverse().map((e) => ({ at: e.at, kind: e.kind, actor: e.actor, avatar: e.avatar || '', title: e.title, url: e.url, ref: e.ref, commits: e.commits || 0 })),
  }
}
