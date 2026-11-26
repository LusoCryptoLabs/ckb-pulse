// What the ecosystem learned from the fixes and changes people made in CKB projects, kept up to date by the private lessons
// repository: pages to search and read (one per lesson, with its sources, related lessons and history), the same as JSON at
// /lessons/api and as a Model Context Protocol server at /lessons/mcp. All of it is private: it opens only with a key (in the
// address once, then a cookie made from it, or as a bearer token for the API and MCP), and its data is a file on the app's
// data volume (DATA_DIR/lessons.json), never in git. Without the key, or without the file, every route answers like a route
// that does not exist. Nothing here calls a model.
import crypto from 'node:crypto'
import { withStamp } from './og.mjs'
import fs from 'node:fs'
import path from 'node:path'
import { words } from './cards.mjs'
import { CSS, pageFoot, pageBar, menuHead, menuScript, pageHead, maker, langLinks, crumbs } from './digest.mjs'
import { isOptedOut, OWN_ACCOUNTS } from './config.mjs'
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
    if ('official' in l) l.official = official(l)
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
// completeFeeBy is also complete, fee and by: a search for the words finds the name
const camel = (s) => String(s || '').replace(/([a-z0-9])([A-Z])/g, '$1 $2')
// words that say nothing in a question ("why does my transaction fail with an error"): left out of the query when other words remain
const STOP = new Set('a an the and or of to in on at for with from by as is are was were be been it its this that these those i me my we our you your do does did how why what when where which who can could should would will if then than so but into out up about over after before'.split(' '))
const RANK = { L3: 3, L2: 2, OWN: 1, L1: 1, L0: 0 }
const byOwn = (l) => !!l.confirmed && OWN_ACCOUNTS.has(String(l.confirmed.by || '').toLowerCase())
/** The proof a lesson shows: its evidence level, except that L2 confirmed by the publisher's own account reads OWN (checked by the owner). */
export const evidenceOf = (l) => { const e = l.evidence || 'L0'; return e === 'L2' && byOwn(l) ? 'OWN' : e }
/** True when someone other than the publisher confirmed it. */
export const confirmedByOthers = (l) => !!l.confirmed && !byOwn(l)
// a word starts a word of the lesson (not any piece inside one: fee is not in coffee)
const has = (t, w) => ` ${t}`.includes(` ${w}`)
/** True when a and b differ by one letter: one added, left out or changed, or two next to each other swapped. */
function within1(a, b) {
  if (a === b) return true
  const d = a.length - b.length
  if (d > 1 || d < -1) return false
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  if (d === 0) return a.slice(i + 1) === b.slice(i + 1) || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2))
  const [long, short] = d > 0 ? [a, b] : [b, a]
  return long.slice(i + 1) === short.slice(i)
}
const near = (w, t) => w.length >= 5 && t.split(' ').some((x) => within1(w, x))
/** Every word of the query somewhere in the lesson; a word in the title counts most, then concepts and the library it applies
 * to, then the text and the sources. Best first, then the most recently changed (sort "proof": the best proven first; "new":
 * the most recently changed first). `evidence` keeps one level (L0 to L3), or "best" for confirmed and reproduced. With
 * `loose`, a query that no lesson answers in full gets the lessons that have most of its words, a word with one letter wrong
 * counting too. */
export function searchLessons(lessons, { q = '', area = '', repo = '', concept = '', level = '', evidence = '', sort = '', limit = 50, loose = false } = {}) {
  const raw = tokens(q), kept = raw.filter((w) => !STOP.has(w))
  const want = (kept.length ? kept : raw).map(stem), r = repo.toLowerCase()
  const out = [], partial = []
  for (const l of lessons) {
    if (area && l.area !== area) continue
    if (concept && !(l.concepts || []).includes(concept)) continue
    if (level && l.level !== level) continue
    if (evidence === 'best' ? RANK[evidenceOf(l)] < 2 : evidence && evidenceOf(l) !== evidence) continue
    if (r && !l.sources.some((s) => String(s.repo).toLowerCase() === r)) continue
    const fields = [[l.title, 3], [(l.concepts || []).join(' '), 2], [(l.applies_to || []).join(' '), 2], [l.id, 2],
      [`${l.lesson} ${l.why || ''} ${l.note || ''} ${(l.patterns || []).join(' ')}`, 1], [l.sources.map((s) => `${s.repo} ${s.subject}`).join(' '), 1]]
      .map(([t, w]) => [tokens(`${camel(t)} ${t}`).map(stem).join(' '), w])
    let score = 0, all = true
    for (const w of want) {
      const hit = fields.filter(([t]) => has(t, w))
      if (!hit.length) { all = false; break }
      score += Math.max(...hit.map(([, x]) => x))
    }
    if (all) out.push([score, l])
    else if (loose && want.length) { // not every word: how many, with a word that only starts the same (a prefix of four letters) or has a letter wrong counting too
      const n = want.filter((w) => fields.some(([t]) => has(t, w) || near(w, t) || (want.length > 1 && w.length >= 4 && t.split(' ').some((x) => x.startsWith(w.slice(0, 4)))))).length
      if (n >= Math.ceil(want.length / 2)) partial.push([n * 10 + score, l])
    }
  }
  const recent = (a, b) => String(b[1].last_touched || '').localeCompare(String(a[1].last_touched || ''))
  const order = sort === 'new' ? (a, b) => recent(a, b) || b[0] - a[0]
    : sort === 'proof' ? (a, b) => RANK[evidenceOf(b[1])] - RANK[evidenceOf(a[1])] || b[0] - a[0] || recent(a, b)
      : (a, b) => b[0] - a[0] || recent(a, b)
  out.sort(order)
  if (!out.length && loose && partial.length) { partial.sort(order); const r2 = partial.slice(0, limit).map(([, l]) => l); r2.partial = true; r2.fuzzy = want.length === 1; return r2 }
  return out.slice(0, limit).map(([, l]) => l)
}

// A project that is a library or a program the lessons are about has the lessons of its topic, not only those that came out
// of its own commits: CCC's own commits are few, and thirty-three lessons are about CCC.
const LIB_AREA = { 'ckb-devrel/ccc': 'ccc', 'nervosnetwork/ckb': 'node', 'nervosnetwork/ckb-light-client': 'light-client', 'nervosnetwork/ckb-std': 'scripts', 'nervosnetwork/ckb-vm': 'scripts', 'nervosnetwork/ckb-system-scripts': 'scripts', 'sporeprotocol/spore-sdk': 'spore', 'sporeprotocol/spore-contract': 'spore' }
/** The released lessons about one project: how many, and the first few, for the project's card. From its own commits, or, for a
 * library with a topic of its own, the lessons of that topic (`area` says which, best proven first). */
export function lessonsOf(data, repo, n = 5) {
  if (!data || data.version !== 1 || !repo) return { count: 0, top: [] }
  const area = LIB_AREA[String(repo).toLowerCase()]
  const found = searchLessons(visible(data).lessons, area ? { area, sort: 'proof', limit: 400 } : { repo, limit: 200 })
  return { count: found.length, top: found.slice(0, n).map((l) => ({ id: l.id, title: l.title })), ...(found.length && area ? { area } : {}) }
}

// ---------------------------------------------------------------- checking code against the lessons
// What a builder's code uses that the lessons talk about: function and method names, RPC methods, constants. A
// code-like name has an underscore or a capital inside (completeFeeBy, extract_metric, get_live_cell), or is a long hex
// constant. Plain words (since, capacity) are left out: as names in code they say too little.
const CODEY = /[A-Za-z_][A-Za-z0-9_]{3,}|0x[0-9a-fA-F_]{6,}/g
const isCodey = (w) => /^0x/i.test(w) || (/_/.test(w) && /[a-z]/i.test(w.replace(/_/g, ''))) || /[a-z][A-Z]/.test(w)
const norm = (w) => w.toLowerCase().replace(/^0x([0-9a-f_]+)$/, (m, h) => '0x' + h.replace(/_/g, ''))
// names every program has, whatever it does: they tie a lesson to code for no reason
const COMMON = new Set(['bigint', 'uint8array', 'tostring', 'tolowercase', 'touppercase', 'parseint', 'parsefloat', 'foreach', 'settimeout', 'setinterval', 'addeventlistener', 'queryselector', 'getelementbyid', 'usestate', 'useeffect', 'usememo', 'usecallback', 'innerhtml', 'textcontent', 'fromcharcode', 'hasownproperty', 'json_encode', 'self_', '__init__', 'unwrap_or', 'to_string', 'as_ref', 'as_slice', 'to_vec', 'into_iter', 'is_empty', 'is_some', 'is_none', 'is_ok', 'is_err'])
const codeNames = (text) => new Set((String(text || '').match(CODEY) || []).filter(isCodey).map(norm).filter((w) => !COMMON.has(w)))
const kindOf = (p) => { const m = /^\s*(avoid|prefer)\s*:\s*(.*)$/is.exec(p); return m ? [m[1].toLowerCase(), m[2]] : ['', p] }
let indexFor = null, indexOf = null
function lessonIndex(lessons) {
  if (indexFor === lessons) return indexOf
  const items = lessons.map((l) => {
    const pats = (l.patterns || []).map(kindOf)
    const names = codeNames([l.title, l.lesson, l.note, l.why, ...(l.patterns || [])].join(' '))
    return { l, names, title: codeNames(l.title), pat: codeNames((l.patterns || []).join(' ')), avoid: pats.filter(([k]) => k === 'avoid').map(([, c]) => codeNames(c)).filter((x) => x.size), prefer: pats.filter(([k]) => k === 'prefer').map(([, c]) => c) }
  })
  const df = new Map()
  for (const it of items) for (const w of it.names) df.set(w, (df.get(w) || 0) + 1)
  indexFor = lessons; indexOf = { items, df, n: items.length }
  return indexOf
}
// Comments name things the code does not use (a comment that mentions JoyID is not a JoyID call). Blanked, not removed,
// so line numbers stay. `#` starts a comment only where the language says so (in Rust and C it starts an attribute or
// a directive).
const HASH_COMMENTS = /\.(py|rb|sh|toml|ya?ml)$/i
export function stripComments(code, path = '') {
  const s = String(code || '').replace(/\/\*[\s\S]*?(\*\/|$)/g, (m) => m.replace(/[^\n]/g, ' '))
  return s.split('\n').map((ln) => {
    const t = ln.trimStart()
    if (t.startsWith('//') || /^\*(\s|\/|$)/.test(t) || (HASH_COMMENTS.test(path) && t.startsWith('#'))) return ''
    return ln.replace(/(^|[^:"'`\\])\/\/.*$/, '$1') // a trailing comment; not the // of a URL
  }).join('\n')
}
// Test code builds fixtures that look like the mistake on purpose (a zero code hash, a stubbed call).
export const isTestPath = (p) => /(^|\/)(tests?|__tests__|spec|e2e|fixtures?|mocks?)\//i.test(p) || /[._-](test|spec)\.[a-z]+$/i.test(p) || /(^|\/)test_[^/]*\.py$/i.test(p)

/** The lessons that apply to a piece of code: those that name what the code uses, rarest names first, and above all those
 * whose "avoid" pattern the code repeats. A list of hints to read, not a finding: nothing is run or proven.
 * The "avoid" label needs two names of the pattern on the code's side (and half of them, since local names differ):
 * one name is a call any project makes (on 2026-11-22 the bare word codeHash raised it in 8 of 73 pull requests, all
 * wrong). `avoid: false` never raises it (test code). */
export function checkCode(lessons, code, limit = 8, { avoid = true } = {}) {
  const { items, df, n } = lessonIndex(lessons)
  const mine = codeNames(code)
  const idf = (w) => Math.log((n + 1) / (df.get(w) || 1))
  const out = []
  for (const it of items) {
    const shared = [...it.names].filter((w) => mine.has(w) && (df.get(w) || 0) <= Math.max(3, n * 0.15))
    // One name ties a lesson to code only when the lesson is about it (its title) or it is a constant: a name that is
    // only in a lesson's example (startsWith, listOf, map_err) tied lessons to any code on 2026-11-22.
    if (!shared.length || (shared.length === 1 && !it.title.has(shared[0]) && !/^0x/.test(shared[0]))) continue
    const avoidHit = avoid && it.avoid.some((a) => { const have = [...a].filter((w) => mine.has(w)); return have.length >= 2 && have.length >= Math.ceil(a.size * 0.5) })
    const score = shared.reduce((x, w) => x + idf(w) * (it.title.has(w) ? 2 : 1) * (it.pat.has(w) ? 1.5 : 1), 0) + (avoidHit ? 100 : 0) // what a lesson is about is in its title and its pattern
    out.push({ score, it, shared, avoidHit })
  }
  out.sort((a, b) => b.score - a.score)
  return out.slice(0, limit).map(({ it, shared, avoidHit, score }) => ({ id: it.l.id, title: it.l.title, lesson: it.l.lesson, why: it.l.why || '', level: it.l.level || '',
    match: avoidHit ? 'your code repeats the pattern this lesson says to avoid' : 'your code uses what this lesson is about', uses: shared.slice(0, 6),
    prefer: it.prefer.slice(0, 2), sources: it.l.sources, score }))
}

/** The lessons for the lines a pull request changed: chunks [{path, start, code}], each a run of new lines that starts
 * at line `start` of `path`. Each lesson comes once, with where it applies first (path and line). For the GitHub Action.
 * Three by default, best first: a comment with ten lessons on a one-line change was the usual case on 2026-11-22. */
export const CHECK_LIMIT = 3
export function checkChunks(lessons, chunks, limit = CHECK_LIMIT) {
  const best = new Map()
  for (const c of chunks) {
    const code = stripComments(c.code, c.path)
    const lines = code.split('\n')
    for (const x of checkCode(lessons, code, 20, { avoid: !isTestPath(c.path) })) {
      const at = lines.findIndex((ln) => { const have = codeNames(ln); return x.uses.some((w) => have.has(w)) })
      const hit = { ...x, path: c.path, line: (c.start || 1) + Math.max(0, at) }
      const old = best.get(x.id)
      const rank = (h) => (h.match.includes('avoid') ? 1000 : 0) + h.score
      if (!old || rank(hit) > rank(old)) best.set(x.id, hit)
    }
  }
  return [...best.values()].sort((a, b) => (b.match.includes('avoid') - a.match.includes('avoid')) || b.score - a.score).slice(0, limit).map(({ score, ...x }) => x)
}

// ---------------------------------------------------------------- pages
const MORE_CSS = `.ln>p:not(.nt){display:-webkit-box;-webkit-line-clamp:3;line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.ln>.nt{display:none}.lp details,.lp pre{max-width:100%;min-width:0}.lp pre{white-space:pre-wrap;overflow-wrap:anywhere;overflow-x:auto}.pg{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin:18px 0}.ba{display:grid;gap:10px;margin:8px 0}.ba>div{border:1px solid var(--edge);background:var(--surface);padding:8px 12px;min-width:0}.ba .avoid{border-left:4px solid #e0533d}.ba .prefer{border-left:4px solid var(--lime)}.ba b{font-size:.8rem;letter-spacing:.06em;text-transform:uppercase}.ba pre{margin:6px 0 0;overflow-x:auto;white-space:pre-wrap;overflow-wrap:anywhere}.gl h2{margin:22px 0 4px}.gl .tm{border-top:1px solid var(--edge);padding:10px 0}.gl .tm h3{margin:0 0 2px}.gl .tm p{margin:2px 0}.gl .tm{padding:8px 0}#rv .cd{border:1px solid var(--edge);background:var(--surface);padding:16px;margin:12px 0;overflow-wrap:anywhere}#rv .row{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}#rv button{padding:10px 14px;border:1px solid var(--edge);background:var(--surface);color:var(--fg);font:inherit;cursor:pointer}#rv button.go{background:var(--lime);color:var(--ink);font-weight:700}`
const PAGE_CSS = `form.lq{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 6px}form.lq input{flex:1 1 220px;min-width:0;padding:10px 12px;border:1px solid var(--edge);background:var(--surface);color:var(--fg);font:inherit}form.lq select{flex:1 1 150px;min-width:0}form.lq select,form.lq button{padding:10px 12px;border:1px solid var(--edge);background:var(--surface);color:var(--fg);font:inherit}form.lq button{background:var(--lime);color:var(--ink);font-weight:700;cursor:pointer}
a.fc{display:inline-block;margin:0 6px 8px 0;padding:6px 12px;border:1px solid var(--fg);color:var(--fg);text-decoration:none;font-size:13px}.lg{font-size:14px;margin:4px 0 14px}.lg ul{padding-left:18px}.lg li{margin:3px 0}.lk{margin:8px 0 4px;font-size:15px}.lk a{display:inline-block;padding:6px 0}.lk a b{font-weight:700}ul.nf{padding-left:18px;margin:12px 0}ul.nf li{margin:12px 0;line-height:1.4}.lp .st{margin:2px 0 10px}
nav.ls{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 18px}nav.ls a{padding:8px 12px;border:1px solid var(--edge);color:var(--fg);text-decoration:none;font-size:13px}nav.ls a span{color:var(--mut);margin-left:6px}nav.ls a[aria-current=true]{border-color:var(--fg)}
.kpis.k4 div{overflow-wrap:normal}@media(max-width:520px){.kpis.k4 div{flex:1 1 40%;min-width:0}}section.lt{margin:22px 0 8px;overflow-wrap:anywhere}section.lt h2{margin:0 0 4px;font:600 21px var(--font-ui,sans-serif);color:var(--fg);text-transform:none;letter-spacing:-.01em}section.lt>p{margin:4px 0 10px;color:var(--mut)}
article.ln{background:var(--surface);border:1px solid var(--edge);padding:12px 16px;margin:8px 0;overflow-wrap:anywhere;min-width:0}article.ln h3{margin:0 0 4px;font:600 16px var(--font-ui,sans-serif)}article.ln h3 a{color:var(--fg);text-decoration:none}article.ln h3 a:hover{text-decoration:underline}article.ln p{margin:4px 0}
article.ln.old{opacity:.7}.ln .tg,.lp .tg{font-size:12px;color:var(--mut)}.ln .nt,.lp .nt{font-size:14px;color:var(--f-talk)}.bd{font:400 11px/1 var(--font-num);padding:3px 7px;border:1px solid var(--edge);color:var(--mut);margin-left:6px;vertical-align:middle;white-space:nowrap}.bd.old{color:var(--f-talk);border-color:var(--f-talk)}
.lp{overflow-wrap:anywhere}.lp .big{font-size:19px;line-height:1.5;margin:8px 0 14px}.lp h2{font:600 15px var(--font-ui,sans-serif);margin:22px 0 8px;text-transform:none;letter-spacing:0;color:var(--fg)}.lp ul{padding-left:18px}.lp li{margin:4px 0;font-size:14px}.lp li a{color:var(--lime)}.lp dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 14px;font-size:14px;margin:10px 0}.lp dt{color:var(--mut)}.lp dd{margin:0}.lp code{font-size:13px;overflow-wrap:anywhere}.lp .back{font-size:14px}.lp blockquote{margin:8px 0;padding:8px 12px;border-left:3px solid var(--line,#888);font-size:14px;border-radius:0 8px 8px 0}`

const head = (t, { lang, base, title, desc, pub, img, canonical }) => `<!doctype html><html lang="${lang === 'zh' ? 'zh-CN' : lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">${pub ? `${canonical ? `<link rel="canonical" href="${esc(canonical)}">` : ''}<link rel="alternate" type="application/atom+xml" title="CKB lessons" href="${esc(base)}/learned.xml">` : '<meta name="robots" content="noindex">'}${img ? `<meta property="og:type" content="article"><meta property="og:site_name" content="CKB Pulse"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:image" content="${esc(img)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${esc(img)}">` : ''}
${menuHead(base)}<style>${CSS}${PAGE_CSS}${MORE_CSS}</style></head><body><main>`
const href = (base, id, lang, pre = '/lessons') => `${base}${pre}/${id}?lang=${lang}`
const badges = (t, l) => `${l.status === 'superseded' ? `<span class="bd old">${esc(t('ls.old'))}</span>` : ''}<span class="bd" title="${esc(t('ls.evidence.' + evidenceOf(l)))}">${esc(t('ls.ev.short.' + evidenceOf(l)))}</span>`
const lvl = (t, l) => (l.level ? `<span class="bd">${esc(t('ls.level.' + l.level))}</span>` : '')
const card = (t, base, lang, l, pre) => `<article class="ln${l.status === 'superseded' ? ' old' : ''}"><h3><a href="${esc(href(base, l.id, lang, pre))}">${esc(l.title)}</a>${lvl(t, l)}${badges(t, l)}</h3><p>${esc(l.lesson)}</p>${l.note ? `<p class="nt">${esc(l.note)}</p>` : ''}
<p class="tg">${(l.concepts || []).map((c) => `<a href="${esc(base)}${pre}?concept=${encodeURIComponent(c)}&amp;lang=${lang}">#${esc(c)}</a>`).join(' ')} · ${esc(t('ls.sources', { n: l.sources.length }))}${l.last_touched ? ` · ${esc(l.last_touched)}` : ''}</p></article>`

const PER_PAGE = 12
const PEEK = 2
const PROOF = ['L3', 'L2', 'OWN', 'L1', 'L0']
export function lessonsPage({ lang, base, url, data, q = '', area = '', concept = '', level = '', evidence = '', sort = '', repo = '', page = 1, pub = false }) {
  const pre = pub ? '/learned' : '/lessons'
  const t = words(lang), v = visible(data), topics = shownLessons(data)
  if (!/^[A-Za-z0-9-]{1,39}\/[\w-][\w.-]{0,99}$/.test(repo)) repo = '' // a GitHub owner/repo, nothing else
  if (!['L0', 'L1', 'L2', 'L3', 'OWN', 'best'].includes(evidence)) evidence = ''
  if (!['proof', 'new'].includes(sort)) sort = ''
  if (!['basic', 'working', 'advanced'].includes(level)) level = ''
  if (area && !topics.some((x) => x.slug === area)) area = ''
  const searching = !!(q.trim() || area || concept || level || repo || evidence || sort)
  const found = searching ? searchLessons(v.lessons, { q, area, concept, level, evidence, sort, repo, limit: 400, loose: true }) : []
  const pages = Math.max(1, Math.ceil(found.length / PER_PAGE)), pg = Math.min(pages, Math.max(1, Number.parseInt(page, 10) || 1))
  const keep = new URLSearchParams({ ...(q.trim() ? { q } : {}), ...(area ? { area } : {}), ...(concept ? { concept } : {}), ...(level ? { level } : {}), ...(evidence ? { evidence } : {}), ...(sort ? { sort } : {}), ...(repo ? { repo } : {}) })
  const withLang = (l, extra = []) => new URLSearchParams([...keep, ...extra, ['lang', l]])
  const pageHref = (n) => `${base}${pre}?${withLang(lang, n > 1 ? [['page', String(n)]] : [])}`.replace(/&/g, '&amp;')
  const here = `${pre}${keep.size ? `?${keep}` : ''}` // the language links keep what is being looked at
  const pager = pages > 1 ? `<p class="pg">${pg > 1 ? `<a href="${pageHref(pg - 1)}" rel="prev">${esc(t('ls.prev'))}</a>` : ''}<span>${esc(t('ls.page', { p: pg, n: pages }))}</span>${pg < pages ? `<a href="${pageHref(pg + 1)}" rel="next">${esc(t('ls.next'))}</a>` : ''}</p>` : ''
  const opts = (list, now) => list.map(([val, label]) => `<option value="${esc(val)}"${val === now ? ' selected' : ''}>${esc(label)}</option>`).join('')
  const areaOpts = opts([['', t('ls.all')], ...topics.map((x) => [x.slug, x.area])], area)
  const proofOpts = opts([['', t('ls.proof.any')], ['best', t('ls.proof.best')], ...PROOF.map((k) => [k, t('ls.ev.short.' + k)])], evidence)
  const levelOpts = opts([['', t('ls.diff.any')], ...['basic', 'working', 'advanced'].map((k) => [k, t('ls.level.' + k)])], level)
  const sortOpts = opts([['', t('ls.sort.rel')], ['proof', t('ls.sort.proof')], ['new', t('ls.sort.new')]], sort)
  const nameOf = area ? v.areas[area]?.name || area : concept || repo || (q.trim() ? `“${q.trim().slice(0, 60)}”` : '')
  const title = nameOf ? `${nameOf} · ${t('ls.title')} · CKB Pulse` : `CKB Pulse · ${t('ls.title')}`, desc = t('ls.lead')
  const active = [['q', q.trim() && `“${q.trim().slice(0, 60)}”`], ['area', area && (v.areas[area]?.name || area)], ['concept', concept && `#${concept}`], ['level', level && t('ls.level.' + level)],
    ['evidence', evidence && (evidence === 'best' ? t('ls.proof.best') : t('ls.ev.short.' + evidence))], ['sort', sort && t('ls.sort.' + sort)], ['repo', repo]].filter(([, x]) => x)
  const without = (k) => `${base}${pre}?${new URLSearchParams([...withLang(lang)].filter(([n]) => n !== k))}`
  const chips = active.length ? `<p class="af" aria-label="${esc(t('ls.showing'))}">${active.map(([k, x]) => `<a class="fc" href="${esc(without(k))}" aria-label="${esc(t('ls.remove', { x }))}">${esc(x)} <span aria-hidden="true">✕</span></a>`).join('')}</p>` : ''
  const count = (k) => v.lessons.filter((l) => evidenceOf(l) === k).length
  const topicChips = `<nav class="ls" aria-label="${esc(t('ls.topics'))}">${topics.map((x) => `<a href="${esc(base)}${pre}?area=${esc(x.slug)}&amp;lang=${lang}">${esc(x.area)}<span>${x.lessons.length}</span></a>`).join('')}</nav>`
  const proofChips = `<nav class="ls" aria-label="${esc(t('ls.proof.h'))}"><span class="tg">${esc(t('ls.proof.h'))}:</span>${PROOF.filter(count).map((k) => `<a href="${esc(base)}${pre}?evidence=${k}&amp;lang=${lang}" title="${esc(t('ls.evidence.' + k))}">${esc(t('ls.ev.short.' + k))}<span>${count(k)}</span></a>`).join('')}</nav>
<details class="lg"><summary>${esc(t('ls.proof.what'))}</summary><ul>${PROOF.map((k) => `<li><b>${esc(t('ls.ev.short.' + k))}</b>: ${esc(t('ls.evidence.' + k))}</li>`).join('')}</ul></details>`
  // new or newly proven in the last week, for someone who comes back: the lessons that appeared, were confirmed or were reproduced
  const today = DAY.test(String(data.generated).slice(0, 10)) ? String(data.generated).slice(0, 10) : lessonEvents(data)[0]?.at || ''
  const since = today ? new Date(Date.parse(`${today}T00:00:00Z`) - 7 * 864e5).toISOString().slice(0, 10) : ''
  const fresh = !today ? [] : [...lessonEvents(data).filter((e) => e.kind !== 'changed' && !(e.kind === 'confirmed' && e.own) && e.at >= since), // a check by the owner is not news of proof
    ...v.lessons.filter((l) => DAY.test(String(l.first_seen)) && l.first_seen >= since).map((l) => ({ at: l.first_seen, kind: 'new', l }))]
    .sort((x, y) => y.at.localeCompare(x.at) || x.l.id.localeCompare(y.l.id))
  const shown = ['new', 'reproduced', 'confirmed'].flatMap((k) => fresh.filter((e) => e.kind === k).slice(0, 3)) // a few of each: a day of confirmations must not push out the rest
  const news = fresh.length ? `<section class="lt" id="new"><h2>${esc(t('ls.new.h'))}</h2><ul>${shown.map((e) => `<li><a href="${esc(href(base, e.l.id, lang, pre))}">${esc(e.l.title)}</a><br><span class="tg">${esc(t('ls.new.' + e.kind, { by: e.c?.by || '', role: e.c ? t('ls.conf.role.' + e.c.role) : '' }))} · ${esc(e.at)}</span></li>`).join('')}</ul><p><a href="${esc(base)}${pre}?evidence=best&amp;sort=proof&amp;lang=${lang}">${esc(t('ls.new.proven'))}</a></p></section>` : ''
  const canonical = pub ? `${base}${pre}${keep.size || pg > 1 ? `?${new URLSearchParams([...keep, ...(pg > 1 ? [['page', String(pg)]] : [])])}` : ''}` : ''
  return `${head(t, { lang, base, title, desc, pub, canonical, img: pub ? `${base}${withStamp('/og/learned.png', [v.lessons.length, v.lessons.filter(confirmedByOthers).length])}&lang=${lang}` : '' })}
${pageBar(t, { base, lang, current: '', here })}
${pageHead({ crumbs: crumbs(t, { base, lang, trail: [[t('ls.nav'), null]] }), eyebrow: t('ls.nav'), title: t('ls.h1'), lede: searching ? '' : esc(desc) })}
${searching ? '' : pub ? `<div class="kpis k4">${[[v.lessons.length, 'ls.k.lessons'], [new Set(v.lessons.flatMap((l) => l.sources.map((s) => s.repo))).size, 'ls.k.projects'], [since ? v.lessons.filter((l) => DAY.test(String(l.first_seen)) && l.first_seen >= since).length : 0, 'ls.k.new'], [v.lessons.filter((l) => reproduced(l)).length, 'ls.k.proven']].map(([n, k]) => `<div><b>${n}</b><span>${esc(t(k))}</span></div>`).join('')}</div><p>${esc(t('ls.pub.checked'))}</p>` : `<p>${esc(t('ls.week', { from: v.from, to: v.to, read: v.read, lessons: v.lessons.length }))}</p>`}
<p class="lk"><a href="${esc(base)}${pre}/start?lang=${lang}"><b>${esc(t('ls.start.nav'))}</b></a> · <a href="${esc(base)}${pre}/glossary?lang=${lang}">${esc(t('ls.gloss.link'))}</a> · <a href="${esc(base)}${pre}/review?lang=${lang}">${esc(t('ls.rev.link'))}</a>${pub ? ` · <a href="${esc(base)}/learned.xml">${esc(t('ls.feed'))}</a>` : ''}</p>
${!searching && pub ? `<p class="nt">${esc(t('ls.pub.notice'))}</p>` : ''}${!searching && !pub && v.checked ? `<p class="nt">${esc(t('ls.sample', { sample: v.checked.sample, of: v.checked.of, right: v.checked.right, partly: v.checked.partly_right, notckb: v.checked.not_ckb, wrong: v.checked.wrong }))}</p>` : ''}
<form class="lq" method="get" action="${esc(base)}${pre}" role="search"><input type="search" name="q" value="${esc(q)}" placeholder="${esc(t('ls.search'))}" aria-label="${esc(t('ls.search'))}"><button type="submit">${esc(t('ls.find'))}</button>
<select name="area" aria-label="${esc(t('ls.topics'))}">${areaOpts}</select><select name="evidence" aria-label="${esc(t('ls.proof'))}">${proofOpts}</select><select name="level" aria-label="${esc(t('ls.diff'))}">${levelOpts}</select><select name="sort" aria-label="${esc(t('ls.sort'))}">${sortOpts}</select><input type="hidden" name="lang" value="${esc(lang)}">${concept ? `<input type="hidden" name="concept" value="${esc(concept)}">` : ''}${repo ? `<input type="hidden" name="repo" value="${esc(repo)}">` : ''}</form>
${lang !== 'en' ? `<p class="tg">${esc(t('ls.english'))}</p>` : ''}${chips}
${searching
    ? `${repo ? `<h2>${esc(t('ls.repo.h', { repo }))}</h2><p><a href="https://github.com/${esc(repo)}" rel="noreferrer">github.com/${esc(repo)}</a></p>${pub && found.length && !q.trim() && !area && !concept && !level && !evidence ? `<p class="tg">${esc(t('ls.conf.batch'))} ${batchConfirmUrls(base, repo, found.map((l) => l.id)).map((u, k, all) => `<a href="${esc(u)}" rel="noreferrer">${esc(all.length > 1 ? t('ls.conf.batch.n', { a: k * BATCH + 1, b: Math.min(found.length, (k + 1) * BATCH) }) : t('ls.conf.batch.a'))}</a>`).join(' · ')}</p>` : ''}` : ''}<p>${esc(found.length ? t(found.fuzzy ? 'ls.fuzzy' : found.partial ? 'ls.partial' : 'ls.found', { n: found.length }) : t('ls.none'))} <a href="${esc(base)}${pre}?lang=${lang}">${esc(t('ls.back'))}</a></p>${found.length ? '' : `<p class="nt">${esc(t('ls.none.tip'))}</p>${topicChips}`}${pager}${found.slice((pg - 1) * PER_PAGE, pg * PER_PAGE).map((l) => card(t, base, lang, l, pre)).join('\n')}${pager}`
    : `${proofChips}${news}<p class="lk">${esc(t('ls.all.n', { n: v.lessons.length }))}: <a href="${esc(base)}${pre}?sort=proof&amp;lang=${lang}">${esc(t('ls.sort.proof'))}</a> · <a href="${esc(base)}${pre}?sort=new&amp;lang=${lang}">${esc(t('ls.sort.new'))}</a></p>
<nav class="ls" aria-label="${esc(t('ls.topics'))}">${topics.map((x) => `<a href="#${x.slug}">${esc(x.area)}<span>${x.lessons.length}</span></a>`).join('')}</nav>
${topics.map((x) => `<section class="lt" id="${x.slug}"><h2>${esc(x.area)}</h2><p>${esc(x.summary)}</p>
${x.lessons.slice(0, PEEK).map((l) => card(t, base, lang, l, pre)).join('\n')}${x.lessons.length > PEEK ? `<p><a href="${esc(base)}${pre}?area=${esc(x.slug)}&amp;lang=${lang}">${esc(t('ls.topic.all', { n: x.lessons.length }))}</a></p>` : ''}</section>`).join('\n')}`}
${pub
    ? `<p class="tg">${esc(t('ls.pub.license'))} <a href="${esc(base)}/learned.json">JSON</a> · <a href="https://github.com/LusoCryptoLabs/ckb-pulse/issues/new">${esc(t('ls.pub.remove'))}</a></p>`
    : `<p class="tg">${esc(t('ls.how'))}</p>
<p class="tg">${esc(t('ls.api'))} <code>${esc(base)}/lessons/api?q=</code> · <code>${esc(base)}/lessons/mcp</code></p>`}
<footer>${maker(t)}
${langLinks((l) => `${base}${pre}?${withLang(l, pg > 1 ? [['page', String(pg)]] : [])}`)}</footer>
</main>${menuScript(base)}</body></html>`
}

/** One lesson: the rule, why, where it came from, what it is related to and how it changed. null when there is no such
 * lesson (or it is hidden). */
/** Patterns the model copied from the commit's diff, labelled avoid: or prefer:, shown as before and after; any other line stays as it was. */
function patternBlock(t, patterns) {
  const one = (p) => { const m = /^\s*(avoid|prefer)\s*:\s*(.*)$/is.exec(p); return m ? { kind: m[1].toLowerCase(), code: m[2] } : { kind: '', code: p } }
  const items = patterns.map(one)
  return `<div class="ba">${items.map((x) => `<div class="${x.kind || 'pl'}">${x.kind ? `<b>${esc(t(x.kind === 'avoid' ? 'ls.before' : 'ls.after'))}</b>` : ''}<pre><code>${esc(x.code)}</code></pre></div>`).join('')}</div>${items.some((x) => x.kind) ? `<p class="tg">${esc(t('ls.pat.hint'))}</p>` : ''}`
}

// The issue a maintainer opens to confirm or correct a lesson: the lessons pipeline reads the title and the verdict line
// (ckb-lessons, pipeline/confirm.py) and counts it only from the owner of a source repository, the author of a source
// commit or a public member of the owning organisation.
const LOGIN_OK = /^[A-Za-z0-9-]{1,39}$/
// what the check against the source commit found, in the order of the words ls.verdict.0 to .3
const VERDICTS = ['right', 'partly right', 'wrong', 'not CKB specific']
export const confirmUrl = (base, l) => `https://github.com/LusoCryptoLabs/ckb-pulse/issues/new?title=${encodeURIComponent(`Lesson: ${l.id}`)}&body=${encodeURIComponent([`${base}/learned/${l.id}`, '', 'Verdict: right', '', 'If something is wrong, change the line above to "Verdict: needs a fix" and say what. It counts when you own a source repository of this lesson, wrote one of its source commits, or are a public member of the organisation that owns it.'].join(String.fromCharCode(10)))}`
// One issue for the lessons of a project (ckb-lessons, pipeline/confirm.py: title "Lessons: owner/repo", a line a lesson,
// "right | id"). An address cannot carry much: 30 lessons an issue, more in further issues.
export const BATCH = 30
export const batchConfirmUrls = (base, repo, ids) => {
  const out = []
  for (let k = 0; k < ids.length; k += BATCH) {
    const body = [`${base}/learned?repo=${repo}`, '', 'One line a lesson. Replace the ? with "right" or "needs a fix" on each lesson you have read. A line left with its ? is not counted. You can save and come back: the issue is read every day until it is closed.', '', ...ids.slice(k, k + BATCH).map((id) => `? | ${id}`)].join(String.fromCharCode(10))
    out.push(`https://github.com/LusoCryptoLabs/ckb-pulse/issues/new?title=${encodeURIComponent(`Lessons: ${repo}`)}&body=${encodeURIComponent(body)}`)
  }
  return out
}
// The public test that runs what a lesson says (evidence L3 when it covers all of it). Only our own tests repository is
// linked, and every field is matched to a pattern before it is shown: the record travels through a public JSON file.
const TESTS_REPO = 'LusoCryptoLabs/ckb-lesson-tests'
const REPRO_OK = { test: /^tests\/[a-z0-9-]{1,40}\/[a-z0-9-]{1,80}\.test\.mjs$/, commit: /^[0-9a-f]{7,40}$/, library: /^(@[a-z0-9-]{1,40}\/)?[a-z0-9-]{1,60}$/, version: /^\d{1,4}\.\d{1,4}\.\d{1,4}$/, covers: /^(all|part: [A-Za-z0-9 ,.()'-]{3,160})$/ }
export function reproduced(l) {
  const r = l.reproduced
  return r && r.repo === TESTS_REPO && Object.entries(REPRO_OK).every(([k, re]) => re.test(String(r[k] ?? ''))) ? r : null
}
function reproBlock(t, l) {
  const r = reproduced(l)
  if (!r) return ''
  const part = r.covers === 'all' ? '' : ` ${esc(t('ls.repro.part'))} ${esc(r.covers.slice(6))}.`
  return `<h2>${esc(t('ls.repro'))}</h2><p>${esc(t('ls.repro.text', { lib: r.library, ver: r.version }))}${part}</p><p><a href="https://github.com/${TESTS_REPO}/blob/${esc(r.commit)}/${esc(r.test)}" rel="noreferrer"><code>${esc(r.test)}</code></a></p>`
}
// The official documentation on the same subject (ckb-lessons, pipeline/official.py): the section a model read next to the
// lesson, at the commit it was read. Only the sources named here are linked, and every field is matched to a pattern before
// it is shown: the record travels through a public JSON file. "agrees" shows the section's own sentence; "topic only" is a
// pointer, not proof (measured 2026-11-24: one of two lessons that are not about CKB came back as same subject).
const OFFICIAL_REPOS = new Set(['nervosnetwork/rfcs', 'nervosnetwork/docs.nervos.org', 'nervosnetwork/ckb', 'nervosnetwork/ckb-light-client', 'nervosnetwork/ckb-cli', 'nervosnetwork/ckb-std', 'ckb-devrel/ccc'])
const OFFICIAL_PATH = /^[A-Za-z0-9_@-][A-Za-z0-9_.@-]*(\/[A-Za-z0-9_@-][A-Za-z0-9_.@-]*){0,12}$/
export function official(l) {
  const o = l.official
  if (!o || !['agrees', 'topic only'].includes(o.relation) || !OFFICIAL_REPOS.has(o.repo) || !/^[0-9a-f]{40}$/.test(String(o.commit)) || typeof o.path !== 'string' || o.path.length > 200 || !OFFICIAL_PATH.test(o.path)
    || !Number.isInteger(o.line) || o.line < 1 || o.line > 999999) return null
  const section = typeof o.section === 'string' && o.section.trim() ? o.section.trim().slice(0, 120) : o.path.split('/').pop()
  const quote = o.relation === 'agrees' && typeof o.quote === 'string' ? o.quote.trim().slice(0, 300) : ''
  // a markdown file opens as its source, so that the line is the one that was read
  return { relation: o.relation, repo: o.repo, commit: o.commit, path: o.path, line: o.line, section, ...(quote ? { quote } : {}), ...(DAY.test(String(o.date)) ? { date: o.date } : {}),
    url: `https://github.com/${o.repo}/blob/${o.commit}/${o.path}${/\.md$/.test(o.path) ? '?plain=1' : ''}#L${o.line}` }
}
function officialBlock(t, l) {
  const o = official(l)
  if (!o) return ''
  return `<h2>${esc(t('ls.off'))}</h2><p class="nt">${esc(t(o.quote ? 'ls.off.agrees' : 'ls.off.topic'))}</p>${o.quote ? `<blockquote>${esc(o.quote)}</blockquote>` : ''}<p><a href="${esc(o.url)}" rel="noreferrer">${esc(o.repo)}: ${esc(o.section)}</a>${o.date ? ` · ${esc(t('ls.off.read', { date: o.date }))}` : ''}</p>`
}
function confirmBlock(t, base, l) {
  const c = l.confirmed && LOGIN_OK.test(String(l.confirmed.by || '')) && ['owner', 'author', 'member'].includes(l.confirmed.role) ? l.confirmed : null
  const by = c ? `<p class="nt">${esc(t(byOwn(l) ? 'ls.conf.by.own' : 'ls.conf.by'))} <a href="https://github.com/${esc(c.by)}" rel="noreferrer">@${esc(c.by)}</a> (${esc(t('ls.conf.role.' + c.role))})${c.date ? `, ${esc(c.date)}` : ''}.</p>` : ''
  return `${by}<p class="tg"><a href="${esc(confirmUrl(base, l))}" rel="noreferrer">${esc(t('ls.conf.ask'))}</a></p>`
}
export function lessonPage({ lang, base, url, data, id, pub = false }) {
  const pre = pub ? '/learned' : '/lessons'
  const t = words(lang), v = visible(data), l = v.lessons.find((x) => x.id === id)
  if (!l) return null
  const byId = new Map(v.lessons.map((x) => [x.id, x]))
  const link = (i) => { const x = byId.get(i); return x ? `<a href="${esc(href(base, i, lang, pre))}">${esc(x.title)}</a>` : '' }
  const date = (d) => (d ? esc(d) : esc(t('ls.never')))
  // other lessons on the same topic, those that share most concepts with this one first, then the best proven
  const sameArea = v.lessons.filter((x) => x.id !== l.id && x.status !== 'superseded' && x.area === l.area)
  const more = sameArea.map((x) => [(x.concepts || []).filter((c) => (l.concepts || []).includes(c)).length, x])
    .sort((a, b) => b[0] - a[0] || RANK[evidenceOf(b[1])] - RANK[evidenceOf(a[1])] || a[1].title.localeCompare(b[1].title)).slice(0, 3).map(([, x]) => x)
  return `${head(t, { lang, base, title: `${l.title} · CKB Pulse`, desc: l.lesson, pub, canonical: pub ? `${base}/learned/${l.id}` : '', img: pub ? `${base}${withStamp(`/og/lesson.png?id=${encodeURIComponent(l.id)}`, [l.title, l.lesson, l.level])}&lang=${lang}` : '' })}
${pageBar(t, { base, lang, current: '', here: `${pre}/${l.id}` })}
${crumbs(t, { base, lang, trail: [[t('ls.nav'), pre], [v.areas[l.area]?.name || l.area, `${pre}?area=${encodeURIComponent(l.area)}`], [l.title, null]] })}
<article class="lp">
<p class="back"><a href="${esc(base)}${pre}/start?lang=${lang}">${esc(t('ls.start.nav'))}</a> · <a href="${esc(base)}${pre}/glossary?lang=${lang}">${esc(t('ls.gloss.link'))}</a></p>
<h1>${esc(l.title)}${lvl(t, l)}${badges(t, l)}</h1>
<p class="tg st">${esc(t('ls.ev.short.' + evidenceOf(l)))}${l.checked?.verdict && VERDICTS.includes(l.checked.verdict) && pub ? ` · ${esc(t('ls.status.check', { v: t('ls.verdict.' + VERDICTS.indexOf(l.checked.verdict)).split(/[:\uFF1A]/)[0] }))}` : ''} · ${(l.checked?.date || l.last_checked) ? esc(t('ls.status.checked', { date: l.checked?.date || l.last_checked })) : esc(t('ls.status.never'))}</p>
<p class="big">${esc(l.lesson)}</p>
${l.why ? `<p><b>${esc(t('ls.why'))}</b> ${esc(l.why)}</p>` : ''}
${l.note ? `<p class="nt">${esc(l.note)}</p>` : ''}
${l.superseded_by ? `<p class="nt">${esc(t('ls.replaced'))} ${link(l.superseded_by)}</p>` : ''}
${(l.patterns || []).length ? `<h2>${esc(t('ls.pattern'))}</h2>${patternBlock(t, l.patterns)}` : ''}
${(l.tests || []).length ? `<h2>${esc(t('ls.tests'))}</h2><p class="nt">${esc(t('ls.tests.note'))}</p><ul>${l.tests.map((x) => `<li><a href="https://github.com/${esc(x.repo)}/commit/${esc(x.hash)}" rel="noreferrer">${esc(x.repo)}</a>: ${x.files.map((f) => `<code>${esc(f)}</code>`).join(', ')}</li>`).join('')}</ul>` : ''}
${pub ? reproBlock(t, l) : ''}
${pub ? officialBlock(t, l) : ''}
<dl><dt>${esc(t('ls.concepts'))}</dt><dd>${(l.concepts || []).map((c) => `<a href="${esc(base)}${pre}?q=${encodeURIComponent(c)}&amp;lang=${lang}">${esc(c)}</a>`).join(', ')}</dd>
${(l.applies_to || []).length ? `<dt>${esc(t('ls.applies'))}</dt><dd>${l.applies_to.map(esc).join(', ')}</dd>` : ''}
<dt>${esc(t('ls.evidence'))}</dt><dd>${esc(t('ls.ev.short.' + evidenceOf(l)))}: ${esc(t('ls.evidence.' + evidenceOf(l)))}</dd>
<dt>${esc(t('ls.first'))}</dt><dd>${date(l.first_seen)}</dd><dt>${esc(t('ls.touched'))}</dt><dd>${date(l.last_touched)}</dd><dt>${esc(t('ls.checked'))}</dt><dd>${date(l.checked?.date || l.last_checked)}</dd>${pub && l.checked?.verdict && VERDICTS.includes(l.checked.verdict) ? `<dt>${esc(t('ls.verdict'))}</dt><dd>${esc(t('ls.verdict.' + VERDICTS.indexOf(l.checked.verdict)))}${l.checked.verdict !== 'right' && typeof l.checked.problem === 'string' && l.checked.problem.trim() ? `<br><span class="tg">${esc(t('ls.verdict.found'))}</span> ${esc(l.checked.problem.trim().slice(0, 400))}` : ''}</dd>` : ''}</dl>
<h2>${esc(t('ls.sources', { n: l.sources.length }))}</h2><ul>${l.sources.map((s) => `<li>${s.date ? `${esc(s.date)} · ` : ''}<a href="https://github.com/${esc(s.repo)}/commit/${esc(s.hash)}" rel="noreferrer">${esc(s.repo)}</a>${s.subject ? `: ${esc(s.subject)}` : ''} · <a href="${esc(base)}${pre}?repo=${encodeURIComponent(s.repo)}&amp;lang=${lang}">${esc(t('ls.repo.more'))}</a></li>`).join('')}</ul>
${l.related.length ? `<h2>${esc(t('ls.related'))}</h2><ul>${l.related.map((i) => `<li>${link(i)}</li>`).join('')}</ul>` : ''}
${more.length ? `<h2>${esc(t('ls.more.topic', { topic: v.areas[l.area]?.name || l.area }))}</h2><ul>${more.map((x) => `<li>${link(x.id)}</li>`).join('')}</ul><p><a href="${esc(base)}${pre}?area=${esc(l.area)}&amp;lang=${lang}">${esc(t('ls.topic.all', { n: sameArea.length + 1 }))}</a></p>` : ''}
${(l.history || []).length ? `<h2>${esc(t('ls.history'))}</h2><ul>${l.history.map((h) => `<li>${esc(h.date)} · ${esc(h.what)}</li>`).join('')}</ul>` : ''}
${pub ? confirmBlock(t, base, l) : ''}
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

/** The page for an address that is nowhere: what is here, a search of the lessons, and, for a lesson address with a slip in it, the lessons closest to the words in it. */
export function notFoundPage({ lang, base, url, data, path: p = '' }) {
  const t = words(lang), v = data?.version === 1 && Array.isArray(data.lessons) ? visible(data) : null
  let last = ''
  try { last = decodeURIComponent(String(p)).split('/').pop() } catch { /* a bad escape: no guess */ }
  const guess = String(p).startsWith('/learned/') ? camel(last).replace(/[-_.]+/g, ' ').trim() : ''
  const gt = tokens(guess).map(stem)
  const like = (l) => { const it = tokens(l.id.split('/').pop().replace(/-/g, ' ')).map(stem); return gt.filter((w) => it.some((x) => x.startsWith(w) || (w.length >= 5 && within1(w, x)))).length / gt.length }
  const close = v && gt.length ? v.lessons.map((l) => [like(l), l]).filter(([s]) => s >= 0.6).sort((a, b) => b[0] - a[0]).slice(0, 5).map(([, l]) => l) : []
  const go = (path) => `${base}${path}${path.includes('?') ? '&' : '?'}lang=${lang}`
  const title = `${t('nf.h')} · CKB Pulse`
  return `${head(t, { lang, base, title, desc: t('nf.p'), pub: false })}
${pageBar(t, { base, lang, current: '', here: '/' })}
${pageHead({ eyebrow: '404', title: t('nf.h'), lede: esc(t('nf.p')) })}
<ul class="nf"><li><a href="${esc(go('/live'))}">${esc(t('m.live'))}</a></li><li><a href="${esc(go('/digest?p=week'))}">${esc(t('m.digest'))}</a></li>${v ? `<li><a href="${esc(go('/learned'))}">${esc(t('m.learned'))}</a></li>` : ''}<li><a href="${esc(go('/use'))}">${esc(t('use.nav'))}</a></li></ul>
${v ? `<form class="lq" method="get" action="${esc(base)}/learned" role="search"><input type="search" name="q" value="${esc(close.length ? guess : '')}" placeholder="${esc(t('ls.search'))}" aria-label="${esc(t('ls.search'))}"><input type="hidden" name="lang" value="${esc(lang)}"><button type="submit">${esc(t('ls.find'))}</button></form>` : ''}
${close.length ? `<h2>${esc(t('nf.close'))}</h2><ul class="nf">${close.map((x) => `<li><a href="${esc(base)}/learned/${esc(x.id)}?lang=${lang}">${esc(x.title)}</a></li>`).join('')}</ul>` : ''}
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

const LEVELS = { basic: 0, working: 1, advanced: 2 }
const plainest = (a, b) => ((LEVELS[a.level] ?? 3) - (LEVELS[b.level] ?? 3)) || (b.sources.length - a.sources.length) || a.title.localeCompare(b.title)

/** Every concept the lessons use, A to Z, each with the plainest lesson that teaches it and a link to all of them. */
export function glossaryPage({ lang, base, url, data, pub = false }) {
  const pre = pub ? '/learned' : '/lessons'
  const t = words(lang), v = visible(data), by = new Map()
  for (const l of v.lessons) for (const c of l.concepts || []) (by.get(c) || by.set(c, []).get(c)).push(l)
  const terms = [...by].map(([c, ls]) => [c, ls.sort(plainest)]).sort((a, b) => a[0].localeCompare(b[0], lang === 'zh' ? 'zh' : lang))
  const letters = [...new Set(terms.map(([c]) => c[0].toUpperCase()))]
  return `${head(t, { lang, base, title: `${t('ls.gloss.h')} · CKB Pulse`, desc: t('ls.gloss.p'), pub, canonical: pub ? `${base}/learned/glossary` : '' })}
${pageBar(t, { base, lang, current: '', here: `${pre}/glossary` })}
${pageHead({ crumbs: crumbs(t, { base, lang, trail: [[t('ls.nav'), pre], [t('ls.gloss.link'), null]] }), eyebrow: t('ls.nav'), title: t('ls.gloss.h'), lede: esc(t('ls.gloss.p')) })}
<p><a href="${esc(base)}${pre}?lang=${lang}">${esc(t('ls.back'))}</a></p>
<nav class="ls">${letters.map((x) => `<a href="#g-${esc(x)}">${esc(x)}</a>`).join('')}</nav>
<div class="gl">${letters.map((x) => `<h2 id="g-${esc(x)}">${esc(x)}</h2>${terms.filter(([c]) => c[0].toUpperCase() === x).map(([c, ls]) => `<div class="tm"><h3><a href="${esc(base)}${pre}?concept=${encodeURIComponent(c)}&amp;lang=${lang}">${esc(c)}</a> <span class="tg">${esc(t('ls.gloss.n', { n: ls.length }))}</span></h3><p><a href="${esc(href(base, ls[0].id, lang, pre))}">${esc(ls[0].title)}</a></p></div>`).join('')}`).join('')}</div>
${pageFoot(t, url)}
</main>${menuScript(base)}</body></html>`
}

/** Spaced repetition that lives in the browser: boxes of 1, 2, 4, 8, 16, 32 days kept in localStorage. Nothing is sent anywhere. */
export function reviewPage({ lang, base, url, data, pub = false }) {
  const pre = pub ? '/learned' : '/lessons'
  const t = words(lang), v = visible(data)
  const cards = v.lessons.filter((l) => l.status !== 'superseded').sort(plainest).map((l) => ({ id: l.id, t: l.title, l: l.lesson, w: l.why || '' }))
  const ui = { q: t('ls.rev.q'), show: t('ls.rev.show'), know: t('ls.rev.know'), again: t('ls.rev.again'), done: t('ls.rev.done'), left: t('ls.rev.left', { n: '{n}' }), reset: t('ls.rev.reset'), why: t('ls.why') }
  const json = (o) => JSON.stringify(o).replace(/</g, '\\u003c')
  return `${head(t, { lang, base, title: `${t('ls.rev.h')} · CKB Pulse`, desc: t('ls.rev.p'), pub, canonical: pub ? `${base}/learned/review` : '' })}
${pageBar(t, { base, lang, current: '', here: `${pre}/review` })}
${pageHead({ crumbs: crumbs(t, { base, lang, trail: [[t('ls.nav'), pre], [t('ls.rev.h'), null]] }), eyebrow: t('ls.nav'), title: t('ls.rev.h'), lede: esc(t('ls.rev.p')) })}
<p><a href="${esc(base)}${pre}?lang=${lang}">${esc(t('ls.back'))}</a></p>
<div id="rv" aria-live="polite"></div>
<script>(function(){var C=${json(cards)},U=${json(ui)},K='lessons.review.${pub ? 'pub' : 'priv'}',DAY=864e5,NEW=5,box=document.getElementById('rv');
function load(){try{return JSON.parse(localStorage.getItem(K))||{}}catch(e){return {}}}
function save(s){try{localStorage.setItem(K,JSON.stringify(s))}catch(e){}}
var S=load(),now=Date.now(),today=new Date(now).toISOString().slice(0,10);
function queue(){var due=[],fresh=[];C.forEach(function(c){var r=S[c.id];if(!r)fresh.push(c);else if(r.due<=now)due.push(c)});
var taken=S._day===today?(S._new||0):0;return due.concat(fresh.slice(0,Math.max(0,NEW-taken)))}
function el(tag,txt,cls){var e=document.createElement(tag);if(txt!=null)e.textContent=txt;if(cls)e.className=cls;return e}
function draw(){var q=queue();box.textContent='';
if(!q.length){box.appendChild(el('p',U.done));var b=el('button',U.reset);b.onclick=function(){S={};save(S);draw()};box.appendChild(b);return}
var c=q[0],card=el('div',null,'cd');card.appendChild(el('p',U.left.replace('{n}',q.length),'tg'));card.appendChild(el('h2',c.t));card.appendChild(el('p',U.q,'nt'));box.appendChild(card);
var row=el('div',null,'row');card.appendChild(row);var show=el('button',U.show,'go');row.appendChild(show);
show.onclick=function(){show.remove();card.appendChild(el('p',c.l));if(c.w){var w=el('p',null);w.appendChild(el('b',U.why+' '));w.appendChild(document.createTextNode(c.w));card.appendChild(w)}
var r2=el('div',null,'row');var again=el('button',U.again),know=el('button',U.know,'go');r2.appendChild(again);r2.appendChild(know);card.appendChild(r2);
var wasNew=!S[c.id];
function grade(ok){var r=S[c.id]||{box:0};r.box=ok?Math.min(5,r.box+(wasNew?0:1)):0;r.due=now+Math.pow(2,r.box)*DAY;S[c.id]=r;if(wasNew){S._new=(S._day===today?(S._new||0):0)+1;S._day=today}save(S);draw()}
again.onclick=function(){grade(false)};know.onclick=function(){grade(true)}}}
draw()})()</script>
${pageFoot(t, url)}
</main>${menuScript(base)}</body></html>`
}

/** The way in for someone new: the lessons by level, the basic ones first, each with its why. */
export function startPage({ lang, base, url, data, pub = false }) {
  const pre = pub ? '/learned' : '/lessons'
  const t = words(lang), v = visible(data), title = `${t('ls.start.h')} · CKB Pulse`
  const order = ['basic', 'working', 'advanced']
  const by = Object.fromEntries(order.map((x) => [x, v.lessons.filter((l) => l.level === x).sort((a, b) => (b.sources.length - a.sources.length) || a.title.localeCompare(b.title))]))
  const none = v.lessons.filter((l) => !l.level).length
  return `${head(t, { lang, base, title, desc: t('ls.start.p'), pub, canonical: pub ? `${base}/learned/start` : '' })}
${pageBar(t, { base, lang, current: '', here: `${pre}/start` })}
${pageHead({ crumbs: crumbs(t, { base, lang, trail: [[t('ls.nav'), pre], [t('ls.start.nav'), null]] }), eyebrow: t('ls.nav'), title: t('ls.start.h'), lede: esc(t('ls.start.p')) })}
<p><a href="${esc(base)}${pre}?lang=${lang}">${esc(t('ls.back'))}</a> · <a href="${esc(base)}${pre}/glossary?lang=${lang}">${esc(t('ls.gloss.link'))}</a> · <a href="${esc(base)}${pre}/review?lang=${lang}">${esc(t('ls.rev.link'))}</a></p>
${order.map((x) => by[x].length ? `<section class="lt" id="${x}"><h2>${esc(t('ls.level.' + x))} <span class="tg">${by[x].length}</span></h2><p>${esc(t('ls.start.' + x))}</p>
${by[x].slice(0, x === 'basic' ? 40 : 25).map((l) => `<article class="ln"><h3><a href="${esc(href(base, l.id, lang, pre))}">${esc(l.title)}</a></h3><p>${esc(l.lesson)}</p>${l.why ? `<p class="nt">${esc(t('ls.why'))} ${esc(l.why)}</p>` : ''}</article>`).join('\n')}
<p><a href="${esc(base)}${pre}?level=${x}&amp;lang=${lang}">${esc(t('ls.start.all', { n: by[x].length }))}</a></p></section>` : '').join('\n')}
${none ? `<p class="tg">${esc(t('ls.start.unlevelled', { n: none }))}</p>` : ''}
${pageFoot(t, url)}
</main>${menuScript(base)}</body></html>`
}

const xml = (x) => String(x ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c])
const DAY = /^\d{4}-\d{2}-\d{2}$/
/** What happened to the lessons, newest first: a lesson new or changed, one a maintainer confirmed, one a public test reproduces.
 * The proof is read the same way the page reads it (a pattern for every field), and an event with no date is not one. */
export function lessonEvents(data) {
  const v = visible(data), out = []
  for (const l of v.lessons) {
    if (DAY.test(String(l.last_touched))) out.push({ at: l.last_touched, kind: 'changed', l })
    const c = l.confirmed && LOGIN_OK.test(String(l.confirmed.by || '')) && ['owner', 'author', 'member'].includes(l.confirmed.role) && DAY.test(String(l.confirmed.date)) ? l.confirmed : null
    if (c) out.push({ at: c.date, kind: 'confirmed', l, c, own: byOwn(l) })
    const r = reproduced(l)
    if (r && DAY.test(String(r.date))) out.push({ at: r.date, kind: 'reproduced', l, r })
  }
  const rank = { reproduced: 0, confirmed: 1, changed: 2 }
  return out.sort((x, y) => y.at.localeCompare(x.at) || rank[x.kind] - rank[y.kind] || x.l.id.localeCompare(y.l.id))
}
/** An Atom feed of what happened to the lessons: the newest changes, and every confirmation and reproduction, each its own entry
 * (a subscriber is told when a lesson earns its proof, not only when its text changes). */
export function lessonsFeed({ base, data, n = 60 }) {
  const events = lessonEvents(data).slice(0, n)
  const updated = `${events[0]?.at || '2026-11-19'}T00:00:00Z`
  const url = (l) => `${xml(base)}/learned/${xml(l.id)}`
  const entry = ({ at, kind, l, c, r, own }) => {
    const title = kind === 'confirmed' ? (own ? `Checked by the owner (@${c.by}): ${l.title}` : `Confirmed by @${c.by}: ${l.title}`) : kind === 'reproduced' ? `Reproduced by a test: ${l.title}` : l.title
    const id = kind === 'changed' ? url(l) : `${url(l)}#${kind}-${at}`
    const said = kind === 'confirmed' ? `${own ? 'Checked' : 'Confirmed'} by @${c.by}${own ? ', who also publishes these lessons' : ''}, ${c.role === 'owner' ? 'who owns' : c.role === 'author' ? 'who wrote' : 'who is a public member of the organisation that owns'} a source of this lesson. ${l.lesson}`
      : kind === 'reproduced' ? `${r.covers === 'all' ? 'A public test runs this lesson' : `A public test runs a part of this lesson (${r.covers.slice(6)})`} on ${r.library} ${r.version}: https://github.com/${r.repo}/blob/${r.commit}/${r.test}. ${l.lesson}`
        : l.lesson
    return `<entry><title>${xml(title)}</title><id>${id}</id><link href="${url(l)}"/><updated>${at}T00:00:00Z</updated><summary>${xml(said)}</summary></entry>`
  }
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>CKB lessons</title><subtitle>What CKB projects learned, each lesson checked against the commit it came from, and when one is confirmed by a maintainer or reproduced by a public test. CC BY 4.0.</subtitle><id>${xml(base)}/learned</id><link href="${xml(base)}/learned"/><link rel="self" href="${xml(base)}/learned.xml"/><updated>${updated}</updated>
${events.map(entry).join('\n')}
</feed>
`
}

// ---------------------------------------------------------------- the same for programs: JSON and MCP
const brief = (base, at = '/lessons') => (l) => ({ id: l.id, title: l.title, lesson: l.lesson, area: l.area, concepts: l.concepts, status: l.status, evidence: l.evidence, ...(l.checked ? { checked: l.checked } : {}), last_touched: l.last_touched, url: `${base}${at}/${l.id}` })
const full = (base, at = '/lessons') => (l) => ({ ...l, url: `${base}${at}/${l.id}` })
const int = (v, lo, hi, d) => { const n = Number.parseInt(v, 10); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d }

/** GET /lessons/api: ?id= one lesson in full, else a search (?q= ?area= ?repo= ?limit=), briefly. */
export function lessonsApi(data, url, base) {
  const v = visible(data), q = url.searchParams
  const id = q.get('id')
  if (id) {
    const l = v.lessons.find((x) => x.id === id)
    return l ? { status: 200, json: full(base)(l) } : { status: 404, json: { error: 'no such lesson' } }
  }
  const found = searchLessons(v.lessons, { q: (q.get('q') || '').slice(0, 200), area: (q.get('area') || '').slice(0, 40), repo: (q.get('repo') || '').slice(0, 200), concept: (q.get('concept') || '').slice(0, 80), level: (q.get('level') || '').slice(0, 10), evidence: (q.get('evidence') || '').slice(0, 4), sort: (q.get('sort') || '').slice(0, 5), limit: 400 })
  const limit = int(q.get('limit'), 1, 200, 50), offset = int(q.get('offset'), 0, 400, 0)
  return { status: 200, json: { from: v.from, to: v.to, read: v.read, areas: v.areas, count: found.length, offset, ...(offset + limit < found.length ? { nextOffset: offset + limit } : {}), lessons: found.slice(offset, offset + limit).map(brief(base)) } }
}

const told = (message) => Object.assign(new Error(message), { told: true })
const text = (v, name, max = 200) => { if (v === undefined || v === null || v === '') return ''; if (typeof v !== 'string' || v.length > max) throw told(`${name} must be text of at most ${max} characters`); return v.trim() }
const TOOLS = [
  {
    name: 'search_lessons',
    description: 'Search what CKB projects learned from their own fixes: pitfalls, bugs and protocol rules, each with the commits it came from. Every word of the query must match (words like "how" and "the" are left out). Use it before writing CKB code that builds transactions, handles witnesses, locks, Fiber channels or indexer queries. count is how many lessons match, not how many came back: when nextOffset is present, call again with it as offset. evidence keeps one level of proof: L3 reproduced by a public test, L2 confirmed by someone who maintains the project and is not the publisher, OWN checked by the owner who is also the publisher, L1 seen in two or more projects, L0 one fix checked against its commit; best is L2 and L3.',
    inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'words, e.g. "witness lock args"' }, area: { type: 'string', description: 'an area id from list_areas' }, evidence: { type: 'string', enum: ['L0', 'L1', 'L2', 'L3', 'OWN', 'best'], description: 'keep only lessons with this proof' }, limit: { type: 'integer', minimum: 1, maximum: 50 }, offset: { type: 'integer', minimum: 0, description: 'skip this many matches (the nextOffset of the last answer)' } } },
    run: (a, { data, base, at }) => {
      const v = visible(data()), limit = Number.isInteger(a.limit) ? Math.min(50, Math.max(1, a.limit)) : 10, offset = Number.isInteger(a.offset) ? Math.max(0, a.offset) : 0
      const found = searchLessons(v.lessons, { q: text(a.query, 'query'), area: text(a.area, 'area', 40), evidence: text(a.evidence, 'evidence', 4), limit: 400 })
      return { count: found.length, offset, ...(offset + limit < found.length ? { nextOffset: offset + limit } : {}), ...(found.length ? {} : { hint: 'No lesson has every word. Try fewer or different words, or an area from list_areas.' }), lessons: found.slice(offset, offset + limit).map(brief(base, at)) }
    },
  },
  {
    name: 'get_lesson',
    description: 'One lesson in full: the rule, the code pattern, its sources (repository, commit, date), related lessons, how sure it is (evidence L0 read by a model, L1 seen in two or more projects, L2 confirmed by a maintainer, L3 reproduced by a test) and its history.',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'area/slug, from search_lessons' } }, required: ['id'] },
    run: (a, { data, base, at }) => { const id = text(a.id, 'id', 130); if (!ID.test(id)) throw told('id must be area/slug, as search_lessons gives it'); const l = visible(data()).lessons.find((x) => x.id === id); if (!l) throw told(`no lesson ${id}`); return full(base, at)(l) },
  },
  {
    name: 'lessons_from_project',
    description: 'The lessons that came from one project\'s commits, newest first.',
    inputSchema: { type: 'object', properties: { repo: { type: 'string', description: 'owner/repo on GitHub' } }, required: ['repo'] },
    run: (a, { data, base, at }) => { const repo = text(a.repo, 'repo'); if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw told('repo must be owner/repo'); const found = searchLessons(visible(data()).lessons, { repo, limit: 50 }); return { count: found.length, lessons: found.map(brief(base, at)) } },
  },
  {
    name: 'check_code',
    description: 'Check CKB code against the lessons. Paste the code (TypeScript, Rust, Go, Python, any language): it returns the lessons about the functions, RPC methods and constants the code uses, best match first, and marks code that repeats a pattern a lesson says to avoid. Hints to read, not proof: nothing is run, and the code is not stored. Use it after writing code that builds, signs or reads CKB transactions.',
    inputSchema: { type: 'object', properties: { code: { type: 'string', description: 'the code, up to 30,000 characters' }, limit: { type: 'integer', minimum: 1, maximum: 20 } }, required: ['code'] },
    run: (a, { data, base, at }) => { const code = text(a.code, 'code', 30000); if (!code) throw told('code is empty'); const found = checkCode(visible(data()).lessons, stripComments(code), Number.isInteger(a.limit) ? Math.min(20, Math.max(1, a.limit)) : 8); return { about: 'Lessons that apply to what this code uses. Read each one and its source before changing anything.', count: found.length, lessons: found.map(({ score, ...x }) => ({ ...x, url: `${base}${at || '/lessons'}/${x.id}` })) } },
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
/** The same lesson tools for the public MCP server (/mcp), over the released lessons only, with links to /learned. data() gives
 * public-lessons.json as it is now; with no file there are no lessons and the tools say so. */
export const publicLessonTools = (data) => TOOLS.map((t) => ({
  ...t,
  description: t.name === 'get_lesson'
    ? 'One released lesson in full: the rule, the code pattern, its sources (repository, commit, date), the test files its commits changed, related lessons, and how it was checked (checked: date, verdict, against_commit, and problem when the verdict is not right), and the section of the official documentation on the same subject when one was found (official: relation "agrees" with the section\'s own sentence as quote, or "topic only" when the section is the reference for the subject without the lesson\'s point; repo, path, line, url). Licence CC BY 4.0.'
    : t.description,
  run: (a, ctx) => t.run(a, { data, base: ctx.base, at: '/learned' }),
}))
/** What a CKB project pastes into its AGENTS.md or CLAUDE.md so its agent reads and checks the lessons by itself. */
export const agentRule = (base) => `## CKB lessons
This project builds on Nervos CKB. The CKB Pulse MCP server (${base}/mcp) holds lessons from real fixes in other CKB projects.
- Before writing or changing code that builds, signs or reads CKB transactions, scripts, witnesses, since values, capacity or indexer queries, call search_lessons with the functions involved and read the lessons that match with get_lesson.
- After writing that code, call check_code with it and go through every lesson it returns before you finish.
- Each lesson links to the commit it came from. When a lesson and the current library docs disagree, follow the docs and say so.
Setup in Claude Code: claude mcp add --transport http ckb-pulse ${base}/mcp`
export const LESSON_TOOL_INFO = publicLessonTools(() => null).map(({ name, description }) => ({ name, description }))
export const PUBLIC_LESSONS_NOTE = 'CKB lessons: what CKB projects learned from their own fixes, drawn from their public commits and checked against those commits and the project code today. Read the source before relying on one. CC BY 4.0. Start with search_lessons, then get_lesson.'
/** The private MCP server: data() gives the export as it is now. */
export const lessonsMcp = (data) => rpcServer({ tools: TOOLS, info: { name: 'ckb-lessons', title: 'CKB lessons', version: '1.0.0' }, instructions: INSTRUCTIONS, ctx: (base) => ({ data, base }) })
