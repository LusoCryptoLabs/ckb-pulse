// Marks a person earns once and keeps: the first merged pull request seen here, the month of their first commit, the sixth
// month with commits. Each has a date and a proof, is recorded the first time it is seen, and is never taken back, so a
// person who stops, or an event that ages out of the 90 days GitHub lists, changes nothing. Kept in DATA_DIR/awards.json.
import fs from 'node:fs'
import path from 'node:path'

export const KINDS = ['since', 'months6', 'merged']
let file = ''
let A = { people: {} } // lower-case login -> { login, since?, months6?, merged? }, each { date, proof }

export function loadAwards(dir) {
  file = path.join(dir, 'awards.json')
  if (fs.existsSync(file)) { try { A = JSON.parse(fs.readFileSync(file, 'utf8')) } catch (err) { console.error('awards unreadable:', err.message) } }
}
const save = () => { if (!file) return; const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(A)); fs.renameSync(tmp, file) }

function give(login, kind, date, proof) {
  const k = login.toLowerCase(), p = A.people[k] || (A.people[k] = { login })
  if (p[kind]) return false // once
  p[kind] = { date, ...(proof ? { proof } : {}) }
  return true
}

// events: the people's own work only (no bots or agents); people: [{ login, months: ['2024-03', ...] }] from the long history
export function scanAwards(events, people = []) {
  let n = 0
  // a first merged pull request can only be named for someone whose first commit here falls inside the events Pulse has
  // read: for anyone who was here before them, the first one seen is not the first one
  const first = new Map(people.filter((p) => p.months.length).map((p) => [p.login.toLowerCase(), p.months[0]]))
  const seenFrom = events.reduce((m, e) => (e.at < m ? e.at : m), '9999').slice(0, 7)
  const merged = events.filter((e) => e.kind === 'pr_merged' && !e.bot && !e.agent && !e.ai && e.actor).sort((a, b) => (a.at < b.at ? -1 : 1))
  for (const e of merged) { const f = first.get(e.actor.toLowerCase()); if (f && f >= seenFrom && give(e.actor, 'merged', e.at.slice(0, 10), e.url)) n++ }
  for (const p of people) {
    if (!p.months.length) continue
    if (give(p.login, 'since', p.months[0] + '-01', '')) n++
    if (p.months.length >= 6 && give(p.login, 'months6', p.months[5] + '-01', '')) n++
  }
  if (n) save()
  return n
}

// what a person has earned, oldest first
export function earnedBy(login) {
  const p = A.people[String(login).toLowerCase()]
  if (!p) return []
  return KINDS.filter((k) => p[k]).map((id) => ({ id, ...p[id] })).sort((a, b) => (a.date < b.date ? -1 : 1))
}
export const hasEarned = (login, id) => earnedBy(login).some((x) => x.id === id)
export const resetAwards = () => { A = { people: {} } } // tests
