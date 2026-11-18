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

const event = (action, login = 'quake', n = 1756) => ({
  id: '20332195980', type: 'PullRequestEvent', public: true, created_at: '2026-11-17T00:06:38Z',
  actor: { login, avatar_url: 'https://avatars.githubusercontent.com/u/8990?' },
  repo: { name: 'nervosnetwork/fiber', url: 'https://api.github.com/repos/nervosnetwork/fiber' },
  payload: { action, number: n, pull_request: { number: n, url: `https://api.github.com/repos/nervosnetwork/fiber/pulls/${n}`, head: { ref: 'fix/onchain-timeout-fixture-v2-history' }, base: { ref: 'develop' } } },
})
// the lookups normalise makes: the pull request, then the repository
// the pull request lookup is cached per address, so each case has its own pull request number and author
const authors = { 1756: { login: 'chuck', avatar_url: 'https://avatars.githubusercontent.com/u/1?' }, 1757: { login: 'dependabot[bot]', avatar_url: '' }, 1758: { login: 'Hanssen0-Alter-Ego', avatar_url: '' }, 1759: { login: 'quake', avatar_url: '' } }
globalThis.fetch = async (url) => {
  const u = String(url)
  const m = u.match(/\/pulls\/(\d+)$/)
  const body = m ? { title: 'fix: onchain timeout fixture', merged: true, html_url: `https://github.com/nervosnetwork/fiber/pull/${m[1]}`, head: { ref: 'fix/onchain-timeout-fixture-v2-history' }, user: authors[m[1]] || authors[1756] }
    : { full_name: 'nervosnetwork/fiber', name: 'fiber', owner: { login: 'nervosnetwork', type: 'Organization' }, description: 'Fiber', private: false, topics: ['ckb'] }
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}

test('a "merged" action becomes a merged pull request, credited to its author', async () => {
  const n = await normalise(event('merged'))
  assert.equal(n.kind, 'pr_merged')
  assert.equal(n.actor, 'chuck') // quake merged it, chuck wrote it
  assert.equal(n.avatar, 'https://avatars.githubusercontent.com/u/1?')
  assert.equal(n.bot, false)
  assert.equal(n.url, 'https://github.com/nervosnetwork/fiber/pull/1756')
  assert.equal(n.title, 'fix: onchain timeout fixture')
})

test('opened and closed still map as before', async () => {
  assert.equal((await normalise(event('opened'))).kind, 'pr_open')
  assert.equal((await normalise(event('closed'))).kind, 'pr_merged') // the lookup says merged
  assert.equal(await normalise(event('labeled')), null)
})

test('when the author is a bot or an AI account the merge stays with whoever merged it', async () => {
  assert.equal((await normalise(event('merged', 'quake', 1757))).actor, 'quake') // dependabot wrote it
  const n = await normalise(event('merged', 'quake', 1758)) // an AI account wrote it
  assert.equal(n.actor, 'quake'); assert.equal(n.bot, false)
  assert.equal((await normalise(event('merged', 'quake', 1759))).actor, 'quake') // merging your own pull request
})

test('an event by an AI account carries the mark and counts as automatic', async () => {
  const n = await normalise(event('opened', 'Hanssen0-Alter-Ego'))
  assert.equal(n.ai, true); assert.equal(n.bot, true)
  const h = await normalise(event('opened', 'chuck'))
  assert.equal(h.ai, undefined); assert.equal(h.bot, false)
})
