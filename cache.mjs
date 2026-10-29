// HTTP caching: a weak ETag per body, the If-None-Match check, and a body built once and shared by every request.
// Measured 2026-10-29 on the lab: a second visit downloaded the 56 kB of page files again (no-cache without a
// validator), and every visit and every open tab rebuilt the state from all the events kept.
import crypto from 'node:crypto'

// weak, because nginx may compress a small body on its way out, and a strong tag would then be wrong
export const etag = (buf) => `W/"${crypto.createHash('sha1').update(buf).digest('base64url').slice(0, 22)}"`

// If-None-Match compares weakly: W/"x" and "x" name the same version
const bare = (t) => t.trim().replace(/^W\//, '')
export function notModified(req, tag) {
  const h = req.headers['if-none-match']
  if (!h || !tag) return false
  if (h.trim() === '*') return true
  const want = bare(tag)
  return h.split(',').some((t) => bare(t) === want)
}

// one body for everyone until it is older than ttl ms or dropped; build() runs once per version. The entry also keeps
// its compressed copies, filled in by whoever sends it
export function shared(build, ttl) {
  let cur = null
  return {
    get(now = Date.now()) {
      if (!cur || now - cur.at > ttl) { const buf = Buffer.from(build()); cur = { at: now, buf, tag: etag(buf) } }
      return cur
    },
    drop() { cur = null },
  }
}
