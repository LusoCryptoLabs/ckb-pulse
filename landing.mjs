// The page a first visit lands on at / when it comes without a link to something: what Pulse is in a sentence, the last
// day in three numbers, one way into the live view, and the other doors, for everyone and for developers. A visit that
// came with a link to a project, a person, a period or a tab goes straight to the live view (server.mjs), and so does
// any browser that has seen the welcome card before (the script below, which runs before anything is drawn).
import { words } from './cards.mjs'
import { CSS, maker, langLinks, pageBar, menuHead, menuScript, pageHead } from './digest.mjs'
import { today } from './public/menu.js'
import { MIGRATE_SCRIPT } from './migrate.mjs'

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const cap = (s) => (s ? s.charAt(0).toLocaleUpperCase() + s.slice(1) : s)

// how long ago, in words of the page's language (the live page says it the same way, in public/pulse3d.js)
export function agoText(t, ms) {
  const s = Math.max(0, ms) / 1000
  if (s < 60) return t('ago.now')
  if (s < 3600) return t('ago.min', { n: Math.floor(s / 60) })
  if (s < 86400) return t('ago.h', { n: Math.floor(s / 3600) })
  const d = Math.floor(s / 86400)
  return d === 1 ? t('ago.day') : t('ago.days', { n: d })
}
// the line under the picture: when the last update was, and what it was. e is {at, actor, kind, repo} or nothing
export function lastLine(t, e, now = Date.now()) {
  if (!e?.at) return t('ld.last.none')
  const what = `${e.actor} ${t('v.' + e.kind, { repo: String(e.repo).split('/').pop() })}`
  return t('ld.last', { ago: agoText(t, now - Date.parse(e.at)), what })
}

// a browser that has seen the welcome card skips this page, with its language and the rest of its query; ?landing=1
// keeps it here (the name in the bar of every page links to it)
export const SKIP_SCRIPT = `<script>try{if(!/[?&]landing=/.test(location.search)&&localStorage.getItem('ckbpulse.seen'))location.replace('live'+location.search+location.hash)}catch(e){}</script>`

const PAGE_CSS = `.go{display:flex;flex-wrap:wrap;gap:10px;margin:22px 0 6px}.go a{display:inline-block;padding:13px 22px;border-radius:999px;background:var(--lime);color:var(--ink);font-weight:700;text-decoration:none;font-size:16px}.go a.alt{background:none;color:var(--fg);border:1px solid var(--mut)}
p.plain{font-size:19px;color:var(--fg);max-width:60ch;margin:22px 0 0}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
a.card{display:block;background:var(--surface);border:1px solid var(--edge);border-radius:20px;padding:16px 18px;text-decoration:none;color:var(--fg)}a.card:hover{border-color:var(--lime)}a.card b{display:block;font-size:18px;margin-bottom:4px;color:var(--fg)}a.card span{color:var(--mut);font-size:14px;line-height:1.45}
.made{margin-top:44px;border-top:1px solid var(--edge-soft);padding-top:22px;color:var(--mut);max-width:60ch}.made img{display:block;width:220px;height:auto;margin:0 0 12px}.made img.on-dark{display:var(--logo-dark)}.made img.on-light{display:var(--logo-light)}.made a{color:var(--lime)}
.made+footer{margin-top:22px}
.win{position:relative;margin:26px 0 0;border:1px solid var(--edge);background:var(--bg);aspect-ratio:16/9;overflow:hidden}
.win .shot{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.win .shot.on-dark{display:var(--logo-dark)}.win .shot.on-light{display:var(--logo-light)}
.win iframe{position:absolute;inset:0;width:100%;height:100%;border:0;opacity:0;transition:opacity .7s ease;pointer-events:none}.win.live iframe{opacity:1}
.win a.open{position:absolute;inset:0;z-index:2}.win a.open:focus-visible{outline:3px solid var(--fg);outline-offset:-3px}
.last{display:flex;align-items:baseline;gap:10px;margin:10px 0 0;font:400 13px/1.45 var(--font-num);color:var(--mut);min-height:2.9em}.last i{flex:none;width:8px;height:8px;border-radius:50%;background:var(--signal);transform:translateY(-1px)}
@media(min-width:560px){.last{min-height:1.45em}}
@media(prefers-reduced-motion:no-preference){.last i{animation:ping 2.4s ease-in-out infinite}@keyframes ping{50%{opacity:.35}}}`

// [id, path, title word, line word]: the doors, by who they are for
const DOORS = {
  all: [['live', '/live', 'm.live', 'ld.c.live'], ['digest', '/digest?p=week', 'm.digest', 'ld.c.digest'], ['screen', '/present', 'm.screen', 'ld.c.screen'], ['add', '/?tab=suggest', 'm.add', 'ld.c.add']],
  dev: [['impact', '/impact', 'm.impact', 'ld.c.impact'], ['badge', '/use#badge', 'm.badge', 'ld.c.badge'], ['data', '/use#data', 'm.ai', 'ld.c.data'], ['method', '/method', 'me.nav', 'ld.c.method']],
}
const withLang = (base, path, lang) => { const [p, h] = path.split('#'); return `${base}${p}${p.includes('?') ? '&' : '?'}lang=${lang}${h ? `#${h}` : ''}` }

// the picture of the live view: two stills (dark and light, whichever the page is in), and over them the live view itself when
// the device can carry it: a wide screen, motion allowed, no data saver, and once the page is loaded and the picture is in view.
// The live view runs inside the frame (/live?embed=1) and tells the page when its first frame is drawn, so the still fades out
// only then. The whole picture is a link to the live view either way.
const windowHtml = (t, { base, lang, last, now }) => {
  const live = withLang(base, '/live?embed=1', lang), open = withLang(base, '/live', lang)
  return `<figure class="win" id="win" data-live="${esc(live)}"><img class="shot on-dark" src="${esc(base)}/landing-dark.jpg" width="1280" height="720" alt="${esc(t('ld.shot'))}" fetchpriority="high"><img class="shot on-light" src="${esc(base)}/landing-light.jpg" width="1280" height="720" alt="" aria-hidden="true" fetchpriority="high"><a class="open" href="${esc(open)}" aria-label="${esc(t('ld.cta'))}"></a></figure>
<p class="last" id="last"><i aria-hidden="true"></i><span>${esc(lastLine(t, last, now))}</span></p>`
}
export const WINDOW_SCRIPT = (base, lang) => `<script>(function(){var w=document.getElementById('win');if(!w)return
var ok=matchMedia('(min-width: 720px)').matches&&!matchMedia('(prefers-reduced-motion: reduce)').matches&&!(navigator.connection&&navigator.connection.saveData)
function go(){if(w.querySelector('iframe'))return;var f=document.createElement('iframe');f.src=w.dataset.live;f.title='';f.tabIndex=-1;f.setAttribute('aria-hidden','true');w.insertBefore(f,w.querySelector('a.open'))
addEventListener('message',function(e){if(e.source===f.contentWindow&&e.data&&e.data.pulse==='ready')w.classList.add('live')})}
function later(){var run=function(){if('IntersectionObserver' in window){var io=new IntersectionObserver(function(es){if(es[0].isIntersecting){io.disconnect();go()}});io.observe(w)}else go()};window.requestIdleCallback?requestIdleCallback(run,{timeout:1200}):setTimeout(run,1200)}
if(ok){if(document.readyState==='complete')later();else addEventListener('load',later)}
var l=document.querySelector('#last span');if(l){var poll=function(){fetch('${base}/api/last?lang=${lang}').then(function(r){return r.ok?r.json():null}).then(function(j){if(j&&j.line)l.textContent=j.line}).catch(function(){})};poll();setInterval(poll,60000)}})()</script>`

export function landingPage({ lang, base, url, stats = null, img = '', last = null, now = Date.now() }) {
  const t = words(lang), title = 'CKB Pulse', desc = t('ld.lead')
  const plain = stats?.updates ? `<p class="plain">${esc(cap(t('ld.plain', { people: t.cnt('ppl', stats.people), projects: t.cnt('prj', stats.projects), updates: t.cnt('upd', stats.updates) })))}</p>` : ''
  const kpis = stats?.updates ? `<div class="kpis"><div><b>${stats.updates}</b><span>${esc(t('k.updates'))}</span></div><div><b>${stats.people}</b><span>${esc(t('k.people'))}</span></div><div><b>${stats.projects}</b><span>${esc(t('k.projects'))}</span></div></div>` : ''
  const group = (g) => `<h2>${esc(t('use.group.' + g))}</h2><div class="cards">${DOORS[g].map(([id, path, k, line]) => `<a class="card" id="d-${id}" href="${esc(withLang(base, path, lang))}"><b>${esc(t(k))}</b><span>${esc(t(line))}</span></a>`).join('')}</div>`
  return `<!doctype html><html lang="${lang === 'zh' ? 'zh-CN' : lang}"><head><meta charset="utf-8">${MIGRATE_SCRIPT}${SKIP_SCRIPT}<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}"><meta property="og:type" content="website"><meta property="og:site_name" content="CKB Pulse"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(url)}">${img ? `<meta property="og:image" content="${esc(img)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${esc(img)}">` : ''}
${menuHead(base)}<style>${CSS}${PAGE_CSS}</style></head><body><main>
${pageBar(t, { base, lang, current: '', here: '/?landing=1', share: { url: `${base}/?lang=${lang}&d=${today()}`, title, image: img || undefined } })}
${pageHead({ eyebrow: t('ld.eyebrow'), title: t('ld.h1'), lede: esc(desc) })}
<p class="go"><a href="${esc(withLang(base, '/live', lang))}">${esc(t('ld.cta'))}</a><a class="alt" href="${esc(withLang(base, '/digest?p=week', lang))}">${esc(t('m.digest'))}</a></p>
${windowHtml(t, { base, lang, last, now })}
${plain}${kpis}
${group('all')}
${group('dev')}
<div class="made"><img class="on-dark" src="${esc(base)}/lcl-wordmark-paper.svg" alt="" width="220" height="17"><img class="on-light" src="${esc(base)}/lcl-wordmark.svg" alt="" width="220" height="17"><p>${esc(t('ld.made'))} <a href="https://lusocryptolabs.com">lusocryptolabs.com</a></p></div>
<footer>${maker(t)}
${langLinks((l) => `${base}/?lang=${l}&landing=1`)}</footer>
</main>${menuScript(base)}${WINDOW_SCRIPT(esc(base), lang)}</body></html>`
}
