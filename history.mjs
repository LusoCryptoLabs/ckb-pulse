// Long history from GitHub's contributor statistics: commits per week and author since each repository began. The events
// API reaches back 90 days at most; months and years come from here (active developers per month, new developers).
// Kept in DATA_DIR/history.json, refreshed for a repository when its numbers are a week old.
import fs from 'node:fs'
import path from 'node:path'
import { gh } from './github.mjs'
import { isAutomaticAuthor, BLOCKED } from './config.mjs'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const DAY = 864e5
let file = ''
let H = { repos: {} } // full name -> { at, rows: [[week start (unix s), login, commits]] }

export function loadHistory(dir) {
  file = path.join(dir, 'history.json')
  if (fs.existsSync(file)) { try { H = JSON.parse(fs.readFileSync(file, 'utf8')) } catch (err) { console.error('history unreadable:', err.message) } }
}
function save() { const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(H)); fs.renameSync(tmp, file) }

// GitHub computes these in the background: the first ask answers 202 and the numbers come a little later
export async function refreshHistory(list, maxAgeDays = 7) {
  let due = list.filter((f) => !H.repos[f] || Date.now() - H.repos[f].at > maxAgeDays * DAY), done = 0
  for (let round = 0; round < 4 && due.length; round++) {
    const later = []
    for (const full of due) {
      let r
      try { r = await gh(`/repos/${full}/stats/contributors`) } catch { r = { status: 204, body: [] } } // an empty repository has no body
      if (r.status === 202) { later.push(full); await sleep(400); continue }
      const rows = []
      for (const c of Array.isArray(r.body) ? r.body : []) {
        const login = c.author?.login
        if (!login || isAutomaticAuthor(login)) continue
        for (const w of c.weeks || []) if (w.c > 0) rows.push([w.w, login, w.c])
      }
      H.repos[full] = { at: Date.now(), rows }
      if (++done % 20 === 0) save() // a deploy in the middle keeps what was read
      await sleep(1200)
    }
    due = later
    if (due.length) await sleep(60e3)
  }
  save()
  memo = null
  console.log(`history: ${done} repositories read${due.length ? `, ${due.length} still being counted by GitHub` : ''}`)
}

const monthOf = (w) => new Date((w + 3 * 86400) * 1000).toISOString().slice(0, 7) // the month holding the middle of the week
function lastMonths(n) {
  const d = new Date(), out = []
  for (let i = n - 1; i >= 0; i--) out.push(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1)).toISOString().slice(0, 7))
  return out
}
// active developers (a commit in the month), new ones (their first commit among these repositories) and commits, per
// month. Every repository read once stays counted after it goes quiet or leaves the page (since 2026-10-19; before, only
// the repositories followed that day counted, so a project that stopped took its months with it)
let memo = null
const blocked = new Set(BLOCKED.map((b) => b.toLowerCase()))
export function trends(list, months = 24) {
  const key = list.length + '|' + Object.keys(H.repos).length + '|' + new Date().toISOString().slice(0, 13)
  if (memo?.key === key) return memo.v
  const set = new Set(list), first = new Map(), per = new Map()
  let counted = 0, kept = 0
  for (const [full, r] of Object.entries(H.repos)) {
    if (blocked.has(full.split('/')[0].toLowerCase())) continue
    if (set.has(full)) counted++; else kept++
    for (const [w, login, c] of r.rows) {
      if (isAutomaticAuthor(login)) continue // rows stored before the rule
      const m = monthOf(w)
      if (!first.has(login) || first.get(login) > m) first.set(login, m)
      let p = per.get(m)
      if (!p) per.set(m, (p = { devs: new Set(), commits: 0 }))
      p.devs.add(login); p.commits += c
    }
  }
  const newBy = new Map()
  for (const m of first.values()) newBy.set(m, (newBy.get(m) || 0) + 1)
  const v = { repos: counted, of: list.length, kept, months: lastMonths(months).map((m) => ({ month: m, devs: per.get(m)?.devs.size || 0, newDevs: newBy.get(m) || 0, commits: per.get(m)?.commits || 0 })) }
  memo = { key, v }
  return v
}
// People whose first commit in any project Pulse has read fell in the last N days, alphabetical (not a ranking). The
// weekly statistics reach back to each repository's first commit, so someone long at work in a project that joined
// Pulse only now does not show up as new
export function arrivals(days = 30, now = Date.now()) {
  const first = new Map()
  for (const [full, r] of Object.entries(H.repos)) {
    if (blocked.has(full.split('/')[0].toLowerCase())) continue
    for (const [w, login] of r.rows) { if (isAutomaticAuthor(login)) continue; if (!first.has(login) || first.get(login) > w) first.set(login, w) }
  }
  const cut = Math.floor((now - days * DAY) / 1000) - 7 * 86400 // a week's start is the Monday before its commits
  return [...first].filter(([, w]) => w >= cut).map(([login]) => login).sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))
}
// The community's pace: commits in the last complete week of the projects Pulse has read, next to the median of the eight
// weeks before it. A collective line, no goal and no ranking of people. Weeks start on Monday (GitHub's statistics)
export function rhythm(now = Date.now()) {
  const per = new Map()
  for (const r of Object.values(H.repos)) for (const [w, login, c] of r.rows) { if (isAutomaticAuthor(login)) continue; per.set(w, (per.get(w) || 0) + c) }
  // the Monday that starts the current week, 00:00 UTC
  const start = (() => { const d = new Date(now); const dow = (d.getUTCDay() + 6) % 7; return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow) / 1000) })()
  const last = start - 604800, before = []
  for (let i = 1; i <= 8; i++) before.push(per.get(last - i * 604800) || 0)
  if (!per.size || before.every((v) => v === 0)) return null
  const sorted = [...before].sort((a, b) => a - b), median = (sorted[3] + sorted[4]) / 2
  return { week: new Date(last * 1000).toISOString().slice(0, 10), commits: per.get(last) || 0, median: Math.round(median) }
}
// What the history says about one person, as dated facts: the month of their first commit among these projects and in
// how many of the last 12 months they committed. No levels, no streaks: a month of rest takes nothing away
export function personHistory(login, now = Date.now()) {
  const key = String(login).toLowerCase()
  let first = Infinity
  const months = new Set()
  const from = lastMonths(12)[0]
  for (const r of Object.values(H.repos)) for (const [w, l] of r.rows) {
    if (l.toLowerCase() !== key) continue
    if (w < first) first = w
    const m = monthOf(w); if (m >= from) months.add(m)
  }
  return first === Infinity ? null : { since: new Date(first * 1000).toISOString().slice(0, 7), active: months.size }
}
// one repository: commits and developers per month
export function repoMonths(full, months = 24) {
  const r = H.repos[full]
  if (!r) return null
  const per = new Map()
  for (const [w, login, c] of r.rows) { if (isAutomaticAuthor(login)) continue; const m = monthOf(w); let p = per.get(m); if (!p) per.set(m, (p = { devs: new Set(), commits: 0 })); p.devs.add(login); p.commits += c }
  return lastMonths(months).map((m) => ({ month: m, devs: per.get(m)?.devs.size || 0, commits: per.get(m)?.commits || 0 }))
}
// one repository's rows, [week start (unix s), login, commits], or null when GitHub has not counted it yet
export function repoRows(full) {
  const r = H.repos[full]
  return r ? r.rows.filter(([, login]) => !isAutomaticAuthor(login)) : null
}
// every repository the history holds, and a way to drop the ones that turned out to be another's old name
export const historyNames = () => Object.keys(H.repos)
export function forgetRepos(names) {
  let n = 0
  for (const f of names) if (H.repos[f]) { delete H.repos[f]; n++ }
  if (n) { save(); memo = null }
  return n
}
