// Whoever asked to leave (OPT_OUT in config.mjs) is dropped when their work comes in, taken out of what is stored, and
// left out of the history and the commit lists.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'optout-'))
process.env.DATA_DIR = dir
process.env.GITHUB_TOKEN ||= 'test'
const { OPT_OUT, isOptedOut, isAutomaticAuthor } = await import('../config.mjs')
const name = 'ckb-devrel/ccc'
const ev = (id, actor) => ({ id, kind: 'push', repo: name, group: 'ckb-devrel', actor, avatar: '', title: 't', url: '', ref: 'main', at: new Date().toISOString(), tags: [], bot: false, commits: 1 })
fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify({ version: 3, agentRule: 2, ctxRule: 4, repos: { [name]: { name, owner: 'ckb-devrel', group: 'ckb-devrel', private: false, ownerType: 'Organization', metaAt: Date.now(), topics: [], desc: '' } }, events: [ev('1', 'alice'), ev('2', 'Ghost'), ev('3', 'ghost')] }))
OPT_OUT.add('ghost') // as if config.mjs listed the login
const { state, load, normalise } = await import('../pulse.mjs')

test('the list is empty until someone asks, and matches in any case', () => {
  assert.equal(isOptedOut('GHOST'), true)
  assert.equal(isOptedOut('alice'), false)
  assert.equal(isAutomaticAuthor('Ghost'), true) // so the history and the lists leave them out
})

test('what is stored by them is taken out when the state loads, and nothing of theirs comes in', async () => {
  load()
  assert.deepEqual(state.events.map((e) => e.actor), ['alice'])
  const push = { id: '9', type: 'PushEvent', public: true, actor: { login: 'ghost', avatar_url: '' }, repo: { name }, payload: { ref: 'refs/heads/main', before: '0'.repeat(39) + '1', head: '0'.repeat(39) + '2' }, created_at: new Date().toISOString() }
  assert.equal(await normalise(push), null)
})
