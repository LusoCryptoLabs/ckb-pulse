// followedNow walks every stored event to build its answer. Called inside a callback that itself runs once per event,
// it made the daily scan for AI accounts hold the server for three minutes at every start (2026-11-25).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const PER_ITEM = /=>\s*followedNow\([^)]*\)\(/

test('the followed set is never built once per item', () => {
  assert.ok(PER_ITEM.test('state.events.filter((e) => followedNow(now)(e.repo))'), 'the control: the line that froze the server is caught')
  assert.ok(!PER_ITEM.test('const followed = followedNow(now); state.events.filter((e) => followed(e.repo))'))
  const src = fs.readFileSync(new URL('../pulse.mjs', import.meta.url), 'utf8')
  assert.deepEqual(src.split('\n').map((l, i) => (PER_ITEM.test(l) ? i + 1 : 0)).filter(Boolean), [])
})
