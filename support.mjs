// How to help keep Pulse running: what it costs (the limits set for it), and three public addresses. No account, no
// cookie, nothing about who gave. A click on Copy is counted by name only (menu.js, data-count), as every button is.
import { words } from './cards.mjs'
import { today } from './public/menu.js'
import { COSTS, COST_TOTAL } from './costs.mjs'
import { CSS, READING_CSS, pageFoot, pageBar, menuHead, menuScript, pageHead, crumbs } from './digest.mjs'

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

// The limits set for Pulse, in US dollars a month: the AI that reads commits for the lessons, and the server. They are
// limits, not what was spent, and the time of the people who run it is not counted.
export { COSTS }

// Public addresses that receive. Each one was checked by its checksum (EIP-55 for the EVM one, bech32 for Bitcoin, the
// CCC address decoder for CKB) before it was put here; test/support.test.mjs checks them again.
export const ADDRESSES = [
  { id: 'ckb', count: 'support_ckb', address: 'ckb1qrgqep8saj8agswr30pls73hra28ry8jlnlc3ejzh3dl2ju7xxpjxqgqq8da5prc8vsadae2kmmrfs9m5h62l7ukfsakmxce' },
  { id: 'btc', count: 'support_btc', address: 'bc1q5tle9mvtkpc8pp5ah3gmhg9jempdjcq0ngj8ek' },
  { id: 'evm', count: 'support_evm', address: '0x4A923D635930F91B4A6fc4485E4107Cdc5a8DC32' },
]

const PAGE_CSS = `.kpis.three div{min-width:150px}.kpis.three span{display:block}
.addr{margin:10px 0 2px}.addr h3{margin:0 0 4px;font:600 15px var(--font-ui,sans-serif);color:var(--fg)}.addr p{margin:2px 0 6px;color:var(--mut);font-size:14px}
.addr pre{background:var(--bg);border:1px solid var(--edge);border-radius:10px;padding:10px 12px;margin:6px 0;white-space:pre-wrap;overflow-wrap:anywhere;user-select:all;-webkit-user-select:all}
.addr pre code{background:none;border:0;padding:0;font:13px/1.45 var(--font-num,monospace);white-space:pre-wrap;overflow-wrap:anywhere}
.addr button{padding:7px 14px;border-radius:999px;border:1px solid var(--edge);background:var(--surface);color:var(--fg);font:700 14px var(--font-ui,sans-serif);cursor:pointer;min-height:44px}`

export function supportPage({ lang, base, url }) {
  const t = words(lang), title = `CKB Pulse · ${t('sp.title')}`, desc = t('sp.lead')
  const total = COST_TOTAL
  return `<!doctype html><html lang="${lang === 'zh' ? 'zh-CN' : lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}"><meta property="og:type" content="website"><meta property="og:site_name" content="CKB Pulse"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(url)}">
${menuHead(base)}<style>${CSS}${READING_CSS}${PAGE_CSS}</style></head><body><main>
${pageBar(t, { base, lang, current: '', here: '/support', share: { url: `${url}?lang=${lang}&d=${today()}`, title } })}
${pageHead({ crumbs: crumbs(t, { base, lang, trail: [[t('sp.nav'), null]] }), eyebrow: t('sp.nav'), title: t('sp.h1'), lede: esc(desc) })}
<section class="me" id="cost"><h2>${esc(t('sp.cost.h'))}</h2>
<div class="kpis three"><div><b>${COSTS.api}</b><span>${esc(t('sp.cost.api'))}</span></div><div><b>${COSTS.server}</b><span>${esc(t('sp.cost.server'))}</span></div><div><b>${total}</b><span>${esc(t('sp.cost.total'))}</span></div></div>
<p>${esc(t('sp.cost.p'))}</p></section>
<section class="me" id="give"><h2>${esc(t('sp.give.h'))}</h2><p>${esc(t('sp.give.p'))}</p>
${ADDRESSES.map((a) => `<div class="addr"><h3>${esc(t(`sp.${a.id}.h`))}</h3><p>${esc(t(`sp.${a.id}.p`))}</p><pre><code>${esc(a.address)}</code></pre><button type="button" data-count="${a.count}" data-copy="${esc(a.address)}" data-copied="${esc(t('sp.copied'))}">${esc(t('sp.copy'))}</button></div>`).join('\n')}
<p>${esc(t('sp.check'))}</p></section>
<section class="me" id="goes"><h2>${esc(t('sp.goes.h'))}</h2><p>${esc(t('sp.goes.p'))}</p></section>
${pageFoot(t, url, { ask: false })}
</main>${menuScript(base)}</body></html>`
}
