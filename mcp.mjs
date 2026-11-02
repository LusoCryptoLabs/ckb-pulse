// CKB Pulse for AI agents: a Model Context Protocol server on POST /mcp (Streamable HTTP, one JSON answer per request,
// no session). Every tool reads what Pulse already stores: no GitHub call, nothing written. Asked for on 2026-11-02
// ("exposing the current data interfaces through MCP").
//   claude mcp add --transport http ckb-pulse https://pulse-lab.lusocryptolabs.com/mcp
import { TAGS } from './config.mjs'

const VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05']
const AREAS = Object.keys(TAGS)
const ABOUT = 'From public GitHub activity in the CKB projects CKB Pulse follows, over the last 30 days; bots and AI agents left out. GitHub data, not on-chain data.'
const INSTRUCTIONS = `CKB Pulse watches who builds on Nervos CKB, live, from GitHub. ${ABOUT} Start with overview, then find_projects, project, person and who_works_on. Areas are ${AREAS.join(', ')}.`
const REPO = /^[\w.-]{1,100}\/[\w.-]{1,100}$/, LOGIN = /^[A-Za-z0-9-]{1,39}$/
const MAX_BODY = 65536, MAX_BATCH = 20

// a mistake in the arguments: told to the model as a tool result, so it can try again
const told = (message) => Object.assign(new Error(message), { told: true })
const rpcError = (code, message) => Object.assign(new Error(message), { code })
const int = (v, lo, hi, d) => (Number.isInteger(v) ? Math.min(hi, Math.max(lo, v)) : d)
const text = (v, name, max = 200) => {
  if (v === undefined || v === null || v === '') return ''
  if (typeof v !== 'string' || v.length > max) throw told(`${name} must be text of at most ${max} characters`)
  return v.trim()
}
const repoArg = (v) => { const s = text(v, 'name'); if (!REPO.test(s)) throw told('name must be a GitHub repository as owner/repo'); return s }
const loginArg = (v) => { const s = text(v, 'login', 39); if (!LOGIN.test(s)) throw told('login must be a GitHub login'); return s }
const areaArg = (v) => { const s = text(v, 'area', 20); if (s && !AREAS.includes(s)) throw told(`area must be one of ${AREAS.join(', ')}`); return s }
// every word of the query in the project's name, description or topics
const matches = (p, query) => { const hay = `${p.name} ${p.desc} ${p.topics.join(' ')}`.toLowerCase(); return query.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w)) }
const pick = (projects, { area, query }) => projects.filter((p) => (!area || p.tags.includes(area)) && (!query || matches(p, query)))
const links = (base) => ({ project: (name) => `${base}/?repo=${encodeURIComponent(name)}`, person: (login) => `${base}/?person=${encodeURIComponent(login)}` })

const TOOLS = [
  {
    name: 'overview',
    title: 'What is happening in CKB',
    description: 'The CKB ecosystem over the last day, week or month: how many updates, people and projects, the most active projects, people and organisations, and the projects new to Pulse.',
    inputSchema: { type: 'object', properties: { period: { type: 'string', enum: ['day', 'week', 'month'], description: 'day, week (the default) or month' } } },
    run: (a, { api, link }) => {
      const period = ['day', 'week', 'month'].includes(a.period) ? a.period : 'week', h = api.highlights()[period]
      return {
        about: ABOUT, period, ...h.stats,
        topProjects: h.repos.map(([name, updates]) => ({ name, updates, pulse: link.project(name) })),
        peopleByUpdates: h.people.map(([login, updates]) => ({ login, updates, pulse: link.person(login) })),
        peopleByCommits: h.peopleCommits.map(([login, commits]) => ({ login, commits })),
        organisations: h.orgs.map(([name, updates]) => ({ name, updates })),
        newProjects: api.news().slice(0, 10).map(({ name, desc, lang, createdAt }) => ({ name, desc, lang, createdAt, pulse: link.project(name) })),
      }
    },
  },
  {
    name: 'find_projects',
    title: 'Find CKB projects',
    description: `Search the projects Pulse follows by words in their name, description or topics, by area (${AREAS.join(', ')}), or both; the most active first.`,
    inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'words to look for, e.g. "wallet" or "lock script"' }, area: { type: 'string', enum: AREAS }, limit: { type: 'integer', minimum: 1, maximum: 50, description: 'at most this many, 15 by default' } } },
    run: (a, { api, link }) => {
      const query = text(a.query, 'query'), area = areaArg(a.area), limit = int(a.limit, 1, 50, 15)
      const found = pick(api.projects(), { area, query }).sort((x, y) => y.updates - x.updates || y.stars - x.stars || x.name.localeCompare(y.name))
      return {
        about: ABOUT, query, area, found: found.length,
        projects: found.slice(0, limit).map((p) => ({ name: p.name, desc: p.desc, lang: p.lang, stars: p.stars, areas: p.tags, updates: p.updates, commits: p.commits, people: p.people, lastAt: p.lastAt, github: `https://github.com/${p.name}`, pulse: link.project(p.name) })),
      }
    },
  },
  {
    name: 'project',
    title: 'One CKB project',
    description: 'One followed project in detail: description, language, topics, activity per day over 30 days, commits and developers per month, its people and its latest updates.',
    inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'the GitHub repository, owner/repo' } }, required: ['name'] },
    run: (a, { api, link }) => {
      const d = api.project(repoArg(a.name))
      if (!d) throw told(`Pulse does not follow ${a.name}: find_projects lists the projects it follows`)
      return { about: ABOUT, ...d, events: d.events.slice(0, 15).map(({ avatar, ...e }) => e), contributors: d.contributors.map(({ avatar, ...c }) => c), pulse: link.project(d.name) }
    },
  },
  {
    name: 'person',
    title: 'One CKB developer',
    description: 'What one person works on across the CKB projects Pulse follows: their projects, the areas and languages of those projects, and the kinds of updates they make.',
    inputSchema: { type: 'object', properties: { login: { type: 'string', description: 'the GitHub login' } }, required: ['login'] },
    run: (a, { api, link }) => {
      const p = api.person(loginArg(a.login))
      if (!p) throw told(`No updates by ${a.login} in the projects Pulse follows in the last 30 days`)
      const { avatar, ...rest } = p
      return { about: ABOUT, ...rest, pulse: link.person(p.login), github: `https://github.com/${p.login}` }
    },
  },
  {
    name: 'who_works_on',
    title: 'Who works on what',
    description: `The people most active in the projects of an area (${AREAS.join(', ')}) or in the projects that match some words, with the projects they work on. Useful to find who to ask about a part of CKB.`,
    inputSchema: { type: 'object', properties: { area: { type: 'string', enum: AREAS }, query: { type: 'string', description: 'words that pick the projects, e.g. "wallet" or "spore"' }, limit: { type: 'integer', minimum: 1, maximum: 30, description: 'at most this many people, 10 by default' } } },
    run: (a, { api, link }) => {
      const area = areaArg(a.area), query = text(a.query, 'query'), limit = int(a.limit, 1, 30, 10)
      if (!area && !query) throw told('give an area, some words, or both')
      const names = new Set(pick(api.projects(), { area, query }).map((p) => p.name))
      return { about: ABOUT, area, query, projects: names.size, people: api.peopleIn((repo) => names.has(repo), limit).map((p) => ({ ...p, pulse: link.person(p.login) })) }
    },
  },
  {
    name: 'recent_updates',
    title: 'Latest updates',
    description: 'The latest updates by people (pushes, pull requests, issues, reviews, releases) across CKB, or in one project, or by one person; newest first.',
    inputSchema: { type: 'object', properties: { project: { type: 'string', description: 'owner/repo, to see one project' }, login: { type: 'string', description: 'a GitHub login, to see one person' }, limit: { type: 'integer', minimum: 1, maximum: 50, description: 'at most this many, 20 by default' } } },
    run: (a, { api }) => {
      const repo = a.project ? repoArg(a.project) : '', actor = a.login ? loginArg(a.login) : ''
      return { about: ABOUT, project: repo, login: actor, updates: api.updates({ repo, actor, limit: int(a.limit, 1, 50, 20) }) }
    },
  },
  {
    name: 'dao_funded',
    title: 'Grants of the Community Fund DAO',
    description: 'The projects the Nervos Community Fund DAO pays for: their code activity next to their reports on Nervos Talk, and whether each is in progress, quiet or delivered.',
    inputSchema: { type: 'object', properties: {} },
    run: (a, { api }) => {
      const f = api.funded()
      return {
        about: 'Code activity from GitHub; reports and milestones from the grant threads on Nervos Talk.', readAt: f.readAt,
        grants: f.grants.map((g) => ({ name: g.name, grant: g.grant, since: g.since, status: g.status, repos: g.repos, commits: g.commits, people: g.people, lastWork: g.lastWork, lastReport: g.lastReport, reports: g.updates, milestones: g.milestones, delivered: g.delivered, thread: `https://talk.nervos.org/t/${g.topic}` })),
      }
    },
  },
  {
    name: 'trends',
    title: 'Builders per month',
    description: 'Developers, new developers and commits per month over two years, in the projects Pulse follows today. The current month is so far.',
    inputSchema: { type: 'object', properties: {} },
    run: (a, { api }) => ({ about: 'From GitHub statistics of the projects Pulse follows today, so older months read low; automatic authors left out. The current month is so far.', ...api.trends() }),
  },
]
const LIST = TOOLS.map(({ run, ...t }) => ({ ...t, annotations: { readOnlyHint: true, openWorldHint: false } }))

// api: highlights, news, projects, project, person, peopleIn, updates, funded, trends (the server's own readers)
export function makeMcp(api) {
  async function call(m, ctx) {
    const p = m.params || {}
    switch (m.method) {
      case 'initialize':
        return { protocolVersion: VERSIONS.includes(p.protocolVersion) ? p.protocolVersion : VERSIONS[0], capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'ckb-pulse', title: 'CKB Pulse', version: '1.0.0' }, instructions: INSTRUCTIONS }
      case 'ping': return {}
      case 'tools/list': return { tools: LIST }
      case 'tools/call': {
        const t = TOOLS.find((x) => x.name === p.name)
        if (!t) throw rpcError(-32602, `Unknown tool: ${p.name}`)
        try {
          return { content: [{ type: 'text', text: JSON.stringify(await t.run(p.arguments || {}, ctx)) }] }
        } catch (err) {
          if (err.told) return { content: [{ type: 'text', text: err.message }], isError: true }
          throw err
        }
      }
      default: throw rpcError(-32601, `Method not found: ${m.method}`)
    }
  }
  // one message: a request gets an answer, a notification or a response from the client gets none
  async function one(m, ctx) {
    if (!m || typeof m !== 'object' || m.jsonrpc !== '2.0') return { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } }
    if (typeof m.method !== 'string') return null
    const id = m.id
    let out
    try { out = { result: await call(m, ctx) } } catch (err) {
      if (!err.code) console.warn('mcp', m.method, err.message)
      out = { error: { code: err.code || -32603, message: err.code ? err.message : 'Internal error' } }
    }
    return id === undefined ? null : { jsonrpc: '2.0', id, ...out }
  }
  // body: the parsed JSON. Answers { status, json } (202 and no body when nothing needs an answer)
  return async function handle(body, { base }) {
    const ctx = { api, link: links(base) }
    if (Array.isArray(body)) {
      if (!body.length || body.length > MAX_BATCH) return { status: 400, json: { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } } }
      const r = (await Promise.all(body.map((m) => one(m, ctx)))).filter(Boolean)
      return r.length ? { status: 200, json: r } : { status: 202 }
    }
    const r = await one(body, ctx)
    return r ? { status: 200, json: r } : { status: 202 }
  }
}

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type, accept, mcp-protocol-version, mcp-session-id', 'access-control-expose-headers': 'mcp-session-id' }
const HELP = 'CKB Pulse as a Model Context Protocol server. Connect an MCP client to this address (Streamable HTTP, POST), e.g.\n  claude mcp add --transport http ckb-pulse <this address>\n'
// the HTTP side: POST carries JSON-RPC; no event stream is offered, so GET is 405 as the transport allows
export function mcpHttp(req, res, handle, base) {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end() }
  if (req.method !== 'POST') { res.writeHead(405, { ...CORS, allow: 'POST, OPTIONS', 'content-type': 'text/plain; charset=utf-8' }); return res.end(HELP) }
  const send = (status, json) => {
    res.writeHead(status, { ...CORS, 'content-type': 'application/json', 'cache-control': 'no-store' })
    res.end(json === undefined ? undefined : JSON.stringify(json))
  }
  let body = '', big = false
  req.on('data', (c) => { if (big) return; body += c; if (body.length > MAX_BODY) { big = true; send(413, { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Request too large' } }); req.destroy() } })
  req.on('end', async () => {
    if (big) return
    let msg
    try { msg = JSON.parse(body) } catch { return send(400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }) }
    try { const r = await handle(msg, { base }); send(r.status, r.json) } catch (err) { console.warn('mcp', err.message); send(500, { jsonrpc: '2.0', id: null, error: { code: -32603, message: 'Internal error' } }) }
  })
}
