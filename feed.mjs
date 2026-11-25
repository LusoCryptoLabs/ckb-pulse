// The feed for a person: what it is in a sentence, three steps, the link to copy, a way into two readers, and what it
// carries now. A browser that opens /feed.xml is sent here; a feed reader gets the XML (server.mjs).
import { words } from './cards.mjs'
import { CSS, maker, langLinks, pageBar, menuHead, menuScript, pageHead, feedEntries, crumbs } from './digest.mjs'
import { today } from './public/menu.js'

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const PAGE_CSS = `ol.steps{counter-reset:s;margin:18px 0}ol.steps li{display:block;counter-increment:s;padding:10px 0 10px 40px;position:relative;border-bottom:1px solid var(--edge-soft);font-size:17px}ol.steps li::before{content:counter(s);position:absolute;left:0;top:9px;width:26px;height:26px;display:grid;place-items:center;font:700 13px var(--font-num,monospace);border:1px solid var(--mut);color:var(--fg)}
.box{display:flex;flex-wrap:wrap;gap:10px;align-items:stretch;margin:16px 0}.box pre{flex:1 1 320px;margin:0;background:var(--surface);border:1px solid var(--edge);padding:12px 14px;overflow-x:auto;user-select:all;-webkit-user-select:all}.box pre code{background:none;border:0;padding:0;font-size:14px;white-space:pre}
.box button{flex:1 1 150px;min-height:48px;font:700 15px var(--font-ui,sans-serif);padding:12px 22px;border:0;background:var(--signal,var(--lime));color:#fff;cursor:pointer}
.go{display:flex;flex-wrap:wrap;gap:10px;margin:8px 0 2px}.go a{display:inline-block;padding:11px 18px;background:none;color:var(--fg);border:1px solid var(--mut);font-weight:700;text-decoration:none;font-size:15px}
ul.latest{list-style:none;padding:0;margin:8px 0}ul.latest li{display:flex;justify-content:space-between;gap:14px;padding:9px 0;border-bottom:1px solid var(--edge-soft)}ul.latest span{min-width:0;overflow-wrap:anywhere}ul.latest time{color:var(--mut);white-space:nowrap;font:13px var(--font-num,monospace)}`

export function feedPage({ lang, base, url, news, groupOf, now = Date.now() }) {
  const t = words(lang), title = `CKB Pulse \u00b7 ${t('m.feed')}`, desc = t('fd.lead')
  const feed = `${base}/feed.xml?lang=${lang}`, enc = encodeURIComponent(feed)
  const latest = feedEntries({ lang, news, groupOf, base }).slice(0, 8)
  const day = (at) => new Date(at).toLocaleDateString(t('locale'), { day: 'numeric', month: 'short', timeZone: 'UTC' })
  return `<!doctype html><html lang="${lang === 'zh' ? 'zh-CN' : lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}"><meta property="og:type" content="website"><meta property="og:site_name" content="CKB Pulse"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(url)}">
<link rel="alternate" type="application/atom+xml" title="CKB Pulse" href="${esc(feed)}">${menuHead(base)}<style>${CSS}${PAGE_CSS}</style></head><body><main>
${pageBar(t, { base, lang, current: '', here: '/feed', share: { url: `${base}/feed?lang=${lang}&d=${today()}`, title } })}
${pageHead({ crumbs: crumbs(t, { base, lang, trail: [[t('m.feed'), null]] }), eyebrow: t('fd.eyebrow'), title: t('fd.h1'), lede: esc(desc) })}
<ol class="steps"><li>${esc(t('fd.s1'))}</li><li>${esc(t('fd.s2'))}</li><li>${esc(t('fd.s3'))}</li></ol>
<div class="box"><pre><code>${esc(feed)}</code></pre><button type="button" data-count="share_copy" data-copy="${esc(feed)}" data-copied="${esc(t('sh.copied'))}">${esc(t('sh.copy'))}</button></div>
<p class="go"><a class="alt" href="https://feedly.com/i/subscription/feed/${enc}" target="_blank" rel="noopener">${esc(t('fd.in', { app: 'Feedly' }))}</a><a class="alt" href="https://www.inoreader.com/?add_feed=${enc}" target="_blank" rel="noopener">${esc(t('fd.in', { app: 'Inoreader' }))}</a><a class="alt" href="${esc(feed)}&amp;raw=1">${esc(t('fd.raw'))}</a></p>
${latest.length ? `<h2>${esc(t('fd.latest'))}</h2><ul class="latest">${latest.map((e) => `<li><span><a href="${esc(e.link)}">${esc(e.title)}</a></span><time datetime="${new Date(e.at).toISOString()}">${esc(day(e.at))}</time></li>`).join('')}</ul>` : ''}
<footer>${maker(t)}
${langLinks((l) => `${base}/feed?lang=${l}`)}</footer>
</main>${menuScript(base)}</body></html>`
}
