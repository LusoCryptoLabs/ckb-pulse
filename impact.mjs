// Who builds on what: which of the projects Pulse follows depend on a CKB library, read from each project's own public
// package.json (or Cargo.toml for a Rust crate) at its root, once or twice a day. It shows the reach of a library to the
// people who maintain it. Nothing is asked of anyone and only public files are read; a project whose owner asked to
// leave is not listed. The counts begin on the first scan, so a trend only shows after a few weeks.
import fs from 'node:fs'
import path from 'node:path'
import { words } from './cards.mjs'
import { CSS, maker, langLinks, pageBar, menuHead, menuScript, pageHead } from './digest.mjs'
import { isOptedOut } from './config.mjs'
import { today } from './public/menu.js'

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const short = (name) => String(name || '').split('/').pop()
const DAY = 864e5

// a library is the package names that mean "this project uses it", in package.json (npm) or Cargo.toml (cargo)
export const LIBS = [
  { id: 'ccc', name: 'CCC', npm: /^@ckb-ccc\//, home: 'https://github.com/ckb-devrel/ccc' },
  { id: 'lumos', name: 'Lumos', npm: /^@ckb-lumos\//, home: 'https://github.com/ckb-js/lumos' },
  { id: 'spore', name: 'Spore SDK', npm: /^@spore-sdk\//, home: 'https://github.com/sporeprotocol/spore-sdk' },
  { id: 'ckb-std', name: 'ckb-std', cargo: /^ckb-std$/, home: 'https://github.com/nervosnetwork/ckb-std' },
]
export const libOf = (id) => LIBS.find((l) => l.id === id) || LIBS[0]

/** The names a package.json depends on. */
export function npmDeps(text) {
  try {
    const j = JSON.parse(text)
    return ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'].flatMap((k) => Object.keys(j?.[k] && typeof j[k] === 'object' ? j[k] : {}))
  } catch { return [] }
}
/** The crate names a Cargo.toml depends on: the keys under any table whose name ends in "dependencies". */
export function cargoDeps(text) {
  const out = []
  let inDeps = false
  for (const line of String(text).split(/\r?\n/)) {
    const head = line.match(/^\s*\[([^\]]+)\]\s*$/)
    if (head) { inDeps = /dependencies$/.test(head[1].trim()); continue }
    if (!inDeps) continue
    const m = line.match(/^\s*([A-Za-z0-9_-]+)\s*(?:=|\.)/)
    if (m) out.push(m[1])
  }
  return out
}
/** The ids of the libraries a list of dependency names matches, by manifest kind. */
export const matching = (kind, names) => LIBS.filter((l) => l[kind] && names.some((n) => l[kind].test(n))).map((l) => l.id)

/** The text of a public file; null only for a 404 (the project has no such file). Any other failure throws, so a rate limit or an outage never reads as "uses nothing". */
export const fetchText = async (url) => {
  const res = await fetch(url, { headers: { 'user-agent': 'ckb-pulse-impact' }, signal: AbortSignal.timeout(10e3) })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`${url}: ${res.status}`)
  return res.text()
}

/**
 * Reads the root manifests of the given projects and says which use which library. A manifest that cannot be read
 * (an error, not a 404) leaves its project out of this scan rather than counting it as a non-user.
 * repos: [{ name: 'owner/repo', lang, group, pushedAt }]
 */
export async function scan(repos, { get = fetchText, concurrency = 6, now = Date.now() } = {}) {
  const libs = Object.fromEntries(LIBS.map((l) => [l.id, []]))
  let scanned = 0
  const queue = repos.filter((r) => !isOptedOut(String(r.name).split('/')[0]))
  const work = async () => {
    for (let r = queue.shift(); r; r = queue.shift()) {
      try {
        const kinds = r.lang === 'Rust' ? ['Cargo.toml'] : r.lang ? ['package.json'] : ['package.json', 'Cargo.toml']
        const ids = new Set()
        for (const file of kinds) {
          const text = await get(`https://raw.githubusercontent.com/${r.name}/HEAD/${file}`)
          if (text == null) continue
          for (const id of matching(file === 'package.json' ? 'npm' : 'cargo', file === 'package.json' ? npmDeps(text) : cargoDeps(text))) ids.add(id)
        }
        scanned++
        for (const id of ids) libs[id].push({ repo: r.name, group: r.group || '', pushedAt: r.pushedAt || '' })
      } catch { /* left out of this scan */ }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, work))
  for (const l of Object.values(libs)) l.sort((a, b) => b.pushedAt.localeCompare(a.pushedAt) || a.repo.localeCompare(b.repo))
  return { at: now, scanned, total: repos.length, libs }
}

let file = '', DATA = null
export function loadImpact(dir) {
  file = path.join(dir, 'impact.json')
  try { DATA = JSON.parse(fs.readFileSync(file, 'utf8')) } catch { DATA = null }
  return DATA
}
export const impactNow = () => DATA
/** Keeps a scan, and one count per library per day, a year of them. */
export function keepScan(prev, result, day = new Date(result.at).toISOString().slice(0, 10)) {
  const series = (prev?.series || []).filter((s) => s.d !== day)
  series.push({ d: day, ...Object.fromEntries(LIBS.map((l) => [l.id, result.libs[l.id].length])) })
  return { ...result, series: series.slice(-366) }
}
const save = () => { const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(DATA)); fs.renameSync(tmp, file) }

/** Scans at the start if the last scan is over twelve hours old, then checks every hour. */
export function startImpact({ repos, dir }) {
  loadImpact(dir)
  const tick = async () => {
    if (DATA && Date.now() - DATA.at < 12 * 3600e3) return
    const list = repos().map((r) => ({ name: r.name, lang: r.lang, group: r.group, pushedAt: r.pushedAt }))
    if (!list.length) return
    const result = await scan(list)
    if (result.scanned < list.length * 0.5) return console.warn(`impact: only ${result.scanned} of ${list.length} manifests could be read, scan not kept`)
    DATA = keepScan(DATA, result); save()
    console.log(`impact: ${result.scanned} projects scanned, ${LIBS.map((l) => `${l.id} ${result.libs[l.id].length}`).join(', ')}`)
  }
  setInterval(() => tick().catch((err) => console.warn('impact', err.message)), 3600e3).unref()
  setTimeout(() => tick().catch((err) => console.warn('impact', err.message)), 90e3).unref()
}

/** What a library's page and API say: its projects, the ones with work in the last 30 days, and the counts. */
export function impactOf(data, id, now = Date.now()) {
  const lib = libOf(id)
  if (!data) return null
  const all = (data.libs?.[lib.id] || []).filter((p) => !isOptedOut(p.repo.split('/')[0]))
  const active = all.filter((p) => p.pushedAt && now - Date.parse(p.pushedAt) < 30 * DAY)
  return { lib: lib.id, name: lib.name, at: data.at, scanned: data.scanned, total: data.total, using: all.length, active: active.length, owners: new Set(all.map((p) => p.repo.split('/')[0].toLowerCase())).size, projects: all, trend: (data.series || []).map((s) => ({ d: s.d, n: s[lib.id] ?? 0 })) }
}

const ago = (t, iso, now) => {
  const d = Math.floor((now - Date.parse(iso)) / DAY)
  return !iso || Number.isNaN(d) ? '' : d < 1 ? t('im.today') : d === 1 ? t('im.yesterday') : t('im.ago', { n: d })
}

export function impactPage({ lang, base, url, lib: id, data, now = Date.now() }) {
  const t = words(lang), lib = libOf(id), r = impactOf(data, lib.id, now)
  const title = `CKB Pulse · ${t('im.title')} · ${lib.name}`, desc = t('im.lead')
  const q = (l) => `${base}/impact?lib=${l}&lang=${lang}`
  const chips = `<nav class="p" aria-label="${esc(t('im.libs'))}">${LIBS.map((l) => (l.id === lib.id ? `<b>${esc(l.name)}</b>` : `<a href="${esc(q(l.id))}">${esc(l.name)}</a>`)).join('')}</nav>`
  const row = (p) => `<li><span><a href="${esc(`${base}/?repo=${encodeURIComponent(p.repo)}&lang=${lang}`)}">${esc(short(p.repo))}</a><small>${esc(p.repo.split('/')[0])}</small></span><b>${esc(ago(t, p.pushedAt, now))}</b></li>`
  const list = (heading, rows) => rows.length ? `<section><h2>${esc(heading)}</h2><ol>${rows.slice(0, 100).map(row).join('')}</ol>${rows.length > 100 ? `<p class="sub">${esc(t('im.more', { n: rows.length - 100 }))}</p>` : ''}</section>` : ''
  let body
  if (!r) body = `<p>${esc(t('im.wait'))}</p>`
  else {
    const active = r.projects.filter((p) => p.pushedAt && now - Date.parse(p.pushedAt) < 30 * DAY), quiet = r.projects.filter((p) => !active.includes(p))
    const max = Math.max(1, ...r.trend.map((s) => s.n))
    const plain = r.using ? esc(t(r.using === 1 ? 'im.plain.1' : 'im.plain', { n: r.using, total: r.scanned, lib: lib.name, active: r.active })) : esc(t('im.none', { lib: lib.name }))
    body = `<p class="lede plain">${plain}</p>
<div class="kpis"><div><b>${r.using}</b><span>${esc(t('im.k.using'))}</span></div><div><b>${r.active}</b><span>${esc(t('im.k.active'))}</span></div><div><b>${r.owners}</b><span>${esc(t('im.k.owners'))}</span></div></div>
${r.trend.length >= 3 ? `<section><h2>${esc(t('im.trend'))}</h2><div class="bars" role="img" aria-label="${esc(t('im.trend'))}">${r.trend.map((s) => `<i title="${esc(s.d)}: ${s.n}" style="height:${Math.max(3, Math.round((s.n / max) * 100))}%"></i>`).join('')}</div></section>` : `<p class="sub">${esc(t('im.trend.wait', { date: new Date(r.trend[0]?.d || r.at).toLocaleDateString(t('locale'), { dateStyle: 'long', timeZone: 'UTC' }) }))}</p>`}
${list(t('im.active'), active)}${list(t('im.quiet'), quiet)}
<p class="sub">${esc(t('im.how', { date: new Date(r.at).toLocaleDateString(t('locale'), { dateStyle: 'long', timeZone: 'UTC' }) }))}</p>`
  }
  return `<!doctype html><html lang="${lang === 'zh' ? 'zh-CN' : lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}"><meta property="og:type" content="website"><meta property="og:site_name" content="CKB Pulse"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(url)}">
<link rel="icon" href="${esc(base)}/icon-192.png">${menuHead(base)}<style>${CSS}ol li small{display:inline;margin-left:8px}nav.p{margin-bottom:20px}p.plain{font-size:19px;color:var(--fg);max-width:60ch;margin:0 0 18px}</style></head><body><main>
${pageBar(t, { base, lang, current: '', here: `/impact?lib=${lib.id}`, share: { url: `${base}/impact?lib=${lib.id}&lang=${lang}&d=${today()}`, title } })}
${pageHead({ eyebrow: t('im.nav'), title: t('im.h1', { lib: lib.name }), lede: esc(desc) })}
${chips}
${body}
<footer>${maker(t)}
${langLinks((l) => `${base}/impact?lib=${lib.id}&lang=${l}`)}</footer>
</main>${menuScript(base)}</body></html>`
}
