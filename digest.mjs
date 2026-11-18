// The digest: a period's highlights as a plain page anyone can read, forward or print (`/digest?p=day|week|month`), an
// Atom feed of the weekly digests and the new projects (`/feed.xml`), and, when a Telegram bot is configured, the
// weekly digest posted every Monday. Each Monday's digest is kept in DATA_DIR/digests.json, a year of them.
import fs from 'node:fs'
import path from 'node:path'
import { words } from './cards.mjs'
import { barHtml, today } from './public/menu.js'
import { withStamp } from './og.mjs'

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const short = (name) => String(name || '').split('/').pop()
const DAY = 864e5
const KEEP = 53
let file = ''
let D = { weeks: [] } // [{ at, stats, repos, commits, people, orgs, news }], newest last
// who made the page, where it is posted about and its source, at the foot of every plain page
// the bar every server page opens with (the name, the three views, the menu), and its style and script
export const pageBar = barHtml
export const menuHead = (base) => `<link rel="stylesheet" href="${esc(base)}/theme.css"><link rel="stylesheet" href="${esc(base)}/menu.css">`
export const menuScript = (base) => `<script type="module" src="${esc(base)}/menu.js"></script>`
// a reading page opens with a small label, a large title whose *starred* words are lit, and one line under it
export const pageHead = ({ eyebrow, title, lede }) => `<header class="hero"><span class="eyebrow">${esc(eyebrow)}</span><h1>${esc(title).replace(/\*([^*]+)\*/g, '<em>$1</em>')}</h1>${lede ? `<p class="lede">${lede}</p>` : ''}</header>`
// the page that lists everything Pulse does, linked from the other pages' footers
export const useLink = (t, base, lang) => `<p><a href="${esc(base)}/use?lang=${lang}">${esc(t('use.nav'))}</a> · <a href="${esc(base)}/method?lang=${lang}">${esc(t('me.nav'))}</a></p>`
export const maker = (t) => `<p><a href="https://lusocryptolabs.com">${esc(t('by'))}</a> · <a href="https://x.com/lusocryptolabs">X</a> · <a href="https://github.com/LusoCryptoLabs/ckb-pulse">GitHub</a></p>`
// the same page in each language, at the foot of every page; the page says how to address itself
export const langLinks = (hrefOf) => `<p class="langs no-print">${['en', 'zh', 'pt'].map((l) => `<a href="${esc(hrefOf(l))}" lang="${l === 'zh' ? 'zh-CN' : l}">${{ en: 'English', zh: '中文', pt: 'Português' }[l]}</a>`).join('')}</p>`
// the foot the plain pages share: who made it, and the language links
export const pageFoot = (t, url) => `<footer>${maker(t)}
${langLinks((l) => `${url}?lang=${l}`)}</footer>`
// the cards of the two reading pages, method and privacy
export const READING_CSS = `section.me{background:var(--surface);border:1px solid var(--edge);border-radius:20px;padding:14px 18px;margin:14px 0}section.me h2{margin:0 0 4px;font:600 19px var(--font-ui,sans-serif);letter-spacing:-.01em;color:var(--fg);text-transform:none}section.me p{margin:6px 0}
.go{display:flex;gap:8px;margin:12px 0 2px}.go a{display:inline-block;padding:7px 14px;border-radius:999px;background:var(--lime);color:var(--ink);font-weight:700;text-decoration:none;font-size:14px}`

export function loadDigests(dir) {
  file = path.join(dir, 'digests.json')
  if (fs.existsSync(file)) { try { D = JSON.parse(fs.readFileSync(file, 'utf8')) } catch (err) { console.error('digests unreadable:', err.message) } }
}
const save = () => { const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(D)); fs.renameSync(tmp, file) }
export const weeks = () => D.weeks
// Each kept week has an address of its own, /digest/2026-W46: the week that ended on the Monday it was kept (the
// feed used to link every week to the live page, whose numbers moved on: an entry said 970, the page 1037)
export function weekLabel(at) {
  const d = new Date(at - DAY_MS)
  const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  const dow = (new Date(day).getUTCDay() + 6) % 7 // Monday is 0
  const thursday = day - dow * DAY_MS + 3 * DAY_MS
  const year = new Date(thursday).getUTCFullYear()
  const week = Math.floor((thursday - Date.UTC(year, 0, 1)) / (7 * DAY_MS)) + 1
  return `${year}-W${String(week).padStart(2, '0')}`
}
const DAY_MS = 864e5
// two kept weeks can share a number (the first digest was kept on a Thursday, the next on the Monday after): the
// earlier one is then named by its date
export const labelOf = (w) => (D.weeks.some((x) => x !== w && x.at > w.at && weekLabel(x.at) === weekLabel(w.at)) ? new Date(w.at).toISOString().slice(0, 10) : weekLabel(w.at))
export const weekByLabel = (label) => D.weeks.find((w) => labelOf(w) === label) || null
// a kept week in the shape the page and the card read
export const weekLeaders = (w) => ({ week: { stats: w.stats, repos: w.repos, commits: w.commits, people: w.people, orgs: w.orgs, bars: [] } })

// Monday 08:00 UTC, once a week; the first one as soon as the page has a week of data, so the feed is never empty.
// Each Monday counts on its own: the first one, kept on Thursday 2026-10-22, made "six days since the last" skip 10-26
export function digestDue(kept, now = Date.now()) {
  if (!kept.length) return true
  const d = new Date(now)
  if (d.getUTCDay() !== 1 || d.getUTCHours() < 8) return false
  return kept.at(-1).at < Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 8)
}
export function startDigest({ leaders, news, groupOf, publicUrl }) {
  const tick = async () => {
    if (!digestDue(D.weeks)) return
    const L = leaders().week
    if (!D.weeks.length && L.stats.updates < 50) return // not yet a week's worth
    const w = { at: Date.now(), stats: L.stats, repos: L.repos, commits: L.commits, people: L.people.map(([l, n]) => [l, n]), orgs: L.orgs, news: news().slice(0, 10).map((n) => ({ name: n.name, group: n.group, desc: n.desc })) }
    D.weeks.push(w); if (D.weeks.length > KEEP) D.weeks.shift()
    save()
    console.log(`digest: week of ${new Date(w.at).toISOString().slice(0, 10)} kept`)
    await telegram(w, groupOf, publicUrl).catch((err) => console.warn('telegram', err.message))
  }
  setInterval(() => tick().catch((err) => console.warn('digest', err.message)), 60e3).unref()
  setTimeout(() => tick().catch((err) => console.warn('digest', err.message)), 30e3).unref()
}
// TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID: the week's picture and a few lines, in DIGEST_LANG (en)
async function telegram(w, groupOf, publicUrl) {
  const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID
  if (!token || !chat || !publicUrl) return
  const lang = process.env.DIGEST_LANG || 'en', t = words(lang)
  const lines = [`*${t('mode.week')}* · ${t('og.desc', { updates: t.cnt('upd', w.stats.updates), people: t.cnt('ppl', w.stats.people), projects: t.cnt('prj', w.stats.projects), when: t('when.week') }).replace(/, [^,]*$/, '')}`]
  if (w.repos[0]) lines.push(`${t('b.repos.week')}: ${short(w.repos[0][0])} (${t.group(groupOf(w.repos[0][0]))})`)
  if (w.people[0]) lines.push(`${t('b.people.week')}: ${w.people[0][0]}`)
  if (w.orgs[0]) lines.push(`${t('b.orgs.week')}: ${t.group(w.orgs[0][0])}`)
  if (w.news.length) lines.push(`${t('n.list')}: ${w.news.map((n) => short(n.name)).join(', ')}`)
  lines.push(`${publicUrl}/digest?p=week&lang=${lang}`)
  const md = (s) => s.replace(/[_*[\]()~`>#+=|{}.!\\-]/g, (c) => '\\' + c)
  const caption = lines.map((l, i) => (i === 0 ? l.replace(/^\*([^*]*)\*(.*)$/, (_, a, b) => `*${md(a)}*${md(b)}`) : md(l))).join('\n')
  const r = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: chat, photo: withStamp(`${publicUrl}/og/highlights.png?p=week&lang=${lang}`, w), caption, parse_mode: 'MarkdownV2' }), signal: AbortSignal.timeout(20000) })
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`)
}

// ---------- the page ----------
export const CSS = `:root{color-scheme:dark}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 var(--font-ui,system-ui,sans-serif);background-image:radial-gradient(circle,rgba(203,243,77,.07) 1px,transparent 1.4px);background-size:22px 22px}
a{color:var(--lime)}main{max-width:860px;margin:0 auto;padding:28px 16px 56px}
.hero{display:grid;gap:14px;margin:6px 0 26px}.eyebrow{justify-self:start;display:inline-flex;align-items:center;gap:8px;font:11px var(--font-num,monospace);letter-spacing:.08em;text-transform:uppercase;color:var(--mut);border:1px solid var(--edge);border-radius:999px;padding:5px 12px;background:rgba(20,18,14,.7)}.eyebrow::before{content:"";width:7px;height:7px;background:var(--lime)}
h1{font-size:clamp(34px,6vw,58px);line-height:1.02;letter-spacing:-.035em;font-weight:600;margin:0;text-wrap:balance}h1 em{font-style:normal;color:var(--lime)}em.tag{margin-left:6px;padding:1px 7px;border-radius:6px;font:700 11px var(--font-num,monospace);letter-spacing:.04em;background:#2b2a4a;color:#c9c6ff;border:1px solid #5b57b0}.lede{color:var(--mut);font-size:17px;margin:0;max-width:62ch}
h2{font:500 11px var(--font-num,monospace);color:var(--mut);margin:34px 0 10px;text-transform:uppercase;letter-spacing:.08em}p.sub{color:var(--mut);margin:0 0 20px}
nav.p{display:flex;flex-wrap:wrap;align-items:center;gap:6px}nav.p>a,nav.p>b{display:inline-block;padding:6px 13px;border:1px solid var(--edge);border-radius:999px;margin:0;text-decoration:none;font-size:14px}nav.p>b{background:var(--lime);color:var(--ink);font-weight:600}
.kpis{display:flex;flex-wrap:wrap;gap:12px;margin:20px 0}.kpis div{flex:1;min-width:140px;background:var(--surface);border:1px solid var(--edge);border-radius:20px;padding:14px 16px}.kpis b{display:block;font:600 34px/1.15 var(--font-num,monospace);letter-spacing:-.02em;color:var(--lime)}.kpis span{color:var(--mut);font-size:14px}
.bars{display:flex;align-items:flex-end;gap:3px;height:70px;background:var(--surface);border:1px solid var(--edge);border-radius:18px;padding:10px}.bars i{flex:1;background:linear-gradient(#e2ff7a,#8fb81f);border-radius:3px 3px 0 0;min-height:2px}
ol{padding-left:0;list-style:none;margin:0}ol li{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid var(--edge-soft)}ol li span{min-width:0;overflow-wrap:anywhere}ol li b{color:var(--lime);white-space:nowrap;font:600 14px var(--font-num,monospace)}ol li small{color:var(--mut);margin-left:8px}
.medals li{border:1px solid var(--edge);background:var(--surface);border-radius:16px;padding:11px 14px;margin-bottom:8px;display:block}.medals small{display:block;color:var(--mut);margin:0}.medals strong{font-size:18px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:0 32px}footer{margin-top:44px;color:var(--mut);font-size:14px;border-top:1px solid var(--edge-soft);padding-top:16px}footer img{max-width:100%;height:auto}code{font-family:var(--font-num,monospace);background:var(--surface);border:1px solid var(--edge);border-radius:6px;padding:2px 6px;font-size:13px;overflow-wrap:anywhere}
.langs a{margin-right:10px}@media (max-width:600px){main{padding-top:18px}.kpis{gap:8px}.kpis div{min-width:0;padding:10px 12px}.kpis b{font-size:26px}.kpis span{font-size:12px}nav.p a,nav.p b{padding:5px 10px;font-size:13px}.bars{height:56px}.lede{font-size:16px}}
@media print{body{background:#fff;color:#111;background-image:none}.kpis div,.bars,.medals li,code{background:#f4f6ef;border-color:#ddd}a{color:#365c00}nav.p,footer .no-print,.eyebrow{display:none}h1 em{color:#365c00}}`

// the digest page for one period, in one language; news and trends come from the live state
export function digestPage({ period, lang, leaders, news, trends, groupOf, base, url, fixed = null, arrivals = [], rhythm = null }) {
  const t = words(lang), L = leaders[period], s = L.stats
  const q = (p, l) => (fixed ? `${url.replace(/\/digest.*$/, '')}/digest/${fixed.label}?lang=${l}` : `${url}?p=${p}&lang=${l}`)
  const link = (name) => `<a href="${esc(base)}/?repo=${encodeURIComponent(name)}&lang=${lang}">${esc(short(name))}</a><small>${esc(t.group(groupOf(name)))}</small>`
  const person = (login) => `<a href="${esc(base)}/?person=${encodeURIComponent(login)}&lang=${lang}">${esc(login)}</a>`
  const list = (title, rows, fmt) => rows.length ? `<section><h2>${esc(title)}</h2><ol>${rows.map((r) => `<li><span>${fmt(r)}</span><b>${esc(t.cnt('upd', r[1]))}</b></li>`).join('')}</ol></section>` : ''
  const max = Math.max(1, ...L.bars)
  const medals = [L.repos[0] && ['b.repos.' + period, link(L.repos[0][0])], L.people[0] && ['b.people.' + period, person(L.people[0][0])], L.orgs[0] && ['b.orgs.' + period, esc(t.group(L.orgs[0][0]))]].filter(Boolean)
  // the last whole month, as on the page: the current one has only begun
  const m = trends?.months || [], cur = m.at(-2), ago = m.at(-14)
  const month = cur ? new Date(`${cur.month}-15T00:00:00Z`).toLocaleDateString(t('locale'), { month: 'long', year: 'numeric', timeZone: 'UTC' }) : ''
  const title = `CKB Pulse · ${t('mode.' + period)}`
  const desc = t('og.desc', { updates: t.cnt('upd', s.updates), people: t.cnt('ppl', s.people), projects: t.cnt('prj', s.projects), when: t('when.' + period) })
  const img = fixed ? withStamp(`${base}/og/digest.png?w=${fixed.label}&lang=${lang}`, L) : withStamp(`${base}/og/highlights.png?p=${period}&lang=${lang}`, L)
  return `<!doctype html><html lang="${lang === 'zh' ? 'zh-CN' : lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}"><meta property="og:type" content="article"><meta property="og:site_name" content="CKB Pulse"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:image" content="${esc(img)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${esc(img)}">
<link rel="alternate" type="application/atom+xml" title="CKB Pulse" href="${esc(base)}/feed.xml"><link rel="icon" href="${esc(base)}/icon-192.png">${menuHead(base)}<style>${CSS}</style></head><body><main>
${pageBar(t, { base, lang, current: 'digest', here: fixed ? `/digest/${fixed.label}` : `/digest?p=${period}`, share: { url: `${q(period, lang)}&d=${today()}`, title, image: img } })}
${pageHead({ eyebrow: t('tab.top'), title: t('dg.h1.' + period), lede: `${esc(t('tagline'))} · <a href="${esc(base)}/?lang=${lang}">${esc(t('dg.live'))}</a>` })}
<nav class="p">${(fixed ? [] : ['day', 'week', 'month']).map((p) => (p === period ? `<b>${esc(t('mode.' + p))}</b>` : `<a href="${esc(q(p, lang))}">${esc(t('mode.' + p))}</a>`)).join('')}</nav>
<p class="sub">${esc(fixed ? t('dg.fixed', { label: fixed.label, date: new Date(fixed.at).toLocaleDateString(t('locale'), { dateStyle: 'long', timeZone: 'UTC' }) }) : t('dg.lead', { when: t('when.' + period), date: new Date().toLocaleDateString(t('locale'), { dateStyle: 'long' }) }))}</p>${fixed ? `<p class="sub no-print"><a href="${esc(base)}/digest?p=week&lang=${lang}">${esc(t('dg.nowWeek'))}</a></p>` : ''}
<div class="kpis"><div><b>${s.updates}</b><span>${esc(t('k.updates'))}</span></div><div><b>${s.people}</b><span>${esc(t('k.people'))}</span></div><div><b>${s.projects}</b><span>${esc(t('k.projects'))}</span></div></div>
${L.bars.length ? `<div class="bars" role="img" aria-label="${esc(t('h.note'))}">` : '<div hidden>'}${L.bars.map((v) => `<i style="height:${Math.max(3, Math.round((v / max) * 100))}%"></i>`).join('')}</div>
${medals.length ? `<section><h2>${esc(t('dg.medals'))}</h2><ol class="medals">${medals.map(([k, v]) => `<li><small>${esc(t(k))}</small><strong>${v}</strong></li>`).join('')}</ol></section>` : `<p>${esc(t('h.empty'))}</p>`}
<div class="grid">${list(t('h.repos'), L.repos, (r) => link(r[0]))}${list(t('h.people'), L.people, (r) => person(r[0]))}${list(t('h.reviewers'), L.reviewers || [], (r) => person(r[0]))}${list(t('h.merged'), L.merged || [], (r) => person(r[0]))}
${L.commits.length ? `<section><h2>${esc(t('h.commits'))}</h2><ol>${L.commits.map((r) => `<li><span>${link(r[0])}</span><b>${r[1]}</b></li>`).join('')}</ol></section>` : ''}
${L.operators?.length ? `<section><h2>${esc(t('h.operators'))}</h2><p><small>${esc(t('op.list'))}</small></p><ol>${L.operators.map((r) => `<li><span>${person(r[0])} <em class="tag">${esc(t('tag.op'))}</em></span><b>${esc(t.cnt('upd', r[1]))}</b></li>`).join('')}</ol></section>` : ''}
${L.ai?.length ? `<section><h2>${esc(t('h.ai'))}</h2><p><small>${esc(t('ai.note'))}</small></p><ol>${L.ai.map((r) => `<li><span>${person(r[0])} <em class="tag">${esc(t('tag.ai'))}</em></span><b>${esc(t.cnt('upd', r[1]))}</b></li>`).join('')}</ol></section>` : ''}
${L.orgs.length ? `<section><h2>${esc(t('h.orgs'))}</h2><ol>${L.orgs.map((r) => `<li><span>${esc(t.group(r[0]))}</span><b>${esc(t.cnt('upd', r[1]))}</b></li>`).join('')}</ol></section>` : ''}</div>
${news.length ? `<section><h2>${esc(t('n.list'))}</h2><ol>${news.slice(0, 10).map((n) => `<li><span>${link(n.name)}${n.desc ? `<br><small>${esc(n.desc.slice(0, 120))}</small>` : ''}</span></li>`).join('')}</ol></section>` : ''}
${arrivals.length ? `<section><h2>${esc(t('dg.arrived'))}</h2><p class="names">${arrivals.slice(0, 60).map(person).join(' · ')}${arrivals.length > 60 ? ` · ${esc(t('dg.more', { n: arrivals.length - 60 }))}` : ''}</p><p><small>${esc(t('dg.arrivedNote'))}</small></p></section>` : ''}
${rhythm && !fixed ? `<section><h2>${esc(t('rh.title'))}</h2><p>${esc(t('rh.line', { commits: rhythm.commits, median: rhythm.median }))}</p><p><small>${esc(t('rh.note'))}</small></p></section>` : ''}
${cur?.devs ? `<section><h2>${esc(t('t.title'))}</h2><p>${esc(t('t.line', { devs: cur.devs, month, newDevs: cur.newDevs, yearAgo: ago?.devs ?? 0 }))}</p></section>` : ''}
<footer><p>${esc(t('h.note'))} ${esc(t('dg.about'))}</p><p class="no-print">${esc(t('dg.feed'))} <a href="${esc(base)}/feed.xml">feed.xml</a></p>
<p class="no-print">${esc(t('dg.badge'))}<br><img src="${esc(base)}/badge/ckb.svg?lang=${lang}" alt="" height="20"><br><code>[![CKB Pulse](${esc(base)}/badge/ckb.svg)](${esc(base)}/)</code></p>
${useLink(t, base, lang)}${maker(t)}
${langLinks((l) => q(period, l))}</footer>
</main>${menuScript(base)}</body></html>`
}

// ---------- the feed ----------
const iso = (ms) => new Date(ms).toISOString()
export function feedXml({ lang, news, groupOf, base }) {
  const t = words(lang), host = base.replace(/^https?:\/\//, '')
  const entries = []
  for (const w of [...D.weeks].reverse().slice(0, 12)) {
    const day = iso(w.at).slice(0, 10)
    const sum = t('og.desc', { updates: t.cnt('upd', w.stats.updates), people: t.cnt('ppl', w.stats.people), projects: t.cnt('prj', w.stats.projects), when: t('when.week') })
    const li = (rows, f) => rows.length ? `<ol>${rows.map((r) => `<li>${f(r[0])}: ${r[1]}</li>`).join('')}</ol>` : ''
    const html = `<p>${esc(sum)}</p>${w.repos[0] ? `<p><b>${esc(t('b.repos.week'))}</b>: ${esc(short(w.repos[0][0]))} (${esc(t.group(groupOf(w.repos[0][0])))})</p>` : ''}${w.people[0] ? `<p><b>${esc(t('b.people.week'))}</b>: ${esc(w.people[0][0])}</p>` : ''}` +
      `<h4>${esc(t('h.repos'))}</h4>${li(w.repos, (n) => `<a href="${esc(base)}/?repo=${encodeURIComponent(n)}">${esc(n)}</a>`)}<h4>${esc(t('h.people'))}</h4>${li(w.people, (n) => `<a href="${esc(base)}/?person=${encodeURIComponent(n)}">${esc(n)}</a>`)}` +
      (w.news.length ? `<h4>${esc(t('n.list'))}</h4><ul>${w.news.map((n) => `<li><a href="https://github.com/${esc(n.name)}">${esc(n.name)}</a>${n.desc ? `: ${esc(n.desc)}` : ''}</li>`).join('')}</ul>` : '') +
      `<p><img src="${esc(base)}/og/digest.png?w=${labelOf(w)}&amp;lang=${lang}" alt=""></p>`
    entries.push({ id: `tag:${host},${day}:digest/week`, title: `${t('mode.week')} · ${day}: ${sum}`, at: w.at, link: `${base}/digest/${labelOf(w)}?lang=${lang}`, html })
  }
  for (const n of news) {
    const at = n.announcedAt || Date.parse(n.createdAt)
    entries.push({ id: `tag:${host},${iso(at).slice(0, 10)}:new/${n.name}`, title: `${t('n.title')}: ${short(n.name)} · ${t.group(n.group)}`, at, link: `${base}/?repo=${encodeURIComponent(n.name)}&lang=${lang}`, html: `<p>${esc(n.desc || t('d.noDesc'))}</p><p><a href="https://github.com/${esc(n.name)}">github.com/${esc(n.name)}</a></p>` })
  }
  entries.sort((a, b) => b.at - a.at)
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="${lang === 'zh' ? 'zh-CN' : lang}">
<title>CKB Pulse</title><subtitle>${esc(t('tagline'))}</subtitle><id>${esc(base)}/</id><link href="${esc(base)}/"/><link rel="self" href="${esc(base)}/feed.xml?lang=${lang}"/><updated>${iso(entries[0]?.at || Date.now())}</updated><icon>${esc(base)}/icon-192.png</icon>
${entries.map((e) => `<entry><id>${esc(e.id)}</id><title>${esc(e.title)}</title><link href="${esc(e.link)}"/><updated>${iso(e.at)}</updated><published>${iso(e.at)}</published><author><name>CKB Pulse</name></author><content type="html">${esc(e.html)}</content></entry>`).join('\n')}
</feed>`
}
