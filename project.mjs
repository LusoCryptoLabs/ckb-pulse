// A page for each project Pulse follows (`/project/<owner>/<repo>`), and one that lists them all (`/projects`): what a
// search engine can read and link to, where the live view is one 3D screen. Everything comes from what a card already
// shows (repoDetail): the last 30 days, the months, the latest titles, the lessons and the forum topics that name it.
// People are counted, not named: a page about a project is not a page about the people in it.
import { words } from './cards.mjs'
import { CSS, READING_CSS, pageFoot, pageBar, menuHead, menuScript, pageHead, crumbs, barsHtml } from './digest.mjs'
import { metricsOf } from './compare.mjs'

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const short = (name) => String(name || '').split('/').pop()
export const projectPath = (name) => `/project/${String(name).split('/').map(encodeURIComponent).join('/')}`
// worth a search engine's time: work by people in the last 30 days, or commits in the last 12 months
export function indexable(d) {
  const recent = d.daily.people.some(Boolean)
  const months = Array.isArray(d.months) ? d.months.slice(-12) : []
  return recent || months.some((m) => m.commits > 0)
}

const PJ_CSS = `dl.pj{display:grid;grid-template-columns:auto 1fr;gap:6px 16px;margin:4px 0 8px}dl.pj dt{color:var(--mut)}dl.pj dd{margin:0;font-variant-numeric:tabular-nums}
table.mo{width:100%;border-collapse:collapse;font-size:14px;font-variant-numeric:tabular-nums}table.mo th,table.mo td{text-align:left;padding:6px 8px 6px 0;border-bottom:1px solid var(--edge-soft)}table.mo thead th{color:var(--mut);font-weight:400}
ul.pjl{list-style:none;margin:0;padding:0}ul.pjl li{padding:8px 0;border-bottom:1px solid var(--edge-soft);overflow-wrap:anywhere}ul.pjl li small{display:block;color:var(--mut);font-size:12.5px;margin-top:2px}
.go{flex-wrap:wrap}`

const head = ({ lang, base, title, desc, img, ld, noindex = false }) => `<!doctype html><html lang="${lang === 'zh' ? 'zh-CN' : lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">${noindex ? '<meta name="robots" content="noindex">' : ''}<meta property="og:type" content="website"><meta property="og:site_name" content="CKB Pulse"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">${img ? `<meta property="og:image" content="${esc(img)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${esc(img)}">` : ''}
${ld ? `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>` : ''}
${menuHead(base)}<style>${CSS}${READING_CSS}${PJ_CSS}</style></head><body><main>`

/** One project's page; d is repoDetail, forum its topics this week, lessons lessonsOf. */
export function projectPage({ lang, base, d, forum = [], lessons = { count: 0, top: [] }, img = '', now = Date.now() }) {
  const t = words(lang), m = metricsOf(d, { forum }), path = projectPath(d.name), url = `${base}${path}`
  const title = `${short(d.name)} · ${t('pj.eyebrow')} · CKB Pulse`
  const sum = m.people ? t('pj.sum', { updates: t.cnt('upd', m.people), days: m.activeDays }) : t('pj.none')
  const desc = `${d.desc ? `${d.desc.replace(/\s+/g, ' ').trim().slice(0, 150)} ` : ''}${sum}`
  const ld = { '@context': 'https://schema.org', '@type': 'SoftwareSourceCode', name: d.name, codeRepository: d.url, url, ...(d.desc ? { description: d.desc } : {}), ...(d.lang ? { programmingLanguage: d.lang } : {}), ...(d.createdAt ? { dateCreated: d.createdAt.slice(0, 10) } : {}), ...(d.pushedAt ? { dateModified: d.pushedAt.slice(0, 10) } : {}) }
  const status = m.status === 'quiet' ? t('d.st.quiet', { n: m.quietDays }) : t('d.st.' + m.status)
  const facts = [
    [t('cmp.row.status'), status], [t('cmp.row.people'), m.people], [t('cmp.row.activeDays'), t('cmp.of', { n: m.activeDays, d: m.days })],
    [t('cmp.row.who'), m.contributors >= 12 ? t('cmp.plus', { n: 12 }) : m.contributors], [t('cmp.row.bots'), m.bots],
    ...(d.lang ? [[t('cmp.row.lang'), d.lang]] : []), [t('cmp.row.stars'), m.stars], ...(m.forum ? [[t('cmp.row.forum'), m.forum]] : []),
  ]
  const months = (Array.isArray(d.months) ? d.months.slice(-12) : []).filter((x, i, a) => x.commits || a.slice(0, i).some((y) => y.commits)).reverse()
  const monthName = (ym) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString(t('locale'), { timeZone: 'UTC', month: 'long', year: 'numeric' })
  const day = (iso) => new Date(iso).toLocaleDateString(t('locale'), { timeZone: 'UTC', day: 'numeric', month: 'short' })
  // the same title comes back with each push of a branch: each one once, the newest
  const seen = new Set(), latest = (d.events || []).filter((e) => e.title && !seen.has(e.title) && seen.add(e.title)).slice(0, 10)
  const at = (p) => `${esc(base)}${p}${p.includes('?') ? '&amp;' : '?'}lang=${lang}`
  return `${head({ lang, base, title, desc, img, ld, noindex: !indexable(d) })}
${pageBar(t, { base, lang, current: '', here: path })}
${pageHead({ crumbs: crumbs(t, { base, lang, trail: [[t('pj.all'), '/projects'], [short(d.name), null]] }), eyebrow: `${t('pj.eyebrow')} · ${d.name.split('/')[0]}`, title: short(d.name), lede: esc(d.desc || '') })}
<section class="me"><h2>${esc(t('pj.facts'))}</h2><p>${esc(sum)}</p><dl class="pj">${facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>${barsHtml(t, 'month', d.daily.people, now)}<p class="sub">${esc(t('pj.note'))}</p>
<p class="go"><a href="${at(`/?repo=${encodeURIComponent(d.name)}`)}">${esc(t('pj.live'))}</a><a href="${esc(d.url)}" rel="noopener">GitHub</a><a href="${at(`/compare?a=${encodeURIComponent(d.name)}`)}">${esc(t('pj.compare'))}</a></p></section>
${months.length ? `<section class="me"><h2>${esc(t('pj.months'))}</h2><table class="mo"><thead><tr><th scope="col">${esc(t('pj.month'))}</th><th scope="col">${esc(t('pj.devs'))}</th><th scope="col">${esc(t('pj.commits'))}</th></tr></thead><tbody>${months.map((x) => `<tr><th scope="row">${esc(monthName(x.month))}</th><td>${x.devs}</td><td>${x.commits}</td></tr>`).join('')}</tbody></table><p class="sub">${esc(t('pj.months.note'))}</p></section>` : ''}
${latest.length ? `<section class="me"><h2>${esc(t('pj.latest'))}</h2><ul class="pjl">${latest.map((e) => `<li>${e.url ? `<a href="${esc(e.url)}" rel="noopener nofollow">${esc(e.title.slice(0, 140))}</a>` : esc(e.title.slice(0, 140))}<small>${esc(day(e.at))}</small></li>`).join('')}</ul></section>` : ''}
${lessons.count ? `<section class="me"><h2>${esc(t(lessons.area ? 'd.lessons.lib' : 'd.lessons'))}</h2><ul class="pjl">${lessons.top.map((l) => `<li><a href="${at(`/learned/${l.id}`)}">${esc(l.title)}</a></li>`).join('')}</ul></section>` : ''}
${forum.length ? `<section class="me"><h2>${esc(t('d.forum'))}</h2><ul class="pjl">${forum.map((x) => `<li><a href="https://talk.nervos.org/t/${encodeURIComponent(x.id)}" rel="noopener">${esc(x.title)}</a></li>`).join('')}</ul></section>` : ''}
${pageFoot(t, url)}
</main>${menuScript(base)}</body></html>`
}

/** Every followed project, the ones with work by people in the last 30 days first. rows: projectsNow(). */
export function projectsPage({ lang, base, rows }) {
  const t = words(lang), url = `${base}/projects`
  const busy = rows.filter((r) => r.updates > 0).sort((a, b) => b.updates - a.updates || a.name.localeCompare(b.name))
  const quiet = rows.filter((r) => !r.updates).sort((a, b) => a.name.localeCompare(b.name))
  const title = `${t('pj.all')} · CKB Pulse`, desc = t('pj.list.lead', { n: rows.length, busy: busy.length })
  const at = (p) => `${esc(base)}${p}?lang=${lang}`
  const li = (r) => `<li><a href="${at(projectPath(r.name))}">${esc(r.name)}</a><small>${r.updates ? `${esc(t.cnt('upd', r.updates))}${r.desc ? ' · ' : ''}` : ''}${esc((r.desc || '').slice(0, 120))}</small></li>`
  return `${head({ lang, base, title, desc })}
${pageBar(t, { base, lang, current: '', here: '/projects' })}
${pageHead({ crumbs: crumbs(t, { base, lang, trail: [[t('pj.all'), null]] }), eyebrow: t('pj.all'), title: t('pj.list.h1'), lede: esc(desc) })}
<section class="me"><h2>${esc(t('pj.list.busy'))}</h2><ul class="pjl">${busy.map(li).join('')}</ul></section>
${quiet.length ? `<section class="me"><h2>${esc(t('pj.list.quiet'))}</h2><ul class="pjl">${quiet.map(li).join('')}</ul></section>` : ''}
${pageFoot(t, url)}
</main>${menuScript(base)}</body></html>`
}
