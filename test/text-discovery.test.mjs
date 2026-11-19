// Projects that say CKB only in their name or description are found, and the noise that shares the word is not.
// From the coverage check of 2026-11-19: about 60 active CKB repositories had no topic and no library in a manifest.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'text-discovery-'))
process.env.GITHUB_TOKEN ||= 'test'
const { POLL, TEXT_SEARCHES, CODE_SEARCHES } = await import('../config.mjs')
const { state, discover, textIsCkb } = await import('../pulse.mjs')
POLL.codeSearchMs = 0
POLL.repoSearchMs = 0

const recent = new Date(Date.now() - 864e5).toISOString()
const meta = (full, description = null, topics = []) => ({ full_name: full, name: full.split('/')[1], description, topics, private: false, fork: false, archived: false, pushed_at: recent, created_at: '2026-10-01T00:00:00Z', stargazers_count: 0, owner: { login: full.split('/')[0], type: 'User' }, html_url: `https://github.com/${full}` })
const FOUND = [
  meta('Mannychino/CKB-Vault', 'A decentralized time-locked vault for securing CKB assets on Nervos.'),
  meta('Hallab7/ckb-automata'), // nothing but the name: its README says Nervos
  meta('someone/ckb-notes'), // nothing but the name: its README is about something else
  meta('ckb-next/ckb-next', 'RGB Driver for Linux'),
  meta('mxxham/WMS', 'WMS CKB Surabaya, bin labels, scanning, 3D stock'),
  meta('fcardia/sistema_nervoso'),
]
const README = { 'Hallab7/ckb-automata': 'Cellular automata as type scripts on Nervos CKB.', 'someone/ckb-notes': 'My notes for the course on keyboards.' }
const readmeAsked = []
globalThis.fetch = async (url) => {
  const u = new URL(url)
  let body = null
  if (u.pathname === '/search/code') body = { total_count: 0, items: [] }
  else if (u.pathname === '/search/repositories') body = { total_count: 0, items: /in:name,description/.test(u.searchParams.get('q')) ? FOUND : [] }
  else if (u.pathname.endsWith('/readme')) { const full = u.pathname.split('/').slice(2, 4).join('/'); readmeAsked.push(full); body = README[full] ? { content: Buffer.from(README[full]).toString('base64') } : null }
  else if (u.pathname.endsWith('/events')) body = []
  else { const full = u.pathname.replace('/repos/', ''); body = FOUND.find((m) => m.full_name === full) || null }
  return new Response(body ? JSON.stringify(body) : '{}', { status: body ? 200 : 404, headers: { 'content-type': 'application/json' } })
}

test('the rule: Nervos or ckb with context is CKB; a bare name asks the README; the look-alikes are out', () => {
  assert.equal(textIsCkb(FOUND[0]), true)
  assert.equal(textIsCkb(meta('x/fiber-ledger', 'A CKB ledger with Fiber payment channels')), true)
  assert.equal(textIsCkb(FOUND[1]), null)
  assert.equal(textIsCkb(meta('x/nervos')), null, 'the name alone says too little')
  assert.equal(textIsCkb(FOUND[3]), false, 'the keyboard driver')
  assert.equal(textIsCkb(FOUND[5]), false, 'nervoso is not Nervos')
  assert.equal(textIsCkb(meta('x/kurdish', 'Sorani Kurdish (ckb) strings')), false)
  assert.equal(textIsCkb(meta('x/ckbuilders-notes')), false, 'ckb inside another word is not the word')
  assert.equal(textIsCkb(FOUND[4]), null, 'a warehouse named CKB has no chain word: its README decides')
})

test('the searches ask for the last 30 days, and the new dependencies are searched', () => {
  for (const q of TEXT_SEARCHES) assert.match(q, /in:name,description pushed:>\{since\}/)
  for (const d of ['@nervosnetwork/fiber-js', '@ckb-ccc/spore', '@offckb/cli', 'ckb-hash']) assert.ok(CODE_SEARCHES.some((q) => q.includes(`"${d}"`)), d)
})

test('discovery follows what the text or the README says is CKB, and asks a README once per push', async () => {
  await discover()
  assert.ok(state.builders.includes('Mannychino/CKB-Vault'))
  assert.ok(state.builders.includes('Hallab7/ckb-automata'), 'its README says Nervos')
  for (const no of ['someone/ckb-notes', 'ckb-next/ckb-next', 'mxxham/WMS', 'fcardia/sistema_nervoso']) assert.ok(!state.builders.includes(no), no)
  assert.ok(!readmeAsked.includes('ckb-next/ckb-next') && !readmeAsked.includes('fcardia/sistema_nervoso'), 'no README is read for what the text already rules out')
  const first = readmeAsked.filter((x) => x === 'someone/ckb-notes').length
  await discover()
  assert.equal(readmeAsked.filter((x) => x === 'someone/ckb-notes').length, first, 'a README that said no is not read again until the repository is pushed')
})
