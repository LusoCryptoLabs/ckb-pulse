// Small GitHub REST client: conditional requests with ETag (a 304 does not count against the rate limit),
// a pause when the limit runs low, and a cache for the extra lookups (PR titles, commit messages, repo meta).
const API = 'https://api.github.com'
const TOKEN = process.env.GITHUB_TOKEN
if (!TOKEN) throw new Error('GITHUB_TOKEN is not set')

const etags = new Map() // url -> { etag, body }
export const limits = { core: null, search: null, reset: 0 }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function gh(path, { conditional = false, search = false } = {}) {
  const url = path.startsWith('http') ? path : API + path
  for (let attempt = 0; attempt < 3; attempt++) {
    const headers = { authorization: `Bearer ${TOKEN}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'ckb-pulse' }
    const cached = conditional && etags.get(url)
    if (cached) headers['if-none-match'] = cached.etag
    const r = await fetch(url, { headers })
    const rem = r.headers.get('x-ratelimit-remaining')
    if (rem != null) {
      if (search) limits.search = +rem; else limits.core = +rem
      limits.reset = +(r.headers.get('x-ratelimit-reset') || 0) * 1000
    }
    if (r.status === 304) return { status: 304, body: cached.body, changed: false }
    if (r.status === 403 || r.status === 429) {
      const wait = r.headers.get('retry-after') ? +r.headers.get('retry-after') * 1000 : Math.max(5000, limits.reset - Date.now() + 1000)
      console.warn(`rate limited on ${path}; waiting ${Math.round(wait / 1000)} s`)
      await sleep(Math.min(wait, 15 * 60e3))
      continue
    }
    if (r.status === 404 || r.status === 451) return { status: r.status, body: null, changed: false }
    if (!r.ok) throw new Error(`${r.status} ${path}: ${(await r.text()).slice(0, 200)}`)
    const body = await r.json()
    if (conditional && r.headers.get('etag')) etags.set(url, { etag: r.headers.get('etag'), body })
    // slow down when the core budget gets low
    if (!search && limits.core != null && limits.core < 300) await sleep(2000)
    return { status: r.status, body, changed: true }
  }
  return { status: 429, body: null, changed: false }
}

// lookups that never change once known
const memo = new Map()
export async function once(key, fn) {
  if (memo.has(key)) return memo.get(key)
  const v = await fn()
  memo.set(key, v)
  if (memo.size > 20000) memo.delete(memo.keys().next().value)
  return v
}
