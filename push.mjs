// Browser notifications for people who follow projects or people on this device, and for new CKB projects.
// No accounts: a subscription is the browser's push endpoint plus what it follows, kept in DATA_DIR/push.json.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import webpush from 'web-push'
import { words } from './cards.mjs'

const short = (name) => String(name || '').split('/').pop()
const MAX_SUBS = 20000, MAX_FOLLOWS = 300
const QUIET_MS = 10 * 60e3 // at most one notice per project and subscription in this time
let file = '', keys = null
const subs = new Map() // id -> { id, sub, repos, people, news, lang, at, last }

export function initPush(dataDir) {
  const kf = path.join(dataDir, 'vapid.json')
  if (fs.existsSync(kf)) keys = JSON.parse(fs.readFileSync(kf, 'utf8'))
  else { keys = webpush.generateVAPIDKeys(); fs.writeFileSync(kf, JSON.stringify(keys)) }
  webpush.setVapidDetails('https://github.com/LusoCryptoLabs/ckb-pulse', keys.publicKey, keys.privateKey)
  file = path.join(dataDir, 'push.json')
  if (fs.existsSync(file)) for (const s of JSON.parse(fs.readFileSync(file, 'utf8'))) subs.set(s.id, s)
  console.log(`push: ${subs.size} subscriptions`)
}
let saveTimer = null
function save() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => { const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify([...subs.values()])); fs.renameSync(tmp, file) }, 2000)
}
export const publicKey = () => keys.publicKey

// a browser says what it follows; the endpoint must be a push service over https
export function subscribe(body) {
  const sub = body?.sub
  if (!sub || typeof sub.endpoint !== 'string' || !/^https:\/\//.test(sub.endpoint) || !sub.keys?.p256dh || !sub.keys?.auth) return { ok: false }
  const id = crypto.createHash('sha256').update(sub.endpoint).digest('hex').slice(0, 24)
  if (!subs.has(id) && subs.size >= MAX_SUBS) return { ok: false }
  const list = (x) => [...new Set((Array.isArray(x) ? x : []).filter((v) => typeof v === 'string' && v.length < 140).map((v) => v.toLowerCase()))].slice(0, MAX_FOLLOWS)
  const prev = subs.get(id)
  subs.set(id, { id, sub: { endpoint: sub.endpoint, keys: { p256dh: String(sub.keys.p256dh), auth: String(sub.keys.auth) } }, repos: list(body.repos), people: list(body.people), news: !!body.news, lang: ['en', 'pt', 'zh'].includes(body.lang) ? body.lang : 'en', at: prev?.at || Date.now(), last: prev?.last || {} })
  save()
  return { ok: true }
}
export function unsubscribe(body) {
  const id = body?.endpoint ? crypto.createHash('sha256').update(String(body.endpoint)).digest('hex').slice(0, 24) : ''
  const had = subs.delete(id)
  if (had) save()
  return { ok: had }
}
async function send(s, payload) {
  try { await webpush.sendNotification(s.sub, JSON.stringify(payload), { TTL: 6 * 3600, urgency: 'normal' }) }
  catch (err) { if (err.statusCode === 404 || err.statusCode === 410) { subs.delete(s.id); save() } else console.warn('push', err.statusCode || err.message) }
}
// a new update by a person: everyone who follows the project or the person hears about it, once per project in ten minutes
export function notifyEvent(e) {
  if (e.bot) return
  const now = Date.now(), repo = e.repo.toLowerCase(), who = String(e.actor).toLowerCase()
  for (const s of subs.values()) {
    if (!s.repos.includes(repo) && !s.people.includes(who)) continue
    if (now - (s.last[repo] || 0) < QUIET_MS) continue
    s.last[repo] = now
    const t = words(s.lang)
    send(s, { title: short(e.repo), body: `${e.actor} ${t('v.' + e.kind, { repo: short(e.repo) })}${e.title ? `: ${e.title}` : ''}`, url: `/?repo=${encodeURIComponent(e.repo)}`, tag: e.repo })
  }
  save()
}
// a new CKB project: everyone who asked for new projects, and whoever follows its owner
export function notifyNews(n) {
  const owner = n.name.split('/')[0].toLowerCase()
  for (const s of subs.values()) {
    if (!s.news && !s.people.includes(owner)) continue
    const t = words(s.lang)
    send(s, { title: t('n.title'), body: `${short(n.name)} · ${t.group(n.group)}${n.desc ? `: ${n.desc}` : ''}`, url: `/?repo=${encodeURIComponent(n.name)}`, tag: `new:${n.name}` })
  }
}
export const pushCount = () => subs.size
