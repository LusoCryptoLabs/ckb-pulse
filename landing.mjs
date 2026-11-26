// The page a first visit lands on at / when it comes without a link to something: what Pulse is in a sentence, the last
// day in three numbers, one way into the live view, and the other doors, for everyone and for developers. A visit that
// came with a link to a project, a person, a period or a tab goes straight to the live view (server.mjs), and so does
// any browser that has seen the welcome card before (the script below, which runs before anything is drawn).
import { words } from './cards.mjs'
import { CSS, maker, langLinks, pageBar, menuHead, menuScript, pageHead, countScript } from './digest.mjs'
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
@media(prefers-reduced-motion:no-preference){.last i{animation:ping 2.4s ease-in-out infinite}@keyframes ping{50%{opacity:.35}}}
/* the picture is the hero: the width of the window, with the day's numbers, its pulse and the last update laid over its foot */
body{overflow-x:clip}
.win{width:100vw;max-width:none;margin:26px 0 0 calc(50% - 50vw);border-width:1px 0;aspect-ratio:1/1;max-height:70svh}
@media(min-width:560px){.win{aspect-ratio:16/9}}@media(min-width:1000px){.win{aspect-ratio:21/9;max-height:max(380px,calc(100svh - 372px))}}
.win .hud{position:absolute;left:0;right:0;bottom:0;z-index:1;pointer-events:none;padding:56px max(16px,calc((100vw - 860px)/2 + 16px)) 14px;background:linear-gradient(transparent,color-mix(in srgb,var(--bg) 90%,transparent) 54px,var(--bg) 110px)}
.ecg{display:block;width:100%;height:clamp(40px,7vw,64px);margin:0 0 10px;overflow:visible}.ecg path{fill:none;stroke:var(--signal);stroke-width:2;stroke-linejoin:round;stroke-linecap:round;vector-effect:non-scaling-stroke;filter:drop-shadow(0 0 5px var(--signal))}
@media(prefers-reduced-motion:no-preference){.ecg path{stroke-dasharray:1;stroke-dashoffset:1;animation:beat 2.4s cubic-bezier(.3,.6,.2,1) .4s forwards}@keyframes beat{to{stroke-dashoffset:0}}}
.nums{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px clamp(18px,4.5vw,52px)}.nums div{display:flex;flex-direction:column;gap:2px}
.nums b{font:800 clamp(34px,6.4vw,66px)/1 var(--font-num,monospace);letter-spacing:-.04em;color:var(--fg);font-variant-numeric:tabular-nums}
.nums span{font:12px var(--font-num,monospace);letter-spacing:.1em;text-transform:uppercase;color:var(--mut)}.nums small{font:12px var(--font-num,monospace);color:var(--mut);align-self:flex-end;margin-left:auto}
.win .last{margin:10px 0 0;min-height:0}
@media(max-width:559px){.nums small{flex-basis:100%;margin:2px 0 0}}
/* the three big cards, each with a picture of its own numbers, then the other doors, smaller */
.feat{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px;margin:0 0 6px}
a.fcard{display:flex;flex-direction:column;gap:6px;background:var(--surface);border:1px solid var(--edge);padding:18px;text-decoration:none;color:var(--fg)}a.fcard:hover{border-color:var(--lime)}
a.fcard .fvis{flex:1;display:flex;flex-direction:column;justify-content:flex-end;gap:10px;min-height:110px;margin-bottom:6px}
a.fcard b{font-size:19px;letter-spacing:-.01em}a.fcard span{color:var(--mut);font-size:14px;line-height:1.45}
.fvis .bars{height:64px;padding:0;border:0;background:none;gap:4px}.fvis .bars i{border-radius:0}.fvis .mixbar{height:10px;margin:0}
.fvis strong{font:800 clamp(44px,7vw,60px)/1 var(--font-num,monospace);letter-spacing:-.04em;font-variant-numeric:tabular-nums}.fvis em{font-style:normal;font-size:14px;color:var(--mut)}.fvis small{font:12px var(--font-num,monospace);color:var(--lime)}
.doors{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:0 22px;margin:0 0 6px}
a.card{border-radius:0;border-width:0 0 1px;background:none;padding:13px 2px}a.card:hover{border-color:var(--lime)}a.card b{font-size:16px;margin-bottom:2px}a.card span{font-size:13.5px}
/* on a phone the picture is a window of its own and the numbers, the pulse and the last update sit under it, on the page: laid over
   the scene they met its labels */
@media(max-width:559px){.win{aspect-ratio:auto;max-height:none;padding-top:75vw}.win .shot,.win iframe,.win a.open{inset:0 0 auto 0;height:75vw}.win .shot{object-position:62% 50%}
.win .hud{position:static;background:none;padding:14px 16px 16px}.ecg{height:44px;margin:0 0 12px}p.plain{font-size:16px;color:var(--mut)}}`

// [id, path, title word, line word]: the doors, by who they are for. The digest, the forum and the lessons are the three big
// cards, each with a picture made of the week's real numbers; without numbers they are doors like the others.
const DOORS = {
  all: [['live', '/live', 'm.live', 'ld.c.live'], ['digest', '/digest?p=week', 'm.digest', 'ld.c.digest'], ['forum', '/forum', 'm.forum', 'ld.c.forum'], ['compare', '/compare', 'm.compare', 'ld.c.compare'], ['screen', '/present', 'm.screen', 'ld.c.screen'], ['add', '/?tab=suggest', 'm.add', 'ld.c.add']],
  dev: [['learned', '/learned', 'm.learned', 'ld.c.learned'], ['impact', '/impact', 'm.impact', 'ld.c.impact'], ['badge', '/use#badge', 'm.badge', 'ld.c.badge'], ['data', '/use#data', 'm.ai', 'ld.c.data'], ['method', '/method', 'me.nav', 'ld.c.method']],
}
const withLang = (base, path, lang) => { const [p, h] = path.split('#'); return `${base}${p}${p.includes('?') ? '&' : '?'}lang=${lang}${h ? `#${h}` : ''}` }

// The pulse: one beat for each of the last 24 hours, as tall as that hour's share of the busiest hour, and a flat line for a
// quiet hour. It is the day's real activity drawn the way the name says it, not an animation of nothing.
export function ecgPath(bars, w = 1000, h = 80) {
  const n = bars.length
  if (!n || !bars.some((v) => v > 0)) return ''
  const max = Math.max(...bars), base = h * 0.74, step = w / n, a = Math.min(7, step / 5)
  const r = (v) => Math.round(v * 10) / 10
  let d = `M0 ${r(base)}`
  bars.forEach((v, i) => {
    const x = i * step + step / 2, end = (i + 1) * step
    if (!(v > 0)) { d += ` L${r(end)} ${r(base)}`; return }
    const amp = Math.max(7, (v / max) * (base - 5))
    d += ` L${r(x - a * 1.7)} ${r(base)} L${r(x - a)} ${r(base + 5)} L${r(x)} ${r(base - amp)} L${r(x + a)} ${r(base + 9)} L${r(x + a * 1.7)} ${r(base)} L${r(end)} ${r(base)}`
  })
  return d
}
// the numbers count up from nothing when the picture comes into view; the real number is in the page, and is the last thing written
export const COUNT_SCRIPT = countScript('.nums b[data-n]')

// the picture of the live view: two stills (dark and light, whichever the page is in), and over them the live view itself when
// the device can carry it: a wide screen, motion allowed, no data saver, and once the page is loaded and the picture is in view.
// The live view runs inside the frame (/live?embed=1) and tells the page when its first frame is drawn, so the still fades out
// only then. The whole picture is a link to the live view either way.
const windowHtml = (t, { base, lang, last, now, stats = null, dayBars = [] }) => {
  const live = withLang(base, '/live?embed=1', lang), open = withLang(base, '/live', lang)
  const beat = ecgPath(dayBars)
  const hud = `<div class="hud">${beat ? `<svg class="ecg" viewBox="0 0 1000 80" preserveAspectRatio="none" role="img" aria-label="${esc(t('ld.ecg'))}"><path d="${beat}" pathLength="1"/></svg>` : ''}`
    + `${stats?.updates ? `<div class="nums"><div><b data-n="${stats.updates}">${stats.updates}</b><span>${esc(t('k.updates'))}</span></div><div><b data-n="${stats.people}">${stats.people}</b><span>${esc(t('k.people'))}</span></div><div><b data-n="${stats.projects}">${stats.projects}</b><span>${esc(t('k.projects'))}</span></div><small>${esc(t('ld.hud'))}</small></div>` : ''}`
    + `<p class="last" id="last"><i aria-hidden="true"></i><span>${esc(lastLine(t, last, now))}</span></p></div>`
  return `<figure class="win" id="win" data-live="${esc(live)}"><img class="shot on-dark" src="${esc(base)}/landing-dark.jpg" width="1280" height="720" alt="${esc(t('ld.shot'))}" fetchpriority="high"><img class="shot on-light" src="${esc(base)}/landing-light.jpg" width="1280" height="720" alt="" aria-hidden="true" fetchpriority="high"><a class="open" href="${esc(open)}" aria-label="${esc(t('ld.cta'))}"></a>${hud}</figure>`
}
export const WINDOW_SCRIPT = (base, lang) => `<script>(function(){var w=document.getElementById('win');if(!w)return
var ok=matchMedia('(min-width: 720px)').matches&&!matchMedia('(prefers-reduced-motion: reduce)').matches&&!(navigator.connection&&navigator.connection.saveData)
function go(){if(w.querySelector('iframe'))return;var f=document.createElement('iframe');f.src=w.dataset.live;f.title='';f.tabIndex=-1;f.setAttribute('aria-hidden','true');w.insertBefore(f,w.querySelector('a.open'))
addEventListener('message',function(e){if(e.source===f.contentWindow&&e.data&&e.data.pulse==='ready')w.classList.add('live')})}
function later(){var run=function(){if('IntersectionObserver' in window){var io=new IntersectionObserver(function(es){if(es[0].isIntersecting){io.disconnect();go()}});io.observe(w)}else go()};window.requestIdleCallback?requestIdleCallback(run,{timeout:1200}):setTimeout(run,1200)}
if(ok){if(document.readyState==='complete')later();else addEventListener('load',later)}
var l=document.querySelector('#last span');if(l){var poll=function(){fetch('${base}/api/last?lang=${lang}').then(function(r){return r.ok?r.json():null}).then(function(j){if(j&&j.line)l.textContent=j.line}).catch(function(){})};poll();setInterval(poll,60000)}})()</script>`

export function landingPage({ lang, base, url, stats = null, img = '', last = null, now = Date.now(), dayBars = [], week = null, forum = null, lessons = 0 }) {
  const t = words(lang), title = 'CKB Pulse', desc = t('ld.lead')
  const plain = stats?.updates ? `<p class="plain">${esc(cap(t('ld.plain', { people: t.cnt('ppl', stats.people), projects: t.cnt('prj', stats.projects), updates: t.cnt('upd', stats.updates) })))}</p>` : ''
  const door = (id, path, k, line, cls = 'card') => `<a class="${cls}" id="d-${id}" href="${esc(withLang(base, path, lang))}"><b>${esc(t(k))}</b><span>${esc(t(line))}</span></a>`
  // the pictures of the three big cards are the week's real numbers: the seven days, what kind of work, the forum, the lessons
  const wk = week && Array.isArray(week.bars) && week.bars.length ? week : null
  const kinds = wk?.kinds ? ['code', 'change', 'talk', 'version', 'interest'].map((f) => [f, Number.isInteger(wk.kinds[f]) && wk.kinds[f] > 0 ? wk.kinds[f] : 0]).filter(([, v]) => v > 0) : []
  const wkMax = wk ? Math.max(1, ...wk.bars) : 1
  const big = {
    digest: wk ? `<div class="fvis" aria-hidden="true"><div class="bars">${wk.bars.map((v) => `<i style="height:${Math.max(4, Math.round((v / wkMax) * 100))}%"></i>`).join('')}</div>${kinds.length ? `<div class="mixbar">${kinds.map(([f, v]) => `<i data-f="${f}" style="flex:${v};background-color:var(--f-${f})"></i>`).join('')}</div>` : ''}</div>` : '',
    forum: forum && forum.topics > 0 ? `<div class="fvis"><strong>${forum.topics}</strong><em>${esc(t('ld.f.forum.n'))}</em><small>${esc(t('ld.f.forum.s', { fresh: forum.fresh || 0, people: forum.people || 0 }))}</small></div>` : '',
    learned: lessons > 0 ? `<div class="fvis"><strong>${lessons}</strong><em>${esc(t('ld.f.learned.n'))}</em></div>` : '',
  }
  const FEAT = [['digest', '/digest?p=week', 'm.digest', 'ld.c.digest'], ['forum', '/forum', 'm.forum', 'ld.c.forum'], ['learned', '/learned', 'm.learned', 'ld.c.learned']].filter(([id]) => big[id])
  const featHtml = FEAT.length ? `<h2>${esc(t('ld.f.h'))}</h2><div class="feat">${FEAT.map(([id, path, k, line]) => `<a class="fcard" id="d-${id}" href="${esc(withLang(base, path, lang))}">${big[id]}<b>${esc(t(k))}</b><span>${esc(t(line))}</span></a>`).join('')}</div>` : ''
  const featured = new Set(FEAT.map(([id]) => id))
  const group = (g) => `<h2>${esc(t('use.group.' + g))}</h2><div class="doors">${DOORS[g].filter(([id]) => !featured.has(id)).map(([id, path, k, line]) => door(id, path, k, line)).join('')}</div>`
  return `<!doctype html><html lang="${lang === 'zh' ? 'zh-CN' : lang}"><head><meta charset="utf-8">${MIGRATE_SCRIPT}${SKIP_SCRIPT}<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}"><meta property="og:type" content="website"><meta property="og:site_name" content="CKB Pulse"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(url)}">${img ? `<meta property="og:image" content="${esc(img)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${esc(img)}">` : ''}
${menuHead(base)}<style>${CSS}${PAGE_CSS}</style></head><body><main>
${pageBar(t, { base, lang, current: '', here: '/?landing=1', share: { url: `${base}/?lang=${lang}&d=${today()}`, title, image: img || undefined } })}
${pageHead({ eyebrow: t('ld.eyebrow'), title: t('ld.h1'), lede: esc(desc) })}
<p class="go"><a href="${esc(withLang(base, '/live', lang))}">${esc(t('ld.cta'))}</a><a class="alt" href="${esc(withLang(base, '/digest?p=week', lang))}">${esc(t('m.digest'))}</a><a class="alt" href="${esc(withLang(base, '/learned', lang))}">${esc(t('m.learned'))}</a></p>
${windowHtml(t, { base, lang, last, now, stats, dayBars })}
${plain}
${featHtml}
${group('all')}
${group('dev')}
<div class="made"><img class="on-dark" src="${esc(base)}/lcl-wordmark-paper.svg" alt="" width="220" height="17"><img class="on-light" src="${esc(base)}/lcl-wordmark.svg" alt="" width="220" height="17"><p>${esc(t('ld.made'))} <a href="https://lusocryptolabs.com">lusocryptolabs.com</a></p></div>
<footer>${maker(t)}
${langLinks((l) => `${base}/?lang=${l}&landing=1`)}</footer>
</main>${menuScript(base)}${WINDOW_SCRIPT(esc(base), lang)}${COUNT_SCRIPT}</body></html>`
}
