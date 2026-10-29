// /api/repo finds a repository in any case of its name, and answers with the spelling kept here (ckb-pulse#1).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-name-'))
process.env.GITHUB_TOKEN ||= 'test'
const { state, repoDetail } = await import('../pulse.mjs')

const name = 'LusoCryptoLabs/ckb-pulse'
state.repos[name] = { name, owner: 'LusoCryptoLabs', group: 'LusoCryptoLabs', desc: '', topics: [], private: false, ownerType: 'User', metaAt: Date.now() }
state.orgRepos = [name]
state.events.push({ id: '1', at: new Date(Date.now() - 3600e3).toISOString(), kind: 'push', repo: name, actor: 'LusoCryptoLabs', avatar: '', title: 'A change', url: '', ref: 'main', commits: 1, bot: false, tags: [] })

test('a followed repository is found in any case of its name', () => {
  assert.equal(repoDetail(name)?.name, name)
  for (const asked of ['lusocryptolabs/ckb-pulse', 'LUSOCRYPTOLABS/CKB-PULSE', 'LusoCryptoLabs/CKB-Pulse']) {
    const d = repoDetail(asked)
    assert.equal(d?.name, name, asked)
    assert.equal(d.url, `https://github.com/${name}`)
    assert.equal(d.events.length, 1)
  }
})

test('control: a repository not followed is still not found', () => {
  assert.equal(repoDetail('lusocryptolabs/not-there'), null)
  assert.equal(repoDetail(''), null)
})
