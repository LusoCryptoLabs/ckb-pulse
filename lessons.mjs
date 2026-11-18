// What the ecosystem learned in one week, by topic: each lesson read from public commits by a model, repeated ones
// merged, every lesson linked to the commits it came from. Unlisted on purpose (no menu entry) until it is reviewed.
// The data is lessons-data.mjs, made outside the server; nothing here calls a model.
import { words } from './cards.mjs'
import { CSS, maker, pageBar, menuHead, menuScript, pageHead } from './digest.mjs'
import { isOptedOut } from './config.mjs'
import { LESSONS } from './lessons-data.mjs'

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const PAGE_CSS = `nav.ls{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 18px}nav.ls a{padding:5px 11px;border-radius:999px;border:1px solid #36322a;color:#d8d2c4;text-decoration:none;font-size:13px}nav.ls a span{color:#8f887a;margin-left:6px}
section.lt{margin:22px 0 8px}section.lt h2{margin:0 0 4px;font:600 21px var(--font-ui,sans-serif);color:#f0ece2;text-transform:none;letter-spacing:-.01em}section.lt>p{margin:4px 0 10px;color:#b9b2a4}
article.ln{background:#14120e;border:1px solid #36322a;border-radius:16px;padding:12px 16px;margin:8px 0;overflow-wrap:anywhere;min-width:0}section.lt{overflow-wrap:anywhere}article.ln h3{margin:0 0 4px;font:600 16px var(--font-ui,sans-serif);color:#f0ece2}article.ln p{margin:4px 0}
article.ln.old{opacity:.7}.ln .tg{font-size:12px;color:#8f887a}.ln .nt{font-size:13px;color:#e0a73a}.ln .bd{font-size:11px;padding:2px 7px;border-radius:999px;background:#2a2619;color:#e0a73a;margin-left:6px;vertical-align:middle}
.ln details{margin-top:4px}.ln summary{cursor:pointer;font-size:13px;color:#8f887a}.ln li{font-size:13px;overflow-wrap:anywhere}.ln li a{color:#cbf34d}`

/** The lessons with sources from people who asked to leave taken out; a lesson left with no source goes too. */
export function shownLessons(data = LESSONS) {
  const topics = []
  for (const t of data.topics) {
    const lessons = []
    for (const l of t.lessons) {
      const sources = l.sources.filter((s) => !isOptedOut(s.repo.split('/')[0]))
      if (sources.length) lessons.push({ ...l, sources })
    }
    if (lessons.length) topics.push({ ...t, lessons })
  }
  return topics
}

export function lessonsPage({ lang, base, url, data = LESSONS }) {
  const t = words(lang), title = `CKB Pulse · ${t('ls.title')}`, desc = t('ls.lead')
  const topics = shownLessons(data)
  const count = topics.reduce((n, x) => n + x.lessons.length, 0)
  return `<!doctype html><html lang="${lang === 'zh' ? 'zh-CN' : lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}"><meta name="robots" content="noindex"><meta property="og:type" content="website"><meta property="og:site_name" content="CKB Pulse"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(url)}">
<link rel="icon" href="${esc(base)}/icon-192.png">${menuHead(base)}<style>${CSS}${PAGE_CSS}</style></head><body><main>
${pageBar(t, { base, lang, current: '', here: '/lessons' })}
${pageHead({ eyebrow: t('ls.nav'), title: t('ls.h1'), lede: esc(desc) })}
<p>${esc(t('ls.week', { from: data.from, to: data.to, read: data.read, lessons: count }))}</p>
<nav class="ls" aria-label="${esc(t('ls.topics'))}">${topics.map((x) => `<a href="#${slug(x.area)}">${esc(x.area)}<span>${x.lessons.length}</span></a>`).join('')}</nav>
${topics.map((x) => `<section class="lt" id="${slug(x.area)}"><h2>${esc(x.area)}</h2><p>${esc(x.summary)}</p>
${x.lessons.map((l) => `<article class="ln${l.status === 'superseded' ? ' old' : ''}"><h3>${esc(l.title)}${l.status === 'superseded' ? `<span class="bd">${esc(t('ls.old'))}</span>` : ''}</h3><p>${esc(l.lesson)}</p>${l.note ? `<p class="nt">${esc(l.note)}</p>` : ''}
<p class="tg">${l.concepts.map((c) => `#${esc(c)}`).join(' ')}</p>
<details><summary>${esc(t('ls.sources', { n: l.sources.length }))}</summary><ul>${l.sources.map((s) => `<li><a href="https://github.com/${esc(s.repo)}/commit/${esc(s.hash)}" rel="noreferrer">${esc(s.repo)}</a>: ${esc(s.subject)}</li>`).join('')}</ul></details></article>`).join('\n')}</section>`).join('\n')}
<p class="tg">${esc(t('ls.how'))}</p>
<footer>${maker(t)}
<p class="langs no-print">${['en', 'zh', 'pt'].map((l) => `<a href="${esc(url)}?lang=${l}" lang="${l === 'zh' ? 'zh-CN' : l}">${{ en: 'English', zh: '中文', pt: 'Português' }[l]}</a>`).join('')}</p></footer>
</main>${menuScript(base)}</body></html>`
}
