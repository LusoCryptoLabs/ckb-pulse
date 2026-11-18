// The page a first visit lands on at / when it comes without a link to something: what Pulse is in a sentence, the last
// day in three numbers, one way into the live view, and the other doors, for everyone and for developers. A visit that
// came with a link to a project, a person, a period or a tab goes straight to the live view (server.mjs), and so does
// any browser that has seen the welcome card before (the script below, which runs before anything is drawn).
import { words } from './cards.mjs'
import { CSS, maker, langLinks, pageBar, menuHead, menuScript, pageHead } from './digest.mjs'
import { today } from './public/menu.js'

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const cap = (s) => (s ? s.charAt(0).toLocaleUpperCase() + s.slice(1) : s)

// a browser that has seen the welcome card skips this page, with its language and the rest of its query; ?landing=1
// keeps it here (the name in the bar of every page links to it)
export const SKIP_SCRIPT = `<script>try{if(!/[?&]landing=/.test(location.search)&&localStorage.getItem('ckbpulse.seen'))location.replace('live'+location.search+location.hash)}catch(e){}</script>`

const PAGE_CSS = `.go{display:flex;flex-wrap:wrap;gap:10px;margin:22px 0 6px}.go a{display:inline-block;padding:13px 22px;border-radius:999px;background:var(--lime);color:var(--ink);font-weight:700;text-decoration:none;font-size:16px}.go a.alt{background:none;color:var(--fg);border:1px solid var(--mut)}
p.plain{font-size:19px;color:var(--fg);max-width:60ch;margin:22px 0 0}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
a.card{display:block;background:var(--surface);border:1px solid var(--edge);border-radius:20px;padding:16px 18px;text-decoration:none;color:var(--fg)}a.card:hover{border-color:var(--lime)}a.card b{display:block;font-size:18px;margin-bottom:4px;color:var(--fg)}a.card span{color:var(--mut);font-size:14px;line-height:1.45}
.made{margin-top:44px;border-top:1px solid var(--edge-soft);padding-top:22px;color:var(--mut);max-width:60ch}.made img.on-light{display:none}.made img{display:block;width:220px;height:auto;margin:0 0 12px}.made a{color:var(--lime)}
html[data-theme="lcl-light"] .made img.on-dark{display:none}html[data-theme="lcl-light"] .made img.on-light{display:block}
.made+footer{margin-top:22px}`

// [id, path, title word, line word]: the doors, by who they are for
const DOORS = {
  all: [['live', '/live', 'm.live', 'ld.c.live'], ['digest', '/digest?p=week', 'm.digest', 'ld.c.digest'], ['screen', '/?screen=1', 'm.screen', 'ld.c.screen'], ['add', '/?tab=suggest', 'm.add', 'ld.c.add']],
  dev: [['impact', '/impact', 'm.impact', 'ld.c.impact'], ['badge', '/use#badge', 'm.badge', 'ld.c.badge'], ['data', '/use#data', 'm.ai', 'ld.c.data'], ['method', '/method', 'me.nav', 'ld.c.method']],
}
const withLang = (base, path, lang) => { const [p, h] = path.split('#'); return `${base}${p}${p.includes('?') ? '&' : '?'}lang=${lang}${h ? `#${h}` : ''}` }

export function landingPage({ lang, base, url, stats = null, img = '' }) {
  const t = words(lang), title = 'CKB Pulse', desc = t('ld.lead')
  const plain = stats?.updates ? `<p class="plain">${esc(cap(t('ld.plain', { people: t.cnt('ppl', stats.people), projects: t.cnt('prj', stats.projects), updates: t.cnt('upd', stats.updates) })))}</p>` : ''
  const kpis = stats?.updates ? `<div class="kpis"><div><b>${stats.updates}</b><span>${esc(t('k.updates'))}</span></div><div><b>${stats.people}</b><span>${esc(t('k.people'))}</span></div><div><b>${stats.projects}</b><span>${esc(t('k.projects'))}</span></div></div>` : ''
  const group = (g) => `<h2>${esc(t('use.group.' + g))}</h2><div class="cards">${DOORS[g].map(([id, path, k, line]) => `<a class="card" id="d-${id}" href="${esc(withLang(base, path, lang))}"><b>${esc(t(k))}</b><span>${esc(t(line))}</span></a>`).join('')}</div>`
  return `<!doctype html><html lang="${lang === 'zh' ? 'zh-CN' : lang}"><head><meta charset="utf-8">${SKIP_SCRIPT}<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}"><meta property="og:type" content="website"><meta property="og:site_name" content="CKB Pulse"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(url)}">${img ? `<meta property="og:image" content="${esc(img)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${esc(img)}">` : ''}
<link rel="icon" href="${esc(base)}/icon-192.png">${menuHead(base)}<style>${CSS}${PAGE_CSS}</style></head><body><main>
${pageBar(t, { base, lang, current: '', here: '/?landing=1', share: { url: `${base}/?lang=${lang}&d=${today()}`, title, image: img || undefined } })}
${pageHead({ eyebrow: t('ld.eyebrow'), title: t('ld.h1'), lede: esc(desc) })}
<p class="go"><a href="${esc(withLang(base, '/live', lang))}">${esc(t('ld.cta'))}</a><a class="alt" href="${esc(withLang(base, '/digest?p=week', lang))}">${esc(t('m.digest'))}</a></p>
${plain}${kpis}
${group('all')}
${group('dev')}
<div class="made"><img class="on-dark" src="${esc(base)}/lcl-wordmark-paper.svg" alt="" width="220" height="17"><img class="on-light" src="${esc(base)}/lcl-wordmark.svg" alt="" width="220" height="17"><p>${esc(t('ld.made'))} <a href="https://lusocryptolabs.com">lusocryptolabs.com</a></p></div>
<footer>${maker(t)}
${langLinks((l) => `${base}/?lang=${l}&landing=1`)}</footer>
</main>${menuScript(base)}</body></html>`
}
