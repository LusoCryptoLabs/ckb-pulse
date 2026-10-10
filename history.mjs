// Long history from GitHub's contributor statistics: commits per week and author since each repository began. The events
// API reaches back 90 days at most; months and years come from here (active developers per month, new developers).
// Kept in DATA_DIR/history.json, refreshed for a repository when its numbers are a week old.
import fs from 'node:fs'
import path from 'node:path'
import { gh } from './github.mjs'
import { isNoiseActor } from './config.mjs'

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
        if (!login || isNoiseActor(login)) continue
        for (const w of c.weeks || []) if (w.c > 0) rows.push([w.w, login, w.c])
      }
      H.repos[full] = { at: Date.now(), rows }
      done++
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
// active developers (a commit in the month), new ones (their first commit among these repositories) and commits, per month
let memo = null
export function trends(list, months = 24) {
  const key = list.length + '|' + new Date().toISOString().slice(0, 13)
  if (memo?.key === key) return memo.v
  const set = new Set(list), first = new Map(), per = new Map()
  let counted = 0
  for (const [full, r] of Object.entries(H.repos)) {
    if (!set.has(full)) continue
    counted++
    for (const [w, login, c] of r.rows) {
      const m = monthOf(w)
      if (!first.has(login) || first.get(login) > m) first.set(login, m)
      let p = per.get(m)
      if (!p) per.set(m, (p = { devs: new Set(), commits: 0 }))
      p.devs.add(login); p.commits += c
    }
  }
  const newBy = new Map()
  for (const m of first.values()) newBy.set(m, (newBy.get(m) || 0) + 1)
  const v = { repos: counted, of: list.length, months: lastMonths(months).map((m) => ({ month: m, devs: per.get(m)?.devs.size || 0, newDevs: newBy.get(m) || 0, commits: per.get(m)?.commits || 0 })) }
  memo = { key, v }
  return v
}
// one repository: commits and developers per month
export function repoMonths(full, months = 24) {
  const r = H.repos[full]
  if (!r) return null
  const per = new Map()
  for (const [w, login, c] of r.rows) { const m = monthOf(w); let p = per.get(m); if (!p) per.set(m, (p = { devs: new Set(), commits: 0 })); p.devs.add(login); p.commits += c }
  return lastMonths(months).map((m) => ({ month: m, devs: per.get(m)?.devs.size || 0, commits: per.get(m)?.commits || 0 }))
}
