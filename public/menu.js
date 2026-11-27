// The menu and the three views, the same on every page: the live page, /fiber, /digest and /use. The server
// writes it into its pages and the live and Fiber pages draw it with their words. Until 2026-11-02 the Fiber map, the
// the feed, the API and the MCP server could only be found by their address, behind the "?" or not at
// all. Loaded in a browser, this file also closes an open menu on a tap outside it or on Escape.
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const LANGS = [['en', 'EN'], ['zh', '中文'], ['pt', 'PT']]
const RSS = '<svg viewBox="0 0 16 16"><circle cx="4" cy="12" r="1.6" fill="currentColor"/><path d="M3 7.5a5.5 5.5 0 0 1 5.5 5.5M3 3a10 10 0 0 1 10 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'

// the destinations of the same weight: shown side by side on wide screens, first in the menu everywhere
// The Fiber map is PAUSED (2026-11-18). Nothing links to it, server.mjs sends its address to the live page and answers
// 503 to its API, and its collector does not start. Set this to false to bring it back: the page, its words and its
// tests are all still here.
export const FIBER_PAUSED = true
const unpaused = ([id]) => !(FIBER_PAUSED && id === 'fiber')
export const VIEWS = [['live', '/live', 'v.live'], ['fiber', '/fiber', 'v.fiber']].filter(unpaused)
// [id, path, words, hint words, tile] by what a person came for; act names what the live page does in place
export const GROUPS = [
  ['m.see', [['live', '/live', 'm.live', '', 'live'], ['fiber', '/fiber', 'm.fiber', 'm.fiber.s', 'F'], ['digest', '/digest?p=week', 'm.digest', '', '7'], ['forum', '/forum', 'm.forum', '', 'T'], ['screen', '/present', 'm.screen', 'm.screen.s', 'TV'], ['impact', '/impact', 'm.impact', '', 'U'], ['compare', '/compare', 'm.compare', '', 'VS'], ['learned', '/learned', 'm.learned', 'm.learned.s', 'L']].filter(unpaused)],
  ['m.keep', [['notices', '/?tab=notices', 'm.notices', 'm.notices.s', '!'], ['feed', '/feed', 'm.feed', '', 'rss']]],
  ['m.build', [['add', '/?tab=suggest', 'm.add', '', '+'], ['badge', '/use#badge', 'm.badge', '', 'B'], ['ai', '/use#ai', 'm.ai', 'm.ai.s', 'AI']]],
]

// a path on this site with the page's language; the hash stays last
export function href(base, path, lang) {
  const [p, h] = path.split('#')
  return `${base}${p}${p.includes('?') ? '&' : '?'}lang=${lang}${h ? `#${h}` : ''}`
}

export function viewsHtml(t, { base = '', lang = 'en', current = '' } = {}) {
  if (VIEWS.length < 2) return '' // one destination is not a switch
  return `<nav class="pm-views" aria-label="${esc(t('m.views'))}">${VIEWS.map(([id, path, k]) => `<a href="${esc(href(base, path, lang))}"${id === current ? ' aria-current="page"' : ''}>${esc(t(k))}</a>`).join('')}</nav>`
}

// here is the page's own address, for the language links (the live page switches language in place instead)
export function menuHtml(t, { base = '', lang = 'en', current = '', here = '', looks: withLooks = !!here } = {}) {
  const row = ([id, path, k, hint, tile]) => `<a class="pm-row" role="menuitem" data-act="${id}" href="${esc(href(base, path, lang))}"${id === current ? ' aria-current="page"' : ''}><i class="pm-tile pm-${id}" aria-hidden="true">${tile === 'live' ? '<b></b>' : tile === 'rss' ? RSS : esc(tile)}</i><span>${esc(t(k))}</span>${hint ? `<small>${esc(t(hint))}</small>` : ''}</a>`
  const langs = LANGS.map(([l, name]) => here
    ? `<a href="${esc(href('', here, l))}" lang="${l === 'zh' ? 'zh-CN' : l}"${l === lang ? ' aria-current="true"' : ''}>${name}</a>`
    : `<button type="button" data-lang="${l}" lang="${l === 'zh' ? 'zh-CN' : l}" aria-pressed="${l === lang}">${name}</button>`).join('')
  // the plain pages (which know their own address) offer the choice of look; the live page does not wear it yet
  const looks = withLooks ? `<span class="pm-theme" role="group" aria-label="${esc(t('m.theme'))}"><span>${esc(t('m.theme'))}</span><button type="button" data-theme-set="auto">${esc(t('m.auto'))}</button><button type="button" data-theme-set="dark">${esc(t('m.dark'))}</button><button type="button" data-theme-set="light">${esc(t('m.light'))}</button></span>` : ''
  return `<details class="pmenu"><summary class="pm-btn" aria-label="${esc(t('m.menu'))}" title="${esc(t('m.menu'))}"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></summary>
<div class="pm-panel" role="menu">${GROUPS.map(([g, rows]) => `<div class="pm-group pm-${g.slice(2)}"><p>${esc(t(g))}</p>${rows.map(row).join('')}</div>`).join('')}
<div class="pm-foot"><a data-act="about" href="${esc(href(base, '/?about=1', lang))}">${esc(t('m.about'))}</a><a href="${esc(href(base, '/use', lang))}">${esc(t('m.all'))}</a><a href="${esc(href(base, '/method', lang))}">${esc(t('me.nav'))}</a><a href="${esc(href(base, '/privacy', lang))}">${esc(t('pv.nav'))}</a><span class="pm-langs">${langs}</span>${looks}
<span class="pm-by"><a href="https://lusocryptolabs.com">${esc(t('by'))}</a> · <a href="https://x.com/lusocryptolabs">X</a> · <a href="https://github.com/LusoCryptoLabs/ckb-pulse">GitHub</a> · <a href="mailto:hello@lusocryptolabs.com">hello@lusocryptolabs.com</a> · <a href="https://github.com/LusoCryptoLabs/ckb-pulse/issues/new">${esc(t('m.issue'))}</a></span></div></div></details>`
}

// sharing, the same everywhere: copy the link, X, Telegram, WhatsApp, and the picture the link shows. The link carries
// the day, since X and Telegram keep a preview per address
const SHARE_ICON = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 13V3m0 0L6.5 6.5M10 3l3.5 3.5M4 10v5.5A1.5 1.5 0 0 0 5.5 17h9a1.5 1.5 0 0 0 1.5-1.5V10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
export const today = () => new Date().toISOString().slice(0, 10)
// where a link goes, one list for every page: the plain pages' button and the live page's menu both read it.
// `native` is true where the device has its own share sheet (the live page asks; a plain page's button does not)
export function shareTargets(t, { url, title, image, native = false }) {
  const enc = encodeURIComponent
  return [
    ...(native ? [{ key: 'native', count: 'share_native', label: t('sh.native') }] : []),
    { key: 'copy', count: 'share_copy', label: t('sh.copy') },
    { key: 'x', count: 'share_x', label: 'X', href: `https://x.com/intent/post?text=${enc(title)}&url=${enc(url)}` },
    { key: 'telegram', count: 'share_telegram', label: 'Telegram', href: `https://t.me/share/url?url=${enc(url)}&text=${enc(title)}` },
    { key: 'whatsapp', count: 'share_whatsapp', label: 'WhatsApp', href: `https://wa.me/?text=${enc(`${title} ${url}`)}` },
    ...(image ? [{ key: 'image', count: 'share_image', label: t('sh.image'), href: image }] : []),
  ]
}
export function shareHtml(t, { url, title, image }) {
  const out = 'target="_blank" rel="noopener"'
  const item = (x) => x.key === 'copy'
    ? `<button type="button" data-count="${x.count}" data-copy="${esc(url)}" data-copied="${esc(t('sh.copied'))}">${esc(x.label)}</button>`
    : `<a data-count="${x.count}" href="${esc(x.href)}" ${out}>${esc(x.label)}</a>`
  return `<details class="pshare"><summary class="ps-btn" aria-label="${esc(t('sh.share'))}" title="${esc(t('sh.share'))}">${SHARE_ICON}<span>${esc(t('sh.share'))}</span></summary><div class="ps-panel">${shareTargets(t, { url, title, image }).map(item).join('')}</div></details>`
}

// the bar the server pages share: the name back to the live page, the views, the menu. Under the name goes "by" and the
// studio's own wordmark (two files, for a dark ground and a light one; theme.css shows one and, in the current look, none)
const BY = (t, base) => `<a class="pm-by-lcl" href="https://lusocryptolabs.com" target="_blank" rel="noopener" aria-label="${esc(t('by'))}"><span aria-hidden="true">by</span><img class="on-dark" src="${esc(base)}/lcl-wordmark-paper.svg" alt="" width="92" height="7"><img class="on-light" src="${esc(base)}/lcl-wordmark.svg" alt="" width="92" height="7"></a>`
// `share` ({ url, title, image }) puts the share button next to the menu, the same place on every public page; a private
// page passes none
export function barHtml(t, { base = '', lang = 'en', current = '', here = '', share = null } = {}) {
  return `<div class="pm-bar"><span class="pm-lock"><a class="pm-brand" href="${esc(href(base, '/?landing=1', lang))}"><i aria-hidden="true"></i>CKB Pulse</a>${BY(t, base)}</span>${viewsHtml(t, { base, lang, current })}${share ? shareHtml(t, share) : ''}${menuHtml(t, { base, lang, current, here })}</div>`
}

// in a browser: one menu open at a time, closed by a tap outside it, by Escape, or by following one of its links
if (typeof document !== 'undefined') {
  // the page opened in a browser: this is what makes a visitor count as a person (visits.mjs), not the page request
  try { navigator.sendBeacon('/api/here') } catch {}
  // choosing a language on a plain page is remembered: the pages reached without ?lang= open in it
  document.addEventListener('click', (e) => {
    const a = e.target.closest?.('a[lang]')
    try { const l = a && new URL(a.href).searchParams.get('lang'); if (l && /^(en|pt|zh)$/.test(l) && a.lang.slice(0, 2) === l) localStorage.setItem('ckbpulse.lang', l) } catch {}
  })
  // the look: Auto follows the device (no attribute), Dark and Light are the person's choice, kept in this browser
  const LOOK = 'ckbpulse.theme'
  const chosen = () => { try { const s = localStorage.getItem(LOOK); return s === 'dark' || s === 'lcl' ? 'dark' : s === 'light' || s === 'lcl-light' ? 'light' : 'auto' } catch { return document.documentElement.dataset.theme || 'auto' } }
  const showLook = () => { const now = chosen(); for (const b of document.querySelectorAll('[data-theme-set]')) b.setAttribute('aria-pressed', String(b.dataset.themeSet === now)) }
  document.addEventListener('click', (e) => {
    const b = e.target.closest?.('[data-theme-set]'); if (!b) return
    const v = b.dataset.themeSet
    if (v === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = v
    try { if (v === 'auto') localStorage.removeItem(LOOK); else localStorage.setItem(LOOK, v) } catch {}
    showLook()
  })
  showLook()
  document.addEventListener('pm:drawn', showLook) // the live page draws its menu after this ran, and draws it again with a language
  const OPEN = 'details.pmenu[open], details.pshare[open]'
  const shut = (except) => { for (const d of document.querySelectorAll(OPEN)) if (d !== except) d.open = false }
  document.addEventListener('click', async (e) => {
    const d = e.target.closest?.('details.pmenu, details.pshare')
    shut(d)
    // a count of what was used, and nothing about who: the name of the button goes to the server (see /privacy)
    const used = e.target.closest?.('[data-count]')
    if (used) { try { navigator.sendBeacon('/api/count', JSON.stringify({ name: used.dataset.count })) } catch {} }
    const copy = e.target.closest?.('[data-copy]')
    if (copy) { e.preventDefault(); try { await navigator.clipboard.writeText(copy.dataset.copy); const was = copy.textContent; copy.textContent = copy.dataset.copied; setTimeout(() => { copy.textContent = was }, 1800) } catch { prompt('', copy.dataset.copy) } setTimeout(() => { if (d) d.open = false }, 900); return }
    if (d && e.target.closest('.pm-panel a, .pm-panel button, .ps-panel a')) d.open = false
  })
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return
    const d = document.querySelector(OPEN)
    if (d) { d.open = false; d.querySelector('summary')?.focus() }
  })
  document.addEventListener('toggle', (e) => { if (e.target.matches?.('details.pmenu, details.pshare') && e.target.open) shut(e.target) }, true)
  // a share panel stays on the screen on a narrow phone. A phone that lays it out across the right edge even once zooms
  // the whole page out and stays there, and the tap that opens it lays the page out before any script runs, so the
  // panel opens parked far to the left, where nothing widens the page, and is measured and placed from there
  const PARK = '-10000px 0'
  document.addEventListener('click', (e) => {
    const d = e.target.closest?.('details.pshare')
    if (d && !d.open && e.target.closest('.ps-btn')) d.querySelector(':scope > .ps-panel').style.translate = PARK
  }, true)
  const keep = (d) => {
    const pn = d.querySelector(':scope > .ps-panel')
    pn.style.translate = PARK
    const vw = document.documentElement.clientWidth, q = pn.getBoundingClientRect(), left = q.left + 10000, right = q.right + 10000
    const dx = right > vw - 8 ? vw - 8 - right : left < 8 ? 8 - left : 0
    pn.style.translate = dx ? `${Math.round(dx)}px 0` : ''
  }
  new MutationObserver((ms) => { for (const m of ms) if (m.target.open && m.target.matches('details.pshare')) keep(m.target) })
    .observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['open'] })
}
