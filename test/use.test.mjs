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
    for (const id of ['watch', 'follow', 'badge', 'add', 'fiber', 'funded', 'data', 'ai']) assert.match(html, new RegExp(`<section class="use" id="${id}">`))
    for (const path of ['/digest?p=week', '/?tab=new', '/?tab=suggest', '/feed.xml', '/fiber', '/funded', '/api/state', '/badge/ckb.svg', '/llms.txt']) assert.ok(html.includes(base + path), path)
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
