// The pulse: reads GitHub, turns events into simple lines, keeps the last days, and tells listeners about new ones.
import fs from 'node:fs'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { gh, once, limits } from './github.mjs'
import { ORGS, CODE_SEARCHES, TOPIC_SEARCHES, TAGS, POLL, isNoiseActor } from './config.mjs'

const DATA = process.env.DATA_DIR || path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'data')
fs.mkdirSync(DATA, { recursive: true })
const FILE = path.join(DATA, 'state.json')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const orgSet = new Set(ORGS.map((o) => o.toLowerCase()))

export const bus = new EventEmitter()
bus.setMaxListeners(1000)
export const state = { repos: {}, events: [], builders: [], orgRepos: [], orgReposAt: 0, discoveredAt: 0, startedAt: Date.now() }
const ids = new Set()

// ---------- persistence ----------
export function load() {
  if (!fs.existsSync(FILE)) return
  try {
    const s = JSON.parse(fs.readFileSync(FILE, 'utf8'))
    Object.assign(state, s, { startedAt: Date.now() })
    state.events.sort((a, b) => a.at.localeCompare(b.at))
    for (const e of state.events) ids.add(e.id)
    console.log(`loaded ${state.events.length} events, ${Object.keys(state.repos).length} repos, ${state.builders.length} builders`)
  } catch (err) { console.error('could not read state:', err.message) }
}
function save() {
  const tmp = FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify({ repos: state.repos, events: state.events, builders: state.builders, orgRepos: state.orgRepos, orgReposAt: state.orgReposAt, discoveredAt: state.discoveredAt }))
  fs.renameSync(tmp, FILE)
}
setInterval(save, 60e3).unref()

// ---------- repositories ----------
function repoEntry(full, meta) {
  const r = state.repos[full] || (state.repos[full] = { name: full, owner: full.split('/')[0], group: orgSet.has(full.split('/')[0].toLowerCase()) ? full.split('/')[0] : 'builders' })
  if (meta) Object.assign(r, { desc: meta.description || '', topics: meta.topics || [], stars: meta.stargazers_count ?? r.stars ?? 0, lang: meta.language || '', pushedAt: meta.pushed_at, metaAt: Date.now() })
  return r
}
async function ensureMeta(full) {
  const r = repoEntry(full)
  if (r.metaAt && Date.now() - r.metaAt < 24 * 3600e3) return r
  const res = await gh(`/repos/${full}`)
  return repoEntry(full, res.body || { description: '' })
}
function tagsFor(repo, text) {
  const hay = `${repo.name} ${repo.desc || ''} ${(repo.topics || []).join(' ')} ${text || ''}`
  return Object.entries(TAGS).filter(([, re]) => re.test(hay)).map(([k]) => k)
}

// ---------- one GitHub event -> one line ----------
const pr = (url) => once('pr:' + url, async () => { const r = await gh(url); return r.body ? { title: r.body.title, merged: r.body.merged, html: r.body.html_url } : null })
async function normalise(e) {
  if (e.public === false) return null
  const actor = e.actor?.login || ''
  const repo = e.repo?.name
  const p = e.payload || {}
  let kind = null, title = '', url = `https://github.com/${repo}`, ref = ''
  switch (e.type) {
    case 'PushEvent': {
      ref = (p.ref || '').replace('refs/heads/', '')
      if (ref === 'gh-pages') return null
      kind = 'push'
      if (p.head) {
        title = await once(`c:${repo}@${p.head}`, async () => { const r = await gh(`/repos/${repo}/commits/${p.head}`); return r.body ? r.body.commit.message.split('\n')[0] : '' })
        url = `https://github.com/${repo}/commit/${p.head}`
      }
      break
    }
    case 'PullRequestEvent': {
      const a = p.action
      if (!['opened', 'closed', 'reopened'].includes(a) || !p.pull_request?.url) return null
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
      const d = p.pull_request?.url ? await pr(p.pull_request.url) : null
      title = d?.title || ''; url = p.review?.html_url || p.comment?.html_url || d?.html || url
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
    case 'ForkEvent': kind = 'fork'; title = p.forkee?.full_name || ''; break
    case 'WatchEvent': kind = 'star'; break
    default: return null
  }
  if (isNoiseActor(actor) && kind !== 'release') return null
  const r = await ensureMeta(repo)
  return { id: e.id, kind, repo, group: r.group, actor, title, url, ref, at: e.created_at, tags: tagsFor(r, title) }
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
    const r = state.repos[n.repo]
    if (!r.lastAt || n.at > r.lastAt) r.lastAt = n.at
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
async function pollOrgs(backfill) {
  for (const o of ORGS) {
    for (let page = 1; page <= (backfill ? 3 : 1); page++) {
      try {
        const r = await gh(`/orgs/${o}/events?per_page=100&page=${page}`, { conditional: !backfill })
        if (r.changed && Array.isArray(r.body)) await intake(r.body, o)
        if (!r.body || r.body.length < 100) break
      } catch (err) { console.warn('org', o, err.message); break }
    }
  }
}
async function orgLoop() {
  await pollOrgs(state.events.length === 0)
  for (;;) { await sleep(POLL.orgsEverySec * 1000); await pollOrgs(false) }
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

// every public, non-archived repository of the organisations pushed in the last year: the dormant cells of the grid
export async function listOrgRepos() {
  const year = Date.now() - 365 * 864e5
  const out = []
  for (const o of ORGS) {
    for (let page = 1; page <= 5; page++) {
      const r = await gh(`/orgs/${o}/repos?type=public&sort=pushed&per_page=100&page=${page}`)
      const items = r.body || []
      let old = false
      for (const m of items) {
        if (new Date(m.pushed_at) < year) { old = true; continue }
        if (m.archived || m.fork) continue
        repoEntry(m.full_name, m)
        out.push(m.full_name)
      }
      if (old || items.length < 100) break
    }
  }
  state.orgRepos = out
  state.orgReposAt = Date.now()
  save()
  console.log(`organisations: ${out.length} repositories pushed in the last year`)
}

// builders: repositories that depend on CKB libraries or carry CKB topics, outside the organisations
export async function discover() {
  const found = new Map()
  for (const q of CODE_SEARCHES) {
    for (let page = 1; page <= 10; page++) {
      const r = await gh(`/search/code?q=${encodeURIComponent(q)}&per_page=100&page=${page}`, { search: true })
      await sleep(6500) // code search allows 10 requests a minute
      const items = r.body?.items || []
      for (const it of items) if (it.repository) found.set(it.repository.full_name, null)
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
    if (orgSet.has(full.split('/')[0].toLowerCase())) continue
    let m = meta
    if (!m) { const r = await gh(`/repos/${full}`); m = r.body }
    if (!m || m.fork || m.archived) continue
    repoEntry(full, m)
    if (new Date(m.pushed_at) > recent) keep.push(full)
  }
  state.builders = keep
  state.discoveredAt = Date.now()
  save()
  console.log(`discovery: ${found.size} candidates, ${keep.length} active builders`)
}
async function discoverLoop() {
  for (;;) {
    if (Date.now() - (state.orgReposAt || 0) > POLL.discoverEveryHours * 3600e3) { try { await listOrgRepos() } catch (err) { console.warn('org repos', err.message) } }
    if (Date.now() - state.discoveredAt > POLL.discoverEveryHours * 3600e3) { try { await discover() } catch (err) { console.warn('discovery', err.message) } }
    await sleep(15 * 60e3)
  }
}

export function start() {
  load()
  orgLoop().catch((e) => console.error('org loop died', e))
  builderLoop().catch((e) => console.error('builder loop died', e))
  discoverLoop().catch((e) => console.error('discovery loop died', e))
}

// ---------- what the page needs ----------
export function snapshot() {
  const now = Date.now()
  const h1 = new Date(now - 3600e3).toISOString(), d1 = new Date(now - 864e5).toISOString()
  const ev = state.events
  const day = ev.filter((e) => e.at >= d1)
  const count = (arr, key) => arr.reduce((m, e) => { for (const k of [].concat(e[key])) m[k] = (m[k] || 0) + 1; return m }, {})
  const per = {}
  for (const e of ev) { const p = per[e.repo] || (per[e.repo] = { n: 0, n24: 0, last: null }); p.n++; if (e.at >= d1) p.n24++; if (!p.last || e.at > p.last.at) p.last = e }
  const all = new Set([...Object.keys(per), ...(state.orgRepos || []), ...state.builders])
  const repos = [...all].map((full) => {
    const r = state.repos[full] || { name: full, group: 'builders' }
    const a = per[full]
    return { name: full, group: r.group, desc: r.desc || '', stars: r.stars || 0, n: a ? a.n : 0, n24: a ? a.n24 : 0, lastAt: a ? a.last.at : null, lastKind: a ? a.last.kind : null, pushedAt: r.pushedAt || null, tags: tagsFor(r, '') }
  })
  return {
    now: new Date(now).toISOString(), keepDays: POLL.keepDays, orgs: ORGS,
    stats: { hour: ev.filter((e) => e.at >= h1).length, day: day.length, week: ev.length, activeRepos24: repos.filter((r) => r.n24).length, tracked: repos.length, builders: state.builders.length, perTag: count(day, 'tags'), perKind: count(day, 'kind') },
    repos, events: ev.slice(-150).reverse(),
    limits: { core: limits.core, search: limits.search },
  }
}
