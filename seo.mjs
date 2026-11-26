// What a search engine needs on every page that may be indexed: the address that counts (canonical) and the same page in
// the other languages (hreflang). Added in one place, as an HTML page goes out, so a new page gets them too. English is
// the address with no lang, which is also what a robot gets with no Accept-Language; pt and zh carry ?lang=. A page
// that already names its canonical (the lessons) or says noindex is left as it is.
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
export const LANGS = ['en', 'pt', 'zh']
// the parameters that make a different page; everything else (theme, share stamps, utm) is the same page
const KEEP = { '/digest': ['p'], '/impact': ['lib'], '/forum': ['c'] }
const pick = (s) => { const l = String(s || '').toLowerCase().slice(0, 2); return LANGS.includes(l) ? l : null }

/** The address that counts for a path, its query and a language. */
export function canonicalOf(base, pathname, query, lang) {
  let p = pathname === '/index.html' ? '/' : pathname
  const q = new URLSearchParams()
  // the live view: a link to a project counts as the project's page; any other link on it is the live view
  if (p === '/' && query.has('repo') && /^[A-Za-z0-9-]{1,39}\/[\w.-]{1,100}$/.test(query.get('repo'))) p = `/project/${query.get('repo')}`
  else if (p === '/' && [...query.keys()].some((k) => k !== 'lang' && k !== 'theme')) p = '/live'
  for (const k of KEEP[p] || []) if (query.get(k)) q.set(k, query.get(k))
  if (lang && lang !== 'en') q.set('lang', lang)
  return `${base}${p}${q.size ? `?${q}` : ''}`
}

/** The canonical and alternate links for one page. */
export function seoLinks(base, pathname, query, lang) {
  const self = canonicalOf(base, pathname, query, lang)
  const alt = LANGS.map((l) => `<link rel="alternate" hreflang="${l === 'zh' ? 'zh-Hans' : l}" href="${esc(canonicalOf(base, pathname, query, l))}">`).join('')
  return `<link rel="canonical" href="${esc(self)}">${alt}<link rel="alternate" hreflang="x-default" href="${esc(canonicalOf(base, pathname, query, 'en'))}">`
}

// who makes Pulse and what it is, on the landing page only
export const siteLd = (base) => `<script type="application/ld+json">${JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'WebSite', '@id': `${base}/#site`, name: 'CKB Pulse', url: `${base}/`, inLanguage: ['en', 'pt', 'zh-Hans'], publisher: { '@id': 'https://lusocryptolabs.com/#org' } },
    { '@type': 'Organization', '@id': 'https://lusocryptolabs.com/#org', name: 'LusoCryptoLabs', url: 'https://lusocryptolabs.com', sameAs: ['https://x.com/lusocryptolabs', 'https://github.com/LusoCryptoLabs'] },
  ],
}).replace(/</g, '\\u003c')}</script>`

/** The page with its links added before </head>, or the page as it was. */
export function withSeo(html, { base, pathname, query }) {
  if (typeof html !== 'string' || !html.includes('</head>')) return html
  const head = html.slice(0, html.indexOf('</head>'))
  if (/rel="canonical"/.test(head) || /<meta name="robots" content="[^"]*noindex/.test(head)) return html
  const lang = pick(query.get('lang')) || pick((head.match(/<html lang="([^"]+)"/) || [])[1]) || 'en'
  const extra = seoLinks(base, pathname, query, lang) + (pathname === '/' && ![...query.keys()].some((k) => k !== 'lang' && k !== 'theme') ? siteLd(base) : '')
  return html.replace('</head>', `${extra}</head>`)
}
