// The long history keeps counting a repository after it leaves the page.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// history.mjs loads the GitHub client, which needs a token to load
process.env.GITHUB_TOKEN ||= 'test'
const { loadHistory, trends, repoMonths, arrivals } = await import('../history.mjs')

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

test('agents and automation are not counted as developers or commits', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'history-'))
  const week = (d) => Math.floor(Date.parse(d) / 1000)
  const thisMonth = new Date().toISOString().slice(0, 7) + '-08T00:00:00Z'
  fs.writeFileSync(path.join(dir, 'history.json'), JSON.stringify({ repos: {
    'a/app': { at: Date.now(), rows: [[week(thisMonth), 'alice', 2], [week(thisMonth), 'claude', 40], [week(thisMonth), 'actions-user', 90]] },
    'b/tool': { at: Date.now(), rows: [[week(thisMonth), 'renovate-bot', 5]] },
  } }))
  loadHistory(dir)
  const m = trends(['a/app', 'b/tool']).months.at(-1)
  assert.equal(m.devs, 1)
  assert.equal(m.commits, 2)
  assert.equal(m.newDevs, 1)
  assert.deepEqual(repoMonths('a/app').at(-1), { month: m.month, devs: 1, commits: 2 })
})

test('arrivals are people whose first commit anywhere is recent, alphabetical', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'history-'))
  const now = Date.parse('2026-11-18T12:00:00Z'), week = (d) => Math.floor(Date.parse(d) / 1000)
  fs.writeFileSync(path.join(dir, 'history.json'), JSON.stringify({ repos: {
    // dave has worked in old-project for a year, and has just started in a project that joined Pulse this week
    'a/old-project': { at: now, rows: [[week('2025-11-10T00:00:00Z'), 'dave', 4], [week('2026-11-09T00:00:00Z'), 'dave', 2], [week('2026-11-02T00:00:00Z'), 'carol', 1], [week('2026-10-26T00:00:00Z'), 'bob', 3]] },
    'b/new-project': { at: now, rows: [[week('2026-11-09T00:00:00Z'), 'dave', 5], [week('2026-11-09T00:00:00Z'), 'alice', 1], [week('2026-11-09T00:00:00Z'), 'renovate-bot', 9], [week('2026-08-03T00:00:00Z'), 'erin', 2]] },
  } }))
  loadHistory(dir)
  assert.deepEqual(arrivals(30, now), ['alice', 'bob', 'carol'])
})
