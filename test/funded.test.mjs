// Projects the Community Fund DAO pays for are followed even when discovery cannot see them.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'funded-'))
process.env.GITHUB_TOKEN ||= 'test'
const { FUNDED } = await import('../config.mjs')
const { state, knownRepos, followFunded } = await import('../pulse.mjs')

// GitHub as it answered on 2026-11-01, cut down: none of these carries a CKB topic or a dependency code search finds
const recent = new Date(Date.now() - 864e5).toISOString()
const meta = (full, more) => ({ full_name: full, description: '', topics: [], private: false, fork: false, archived: false, pushed_at: recent, created_at: '2025-10-04T19:50:17Z', owner: { type: more?.type || 'User' }, ...more })
const GH = {
  '/repos/Keith-CY/fiber-link': meta('Keith-CY/fiber-link'),
  '/repos/someone/secret': meta('someone/secret', { private: true }),
  '/users/ickb/repos': [meta('ickb/stack', { type: 'Organization' }), meta('ickb/legacy-lumos-interface', { type: 'Organization', archived: true }), meta('ickb/old', { type: 'Organization', pushed_at: '2024-01-01T00:00:00Z' }), meta('ickb/a-fork', { type: 'Organization', fork: true })],
}
globalThis.fetch = async (url) => {
  const u = new URL(url)
  const body = u.pathname.endsWith('/events') ? [] : GH[u.pathname]
  return new Response(body ? JSON.stringify(body) : '{}', { status: body ? 200 : 404, headers: { 'content-type': 'application/json' } })
}

test('the funded list names a proposal and something to follow', () => {
  assert.ok(FUNDED.length >= 6)
  for (const f of FUNDED) {
    assert.ok(Number.isInteger(f.topic) && f.topic > 0)
    assert.ok(f.follow.length && f.follow.every((n) => /^[A-Za-z0-9-]+(\/[A-Za-z0-9_.-]+)?$/.test(n)))
  }
  const all = FUNDED.flatMap((f) => f.follow)
  for (const n of ['ickb', 'Keith-CY/fiber-link', 'invisibook-lab/invisibook']) assert.ok(all.includes(n), n)
})

test('funded projects are followed, private ones and old or archived repositories are not', async () => {
  state.groupsSeen = { builders: 0 }
  assert.ok(!knownRepos().includes('Keith-CY/fiber-link'))
  await followFunded([{ topic: 9845, follow: ['Keith-CY/fiber-link'] }, { topic: 8369, follow: ['ickb'] }, { topic: 1, follow: ['someone/secret'] }])
  const known = knownRepos()
  assert.ok(known.includes('Keith-CY/fiber-link'))
  assert.ok(known.includes('ickb/stack'))
  for (const f of ['someone/secret', 'ickb/legacy-lumos-interface', 'ickb/old', 'ickb/a-fork']) assert.ok(!known.includes(f), f)
  assert.equal(state.extra.ickb.source, 'funded')
  assert.equal(state.extra.someone, undefined) // a private repository is not even polled
  // not newcomers: the iCKB group is there, never marked new
  assert.equal(state.groupsSeen.ickb, 0)
})
