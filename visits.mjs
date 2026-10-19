// Who comes: page views and visitors per day, without cookies or accounts. A visitor is a hash of the day's salt, the
// address and the browser, kept only for that day; the salt is dropped with the day, so no hash can be checked later.
// Kept in DATA_DIR/visits.json for 90 days: `/api/visits` reads the last 30.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const KEEP_DAYS = 90
let file = '', dirty = false
let V = { days: {} } // day -> { salt, views: { page: n }, seen: { page: [hash] } }

export function initVisits(dir) {
  file = path.join(dir, 'visits.json')
  if (fs.existsSync(file)) { try { V = JSON.parse(fs.readFileSync(file, 'utf8')) } catch (err) { console.error('visits unreadable:', err.message) } }
  setInterval(save, 60e3).unref()
}
function save() {
  if (!dirty || !file) return
  dirty = false
  const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(V)); fs.renameSync(tmp, file)
}
const dayOf = (now) => new Date(now).toISOString().slice(0, 10)
function dayRec(day) {
  let d = V.days[day]
  if (!d) {
    d = V.days[day] = { salt: crypto.randomBytes(16).toString('hex'), views: {}, seen: {} }
    // older days keep their counts and lose their salt and hashes
    for (const [k, r] of Object.entries(V.days)) {
      if (k === day) continue
      if (r.salt) { delete r.salt; r.visitors = Object.fromEntries(Object.entries(r.seen || {}).map(([p, l]) => [p, l.length])); delete r.seen }
      if (Date.now() - Date.parse(k) > KEEP_DAYS * 864e5) delete V.days[k]
    }
  }
  return d
}
// one request to a page; ip and ua as the proxy gives them
export function hit(page, ip, ua, now = Date.now()) {
  const d = dayRec(dayOf(now))
  d.views[page] = (d.views[page] || 0) + 1
  const h = crypto.createHash('sha256').update(`${d.salt}|${ip || ''}|${ua || ''}`).digest('hex').slice(0, 16)
  const seen = d.seen[page] || (d.seen[page] = [])
  if (!seen.includes(h)) seen.push(h)
  dirty = true
}
// the last n days, oldest first: views and visitors per page, and the totals
export function visits(n = 30, now = Date.now()) {
  const days = []
  for (let i = n - 1; i >= 0; i--) {
    const day = dayOf(now - i * 864e5), r = V.days[day]
    days.push({ day, views: r?.views || {}, visitors: r ? (r.seen ? Object.fromEntries(Object.entries(r.seen).map(([p, l]) => [p, l.length])) : r.visitors || {}) : {} })
  }
  const total = { views: {}, visitors: {} }
  for (const d of days) for (const k of ['views', 'visitors']) for (const [p, v] of Object.entries(d[k])) total[k][p] = (total[k][p] || 0) + v
  return { days, total }
}
