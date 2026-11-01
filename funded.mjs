// The grants the CKB Community Fund DAO pays for (FUNDED in config.mjs), side by side: the code since the money was
// voted, from GitHub, and what each team reported in its proposal's thread on Nervos Talk. The threads are read once a
// day into DATA_DIR/funded.json; only the team's posts are kept, with their kind and date, never their text.
import fs from 'node:fs'
import path from 'node:path'
import { FUNDED } from './config.mjs'
import { words } from './cards.mjs'
import { CSS } from './digest.mjs'

const TALK = 'https://talk.nervos.org'
const DAY = 864e5, WEEK = 7 * DAY
const QUIET_DAYS = 30
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
let file = ''
let F = { at: 0, topics: {} } // topic -> { title, author, posts: [{ n, at, user, kind, m }] }

export function loadFunded(dir) {
  file = path.join(dir, 'funded.json')
  if (fs.existsSync(file)) { try { F = JSON.parse(fs.readFileSync(file, 'utf8')) } catch (err) { console.error('funded unreadable:', err.message) } }
}
const save = () => { const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(F)); fs.renameSync(tmp, file) }

// A team's post by its first words. Read on the six threads on 2026-11-01: "Milestone 1 Completion Report",
// "milestone.1 已完成", "Milestone 3 complete: ...", "[Weekly Update] Fiber Link (Milestone 2)", "周报 2026.5.10",
// "Fiber Studio, DAO Grant Completion Report", "Pocket Node Completion Report ... (Milestones 1 to 4)".
// A weekly update names its milestone without closing it; a completion report for the whole grant names none; a reply
// that starts with @someone answers a question ("we already revealed the repo URL in the M1 report", Fiber Link).
export function classify(text) {
  const head = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 140)
  if (head.startsWith('@')) return { kind: 'post' }
  const weekly = /weekly (update|report)|周报|progress update|status update/i.test(head)
  const m = head.slice(0, 60).match(/milestone\s*\.?\s*(\d+)|\bM(\d+)\s+(?:report|completion)|里程碑\s*(\d+)/i)
  if (m && !weekly && /complete|completion|report|done|delivered|已完成|完成/i.test(head)) return { kind: 'milestone', m: +(m[1] || m[2] || m[3]) }
  if (/completion report|delivery report|grant completion/i.test(head)) return { kind: 'delivered' }
  if (weekly || /\bupdate\b|\breport\b|release|is live|is out|已收到|进度/i.test(head)) return { kind: 'update' }
  return { kind: 'post' }
}

// the post's own words: quotes of other posts left out
const plain = (html) => String(html).replace(/<aside class="quote"[\s\S]*?<\/aside>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"').replace(/&[a-z]+;/g, ' ')
async function talk(url) {
  const r = await fetch(TALK + url, { headers: { accept: 'application/json', 'user-agent': 'ckb-pulse (+https://pulse-lab.lusocryptolabs.com/funded)' } })
  if (!r.ok) throw new Error(`${r.status} ${url}`)
  return r.json()
}
// every post of a thread: the first twenty come with the topic, the rest twenty at a time by id
async function threadPosts(topic) {
  const t = await talk(`/t/${topic}.json`)
  const have = new Map(t.post_stream.posts.map((p) => [p.id, p]))
  const rest = t.post_stream.stream.filter((id) => !have.has(id))
  for (let k = 0; k < rest.length; k += 20) {
    const q = rest.slice(k, k + 20).map((id) => `post_ids[]=${id}`).join('&')
    for (const p of (await talk(`/t/${topic}/posts.json?${q}`)).post_stream.posts) have.set(p.id, p)
  }
  return { title: t.title, author: t.details.created_by.username, posts: t.post_stream.stream.map((id) => have.get(id)).filter(Boolean) }
}
export async function refreshFunded(list = FUNDED) {
  for (const f of list) {
    try {
      const t = await threadPosts(f.topic)
      const team = new Set([t.author, ...(f.team || [])].map((u) => u.toLowerCase()))
      const posts = t.posts.filter((p) => p.post_number > 1 && team.has(p.username.toLowerCase())).map((p) => ({ n: p.post_number, at: p.created_at, user: p.username, ...classify(plain(p.cooked)) }))
      F.topics[f.topic] = { title: t.title, author: t.author, posts }
    } catch (err) { console.warn('funded', f.topic, err.message) }
  }
  F.at = Date.now()
  save()
  console.log(`funded: ${list.length} threads read`)
}
export function startFunded() {
  const tick = () => { if (Date.now() - (F.at || 0) > DAY) refreshFunded().catch((err) => console.warn('funded', err.message)) }
  setTimeout(tick, 20e3).unref()
  setInterval(tick, 3600e3).unref()
}

// one grant as the page shows it. repos: its public repositories; rows(full): GitHub's weekly commits per person (null
// while GitHub counts); events: the people's events of the last 30 days, any branch
export function grantView(f, { repos, rows, events, now = Date.now(), thread = F.topics[f.topic] }) {
  const since = Date.parse(f.since)
  const weeks = new Map(), people = new Set()
  let counted = 0, lastCommit = 0
  for (const full of repos) {
    const rs = rows(full)
    if (!rs) continue
    counted++
    for (const [w, login, c] of rs) {
      const at = w * 1000
      if (at + WEEK <= since) continue
      weeks.set(at, (weeks.get(at) || 0) + c)
      people.add(login)
      lastCommit = Math.max(lastCommit, at)
    }
  }
  const mine = events.filter((e) => repos.includes(e.repo))
  for (const e of mine) people.add(e.actor)
  const lastEvent = Math.max(0, ...mine.map((e) => Date.parse(e.at)))
  const lastWork = Math.max(lastEvent, lastCommit)
  const posts = (thread?.posts || []).filter((p) => Date.parse(p.at) >= since - DAY)
  const reports = posts.filter((p) => p.kind !== 'post')
  const delivered = posts.find((p) => p.kind === 'delivered')
  const lastReport = Math.max(0, ...reports.map((p) => Date.parse(p.at)))
  const quiet = !delivered && now - lastWork > QUIET_DAYS * DAY && now - lastReport > QUIET_DAYS * DAY
  // a bar per week from the vote to this one
  const first = Math.floor(since / WEEK) * WEEK, bars = []
  for (let w = first; w <= now; w += WEEK) {
    let c = 0
    for (const [at, n] of weeks) if (at >= w && at < w + WEEK) c += n
    bars.push(c)
  }
  return {
    topic: f.topic, name: f.name, grant: f.grant, since: f.since, nonCode: !!f.nonCode, repos, counting: counted < repos.length,
    commits: [...weeks.values()].reduce((a, b) => a + b, 0), people: people.size, bars, first,
    lastWork: lastWork ? new Date(lastWork).toISOString() : null, lastReport: lastReport ? new Date(lastReport).toISOString() : null,
    milestones: posts.filter((p) => p.kind === 'milestone').map((p) => ({ m: p.m, at: p.at, n: p.n })),
    updates: reports.length, delivered: delivered ? { at: delivered.at, n: delivered.n } : null,
    status: delivered ? 'delivered' : quiet ? 'quiet' : 'progress',
  }
}
export const fundedRead = () => F.at

// ---------- the page ----------
const PAGE_CSS = `.grant{background:#0f140c;border:1px solid #26331a;border-radius:16px;padding:16px 18px;margin:16px 0}.grant h2{margin:0;font-size:20px;color:#eef3e2;text-transform:none;letter-spacing:0}
.grant .meta{color:#9aa38e;font-size:14px;margin:2px 0 10px}.st{display:inline-block;font-size:13px;font-weight:700;border-radius:999px;padding:3px 10px;margin:0 0 10px}
.st.delivered{background:#cbf34d;color:#1a2208}.st.progress{background:#16301f;color:#9be5b0;border:1px solid #2d5a3a}.st.quiet{background:#3a2412;color:#ffc58a;border:1px solid #7a4a1f}
.nums{display:flex;flex-wrap:wrap;gap:6px 18px;margin:10px 0;font-size:14px;color:#9aa38e}.nums b{color:#eef3e2;font-size:18px;margin-right:4px}
.ch{position:relative;padding-top:16px;margin:6px 0 4px}.ch .mk{position:absolute;top:0;transform:translateX(-50%);font-size:11px;font-weight:700;line-height:14px}svg.wk{display:block;width:100%;height:56px}
.legend{font-size:12px;color:#9aa38e;margin:0}.legend span{white-space:nowrap;margin-right:12px}.legend i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:5px}
.links{font-size:14px;margin-top:8px;overflow-wrap:anywhere}.links a{margin-right:12px}.note{font-size:13px;color:#ffc58a;margin:6px 0 0}`
const fmt = (iso, t) => (iso ? new Date(iso).toLocaleDateString(t('locale'), { day: 'numeric', month: 'short', year: 'numeric' }) : '')

// weekly commits as bars; the vote at the left edge, a mark per milestone report and the completion report. The marks'
// labels are HTML above the drawing, so they keep their size when the drawing stretches to the card's width
function chart(g, t) {
  const n = Math.max(1, g.bars.length), max = Math.max(1, ...g.bars), W = 600, H = 56, bw = W / n
  const x = (iso) => Math.min(W - 2, Math.max(2, ((Date.parse(iso) - g.first) / WEEK) * bw))
  const bars = g.bars.map((c, i) => (c ? `<rect x="${(i * bw + bw * 0.15).toFixed(1)}" y="${(H - 2 - (c / max) * (H - 4)).toFixed(1)}" width="${Math.max(1, bw * 0.7).toFixed(1)}" height="${((c / max) * (H - 4)).toFixed(1)}" fill="#cbf34d"/>` : '')).join('')
  const marks = [...g.milestones.map((m) => [m.at, '#62c9f5', `M${m.m}`]), ...(g.delivered ? [[g.delivered.at, '#ffd166', '✓']] : [])]
  const lines = marks.map(([at, c]) => `<line x1="${x(at).toFixed(1)}" x2="${x(at).toFixed(1)}" y1="0" y2="${H - 2}" stroke="${c}" stroke-width="2" vector-effect="non-scaling-stroke"/>`).join('')
  const labels = marks.map(([at, c, l]) => `<span class="mk" style="left:${((x(at) / W) * 100).toFixed(1)}%;color:${c}">${l}</span>`).join('')
  const label = t('f.chart', { commits: g.commits, since: fmt(g.since, t) })
  return `<div class="ch">${labels}<svg class="wk" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(label)}"><line x1="0" x2="${W}" y1="${H - 1}" y2="${H - 1}" stroke="#26331a" vector-effect="non-scaling-stroke"/>${bars}${lines}</svg></div>`
}

export function fundedPage({ lang, grants, base, url, readAt }) {
  const t = words(lang)
  const title = `CKB Pulse · ${t('f.title')}`
  const desc = t('f.lead')
  const card = (g) => `<article class="grant"><h2>${esc(g.name)}</h2><p class="meta">${esc(t('f.grant', { grant: g.grant, since: fmt(g.since, t) }))}</p>
<span class="st ${g.status}">${esc(g.status === 'delivered' ? t('f.delivered', { date: fmt(g.delivered.at, t) }) : g.status === 'quiet' ? t('f.quiet', { date: fmt(g.lastWork || g.since, t) }) : t('f.progress'))}</span>
${chart(g, t)}<p class="legend">${[['#cbf34d', 'f.lCommits'], ['#62c9f5', 'f.lMilestone'], ['#ffd166', 'f.lDelivered']].map(([c, k]) => `<span><i style="background:${c}"></i>${esc(t(k))}</span>`).join('')}</p>
<div class="nums"><span><b>${g.counting && !g.commits ? '…' : g.commits}</b>${esc(t.cnt('f.commits', g.commits))}</span><span><b>${g.people}</b>${esc(t.cnt('f.people', g.people))}</span><span><b>${g.updates}</b>${esc(t.cnt('f.reports', g.updates))}</span></div>
<div class="nums"><span>${esc(t('f.lastWork'))}: ${esc(fmt(g.lastWork, t) || t('f.none'))}</span><span>${esc(t('f.lastReport'))}: ${esc(fmt(g.lastReport, t) || t('f.none'))}</span></div>
${g.nonCode ? `<p class="note">${esc(t('f.nonCode'))}</p>` : ''}${g.counting ? `<p class="note">${esc(t('f.counting'))}</p>` : ''}
<p class="links"><a href="${TALK}/t/${g.topic}">${esc(t('f.thread'))}</a>${g.repos.map((r) => `<a href="${esc(base)}/?repo=${encodeURIComponent(r)}&lang=${lang}">${esc(r)}</a>`).join('')}</p></article>`
  return `<!doctype html><html lang="${lang === 'zh' ? 'zh-CN' : lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}"><meta property="og:type" content="article"><meta property="og:site_name" content="CKB Pulse"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<link rel="icon" href="${esc(base)}/icon-192.png"><style>${CSS}${PAGE_CSS}</style></head><body><main>
<header><i></i><h1>${esc(t('f.title'))}</h1></header><p class="sub">${esc(desc)} · <a href="${esc(base)}/?lang=${lang}">CKB Pulse</a></p>
${grants.map(card).join('\n')}
<footer><p>${esc(t('f.about'))}</p><p>${esc(t('f.read', { date: fmt(readAt ? new Date(readAt).toISOString() : null, t) || t('f.none') }))} <a href="${esc(base)}/api/funded">api/funded</a></p>
<p class="langs no-print">${['en', 'zh', 'pt'].map((l) => `<a href="${esc(url)}?lang=${l}" lang="${l === 'zh' ? 'zh-CN' : l}">${{ en: 'English', zh: '中文', pt: 'Português' }[l]}</a>`).join('')}</p></footer>
</main></body></html>`
}
