// Who comes: page views and visitors per day, without cookies or accounts. A visitor is a hash of the day's salt, the
// address and the browser, kept only for that day; the salt is dropped with the day, so no hash can be checked later.
// Kept in DATA_DIR/visits.json for 90 days: `/api/visits` reads the last 30. Monitors, link previews and scripts
// count apart, as bots: on 2026-10-26 they made 1997 views of the page while its script was fetched 26 times.
// A person is a browser whose page said it opened (`here`, sent by menu.js): on 2026-11-27, 3500 addresses asked for
// pages with a browser's name and only 153 loaded the page's style or script; the rest were scrapers on cloud servers.
// `browsers` keeps the old number, every address that asked with a browser's name, so the two can be compared.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const KEEP_DAYS = 90
let file = '', dirty = false
let V = { days: {} } // day -> { salt, views: { page: n }, seen: { page: [hash] }, here: [hash], bots: { page: n } }

// what is not a person reading: uptime checks, crawlers, link previews, scripts, headless browsers
const BOT = /bot|crawl|spider|slurp|preview|uptime|monitor|sentinel|curl|wget|python|^node|go-http|java\/|okhttp|axios|headless|lighthouse|facebookexternalhit|whatsapp|embedly|googleother|google-|bytespider|scrap/i
export const isBot = (ua) => !ua || BOT.test(ua)

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
// people on the whole site that day: a visitor reading three pages is one person, not three. Counted before the hashes go
const peopleOf = (seen) => new Set(Object.values(seen || {}).flat()).size
const dayOf = (now) => new Date(now).toISOString().slice(0, 10)
function dayRec(day) {
  let d = V.days[day]
  if (!d) {
    d = V.days[day] = { salt: crypto.randomBytes(16).toString('hex'), views: {}, seen: {}, here: [] }
    // older days keep their counts and lose their salt and hashes
    for (const [k, r] of Object.entries(V.days)) {
      if (k === day) continue
      if (r.salt) { delete r.salt; r.visitors = Object.fromEntries(Object.entries(r.seen || {}).map(([p, l]) => [p, l.length])); r.browsers = peopleOf(r.seen); r.readers = (r.here || []).length; delete r.seen; delete r.here; if (r.mcp && Array.isArray(r.mcp.callers)) r.mcp.callers = r.mcp.callers.length }
      if (Date.now() - Date.parse(k) > KEEP_DAYS * 864e5) delete V.days[k]
    }
  }
  return d
}
// What people did, as numbers per day and nothing else: a share channel used, a card drawn. No address, no browser, no
// hash: a count has no one in it. Preview robots (X, Telegram, WhatsApp fetching a card) count apart, as bots, which is
// how a share shows up before anyone clicks
export const COUNTS = ['share_copy', 'share_x', 'share_telegram', 'share_whatsapp', 'share_image', 'share_native', 'badge_copy',
  'card_highlights', 'card_repo', 'card_person', 'card_fiber', 'card_use', 'card_digest', 'card_lesson', 'api_check', 'support_ckb', 'support_btc', 'support_evm']
export function count(name, ua, now = Date.now()) {
  if (!COUNTS.includes(name)) return false
  const d = dayRec(dayOf(now)), box = isBot(ua) ? (d.botCounts ||= {}) : (d.counts ||= {})
  box[name] = (box[name] || 0) + 1
  dirty = true
  return true
}
// What MCP clients do, per day: how many asked each method and each tool, and how many different callers used a tool.
// Directories, liveness checks and research surveys say who they are in their user agent (measured 2026-11-19: 10,794 of
// 15,186 POSTs in 14 days); a tool call from one counts apart, as a probe. Callers are hashes of the day's salt, kept for
// the day only, like the visitors: afterwards only the number stays
const PROBE = /bot|probe|prober|liveness|monitor|crawl|oracle|uptime|check|scan|spider|index|survey|research|audit|directory|inventory|catalog|collector|observatory|radar|watch|verify|health/i
export const isProbe = (ua) => PROBE.test(ua || '')
export function mcpUse(method, tool, ip, ua, now = Date.now()) {
  const d = dayRec(dayOf(now)), m = (d.mcp ||= { methods: {}, tools: {}, probeTools: {}, callers: [] })
  m.methods[method] = (m.methods[method] || 0) + 1
  if (method === 'tools/call' && tool) {
    const probe = isProbe(ua), box = probe ? m.probeTools : m.tools
    box[tool] = (box[tool] || 0) + 1
    if (!probe && d.salt) {
      const h = crypto.createHash('sha256').update(`${d.salt}|mcp|${ip || ''}|${ua || ''}`).digest('hex').slice(0, 16)
      if (!m.callers.includes(h)) m.callers.push(h)
    }
  }
  dirty = true
}
const mcpOf = (m) => (m ? { methods: m.methods, tools: m.tools, probeTools: m.probeTools, callers: Array.isArray(m.callers) ? m.callers.length : m.callers } : null)

const visitor = (d, ip, ua) => crypto.createHash('sha256').update(`${d.salt}|${ip || ''}|${ua || ''}`).digest('hex').slice(0, 16)
// one request to a page; ip and ua as the proxy gives them
export function hit(page, ip, ua, now = Date.now()) {
  const d = dayRec(dayOf(now))
  if (isBot(ua)) { (d.bots ||= {})[page] = (d.bots[page] || 0) + 1; dirty = true; return }
  d.views[page] = (d.views[page] || 0) + 1
  const h = visitor(d, ip, ua)
  const seen = d.seen[page] || (d.seen[page] = [])
  if (!seen.includes(h)) seen.push(h)
  dirty = true
}
// a page that opened in a browser says so once (menu.js): that browser is a person for the day
export function here(ip, ua, now = Date.now()) {
  if (isBot(ua)) return
  const d = dayRec(dayOf(now)), h = visitor(d, ip, ua), list = (d.here ||= [])
  if (!list.includes(h)) { list.push(h); dirty = true }
}
// people for a day: those whose page said it opened; null for days before 2026-11-27, which only have browsers
const readersOf = (r) => (r.here ? r.here.length : r.readers ?? null)
const browsersOf = (r) => (r.seen ? peopleOf(r.seen) : r.browsers ?? r.people ?? null)
// the last n days, oldest first: views and visitors per page, and the totals
export function visits(n = 30, now = Date.now()) {
  const days = []
  for (let i = n - 1; i >= 0; i--) {
    const day = dayOf(now - i * 864e5), r = V.days[day]
    days.push({ day, mcp: mcpOf(r?.mcp), people: r ? readersOf(r) : 0, browsers: r ? browsersOf(r) : 0, counts: r?.counts || {}, botCounts: r?.botCounts || {}, views: r?.views || {}, visitors: r ? (r.seen ? Object.fromEntries(Object.entries(r.seen).map(([p, l]) => [p, l.length])) : r.visitors || {}) : {}, bots: r?.bots || {} })
  }
  const total = { views: {}, visitors: {}, bots: {}, counts: {}, botCounts: {} }
  for (const d of days) for (const k of ['views', 'visitors', 'bots', 'counts', 'botCounts']) for (const [p, v] of Object.entries(d[k])) total[k][p] = (total[k][p] || 0) + v
  return { days, total }
}
