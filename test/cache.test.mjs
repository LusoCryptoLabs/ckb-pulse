// What the server sends is checked against If-None-Match, and the state is built once for every request in a minute.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { etag, notModified, shared } from '../cache.mjs'

const req = (inm) => ({ headers: inm == null ? {} : { 'if-none-match': inm } })

test('the same bytes have the same tag, other bytes another', () => {
  assert.equal(etag(Buffer.from('a')), etag(Buffer.from('a')))
  assert.notEqual(etag(Buffer.from('a')), etag(Buffer.from('b')))
  assert.match(etag(Buffer.from('a')), /^W\/"[\w-]{22}"$/)
})

test('a browser holding the current version gets a 304, in any spelling of the tag', () => {
  const tag = etag(Buffer.from('page'))
  assert.equal(notModified(req(tag), tag), true)
  assert.equal(notModified(req(tag.slice(2)), tag), true) // strong spelling of the same tag
  assert.equal(notModified(req(`W/"other", ${tag}`), tag), true)
  assert.equal(notModified(req('*'), tag), true)
})

test('control: an old version or no tag gets the body', () => {
  const tag = etag(Buffer.from('page'))
  assert.equal(notModified(req(etag(Buffer.from('old page'))), tag), false)
  assert.equal(notModified(req(null), tag), false)
  assert.equal(notModified(req(''), tag), false)
})

test('the shared body is built once until it ages or is dropped', () => {
  let builds = 0
  const s = shared(() => `v${++builds}`, 60e3)
  const a = s.get(1000), b = s.get(30000)
  assert.equal(builds, 1)
  assert.equal(a, b)
  s.get(61001)
  assert.equal(builds, 2, 'older than the ttl')
  s.drop(); s.get(61002)
  assert.equal(builds, 3, 'dropped')
  assert.notEqual(s.get(61003).tag, a.tag)
})

test('control: with no time to live every request builds it again', () => {
  let builds = 0
  const s = shared(() => `v${++builds}`, -1)
  s.get(1); s.get(1); s.get(1)
  assert.equal(builds, 3)
})
