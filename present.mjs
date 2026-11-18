// The screen for calls and projectors, at /present: the live scene, and then in turns the numbers of the day, the busiest
// projects and people, the week, and who builds on CCC, each large enough to read from the back of a room. It changes by itself
// (public/present.js), keys and a small bar change it by hand, and the bar and the pointer go away after three seconds.
// The scene is the live page's own, alone (/live?embed=1), so what a call sees moving is what the page shows.
import { words } from './cards.mjs'
import { WORDS } from './public/words.js'
import { menuHead } from './digest.mjs'

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

export const SLIDES = [['live', 30000], ['projects', 18000], ['people', 18000], ['week', 18000], ['ccc', 18000]]
// the words the script needs, sent with the page so that it carries none of its own
export const CLIENT_WORDS = ['k.updates', 'k.people', 'k.projects', 'pr.ccc.n', 'pr.play', 'pr.pause', 'b.repos.week', 'b.people.week']

const CSS = `html,body{height:100%}body{margin:0;overflow:hidden;background:var(--bg);color:var(--fg);font-family:var(--font-ui)}
.pr-top{position:fixed;z-index:6;left:clamp(16px,3vw,48px);top:clamp(14px,2.4vw,36px);display:flex;flex-direction:column;gap:4px;text-decoration:none;color:var(--fg)}
.pr-top b{font-size:clamp(26px,3.4vw,52px);font-weight:800;letter-spacing:-.02em;line-height:1}
.pr-top span{display:flex;align-items:center;gap:10px;color:var(--mut);font:400 clamp(11px,1.1vw,16px)/1 var(--font-num)}
.pr-top img{height:clamp(8px,.9vw,13px);width:auto}.pr-top img.on-dark{display:var(--logo-dark)}.pr-top img.on-light{display:var(--logo-light)}
.slide{position:fixed;inset:0;opacity:0;visibility:hidden;transition:opacity .6s ease,visibility 0s .6s;padding:clamp(100px,16vh,200px) clamp(20px,6vw,120px) clamp(92px,12vh,140px)}
.slide.on{opacity:1;visibility:visible;transition:opacity .6s ease}
@media(prefers-reduced-motion:reduce){.slide,.slide.on{transition:none}}
.slide h2{margin:0;font-size:clamp(30px,min(5.2vw,9vh),92px);font-weight:800;letter-spacing:-.025em;line-height:1.02}
.slide header p{margin:.4em 0 0;color:var(--mut);font-size:clamp(16px,min(2vw,3.4vh),34px);max-width:40ch}
#s-live{padding:0}#s-live iframe{position:absolute;inset:0;width:100%;height:100%;border:0;pointer-events:none}
.over{position:absolute;left:clamp(16px,3vw,48px);bottom:clamp(76px,9vh,110px);pointer-events:none;width:min(calc(100% - 32px),560px)}
.panel{background:color-mix(in srgb,var(--bg) 84%,transparent);border:1px solid var(--edge);padding:clamp(10px,1.6vh,22px) clamp(14px,1.8vw,30px)}
.nums{display:flex;gap:clamp(14px,2.4vw,44px)}.nums div{display:flex;flex-direction:column}.nums b{font:700 clamp(28px,min(4.6vw,8vh),84px)/1 var(--font-num);letter-spacing:-.04em}.nums span{color:var(--mut);font-size:clamp(12px,min(1.3vw,2.2vh),22px)}
.panel h2{font-size:clamp(16px,min(1.7vw,3vh),30px);margin-top:clamp(8px,1.2vh,16px)}
.last{margin:.35em 0 0;color:var(--mut);font:400 clamp(11px,min(1.1vw,2vh),17px)/1.3 var(--font-num)}
.rank{list-style:none;margin:clamp(14px,3vh,40px) 0 0;padding:0;display:grid;gap:clamp(8px,1.5vh,22px);max-width:1500px}
.rank li{display:grid;grid-template-columns:auto 1fr;align-items:center;gap:clamp(5px,.9vh,12px) clamp(12px,2vw,32px);border-top:1px solid var(--edge);padding-top:clamp(7px,1.2vh,16px)}
.rank .n{font:700 clamp(22px,min(3.2vw,5.4vh),56px)/1 var(--font-num);min-width:2.2ch;text-align:right}.rank .who{font-size:clamp(22px,min(3.2vw,5.4vh),56px);font-weight:700;line-height:1.1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.rank .who small{color:var(--mut);font:400 clamp(13px,min(1.5vw,2.4vh),24px)/1.3 var(--font-num);margin-left:clamp(10px,1.4vw,22px)}
.rank .bar{grid-column:1/-1;height:clamp(5px,.8vh,9px);background:var(--surface)}.rank .bar i{display:block;height:100%;background:var(--lime);width:0;transition:width 1.2s ease}
.rank img{width:clamp(38px,min(5vw,6.6vh),80px);height:clamp(38px,min(5vw,6.6vh),80px);border-radius:50%!important;background:var(--surface);display:block}
.rank.faces li{grid-template-columns:auto auto 1fr}
.big{display:flex;flex-wrap:wrap;gap:clamp(20px,5vw,90px);margin-top:clamp(24px,4vw,64px)}.big div{display:flex;flex-direction:column}.big b{font:700 clamp(54px,min(11vw,19vh),200px)/1 var(--font-num);letter-spacing:-.05em}.big span{color:var(--mut);font-size:clamp(16px,min(2.2vw,3.8vh),38px)}
.two{display:flex;flex-wrap:wrap;gap:clamp(20px,5vw,90px);margin-top:clamp(24px,4vw,64px)}.two small{color:var(--mut);font:400 clamp(13px,1.6vw,26px)/1.3 var(--font-num);text-transform:uppercase;letter-spacing:.08em}.two b{display:block;font-size:clamp(26px,min(4vw,7vh),70px);font-weight:800;margin-top:6px;line-height:1.05}
.tags{list-style:none;padding:0;margin:clamp(20px,3vw,48px) 0 0;display:flex;flex-wrap:wrap;gap:clamp(8px,1.2vw,18px)}.tags li{border:1px solid var(--edge);padding:clamp(6px,.9vw,14px) clamp(12px,1.6vw,26px);font:400 clamp(15px,2vw,34px)/1.2 var(--font-num)}
.pr-bar{position:fixed;z-index:8;left:50%;bottom:clamp(14px,2vw,30px);transform:translateX(-50%);display:flex;align-items:center;gap:8px;background:color-mix(in srgb,var(--bg) 88%,transparent);border:1px solid var(--edge);padding:6px;transition:opacity .35s}
.pr-bar button,.pr-bar a{display:grid;place-items:center;min-width:44px;height:44px;padding:0 12px;border:1px solid var(--edge);background:var(--surface);color:var(--fg);font:600 15px/1 var(--font-ui);text-decoration:none;cursor:pointer}
.pr-bar button:hover,.pr-bar a:hover{border-color:var(--fg)}.pr-bar button:focus-visible,.pr-bar a:focus-visible{outline:3px solid var(--fg);outline-offset:2px}
.dots{display:flex;gap:8px;padding:0 8px}.dots button{min-width:0;width:14px;height:14px;padding:0;border-radius:50%!important;background:var(--edge)}.dots button[aria-current=true]{background:var(--signal);border-color:var(--signal)}
.pr-bar .lang{font:400 13px/1 var(--font-num);min-width:0;padding:0 10px;color:var(--mut)}.pr-bar .lang[aria-current=true]{color:var(--fg);border-color:var(--fg)}
.pr-prog{position:fixed;z-index:7;left:0;bottom:0;height:4px;background:var(--signal);width:100%;transform-origin:0 50%;transform:scaleX(0)}
.pr-hint{position:fixed;z-index:9;left:50%;top:clamp(14px,2.4vw,36px);transform:translateX(-50%);margin:0;background:var(--fg);color:var(--bg);padding:10px 18px;font:400 clamp(12px,1.3vw,18px)/1.3 var(--font-num);transition:opacity .5s}
html.still,html.still *{cursor:none!important}html.still .pr-bar{opacity:0;pointer-events:none}
.pr-hint[hidden]{display:none}
@media(max-width:700px){.pr-bar .lang,.dots{display:none}.over{bottom:92px}}`

export function presentPage({ lang, base, url }) {
  const t = words(lang), q = `lang=${lang}`
  const title = `${t('pr.title')} | CKB Pulse`
  const cl = (id) => `<section class="slide" id="s-${id}" aria-label="${esc(t('pr.' + id + '.h'))}">`
  const head = (id) => `<header><h2>${esc(t('pr.' + id + '.h'))}</h2><p>${esc(t('pr.' + id + '.p'))}</p></header>`
  const nums = (ids) => ids.map(([id, k]) => `<div><b id="${id}">·</b><span>${esc(t(k))}</span></div>`).join('')
  const slides = [
    `<section class="slide on" id="s-live" aria-label="${esc(t('pr.live.h'))}"><iframe src="${esc(base)}/live?embed=1&amp;${q}" title="" tabindex="-1" aria-hidden="true"></iframe><div class="over"><div class="panel"><div class="nums">${nums([['n-up', 'k.updates'], ['n-people', 'k.people'], ['n-projects', 'k.projects']])}</div><h2>${esc(t('pr.live.h'))}</h2><p class="last" id="last"></p></div></div></section>`,
    `${cl('projects')}${head('projects')}<ol class="rank" id="r-projects"></ol></section>`,
    `${cl('people')}${head('people')}<ol class="rank faces" id="r-people"></ol></section>`,
    `${cl('week')}${head('week')}<div class="big">${nums([['w-up', 'k.updates'], ['w-people', 'k.people'], ['w-projects', 'k.projects']])}</div><div class="two"><div><small>${esc(t('b.repos.week'))}</small><b id="w-repo"></b></div><div><small>${esc(t('b.people.week'))}</small><b id="w-person"></b></div></div></section>`,
    `${cl('ccc')}${head('ccc')}<div class="big"><div><b id="c-using">·</b><span id="c-line"></span></div></div><ul class="tags" id="c-list"></ul></section>`,
  ].join('\n')
  const dots = SLIDES.map(([id], i) => `<button type="button" data-go="${i}" aria-label="${esc(t('pr.' + id + '.h'))}"${i === 0 ? ' aria-current="true"' : ''}></button>`).join('')
  const langs = [['en', 'EN'], ['pt', 'PT'], ['zh', '中文']].map(([l, n]) => `<a class="lang" href="${esc(base)}/present?lang=${l}" lang="${l === 'zh' ? 'zh-CN' : l}"${l === lang ? ' aria-current="true"' : ''}>${n}</a>`).join('')
  const data = Object.fromEntries([...CLIENT_WORDS.map((k) => [k, WORDS[lang]?.[k] ?? WORDS.en[k]]), ['lang', lang], ['slides', SLIDES.map(([id, ms]) => [id, ms])]])
  return `<!doctype html><html lang="${lang === 'zh' ? 'zh-CN' : lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<meta name="robots" content="noindex"><meta name="description" content="${esc(t('pr.live.p'))}">
${menuHead(base)}<style>${CSS}</style></head><body class="pr">
<a class="pr-top" href="${esc(base)}/?landing=1&amp;${q}"><b>CKB Pulse</b><span>by <img class="on-dark" src="${esc(base)}/lcl-wordmark-paper.svg" alt="LusoCryptoLabs" width="92" height="7"><img class="on-light" src="${esc(base)}/lcl-wordmark.svg" alt="LusoCryptoLabs" width="92" height="7"></span></a>
${slides}
<nav class="pr-bar" aria-label="${esc(t('pr.slides'))}"><button type="button" id="pr-prev" aria-label="${esc(t('pr.prev'))}">‹</button><button type="button" id="pr-play" aria-label="${esc(t('pr.pause'))}">❚❚</button><button type="button" id="pr-next" aria-label="${esc(t('pr.next'))}">›</button><span class="dots">${dots}</span>${langs}<button type="button" id="pr-full" aria-label="${esc(t('full'))}">⛶</button><a id="pr-leave" href="${esc(base)}/live?${q}">${esc(t('pr.leave'))}</a></nav>
<div class="pr-prog" id="pr-prog"></div><p class="pr-hint" id="pr-hint">${esc(t('pr.hint'))}</p>
<script type="application/json" id="pr-words">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>
<script type="module" src="${esc(base)}/present.js"></script>
</body></html>`
}
