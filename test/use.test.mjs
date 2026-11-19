// What Pulse does, for people (/use) and for AI agents (/llms.txt), and a browser opening /mcp lands on the page.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { usePage, llmsTxt } from '../use.mjs'
import { TOOL_INFO, mcpHttp } from '../mcp.mjs'
import { WORDS } from '../public/words.js'

const base = 'https://pulse.example'

for (const lang of ['en', 'pt', 'zh']) {
  test(`the ${lang} page lists every feature and every MCP tool`, () => {
    const html = usePage({ lang, base, url: `${base}/use` })
    for (const id of ['watch', 'follow', 'badge', 'add', 'data', 'ai']) assert.match(html, new RegExp(`<section class="use" id="${id}">`))
    for (const path of ['/digest?p=week', '/?tab=new', '/?tab=suggest', '/feed', '/api/state', '/badge/ckb.svg', '/llms.txt']) assert.ok(html.includes(base + path), path)
    assert.ok(html.includes(`claude mcp add --transport http ckb-pulse ${base}/mcp`))
    for (const { name } of TOOL_INFO) assert.ok(html.includes(`<code>${name}</code>`), name)
    assert.doesNotMatch(html, /\buse\.[a-z_.]+\b(?![^<]*>)/, 'a word is missing and shows its key')
  })
}

test('every MCP tool has a line on the page', () => {
  const missing = TOOL_INFO.map(({ name }) => `use.tool.${name}`).filter((k) => !WORDS.en[k])
  assert.deepEqual(missing, [])
})

test('llms.txt tells an agent where the MCP server is and what each tool does', () => {
  const txt = llmsTxt({ base })
  assert.match(txt, /^# CKB Pulse\n\n> /)
  assert.ok(txt.includes(`${base}/mcp`))
  for (const { name, description } of TOOL_INFO) assert.ok(txt.includes(`- ${name}: ${description}`), name)
  assert.ok(txt.includes(`${base}/api/state`) && txt.includes(`${base}/use`))
})

const call = (method, accept) => {
  const res = { status: 0, headers: {}, writeHead(s, h) { this.status = s; this.headers = h || {} }, end() {} }
  mcpHttp({ method, headers: accept ? { accept } : {} }, res, null, base)
  return res
}

test('a browser opening /mcp is sent to the page that explains it', () => {
  const r = call('GET', 'text/html,application/xhtml+xml,*/*;q=0.8')
  assert.equal(r.status, 303)
  assert.equal(r.headers.location, `${base}/use#ai`)
})

test('an MCP client asking for an event stream still gets 405', () => {
  assert.equal(call('GET', 'text/event-stream').status, 405)
  assert.equal(call('GET', 'application/json, text/event-stream').status, 405)
  assert.equal(call('GET').status, 405)
})

for (const lang of ['en', 'pt', 'zh']) {
  test(`the ${lang} page puts what is for everyone before what is for developers`, () => {
    const html = usePage({ lang, base, url: `${base}/use` })
    const at = (s) => html.indexOf(s)
    assert.ok(at('id="for-all"') > 0 && at('id="for-all"') < at('id="for-dev"'), 'the two headings, in order')
    for (const id of ['watch', 'follow', 'add']) assert.ok(at(`id="${id}"`) > at('id="for-all"') && at(`id="${id}"`) < at('id="for-dev"'), `${id} is for everyone`)
    for (const id of ['badge', 'data', 'ai']) assert.ok(at(`<section class="use" id="${id}"`) > at('id="for-dev"'), `${id} is for developers`)
    assert.equal((html.match(/<div class="jg">/g) || []).length, 2, 'the shortcuts are in two rows')
    assert.doesNotMatch(html, /\buse\.group\.[a-z]+/, 'a group name shows its key')
  })
}

test('/use gives the GitHub Action to copy, in its own section, and llms.txt has it too', async () => {
  const { usePage, llmsTxt } = await import('../use.mjs')
  const html = typeof usePage === 'function' ? usePage({ lang: 'en', base: 'https://p.example', url: 'u' }) : ''
  if (html) assert.ok(html.includes('id="action"') && html.includes('LusoCryptoLabs/ckb-pulse-action@v1') && html.includes('pull-requests: write'))
  const t = llmsTxt({ base: 'https://p.example' })
  assert.ok(t.includes('uses: LusoCryptoLabs/ckb-pulse-action@v1') && t.includes('.github/workflows/ckb-lessons.yml'))
})
