// What Pulse keeps, on one page: what it shows, how visits and uses are counted, what stays on the device, how to leave.
import { words } from './cards.mjs'
import { today } from './public/menu.js'
import { CSS, READING_CSS, pageFoot, pageBar, menuHead, menuScript, pageHead } from './digest.mjs'

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const PARTS = ['shows', 'visits', 'counts', 'device', 'notices', 'history', 'leave', 'sale']

export function privacyPage({ lang, base, url }) {
  const t = words(lang), title = `CKB Pulse · ${t('pv.title')}`, desc = t('pv.lead')
  return `<!doctype html><html lang="${lang === 'zh' ? 'zh-CN' : lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}"><meta property="og:type" content="website"><meta property="og:site_name" content="CKB Pulse"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(url)}">
${menuHead(base)}<style>${CSS}${READING_CSS}</style></head><body><main>
${pageBar(t, { base, lang, current: '', here: '/privacy', share: { url: `${url}?lang=${lang}&d=${today()}`, title } })}
${pageHead({ eyebrow: t('pv.nav'), title: t('pv.h1'), lede: esc(desc) })}
${PARTS.map((id) => `<section class="me" id="${id}"><h2>${esc(t(`pv.${id}.h`))}</h2><p>${esc(t(`pv.${id}.p`))}</p></section>`).join('\n')}
<section class="me" id="contact"><h2>${esc(t('pv.contact.h'))}</h2><p>${esc(t('pv.contact.p'))}</p><p class="go"><a href="mailto:hello@lusocryptolabs.com">${esc(t('pv.contact.a'))}</a></p></section>
${pageFoot(t, url)}
</main>${menuScript(base)}</body></html>`
}
