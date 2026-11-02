// Apps that call a Fiber node are found even with no CKB library, topic or description.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'fiber-apps-'))
process.env.GITHUB_TOKEN ||= 'test'
const { POLL, SOURCE_SEARCHES } = await import('../config.mjs')
const { state, discover, vetOwner } = await import('../pulse.mjs')
POLL.codeSearchMs = 0
POLL.repoSearchMs = 0

// GitHub as it answered on 2026-11-02, cut down: chukwuma619/twine is a Rust app with no topic, no description and no
// CKB crate in its Cargo.toml; it calls a Fiber node from a file five folders deep. The first search, for CCC, finds
// only his older repositories (chukwuma619/cvent, last pushed in February).
const recent = new Date(Date.now() - 864e5).toISOString()
const meta = (full, pushed = recent) => ({ full_name: full, name: full.split('/')[1], description: null, topics: [], private: false, fork: false, archived: false, pushed_at: pushed, created_at: '2026-01-12T01:06:18Z', owner: { type: 'User' } })
const hits = [
  { repository: { full_name: 'chukwuma619/twine' }, path: 'crates/server/src/fiber/rpc.rs' },
  { repository: { full_name: 'someone/vendored' }, path: 'node_modules/fiber-client/rpc.js' },
]
const GH = {
  '/repos/chukwuma619/twine': meta('chukwuma619/twine'),
  '/repos/chukwuma619/cvent': meta('chukwuma619/cvent', '2026-02-25T10:00:00Z'),
  '/repos/someone/vendored': meta('someone/vendored'),
  '/users/chukwuma619': { login: 'chukwuma619', type: 'User' },
  '/users/chukwuma619/repos': [meta('chukwuma619/twine'), meta('chukwuma619/personal-portfolio'), meta('chukwuma619/cvent', '2026-02-25T10:00:00Z')],
}
globalThis.fetch = async (url) => {
  const u = new URL(url)
  let body = GH[u.pathname]
  if (u.pathname === '/search/code') {
    const q = u.searchParams.get('q')
    const mine = (h) => !q.includes(' user:') || q.endsWith(`user:${h.repository.full_name.split('/')[0]}`)
    const items = SOURCE_SEARCHES.some((s) => q.startsWith(s)) ? hits.filter(mine)
      : q.startsWith('"@ckb-ccc/core"') ? [{ repository: { full_name: 'chukwuma619/cvent' }, path: 'package.json' }].filter(mine) : []
    body = { total_count: items.length, items }
  }
  if (u.pathname === '/search/repositories') body = { total_count: 0, items: [] }
  if (u.pathname.endsWith('/events')) body = []
  return new Response(body ? JSON.stringify(body) : '{}', { status: body ? 200 : 404, headers: { 'content-type': 'application/json' } })
}

test('the Fiber searches name fields only Fiber has', () => {
  assert.ok(SOURCE_SEARCHES.length >= 2)
  for (const q of SOURCE_SEARCHES) assert.match(q, /udt_type_script/)
})

test('discovery follows an app that calls a Fiber node, not a copy in node_modules', async () => {
  await discover()
  assert.ok(state.builders.includes('chukwuma619/twine'))
  assert.ok(!state.builders.includes('someone/vendored'))
})

test('a suggestion of the app\'s author is accepted, with only the Fiber app', async () => {
  assert.equal((await vetOwner('chukwuma619')).ok, false) // name, description and topics say nothing
  const v = await vetOwner('chukwuma619', { deep: true })
  assert.equal(v.ok, true)
  assert.deepEqual(v.repos, ['chukwuma619/twine'])
})
