// What Pulse does besides the live page, in one place: for people at /use, for AI agents at /llms.txt. Visitors came,
// watched the scene and left; the digest, the feed, notices, badges, the Fiber map, the API and
// the MCP server could only be found by knowing their address (2026-11-02).
import { words } from './cards.mjs'
import { CSS, pageFoot, pageBar, menuHead, menuScript, pageHead } from './digest.mjs'
import { TOOL_INFO } from './mcp.mjs'
import { FIBER_PAUSED, today } from './public/menu.js'

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const install = (base) => `claude mcp add --transport http ckb-pulse ${base}/mcp`
const API = [
  ['/api/state', 'use.api.state'], ['/api/repo?name=owner/repo', 'use.api.repo'], ['/api/impact?lib=ccc', 'use.api.impact'],
  ...(FIBER_PAUSED ? [] : [['/api/fiber?net=mainnet|testnet', 'use.api.fiber']]), ['/api/stream', 'use.api.stream'],
]

const PAGE_CSS = `nav.jump{display:grid;gap:10px;margin:0 0 8px}nav.jump .jg{display:flex;flex-wrap:wrap;align-items:center;gap:6px}nav.jump .jl{flex-basis:100%;font:500 11px var(--font-num,monospace);letter-spacing:.08em;text-transform:uppercase;color:var(--mut)}nav.jump a{padding:5px 11px;border:1px solid var(--edge);border-radius:999px;text-decoration:none;font-size:14px}h2.grp{margin:34px 0 0}
section.use{background:var(--surface);border:1px solid var(--edge);border-radius:20px;padding:16px 18px;margin:16px 0;scroll-margin-top:12px}section.use h2{margin:0 0 6px;font:600 21px var(--font-ui,sans-serif);letter-spacing:-.01em;color:var(--fg);text-transform:none}
section.use p{margin:8px 0}.go{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 2px}.go a{display:inline-block;padding:7px 14px;border-radius:999px;background:var(--lime);color:var(--ink);font-weight:700;text-decoration:none;font-size:14px}
.go a.alt{background:none;color:var(--lime);border:1px solid #4a4536}pre{background:var(--bg);border:1px solid var(--edge);border-radius:10px;padding:10px 12px;margin:8px 0;overflow-x:auto;user-select:all;-webkit-user-select:all}
pre code{background:none;border:0;padding:0;font-size:13px;font-family:var(--font-num,monospace);overflow-wrap:normal;white-space:pre}ul.api,ul.tools{list-style:none;padding:0;margin:8px 0}ul.api li,ul.tools li{padding:6px 0;border-bottom:1px solid var(--edge-soft);overflow-wrap:anywhere}
ul.api li:last-child,ul.tools li:last-child{border:0}ul.api span,ul.tools span{color:var(--mut)}h3{font-size:15px;margin:14px 0 4px;color:var(--mut)}blockquote{margin:8px 0;padding:8px 12px;border-left:3px solid #62c9f5;color:var(--fg);background:var(--bg);border-radius:0 8px 8px 0}
.badge img{display:block;margin:10px 0 4px;max-width:100%;height:auto}`

export function usePage({ lang, base, url, img = '' }) {
  const t = words(lang), L = `lang=${lang}`
  const title = `CKB Pulse · ${t('use.title')}`, desc = t('use.lead')
  const go = (links) => `<p class="go">${links.map(([href, k, alt]) => `<a${alt ? ' class="alt"' : ''} href="${esc(href)}">${esc(t(k))}</a>`).join('')}</p>`
  const parts = [
    ['watch', `<p>${esc(t('use.watch.p'))}</p>${go([[`${base}/?${L}`, 'use.watch.a'], [`${base}/?screen=1&${L}`, 'use.watch.screen', 1]])}`],
    ['follow', `<p>${esc(t('use.follow.p'))}</p>${go([[`${base}/digest?p=week&${L}`, 'use.follow.digest'], [`${base}/?tab=new&${L}`, 'use.follow.notify', 1], [`${base}/feed.xml?${L}`, 'use.follow.feed', 1]])}`],
    ['badge', `<p>${esc(t('use.badge.p'))}</p><div class="badge"><img src="${esc(base)}/badge/ckb.svg?${L}" alt="CKB Pulse" height="20"></div><pre><code>${esc(`[![CKB Pulse](${base}/badge/ckb.svg)](${base}/)`)}</code></pre>`],
    ['impact', `<p>${esc(t('use.impact.p'))}</p>${go([[`${base}/impact?${L}`, 'use.impact.a']])}`],
    ['add', `<p>${esc(t('use.add.p'))}</p>${go([[`${base}/?tab=suggest&${L}`, 'use.add.a']])}`],
    ...(FIBER_PAUSED ? [] : [['fiber', `<p>${esc(t('use.fiber.p'))}</p>${go([[`${base}/fiber`, 'use.fiber.a']])}`]]),
    ['data', `<p>${esc(t('use.data.p'))}</p><ul class="api">${API.map(([p, k]) => `<li><code>${esc(base + p)}</code><br><span>${esc(t(k))}</span></li>`).join('')}</ul>`],
    ['ai', `<p>${esc(t('use.ai.p'))}</p><h3>${esc(t('use.ai.claude'))}</h3><pre><code>${esc(install(base))}</code></pre><h3>${esc(t('use.ai.other'))}</h3><pre><code>${esc(base)}/mcp</code></pre>
<h3>${esc(t('use.ai.try'))}</h3><blockquote>${esc(t('use.ai.q'))}</blockquote><h3>${esc(t('use.ai.tools'))}</h3>
<ul class="tools">${TOOL_INFO.map(({ name }) => `<li><code>${esc(name)}</code> <span>${esc(t('use.tool.' + name))}</span></li>`).join('')}</ul>
<p>${esc(t('use.ai.llms', { url: `${base}/llms.txt` }))}</p>`],
  ]
  // what is for anyone first, what is for people who write code after: the page used to run them together
  const have = new Set(parts.map(([id]) => id))
  const groups = [['all', ['watch', 'follow', 'add', 'fiber']], ['dev', ['badge', 'impact', 'data', 'ai']]].map(([g, ids]) => [g, ids.filter((id) => have.has(id))])
  const byId = new Map(parts)
  return `<!doctype html><html lang="${lang === 'zh' ? 'zh-CN' : lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}"><meta property="og:type" content="website"><meta property="og:site_name" content="CKB Pulse"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">${img ? `<meta property="og:image" content="${esc(img)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${esc(img)}">` : ''}
<link rel="icon" href="${esc(base)}/icon-192.png"><link rel="alternate" type="text/plain" title="llms.txt" href="${esc(base)}/llms.txt">${menuHead(base)}<style>${CSS}${PAGE_CSS}</style></head><body><main>
${pageBar(t, { base, lang, current: '', here: '/use', share: { url: `${url}?lang=${lang}&d=${today()}`, title, image: img || undefined } })}
${pageHead({ eyebrow: t('use.nav'), title: t('use.h1'), lede: esc(desc) })}
<nav class="jump">${groups.map(([g, ids]) => `<div class="jg"><span class="jl">${esc(t('use.group.' + g))}</span>${ids.map((id) => `<a href="#${id}">${esc(t(`use.${id}.h`))}</a>`).join('')}</div>`).join('')}</nav>
${groups.map(([g, ids]) => `<h2 class="grp" id="for-${g}">${esc(t('use.group.' + g))}</h2>
${ids.map((id) => `<section class="use" id="${id}"><h2>${esc(t(`use.${id}.h`))}</h2>${byId.get(id)}</section>`).join('\n')}`).join('\n')}
${pageFoot(t, url)}
</main>${menuScript(base)}</body></html>`
}

// llms.txt (llmstxt.org): what an AI agent needs to use Pulse, in English
export function llmsTxt({ base }) {
  return `# CKB Pulse

> Who is building on Nervos CKB, live: public GitHub activity in the CKB projects Pulse follows, people only (accounts marked as bots and the branches agents open are left out; an agent working through a normal account cannot be told apart), over the last 30 days. GitHub data, not on-chain data. Made by LusoCryptoLabs, MIT.

Pulse is a Model Context Protocol server at ${base}/mcp (Streamable HTTP, one JSON answer per request, no session, read-only, nothing to install). In Claude Code: \`${install(base)}\`

## MCP tools

${TOOL_INFO.map(({ name, description }) => `- ${name}: ${description}`).join('\n')}

## Pages

- [Live page](${base}/): projects, people and updates as they happen; ?repo=owner/repo and ?person=login open one
- [Digest](${base}/digest?p=week): the highlights of a day, week or month (p=day|week|month)
${FIBER_PAUSED ? '' : `- [Fiber map](${base}/fiber): Fiber nodes and public channels on mainnet and testnet
`}- [Who builds on what](${base}/impact?lib=ccc): which of the projects Pulse follows use CCC, Lumos, Spore SDK or ckb-std (lib=ccc|lumos|spore|ckb-std)
- [What you can do](${base}/use): every feature, for people
- [How Pulse counts](${base}/method): what an update is, the caps, what is left out

## JSON API

- [State](${base}/api/state): repositories, highlights and 7 days of history (send If-None-Match)
- ${base}/api/repo?name=owner/repo: one repository over 30 days
- ${base}/api/impact?lib=ccc: the projects that use a library, with their last activity
${FIBER_PAUSED ? '' : `- ${base}/api/fiber?net=mainnet|testnet: the Fiber map
`}- ${base}/api/stream${FIBER_PAUSED ? '' : ` and ${base}/api/fiber/stream`}: Server-Sent Events
- [Feed](${base}/feed.xml): Atom

## Optional

- [Source](https://github.com/LusoCryptoLabs/ckb-pulse): how projects are found, the rules, and the README
`
}
