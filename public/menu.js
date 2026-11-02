// The menu and the three views, the same on every page: the live page, /fiber, /funded, /digest and /use. The server
// writes it into its pages and the live and Fiber pages draw it with their words. Until 2026-11-02 the Fiber map, the
// funded projects, the feed, the API and the MCP server could only be found by their address, behind the "?" or not at
// all. Loaded in a browser, this file also closes an open menu on a tap outside it or on Escape.
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const LANGS = [['en', 'EN'], ['zh', '中文'], ['pt', 'PT']]
const RSS = '<svg viewBox="0 0 16 16"><circle cx="4" cy="12" r="1.6" fill="currentColor"/><path d="M3 7.5a5.5 5.5 0 0 1 5.5 5.5M3 3a10 10 0 0 1 10 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'

// the destinations of the same weight: shown side by side on wide screens, first in the menu everywhere
export const VIEWS = [['live', '/', 'v.live'], ['fiber', '/fiber', 'v.fiber'], ['funded', '/funded', 'v.funded']]
// [id, path, words, hint words, tile] by what a person came for; act names what the live page does in place
export const GROUPS = [
  ['m.see', [['live', '/', 'm.live', '', 'live'], ['fiber', '/fiber', 'm.fiber', 'm.fiber.s', 'F'], ['funded', '/funded', 'm.funded', 'm.funded.s', 'D'], ['digest', '/digest?p=week', 'm.digest', '', '7']]],
  ['m.keep', [['notices', '/?tab=notices', 'm.notices', 'm.notices.s', '!'], ['feed', '/feed.xml', 'm.feed', '', 'rss']]],
  ['m.build', [['add', '/?tab=suggest', 'm.add', '', '+'], ['badge', '/use#badge', 'm.badge', '', 'B'], ['ai', '/use#ai', 'm.ai', 'm.ai.s', 'AI']]],
]

// a path on this site with the page's language; the hash stays last
export function href(base, path, lang) {
  const [p, h] = path.split('#')
  return `${base}${p}${p.includes('?') ? '&' : '?'}lang=${lang}${h ? `#${h}` : ''}`
}

export function viewsHtml(t, { base = '', lang = 'en', current = '' } = {}) {
  return `<nav class="pm-views" aria-label="${esc(t('m.views'))}">${VIEWS.map(([id, path, k]) => `<a href="${esc(href(base, path, lang))}"${id === current ? ' aria-current="page"' : ''}>${esc(t(k))}</a>`).join('')}</nav>`
}

// here is the page's own address, for the language links (the live page switches language in place instead)
export function menuHtml(t, { base = '', lang = 'en', current = '', here = '' } = {}) {
  const row = ([id, path, k, hint, tile]) => `<a class="pm-row" role="menuitem" data-act="${id}" href="${esc(href(base, path, lang))}"${id === current ? ' aria-current="page"' : ''}><i class="pm-tile pm-${id}" aria-hidden="true">${tile === 'live' ? '<b></b>' : tile === 'rss' ? RSS : esc(tile)}</i><span>${esc(t(k))}</span>${hint ? `<small>${esc(t(hint))}</small>` : ''}</a>`
  const langs = LANGS.map(([l, name]) => here
    ? `<a href="${esc(href('', here, l))}" lang="${l === 'zh' ? 'zh-CN' : l}"${l === lang ? ' aria-current="true"' : ''}>${name}</a>`
    : `<button type="button" data-lang="${l}" lang="${l === 'zh' ? 'zh-CN' : l}" aria-pressed="${l === lang}">${name}</button>`).join('')
  return `<details class="pmenu"><summary class="pm-btn" aria-label="${esc(t('m.menu'))}" title="${esc(t('m.menu'))}"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></summary>
<div class="pm-panel" role="menu">${GROUPS.map(([g, rows]) => `<div class="pm-group pm-${g.slice(2)}"><p>${esc(t(g))}</p>${rows.map(row).join('')}</div>`).join('')}
<div class="pm-foot"><a data-act="about" href="${esc(href(base, '/?about=1', lang))}">${esc(t('m.about'))}</a><a href="${esc(href(base, '/use', lang))}">${esc(t('m.all'))}</a><span class="pm-langs">${langs}</span>
<span class="pm-by"><a href="https://lusocryptolabs.com">${esc(t('by'))}</a> · <a href="https://x.com/lusocryptolabs">X</a> · <a href="https://github.com/LusoCryptoLabs/ckb-pulse">GitHub</a></span></div></div></details>`
}

// the bar the server pages share: the name back to the live page, the views, the menu
export function barHtml(t, { base = '', lang = 'en', current = '', here = '' } = {}) {
  return `<div class="pm-bar"><a class="pm-brand" href="${esc(href(base, '/', lang))}"><i aria-hidden="true"></i>CKB Pulse</a>${viewsHtml(t, { base, lang, current })}${menuHtml(t, { base, lang, current, here })}</div>`
}

// in a browser: one menu open at a time, closed by a tap outside it, by Escape, or by following one of its links
if (typeof document !== 'undefined') {
  const shut = (except) => { for (const d of document.querySelectorAll('details.pmenu[open]')) if (d !== except) d.open = false }
  document.addEventListener('click', (e) => {
    const d = e.target.closest?.('details.pmenu')
    shut(d)
    if (d && e.target.closest('.pm-panel a, .pm-panel button')) d.open = false
  })
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return
    const d = document.querySelector('details.pmenu[open]')
    if (d) { d.open = false; d.querySelector('summary')?.focus() }
  })
  document.addEventListener('toggle', (e) => { if (e.target.matches?.('details.pmenu') && e.target.open) shut(e.target) }, true)
}
