// A followed repository that turns private leaves the page with its first private event, medals and feed included.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'private-'))
process.env.GITHUB_TOKEN ||= 'test'
const { state, snapshot, highlightsNow, normalise } = await import('../pulse.mjs')

test('a private event hides the repository', async () => {
  const name = 'LusoCryptoLabs/video-use', at = new Date(Date.now() - 3600e3).toISOString()
  state.repos[name] = { name, owner: 'LusoCryptoLabs', group: 'LusoCryptoLabs', desc: '', topics: [], private: false, ownerType: 'User', metaAt: Date.now() }
  state.orgRepos = [name]
  state.events.push({ id: '1', at, kind: 'push', repo: name, actor: 'LusoCryptoLabs', avatar: '', title: 'Render', url: '', ref: 'ccr-7a43f8d5-6t5wrf', commits: 1, bot: false, tags: [] })
  assert.ok(snapshot().repos.some((r) => r.name === name))
  assert.equal(highlightsNow().day.repos[0]?.[0], name)
  assert.equal(await normalise({ id: '2', type: 'PushEvent', public: false, repo: { name }, actor: { login: 'LusoCryptoLabs' }, payload: {}, created_at: at }), null)
  assert.equal(state.repos[name].private, true)
  const s = snapshot()
  assert.ok(!s.repos.some((r) => r.name === name))
  assert.ok(!s.events.some((e) => e.repo === name))
  assert.equal(highlightsNow().day.repos.length, 0)
})
