// What Pulse does besides the live page, in one place: for people at /use, for AI agents at /llms.txt. Visitors came,
// watched the scene and left; the digest, the feed, notices, badges, the Fiber map, the funded projects, the API and
// the MCP server could only be found by knowing their address (2026-11-02).
import { words } from './cards.mjs'
import { CSS, maker, pageBar, menuHead, menuScript, pageHead } from './digest.mjs'
import { TOOL_INFO } from './mcp.mjs'

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const install = (base) => `claude mcp add --transport http ckb-pulse ${base}/mcp`
const API = [
  ['/api/state', 'use.api.state'], ['/api/repo?name=owner/repo', 'use.api.repo'], ['/api/funded', 'use.api.funded'],
  ['/api/fiber?net=mainnet|testnet', 'use.api.fiber'], ['/api/stream', 'use.api.stream'],
]

const PAGE_CSS = `nav.jump{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 8px}nav.jump a{padding:5px 11px;border:1px solid #36322a;border-radius:999px;text-decoration:none;font-size:14px}
section.use{background:#14120e;border:1px solid #36322a;border-radius:20px;padding:16px 18px;margin:16px 0;scroll-margin-top:12px}section.use h2{margin:0 0 6px;font:600 21px var(--font-ui,sans-serif);letter-spacing:-.01em;color:#f0ece2;text-transform:none}
section.use p{margin:8px 0}.go{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 2px}.go a{display:inline-block;padding:7px 14px;border-radius:999px;background:#cbf34d;color:#1a2208;font-weight:700;text-decoration:none;font-size:14px}
.go a.alt{background:none;color:#cbf34d;border:1px solid #4a4536}pre{background:#0a0907;border:1px solid #36322a;border-radius:10px;padding:10px 12px;margin:8px 0;overflow-x:auto;user-select:all;-webkit-user-select:all}
pre code{background:none;border:0;padding:0;font-size:13px;font-family:var(--font-num,monospace);overflow-wrap:normal;white-space:pre}ul.api,ul.tools{list-style:none;padding:0;margin:8px 0}ul.api li,ul.tools li{padding:6px 0;border-bottom:1px solid #2a2720;overflow-wrap:anywhere}
ul.api li:last-child,ul.tools li:last-child{border:0}ul.api span,ul.tools span{color:#9a9486}h3{font-size:15px;margin:14px 0 4px;color:#9a9486}blockquote{margin:8px 0;padding:8px 12px;border-left:3px solid #62c9f5;color:#f0ece2;background:#0a0907;border-radius:0 8px 8px 0}
.badge img{display:block;margin:10px 0 4px;max-width:100%;height:auto}`

export function usePage({ lang, base, url }) {
  const t = words(lang), L = `lang=${lang}`
  const title = `CKB Pulse · ${t('use.title')}`, desc = t('use.lead')
  const go = (links) => `<p class="go">${links.map(([href, k, alt]) => `<a${alt ? ' class="alt"' : ''} href="${esc(href)}">${esc(t(k))}</a>`).join('')}</p>`
  const parts = [
    ['watch', `<p>${esc(t('use.watch.p'))}</p>${go([[`${base}/?${L}`, 'use.watch.a']])}`],
    ['follow', `<p>${esc(t('use.follow.p'))}</p>${go([[`${base}/digest?p=week&${L}`, 'use.follow.digest'], [`${base}/?tab=new&${L}`, 'use.follow.notify', 1], [`${base}/feed.xml?${L}`, 'use.follow.feed', 1]])}`],
    ['badge', `<p>${esc(t('use.badge.p'))}</p><div class="badge"><img src="${esc(base)}/badge/ckb.svg?${L}" alt="CKB Pulse" height="20"></div><pre><code>${esc(`[![CKB Pulse](${base}/badge/ckb.svg)](${base}/)`)}</code></pre>`],
    ['add', `<p>${esc(t('use.add.p'))}</p>${go([[`${base}/?tab=suggest&${L}`, 'use.add.a']])}`],
    ['fiber', `<p>${esc(t('use.fiber.p'))}</p>${go([[`${base}/fiber`, 'use.fiber.a']])}`],
    ['funded', `<p>${esc(t('use.funded.p'))}</p>${go([[`${base}/funded?${L}`, 'use.funded.a']])}`],
    ['data', `<p>${esc(t('use.data.p'))}</p><ul class="api">${API.map(([p, k]) => `<li><code>${esc(base + p)}</code><br><span>${esc(t(k))}</span></li>`).join('')}</ul>`],
    ['ai', `<p>${esc(t('use.ai.p'))}</p><h3>${esc(t('use.ai.claude'))}</h3><pre><code>${esc(install(base))}</code></pre><h3>${esc(t('use.ai.other'))}</h3><pre><code>${esc(base)}/mcp</code></pre>
<h3>${esc(t('use.ai.try'))}</h3><blockquote>${esc(t('use.ai.q'))}</blockquote><h3>${esc(t('use.ai.tools'))}</h3>
<ul class="tools">${TOOL_INFO.map(({ name }) => `<li><code>${esc(name)}</code> <span>${esc(t('use.tool.' + name))}</span></li>`).join('')}</ul>
<p>${esc(t('use.ai.llms', { url: `${base}/llms.txt` }))}</p>`],
  ]
  return `<!doctype html><html lang="${lang === 'zh' ? 'zh-CN' : lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}"><meta property="og:type" content="website"><meta property="og:site_name" content="CKB Pulse"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<link rel="icon" href="${esc(base)}/icon-192.png"><link rel="alternate" type="text/plain" title="llms.txt" href="${esc(base)}/llms.txt">${menuHead(base)}<style>${CSS}${PAGE_CSS}</style></head><body><main>
${pageBar(t, { base, lang, current: '', here: '/use' })}
${pageHead({ eyebrow: t('use.nav'), title: t('use.h1'), lede: esc(desc) })}
<nav class="jump">${parts.map(([id]) => `<a href="#${id}">${esc(t(`use.${id}.h`))}</a>`).join('')}</nav>
${parts.map(([id, body]) => `<section class="use" id="${id}"><h2>${esc(t(`use.${id}.h`))}</h2>${body}</section>`).join('\n')}
<footer>${maker(t)}
<p class="langs no-print">${['en', 'zh', 'pt'].map((l) => `<a href="${esc(url)}?lang=${l}" lang="${l === 'zh' ? 'zh-CN' : l}">${{ en: 'English', zh: '中文', pt: 'Português' }[l]}</a>`).join('')}</p></footer>
</main>${menuScript(base)}</body></html>`
}

// llms.txt (llmstxt.org): what an AI agent needs to use Pulse, in English
export function llmsTxt({ base }) {
  return `# CKB Pulse

> Who is building on Nervos CKB, live: public GitHub activity in the CKB projects Pulse follows, people only (bots and AI agents left out), over the last 30 days. GitHub data, not on-chain data. Made by LusoCryptoLabs, MIT.

Pulse is a Model Context Protocol server at ${base}/mcp (Streamable HTTP, one JSON answer per request, no session, read-only, nothing to install). In Claude Code: \`${install(base)}\`

## MCP tools

${TOOL_INFO.map(({ name, description }) => `- ${name}: ${description}`).join('\n')}

## Pages

- [Live page](${base}/): projects, people and updates as they happen; ?repo=owner/repo and ?person=login open one
- [Digest](${base}/digest?p=week): the highlights of a day, week or month (p=day|week|month)
- [Fiber map](${base}/fiber): Fiber nodes and public channels on mainnet and testnet
- [Funded by the community](${base}/funded): the CKB Community Fund DAO grants, code next to reports
- [What you can do](${base}/use): every feature, for people

## JSON API

- [State](${base}/api/state): repositories, highlights and 7 days of history (send If-None-Match)
- ${base}/api/repo?name=owner/repo: one repository over 30 days
- [Funded](${base}/api/funded): the grants as JSON
- ${base}/api/fiber?net=mainnet|testnet: the Fiber map
- ${base}/api/stream and ${base}/api/fiber/stream: Server-Sent Events
- [Feed](${base}/feed.xml): Atom

## Optional

- [Source](https://github.com/LusoCryptoLabs/ckb-pulse): how projects are found, the rules, and the README
`
}
