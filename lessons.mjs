// What the ecosystem learned from the fixes and changes people made in CKB projects, kept up to date by the private lessons
// repository: pages to search and read (one per lesson, with its sources, related lessons and history), the same as JSON at
// /lessons/api and as a Model Context Protocol server at /lessons/mcp. All of it is private: it opens only with a key (in the
// address once, then a cookie made from it, or as a bearer token for the API and MCP), and its data is a file on the app's
// data volume (DATA_DIR/lessons.json), never in git. Without the key, or without the file, every route answers like a route
// that does not exist. Nothing here calls a model.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { words } from './cards.mjs'
import { CSS, pageFoot, pageBar, menuHead, menuScript, pageHead } from './digest.mjs'
import { isOptedOut } from './config.mjs'
import { rpcServer } from './mcp.mjs'

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const ID = /^[a-z0-9-]{1,40}\/[a-z0-9-]{1,80}$/

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest()
const same = (a, b) => crypto.timingSafeEqual(sha(a), sha(b))
/** What the cookie holds: a hash made from the key, never the key itself. */
export const cookieOf = (key) => crypto.createHash('sha256').update(`lessons-cookie|${key}`).digest('base64url')
const cookieNamed = (req, name) => {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim()
  }
  return null
}

/** 'key' when the address carries the key, 'cookie' when the request holds the cookie made from it, 'bearer' when it sends
 * the key as a bearer token (the API and MCP), else null. */
export function access(req, url, key) {
  if (!key) return null
  const k = url.searchParams.get('k')
  if (k !== null && same(k, key)) return 'key'
  const c = cookieNamed(req, 'lessons')
  if (c && same(c, cookieOf(key))) return 'cookie'
  const b = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || ''))
  if (b && same(b[1].trim(), key)) return 'bearer'
  return null
}

const cached = new Map() // file -> { mtime, data }
/** The lessons file of the data volume, read again only when it changes; null when it is missing or not JSON. */
export function loadLessons(dir, name = 'lessons.json') {
  const file = path.join(dir, name)
  try {
    const m = fs.statSync(file).mtimeMs, c = cached.get(file)
    if (c?.mtime === m) return c.data
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    cached.set(file, { mtime: m, data })
    return data
  } catch { return null }
}

// ---------------------------------------------------------------- the data, whatever version of the export it is
/** The export as { from, to, read, areas: {slug: {name, summary}}, lessons: [...] }. Version 2 is the lessons repository's
 * export; the first week's file (topics of lessons, no ids) still reads, with ids made from the topic and the title. */
export function normalise(data) { // version 1 is the released lessons (public-lessons.json), version 2 the private ones
  if (data?.version === 2 || data?.version === 1) return { from: data.from, to: data.to, read: data.read, checked: data.checked || null, areas: data.areas || {}, lessons: data.lessons || [] }
  const areas = {}, lessons = []
  for (const t of data?.topics || []) {
    const a = slug(t.area)
    areas[a] = { name: t.area, summary: t.summary || '' }
    for (const l of t.lessons || []) lessons.push({ id: `${a}/${slug(l.title)}`, area: a, patterns: [], kind: [], applies_to: [], related: [], history: [], evidence: 'L0', ...l })
  }
  return { from: data?.from, to: data?.to, read: data?.read, areas, lessons }
}

/** The lessons with sources from people who asked to leave taken out; a lesson left with no source goes too, and so do the
 * links to it. */
export function visible(data) {
  const n = normalise(data), lessons = []
  for (const l of n.lessons) {
    const sources = (l.sources || []).filter((s) => !isOptedOut(String(s.repo).split('/')[0]))
    if (sources.length) lessons.push({ ...l, sources })
  }
  const ids = new Set(lessons.map((l) => l.id))
  for (const l of lessons) {
    l.related = (l.related || []).filter((i) => ids.has(i))
    if (l.superseded_by && !ids.has(l.superseded_by)) l.superseded_by = null
  }
  return { ...n, lessons }
}

/** The page's topics: the visible lessons grouped by area, the biggest first. */
export function shownLessons(data) {
  const v = visible(data), by = new Map()
  for (const l of v.lessons) { if (!by.has(l.area)) by.set(l.area, []); by.get(l.area).push(l) }
  return [...by].sort((a, b) => b[1].length - a[1].length).map(([a, lessons]) => ({ slug: a, area: v.areas[a]?.name || a, summary: v.areas[a]?.summary || '', lessons }))
}

// ---------------------------------------------------------------- search
const tokens = (s) => String(s || '').toLowerCase().match(/[\p{L}\p{N}+#]+/gu) || []
const stem = (w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)
/** Every word of the query somewhere in the lesson; a word in the title counts most, then concepts and the library it applies
 * to, then the text and the sources. Best first, then the most recently changed. */
export function searchLessons(lessons, { q = '', area = '', repo = '', concept = '', level = '', limit = 50, loose = false } = {}) {
  const want = tokens(q).map(stem), r = repo.toLowerCase()
  const out = [], partial = []
  for (const l of lessons) {
    if (area && l.area !== area) continue
    if (concept && !(l.concepts || []).includes(concept)) continue
    if (level && l.level !== level) continue
    if (r && !l.sources.some((s) => String(s.repo).toLowerCase() === r)) continue
    const fields = [[l.title, 3], [(l.concepts || []).join(' '), 2], [(l.applies_to || []).join(' '), 2], [l.id, 2],
      [`${l.lesson} ${l.why || ''} ${l.note || ''} ${(l.patterns || []).join(' ')}`, 1], [l.sources.map((s) => `${s.repo} ${s.subject}`).join(' '), 1]]
      .map(([t, w]) => [tokens(t).map(stem).join(' '), w])
    let score = 0, all = true
    for (const w of want) {
      const hit = fields.filter(([t]) => t.includes(w))
      if (!hit.length) { all = false; break }
      score += Math.max(...hit.map(([, x]) => x))
    }
    if (all) out.push([score, l])
    else if (loose && want.length > 1) { // not every word: how many, with a word that only starts the same (a prefix of three letters) counting too
      const n = want.filter((w) => fields.some(([t]) => t.includes(w) || (w.length >= 4 && t.split(' ').some((x) => x.startsWith(w.slice(0, 4)))))).length
      if (n >= Math.ceil(want.length / 2)) partial.push([n * 10 + score, l])
    }
  }
  const order = (a, b) => b[0] - a[0] || String(b[1].last_touched || '').localeCompare(String(a[1].last_touched || ''))
  out.sort(order)
  if (!out.length && loose && partial.length) { partial.sort(order); const r2 = partial.slice(0, limit).map(([, l]) => l); r2.partial = true; return r2 }
  return out.slice(0, limit).map(([, l]) => l)
}

// ---------------------------------------------------------------- pages
const PAGE_CSS = `form.lq{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 6px}form.lq input{flex:1 1 220px;min-width:0;padding:10px 12px;border:1px solid var(--edge);background:var(--surface);color:var(--fg);font:inherit}form.lq select,form.lq button{padding:10px 12px;border:1px solid var(--edge);background:var(--surface);color:var(--fg);font:inherit}form.lq button{background:var(--lime);color:var(--ink);font-weight:700;cursor:pointer}
nav.ls{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 18px}nav.ls a{padding:5px 11px;border:1px solid var(--edge);color:var(--fg);text-decoration:none;font-size:13px}nav.ls a span{color:var(--mut);margin-left:6px}nav.ls a[aria-current=true]{border-color:var(--fg)}
section.lt{margin:22px 0 8px;overflow-wrap:anywhere}section.lt h2{margin:0 0 4px;font:600 21px var(--font-ui,sans-serif);color:var(--fg);text-transform:none;letter-spacing:-.01em}section.lt>p{margin:4px 0 10px;color:var(--mut)}
article.ln{background:var(--surface);border:1px solid var(--edge);padding:12px 16px;margin:8px 0;overflow-wrap:anywhere;min-width:0}article.ln h3{margin:0 0 4px;font:600 16px var(--font-ui,sans-serif)}article.ln h3 a{color:var(--fg);text-decoration:none}article.ln h3 a:hover{text-decoration:underline}article.ln p{margin:4px 0}
article.ln.old{opacity:.7}.ln .tg,.lp .tg{font-size:12px;color:var(--mut)}.ln .nt,.lp .nt{font-size:14px;color:var(--f-talk)}.bd{font:400 11px/1 var(--font-num);padding:3px 7px;border:1px solid var(--edge);color:var(--mut);margin-left:6px;vertical-align:middle;white-space:nowrap}.bd.old{color:var(--f-talk);border-color:var(--f-talk)}
.lp{overflow-wrap:anywhere}.lp .big{font-size:19px;line-height:1.5;margin:8px 0 14px}.lp h2{font:600 15px var(--font-ui,sans-serif);margin:22px 0 8px;text-transform:none;letter-spacing:0;color:var(--fg)}.lp ul{padding-left:18px}.lp li{margin:4px 0;font-size:14px}.lp li a{color:var(--lime)}.lp dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 14px;font-size:14px;margin:10px 0}.lp dt{color:var(--mut)}.lp dd{margin:0}.lp code{font-size:13px;overflow-wrap:anywhere}.lp .back{font-size:14px}`

const head = (t, { lang, base, title, desc, pub }) => `<!doctype html><html lang="${lang === 'zh' ? 'zh-CN' : lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">${pub ? '' : '<meta name="robots" content="noindex">'}
${menuHead(base)}<style>${CSS}${PAGE_CSS}</style></head><body><main>`
const href = (base, id, lang, pre = '/lessons') => `${base}${pre}/${id}?lang=${lang}`
const badges = (t, l) => `${l.status === 'superseded' ? `<span class="bd old">${esc(t('ls.old'))}</span>` : ''}<span class="bd" title="${esc(t('ls.evidence.' + (l.evidence || 'L0')))}">${esc(l.evidence || 'L0')}</span>`
const lvl = (t, l) => (l.level ? `<span class="bd">${esc(t('ls.level.' + l.level))}</span>` : '')
const card = (t, base, lang, l, pre) => `<article class="ln${l.status === 'superseded' ? ' old' : ''}"><h3><a href="${esc(href(base, l.id, lang, pre))}">${esc(l.title)}</a>${lvl(t, l)}${badges(t, l)}</h3><p>${esc(l.lesson)}</p>${l.note ? `<p class="nt">${esc(l.note)}</p>` : ''}
<p class="tg">${(l.concepts || []).map((c) => `<a href="${esc(base)}${pre}?concept=${encodeURIComponent(c)}&amp;lang=${lang}">#${esc(c)}</a>`).join(' ')} · ${esc(t('ls.sources', { n: l.sources.length }))}${l.last_touched ? ` · ${esc(l.last_touched)}` : ''}</p></article>`

export function lessonsPage({ lang, base, url, data, q = '', area = '', concept = '', level = '', pub = false }) {
  const pre = pub ? '/learned' : '/lessons'
  const t = words(lang), v = visible(data), topics = shownLessons(data)
  const title = `CKB Pulse · ${t('ls.title')}`, desc = t('ls.lead')
  const searching = !!(q.trim() || area || concept || level)
  const found = searching ? searchLessons(v.lessons, { q, area, concept, level, limit: 200, loose: true }) : []
  const areaOpts = topics.map((x) => `<option value="${esc(x.slug)}"${x.slug === area ? ' selected' : ''}>${esc(x.area)}</option>`).join('')
  return `${head(t, { lang, base, title, desc, pub })}
${pageBar(t, { base, lang, current: '', here: pre })}
${pageHead({ eyebrow: t('ls.nav'), title: t('ls.h1'), lede: esc(desc) })}
<p>${esc(pub ? t('ls.pub.count', { n: v.lessons.length, m: new Set(v.lessons.flatMap((l) => l.sources.map((s) => s.repo))).size }) : t('ls.week', { from: v.from, to: v.to, read: v.read, lessons: v.lessons.length }))}</p>
<p><a href="${esc(base)}${pre}/start?lang=${lang}"><b>${esc(t('ls.start.nav'))}</b></a>${pub ? ` · <a href="${esc(base)}/learned.xml">${esc(t('ls.feed'))}</a>` : ''}</p>
${pub ? `<p class="nt">${esc(t('ls.pub.notice'))}</p>` : ''}${!pub && v.checked ? `<p class="nt">${esc(t('ls.sample', { sample: v.checked.sample, of: v.checked.of, right: v.checked.right, partly: v.checked.partly_right, notckb: v.checked.not_ckb, wrong: v.checked.wrong }))}</p>` : ''}
<form class="lq" method="get" action="${esc(base)}${pre}" role="search"><input type="search" name="q" value="${esc(q)}" placeholder="${esc(t('ls.search'))}" aria-label="${esc(t('ls.search'))}"><select name="area" aria-label="${esc(t('ls.topics'))}"><option value="">${esc(t('ls.all'))}</option>${areaOpts}</select><input type="hidden" name="lang" value="${esc(lang)}"><button type="submit">${esc(t('ls.find'))}</button></form>
${searching
    ? `<p>${esc(found.length ? t(found.partial ? 'ls.partial' : 'ls.found', { n: found.length }) : t('ls.none'))} <a href="${esc(base)}${pre}?lang=${lang}">${esc(t('ls.back'))}</a></p>${found.map((l) => card(t, base, lang, l, pre)).join('\n')}`
    : `<nav class="ls" aria-label="${esc(t('ls.topics'))}">${topics.map((x) => `<a href="#${x.slug}">${esc(x.area)}<span>${x.lessons.length}</span></a>`).join('')}</nav>
${topics.map((x) => `<section class="lt" id="${x.slug}"><h2>${esc(x.area)}</h2><p>${esc(x.summary)}</p>
${x.lessons.map((l) => card(t, base, lang, l, pre)).join('\n')}</section>`).join('\n')}`}
${pub
    ? `<p class="tg">${esc(t('ls.pub.license'))} <a href="${esc(base)}/learned.json">JSON</a> · <a href="https://github.com/LusoCryptoLabs/ckb-pulse/issues/new">${esc(t('ls.pub.remove'))}</a></p>`
    : `<p class="tg">${esc(t('ls.how'))}</p>
<p class="tg">${esc(t('ls.api'))} <code>${esc(base)}/lessons/api?q=</code> · <code>${esc(base)}/lessons/mcp</code></p>`}
${pageFoot(t, url)}
</main>${menuScript(base)}</body></html>`
}

/** One lesson: the rule, why, where it came from, what it is related to and how it changed. null when there is no such
 * lesson (or it is hidden). */
export function lessonPage({ lang, base, url, data, id, pub = false }) {
  const pre = pub ? '/learned' : '/lessons'
  const t = words(lang), v = visible(data), l = v.lessons.find((x) => x.id === id)
  if (!l) return null
  const byId = new Map(v.lessons.map((x) => [x.id, x]))
  const link = (i) => { const x = byId.get(i); return x ? `<a href="${esc(href(base, i, lang, pre))}">${esc(x.title)}</a>` : '' }
  const date = (d) => (d ? esc(d) : esc(t('ls.never')))
  return `${head(t, { lang, base, title: `${l.title} · CKB Pulse`, desc: l.lesson, pub })}
${pageBar(t, { base, lang, current: '', here: `${pre}/${l.id}` })}
<article class="lp">
<p class="back"><a href="${esc(base)}${pre}?lang=${lang}">${esc(t('ls.back'))}</a> · <a href="${esc(base)}${pre}?area=${esc(l.area)}&amp;lang=${lang}">${esc(v.areas[l.area]?.name || l.area)}</a></p>
<h1>${esc(l.title)}${lvl(t, l)}${badges(t, l)}</h1>
<p class="big">${esc(l.lesson)}</p>
${l.why ? `<p><b>${esc(t('ls.why'))}</b> ${esc(l.why)}</p>` : ''}
${l.note ? `<p class="nt">${esc(l.note)}</p>` : ''}
${l.superseded_by ? `<p class="nt">${esc(t('ls.replaced'))} ${link(l.superseded_by)}</p>` : ''}
${(l.patterns || []).length ? `<h2>${esc(t('ls.pattern'))}</h2><ul>${l.patterns.map((p) => `<li><code>${esc(p)}</code></li>`).join('')}</ul>` : ''}
<dl><dt>${esc(t('ls.concepts'))}</dt><dd>${(l.concepts || []).map((c) => `<a href="${esc(base)}${pre}?q=${encodeURIComponent(c)}&amp;lang=${lang}">${esc(c)}</a>`).join(', ')}</dd>
${(l.applies_to || []).length ? `<dt>${esc(t('ls.applies'))}</dt><dd>${l.applies_to.map(esc).join(', ')}</dd>` : ''}
<dt>${esc(t('ls.evidence'))}</dt><dd>${esc(l.evidence || 'L0')}: ${esc(t('ls.evidence.' + (l.evidence || 'L0')))}</dd>
<dt>${esc(t('ls.first'))}</dt><dd>${date(l.first_seen)}</dd><dt>${esc(t('ls.touched'))}</dt><dd>${date(l.last_touched)}</dd><dt>${esc(t('ls.checked'))}</dt><dd>${date(l.last_checked)}</dd></dl>
<h2>${esc(t('ls.sources', { n: l.sources.length }))}</h2><ul>${l.sources.map((s) => `<li>${s.date ? `${esc(s.date)} · ` : ''}<a href="https://github.com/${esc(s.repo)}/commit/${esc(s.hash)}" rel="noreferrer">${esc(s.repo)}</a>: ${esc(s.subject)}</li>`).join('')}</ul>
${l.related.length ? `<h2>${esc(t('ls.related'))}</h2><ul>${l.related.map((i) => `<li>${link(i)}</li>`).join('')}</ul>` : ''}
${(l.history || []).length ? `<h2>${esc(t('ls.history'))}</h2><ul>${l.history.map((h) => `<li>${esc(h.date)} · ${esc(h.what)}</li>`).join('')}</ul>` : ''}
${pub ? shareBlock(t, base, lang, l) : ''}
</article>
${pub ? `<p class="tg">${esc(t('ls.pub.notice'))} ${esc(t('ls.pub.license'))} <a href="https://github.com/LusoCryptoLabs/ckb-pulse/issues/new">${esc(t('ls.pub.remove'))}</a></p>` : ''}
${pageFoot(t, url)}
</main>${menuScript(base)}</body></html>`
}

/** The page of a lesson that was public and is not now: a link someone kept says so, with a 410, instead of looking like a mistake. */
export function withdrawnPage({ lang, base, url, date }) {
  const t = words(lang), pre = '/learned', title = `${t('ls.pub.gone.h')} · CKB Pulse`
  return `${head(t, { lang, base, title, desc: t('ls.pub.gone.h'), pub: true })}
${pageBar(t, { base, lang, current: '', here: pre })}
<article class="lp"><h1>${esc(t('ls.pub.gone.h'))}</h1><p class="big">${esc(t('ls.pub.gone.p', { date }))}</p><p><a href="${esc(base)}${pre}?lang=${lang}">${esc(t('ls.back'))}</a></p></article>
${pageFoot(t, url)}
</main>${menuScript(base)}</body></html>`
}

/** Copy the link, copy the lesson as Markdown, a way to cite it, and a way to say it is wrong or out of date (an issue on the public Pulse repository, with the id filled in). */
function shareBlock(t, base, lang, l) {
  const link = `${base}/learned/${l.id}`, copied = esc(t('sh.copied'))
  const md = `## ${l.title}\n\n${l.lesson}${l.why ? `\n\n${t('ls.why')} ${l.why}` : ''}\n\n${t('ls.md.source')} ${link} (CC BY 4.0, LusoCryptoLabs, CKB lessons)`
  const cite = `LusoCryptoLabs, "${l.title}", CKB lessons, ${link}, CC BY 4.0${l.last_touched ? `, last changed ${l.last_touched}` : ''}.`
  const report = `https://github.com/LusoCryptoLabs/ckb-pulse/issues/new?title=${encodeURIComponent(`Lesson: ${l.id}`)}&body=${encodeURIComponent(`${link}\n\nWhat is wrong or out of date:\n`)}`
  return `<p class="share"><button type="button" data-copy="${esc(link)}" data-copied="${copied}">${esc(t('ls.share.copy'))}</button> <button type="button" data-copy="${esc(md)}" data-copied="${copied}">${esc(t('ls.share.md'))}</button> <a href="${esc(report)}" rel="noreferrer">${esc(t('ls.report'))}</a></p>
<details><summary>${esc(t('ls.cite'))}</summary><pre><code>${esc(cite)}</code></pre></details>`
}

/** The way in for someone new: the lessons by level, the basic ones first, each with its why. */
export function startPage({ lang, base, url, data, pub = false }) {
  const pre = pub ? '/learned' : '/lessons'
  const t = words(lang), v = visible(data), title = `${t('ls.start.h')} · CKB Pulse`
  const order = ['basic', 'working', 'advanced']
  const by = Object.fromEntries(order.map((x) => [x, v.lessons.filter((l) => l.level === x).sort((a, b) => (b.sources.length - a.sources.length) || a.title.localeCompare(b.title))]))
  const none = v.lessons.filter((l) => !l.level).length
  return `${head(t, { lang, base, title, desc: t('ls.start.p'), pub })}
${pageBar(t, { base, lang, current: '', here: `${pre}/start` })}
${pageHead({ eyebrow: t('ls.nav'), title: t('ls.start.h'), lede: esc(t('ls.start.p')) })}
<p><a href="${esc(base)}${pre}?lang=${lang}">${esc(t('ls.back'))}</a></p>
${order.map((x) => by[x].length ? `<section class="lt" id="${x}"><h2>${esc(t('ls.level.' + x))} <span class="tg">${by[x].length}</span></h2><p>${esc(t('ls.start.' + x))}</p>
${by[x].slice(0, x === 'basic' ? 40 : 25).map((l) => `<article class="ln"><h3><a href="${esc(href(base, l.id, lang, pre))}">${esc(l.title)}</a></h3><p>${esc(l.lesson)}</p>${l.why ? `<p class="nt">${esc(t('ls.why'))} ${esc(l.why)}</p>` : ''}</article>`).join('\n')}
<p><a href="${esc(base)}${pre}?level=${x}&amp;lang=${lang}">${esc(t('ls.start.all', { n: by[x].length }))}</a></p></section>` : '').join('\n')}
${none ? `<p class="tg">${esc(t('ls.start.unlevelled', { n: none }))}</p>` : ''}
${pageFoot(t, url)}
</main>${menuScript(base)}</body></html>`
}

const xml = (x) => String(x ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c])
/** An Atom feed of the lessons most recently changed. */
export function lessonsFeed({ base, data, n = 30 }) {
  const v = visible(data), items = [...v.lessons].sort((a, b) => String(b.last_touched).localeCompare(String(a.last_touched)) || a.id.localeCompare(b.id)).slice(0, n)
  const updated = `${items[0]?.last_touched || '2026-11-19'}T00:00:00Z`
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>CKB lessons</title><subtitle>What CKB projects learned, released by a person. CC BY 4.0.</subtitle><id>${xml(base)}/learned</id><link href="${xml(base)}/learned"/><link rel="self" href="${xml(base)}/learned.xml"/><updated>${updated}</updated>
${items.map((l) => `<entry><title>${xml(l.title)}</title><id>${xml(base)}/learned/${xml(l.id)}</id><link href="${xml(base)}/learned/${xml(l.id)}"/><updated>${l.last_touched}T00:00:00Z</updated><summary>${xml(l.lesson)}</summary></entry>`).join('\n')}
</feed>
`
}

// ---------------------------------------------------------------- the same for programs: JSON and MCP
const brief = (base) => (l) => ({ id: l.id, title: l.title, lesson: l.lesson, area: l.area, concepts: l.concepts, status: l.status, evidence: l.evidence, last_touched: l.last_touched, url: `${base}/lessons/${l.id}` })
const full = (base) => (l) => ({ ...l, url: `${base}/lessons/${l.id}` })
const int = (v, lo, hi, d) => { const n = Number.parseInt(v, 10); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d }

/** GET /lessons/api: ?id= one lesson in full, else a search (?q= ?area= ?repo= ?limit=), briefly. */
export function lessonsApi(data, url, base) {
  const v = visible(data), q = url.searchParams
  const id = q.get('id')
  if (id) {
    const l = v.lessons.find((x) => x.id === id)
    return l ? { status: 200, json: full(base)(l) } : { status: 404, json: { error: 'no such lesson' } }
  }
  const found = searchLessons(v.lessons, { q: (q.get('q') || '').slice(0, 200), area: (q.get('area') || '').slice(0, 40), repo: (q.get('repo') || '').slice(0, 200), concept: (q.get('concept') || '').slice(0, 80), level: (q.get('level') || '').slice(0, 10), limit: int(q.get('limit'), 1, 200, 50) })
  return { status: 200, json: { from: v.from, to: v.to, read: v.read, areas: v.areas, count: found.length, lessons: found.map(brief(base)) } }
}

const told = (message) => Object.assign(new Error(message), { told: true })
const text = (v, name, max = 200) => { if (v === undefined || v === null || v === '') return ''; if (typeof v !== 'string' || v.length > max) throw told(`${name} must be text of at most ${max} characters`); return v.trim() }
const TOOLS = [
  {
    name: 'search_lessons',
    description: 'Search what CKB projects learned from their own fixes: pitfalls, bugs and protocol rules, each with the commits it came from. Every word of the query must match. Use it before writing CKB code that builds transactions, handles witnesses, locks, Fiber channels or indexer queries.',
    inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'words, e.g. "witness lock args"' }, area: { type: 'string', description: 'an area id from list_areas' }, limit: { type: 'integer', minimum: 1, maximum: 50 } } },
    run: (a, { data, base }) => { const v = visible(data()); const found = searchLessons(v.lessons, { q: text(a.query, 'query'), area: text(a.area, 'area', 40), limit: Number.isInteger(a.limit) ? Math.min(50, Math.max(1, a.limit)) : 10 }); return { count: found.length, lessons: found.map(brief(base)) } },
  },
  {
    name: 'get_lesson',
    description: 'One lesson in full: the rule, the code pattern, its sources (repository, commit, date), related lessons, how sure it is (evidence L0 read by a model, L1 seen in two or more projects, L2 confirmed by a maintainer, L3 reproduced by a test) and its history.',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'area/slug, from search_lessons' } }, required: ['id'] },
    run: (a, { data, base }) => { const id = text(a.id, 'id', 130); if (!ID.test(id)) throw told('id must be area/slug, as search_lessons gives it'); const l = visible(data()).lessons.find((x) => x.id === id); if (!l) throw told(`no lesson ${id}`); return full(base)(l) },
  },
  {
    name: 'lessons_from_project',
    description: 'The lessons that came from one project\'s commits, newest first.',
    inputSchema: { type: 'object', properties: { repo: { type: 'string', description: 'owner/repo on GitHub' } }, required: ['repo'] },
    run: (a, { data, base }) => { const repo = text(a.repo, 'repo'); if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw told('repo must be owner/repo'); const found = searchLessons(visible(data()).lessons, { repo, limit: 50 }); return { count: found.length, lessons: found.map(brief(base)) } },
  },
  {
    name: 'list_areas',
    description: 'The areas of the lessons (CCC, scripts, Fiber, wallets...) with how many lessons each has, and the period they cover.',
    inputSchema: { type: 'object', properties: {} },
    run: (a, { data }) => { const v = visible(data()); return { from: v.from, to: v.to, read: v.read, areas: Object.entries(v.areas).map(([id, x]) => ({ id, name: x.name, summary: x.summary, lessons: v.lessons.filter((l) => l.area === id).length })) } },
  },
]
export const LESSON_TOOLS = TOOLS.map(({ name }) => name)
const INSTRUCTIONS = 'What CKB projects learned from their own fixes, read from their public commits and kept up to date: pitfalls, bugs and protocol rules, each linked to the commits it came from. Most lessons were read by a model and not yet checked (evidence L0), so read the source before relying on one. Start with search_lessons, then get_lesson.'
/** The private MCP server: data() gives the export as it is now. */
export const lessonsMcp = (data) => rpcServer({ tools: TOOLS, info: { name: 'ckb-lessons', title: 'CKB lessons', version: '1.0.0' }, instructions: INSTRUCTIONS, ctx: (base) => ({ data, base }) })
