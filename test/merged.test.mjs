// A merged pull request reaches Pulse as a PullRequestEvent with action "merged" (GitHub, seen 2026-11-17 on
// nervosnetwork/fiber, payload below as received). Pulse used to drop every one of them.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'merged-'))
process.env.GITHUB_TOKEN ||= 'test'
const { normalise } = await import('../pulse.mjs')

const event = (action, login = 'quake') => ({
  id: '20332195980', type: 'PullRequestEvent', public: true, created_at: '2026-11-17T00:06:38Z',
  actor: { login, avatar_url: 'https://avatars.githubusercontent.com/u/8990?' },
  repo: { name: 'nervosnetwork/fiber', url: 'https://api.github.com/repos/nervosnetwork/fiber' },
  payload: { action, number: 1756, pull_request: { number: 1756, url: 'https://api.github.com/repos/nervosnetwork/fiber/pulls/1756', head: { ref: 'fix/onchain-timeout-fixture-v2-history' }, base: { ref: 'develop' } } },
})
// the lookups normalise makes: the pull request, then the repository
globalThis.fetch = async (url) => {
  const u = String(url)
  const body = u.endsWith('/pulls/1756') ? { title: 'fix: onchain timeout fixture', merged: true, html_url: 'https://github.com/nervosnetwork/fiber/pull/1756', head: { ref: 'fix/onchain-timeout-fixture-v2-history' } }
    : { full_name: 'nervosnetwork/fiber', name: 'fiber', owner: { login: 'nervosnetwork', type: 'Organization' }, description: 'Fiber', private: false, topics: ['ckb'] }
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}

test('a "merged" action becomes a merged pull request, credited to whoever merged it', async () => {
  const n = await normalise(event('merged'))
  assert.equal(n.kind, 'pr_merged')
  assert.equal(n.actor, 'quake')
  assert.equal(n.url, 'https://github.com/nervosnetwork/fiber/pull/1756')
  assert.equal(n.title, 'fix: onchain timeout fixture')
})

test('opened and closed still map as before', async () => {
  assert.equal((await normalise(event('opened'))).kind, 'pr_open')
  assert.equal((await normalise(event('closed'))).kind, 'pr_merged') // the lookup says merged
  assert.equal(await normalise(event('labeled')), null)
})
