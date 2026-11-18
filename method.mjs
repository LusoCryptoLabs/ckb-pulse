// How Pulse counts, on one page: what an update is, what is left out, the caps, and where the numbers can mislead.
// The committee review of 2026-11-18 found the rules only in the code and the README, and two places that promised
// more than the code does.
import { words } from './cards.mjs'
import { CSS, maker, pageBar, menuHead, menuScript, pageHead } from './digest.mjs'

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const PARTS = ['source', 'update', 'window', 'rank', 'bots', 'follow', 'own', 'funded', 'limits']
const PAGE_CSS = `section.me{background:#14120e;border:1px solid #36322a;border-radius:20px;padding:14px 18px;margin:14px 0}section.me h2{margin:0 0 4px;font:600 19px var(--font-ui,sans-serif);letter-spacing:-.01em;color:#f0ece2;text-transform:none}section.me p{margin:6px 0}
.go{display:flex;gap:8px;margin:12px 0 2px}.go a{display:inline-block;padding:7px 14px;border-radius:999px;background:#cbf34d;color:#1a2208;font-weight:700;text-decoration:none;font-size:14px}`

export function methodPage({ lang, base, url }) {
  const t = words(lang), title = `CKB Pulse · ${t('me.title')}`, desc = t('me.lead')
  return `<!doctype html><html lang="${lang === 'zh' ? 'zh-CN' : lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}"><meta property="og:type" content="website"><meta property="og:site_name" content="CKB Pulse"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(url)}">
<link rel="icon" href="${esc(base)}/icon-192.png">${menuHead(base)}<style>${CSS}${PAGE_CSS}</style></head><body><main>
${pageBar(t, { base, lang, current: '', here: '/method' })}
${pageHead({ eyebrow: t('me.nav'), title: t('me.h1'), lede: esc(desc) })}
${PARTS.map((id) => `<section class="me" id="${id}"><h2>${esc(t(`me.${id}.h`))}</h2><p>${esc(t(`me.${id}.p`))}</p></section>`).join('\n')}
<section class="me" id="wrong"><h2>${esc(t('me.wrong.h'))}</h2><p>${esc(t('me.wrong.p'))}</p><p class="go"><a href="https://github.com/LusoCryptoLabs/ckb-pulse/issues/new">${esc(t('me.wrong.a'))}</a></p></section>
<footer>${maker(t)}
<p class="langs no-print">${['en', 'zh', 'pt'].map((l) => `<a href="${esc(url)}?lang=${l}" lang="${l === 'zh' ? 'zh-CN' : l}">${{ en: 'English', zh: '中文', pt: 'Português' }[l]}</a>`).join('')}</p></footer>
</main>${menuScript(base)}</body></html>`
}
