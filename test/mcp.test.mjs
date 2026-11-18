// The MCP server (mcp.mjs): the protocol answers and the tools read the stored events, people only.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-'))
process.env.GITHUB_TOKEN ||= 'test'
const pulse = await import('../pulse.mjs')
const { makeMcp } = await import('../mcp.mjs')
const { state } = pulse

const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString()
const repo = (name, desc, topics = [], lang = 'Rust') => { state.repos[name] = { name, owner: name.split('/')[0], group: name.split('/')[0], desc, topics, lang, stars: 3, private: false, ownerType: 'Organization', metaAt: Date.now() }; state.orgRepos.push(name) }
repo('nervosnetwork/fiber', 'Fiber network node', ['fiber-network'])
repo('ckb-devrel/ccc', 'CKBers Codebase', ['ccc'], 'TypeScript')
repo('sporeprotocol/spore-sdk', 'Spore SDK for DOBs', ['spore'], 'TypeScript')
let n = 0
const ev = (r, actor, h, kind = 'push', extra = {}) => state.events.push({ id: String(++n), at: ago(h), kind, repo: r, group: r.split('/')[0], actor, avatar: '', title: `${kind} ${n}`, url: '', ref: 'main', commits: kind === 'push' ? 2 : 0, bot: false, tags: [], ...extra })
ev('nervosnetwork/fiber', 'alice', 1); ev('nervosnetwork/fiber', 'alice', 2); ev('nervosnetwork/fiber', 'bob', 3, 'pr_open')
ev('ckb-devrel/ccc', 'carol', 4); ev('ckb-devrel/ccc', 'alice', 5, 'review')
ev('sporeprotocol/spore-sdk', 'dave', 6)
ev('nervosnetwork/fiber', 'dependabot[bot]', 0.5, 'push', { bot: true })
ev('nervosnetwork/fiber', 'alice', 24 * 40) // older than the kept days
state.events.sort((a, b) => a.at.localeCompare(b.at))
ev('ckb-devrel/ccc', 'erin', 4.5) // a commit read late: stored after newer updates

const mcp = makeMcp({
  highlights: pulse.highlightsNow, news: pulse.news, projects: pulse.projectsNow, project: pulse.repoDetail, person: pulse.personProfile,
  peopleIn: pulse.peopleIn, updates: pulse.latestUpdates,
  arrivals: (days) => (days === 30 ? ['alice', 'bob'] : ['bob']),
  trends: () => ({ repos: 3, of: 3, months: [{ month: '2026-10', devs: 4, newDevs: 1, commits: 9 }] }),
})
const base = 'https://pulse.example'
const rpc = (method, params, id = 1) => mcp({ jsonrpc: '2.0', id, method, params }, { base })
const tool = async (name, args) => {
  const r = await rpc('tools/call', { name, arguments: args })
  assert.equal(r.status, 200)
  const res = r.json.result
  return res.isError ? { error: res.content[0].text } : JSON.parse(res.content[0].text)
}

test('initialize answers with the version asked for when known, else the newest', async () => {
  let r = await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '1' } })
  assert.equal(r.json.result.protocolVersion, '2025-03-26')
  assert.deepEqual(r.json.result.capabilities, { tools: { listChanged: false } })
  assert.equal(r.json.result.serverInfo.name, 'ckb-pulse')
  r = await rpc('initialize', { protocolVersion: '1999-01-01' })
  assert.equal(r.json.result.protocolVersion, '2025-06-18')
})

test('a notification gets no answer; an unknown method gets -32601; a bad message gets -32600', async () => {
  assert.deepEqual(await mcp({ jsonrpc: '2.0', method: 'notifications/initialized' }, { base }), { status: 202 })
  assert.equal((await rpc('nope')).json.error.code, -32601)
  assert.equal((await mcp({ id: 1, method: 'ping' }, { base })).json.error.code, -32600)
  assert.deepEqual((await rpc('ping')).json.result, {})
})

test('a batch answers its requests only, and refuses more than 20 messages', async () => {
  const r = await mcp([{ jsonrpc: '2.0', id: 1, method: 'ping' }, { jsonrpc: '2.0', method: 'notifications/initialized' }, { jsonrpc: '2.0', id: 2, method: 'tools/list' }], { base })
  assert.equal(r.status, 200)
  assert.deepEqual(r.json.map((m) => m.id), [1, 2])
  assert.equal((await mcp(Array.from({ length: 21 }, (_, i) => ({ jsonrpc: '2.0', id: i, method: 'ping' })), { base })).status, 400)
})

test('tools/list: every tool has a schema and says it only reads', async () => {
  const { tools } = (await rpc('tools/list')).json.result
  assert.deepEqual(tools.map((t) => t.name), ['overview', 'find_projects', 'project', 'person', 'who_works_on', 'recent_updates', 'new_builders', 'trends'])
  for (const t of tools) { assert.equal(t.inputSchema.type, 'object'); assert.equal(t.annotations.readOnlyHint, true); assert.equal(t.run, undefined) }
})

test('an unknown tool is a protocol error; bad arguments come back as a tool error the model can read', async () => {
  assert.equal((await rpc('tools/call', { name: 'nope', arguments: {} })).json.error.code, -32602)
  assert.match((await tool('project', { name: 'not a repo' })).error, /owner\/repo/)
  assert.match((await tool('project', { name: 'someone/elsewhere' })).error, /does not follow/)
  assert.match((await tool('find_projects', { area: 'solana' })).error, /area must be one of/)
  assert.match((await tool('who_works_on', {})).error, /area, some words/)
  assert.match((await tool('person', { login: 'not a login' })).error, /GitHub login/)
  assert.match((await tool('person', { login: 'x'.repeat(40) })).error, /at most 39/)
})

test('find_projects: by area, by words, most active first, with links', async () => {
  const fiber = await tool('find_projects', { area: 'fiber' })
  assert.deepEqual(fiber.projects.map((p) => p.name), ['nervosnetwork/fiber'])
  assert.equal(fiber.projects[0].updates, 3) // people only, within the kept days: the bot and the old push left out
  assert.equal(fiber.projects[0].people, 2)
  assert.equal(fiber.projects[0].pulse, 'https://pulse.example/?repo=nervosnetwork%2Ffiber')
  assert.deepEqual((await tool('find_projects', { query: 'spore sdk' })).projects.map((p) => p.name), ['sporeprotocol/spore-sdk'])
  assert.equal((await tool('find_projects', {})).found, 3)
})

test('person: projects, areas and kinds over the kept days, people only', async () => {
  const p = await tool('person', { login: 'ALICE' })
  assert.equal(p.login, 'alice')
  assert.equal(p.updates, 3)
  assert.deepEqual(p.projects.map((x) => [x.name, x.updates]), [['nervosnetwork/fiber', 2], ['ckb-devrel/ccc', 1]])
  assert.equal(p.areas.fiber, 2)
  assert.equal(p.areas.ccc, 1)
  assert.deepEqual(p.kinds, { push: 2, review: 1 })
  assert.match((await tool('person', { login: 'dependabot' })).error, /No updates/)
})

test('who_works_on: the people of an area, the busiest first', async () => {
  const w = await tool('who_works_on', { area: 'fiber' })
  assert.equal(w.projects, 1)
  assert.deepEqual(w.people.map((p) => [p.login, p.updates]), [['alice', 2], ['bob', 1]])
  assert.deepEqual((await tool('who_works_on', { query: 'codebase' })).people.map((p) => p.login).sort(), ['alice', 'carol', 'erin'])
})

test('recent_updates: newest first, filtered by project or person, no bots', async () => {
  const all = await tool('recent_updates', {})
  assert.equal(all.updates[0].actor, 'alice')
  assert.ok(all.updates.every((u) => u.actor !== 'dependabot[bot]'))
  for (let i = 1; i < all.updates.length; i++) assert.ok(all.updates[i - 1].at >= all.updates[i].at)
  assert.deepEqual((await tool('recent_updates', { project: 'ckb-devrel/ccc' })).updates.map((u) => u.actor), ['carol', 'erin', 'alice'])
  assert.deepEqual((await tool('recent_updates', { login: 'bob' })).updates.map((u) => u.kind), ['pr_open'])
  assert.equal((await tool('recent_updates', { limit: 2 })).updates.length, 2)
})

test('project, overview and trends answer from the server readers', async () => {
  const d = await tool('project', { name: 'NervosNetwork/Fiber' })
  assert.equal(d.name, 'nervosnetwork/fiber')
  assert.ok(d.events.length <= 15 && d.events.every((e) => !('avatar' in e)))
  const o = await tool('overview', { period: 'day' })
  assert.equal(o.period, 'day')
  assert.equal(o.updates, 7)
  assert.equal(o.projects, 3) // the count, not overwritten by the list
  assert.deepEqual(o.topProjects.slice(0, 2).map((p) => [p.name, p.updates]), [['ckb-devrel/ccc', 3], ['nervosnetwork/fiber', 3]])
  assert.equal((await tool('trends', {})).months[0].devs, 4)
})

test('find_projects: plurals, hyphens, OR, sort and pages', async () => {
  // "spore-sdk" is found by "spore sdk" and "sdks"; a plural finds the singular
  assert.deepEqual((await tool('find_projects', { query: 'spore-sdk' })).projects.map((p) => p.name), ['sporeprotocol/spore-sdk'])
  assert.deepEqual((await tool('find_projects', { query: 'sdks' })).projects.map((p) => p.name), ['sporeprotocol/spore-sdk'])
  assert.deepEqual((await tool('find_projects', { query: 'networks' })).projects.map((p) => p.name), ['nervosnetwork/fiber'])
  // either side of OR
  const either = (await tool('find_projects', { query: 'fiber OR spore' })).projects.map((p) => p.name).sort()
  assert.deepEqual(either, ['nervosnetwork/fiber', 'sporeprotocol/spore-sdk'])
  assert.equal((await tool('find_projects', { query: 'fiber spore' })).found, 0) // all words still means all
  // sort by people: ccc has carol, alice and erin, fiber alice and bob
  assert.equal((await tool('find_projects', { sort: 'people' })).projects[0].name, 'ckb-devrel/ccc')
  assert.match((await tool('find_projects', { sort: 'nonsense' })).error, /sort must be one of/)
  // pages
  const first = await tool('find_projects', { limit: 2 })
  assert.equal(first.projects.length, 2); assert.equal(first.nextOffset, 2)
  const next = await tool('find_projects', { limit: 2, offset: 2 })
  assert.equal(next.projects.length, 1); assert.equal(next.nextOffset, undefined)
  assert.ok(!first.projects.some((p) => next.projects.some((q) => q.name === p.name)))
})

test('new_builders lists arrivals, alphabetical, with links', async () => {
  const r = await tool('new_builders', {})
  assert.deepEqual(r.people.map((p) => p.login), ['alice', 'bob'])
  assert.equal(r.days, 30); assert.equal(r.count, 2)
  assert.equal(r.people[0].pulse, 'https://pulse.example/?person=alice')
  assert.deepEqual((await tool('new_builders', { days: 7 })).people.map((p) => p.login), ['bob'])
  assert.equal((await tool('new_builders', { days: 9999 })).days, 60)
})
