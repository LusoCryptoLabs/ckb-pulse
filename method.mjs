// How Pulse counts, on one page: what an update is, what is left out, the caps, and where the numbers can mislead.
// The committee review of 2026-11-18 found the rules only in the code and the README, and two places that promised
// more than the code does.
import { words } from './cards.mjs'
import { today } from './public/menu.js'
import { CSS, READING_CSS, pageFoot, pageBar, menuHead, menuScript, pageHead } from './digest.mjs'

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const PARTS = ['source', 'update', 'window', 'rank', 'bots', 'impact', 'follow', 'own', 'limits']

export function methodPage({ lang, base, url }) {
  const t = words(lang), title = `CKB Pulse · ${t('me.title')}`, desc = t('me.lead')
  return `<!doctype html><html lang="${lang === 'zh' ? 'zh-CN' : lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}"><meta property="og:type" content="website"><meta property="og:site_name" content="CKB Pulse"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(url)}">
<link rel="icon" href="${esc(base)}/icon-192.png">${menuHead(base)}<style>${CSS}${READING_CSS}</style></head><body><main>
${pageBar(t, { base, lang, current: '', here: '/method', share: { url: `${url}?lang=${lang}&d=${today()}`, title } })}
${pageHead({ eyebrow: t('me.nav'), title: t('me.h1'), lede: esc(desc) })}
${PARTS.map((id) => `<section class="me" id="${id}"><h2>${esc(t(`me.${id}.h`))}</h2><p>${esc(t(`me.${id}.p`))}</p></section>`).join('\n')}
<section class="me" id="privacy"><h2>${esc(t('pv.nav'))}</h2><p><a href="${esc(base)}/privacy?lang=${lang}">${esc(t('pv.title'))}</a></p></section>
<section class="me" id="wrong"><h2>${esc(t('me.wrong.h'))}</h2><p>${esc(t('me.wrong.p'))}</p><p class="go"><a href="https://github.com/LusoCryptoLabs/ckb-pulse/issues/new">${esc(t('me.wrong.a'))}</a></p></section>
${pageFoot(t, url)}
</main>${menuScript(base)}</body></html>`
}
