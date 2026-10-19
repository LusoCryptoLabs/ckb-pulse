// The long history keeps counting a repository after it leaves the page.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// history.mjs loads the GitHub client, which needs a token to load
process.env.GITHUB_TOKEN ||= 'test'
const { loadHistory, trends, repoMonths } = await import('../history.mjs')

test('quiet and departed repositories stay in the trends', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'history-'))
  const week = (d) => Math.floor(Date.parse(d) / 1000)
  const thisMonth = new Date().toISOString().slice(0, 7) + '-08T00:00:00Z'
  fs.writeFileSync(path.join(dir, 'history.json'), JSON.stringify({ repos: {
    'a/followed': { at: Date.now(), rows: [[week(thisMonth), 'alice', 3]] },
    'b/gone': { at: Date.now(), rows: [[week(thisMonth), 'bob', 2], [week(thisMonth), 'alice', 1]] },
  } }))
  loadHistory(dir)
  const v = trends(['a/followed'])
  assert.equal(v.repos, 1); assert.equal(v.of, 1); assert.equal(v.kept, 1)
  const m = v.months.at(-1)
  assert.equal(m.devs, 2); assert.equal(m.commits, 6)
  assert.equal(repoMonths('b/gone').at(-1).commits, 3)
  assert.equal(repoMonths('c/unknown'), null)
})
