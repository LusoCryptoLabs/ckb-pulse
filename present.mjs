// The screen for calls and projectors, at /present: one screen that says what is going on in the CKB ecosystem right now. The
// three numbers of the day, the busiest projects and people, the live scene, and the latest updates as they arrive, large enough
// to read from the back of a room on a projector, and the same things in one column on a phone. Nothing to press and nothing
// that turns by itself; the numbers refresh once a minute and the latest updates come in as they happen (public/present.js).
import { words } from './cards.mjs'
import { WORDS } from './public/words.js'
import { menuHead } from './digest.mjs'

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

export const KINDS = ['push', 'branch', 'tag', 'pr_open', 'pr_merged', 'pr_closed', 'review', 'issue_open', 'issue_closed', 'comment', 'release', 'repo', 'star', 'fork']
// the words the script needs, sent with the page (raw, with their {placeholders}) so that it carries none of its own
export const CLIENT_WORDS = ['k.updates', 'k.people', 'k.projects', 'pr.week.line', 'pr.ccc.line', 'ago.now', 'ago.min', 'ago.h', 'ago.day', 'ago.days', ...KINDS.map((k) => 'v.' + k)]

const CSS = `*{box-sizing:border-box}html{height:100%}
body.pr{margin:0;background:var(--bg);color:var(--fg);font:16px/1.4 var(--font-ui);padding:16px 16px 48px}
.pr a{color:inherit}.pr h2{margin:0 0 .5em;font:400 .72em/1.2 var(--font-num);letter-spacing:.08em;text-transform:uppercase;color:var(--mut)}
.top{grid-area:top;display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:10px 24px}
.brand{display:flex;flex-direction:column;gap:6px;text-decoration:none}.brand b{font-size:2em;font-weight:800;letter-spacing:-.02em;line-height:1}
.brand span{display:flex;align-items:center;gap:8px;color:var(--mut);font:400 .7em/1 var(--font-num)}.brand img{height:.62em;width:auto}.brand img.on-dark{display:var(--logo-dark)}.brand img.on-light{display:var(--logo-light)}
.sub{flex:1 1 18em;margin:0;color:var(--mut);font-size:1em;max-width:34em}
.meta{display:flex;align-items:center;gap:10px 14px;flex-wrap:wrap;font:400 .8em/1 var(--font-num);color:var(--mut)}
.live{display:inline-flex;align-items:center;gap:8px;color:var(--fg)}.live i{width:.7em;height:.7em;border-radius:50%!important;background:var(--signal)}
@media(prefers-reduced-motion:no-preference){.live i{animation:pulse 2.4s ease-in-out infinite}@keyframes pulse{50%{opacity:.3}}}
.ctl{display:flex;gap:6px}.ctl a,.ctl button{display:inline-flex;align-items:center;justify-content:center;min-height:2.6em;min-width:2.6em;padding:0 .9em;border:1px solid var(--edge);background:var(--surface);color:var(--fg);font:600 .95em/1 var(--font-ui);text-decoration:none;cursor:pointer}
.ctl a:hover,.ctl button:hover{border-color:var(--fg)}.ctl a:focus-visible,.ctl button:focus-visible{outline:3px solid var(--fg);outline-offset:2px}.ctl a[aria-current=true]{border-color:var(--fg)}.ctl .lang{font:400 .85em/1 var(--font-num);color:var(--mut)}.ctl .lang[aria-current=true]{color:var(--fg)}
.panel{border:1px solid var(--edge);background:var(--surface);padding:1em 1.1em;min-width:0}
.nums{grid-area:nums;display:grid;grid-template-columns:repeat(3,1fr);gap:.6em 1em;align-content:start;margin-top:16px}
.num b{display:block;font:700 2.3em/1 var(--font-num);letter-spacing:-.04em}.num span{color:var(--mut);font-size:.9em}
.small{grid-column:1/-1;margin:.2em 0 0;color:var(--mut);font-size:.85em;line-height:1.4;border-top:1px solid var(--edge);padding-top:.7em}.small:empty{display:none}
.scene{grid-area:scene;position:relative;margin:16px 0 0;border:1px solid var(--edge);background:var(--bg);aspect-ratio:16/10;overflow:hidden;min-height:0}
.scene .shot{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.scene .shot.on-dark{display:var(--logo-dark)}.scene .shot.on-light{display:var(--logo-light)}
.scene iframe{position:absolute;inset:0;width:100%;height:100%;border:0;opacity:0;transition:opacity .7s ease;pointer-events:none}.scene.live iframe{opacity:1}
.scene a.open{position:absolute;inset:0;z-index:2}.scene a.open:focus-visible{outline:3px solid var(--fg);outline-offset:-3px}
.lists{grid-area:lists;display:grid;gap:16px;margin-top:16px;align-content:start;min-width:0}
.list ol{list-style:none;margin:0;padding:0;display:grid;gap:.4em}
.list li{display:grid;grid-template-columns:2.2em 1fr;column-gap:.7em;align-items:center;min-width:0}
.list .n{font:700 1.15em/1 var(--font-num);text-align:right}
.list .who{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700;font-size:1.1em;line-height:1.25}.list .who small{color:var(--mut);font:400 .72em/1 var(--font-num);margin-left:.7em}
.list .bar{grid-column:2;height:.3em;background:var(--edge);margin-top:.15em}.list .bar i{display:block;height:100%;background:var(--fg);width:0;transition:width 1s ease}
.list.faces li{grid-template-columns:2.2em 1.9em 1fr}.list.faces .bar{grid-column:3}.list img{width:1.9em;height:1.9em;border-radius:50%!important;background:var(--edge);display:block}
.feed{grid-area:feed;margin-top:16px;min-width:0}.feed ol{list-style:none;margin:0;padding:0;display:grid;gap:.45em}
.feed li{display:grid;grid-template-columns:5.5em 1.8em 1fr;column-gap:.8em;align-items:center;min-width:0;padding:.35em 0;border-top:1px solid var(--edge)}
.feed time{color:var(--mut);font:400 .78em/1.2 var(--font-num);white-space:nowrap}.feed img{width:1.8em;height:1.8em;border-radius:50%!important;background:var(--edge);display:block}
.feed .what{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.feed .what small{color:var(--mut);margin-left:.6em}
@media(prefers-reduced-motion:no-preference){.feed li.fresh{animation:fresh 2.4s ease-out}@keyframes fresh{from{background:color-mix(in srgb,var(--signal) 22%,transparent)}to{background:transparent}}}
.empty{color:var(--mut);font-size:.9em;margin:0}
@media(max-width:560px){.nums{grid-template-columns:repeat(3,1fr)}.num b{font-size:1.9em}.ctl .lang{display:none}.feed li{grid-template-columns:3.6em 1.8em 1fr}.feed .what{white-space:normal}.feed .what small{display:block;margin:0}}
@media(min-width:900px) and (min-height:520px){
body.pr{height:100dvh;overflow:hidden;display:grid;grid-template-columns:minmax(13em,23%) minmax(0,1fr) minmax(17em,29%);grid-template-rows:auto minmax(0,1fr) auto;grid-template-areas:"top top top" "nums scene lists" "feed feed feed";gap:0 1.3em;padding:1.1em 1.5em 1em;font-size:clamp(11px,min(1.9vh,1.1vw),26px)}
.scene{aspect-ratio:auto;height:auto}.nums{align-content:start;grid-template-columns:1fr;gap:.8em}.num b{font-size:3.4em}
.lists{gap:.8em;grid-template-rows:auto auto}.lists .panel{padding:.65em .9em}.list h2{margin-bottom:.4em}.list ol{gap:.3em}
.feed{margin-top:1em}}`

export function presentPage({ lang, base, url }) {
  const t = words(lang), q = `lang=${lang}`
  const title = `${t('pr.title')} | CKB Pulse`
  const num = (id, k) => `<div class="num"><b id="${id}">·</b><span>${esc(t(k))}</span></div>`
  const langs = [['en', 'EN'], ['pt', 'PT'], ['zh', '中文']].map(([l, n]) => `<a class="lang" href="${esc(base)}/present?lang=${l}" lang="${l === 'zh' ? 'zh-CN' : l}"${l === lang ? ' aria-current="true"' : ''}>${n}</a>`).join('')
  const data = Object.fromEntries([...CLIENT_WORDS.map((k) => [k, WORDS[lang]?.[k] ?? WORDS.en[k]]), ['lang', lang]])
  return `<!doctype html><html lang="${lang === 'zh' ? 'zh-CN' : lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<meta name="robots" content="noindex"><meta name="description" content="${esc(t('pr.sub'))}">
${menuHead(base)}<style>${CSS}</style></head><body class="pr">
<header class="top"><a class="brand" href="${esc(base)}/?landing=1&amp;${q}"><b>CKB Pulse</b><span>by <img class="on-dark" src="${esc(base)}/lcl-wordmark-paper.svg" alt="LusoCryptoLabs" width="92" height="7"><img class="on-light" src="${esc(base)}/lcl-wordmark.svg" alt="LusoCryptoLabs" width="92" height="7"></span></a>
<p class="sub">${esc(t('pr.sub'))}</p>
<div class="meta"><span class="live"><i aria-hidden="true"></i>${esc(t('pr.last24'))}</span><time id="clock"></time><span class="ctl">${langs}<button type="button" id="pr-full" aria-label="${esc(t('full'))}" title="${esc(t('full'))}">⛶</button><a id="pr-leave" href="${esc(base)}/live?${q}">${esc(t('pr.leave'))}</a></span></div></header>
<section class="panel nums" aria-label="${esc(t('pr.last24'))}">${num('n-up', 'k.updates')}${num('n-people', 'k.people')}${num('n-projects', 'k.projects')}<p class="small" id="week"></p><p class="small" id="ccc"></p></section>
<figure class="scene" id="scene" data-live="${esc(base)}/live?embed=1&amp;${q}"><img class="shot on-dark" src="${esc(base)}/landing-dark.jpg" width="1280" height="720" alt="${esc(t('ld.shot'))}"><img class="shot on-light" src="${esc(base)}/landing-light.jpg" width="1280" height="720" alt="" aria-hidden="true"><a class="open" href="${esc(base)}/live?${q}" aria-label="${esc(t('ld.cta'))}"></a></figure>
<section class="lists"><div class="panel list"><h2>${esc(t('pr.projects.h'))}</h2><ol id="r-projects"></ol></div><div class="panel list faces"><h2>${esc(t('pr.people.h'))}</h2><ol id="r-people"></ol></div></section>
<section class="panel feed" aria-live="off"><h2>${esc(t('pr.latest'))}</h2><ol id="feed"></ol></section>
<script type="application/json" id="pr-words">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>
<script type="module" src="${esc(base)}/present.js"></script>
</body></html>`
}
