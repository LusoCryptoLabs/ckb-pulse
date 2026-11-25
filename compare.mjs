// Two projects side by side, over the last 30 days (UX review of 2026-11-25: a grants reviewer had to open two cards and
// write the numbers down). Everything comes from what Pulse already stores for a card, and the page says what it counts
// the way the rest of Pulse does: public work on GitHub, a bigger number is more work and not a better project. The shares
// (the busiest day, the top person) are facts about how concentrated the work was, with no verdict.
import { words } from './cards.mjs'
import { today } from './public/menu.js'
import { CSS, READING_CSS, pageFoot, pageBar, menuHead, menuScript, pageHead, crumbs, barsHtml } from './digest.mjs'

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
export const REPO = /^[A-Za-z0-9-]{1,39}\/[\w.-]{1,100}$/
const sum = (a) => a.reduce((x, y) => x + y, 0)

// the figures of one project, from the detail a card is made of (repoDetail), the forum topics that link it and the day it is now
export function metricsOf(d, { forum = [] } = {}) {
  const people = sum(d.daily.people), bots = sum(d.daily.bots), n = d.daily.days
  const lastDay = d.daily.people.reduce((a, v, i) => (v ? i : a), -1), quiet = n - 1 - lastDay
  const peak = Math.max(0, ...d.daily.people)
  const top = d.contributors?.[0]
  const month = Array.isArray(d.months) && d.months.length > 1 ? d.months.at(-2) : null // the last whole month
  return {
    name: d.name, url: d.url, group: d.group, lang: d.lang || '', stars: d.stars || 0, desc: d.desc || '', pushedAt: d.pushedAt || null,
    status: lastDay >= 0 ? (quiet < 7 ? 'active' : 'quiet') : bots ? 'auto' : 'none', quietDays: lastDay >= 0 ? quiet : null,
    people, bots, days: n, activeDays: d.daily.people.filter(Boolean).length,
    peakShare: people ? Math.round((peak / people) * 100) : 0,
    top: top && people ? { login: top.login, share: Math.min(100, Math.round((top.n / people) * 100)) } : null,
    contributors: d.contributors?.length || 0,
    monthDevs: month ? month.devs : null, monthCommits: month ? month.commits : null, month: month?.month || null,
    forum: forum.length, daily: d.daily.people.slice(),
  }
}
export const compareJson = (a, b) => ({ days: a.days, a: { ...a }, b: { ...b }, note: 'Public work on GitHub over the last days, by people. A bigger number is more work, not a better project. The busiest day and the top person are shares of the period.' })

// rows: [word, value of a project, higher is more work (highlight the larger one)]
const ROWS = [
  ['group', (m) => m.group || '-', null], ['lang', (m) => m.lang || '-', null], ['stars', (m) => m.stars, (m) => m.stars],
  ['status', null, null], ['people', (m) => m.people, (m) => m.people], ['bots', (m) => m.bots, null],
  ['activeDays', null, (m) => m.activeDays], ['peak', (m) => `${m.peakShare}%`, null], ['who', null, (m) => m.contributors], ['top', null, null],
  ['devs', (m) => (m.monthDevs == null ? '-' : m.monthDevs), (m) => m.monthDevs ?? -1], ['commits', (m) => (m.monthCommits == null ? '-' : m.monthCommits), (m) => m.monthCommits ?? -1], ['forum', (m) => m.forum, (m) => m.forum],
]

const CMP_CSS = `form.cmp{display:grid;gap:10px;margin:0 0 22px}form.cmp label{display:grid;gap:4px;font:500 11px var(--font-num,monospace);letter-spacing:.08em;text-transform:uppercase;color:var(--mut)}
form.cmp input{font:16px var(--font-ui,system-ui,sans-serif);padding:11px 12px;min-height:44px;box-sizing:border-box;background:var(--surface);color:var(--fg);border:1px solid var(--edge);border-radius:10px;width:100%}
form.cmp button{justify-self:start;min-height:44px;padding:0 22px;border:0;background:var(--lime);color:var(--ink);font:700 15px var(--font-ui,system-ui,sans-serif);cursor:pointer}
@media (min-width:640px){form.cmp{grid-template-columns:1fr 1fr auto;align-items:end}}
table.cmp{width:100%;border-collapse:collapse;table-layout:fixed;font-size:14px}table.cmp th,table.cmp td{padding:9px 8px 9px 0;border-bottom:1px solid var(--edge-soft);text-align:left;vertical-align:top;overflow-wrap:anywhere}
table.cmp thead th{font:600 16px var(--font-ui,system-ui,sans-serif);padding-bottom:12px;border-bottom:1px solid var(--edge)}table.cmp thead a{color:var(--fg)}table.cmp tbody th{font-weight:400;color:var(--mut);width:34%}
table.cmp td{font-variant-numeric:tabular-nums}table.cmp td.hi{color:var(--lime);font-weight:700}table.cmp small{display:block;color:var(--mut);font-weight:400;font-size:12px;margin-top:2px}
.cmpbars{display:grid;gap:18px;margin:6px 0}.cmpbars h3{font:600 15px var(--font-ui,system-ui,sans-serif);margin:0 0 4px}
@media print{form.cmp{display:none}}`

export function comparePage({ lang, base, url, a = '', b = '', detail, names = [], now = Date.now() }) {
  const t = words(lang), title = `CKB Pulse · ${t('cmp.nav')}`, desc = t('cmp.lead')
  const asked = [a, b].map((x) => String(x || '').trim().slice(0, 140))
  const found = asked.map((n) => (REPO.test(n) ? detail(n) : null))
  const ready = found[0] && found[1] && found[0].d.name.toLowerCase() !== found[1].d.name.toLowerCase()
  const ms = ready ? found.map(({ d, forum }) => metricsOf(d, { forum })) : []
  const msg = (() => {
    if (!asked[0] && !asked[1]) return t('cmp.pick')
    const bad = asked.map((n, i) => (n && !found[i] ? n : '')).filter(Boolean)
    if (bad.length) return t('cmp.unknown', { name: bad.join(', ') })
    if (!asked[0] || !asked[1]) return t('cmp.pick')
    if (!ready) return t('cmp.same')
    return ''
  })()
  const link = (m) => `<a href="${esc(base)}/?repo=${encodeURIComponent(m.name)}&amp;lang=${lang}">${esc(m.name.split('/').pop())}</a><small>${esc(m.name.split('/')[0])}</small>`
  const val = (key, m) => {
    if (key === 'status') return m.status === 'quiet' ? t('d.st.quiet', { n: m.quietDays }) : t('d.st.' + m.status)
    if (key === 'activeDays') return t('cmp.of', { n: m.activeDays, d: m.days })
    if (key === 'who') return m.contributors >= 12 ? t('cmp.plus', { n: 12 }) : String(m.contributors)
    if (key === 'top') return m.top ? `${esc(m.top.login)}<small>${m.top.share}%</small>` : '-'
    const row = ROWS.find(([k]) => k === key)
    return esc(row[1](m))
  }
  const rows = ms.length ? ROWS.map(([key, , score]) => {
    const vs = ms.map((m) => (score ? score(m) : null)), hi = score && vs[0] !== vs[1] ? (vs[0] > vs[1] ? 0 : 1) : -1
    return `<tr><th scope="row">${esc(t('cmp.row.' + key))}</th>${ms.map((m, i) => `<td${hi === i ? ' class="hi"' : ''}>${val(key, m)}</td>`).join('')}</tr>`
  }).join('') : ''
  const max = ms.length ? Math.max(1, ...ms.flatMap((m) => m.daily)) : 1
  const body = ms.length
    ? `<section class="me"><table class="cmp"><thead><tr><th></th>${ms.map((m) => `<th scope="col">${link(m)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table><p class="sub">${esc(t('cmp.note'))}</p></section>`
      + `<section class="me"><h2>${esc(t('cmp.chart'))}</h2><div class="cmpbars">${ms.map((m) => `<div><h3>${esc(m.name)}</h3>${barsHtml(t, 'month', m.daily, now, max)}</div>`).join('')}</div></section>`
    : `<p class="sub">${esc(msg)}</p>`
  const dl = names.slice(0, 2000).filter((n) => REPO.test(n)).map((n) => `<option value="${esc(n)}"></option>`).join('')
  const here = `/compare${ms.length ? `?a=${encodeURIComponent(ms[0].name)}&b=${encodeURIComponent(ms[1].name)}` : ''}`
  return `<!doctype html><html lang="${lang === 'zh' ? 'zh-CN' : lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}"><meta name="robots" content="noindex"><meta property="og:type" content="website"><meta property="og:site_name" content="CKB Pulse"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
${menuHead(base)}<style>${CSS}${READING_CSS}${CMP_CSS}</style></head><body><main>
${pageBar(t, { base, lang, current: '', here, share: { url: `${url}${here.slice('/compare'.length)}${here.includes('?') ? '&' : '?'}lang=${lang}&d=${today()}`, title } })}
${pageHead({ crumbs: crumbs(t, { base, lang, trail: [[t('cmp.nav'), null]] }), eyebrow: t('cmp.nav'), title: t('cmp.h1'), lede: esc(desc) })}
<form class="cmp" method="get" action="${esc(base)}/compare"><input type="hidden" name="lang" value="${lang}">
<label>${esc(t('cmp.a'))}<input name="a" list="cmp-projects" value="${esc(ms[0]?.name || asked[0])}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="nervosnetwork/fiber" required></label>
<label>${esc(t('cmp.b'))}<input name="b" list="cmp-projects" value="${esc(ms[1]?.name || asked[1])}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="ckb-devrel/ccc" required></label>
<button type="submit">${esc(t('cmp.go'))}</button><datalist id="cmp-projects">${dl}</datalist></form>
${body}
${pageFoot(t, url)}
</main>${menuScript(base)}</body></html>`
}
